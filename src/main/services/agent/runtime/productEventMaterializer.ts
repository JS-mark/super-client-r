import type { AgentProductEvent } from "@super-client/shared-types/agent-product-events";
import type { PermissionDecision } from "@super-client/shared-types/agent-runtime";
import type {
	MessagePart,
	MessagePartState,
	SubagentMessagePart,
} from "@super-client/shared-types/chat";
import type { SessionEvent } from "@super-client/shared-types/project";
import type {
	SubagentRunSummary,
	SubagentTaskStatus,
} from "@super-client/shared-types/subagent";

/**
 * Materialize persisted product events into the JSONL SessionEvent protocol.
 *
 * Transient UI events (`message.delta`, `structured_part.delta`, `run.status`,
 * `run.usage`) deliberately return []: the current JSONL reducer persists final
 * assistant content, tool lifecycle, approval audits, and coarse run markers,
 * not live UI stream state. Per-tick token usage is UI-only telemetry; when a
 * terminal usage snapshot is needed the runtime should attach totals to the
 * terminal `result` event so a dedicated projection can persist them.
 */
export function materializeAgentProductEvent(
	event: AgentProductEvent,
): SessionEvent[] {
	if (!event.persist || event.transient) return [];

	const base = {
		eventId: event.eventId,
		ts: event.ts,
	};

	switch (event.type) {
		case "message.completed":
			return [
				{
					...base,
					type: "assistant_message",
					id: event.payload.messageId,
					content: event.payload.text,
				},
			];

		case "tool.call":
			return [
				{
					...base,
					type: "tool_call",
					id: event.payload.callId,
					name: event.payload.toolName,
					input: toRecord(event.payload.input),
					...(event.subagentRunId
						? { subagentRunId: event.subagentRunId }
						: {}),
				},
			];

		case "tool.result":
			return [
				{
					...base,
					type: "tool_result",
					toolCallId: event.payload.callId,
					output: event.payload.content,
					...(event.subagentRunId
						? { subagentRunId: event.subagentRunId }
						: {}),
				},
			];

		case "tool.error":
			return [
				{
					...base,
					type: "tool_error",
					toolCallId: event.payload.callId,
					error: event.payload.content,
					...(event.payload.content.kind === "error"
						? { code: event.payload.content.message }
						: {}),
					...(event.subagentRunId
						? { subagentRunId: event.subagentRunId }
						: {}),
				},
			];

		case "approval.requested":
			return [
				{
					...base,
					type: "session_marker",
					key: "approval.requested",
					value: {
						approvalId: event.payload.approvalId,
						toolName: event.payload.toolName,
						input: event.payload.input,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
					},
				},
			];

		case "approval.resolved":
			return [
				{
					...base,
					type: "approval",
					toolCallId: event.payload.approvalId,
					decision: decisionToSessionDecision(event.payload.decision),
					reason: event.payload.decision.reason ?? event.payload.source,
				},
			];

		case "ask.requested":
			return [
				{
					...base,
					type: "session_marker",
					key: "ask.requested",
					value: {
						askId: event.payload.askId,
						toolName: event.payload.toolName,
						input: event.payload.input,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
					},
				},
			];

		case "ask.answered":
			return [
				{
					...base,
					type: "session_marker",
					key: "ask.answered",
					value: {
						askId: event.payload.askId,
						decision: decisionToSessionDecision(event.payload.decision),
						reason: event.payload.decision.reason ?? event.payload.source,
						payload: event.payload.payload,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
					},
				},
			];

		case "context.compacted":
			return [
				{
					...base,
					type: "assistant_message",
					id: event.payload.summaryMessageId,
					content: event.payload.summary,
					metadata: {
						contextCompacted: {
							compacted: true,
							summary: event.payload.summary,
							originalCount: event.payload.originalCount,
							compactedAt: event.payload.compactedAt,
						},
						contextStrategy: event.payload.strategy,
					},
				},
			];

		case "plan.decision":
			return [
				{
					...base,
					type: "session_marker",
					key: "plan.decision",
					value: {
						action: event.payload.record.action,
						sourcePlanId: event.payload.record.sourcePlanId,
						sourcePlanVersion: event.payload.record.sourcePlanVersion,
						sourcePlanTurnId: event.payload.record.sourcePlanTurnId,
						decision: event.payload.record.decision,
						record: event.payload.record,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
						turnId: event.turnId,
					},
				},
			];

		case "execute.turn.created":
			return [
				{
					...base,
					type: "session_marker",
					key: "execute.turn.created",
					value: {
						sourcePlanId: event.payload.link.sourcePlanId,
						sourcePlanVersion: event.payload.link.sourcePlanVersion,
						sourcePlanTurnId: event.payload.link.sourcePlanTurnId,
						decisionId: event.payload.link.decisionId,
						userMessageId: event.payload.link.userMessageId,
						assistantMessageId: event.payload.link.assistantMessageId,
						link: event.payload.link,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
						turnId: event.turnId,
					},
				},
			];

		case "subagent.spawned": {
			const run = event.payload.run;
			const part = buildSubagentPart(run, event.ts);
			const events: SessionEvent[] = [
				{
					...base,
					type: "session_marker",
					key: "subagent.spawned",
					value: {
						parentRunId: run.parentRunId,
						subagentRunId: run.subagentRunId,
						parentAssistantMessageId: run.parentAssistantMessageId,
						run,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
					},
				},
			];
			if (run.parentAssistantMessageId) {
				events.push({
					...base,
					type: "assistant.part_start",
					messageId: run.parentAssistantMessageId,
					part,
				});
			}
			return events;
		}

		case "subagent.updated": {
			const { subagentRunId, patch } = event.payload;
			const events: SessionEvent[] = [
				{
					...base,
					type: "session_marker",
					key: "subagent.updated",
					value: {
						subagentRunId,
						parentRunId: event.parentRunId,
						patch,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
					},
				},
			];
			const parentAssistantMessageId = patch.parentAssistantMessageId;
			if (parentAssistantMessageId) {
				events.push({
					...base,
					type: "assistant.part_update",
					messageId: parentAssistantMessageId,
					partId: subagentPartId(subagentRunId),
					patch: buildSubagentPartPatch(subagentRunId, patch, event.ts),
				});
			}
			return events;
		}

		case "subagent.completed": {
			const {
				subagentRunId,
				summary,
				tokenUsage,
				toolCallCount,
				endedAt,
				resultRef,
			} = event.payload;
			return [
				{
					...base,
					type: "session_marker",
					key: "subagent.completed",
					value: {
						subagentRunId,
						parentRunId: event.parentRunId,
						summary,
						tokenUsage,
						toolCallCount,
						endedAt,
						resultRef,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
					},
				},
			];
		}

		case "subagent.failed": {
			const { subagentRunId, errorMessage, endedAt } = event.payload;
			return [
				{
					...base,
					type: "session_marker",
					key: "subagent.failed",
					value: {
						subagentRunId,
						parentRunId: event.parentRunId,
						errorMessage,
						endedAt,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
					},
				},
			];
		}

		case "run.started":
		case "run.completed":
		case "run.stopped":
		case "run.error":
		case "run.rate_limit":
			return [
				{
					...base,
					type: "session_marker",
					key: event.type,
					value: {
						runId: event.runId,
						requestId: event.requestId,
						runtime: event.runtime,
						runtimeSeq: event.runtimeSeq,
						status: event.status,
						payload: event.payload,
					},
				},
			];

		case "run.status":
		case "run.usage":
		case "message.delta":
		case "structured_part.delta":
		case "unknown":
			// Live UI telemetry only — never materialized into the JSONL audit
			// log. `run.usage` moved here so we don't flood session_marker with
			// per-tick token counts.
			return [];
	}
}

