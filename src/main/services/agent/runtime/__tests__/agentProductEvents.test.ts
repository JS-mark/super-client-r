// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildUnknownProductEvent,
	createPlanDecisionProductEvent,
	createPlanExecuteProductEvents,
	createSubagentCompletedProductEvent,
	createSubagentFailedProductEvent,
	createSubagentSpawnedProductEvent,
	createSubagentUpdatedProductEvent,
	projectAgentRuntimeEvent,
	shouldPersistAgentProductEvent,
} from "@super-client/shared-types/agent-product-events";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";
import type {
	PlanDecisionRecord,
	PlanExecuteDecision,
	PlanExecuteTurnLink,
} from "@super-client/shared-types/plan-execute";
import type { SubagentRunSummary } from "@super-client/shared-types/subagent";

const base = {
	v: 1,
	requestId: "req-1",
	conversationId: "session-1",
	runtime: "llm-loop",
	timestamp: 1782100000000,
} as const;

function event(overrides: Record<string, unknown>) {
	return { ...base, ...overrides } as AgentRuntimeStreamEvent;
}

describe("projectAgentRuntimeEvent", () => {
	it("projects text deltas as transient non-persisted message deltas", () => {
		const [projected] = projectAgentRuntimeEvent(
			event({ type: "text.delta", seq: 4, messageId: "m1", delta: "hello" }),
			{ projectId: "project-1", turnId: "turn-1" },
		);

		expect(projected).toMatchObject({
			type: "message.delta",
			eventId: "req-1:4:message.delta",
			sourceEventId: "req-1:4:text.delta",
			sessionId: "session-1",
			projectId: "project-1",
			runId: "req-1",
			turnId: "turn-1",
			runtimeSeq: 4,
			status: "streaming",
			persist: false,
			transient: true,
			payload: { messageId: "m1", delta: "hello" },
		});
		expect(shouldPersistAgentProductEvent(projected)).toBe(false);
	});

	it("projects reasoning deltas as transient structured part deltas", () => {
		const [projected] = projectAgentRuntimeEvent(
			event({
				type: "reasoning.delta",
				seq: 5,
				messageId: "m1",
				delta: "thinking",
			}),
		);

		expect(projected).toMatchObject({
			type: "structured_part.delta",
			status: "streaming",
			persist: false,
			transient: true,
			payload: { messageId: "m1", kind: "reasoning", delta: "thinking" },
		});
	});

	it("projects tool calls and tool results with error split", () => {
		const [call] = projectAgentRuntimeEvent(
			event({
				type: "tool.call",
				seq: 6,
				callId: "tc-1",
				toolName: "list_directory",
				input: { path: "/tmp" },
			}),
		);
		const [success] = projectAgentRuntimeEvent(
			event({
				type: "tool.result",
				seq: 7,
				callId: "tc-1",
				isError: false,
				content: { kind: "text", text: "ok" },
			}),
		);
		const [failure] = projectAgentRuntimeEvent(
			event({
				type: "tool.result",
				seq: 8,
				callId: "tc-2",
				isError: true,
				content: { kind: "error", message: "denied" },
			}),
		);

		expect(call).toMatchObject({
			type: "tool.call",
			status: "pending",
			persist: true,
			payload: {
				callId: "tc-1",
				toolName: "list_directory",
				input: { path: "/tmp" },
			},
		});
		expect(success).toMatchObject({
			type: "tool.result",
			status: "completed",
			payload: { callId: "tc-1", content: { kind: "text", text: "ok" } },
		});
		expect(failure).toMatchObject({
			type: "tool.error",
			status: "error",
			payload: {
				callId: "tc-2",
				content: { kind: "error", message: "denied" },
			},
		});
	});

	it("projects permission request and resolution without losing decision metadata", () => {
		const [request] = projectAgentRuntimeEvent(
			event({
				type: "permission.request",
				seq: 9,
				approvalId: "approval-1",
				toolName: "execute_command",
				input: { command: "pwd" },
			}),
		);
		const [resolved] = projectAgentRuntimeEvent(
			event({
				type: "permission.resolved",
				seq: 10,
				approvalId: "approval-1",
				source: "user",
				decision: {
					approved: true,
					scope: "session",
					reason: "trusted project command",
				},
			}),
		);

		expect(request).toMatchObject({
			type: "approval.requested",
			status: "requires_action",
			payload: {
				approvalId: "approval-1",
				toolName: "execute_command",
				input: { command: "pwd" },
			},
		});
		expect(resolved).toMatchObject({
			type: "approval.resolved",
			status: "completed",
			payload: {
				approvalId: "approval-1",
				source: "user",
				decision: {
					approved: true,
					scope: "session",
					reason: "trusted project command",
				},
			},
		});
	});

	it("projects run terminal reasons into completed, stopped, and error events", () => {
		const [completed] = projectAgentRuntimeEvent(
			event({
				type: "result",
				seq: 11,
				reason: "completed",
				finalMessageId: "m1",
			}),
		);
		const [maxTurns] = projectAgentRuntimeEvent(
			event({ type: "result", seq: 12, reason: "max_turns" }),
		);
		const [cancelled] = projectAgentRuntimeEvent(
			event({ type: "result", seq: 13, reason: "cancelled" }),
		);
		const [errorResult] = projectAgentRuntimeEvent(
			event({ type: "result", seq: 14, reason: "error" }),
		);
		const [fatalError] = projectAgentRuntimeEvent(
			event({
				type: "error",
				seq: 15,
				fatal: true,
				code: "AUTH_403",
				message: "not available",
			}),
		);

		expect(completed).toMatchObject({
			type: "run.completed",
			status: "completed",
			payload: { finalMessageId: "m1", reason: "completed" },
		});
		expect(maxTurns).toMatchObject({
			type: "run.completed",
			status: "completed",
			payload: { reason: "max_turns" },
		});
		expect(cancelled).toMatchObject({
			type: "run.stopped",
			status: "stopped",
			payload: { reason: "cancelled" },
		});
		expect(errorResult).toMatchObject({
			type: "run.error",
			status: "error",
			payload: { reason: "error" },
		});
		expect(fatalError).toMatchObject({
			type: "run.error",
			status: "error",
			payload: {
				fatal: true,
				code: "AUTH_403",
				message: "not available",
			},
		});
	});

	it("keeps run status and per-tick usage transient (UI-only telemetry)", () => {
		const [status] = projectAgentRuntimeEvent(
			event({ type: "status", seq: 16, status: "tool_calling" }),
		);
		const [usage] = projectAgentRuntimeEvent(
			event({
				type: "usage",
				seq: 17,
				inputTokens: 12,
				outputTokens: 34,
				cacheReadTokens: 5,
				cacheWriteTokens: 6,
			}),
		);

		expect(status).toMatchObject({
			type: "run.status",
			persist: false,
			transient: true,
			payload: { status: "tool_calling" },
		});
		expect(usage).toMatchObject({
			type: "run.usage",
			persist: false,
			transient: true,
			payload: {
				inputTokens: 12,
				outputTokens: 34,
				cacheReadTokens: 5,
				cacheWriteTokens: 6,
			},
		});
		expect(shouldPersistAgentProductEvent(status)).toBe(false);
		expect(shouldPersistAgentProductEvent(usage)).toBe(false);
	});

	it("projects AskUserQuestion request and answer with ask labels", () => {
		const [request] = projectAgentRuntimeEvent(
			event({
				type: "permission.request",
				seq: 18,
				approvalId: "ask-1",
				toolName: "scp-agent-builtins__AskUserQuestion",
				input: {
					questions: [
						{
							header: "Scope",
							question: "Which scope?",
							options: [{ label: "Small", description: "Focused" }],
						},
					],
				},
			}),
		);
		const [answered] = projectAgentRuntimeEvent(
			event({
				type: "permission.resolved",
				seq: 19,
				approvalId: "ask-1",
				toolName: "scp-agent-builtins__AskUserQuestion",
				source: "user",
				decision: {
					approved: true,
					scope: "once",
					payload: {
						answers: { "Which scope?": "Small" },
					},
				},
			}),
		);
		const [answeredFromPayload] = projectAgentRuntimeEvent(
			event({
				type: "permission.resolved",
				seq: 20,
				approvalId: "ask-2",
				source: "user",
				decision: {
					approved: true,
					scope: "once",
					payload: {
						user_answers: { "Which scope?": "Small" },
					},
				},
			}),
		);

		expect(request).toMatchObject({
			type: "ask.requested",
			status: "requires_action",
			payload: {
				askId: "ask-1",
				toolName: "scp-agent-builtins__AskUserQuestion",
				input: {
					questions: [
						expect.objectContaining({
							header: "Scope",
							question: "Which scope?",
						}),
					],
				},
			},
		});
		expect(answered).toMatchObject({
			type: "ask.answered",
			status: "completed",
			payload: {
				askId: "ask-1",
				source: "user",
				decision: {
					approved: true,
					scope: "once",
					payload: {
						answers: { "Which scope?": "Small" },
					},
				},
			},
		});
		expect(answeredFromPayload).toMatchObject({
			type: "ask.answered",
			payload: {
				askId: "ask-2",
				decision: {
					payload: {
						user_answers: { "Which scope?": "Small" },
					},
				},
			},
		});
	});

	it("creates persistent Plan/Execute product events for decision and turn link replay", () => {
		const decision: PlanExecuteDecision = {
			id: "decision-1",
			action: "execute",
			sourcePlanId: "plan-1",
			sourcePlanVersion: 3,
			sourcePlanTurnId: "turn-plan-1",
			editedSteps: [
				{
					id: "step-1",
					title: "Add product events",
				},
			],
			instructions: "Keep renderer chat UI unchanged.",
			createdAt: "2026-06-30T08:00:00.000Z",
		};
		const record: PlanDecisionRecord = {
			kind: "plan.decision",
			action: "execute",
			sourcePlanId: "plan-1",
			sourcePlanVersion: 3,
			sourcePlanTurnId: "turn-plan-1",
			createdAt: "2026-06-30T08:00:00.000Z",
			decision,
		};
		const link: PlanExecuteTurnLink = {
			kind: "plan.execute-turn-link",
			sourcePlanId: "plan-1",
			sourcePlanVersion: 3,
			sourcePlanTurnId: "turn-plan-1",
			decisionId: "decision-1",
			userMessageId: "user-execute-1",
			assistantMessageId: "assistant-execute-1",
			prompt: "Execute the approved plan.",
			context: {
				kind: "execute-from-plan",
				sourcePlanId: "plan-1",
				sourcePlanVersion: 3,
				sourcePlanTurnId: "turn-plan-1",
				goal: "Persist Plan/Execute decisions",
				steps: [{ id: "step-1", title: "Add product events" }],
				risks: [],
				expectedChangedFiles: [],
				requiredApprovals: [],
				requiredContext: [],
				suggestedSubagents: [],
				decision,
			},
			createdAt: "2026-06-30T08:00:01.000Z",
		};

		const events = createPlanExecuteProductEvents(
			record,
			{
				sessionId: "session-1",
				projectId: "project-1",
				requestId: "req-plan-decision-1",
				eventIdPrefix: "plan-event",
			},
			link,
		);

		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({
			type: "plan.decision",
			eventId: "plan-event:plan.decision:plan-1:3:execute:decision-1",
			source: "product",
			sessionId: "session-1",
			projectId: "project-1",
			turnId: "turn-plan-1",
			requestId: "req-plan-decision-1",
			status: "completed",
			persist: true,
			payload: { record },
		});
		expect(events[1]).toMatchObject({
			type: "execute.turn.created",
			eventId:
				"plan-event:execute.turn.created:plan-1:3:decision-1:user-execute-1:assistant-execute-1",
			source: "product",
			sessionId: "session-1",
			turnId: "user-execute-1",
			status: "completed",
			persist: true,
			payload: { link },
		});
		expect(events.every(shouldPersistAgentProductEvent)).toBe(true);
	});

	it("creates persistent Plan decision events for execute, cancel, and regenerate", () => {
		const records: PlanDecisionRecord[] = [
			{
				kind: "plan.decision",
				action: "execute",
				sourcePlanId: "plan-1",
				sourcePlanVersion: 1,
				sourcePlanTurnId: "turn-plan-1",
				createdAt: "2026-06-30T08:00:00.000Z",
				decision: {
					id: "decision-execute",
					action: "execute",
					sourcePlanId: "plan-1",
					sourcePlanVersion: 1,
					sourcePlanTurnId: "turn-plan-1",
				},
			},
			{
				kind: "plan.decision",
				action: "cancel",
				sourcePlanId: "plan-1",
				sourcePlanVersion: 1,
				sourcePlanTurnId: "turn-plan-1",
				createdAt: "2026-06-30T08:01:00.000Z",
				decision: {
					id: "decision-cancel",
					action: "cancel",
					sourcePlanId: "plan-1",
					sourcePlanVersion: 1,
					sourcePlanTurnId: "turn-plan-1",
					reason: "Not needed now.",
				},
			},
			{
				kind: "plan.decision",
				action: "regenerate",
				sourcePlanId: "plan-1",
				sourcePlanVersion: 1,
				sourcePlanTurnId: "turn-plan-1",
				createdAt: "2026-06-30T08:02:00.000Z",
				decision: {
					id: "decision-regenerate",
					action: "regenerate",
					sourcePlanId: "plan-1",
					sourcePlanVersion: 1,
					sourcePlanTurnId: "turn-plan-1",
					instructions: "Split the plan into smaller steps.",
				},
			},
		];

		const events = records.map((record) =>
			createPlanDecisionProductEvent(record, {
				sessionId: "session-1",
				eventIdPrefix: "plan-event",
			}),
		);

		expect(events).toMatchObject([
			{
				type: "plan.decision",
				eventId: "plan-event:plan.decision:plan-1:1:execute:decision-execute",
				status: "completed",
				payload: { record: records[0] },
			},
			{
				type: "plan.decision",
				eventId: "plan-event:plan.decision:plan-1:1:cancel:decision-cancel",
				status: "stopped",
				payload: { record: records[1] },
			},
			{
				type: "plan.decision",
				eventId:
					"plan-event:plan.decision:plan-1:1:regenerate:decision-regenerate",
				status: "completed",
				payload: { record: records[2] },
			},
		]);
		expect(events.every(shouldPersistAgentProductEvent)).toBe(true);
	});
});

