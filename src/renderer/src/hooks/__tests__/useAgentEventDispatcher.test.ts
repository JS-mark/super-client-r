import { describe, expect, it, vi } from "vitest";
import type { Message } from "@super-client/shared-types/chat";
import {
	applyAgentEventActions,
	type AgentEventDispatcherDeps,
} from "../useAgentEventDispatcher";
import type { AgentEventReducerAction } from "../useAgentEventReducer";

function makeDeps(overrides: Partial<AgentEventDispatcherDeps> = {}): {
	deps: AgentEventDispatcherDeps;
	spies: {
		runController: {
			setAgentSDKSessionId: ReturnType<typeof vi.fn>;
			setAgentRuntimeSessionId: ReturnType<typeof vi.fn>;
			pauseForApproval: ReturnType<typeof vi.fn>;
			clearCurrentRequest: ReturnType<typeof vi.fn>;
			clearWatchdog: ReturnType<typeof vi.fn>;
		};
		streamBuffer: {
			append: ReturnType<typeof vi.fn>;
			finalize: ReturnType<typeof vi.fn>;
			clear: ReturnType<typeof vi.fn>;
		};
		messageStore: {
			setSessionStatus: ReturnType<typeof vi.fn>;
			setStreamingContent: ReturnType<typeof vi.fn>;
			addMessage: ReturnType<typeof vi.fn>;
			updateMessageToolCall: ReturnType<typeof vi.fn>;
			updateMessageMetadata: ReturnType<typeof vi.fn>;
			applyAssistantPartEvent: ReturnType<typeof vi.fn>;
		};
		upsertToolMessage: ReturnType<typeof vi.fn>;
		updateLastAssistantContent: ReturnType<typeof vi.fn>;
		materializeStreamError: ReturnType<typeof vi.fn>;
		persistMessages: ReturnType<typeof vi.fn>;
		sessionsUpdateMeta: ReturnType<typeof vi.fn>;
		showRateLimit: ReturnType<typeof vi.fn>;
	};
} {
	const runController = {
		setAgentSDKSessionId: vi.fn(),
		setAgentRuntimeSessionId: vi.fn(),
		pauseForApproval: vi.fn(),
		clearCurrentRequest: vi.fn(),
		clearWatchdog: vi.fn(),
	};
	const streamBuffer = {
		append: vi.fn(),
		finalize: vi.fn(),
		clear: vi.fn(),
	};
	const messageStore = {
		setSessionStatus: vi.fn(),
		setStreamingContent: vi.fn(),
		addMessage: vi.fn(),
		updateMessageToolCall: vi.fn(),
		updateMessageMetadata: vi.fn(),
		applyAssistantPartEvent: vi.fn(),
	};
	const upsertToolMessage = vi.fn();
	const updateLastAssistantContent = vi.fn();
	const materializeStreamError = vi.fn();
	const persistMessages = vi.fn();
	const sessionsUpdateMeta = vi.fn().mockResolvedValue(undefined);
	const showRateLimit = vi.fn();
	let currentConversationId: string | null = "conv_1";
	const getCurrentConversationId = (): string | null => currentConversationId;
	const setConv = (id: string | null): void => {
		currentConversationId = id;
	};

	const deps: AgentEventDispatcherDeps = {
		runController,
		streamBuffer,
		messageStore,
		upsertToolMessage,
		updateLastAssistantContent,
		materializeStreamError,
		getCurrentConversationId,
		persistMessages,
		sessionsApi: { updateMeta: sessionsUpdateMeta },
		showRateLimit,
		...overrides,
	};

	return {
		deps: Object.assign(deps, { __setConv: setConv }) as AgentEventDispatcherDeps & {
			__setConv: typeof setConv;
		},
		spies: {
			runController,
			streamBuffer,
			messageStore,
			upsertToolMessage,
			updateLastAssistantContent,
			materializeStreamError,
			persistMessages,
			sessionsUpdateMeta,
			showRateLimit,
		},
	};
}

