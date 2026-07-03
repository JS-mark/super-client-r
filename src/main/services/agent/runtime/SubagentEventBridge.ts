/**
 * SubagentEventBridge — Multi-Agent Round 6 lifecycle emitter.
 *
 * The `Task` builtin tool spawns a subagent; from the outside all we see is
 * one tool_call/tool_result pair on the parent's transcript. To surface the
 * subagent's own runtime as a foldable `SubagentMessagePart`, we need
 * `subagent.spawned` / `updated` / `completed` / `failed` product events
 * threaded into the JSONL log alongside the parent's stream.
 *
 * This bridge is a thin façade over the product-event factories in
 * `shared-types/agent-product-events.ts`. It centralises:
 *   - subagent-runId → context bookkeeping (sessionId, parentAssistantMessageId,
 *     profile hints) so the Task tool handler doesn't have to re-thread them
 *     on every phase call.
 *   - `updated` runtimeSeq bumping so the eventId discriminator stays unique
 *     across multiple update calls on the same subagent.
 *   - Deterministic timestamps via injected `now()` for testability.
 *
 * The bridge does NOT know how to persist / materialize events. It just
 * hands them to `deps.emitSubagentEvent()` which typically points at
 * `AgentRuntimeIpcBroker.emitSubagentEvent`.
 */

import type { AgentProductEvent } from "@super-client/shared-types/agent-product-events";
import {
	createSubagentCompletedProductEvent,
	createSubagentFailedProductEvent,
	createSubagentSpawnedProductEvent,
	createSubagentUpdatedProductEvent,
} from "@super-client/shared-types/agent-product-events";
import type { AgentProfile } from "@super-client/shared-types/agent-sdk";
import type { SubagentRunSummary } from "@super-client/shared-types/subagent";

/**
 * Context passed with every emit call so the broker can route the event
 * to the right session's storage / IPC sender.
 */
export interface SubagentEmitContext {
	sessionId: string;
	projectId?: string | null;
	parentAssistantMessageId?: string;
}

export interface SubagentEventBridgeDeps {
	/** Broker-side sink; typically `AgentRuntimeIpcBroker.emitSubagentEvent`. */
	emitSubagentEvent(event: AgentProductEvent, ctx: SubagentEmitContext): void;
	/** Time source (injectable for deterministic tests). */
	now?: () => number;
}

/**
 * Per-subagent registration captured at spawn time so subsequent
 * `update()` / `complete()` / `fail()` calls can be one-argument-lite.
 */
interface RegisteredSubagent {
	subagentRunId: string;
	parentRunId: string;
	sessionId: string;
	projectId?: string | null;
	parentAssistantMessageId?: string;
	profileId?: string;
	profileName?: string;
	taskGoal: string;
	startedAt: number;
	updateSeq: number;
	toolCallCount: number;
}

export class SubagentEventBridge {
	private readonly runs = new Map<string, RegisteredSubagent>();
	private readonly now: () => number;

	constructor(private readonly deps: SubagentEventBridgeDeps) {
		this.now = deps.now ?? (() => Date.now());
	}

	/**
	 * Spawn phase: emits `subagent.spawned` with a fresh `SubagentRunSummary`
	 * and registers the run for later phases. Idempotent by subagentRunId:
	 * a second spawn() with the same id is a no-op.
	 */
	spawn(params: {
		parentRunId: string;
		subagentRunId: string;
		sessionId: string;
		projectId?: string | null;
		parentAssistantMessageId?: string;
		profile?: Pick<AgentProfile, "id" | "name">;
		taskGoal: string;
	}): void {
		if (this.runs.has(params.subagentRunId)) return;
		const startedAt = this.now();
		const run: SubagentRunSummary = {
			subagentRunId: params.subagentRunId,
			parentRunId: params.parentRunId,
			parentAssistantMessageId: params.parentAssistantMessageId,
			profileId: params.profile?.id,
			profileName: params.profile?.name,
			taskGoal: truncate(params.taskGoal, 240),
			status: "spawned",
			startedAt,
			toolCallCount: 0,
		};
		this.runs.set(params.subagentRunId, {
			subagentRunId: params.subagentRunId,
			parentRunId: params.parentRunId,
			sessionId: params.sessionId,
			projectId: params.projectId,
			parentAssistantMessageId: params.parentAssistantMessageId,
			profileId: params.profile?.id,
			profileName: params.profile?.name,
			taskGoal: run.taskGoal,
			startedAt,
			updateSeq: 0,
			toolCallCount: 0,
		});
		const event = createSubagentSpawnedProductEvent(run, {
			sessionId: params.sessionId,
			projectId: params.projectId,
			parentRunId: params.parentRunId,
			ts: startedAt,
		});
		this.deps.emitSubagentEvent(event, {
			sessionId: params.sessionId,
			projectId: params.projectId,
			parentAssistantMessageId: params.parentAssistantMessageId,
		});
	}

