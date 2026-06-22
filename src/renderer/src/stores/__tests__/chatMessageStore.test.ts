/**
 * Chat Message Store Tests
 *
 * Tests read state via `useChatMessageStore.getState()` AFTER each action so
 * we always observe the latest store snapshot. The pre-refactor pattern
 * (capturing `getState()` once and reading from the captured reference)
 * silently consulted a stale snapshot — every assertion that wasn't on the
 * initial state would fail.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useChatMessageStore } from "../chatMessageStore";

const fresh = () => useChatMessageStore.getState();

describe("Chat Message Store", () => {
	beforeEach(() => {
		const store = fresh();
		store.clearMessages();
		store.setStreaming(false);
		store.setStreamingContent("");
	});

	describe("Messages", () => {
		it("should add a message", () => {
			fresh().addMessage({
				id: "msg_1",
				role: "user",
				content: "Hello",
				timestamp: Date.now(),
			});

			expect(fresh().messages).toHaveLength(1);
			expect(fresh().messages[0].content).toBe("Hello");
		});

		it("should clear all messages", () => {
			fresh().addMessage({
				id: "msg_1",
				role: "user",
				content: "Hello",
				timestamp: Date.now(),
			});

			fresh().clearMessages();

			expect(fresh().messages).toHaveLength(0);
		});

		it("should update last message", () => {
			fresh().addMessage({
				id: "msg_1",
				role: "assistant",
				content: "Hello",
				timestamp: Date.now(),
			});

			fresh().updateLastMessage("Hello World");

			expect(fresh().messages[0].content).toBe("Hello World");
		});
	});

	describe("Tool Calls", () => {
		it("should add message with tool call", () => {
			fresh().addMessage({
				id: "tool_1",
				role: "tool",
				content: "Using tool",
				timestamp: Date.now(),
				type: "tool_use",
				toolCall: {
					id: "tool_123",
					name: "test_tool",
					input: { param: "value" },
					status: "pending",
				},
			});

			expect(fresh().messages).toHaveLength(1);
			expect(fresh().messages[0].toolCall).toBeDefined();
			expect(fresh().messages[0].toolCall?.name).toBe("test_tool");
		});

		it("should update tool call status", () => {
			fresh().addMessage({
				id: "tool_1",
				role: "tool",
				content: "Using tool",
				timestamp: Date.now(),
				type: "tool_use",
				toolCall: {
					id: "tool_123",
					name: "test_tool",
					input: {},
					status: "pending",
				},
			});

			fresh().updateMessageToolCall("tool_1", {
				status: "success",
				result: { data: "result" },
				duration: 1000,
			});

			const msg = fresh().messages[0];
			expect(msg.toolCall?.status).toBe("success");
			expect(msg.toolCall?.result).toEqual({ data: "result" });
			expect(msg.toolCall?.duration).toBe(1000);
		});
	});

	describe("Streaming", () => {
		it("should set streaming state", () => {
			fresh().setStreaming(true);
			expect(fresh().isStreaming).toBe(true);

			fresh().setStreaming(false);
			expect(fresh().isStreaming).toBe(false);
		});

		it("should set streaming content", () => {
			fresh().setStreamingContent("Hello");
			expect(fresh().streamingContent).toBe("Hello");
		});

		it("should append streaming content", () => {
			fresh().setStreamingContent("Hello");
			fresh().appendStreamingContent(" World");

			expect(fresh().streamingContent).toBe("Hello World");
		});
	});
});
