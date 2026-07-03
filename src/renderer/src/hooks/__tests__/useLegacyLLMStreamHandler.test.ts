import { describe, expect, it, vi } from "vitest";
import type { Message } from "@super-client/shared-types/chat";
import type { ChatStreamEvent } from "../../types/models";
import {
	handleLegacyLLMStreamEvent,
	type LegacyLLMStreamHandlerDeps,
} from "../useLegacyLLMStreamHandler";

function makeDeps(
	overrides: Partial<LegacyLLMStreamHandlerDeps> = {},
	initialMessages: Message[] = [],
): {
	deps: LegacyLLMStreamHandlerDeps;
	spies: {
		kickWatchdog: ReturnType<typeof vi.fn>;
		clearWatchdog: ReturnType<typeof vi.fn>;
		pauseForApproval: ReturnType<typeof vi.fn>;
		clearCurrentRequest: ReturnType<typeof vi.fn>;
		setSessionStatus: ReturnType<typeof vi.fn>;
		addMessage: ReturnType<typeof vi.fn>;
		updateMessageToolCall: ReturnType<typeof vi.fn>;
		updateMessageMetadata: ReturnType<typeof vi.fn>;
		appendAssistantStreamChunk: ReturnType<typeof vi.fn>;
		finalizeAssistantStreamContent: ReturnType<typeof vi.fn>;
		clearAssistantStreamContent: ReturnType<typeof vi.fn>;
		persistMessages: ReturnType<typeof vi.fn>;
		materializeStreamError: ReturnType<typeof vi.fn>;
		addFileArtifacts: ReturnType<typeof vi.fn>;
		addChangeSet: ReturnType<typeof vi.fn>;
		subscribe: ReturnType<typeof vi.fn>;
	};
	setMessages: (msgs: Message[]) => void;
} {
	let messages = [...initialMessages];
	const setMessages = (msgs: Message[]): void => {
		messages = msgs;
	};

	const spies = {
		kickWatchdog: vi.fn(),
		clearWatchdog: vi.fn(),
		pauseForApproval: vi.fn(),
		clearCurrentRequest: vi.fn(),
		setSessionStatus: vi.fn(),
		addMessage: vi.fn((m: Message) => {
			messages = [...messages, m];
		}),
		updateMessageToolCall: vi.fn(),
		updateMessageMetadata: vi.fn(),
		appendAssistantStreamChunk: vi.fn(),
		finalizeAssistantStreamContent: vi.fn(),
		clearAssistantStreamContent: vi.fn(),
		persistMessages: vi.fn(),
		materializeStreamError: vi.fn(),
		addFileArtifacts: vi.fn(),
		addChangeSet: vi.fn(),
		subscribe: vi.fn(() => () => {}),
	};

	const deps: LegacyLLMStreamHandlerDeps = {
		getCurrentRequestId: () => "req_1",
		getRequestType: () => "legacy",
		getSessionStatus: () => "streaming",
		getMessages: () => messages,
		getCurrentConversationId: () => "conv_1",
		getModelInfo: () => ({
			model: "test-model",
			providerPreset: "anthropic",
			providerName: "Test",
		}),
		kickWatchdog: spies.kickWatchdog,
		clearWatchdog: spies.clearWatchdog,
		pauseForApproval: spies.pauseForApproval,
		clearCurrentRequest: spies.clearCurrentRequest,
		setSessionStatus: spies.setSessionStatus,
		addMessage: spies.addMessage,
		updateMessageToolCall: spies.updateMessageToolCall,
		updateMessageMetadata: spies.updateMessageMetadata,
		appendAssistantStreamChunk: spies.appendAssistantStreamChunk,
		finalizeAssistantStreamContent: spies.finalizeAssistantStreamContent,
		clearAssistantStreamContent: spies.clearAssistantStreamContent,
		persistMessages: spies.persistMessages,
		materializeStreamError: spies.materializeStreamError,
		addFileArtifacts: spies.addFileArtifacts,
		addChangeSet: spies.addChangeSet,
		subscribe: spies.subscribe,
		...overrides,
	};

	return { deps, spies, setMessages };
}

