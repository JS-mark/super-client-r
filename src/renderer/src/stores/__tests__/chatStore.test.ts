/**
 * Chat Store Tests
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useChatStore } from "../chatStore";

describe("Chat Store", () => {
	beforeEach(() => {
		// Reset store state before each test
		const store = useChatStore.getState();
		store.clearMessages();
		store.setStreaming(false);
		store.setStreamingContent("");
	});

	describe("Messages", () => {
		it("should add a message", () => {
			const store = useChatStore.getState();
			const message = {
				id: "msg_1",
				role: "user" as const,
				content: "Hello",
				timestamp: Date.now(),
			};

			store.addMessage(message);

			expect(store.messages).toHaveLength(1);
			expect(store.messages[0].content).toBe("Hello");
		});

		it("should clear all messages", () => {
			const store = useChatStore.getState();
			store.addMessage({
				id: "msg_1",
				role: "user",
				content: "Hello",
				timestamp: Date.now(),
			});

			store.clearMessages();

			expect(store.messages).toHaveLength(0);
		});

		it("should update last message", () => {
			const store = useChatStore.getState();
			store.addMessage({
				id: "msg_1",
				role: "assistant",
				content: "Hello",
				timestamp: Date.now(),
			});

			store.updateLastMessage({ content: "Hello World" });

			expect(store.messages[0].content).toBe("Hello World");
		});
	});

	describe("Tool Calls", () => {
		it("should add message with tool call", () => {
			const store = useChatStore.getState();
			const message = {
				id: "tool_1",
				role: "tool" as const,
				content: "Using tool",
				timestamp: Date.now(),
				type: "tool_use" as const,
				toolCall: {
					id: "tool_123",
					name: "test_tool",
					input: { param: "value" },
					status: "pending" as const,
				},
			};

			store.addMessage(message);

			expect(store.messages).toHaveLength(1);
			expect(store.messages[0].toolCall).toBeDefined();
			expect(store.messages[0].toolCall?.name).toBe("test_tool");
		});

		it("should update tool call status", () => {
			const store = useChatStore.getState();
			store.addMessage({
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

			store.updateMessageToolCall("tool_1", {
				status: "success",
				result: { data: "result" },
				duration: 1000,
			});

			expect(store.messages[0].toolCall?.status).toBe("success");
			expect(store.messages[0].toolCall?.result).toEqual({ data: "result" });
			expect(store.messages[0].toolCall?.duration).toBe(1000);
		});
	});

	describe("Streaming", () => {
		it("should set streaming state", () => {
			const store = useChatStore.getState();

			store.setStreaming(true);
			expect(store.isStreaming).toBe(true);

			store.setStreaming(false);
			expect(store.isStreaming).toBe(false);
		});

		it("should set streaming content", () => {
			const store = useChatStore.getState();

			store.setStreamingContent("Hello");
			expect(store.streamingContent).toBe("Hello");
		});

		it("should append streaming content", () => {
			const store = useChatStore.getState();

			store.setStreamingContent("Hello");
			store.appendStreamingContent(" World");

			expect(store.streamingContent).toBe("Hello World");
		});
	});
});