describe("applyAgentEventActions", () => {
	it("remember_session (agent-sdk) writes agentSDKSessionId via sessions.updateMeta", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[
				{
					type: "remember_session",
					sessionId: "sdk_sess",
					target: "agent-sdk",
				},
			],
			deps,
		);
		expect(spies.runController.setAgentSDKSessionId).toHaveBeenCalledWith(
			"sdk_sess",
		);
		expect(spies.sessionsUpdateMeta).toHaveBeenCalledWith("conv_1", {
			agentSDKSessionId: "sdk_sess",
		});
		expect(spies.runController.setAgentRuntimeSessionId).not.toHaveBeenCalled();
	});

	it("remember_session (runtime) writes nativeSessionId via sessions.updateMeta", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[
				{
					type: "remember_session",
					sessionId: "native_sess",
					target: "runtime",
				},
			],
			deps,
		);
		expect(spies.runController.setAgentRuntimeSessionId).toHaveBeenCalledWith(
			"native_sess",
		);
		expect(spies.sessionsUpdateMeta).toHaveBeenCalledWith("conv_1", {
			nativeSessionId: "native_sess",
		});
		expect(spies.runController.setAgentSDKSessionId).not.toHaveBeenCalled();
	});

	it("remember_session skips sessions.updateMeta when no conversation is focused", () => {
		const { deps, spies } = makeDeps({
			getCurrentConversationId: () => null,
		});
		applyAgentEventActions(
			[
				{
					type: "remember_session",
					sessionId: "s",
					target: "agent-sdk",
				},
			],
			deps,
		);
		expect(spies.runController.setAgentSDKSessionId).toHaveBeenCalledWith("s");
		expect(spies.sessionsUpdateMeta).not.toHaveBeenCalled();
	});

	it("remember_session swallows sessions.updateMeta rejections", async () => {
		const rejecting = vi.fn().mockRejectedValue(new Error("ipc down"));
		const { deps } = makeDeps({
			sessionsApi: { updateMeta: rejecting },
		});
		expect(() =>
			applyAgentEventActions(
				[
					{
						type: "remember_session",
						sessionId: "s",
						target: "runtime",
					},
				],
				deps,
			),
		).not.toThrow();
		// Give the microtask queue a chance to schedule the .catch.
		await Promise.resolve();
	});

	it("persist_messages calls injected persistMessages when a conversation is active", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions([{ type: "persist_messages" }], deps);
		expect(spies.persistMessages).toHaveBeenCalledOnce();
	});

	it("persist_messages is a no-op when no conversation is focused", () => {
		const { deps, spies } = makeDeps({
			getCurrentConversationId: () => null,
		});
		applyAgentEventActions([{ type: "persist_messages" }], deps);
		expect(spies.persistMessages).not.toHaveBeenCalled();
	});

	it("complete_request clears both the request and the watchdog, in order", () => {
		const { deps, spies } = makeDeps();
		const order: string[] = [];
		spies.runController.clearCurrentRequest.mockImplementation(() =>
			order.push("clearCurrentRequest"),
		);
		spies.runController.clearWatchdog.mockImplementation(() =>
			order.push("clearWatchdog"),
		);
		applyAgentEventActions([{ type: "complete_request" }], deps);
		expect(order).toEqual(["clearCurrentRequest", "clearWatchdog"]);
	});

	it("add_message dispatches to messageStore.addMessage", () => {
		const { deps, spies } = makeDeps();
		const msg: Message = {
			id: "m1",
			role: "assistant",
			content: "hi",
			timestamp: 1,
		};
		applyAgentEventActions([{ type: "add_message", message: msg }], deps);
		expect(spies.messageStore.addMessage).toHaveBeenCalledWith(msg);
	});

	it("update_last_message routes through updateLastAssistantContent", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[{ type: "update_last_message", content: "final text" }],
			deps,
		);
		expect(spies.updateLastAssistantContent).toHaveBeenCalledWith("final text");
	});

	it("set_streaming_content writes through messageStore.setStreamingContent", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[{ type: "set_streaming_content", content: "status" }],
			deps,
		);
		expect(spies.messageStore.setStreamingContent).toHaveBeenCalledWith("status");
	});

	it("append_assistant_chunk / finalize_assistant_stream / clear_assistant_stream target the stream buffer", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[
				{ type: "append_assistant_chunk", content: "hello" },
				{ type: "finalize_assistant_stream" },
				{ type: "clear_assistant_stream" },
			],
			deps,
		);
		expect(spies.streamBuffer.append).toHaveBeenCalledWith("hello");
		expect(spies.streamBuffer.finalize).toHaveBeenCalledOnce();
		expect(spies.streamBuffer.clear).toHaveBeenCalledOnce();
	});

	it("upsert_tool_message delegates to the injected upsert helper", () => {
		const { deps, spies } = makeDeps();
		const action: AgentEventReducerAction = {
			type: "upsert_tool_message",
			toolUseId: "call_1",
			toolCall: { name: "Read", input: { path: "x" }, status: "pending" },
			content: "Reading x",
		};
		applyAgentEventActions([action], deps);
		expect(spies.upsertToolMessage).toHaveBeenCalledWith(
			"call_1",
			{ name: "Read", input: { path: "x" }, status: "pending" },
			"Reading x",
		);
	});

	it("update_tool_call routes to messageStore.updateMessageToolCall", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[
				{
					type: "update_tool_call",
					messageId: "tool_call_1",
					patch: { status: "success", result: "ok" },
				},
			],
			deps,
		);
		expect(spies.messageStore.updateMessageToolCall).toHaveBeenCalledWith(
			"tool_call_1",
			{ status: "success", result: "ok" },
		);
	});

	it("update_message_metadata routes to messageStore.updateMessageMetadata", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[
				{
					type: "update_message_metadata",
					messageId: "m1",
					metadata: { model: "gpt-x" },
				},
			],
			deps,
		);
		expect(spies.messageStore.updateMessageMetadata).toHaveBeenCalledWith(
			"m1",
			{ model: "gpt-x" },
		);
	});

	it("apply_assistant_part forwards to messageStore.applyAssistantPartEvent", () => {
		const { deps, spies } = makeDeps();
		const partEvent = { kind: "text.start" } as never;
		applyAgentEventActions(
			[
				{
					type: "apply_assistant_part",
					messageId: "m1",
					event: partEvent,
				},
			],
			deps,
		);
		expect(spies.messageStore.applyAssistantPartEvent).toHaveBeenCalledWith(
			"m1",
			partEvent,
		);
	});

	it("materialize_error passes through summary + errorContext", () => {
		const { deps, spies } = makeDeps();
		const errorContext = { preset: "anthropic" } as never;
		applyAgentEventActions(
			[
				{
					type: "materialize_error",
					summary: "boom",
					errorContext,
				},
			],
			deps,
		);
		expect(spies.materializeStreamError).toHaveBeenCalledWith("boom", errorContext);
	});

	it("pause_for_approval hits the run controller", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions([{ type: "pause_for_approval" }], deps);
		expect(spies.runController.pauseForApproval).toHaveBeenCalledOnce();
	});

	it("rate_limit surfaces the message via showRateLimit", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[{ type: "rate_limit", message: "slow down" }],
			deps,
		);
		expect(spies.showRateLimit).toHaveBeenCalledWith("slow down");
	});

	it("set_session_status writes through messageStore.setSessionStatus", () => {
		const { deps, spies } = makeDeps();
		applyAgentEventActions(
			[{ type: "set_session_status", status: "idle" }],
			deps,
		);
		expect(spies.messageStore.setSessionStatus).toHaveBeenCalledWith("idle");
	});

	it("processes a mixed batch in order without dropping actions", () => {
		const { deps, spies } = makeDeps();
		const order: string[] = [];
		spies.messageStore.setSessionStatus.mockImplementation((s: string) =>
			order.push(`status:${s}`),
		);
		spies.streamBuffer.finalize.mockImplementation(() => order.push("finalize"));
		spies.persistMessages.mockImplementation(() => order.push("persist"));
		spies.runController.clearCurrentRequest.mockImplementation(() =>
			order.push("clearReq"),
		);
		spies.runController.clearWatchdog.mockImplementation(() =>
			order.push("clearWD"),
		);

		applyAgentEventActions(
			[
				{ type: "finalize_assistant_stream" },
				{ type: "persist_messages" },
				{ type: "set_session_status", status: "idle" },
				{ type: "complete_request" },
			],
			deps,
		);

		expect(order).toEqual([
			"finalize",
			"persist",
			"status:idle",
			"clearReq",
			"clearWD",
		]);
	});
});
