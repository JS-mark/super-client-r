// @vitest-environment node
//
// A-4 JSONL serialization 测试。

import { describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "@super-client/shared-types/project";
import {
	eventsToMessages,
	parseEvents,
	parseEventsWithReport,
	serializeEvent,
} from "../jsonl";

describe("serializeEvent", () => {
	it("produces a single line ending with newline", () => {
		const out = serializeEvent({
			type: "user_message",
			id: "u1",
			ts: 1000,
			content: "hello",
		});
		expect(out.endsWith("\n")).toBe(true);
		expect(out.indexOf("\n")).toBe(out.length - 1); // only one \n
		expect(JSON.parse(out)).toEqual({
			type: "user_message",
			id: "u1",
			ts: 1000,
			content: "hello",
		});
	});

	it("round-trips through parseEvents (single event)", () => {
		const e: SessionEvent = {
			type: "assistant_message",
			id: "a1",
			ts: 2000,
			content: "hi",
			metadata: { model: "claude" },
		};
		const back = parseEvents(serializeEvent(e));
		expect(back).toEqual([e]);
	});

	it("round-trips multiple events when concatenated", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "u1", ts: 1, content: "a" },
			{ type: "assistant_message", id: "a1", ts: 2, content: "b" },
		];
		const blob = events.map(serializeEvent).join("");
		expect(parseEvents(blob)).toEqual(events);
	});
});

describe("parseEvents — robustness", () => {
	it("returns [] for empty / whitespace input", () => {
		expect(parseEvents("")).toEqual([]);
		expect(parseEvents("\n\n  \n")).toEqual([]);
	});

	it("tolerates a malformed last line (partial write at crash)", () => {
		const blob =
			'{"type":"user_message","id":"u1","ts":1,"content":"ok"}\n' +
			'{"type":"assistant_message","id":"a1","ts:'; // truncated
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const events = parseEvents(blob);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("user_message");
			expect(warn).toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});

	it("reports trailing partial lines separately from malformed middle lines", () => {
		const trailing = parseEventsWithReport(
			'{"type":"user_message","id":"u1","ts":1,"content":"ok"}\n{"bad"',
		);
		expect(trailing.events).toHaveLength(1);
		expect(trailing.malformedTrailingLine).toBe(true);
		expect(trailing.malformedMiddleLines).toBe(0);

		const middle = parseEventsWithReport(
			'{"type":"user_message","id":"u1","ts":1,"content":"ok"}\n{bad}\n{"type":"user_message","id":"u2","ts":2,"content":"ok"}\n',
		);
		expect(middle.events).toHaveLength(2);
		expect(middle.malformedTrailingLine).toBe(false);
		expect(middle.malformedMiddleLines).toBe(1);
	});

	it("tolerates last line without trailing newline", () => {
		const blob = '{"type":"user_message","id":"u1","ts":1,"content":"ok"}';
		expect(parseEvents(blob)).toHaveLength(1);
	});

	it("drops entries without a recognised type field", () => {
		const blob =
			'{"type":"user_message","id":"u1","ts":1,"content":"ok"}\n' +
			'{"type":"unknown_thing","ts":2}\n' +
			'{"id":"x","ts":3}\n'; // no type at all
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const events = parseEvents(blob);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("user_message");
		} finally {
			warn.mockRestore();
		}
	});
});

