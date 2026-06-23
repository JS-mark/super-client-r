// @vitest-environment node
//
// B-1 旧 ChatMessagePersist → 新 SessionEvent[] 转换测试。

import { describe, expect, it, vi } from "vitest";
import type { ChatMessagePersist } from "@super-client/shared-types/chat";
import {
	convertChatMessageToEvents,
	convertChatMessagesToEvents,
} from "../messageConverter";
import { messageToEvents } from "@super-client/shared-types/messageConverter";

describe("user / assistant text messages", () => {
	it("user text → single user_message event", () => {
		const msg: ChatMessagePersist = {
			id: "u1",
			role: "user",
			content: "hi",
			timestamp: 1000,
		};
		const events = convertChatMessageToEvents(msg);
		expect(events).toEqual([
			{ type: "user_message", id: "u1", ts: 1000, content: "hi" },
		]);
	});

	it("assistant text with metadata → assistant_message preserves metadata", () => {
		const msg: ChatMessagePersist = {
			id: "a1",
			role: "assistant",
			content: "hello",
			timestamp: 2000,
			type: "text",
			metadata: { model: "claude", inputTokens: 10 },
		};
		const events = convertChatMessageToEvents(msg);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "assistant_message",
			id: "a1",
			ts: 2000,
			content: "hello",
			metadata: { model: "claude", inputTokens: 10 },
		});
	});

	it("user message attachmentIds carry over", () => {
		const msg: ChatMessagePersist = {
			id: "u2",
			role: "user",
			content: "see this",
			timestamp: 1500,
			metadata: { attachmentIds: ["att-1", "att-2"] },
		};
		const events = convertChatMessageToEvents(msg);
		expect(events[0]).toMatchObject({
			type: "user_message",
			attachmentIds: ["att-1", "att-2"],
		});
	});

	it("assistant structured parts skip transient parts", () => {
		const events = messageToEvents({
			id: "a-parts",
			role: "assistant",
			content: "transient persistent",
			timestamp: 2100,
			parts: [
				{
					id: "p-transient",
					type: "text",
					state: "streaming",
					transient: true,
					createdAt: 2100,
					updatedAt: 2100,
					content: "transient",
				},
				{
					id: "p-persistent",
					type: "text",
					state: "complete",
					createdAt: 2101,
					updatedAt: 2102,
					content: "persistent",
				},
			],
		});

		expect(events.map((event) => event.type)).toEqual([
			"assistant_message",
			"assistant.part_start",
			"assistant.part_done",
		]);
		expect(events[0]).toMatchObject({
			type: "assistant_message",
			content: "persistent",
		});
		expect(events).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ partId: "p-transient" }),
				expect.objectContaining({
					part: expect.objectContaining({ id: "p-transient" }),
				}),
			]),
		);
	});
});

describe("tool_use", () => {
	it("tool_use without result → only tool_call event", () => {
		const msg: ChatMessagePersist = {
			id: "t1",
			role: "tool",
			content: "",
			timestamp: 3000,
			type: "tool_use",
			toolCall: {
				id: "tc-1",
				name: "read_file",
				input: { path: "/x" },
				status: "pending",
			},
		};
		const events = convertChatMessageToEvents(msg);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "tool_call",
			id: "tc-1",
			name: "read_file",
			input: { path: "/x" },
		});
	});

	it("tool_use with success result → tool_call + tool_result", () => {
		const msg: ChatMessagePersist = {
			id: "t2",
			role: "tool",
			content: "",
			timestamp: 4000,
			type: "tool_use",
			toolCall: {
				id: "tc-2",
				name: "write_file",
				input: { path: "/y" },
				status: "success",
				result: "ok",
				duration: 50,
			},
		};
		const events = convertChatMessageToEvents(msg);
		expect(events).toHaveLength(2);
		expect(events[0].type).toBe("tool_call");
		expect(events[1]).toMatchObject({
			type: "tool_result",
			toolCallId: "tc-2",
			output: "ok",
			duration: 50,
		});
	});

	it("tool_use with error → tool_call + tool_error", () => {
		const msg: ChatMessagePersist = {
			id: "t3",
			role: "tool",
			content: "",
			timestamp: 5000,
			type: "tool_use",
			toolCall: {
				id: "tc-3",
				name: "bad",
				input: {},
				status: "error",
				error: "permission denied",
			},
		};
		const events = convertChatMessageToEvents(msg);
		expect(events[1]).toMatchObject({
			type: "tool_error",
			toolCallId: "tc-3",
			error: "permission denied",
		});
	});
});

describe("error / tool_result / unknown", () => {
	it("error type → session_marker with diagnostic payload", () => {
		const msg: ChatMessagePersist = {
			id: "e1",
			role: "assistant",
			content: "boom",
			timestamp: 6000,
			type: "error",
		};
		const events = convertChatMessageToEvents(msg);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "session_marker",
			key: "error",
			value: { id: "e1", content: "boom" },
		});
	});

	it("standalone tool_result without toolCall.id → skip + warn", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const msg = {
				id: "tr-orphan",
				role: "tool" as const,
				content: "stale",
				timestamp: 7000,
				type: "tool_result" as const,
			};
			expect(convertChatMessageToEvents(msg)).toEqual([]);
			expect(warn).toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
});

describe("convertChatMessagesToEvents (batch)", () => {
	it("preserves order across conversions", () => {
		const msgs: ChatMessagePersist[] = [
			{ id: "u1", role: "user", content: "q", timestamp: 1 },
			{
				id: "t1",
				role: "tool",
				content: "",
				timestamp: 2,
				type: "tool_use",
				toolCall: {
					id: "tc",
					name: "read",
					input: {},
					status: "success",
					result: "data",
				},
			},
			{ id: "a1", role: "assistant", content: "answer", timestamp: 3 },
		];
		const events = convertChatMessagesToEvents(msgs);
		expect(events.map((e) => e.type)).toEqual([
			"user_message",
			"tool_call",
			"tool_result",
			"assistant_message",
		]);
	});
});