describe("subagent product event factories (Multi-Agent Round 6)", () => {
	const run: SubagentRunSummary = {
		subagentRunId: "sub-1",
		parentRunId: "parent-req-1",
		parentAssistantMessageId: "assistant-1",
		profileId: "reviewer",
		profileName: "Reviewer",
		taskGoal: "Review the diff",
		status: "spawned",
		startedAt: 1782200000000,
	};

	it("spawned factory has deterministic eventId keyed on subagentRunId + phase", () => {
		const evt = createSubagentSpawnedProductEvent(run, {
			sessionId: "session-1",
			projectId: "project-1",
			requestId: "parent-req-1",
			ts: 1782200000001,
		});

		expect(evt).toMatchObject({
			type: "subagent.spawned",
			eventId: "subagent:spawned:sub-1",
			sourceEventId: "subagent:spawned:sub-1",
			sessionId: "session-1",
			projectId: "project-1",
			source: "product",
			persist: true,
			status: "streaming",
			parentRunId: "parent-req-1",
			subagentRunId: "sub-1",
			payload: { run },
		});
		expect(shouldPersistAgentProductEvent(evt)).toBe(true);
	});

	it("updated factory carries subagentRunId + patch payload and a discriminated eventId", () => {
		const evt = createSubagentUpdatedProductEvent(
			"sub-1",
			{ status: "running", toolCallCount: 2 },
			{
				sessionId: "session-1",
				runtimeSeq: 7,
				parentRunId: "parent-req-1",
			},
		);

		expect(evt).toMatchObject({
			type: "subagent.updated",
			eventId: "subagent:updated:sub-1:7",
			sessionId: "session-1",
			source: "product",
			persist: true,
			parentRunId: "parent-req-1",
			subagentRunId: "sub-1",
			payload: {
				subagentRunId: "sub-1",
				patch: { status: "running", toolCallCount: 2 },
			},
		});
		expect(shouldPersistAgentProductEvent(evt)).toBe(true);
	});

	it("completed factory copies details onto payload and eventId is `<prefix>:completed:<id>`", () => {
		const evt = createSubagentCompletedProductEvent(
			"sub-1",
			{
				endedAt: 1782200002000,
				summary: "Reviewed 3 files",
				tokenUsage: { input: 200, output: 60 },
				toolCallCount: 3,
				resultRef: "sess://blob/abc",
			},
			{
				sessionId: "session-1",
				requestId: "parent-req-1",
				parentRunId: "parent-req-1",
			},
		);

		expect(evt).toMatchObject({
			type: "subagent.completed",
			eventId: "subagent:completed:sub-1",
			source: "product",
			persist: true,
			status: "completed",
			parentRunId: "parent-req-1",
			subagentRunId: "sub-1",
			payload: {
				subagentRunId: "sub-1",
				endedAt: 1782200002000,
				summary: "Reviewed 3 files",
				tokenUsage: { input: 200, output: 60 },
				toolCallCount: 3,
				resultRef: "sess://blob/abc",
			},
		});
		expect(shouldPersistAgentProductEvent(evt)).toBe(true);
	});

	it("failed factory carries errorMessage/endedAt and eventId is `<prefix>:failed:<id>`", () => {
		const evt = createSubagentFailedProductEvent(
			"sub-1",
			{ errorMessage: "boom", endedAt: 1782200003000 },
			{
				sessionId: "session-1",
				parentRunId: "parent-req-1",
			},
		);

		expect(evt).toMatchObject({
			type: "subagent.failed",
			eventId: "subagent:failed:sub-1",
			source: "product",
			persist: true,
			status: "error",
			parentRunId: "parent-req-1",
			subagentRunId: "sub-1",
			payload: {
				subagentRunId: "sub-1",
				errorMessage: "boom",
				endedAt: 1782200003000,
			},
		});
		expect(shouldPersistAgentProductEvent(evt)).toBe(true);
	});

	it("projectAgentRuntimeEvent propagates subagentRunId (and parentRunId) onto the product event base", () => {
		const projected = projectAgentRuntimeEvent(
			event({
				type: "text.delta",
				seq: 42,
				messageId: "assistant-1",
				delta: "child token",
				parentRunId: "parent-req-1",
				subagentRunId: "sub-1",
			}),
			{ projectId: "project-1", turnId: "turn-1" },
		);

		expect(projected).toHaveLength(1);
		expect(projected[0]).toMatchObject({
			type: "message.delta",
			sessionId: "session-1",
			parentRunId: "parent-req-1",
			subagentRunId: "sub-1",
			payload: { messageId: "assistant-1", delta: "child token" },
		});
	});

	it("all four subagent product events are persist=true (via shouldPersist)", () => {
		const ctx = {
			sessionId: "session-1",
			requestId: "parent-req-1",
			parentRunId: "parent-req-1",
		};
		const spawned = createSubagentSpawnedProductEvent(run, ctx);
		const updated = createSubagentUpdatedProductEvent(
			"sub-1",
			{ status: "running" },
			ctx,
		);
		const completed = createSubagentCompletedProductEvent(
			"sub-1",
			{ endedAt: 1782200002000 },
			ctx,
		);
		const failed = createSubagentFailedProductEvent(
			"sub-1",
			{ errorMessage: "boom", endedAt: 1782200003000 },
			ctx,
		);

		expect(
			[spawned, updated, completed, failed].every(
				shouldPersistAgentProductEvent,
			),
		).toBe(true);
	});
});