describe("eventsToMessages", () => {
	it("maps user_message and assistant_message to renderer Messages", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "u1", ts: 1, content: "hi" },
			{
				type: "assistant_message",
				id: "a1",
				ts: 2,
				content: "hello",
				metadata: { model: "claude" },
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs).toHaveLength(2);
		expect(msgs[0]).toMatchObject({
			id: "u1",
			role: "user",
			content: "hi",
			type: "text",
		});
		expect(msgs[1]).toMatchObject({
			id: "a1",
			role: "assistant",
			content: "hello",
			type: "text",
			metadata: { model: "claude" },
		});
	});

	it("replays compacted context assistant metadata without duplicate messages", () => {
		const compactedEvent: SessionEvent = {
			type: "assistant_message",
			eventId: "context.compacted:1",
			id: "context-summary-1",
			ts: 100,
			content: "Earlier messages summarized.",
			metadata: {
				contextCompacted: {
					compacted: true,
					summary: "Earlier messages summarized.",
					originalCount: 4,
					compactedAt: 100,
				},
				contextStrategy: {
					mode: "auto",
					strategy: "summarized",
					historyCount: 3,
					omittedCount: 4,
					estimatedTokens: 1600,
					availableForMessages: 1200,
					compacted: true,
				},
			},
		};

		const msgs = eventsToMessages([compactedEvent, compactedEvent]);

		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			id: "context-summary-1",
			role: "assistant",
			content: "Earlier messages summarized.",
			metadata: {
				contextCompacted: {
					compacted: true,
					summary: "Earlier messages summarized.",
					originalCount: 4,
					compactedAt: 100,
				},
				contextStrategy: {
					mode: "auto",
					strategy: "summarized",
					historyCount: 3,
					omittedCount: 4,
					estimatedTokens: 1600,
					availableForMessages: 1200,
					compacted: true,
				},
			},
		});
	});

	it("reduces assistant part events into structured Message.parts and text fallback", () => {
		const events: SessionEvent[] = [
			{
				type: "assistant.part_start",
				messageId: "a-parts",
				ts: 10,
				part: {
					id: "p1",
					type: "text",
					state: "streaming",
					createdAt: 10,
					updatedAt: 10,
					content: "Hello",
				},
			},
			{
				type: "assistant.part_delta",
				messageId: "a-parts",
				partId: "p1",
				ts: 11,
				delta: " world",
			},
			{
				type: "assistant.part_done",
				messageId: "a-parts",
				partId: "p1",
				ts: 12,
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			id: "a-parts",
			role: "assistant",
			type: "text",
			content: "Hello world",
		});
		expect(msgs[0].parts).toEqual([
			expect.objectContaining({
				id: "p1",
				type: "text",
				state: "complete",
				content: "Hello world",
			}),
		]);
	});

	it("pairs tool_call + tool_result into one tool_use Message", () => {
		const events: SessionEvent[] = [
			{
				type: "tool_call",
				id: "tc1",
				ts: 10,
				name: "read_file",
				input: { path: "/x" },
			},
			{
				type: "tool_result",
				toolCallId: "tc1",
				ts: 11,
				output: "file contents",
				duration: 50,
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			role: "tool",
			type: "tool_use",
			toolCall: {
				id: "tc1",
				name: "read_file",
				status: "success",
				result: "file contents",
				duration: 50,
			},
		});
	});

	it("leaves tool_call status='pending' when result not yet arrived", () => {
		const events: SessionEvent[] = [
			{
				type: "tool_call",
				id: "tc1",
				ts: 10,
				name: "read_file",
				input: {},
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs[0].toolCall?.status).toBe("pending");
		expect(msgs[0].toolCall?.result).toBeUndefined();
	});

	it("flags isError tool_result as status='error'", () => {
		const events: SessionEvent[] = [
			{
				type: "tool_call",
				id: "tc1",
				ts: 10,
				name: "bad",
				input: {},
			},
			{
				type: "tool_result",
				toolCallId: "tc1",
				ts: 11,
				output: "not found",
				isError: true,
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs[0].toolCall?.status).toBe("error");
		expect(msgs[0].toolCall?.error).toBe("not found");
	});

	it("pairs tool_call + tool_error into failed tool_use Message", () => {
		const events: SessionEvent[] = [
			{
				type: "tool_call",
				id: "tc1",
				ts: 10,
				name: "bad",
				input: {},
			},
			{
				type: "tool_error",
				toolCallId: "tc1",
				ts: 11,
				error: "permission denied",
				duration: 9,
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs[0].toolCall).toMatchObject({
			status: "error",
			error: "permission denied",
			result: "permission denied",
			duration: 9,
		});
	});

	it("warns and skips tool_result without preceding tool_call", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const events: SessionEvent[] = [
				{
					type: "tool_result",
					toolCallId: "tc-orphan",
					ts: 11,
					output: "ignored",
				},
			];
			expect(eventsToMessages(events)).toEqual([]);
			expect(warn).toHaveBeenCalledWith(
				expect.any(String),
				expect.stringContaining("tool_result"),
				expect.objectContaining({ toolCallId: "tc-orphan" }),
			);
		} finally {
			warn.mockRestore();
		}
	});

	it("excludes file_artifact and unrelated session_marker from messages", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "u1", ts: 1, content: "hi" },
			{
				type: "file_artifact",
				ts: 3,
				messageId: "u1",
				path: "/some/file",
				kind: "modified",
			},
			{
				type: "session_marker",
				ts: 4,
				key: "chatMode",
				value: "agent",
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].role).toBe("user");
	});

	it("replays approval requested and resolved markers as a resolved tool message", () => {
		const events: SessionEvent[] = [
			{
				type: "session_marker",
				ts: 10,
				key: "approval.requested",
				value: {
					approvalId: "approval-1",
					toolName: "execute_command",
					input: { command: "pwd" },
				},
			},
			{
				type: "approval",
				ts: 11,
				toolCallId: "approval-1",
				decision: "allow_session",
				reason: "trusted workspace",
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			id: "tool_msg_approval-1",
			role: "tool",
			type: "tool_use",
			toolCall: {
				id: "approval-1",
				name: "execute_command",
				input: { command: "pwd" },
				status: "success",
				result: {
					decision: "allow_session",
					reason: "trusted workspace",
				},
				approval: {
					kind: "permission",
					decisionReason: "trusted workspace",
				},
			},
		});
	});

	it("replays denied approval as an errored tool message", () => {
		const events: SessionEvent[] = [
			{
				type: "session_marker",
				ts: 10,
				key: "approval.requested",
				value: {
					approvalId: "approval-2",
					toolName: "write_file",
					input: { path: "/tmp/a.txt" },
				},
			},
			{
				type: "approval",
				ts: 11,
				toolCallId: "approval-2",
				decision: "deny",
				reason: "too broad",
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs[0].toolCall).toMatchObject({
			id: "approval-2",
			name: "write_file",
			status: "error",
			error: "too broad",
			approval: {
				kind: "permission",
				decisionReason: "too broad",
			},
		});
	});

	it("replays ask requested and answered markers as a completed ask card message", () => {
		const events: SessionEvent[] = [
			{
				type: "session_marker",
				ts: 10,
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
				},
			},
			{
				type: "session_marker",
				ts: 11,
				key: "ask.answered",
				value: {
					askId: "ask-1",
					decision: "allow_once",
					reason: "user",
					payload: {
						answers: { "Which scope?": "Small" },
					},
				},
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		expect(msgs[0].toolCall).toMatchObject({
			id: "ask-1",
			name: "scp-agent-builtins__AskUserQuestion",
			status: "success",
			result: {
				answers: { "Which scope?": "Small" },
			},
			approval: {
				kind: "ask-user-question",
				userAnswers: { "Which scope?": "Small" },
				decisionReason: "user",
			},
		});
	});

	it("replays structured plan parts and resolved decision state", () => {
		const events: SessionEvent[] = [
			{
				type: "assistant.part_start",
				messageId: "assistant-plan",
				ts: 20,
				part: {
					id: "plan-part",
					type: "plan",
					state: "streaming",
					createdAt: 20,
					updatedAt: 20,
					pendingDecision: true,
					requiresDecision: true,
					status: "pending-decision",
					plan: {
						id: "plan-1",
						version: 1,
						sourceTurnId: "turn-1",
						goal: "Update replay",
						steps: [{ id: "step-1", title: "Patch reducer" }],
					},
				},
			},
			{
				type: "assistant.part_done",
				messageId: "assistant-plan",
				partId: "plan-part",
				ts: 21,
				patch: {
					pendingDecision: false,
					requiresDecision: false,
					status: "decision-execute",
					decision: {
						action: "execute",
						sourcePlanId: "plan-1",
						sourcePlanVersion: 1,
						sourcePlanTurnId: "turn-1",
					},
				},
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		expect(msgs[0].parts?.[0]).toMatchObject({
			id: "plan-part",
			type: "plan",
			state: "complete",
			pendingDecision: false,
			requiresDecision: false,
			status: "decision-execute",
			decision: {
				action: "execute",
				sourcePlanId: "plan-1",
			},
			plan: {
				id: "plan-1",
				version: 1,
			},
		});
	});

	it("replays run.completed marker as a status part on the final assistant message", () => {
		const events: SessionEvent[] = [
			{
				type: "assistant_message",
				id: "assistant-final",
				ts: 10,
				content: "Done",
			},
			{
				type: "session_marker",
				eventId: "event-run-completed",
				ts: 11,
				key: "run.completed",
				value: {
					runId: "run-1",
					requestId: "req-1",
					runtime: "llm-loop",
					status: "completed",
					payload: {
						finalMessageId: "assistant-final",
						reason: "completed",
					},
				},
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			id: "assistant-final",
			role: "assistant",
			content: "Done",
			parts: [
				{
					id: "run_status_part_event-run-completed",
					type: "status",
					state: "complete",
					label: "Run completed",
					detail: "completed · llm-loop · req-1",
				},
			],
		});
	});

	it("replays run.stopped marker onto the latest assistant message without adding a new bubble", () => {
		const events: SessionEvent[] = [
			{
				type: "assistant_message",
				id: "assistant-last",
				ts: 10,
				content: "Partial output",
			},
			{
				type: "session_marker",
				eventId: "event-run-stopped",
				ts: 11,
				key: "run.stopped",
				value: {
					requestId: "req-stop",
					status: "stopped",
					payload: { reason: "cancelled" },
				},
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		expect(msgs[0].parts?.[0]).toMatchObject({
			id: "run_status_part_event-run-stopped",
			type: "status",
			state: "complete",
			label: "Run stopped",
			detail: "cancelled · req-stop",
		});
	});

	it("replays run.error marker as a fallback assistant status message when no assistant exists", () => {
		const events: SessionEvent[] = [
			{
				type: "session_marker",
				eventId: "event-run-error",
				ts: 11,
				key: "run.error",
				value: {
					requestId: "req-error",
					status: "error",
					payload: {
						code: "AUTH_403",
						message: "not available",
					},
				},
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			id: "run_status_event-run-error",
			role: "assistant",
			type: "text",
			content: "",
			parts: [
				{
					id: "run_status_part_event-run-error",
					type: "status",
					state: "error",
					label: "Run failed",
					detail: "not available · AUTH_403 · req-error",
				},
			],
		});
	});

	it("plan.decision marker alone mutates the source PlanMessagePart", () => {
		const events: SessionEvent[] = [
			{
				type: "assistant.part_start",
				messageId: "asst-1",
				ts: 20,
				part: {
					id: "plan-1",
					type: "plan",
					state: "streaming",
					createdAt: 20,
					updatedAt: 20,
					pendingDecision: true,
					requiresDecision: true,
					status: "pending-decision",
					plan: {
						id: "plan-1",
						version: 1,
						sourceTurnId: "turn-1",
						goal: "cancel me",
						steps: [{ id: "step-1", title: "irrelevant" }],
					},
				},
			},
			{
				type: "session_marker",
				ts: 25,
				key: "plan.decision",
				value: {
					action: "cancel",
					sourcePlanId: "plan-1",
					sourcePlanVersion: 1,
					sourcePlanTurnId: "turn-1",
					decision: {
						action: "cancel",
						sourcePlanId: "plan-1",
						sourcePlanVersion: 1,
						sourcePlanTurnId: "turn-1",
					},
					record: {
						sourcePlanId: "plan-1",
						action: "cancel",
						at: 25,
						decision: {
							action: "cancel",
							sourcePlanId: "plan-1",
							sourcePlanVersion: 1,
							sourcePlanTurnId: "turn-1",
						},
					},
				},
			},
		];

		const msgs = eventsToMessages(events);

		expect(msgs).toHaveLength(1);
		const planPart = msgs[0].parts?.[0];
		expect(planPart).toMatchObject({
			id: "plan-1",
			type: "plan",
			pendingDecision: false,
			status: "decision-cancel",
			decision: {
				action: "cancel",
				sourcePlanId: "plan-1",
				sourcePlanVersion: 1,
				sourcePlanTurnId: "turn-1",
			},
		});
	});

	it("execute.turn.created marker attaches a Plan executed status part to the linked assistant message", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "user-2", ts: 30, content: "run it" },
			{
				type: "assistant_message",
				id: "asst-2",
				ts: 31,
				content: "on it",
			},
			{
				type: "session_marker",
				ts: 32,
				key: "execute.turn.created",
				value: {
					sourcePlanId: "plan-1",
					sourcePlanVersion: 1,
					sourcePlanTurnId: "turn-1",
					userMessageId: "user-2",
					assistantMessageId: "asst-2",
					link: {
						sourcePlanId: "plan-1",
						sourcePlanVersion: 1,
						sourcePlanTurnId: "turn-1",
						userMessageId: "user-2",
						assistantMessageId: "asst-2",
					},
				},
			},
		];

		const msgs = eventsToMessages(events);

		const assistant = msgs.find((m) => m.id === "asst-2");
		expect(assistant).toBeDefined();
		const statusPart = assistant?.parts?.find(
			(p): p is Extract<typeof p, { type: "status" }> =>
				p.type === "status" && p.id.startsWith("plan_exec_link_plan-1"),
		);
		expect(statusPart).toMatchObject({
			id: "plan_exec_link_plan-1",
			type: "status",
			state: "complete",
			label: "Plan executed",
		});
		expect(statusPart?.detail).toContain("plan plan-1#1");
		expect(statusPart?.detail).toContain("turn user-2");
	});

	it("run.rate_limit marker replays as an error-state status part with retry hint", () => {
		const events: SessionEvent[] = [
			{
				type: "assistant_message",
				id: "asst-3",
				ts: 40,
				content: "partial",
			},
			{
				type: "session_marker",
				ts: 41,
				key: "run.rate_limit",
				value: {
					runId: "req-3",
					requestId: "req-3",
					runtime: "llm-loop",
					status: "streaming",
					payload: {
						message: "429 rate limited",
						retryAfterMs: 30000,
					},
				},
			},
		];

		const msgs = eventsToMessages(events);

		const assistant = msgs.find((m) => m.id === "asst-3");
		expect(assistant).toBeDefined();
		const statusPart = assistant?.parts?.find(
			(p): p is Extract<typeof p, { type: "status" }> =>
				p.type === "status" && p.label === "Rate limited",
		);
		expect(statusPart).toMatchObject({
			type: "status",
			state: "error",
			label: "Rate limited",
		});
		expect(statusPart?.detail).toContain("429 rate limited");
		expect(statusPart?.detail).toContain("retry in 30s");
	});

	it("preserves attachmentIds on user_message via metadata", () => {
		const events: SessionEvent[] = [
			{
				type: "user_message",
				id: "u1",
				ts: 1,
				content: "look at these",
				attachmentIds: ["att-1", "att-2"],
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs[0].metadata?.attachmentIds).toEqual(["att-1", "att-2"]);
	});

	it("upserts assistant_message by id — later event overwrites the earlier in place", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "u1", ts: 1, content: "hi" },
			// initial empty placeholder emitted on addMessage
			{ type: "assistant_message", id: "a1", ts: 2, content: "" },
			// final content + metadata emitted on stream finalize / done
			{
				type: "assistant_message",
				id: "a1",
				ts: 3,
				content: "final answer",
				metadata: { model: "claude", tokens: 42 },
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs).toHaveLength(2);
		expect(msgs[1]).toMatchObject({
			id: "a1",
			role: "assistant",
			content: "final answer",
			metadata: { model: "claude", tokens: 42 },
		});
	});

	it("upserts assistant_message keeps original position relative to tool messages", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "u1", ts: 1, content: "go" },
			{ type: "assistant_message", id: "a1", ts: 2, content: "" },
			{
				type: "tool_call",
				id: "tc1",
				ts: 3,
				name: "pwd",
				input: {},
			},
			{
				type: "tool_result",
				toolCallId: "tc1",
				ts: 4,
				output: "/tmp",
			},
			// stream finalize re-emits the assistant with same id AFTER tool already shown
			{
				type: "assistant_message",
				id: "a1",
				ts: 5,
				content: "done",
			},
		];
		const msgs = eventsToMessages(events);
		expect(msgs.map((m) => ({ id: m.id, role: m.role }))).toEqual([
			{ id: "u1", role: "user" },
			{ id: "a1", role: "assistant" },
			{ id: "tool_msg_tc1", role: "tool" },
		]);
		expect(msgs[1].content).toBe("done");
	});

	it("upserts user_message by id (e.g. content edit re-emit)", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "u1", ts: 1, content: "draft" },
			{ type: "user_message", id: "u1", ts: 2, content: "edited" },
		];
		const msgs = eventsToMessages(events);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].content).toBe("edited");
	});

	// ─────────────────────────────────────────────────────────────
	// Multi-Agent Round 6 — SubagentMessagePart reduction.
	// ─────────────────────────────────────────────────────────────
	describe("SubagentMessagePart reduction (Multi-Agent Round 6)", () => {
		it("collapses a subagent's tool calls into the parent's SubagentMessagePart (toolCallCount)", () => {
			const run = {
				subagentRunId: "sub-1",
				parentRunId: "req-1",
				parentAssistantMessageId: "assistant-1",
				profileId: "reviewer",
				profileName: "Reviewer",
				taskGoal: "Review the diff",
				status: "spawned" as const,
				startedAt: 100,
			};
			const events: SessionEvent[] = [
				{ type: "user_message", id: "u1", ts: 1, content: "review the diff" },
				{
					type: "assistant.part_start",
					messageId: "assistant-1",
					ts: 10,
					part: {
						id: "text-1",
						type: "text",
						state: "streaming",
						createdAt: 10,
						updatedAt: 10,
						content: "Delegating to reviewer…",
					},
				},
				{
					type: "session_marker",
					ts: 11,
					key: "subagent.spawned",
					value: {
						subagentRunId: "sub-1",
						parentRunId: "req-1",
						parentAssistantMessageId: "assistant-1",
						run,
					},
				},
				{
					type: "tool_call",
					id: "tc-child-1",
					ts: 12,
					name: "read_file",
					input: { path: "/a.ts" },
					subagentRunId: "sub-1",
				},
				{
					type: "tool_result",
					toolCallId: "tc-child-1",
					ts: 13,
					output: "content",
					subagentRunId: "sub-1",
				},
				{
					type: "session_marker",
					ts: 20,
					key: "subagent.completed",
					value: {
						subagentRunId: "sub-1",
						parentRunId: "req-1",
						summary: "Looked good",
						tokenUsage: { input: 50, output: 20 },
						endedAt: 20,
					},
				},
			];

			const msgs = eventsToMessages(events);
			expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
			const assistant = msgs[1];
			const partTypes = (assistant.parts ?? []).map((p) => p.type);
			expect(partTypes).toEqual(["text", "subagent"]);
			const subPart = (assistant.parts ?? []).find(
				(p) => p.type === "subagent",
			);
			expect(subPart).toBeDefined();
			if (subPart && subPart.type === "subagent") {
				expect(subPart.id).toBe("subagent_part_sub-1");
				expect(subPart.state).toBe("complete");
				expect(subPart.run.status).toBe("completed");
				expect(subPart.run.toolCallCount).toBe(1);
				expect(subPart.run.summary).toBe("Looked good");
				expect(subPart.run.tokenUsage).toEqual({ input: 50, output: 20 });
				expect(subPart.run.endedAt).toBe(20);
			}
		});

		it("falls back to a top-level tool message when a subagent tool_call has no matching spawned marker (BC)", () => {
			const events: SessionEvent[] = [
				{ type: "user_message", id: "u1", ts: 1, content: "hello" },
				{
					type: "tool_call",
					id: "tc-orphan",
					ts: 2,
					name: "read_file",
					input: { path: "/x" },
					subagentRunId: "sub-x",
				},
				{
					type: "tool_result",
					toolCallId: "tc-orphan",
					ts: 3,
					output: "ok",
					subagentRunId: "sub-x",
				},
			];
			const msgs = eventsToMessages(events);
			expect(msgs.map((m) => ({ role: m.role, type: m.type }))).toEqual([
				{ role: "user", type: "text" },
				{ role: "tool", type: "tool_use" },
			]);
			expect(msgs[1].toolCall).toMatchObject({
				id: "tc-orphan",
				name: "read_file",
				status: "success",
				result: "ok",
				subagentRunId: "sub-x",
			});
		});

		it("subagent.failed marker flips the SubagentMessagePart to error state", () => {
			const run = {
				subagentRunId: "sub-2",
				parentRunId: "req-2",
				parentAssistantMessageId: "assistant-2",
				taskGoal: "flake test",
				status: "spawned" as const,
				startedAt: 100,
			};
			const events: SessionEvent[] = [
				{
					type: "assistant.part_start",
					messageId: "assistant-2",
					ts: 5,
					part: {
						id: "text-2",
						type: "text",
						state: "streaming",
						createdAt: 5,
						updatedAt: 5,
						content: "Delegating…",
					},
				},
				{
					type: "session_marker",
					ts: 6,
					key: "subagent.spawned",
					value: {
						subagentRunId: "sub-2",
						parentRunId: "req-2",
						parentAssistantMessageId: "assistant-2",
						run,
					},
				},
				{
					type: "session_marker",
					ts: 7,
					key: "subagent.failed",
					value: {
						subagentRunId: "sub-2",
						parentRunId: "req-2",
						errorMessage: "crashed",
						endedAt: 7,
					},
				},
			];
			const msgs = eventsToMessages(events);
			const assistant = msgs.find((m) => m.id === "assistant-2");
			expect(assistant).toBeDefined();
			const subPart = assistant?.parts?.find((p) => p.type === "subagent");
			expect(subPart).toBeDefined();
			if (subPart && subPart.type === "subagent") {
				expect(subPart.state).toBe("error");
				expect(subPart.run.status).toBe("failed");
				expect(subPart.run.errorMessage).toBe("crashed");
				expect(subPart.run.endedAt).toBe(7);
			}
		});

		it("subagent.updated marker merges patch onto part.run and preserves untouched fields", () => {
			const run = {
				subagentRunId: "sub-3",
				parentRunId: "req-3",
				parentAssistantMessageId: "assistant-3",
				taskGoal: "check",
				status: "spawned" as const,
				startedAt: 100,
			};
			const events: SessionEvent[] = [
				{
					type: "assistant.part_start",
					messageId: "assistant-3",
					ts: 5,
					part: {
						id: "text-3",
						type: "text",
						state: "streaming",
						createdAt: 5,
						updatedAt: 5,
						content: "…",
					},
				},
				{
					type: "session_marker",
					ts: 6,
					key: "subagent.spawned",
					value: {
						subagentRunId: "sub-3",
						parentRunId: "req-3",
						parentAssistantMessageId: "assistant-3",
						run,
					},
				},
				{
					type: "session_marker",
					ts: 7,
					key: "subagent.updated",
					value: {
						subagentRunId: "sub-3",
						patch: { status: "running", toolCallCount: 5 },
					},
				},
			];
			const msgs = eventsToMessages(events);
			const assistant = msgs.find((m) => m.id === "assistant-3");
			const subPart = assistant?.parts?.find((p) => p.type === "subagent");
			expect(subPart).toBeDefined();
			if (subPart && subPart.type === "subagent") {
				expect(subPart.state).toBe("streaming");
				expect(subPart.run.status).toBe("running");
				expect(subPart.run.toolCallCount).toBe(5);
				expect(subPart.run.taskGoal).toBe("check");
				expect(subPart.run.subagentRunId).toBe("sub-3");
			}
		});

		it("drops corrupt optional fields when coercing a spawned run snapshot (P-M2)", () => {
			// Persisted JSON may carry wrong-typed optional fields (older
			// writes, partial corruption). coerceSubagentRun must not let
			// them leak through as wrong types into the inspector — bad
			// values are dropped to `undefined`, valid ones are preserved.
			const events: SessionEvent[] = [
				{
					type: "assistant.part_start",
					messageId: "assistant-4",
					ts: 5,
					part: {
						id: "text-4",
						type: "text",
						state: "streaming",
						createdAt: 5,
						updatedAt: 5,
						content: "…",
					},
				},
				{
					type: "session_marker",
					ts: 6,
					key: "subagent.spawned",
					value: {
						subagentRunId: "sub-4",
						parentRunId: "req-4",
						parentAssistantMessageId: "assistant-4",
						run: {
							subagentRunId: "sub-4",
							parentRunId: "req-4",
							taskGoal: "ok goal",
							status: "spawned",
							startedAt: 100,
							// corrupt optional fields — must all be dropped:
							profileId: 12345,
							profileName: null,
							toolCallCount: "not-a-number",
							endedAt: "later",
							errorMessage: 42,
							summary: { blob: true },
							resultRef: false,
							tokenUsage: "nope",
							// a valid optional field — must be preserved:
							parentAssistantMessageId: "assistant-4",
						},
					},
				},
			];

			const msgs = eventsToMessages(events);
			const subPart = msgs
				.flatMap((m) => m.parts ?? [])
				.find((p) => p.type === "subagent");
			expect(subPart).toBeDefined();
			if (subPart && subPart.type === "subagent") {
				// Required fields intact.
				expect(subPart.run.subagentRunId).toBe("sub-4");
				expect(subPart.run.taskGoal).toBe("ok goal");
				expect(subPart.run.startedAt).toBe(100);
				// Valid optional preserved.
				expect(subPart.run.parentAssistantMessageId).toBe("assistant-4");
				// Corrupt optionals dropped (not leaked as wrong types).
				expect(subPart.run.profileId).toBeUndefined();
				expect(subPart.run.profileName).toBeUndefined();
				expect(subPart.run.toolCallCount).toBeUndefined();
				expect(subPart.run.endedAt).toBeUndefined();
				expect(subPart.run.errorMessage).toBeUndefined();
				expect(subPart.run.summary).toBeUndefined();
				expect(subPart.run.resultRef).toBeUndefined();
				expect(subPart.run.tokenUsage).toBeUndefined();
			}
		});
	});
});
