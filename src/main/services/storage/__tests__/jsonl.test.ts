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
				expect.stringContaining("tool_result"),
				"tc-orphan",
			);
		} finally {
			warn.mockRestore();
		}
	});

	it("excludes approval / file_artifact / session_marker from messages", () => {
		const events: SessionEvent[] = [
			{ type: "user_message", id: "u1", ts: 1, content: "hi" },
			{
				type: "approval",
				ts: 2,
				toolCallId: "tc1",
				decision: "allow_once",
			},
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
});