describe("handleLegacyLLMStreamEvent — gating", () => {
	it("ignores events whose requestId does not match the current one", () => {
		const { deps, spies } = makeDeps({
			getCurrentRequestId: () => "req_current",
		});
		const event: ChatStreamEvent = {
			requestId: "req_other",
			type: "chunk",
			content: "hi",
		};
		handleLegacyLLMStreamEvent(event, deps);
		expect(spies.kickWatchdog).not.toHaveBeenCalled();
		expect(spies.appendAssistantStreamChunk).not.toHaveBeenCalled();
	});

	it("ignores events when requestType is 'agent-sdk'", () => {
		const { deps, spies } = makeDeps({
			getRequestType: () => "agent-sdk",
		});
		const event: ChatStreamEvent = {
			requestId: "req_1",
			type: "chunk",
			content: "hi",
		};
		handleLegacyLLMStreamEvent(event, deps);
		expect(spies.kickWatchdog).not.toHaveBeenCalled();
		expect(spies.appendAssistantStreamChunk).not.toHaveBeenCalled();
	});

	it("ignores events when requestType is 'runtime'", () => {
		const { deps, spies } = makeDeps({
			getRequestType: () => "runtime",
		});
		const event: ChatStreamEvent = {
			requestId: "req_1",
			type: "chunk",
			content: "hi",
		};
		handleLegacyLLMStreamEvent(event, deps);
		expect(spies.kickWatchdog).not.toHaveBeenCalled();
	});
});

describe("handleLegacyLLMStreamEvent — watchdog", () => {
	it("kicks the watchdog on every accepted event", () => {
		const { deps, spies } = makeDeps();
		const events: ChatStreamEvent[] = [
			{ requestId: "req_1", type: "chunk", content: "a" },
			{ requestId: "req_1", type: "chunk", content: "b" },
			{
				requestId: "req_1",
				type: "tool_result",
				toolResult: {
					toolCallId: "tc_1",
					name: "Read",
					result: "ok",
					isError: false,
				},
			},
		];
		for (const ev of events) handleLegacyLLMStreamEvent(ev, deps);
		expect(spies.kickWatchdog).toHaveBeenCalledTimes(3);
	});
});

describe("handleLegacyLLMStreamEvent — chunk", () => {
	it("promotes preparing → streaming on first chunk", () => {
		const { deps, spies } = makeDeps({
			getSessionStatus: () => "preparing",
		});
		handleLegacyLLMStreamEvent(
			{ requestId: "req_1", type: "chunk", content: "hello" },
			deps,
		);
		expect(spies.setSessionStatus).toHaveBeenCalledWith("streaming");
		expect(spies.appendAssistantStreamChunk).toHaveBeenCalledWith("hello");
	});
});

describe("handleLegacyLLMStreamEvent — tool_result", () => {
	it("triggers captureFileArtifacts / addFileArtifacts for write_file results", () => {
		const toolMsg: Message = {
			id: "tool_call_1",
			role: "tool",
			content: "Calling tool: write_file",
			timestamp: 1,
			type: "tool_use",
			toolCall: {
				id: "call_1",
				name: "write_file",
				input: { path: "/tmp/foo.txt" },
				status: "pending",
			},
		};
		const { deps, spies } = makeDeps({}, [toolMsg]);

		handleLegacyLLMStreamEvent(
			{
				requestId: "req_1",
				type: "tool_result",
				toolResult: {
					toolCallId: "call_1",
					name: "write_file",
					result: "wrote 12 bytes",
					isError: false,
				},
			},
			deps,
		);

		expect(spies.updateMessageToolCall).toHaveBeenCalledWith(
			"tool_call_1",
			expect.objectContaining({
				status: "success",
				result: "wrote 12 bytes",
			}),
		);
		expect(spies.addFileArtifacts).toHaveBeenCalledTimes(1);
		const artifacts = spies.addFileArtifacts.mock.calls[0][0] as Array<{
			path: string;
			kind: string;
		}>;
		expect(artifacts).toHaveLength(1);
		expect(artifacts[0].path).toBe("/tmp/foo.txt");
		expect(artifacts[0].kind).toBe("created");
	});

	it("preserves the AskUserQuestion optimistic answer payload", () => {
		const optimisticResult = {
			questions: [{ id: "q1", label: "?" }],
			answers: { q1: "yes" },
		};
		const toolMsg: Message = {
			id: "tool_call_1",
			role: "tool",
			content: "AskUserQuestion",
			timestamp: 1,
			type: "tool_use",
			toolCall: {
				id: "call_1",
				name: "AskUserQuestion",
				input: {},
				status: "awaiting_approval",
				approval: { kind: "ask-user-question" },
				result: optimisticResult,
			},
		};
		const { deps, spies } = makeDeps({}, [toolMsg]);

		// Main-process echo arrives with empty answers — must NOT overwrite.
		handleLegacyLLMStreamEvent(
			{
				requestId: "req_1",
				type: "tool_result",
				toolResult: {
					toolCallId: "call_1",
					name: "AskUserQuestion",
					result: { questions: [], answers: {} },
					isError: false,
				},
			},
			deps,
		);

		expect(spies.updateMessageToolCall).toHaveBeenCalledTimes(1);
		const patch = spies.updateMessageToolCall.mock.calls[0][1];
		expect(patch.status).toBe("success");
		// The `result` field must be absent from the patch (guard kicked in).
		expect("result" in patch).toBe(false);
	});
});