	/**
	 * Update phase: partial patch merged into the SubagentRunSummary.
	 * The eventId uses an increasing per-run `updateSeq` so multiple
	 * updates don't collide on the deterministic `subagent:updated:<id>`
	 * hash (see `agent-product-events.buildSubagentEventId`).
	 */
	update(
		subagentRunId: string,
		patch: Partial<SubagentRunSummary>,
	): void {
		const reg = this.runs.get(subagentRunId);
		if (!reg) return;
		reg.updateSeq += 1;
		if (typeof patch.toolCallCount === "number") {
			reg.toolCallCount = patch.toolCallCount;
		}
		const event = createSubagentUpdatedProductEvent(subagentRunId, patch, {
			sessionId: reg.sessionId,
			projectId: reg.projectId,
			parentRunId: reg.parentRunId,
			ts: this.now(),
			runtimeSeq: reg.updateSeq,
		});
		this.deps.emitSubagentEvent(event, {
			sessionId: reg.sessionId,
			projectId: reg.projectId,
			parentAssistantMessageId:
				patch.parentAssistantMessageId ?? reg.parentAssistantMessageId,
		});
	}

	/**
	 * Complete phase: emits `subagent.completed` and drops the registration.
	 */
	complete(
		subagentRunId: string,
		params: {
			summary?: string;
			tokenUsage?: { input?: number; output?: number };
			toolCallCount?: number;
			resultRef?: string;
		} = {},
	): void {
		const reg = this.runs.get(subagentRunId);
		if (!reg) return;
		const endedAt = this.now();
		const event = createSubagentCompletedProductEvent(
			subagentRunId,
			{
				endedAt,
				summary: params.summary ? truncate(params.summary, 512) : undefined,
				tokenUsage: params.tokenUsage,
				toolCallCount: params.toolCallCount ?? reg.toolCallCount,
				resultRef: params.resultRef,
			},
			{
				sessionId: reg.sessionId,
				projectId: reg.projectId,
				parentRunId: reg.parentRunId,
				ts: endedAt,
			},
		);
		this.deps.emitSubagentEvent(event, {
			sessionId: reg.sessionId,
			projectId: reg.projectId,
			parentAssistantMessageId: reg.parentAssistantMessageId,
		});
		this.runs.delete(subagentRunId);
	}

	/**
	 * Fail phase: emits `subagent.failed` and drops the registration.
	 * Safe to call even when spawn() was not (defensive: the Task tool may
	 * throw before we ever registered), in which case it silently no-ops.
	 */
	fail(subagentRunId: string, errorMessage: string): void {
		const reg = this.runs.get(subagentRunId);
		if (!reg) return;
		const endedAt = this.now();
		const event = createSubagentFailedProductEvent(
			subagentRunId,
			{ errorMessage, endedAt },
			{
				sessionId: reg.sessionId,
				projectId: reg.projectId,
				parentRunId: reg.parentRunId,
				ts: endedAt,
			},
		);
		this.deps.emitSubagentEvent(event, {
			sessionId: reg.sessionId,
			projectId: reg.projectId,
			parentAssistantMessageId: reg.parentAssistantMessageId,
		});
		this.runs.delete(subagentRunId);
	}

	/** For tests / diagnostics — reveal whether a run is still tracked. */
	has(subagentRunId: string): boolean {
		return this.runs.has(subagentRunId);
	}
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}
