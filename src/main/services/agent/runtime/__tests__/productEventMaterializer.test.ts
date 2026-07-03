// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentProductEvent } from "@super-client/shared-types/agent-product-events";
import type {
	PlanDecisionRecord,
	PlanExecuteDecision,
	PlanExecuteTurnLink,
} from "@super-client/shared-types/plan-execute";
import type { SubagentRunSummary } from "@super-client/shared-types/subagent";
import { eventsToMessages, parseEvents, serializeEvent } from "../../../storage/jsonl";
import {
	materializeAgentProductEvent,
	materializeAgentProductEvents,
	subagentPartId,
} from "../productEventMaterializer";

const base = {
	v: 1,
	eventId: "pe-1",
	sourceEventId: "re-1",
	sessionId: "session-1",
	projectId: "project-1",
	runId: "run-1",
	turnId: "turn-1",
	requestId: "req-1",
	runtime: "llm-loop",
	runtimeSeq: 1,
	ts: 1782100000000,
	source: "runtime",
	persist: true,
} as const;

function productEvent(
	overrides: Partial<AgentProductEvent> &
		Pick<AgentProductEvent, "type" | "payload">,
): AgentProductEvent {
	return { ...base, ...overrides } as AgentProductEvent;
}

describe("materializeAgentProductEvent", () => {
	it("materializes message.completed as assistant_message for jsonl upsert semantics", () => {
		const [event] = materializeAgentProductEvent(
			productEvent({
				type: "message.completed",
				payload: {
					messageId: "assistant-1",
					text: "Done",
					reasoning: "Checked the files first",
				},
				status: "completed",
			}),
		);

		expect(event).toEqual({
			type: "assistant_message",
			eventId: "pe-1",
			ts: base.ts,
			id: "assistant-1",
			content: "Done",
		});
		expect(eventsToMessages([event])).toMatchObject([
			{
				id: "assistant-1",
				role: "assistant",
				type: "text",
				content: "Done",
			},
		]);
	});

	it("materializes tool call/result/error into reducer-compatible tool events", () => {
		const events = materializeAgentProductEvents([
			productEvent({
				type: "tool.call",
				eventId: "pe-call",
				runtimeSeq: 2,
				payload: {
					callId: "tool-1",
					toolName: "read_file",
					input: { path: "/tmp/a.txt" },
				},
				status: "pending",
			}),
			productEvent({
				type: "tool.result",
				eventId: "pe-result",
				runtimeSeq: 3,
				payload: {
					callId: "tool-1",
					content: { kind: "text", text: "file contents" },
				},
				status: "completed",
			}),
			productEvent({
				type: "tool.call",
				eventId: "pe-call-2",
				runtimeSeq: 4,
				payload: {
					callId: "tool-2",
					toolName: "write_file",
					input: { path: "/tmp/a.txt", content: "x" },
				},
				status: "pending",
			}),
			productEvent({
				type: "tool.error",
				eventId: "pe-error",
				runtimeSeq: 5,
				payload: {
					callId: "tool-2",
					content: { kind: "error", message: "permission denied" },
				},
				status: "error",
			}),
		]);

		expect(events).toMatchObject([
			{
				type: "tool_call",
				eventId: "pe-call",
				id: "tool-1",
				name: "read_file",
				input: { path: "/tmp/a.txt" },
			},
			{
				type: "tool_result",
				eventId: "pe-result",
				toolCallId: "tool-1",
				output: { kind: "text", text: "file contents" },
			},
			{
				type: "tool_call",
				eventId: "pe-call-2",
				id: "tool-2",
				name: "write_file",
				input: { path: "/tmp/a.txt", content: "x" },
			},
			{
				type: "tool_error",
				eventId: "pe-error",
				toolCallId: "tool-2",
				error: { kind: "error", message: "permission denied" },
				code: "permission denied",
			},
		]);

		const messages = eventsToMessages(events);
		expect(messages).toHaveLength(2);
		expect(messages[0].toolCall).toMatchObject({
			id: "tool-1",
			name: "read_file",
			status: "success",
			result: { kind: "text", text: "file contents" },
		});
		expect(messages[1].toolCall).toMatchObject({
			id: "tool-2",
			name: "write_file",
			status: "error",
			error: JSON.stringify({ kind: "error", message: "permission denied" }),
		});
	});

	it("materializes approval request as marker and replays resolution into tool message", () => {
		const events = materializeAgentProductEvents([
			productEvent({
				type: "approval.requested",
				eventId: "pe-approval-request",
				payload: {
					approvalId: "approval-1",
					toolName: "execute_command",
					input: { command: "pwd" },
				},
				status: "requires_action",
			}),
			productEvent({
				type: "approval.resolved",
				eventId: "pe-approval-resolved",
				payload: {
					approvalId: "approval-1",
					source: "user",
					decision: {
						approved: true,
						scope: "session",
						reason: "trusted workspace",
					},
				},
				status: "completed",
			}),
			productEvent({
				type: "approval.resolved",
				eventId: "pe-approval-denied",
				payload: {
					approvalId: "approval-2",
					source: "user",
					decision: {
						approved: false,
						scope: "once",
						reason: "too broad",
					},
				},
				status: "stopped",
			}),
		]);

		expect(events).toEqual([
			{
				type: "session_marker",
				eventId: "pe-approval-request",
				ts: base.ts,
				key: "approval.requested",
				value: {
					approvalId: "approval-1",
					toolName: "execute_command",
					input: { command: "pwd" },
					status: "requires_action",
					runId: "run-1",
					requestId: "req-1",
				},
			},
			{
				type: "approval",
				eventId: "pe-approval-resolved",
				ts: base.ts,
				toolCallId: "approval-1",
				decision: "allow_session",
				reason: "trusted workspace",
			},
			{
				type: "approval",
				eventId: "pe-approval-denied",
				ts: base.ts,
				toolCallId: "approval-2",
				decision: "deny",
				reason: "too broad",
			},
		]);
		expect(eventsToMessages(events)).toMatchObject([
			{
				id: "tool_msg_approval-1",
				type: "tool_use",
				toolCall: {
					id: "approval-1",
					name: "execute_command",
					status: "success",
					result: {
						decision: "allow_session",
						reason: "trusted workspace",
					},
					approval: {
						kind: "permission",
						displayName: "execute_command",
						decisionReason: "trusted workspace",
					},
				},
			},
			{
				id: "tool_msg_approval-2",
				type: "tool_use",
				toolCall: {
					id: "approval-2",
					status: "error",
					error: "too broad",
					approval: {
						decisionReason: "too broad",
					},
				},
			},
		]);
	});

	it("materializes AskUserQuestion request and answer as ask markers", () => {
		const events = materializeAgentProductEvents([
			productEvent({
				type: "ask.requested",
				eventId: "pe-ask-request",
				payload: {
					askId: "ask-1",
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
				},
				status: "requires_action",
			}),
			productEvent({
				type: "ask.answered",
				eventId: "pe-ask-answered",
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
					payload: {
						answers: { "Which scope?": "Small" },
					},
				},
				status: "completed",
			}),
		]);

		expect(events).toEqual([
			{
				type: "session_marker",
				eventId: "pe-ask-request",
				ts: base.ts,
				key: "ask.requested",
				value: {
					askId: "ask-1",
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
					status: "requires_action",
					runId: "run-1",
					requestId: "req-1",
				},
			},
			{
				type: "session_marker",
				eventId: "pe-ask-answered",
				ts: base.ts,
				key: "ask.answered",
				value: {
					askId: "ask-1",
					decision: "allow_once",
					reason: "user",
					payload: {
						answers: { "Which scope?": "Small" },
					},
					status: "completed",
					runId: "run-1",
					requestId: "req-1",
				},
			},
		]);
		expect(eventsToMessages(events)).toMatchObject([
			{
				id: "tool_msg_ask-1",
				type: "tool_use",
				toolCall: {
					id: "ask-1",
					name: "scp-agent-builtins__AskUserQuestion",
					status: "success",
					result: {
						answers: { "Which scope?": "Small" },
					},
					approval: {
						kind: "ask-user-question",
						displayName: "scp-agent-builtins__AskUserQuestion",
						decisionReason: "user",
						userAnswers: { "Which scope?": "Small" },
					},
				},
			},
		]);
	});

	it("keeps run lifecycle as session markers and skips UI-only transient product events (including per-tick usage)", () => {
		const events = materializeAgentProductEvents([
			productEvent({
				type: "run.started",
				eventId: "pe-started",
				payload: { nativeSessionId: "native-1", model: "claude" },
				status: "streaming",
			}),
			productEvent({
				type: "run.usage",
				eventId: "pe-usage",
				payload: {
					inputTokens: 10,
					outputTokens: 20,
					cacheReadTokens: 1,
					cacheWriteTokens: 2,
				},
				persist: false,
				transient: true,
			}),
			productEvent({
				type: "run.completed",
				eventId: "pe-completed",
				payload: { finalMessageId: "assistant-1", reason: "completed" },
				status: "completed",
			}),
			productEvent({
				type: "run.status",
				eventId: "pe-status",
				payload: { status: "tool_calling" },
				persist: false,
				transient: true,
			}),
			productEvent({
				type: "message.delta",
				eventId: "pe-delta",
				payload: { messageId: "assistant-1", delta: "hel" },
				persist: false,
				transient: true,
			}),
			productEvent({
				type: "structured_part.delta",
				eventId: "pe-reasoning",
				payload: {
					messageId: "assistant-1",
					kind: "reasoning",
					delta: "thinking",
				},
				persist: false,
				transient: true,
			}),
		]);

		expect(events.map((event) => event.type)).toEqual([
			"session_marker",
			"session_marker",
		]);
		expect(events).toMatchObject([
			{
				type: "session_marker",
				eventId: "pe-started",
				key: "run.started",
				value: {
					runId: "run-1",
					requestId: "req-1",
					runtime: "llm-loop",
					payload: { nativeSessionId: "native-1", model: "claude" },
				},
			},
			{
				type: "session_marker",
				eventId: "pe-completed",
				key: "run.completed",
				value: {
					status: "completed",
					payload: { finalMessageId: "assistant-1", reason: "completed" },
				},
			},
		]);
		expect(eventsToMessages(events)).toMatchObject([
			{
				id: "assistant-1",
				role: "assistant",
				type: "text",
				parts: [
					{
						id: "run_status_part_pe-completed",
						type: "status",
						state: "complete",
						label: "Run completed",
						detail: "completed · llm-loop · req-1",
					},
				],
			},
		]);
	});

	it("returns [] for run.usage product events regardless of persist flag (terminal-only policy)", () => {
		// Even if a caller forgets to mark run.usage as transient, the
		// materializer switch drops it — per-tick token telemetry never
		// materializes into the JSONL audit log.
		expect(
			materializeAgentProductEvent(
				productEvent({
					type: "run.usage",
					eventId: "pe-usage-transient",
					payload: {
						inputTokens: 10,
						outputTokens: 20,
					},
					persist: false,
					transient: true,
				}),
			),
		).toEqual([]);
		expect(
			materializeAgentProductEvent(
				productEvent({
					type: "run.usage",
					eventId: "pe-usage-defensive",
					payload: {
						inputTokens: 10,
						outputTokens: 20,
					},
				}),
			),
		).toEqual([]);
	});

	it("returns [] for any non-persisted or transient product event", () => {
		expect(
			materializeAgentProductEvent(
				productEvent({
					type: "message.completed",
					payload: { messageId: "assistant-1", text: "Done" },
					persist: false,
				}),
			),
		).toEqual([]);
		expect(
			materializeAgentProductEvent(
				productEvent({
					type: "message.completed",
					payload: { messageId: "assistant-1", text: "Done" },
					transient: true,
				}),
			),
		).toEqual([]);
	});

	it("materializes Plan decisions and execute turn links as replayable session markers", () => {
		const decision: PlanExecuteDecision = {
			id: "decision-1",
			action: "execute",
			sourcePlanId: "plan-1",
			sourcePlanVersion: 2,
			sourcePlanTurnId: "turn-plan-1",
			editedSteps: [{ id: "step-1", title: "Persist the decision" }],
			instructions: "Do not touch renderer chat UI.",
			createdAt: "2026-06-30T09:00:00.000Z",
		};
		const record: PlanDecisionRecord = {
			kind: "plan.decision",
			action: "execute",
			sourcePlanId: "plan-1",
			sourcePlanVersion: 2,
			sourcePlanTurnId: "turn-plan-1",
			decision,
			createdAt: "2026-06-30T09:00:00.000Z",
		};
		const link: PlanExecuteTurnLink = {
			kind: "plan.execute-turn-link",
			sourcePlanId: "plan-1",
			sourcePlanVersion: 2,
			sourcePlanTurnId: "turn-plan-1",
			decisionId: "decision-1",
			userMessageId: "user-execute-1",
			assistantMessageId: "assistant-execute-1",
			prompt: "Execute the approved plan.",
			context: {
				kind: "execute-from-plan",
				sourcePlanId: "plan-1",
				sourcePlanVersion: 2,
				sourcePlanTurnId: "turn-plan-1",
				goal: "Persist Plan/Execute state",
				steps: [{ id: "step-1", title: "Persist the decision" }],
				risks: [],
				expectedChangedFiles: [],
				requiredApprovals: [],
				requiredContext: [],
				suggestedSubagents: [],
				decision,
			},
			createdAt: "2026-06-30T09:00:01.000Z",
		};

		const events = materializeAgentProductEvents([
			productEvent({
				type: "plan.decision",
				eventId: "pe-plan-decision",
				source: "product",
				turnId: "turn-plan-1",
				payload: { record },
				status: "completed",
			}),
			productEvent({
				type: "execute.turn.created",
				eventId: "pe-execute-turn",
				source: "product",
				turnId: "user-execute-1",
				payload: { link },
				status: "completed",
			}),
		]);

		expect(events).toEqual([
			{
				type: "session_marker",
				eventId: "pe-plan-decision",
				ts: base.ts,
				key: "plan.decision",
				value: {
					action: "execute",
					sourcePlanId: "plan-1",
					sourcePlanVersion: 2,
					sourcePlanTurnId: "turn-plan-1",
					decision,
					record,
					status: "completed",
					runId: "run-1",
					requestId: "req-1",
					turnId: "turn-plan-1",
				},
			},
			{
				type: "session_marker",
				eventId: "pe-execute-turn",
				ts: base.ts,
				key: "execute.turn.created",
				value: {
					sourcePlanId: "plan-1",
					sourcePlanVersion: 2,
					sourcePlanTurnId: "turn-plan-1",
					decisionId: "decision-1",
					userMessageId: "user-execute-1",
					assistantMessageId: "assistant-execute-1",
					link,
					status: "completed",
					runId: "run-1",
					requestId: "req-1",
					turnId: "user-execute-1",
				},
			},
		]);

		const replayed = parseEvents(events.map(serializeEvent).join(""));
		expect(replayed).toEqual(events);
		// The `plan.decision` marker alone is a no-op (no source plan part to
		// mutate). The `execute.turn.created` marker attaches a `plan_exec_link_*`
		// status part to the linked assistant message so the transcript can
		// visually connect the plan to its follow-up execute turn even when
		// replayed marker-only.
		const messages = eventsToMessages(replayed);
		expect(messages).toHaveLength(1);
		expect(messages[0].id).toBe("assistant-execute-1");
		expect(messages[0].role).toBe("assistant");
		const linkPart = messages[0].parts?.find(
			(p) => p.type === "status" && p.id === "plan_exec_link_plan-1",
		);
		expect(linkPart).toBeDefined();
		if (linkPart && linkPart.type === "status") {
			expect(linkPart.label).toBe("Plan executed");
			expect(linkPart.detail).toContain("plan plan-1#2");
			expect(linkPart.detail).toContain("turn user-execute-1");
			expect(linkPart.state).toBe("complete");
		}
	});

	// ─────────────────────────────────────────────────────────────
	// Multi-Agent Round 6: subagent product event materialization.
	// The materializer writes both a session_marker (audit / replay
	// baseline) and, when a parent assistant message is known,
	// assistant.part_start / part_update events so the reducer can
	// upsert the SubagentMessagePart into the parent transcript.
	// ─────────────────────────────────────────────────────────────
	describe("subagent product events (Multi-Agent Round 6)", () => {
		const run: SubagentRunSummary = {
			subagentRunId: "sub-1",
			parentRunId: "req-1",
			parentAssistantMessageId: "assistant-1",
			profileId: "reviewer",
			profileName: "Reviewer",
			taskGoal: "Review the diff",
			status: "spawned",
			startedAt: base.ts,
		};

		it("subagent.spawned materializes as [session_marker, assistant.part_start] targeting the parent message", () => {
			const events = materializeAgentProductEvent(
				productEvent({
					type: "subagent.spawned",
					eventId: "pe-sub-spawn",
					parentRunId: "req-1",
					subagentRunId: "sub-1",
					payload: { run },
					status: "streaming",
				}),
			);
			expect(events).toHaveLength(2);
			expect(events[0]).toMatchObject({
				type: "session_marker",
				key: "subagent.spawned",
				eventId: "pe-sub-spawn",
				value: {
					subagentRunId: "sub-1",
					parentRunId: "req-1",
					parentAssistantMessageId: "assistant-1",
					run,
					status: "streaming",
				},
			});
			expect(events[1]).toMatchObject({
				type: "assistant.part_start",
				eventId: "pe-sub-spawn",
				messageId: "assistant-1",
				part: {
					id: subagentPartId("sub-1"),
					type: "subagent",
					state: "streaming",
					collapsed: true,
					run,
				},
			});
		});

		it("subagent.updated materializes marker + assistant.part_update when patch carries parent message id", () => {
			const events = materializeAgentProductEvent(
				productEvent({
					type: "subagent.updated",
					eventId: "pe-sub-upd",
					parentRunId: "req-1",
					subagentRunId: "sub-1",
					payload: {
						subagentRunId: "sub-1",
						patch: {
							status: "running",
							toolCallCount: 2,
							parentAssistantMessageId: "assistant-1",
						},
					},
					status: "streaming",
				}),
			);
			expect(events).toHaveLength(2);
			expect(events[0]).toMatchObject({
				type: "session_marker",
				key: "subagent.updated",
				eventId: "pe-sub-upd",
				value: {
					subagentRunId: "sub-1",
					parentRunId: "req-1",
					patch: {
						status: "running",
						toolCallCount: 2,
						parentAssistantMessageId: "assistant-1",
					},
				},
			});
			expect(events[1]).toMatchObject({
				type: "assistant.part_update",
				eventId: "pe-sub-upd",
				messageId: "assistant-1",
				partId: subagentPartId("sub-1"),
			});
			expect(events[1]).toHaveProperty("patch");
			if (events[1].type === "assistant.part_update") {
				const patch = events[1].patch as { state?: string; run?: unknown };
				expect(patch.state).toBe("streaming");
				expect(patch.run).toMatchObject({
					subagentRunId: "sub-1",
					status: "running",
					toolCallCount: 2,
				});
			}
		});

		it("subagent.updated with a bare patch (no parentAssistantMessageId) only writes the session_marker", () => {
			const events = materializeAgentProductEvent(
				productEvent({
					type: "subagent.updated",
					eventId: "pe-sub-upd-bare",
					parentRunId: "req-1",
					subagentRunId: "sub-1",
					payload: {
						subagentRunId: "sub-1",
						patch: { toolCallCount: 3 },
					},
					status: "streaming",
				}),
			);
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				type: "session_marker",
				key: "subagent.updated",
			});
		});

		it("subagent.completed materializes a session_marker carrying summary/tokenUsage/resultRef", () => {
			const events = materializeAgentProductEvent(
				productEvent({
					type: "subagent.completed",
					eventId: "pe-sub-done",
					parentRunId: "req-1",
					subagentRunId: "sub-1",
					payload: {
						subagentRunId: "sub-1",
						endedAt: base.ts + 5000,
						summary: "reviewed 3 files",
						tokenUsage: { input: 100, output: 40 },
						toolCallCount: 4,
						resultRef: "sess://blob/xyz",
					},
					status: "completed",
				}),
			);
			expect(events).toEqual([
				{
					type: "session_marker",
					eventId: "pe-sub-done",
					ts: base.ts,
					key: "subagent.completed",
					value: {
						subagentRunId: "sub-1",
						parentRunId: "req-1",
						summary: "reviewed 3 files",
						tokenUsage: { input: 100, output: 40 },
						toolCallCount: 4,
						endedAt: base.ts + 5000,
						resultRef: "sess://blob/xyz",
						status: "completed",
						runId: "run-1",
						requestId: "req-1",
					},
				},
			]);
		});

		it("subagent.failed materializes a session_marker with the error message", () => {
			const events = materializeAgentProductEvent(
				productEvent({
					type: "subagent.failed",
					eventId: "pe-sub-fail",
					parentRunId: "req-1",
					subagentRunId: "sub-1",
					payload: {
						subagentRunId: "sub-1",
						errorMessage: "child crashed",
						endedAt: base.ts + 5000,
					},
					status: "error",
				}),
			);
			expect(events).toEqual([
				{
					type: "session_marker",
					eventId: "pe-sub-fail",
					ts: base.ts,
					key: "subagent.failed",
					value: {
						subagentRunId: "sub-1",
						parentRunId: "req-1",
						errorMessage: "child crashed",
						endedAt: base.ts + 5000,
						status: "error",
						runId: "run-1",
						requestId: "req-1",
					},
				},
			]);
		});

		it("tool.call product event carrying subagentRunId propagates it onto the SessionEvent", () => {
			const [call] = materializeAgentProductEvent(
				productEvent({
					type: "tool.call",
					eventId: "pe-tool-child",
					subagentRunId: "sub-1",
					payload: {
						callId: "tool-99",
						toolName: "read_file",
						input: { path: "/x" },
					},
					status: "pending",
				}),
			);
			expect(call).toMatchObject({
				type: "tool_call",
				id: "tool-99",
				name: "read_file",
				input: { path: "/x" },
				subagentRunId: "sub-1",
			});

			const [result] = materializeAgentProductEvent(
				productEvent({
					type: "tool.result",
					eventId: "pe-tool-child-result",
					subagentRunId: "sub-1",
					payload: {
						callId: "tool-99",
						content: { kind: "text", text: "ok" },
					},
					status: "completed",
				}),
			);
			expect(result).toMatchObject({
				type: "tool_result",
				toolCallId: "tool-99",
				subagentRunId: "sub-1",
			});
		});
	});
});