describe("buildUnknownProductEvent", () => {
	it("produces a transient non-persisted debug event that carries a safe summary", () => {
		const unknownRuntimeEvent = {
			v: 1,
			type: "plugin.custom-event",
			seq: 42,
			requestId: "req-9",
			conversationId: "session-9",
			runtime: "plugin-runtime",
			timestamp: 1782100999999,
			payloadDetail: "some inner detail",
			flag: true,
		};

		const projected = buildUnknownProductEvent(unknownRuntimeEvent, {
			projectId: "project-9",
			turnId: "turn-9",
		});

		expect(projected.type).toBe("unknown");
		expect(projected.persist).toBe(false);
		expect(projected.transient).toBe(true);
		expect(projected.sessionId).toBe("session-9");
		expect(projected.runtimeSeq).toBe(42);
		expect(projected.requestId).toBe("req-9");
		expect(projected.eventId).toBe("req-9:42:unknown:plugin.custom-event");
		expect(projected.type === "unknown").toBe(true);
		if (projected.type === "unknown") {
			expect(projected.payload.runtimeType).toBe("plugin.custom-event");
			expect(projected.payload.summary).toContain("type=plugin.custom-event");
		}
		expect(shouldPersistAgentProductEvent(projected)).toBe(false);
	});

	it("falls back safely when the raw event is empty or missing fields", () => {
		const projected = buildUnknownProductEvent(null);
		expect(projected.type).toBe("unknown");
		expect(projected.persist).toBe(false);
		expect(projected.sessionId).toBe("");
		if (projected.type === "unknown") {
			expect(projected.payload.runtimeType).toBe("unknown");
		}
		expect(shouldPersistAgentProductEvent(projected)).toBe(false);
	});
});