describe("handleLegacyLLMStreamEvent — tool_approval_request", () => {
	it("pauses the watchdog on approval requests", () => {
		const { deps, spies } = makeDeps();
		handleLegacyLLMStreamEvent(
			{
				requestId: "req_1",
				type: "tool_approval_request",
				toolApproval: {
					toolCallId: "call_1",
					name: "Read",
					arguments: "{}",
				},
			},
			deps,
		);
		expect(spies.pauseForApproval).toHaveBeenCalledOnce();
		expect(spies.updateMessageToolCall).toHaveBeenCalledWith("tool_call_1", {
			status: "awaiting_approval",
		});
	});

	it("stamps ask-user-question approval kind when the main process tags the event", () => {
		const { deps, spies } = makeDeps();
		handleLegacyLLMStreamEvent(
			{
				requestId: "req_1",
				type: "tool_approval_request",
				toolApproval: {
					toolCallId: "call_1",
					name: "AskUserQuestion",
					arguments: "{}",
					source: "ask-user-question",
				},
			},
			deps,
		);
		expect(spies.updateMessageToolCall).toHaveBeenCalledWith("tool_call_1", {
			status: "awaiting_approval",
			approval: { kind: "ask-user-question" },
		});
	});
});

describe("handleLegacyLLMStreamEvent — done", () => {
	it("finalizes stream, persists messages, and writes usage metadata", () => {
		const userMsg: Message = {
			id: "user_1",
			role: "user",
			content: "hi",
			timestamp: 1,
		};
		const assistantMsg: Message = {
			id: "asst_1",
			role: "assistant",
			content: "hello",
			timestamp: 2,
		};
		const { deps, spies } = makeDeps({}, [userMsg, assistantMsg]);

		handleLegacyLLMStreamEvent(
			{
				requestId: "req_1",
				type: "done",
				usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
				timing: { firstTokenMs: 100, totalMs: 2000 },
			},
			deps,
		);

		expect(spies.finalizeAssistantStreamContent).toHaveBeenCalledOnce();
		expect(spies.persistMessages).toHaveBeenCalledOnce();
		expect(spies.updateMessageMetadata).toHaveBeenCalledWith(
			"asst_1",
			expect.objectContaining({
				tokens: 30,
				inputTokens: 10,
				outputTokens: 20,
				duration: 2000,
				firstTokenMs: 100,
				tokensPerSecond: 10,
			}),
		);
		expect(spies.updateMessageMetadata).toHaveBeenCalledWith("user_1", {
			inputTokens: 10,
		});
		expect(spies.setSessionStatus).toHaveBeenCalledWith("idle");
		expect(spies.clearCurrentRequest).toHaveBeenCalledOnce();
		expect(spies.clearWatchdog).toHaveBeenCalledOnce();
	});
});

describe("handleLegacyLLMStreamEvent — error", () => {
	it("routes through materializeStreamError and clears the request", () => {
		const { deps, spies } = makeDeps();
		handleLegacyLLMStreamEvent(
			{
				requestId: "req_1",
				type: "error",
				error: "boom",
			},
			deps,
		);
		expect(spies.materializeStreamError).toHaveBeenCalledWith(
			"boom",
			undefined,
		);
		expect(spies.setSessionStatus).toHaveBeenCalledWith("idle");
		expect(spies.clearAssistantStreamContent).toHaveBeenCalledOnce();
		expect(spies.clearCurrentRequest).toHaveBeenCalledOnce();
		expect(spies.clearWatchdog).toHaveBeenCalledOnce();
	});
});