export function materializeAgentProductEvents(
	events: AgentProductEvent[],
): SessionEvent[] {
	return events.flatMap(materializeAgentProductEvent);
}

function decisionToSessionDecision(
	decision: PermissionDecision,
): "allow_once" | "allow_session" | "deny" {
	if (!decision.approved) return "deny";
	return decision.scope === "session" ? "allow_session" : "allow_once";
}

function toRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: { value };
}

/**
 * Multi-Agent Round 6: stable part id for a subagent card so `part_start` /
 * `part_update` / `part_done` events all target the same part.
 */
export function subagentPartId(subagentRunId: string): string {
	return `subagent_part_${subagentRunId}`;
}

function subagentStatusToPartState(status: SubagentTaskStatus): MessagePartState {
	switch (status) {
		case "spawned":
		case "running":
			return "streaming";
		case "failed":
			return "error";
		case "completed":
		case "cancelled":
			return "complete";
	}
}

function buildSubagentPart(
	run: SubagentRunSummary,
	ts: number,
): SubagentMessagePart {
	return {
		id: subagentPartId(run.subagentRunId),
		type: "subagent",
		state: subagentStatusToPartState(run.status),
		createdAt: ts,
		updatedAt: ts,
		collapsed: true,
		run,
	};
}

function buildSubagentPartPatch(
	subagentRunId: string,
	patch: Partial<SubagentRunSummary>,
	ts: number,
): Partial<MessagePart> {
	const runPatch: Partial<SubagentRunSummary> = {
		subagentRunId,
		...patch,
	};
	const partPatch: Partial<SubagentMessagePart> = {
		run: runPatch as SubagentRunSummary,
		updatedAt: ts,
	};
	if (patch.status) {
		partPatch.state = subagentStatusToPartState(patch.status);
	}
	return partPatch as Partial<MessagePart>;
}
