import { describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import {
	stopAgentRun,
	type AgentRunStopperInterrupters,
	type AgentRunStopperMessageApi,
} from "../useAgentRunStopper";
import type {
	AgentRunRequestSnapshot,
	AgentRunRequestType,
} from "../useAgentRunController";

function ref<T>(current: T): MutableRefObject<T> {
	return { current };
}

function makeStreamBufferStub(initial = "") {
	const state = { current: initial };
	const clear = vi.fn<() => void>(() => {
		state.current = "";
	});
	return {
		getRef: (): { current: string } => state,
		clear,
		set(content: string) {
			state.current = content;
		},
	};
}

function makeMessageStoreStub() {
	const updateLastMessage = vi.fn<(content: string) => void>();
	const setStreamingContent = vi.fn<(content: string) => void>();
	const setSessionStatus = vi.fn<(status: "idle") => void>();
	const persistMessages = vi.fn<() => void>();
	const api: AgentRunStopperMessageApi = {
		updateLastMessage,
		setStreamingContent,
		setSessionStatus,
		persistMessages,
	};
	return Object.assign(api, {
		updateLastMessage,
		setStreamingContent,
		setSessionStatus,
		persistMessages,
	});
}

function makeInterrupters() {
	const runtimeInterrupt = vi
		.fn<(requestId: string) => Promise<unknown>>()
		.mockResolvedValue(true);
	const agentSDKInterrupt = vi
		.fn<(requestId: string) => Promise<unknown>>()
		.mockResolvedValue(true);
	const legacyStopStream = vi
		.fn<(requestId: string) => unknown>()
		.mockReturnValue(undefined);
	const api: AgentRunStopperInterrupters = {
		runtimeInterrupt,
		agentSDKInterrupt,
		legacyStopStream,
	};
	return Object.assign(api, {
		runtimeInterrupt,
		agentSDKInterrupt,
		legacyStopStream,
	});
}

function makeSnapshot(
	requestId: string | null,
	requestType: AgentRunRequestType | null,
): AgentRunRequestSnapshot {
	return {
		requestId,
		requestType,
		wasAgentSDKRequest: requestType === "agent-sdk",
		wasRuntimeRequest: requestType === "runtime",
	};
}

describe("stopAgentRun", () => {
	it("dispatches runtime interrupt for runtime requests and clears refs before the call", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>("runtime");
		const clearOrder: string[] = [];
		const snapshotAndClearCurrentRequest = vi.fn(() => {
			clearOrder.push("snapshot");
			requestTypeRef.current = null;
			return makeSnapshot("req_1", "runtime");
		});
		const interrupters = makeInterrupters();
		interrupters.runtimeInterrupt = vi.fn(async (reqId: string) => {
			clearOrder.push(`runtime:${reqId}`);
		});
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub("partial");
		const clearWatchdog = vi.fn();

		stopAgentRun({
			refs: {
				requestTypeRef,
				snapshotAndClearCurrentRequest,
			},
			streamBuffer,
			interrupters,
			messageStoreApi,
			clearWatchdog,
			getCurrentConversationId: () => "conv_1",
		});

		expect(snapshotAndClearCurrentRequest).toHaveBeenCalledOnce();
		expect(interrupters.runtimeInterrupt).toHaveBeenCalledWith("req_1");
		expect(interrupters.agentSDKInterrupt).not.toHaveBeenCalled();
		expect(interrupters.legacyStopStream).not.toHaveBeenCalled();
		// snapshot happens BEFORE interrupt so late stream events bail.
		expect(clearOrder).toEqual(["snapshot", "runtime:req_1"]);
	});

	it("dispatches agent-sdk interrupt for agent-sdk requests", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>("agent-sdk");
		const snapshotAndClearCurrentRequest = vi.fn(() =>
			makeSnapshot("req_2", "agent-sdk"),
		);
		const interrupters = makeInterrupters();
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub();

		stopAgentRun({
			refs: { requestTypeRef, snapshotAndClearCurrentRequest },
			streamBuffer,
			interrupters,
			messageStoreApi,
			clearWatchdog: vi.fn(),
			getCurrentConversationId: () => null,
		});

		expect(interrupters.agentSDKInterrupt).toHaveBeenCalledWith("req_2");
		expect(interrupters.runtimeInterrupt).not.toHaveBeenCalled();
		expect(interrupters.legacyStopStream).not.toHaveBeenCalled();
	});

	it("dispatches legacy stopStream for legacy requests", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>("legacy");
		const snapshotAndClearCurrentRequest = vi.fn(() =>
			makeSnapshot("req_3", "legacy"),
		);
		const interrupters = makeInterrupters();
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub();

		stopAgentRun({
			refs: { requestTypeRef, snapshotAndClearCurrentRequest },
			streamBuffer,
			interrupters,
			messageStoreApi,
			clearWatchdog: vi.fn(),
			getCurrentConversationId: () => null,
		});

		expect(interrupters.legacyStopStream).toHaveBeenCalledWith("req_3");
		expect(interrupters.runtimeInterrupt).not.toHaveBeenCalled();
		expect(interrupters.agentSDKInterrupt).not.toHaveBeenCalled();
	});

	it("swallows interrupt errors without blocking UI reset", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>("runtime");
		const snapshotAndClearCurrentRequest = vi.fn(() =>
			makeSnapshot("req_4", "runtime"),
		);
		const interrupters = makeInterrupters();
		interrupters.runtimeInterrupt = vi.fn(() =>
			Promise.reject(new Error("boom")),
		);
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub("half");
		const clearWatchdog = vi.fn();
		const logError = vi.fn();

		expect(() =>
			stopAgentRun({
				refs: { requestTypeRef, snapshotAndClearCurrentRequest },
				streamBuffer,
				interrupters,
				messageStoreApi,
				clearWatchdog,
				getCurrentConversationId: () => "conv_x",
				logError,
			}),
		).not.toThrow();

		// UI reset still ran.
		expect(messageStoreApi.setSessionStatus).toHaveBeenCalledWith("idle");
		expect(streamBuffer.clear).toHaveBeenCalledOnce();
		expect(clearWatchdog).toHaveBeenCalledOnce();
	});

	it("swallows synchronous throws from the legacy stopStream path", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>("legacy");
		const snapshotAndClearCurrentRequest = vi.fn(() =>
			makeSnapshot("req_5", "legacy"),
		);
		const interrupters = makeInterrupters();
		interrupters.legacyStopStream = vi.fn(() => {
			throw new Error("sync boom");
		});
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub("tail");
		const logError = vi.fn();

		expect(() =>
			stopAgentRun({
				refs: { requestTypeRef, snapshotAndClearCurrentRequest },
				streamBuffer,
				interrupters,
				messageStoreApi,
				clearWatchdog: vi.fn(),
				getCurrentConversationId: () => "conv",
				logError,
			}),
		).not.toThrow();

		expect(logError).toHaveBeenCalled();
		expect(messageStoreApi.setSessionStatus).toHaveBeenCalledWith("idle");
	});

	it("commits pending stream content via updateLastMessage before clearing the buffer", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>("runtime");
		const snapshotAndClearCurrentRequest = vi.fn(() =>
			makeSnapshot("req_6", "runtime"),
		);
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub("hello streaming tail");

		const callOrder: string[] = [];
		messageStoreApi.updateLastMessage = vi.fn((content: string) => {
			callOrder.push(`updateLast:${content}`);
		});
		streamBuffer.clear = vi.fn(() => {
			callOrder.push("clear");
		});
		messageStoreApi.setSessionStatus = vi.fn(() => {
			callOrder.push("idle");
		});

		stopAgentRun({
			refs: { requestTypeRef, snapshotAndClearCurrentRequest },
			streamBuffer,
			interrupters: makeInterrupters(),
			messageStoreApi,
			clearWatchdog: vi.fn(),
			getCurrentConversationId: () => "conv",
		});

		expect(callOrder).toEqual([
			"updateLast:hello streaming tail",
			"clear",
			"idle",
		]);
	});

	it("skips updateLastMessage when buffer is empty but still resets UI", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>("runtime");
		const snapshotAndClearCurrentRequest = vi.fn(() =>
			makeSnapshot("req_7", "runtime"),
		);
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub("");

		stopAgentRun({
			refs: { requestTypeRef, snapshotAndClearCurrentRequest },
			streamBuffer,
			interrupters: makeInterrupters(),
			messageStoreApi,
			clearWatchdog: vi.fn(),
			getCurrentConversationId: () => "conv",
		});

		expect(messageStoreApi.updateLastMessage).not.toHaveBeenCalled();
		expect(streamBuffer.clear).toHaveBeenCalledOnce();
		expect(messageStoreApi.setSessionStatus).toHaveBeenCalledWith("idle");
	});

	it("persists messages when a conversation is active, skips when none", () => {
		const base = () => ({
			requestTypeRef: ref<AgentRunRequestType | null>("runtime"),
			snapshotAndClearCurrentRequest: vi.fn(() =>
				makeSnapshot("req_8", "runtime"),
			),
			interrupters: makeInterrupters(),
			streamBuffer: makeStreamBufferStub(),
			clearWatchdog: vi.fn(),
		});

		const withConv = base();
		const msWithConv = makeMessageStoreStub();
		stopAgentRun({
			refs: {
				requestTypeRef: withConv.requestTypeRef,
				snapshotAndClearCurrentRequest: withConv.snapshotAndClearCurrentRequest,
			},
			streamBuffer: withConv.streamBuffer,
			interrupters: withConv.interrupters,
			messageStoreApi: msWithConv,
			clearWatchdog: withConv.clearWatchdog,
			getCurrentConversationId: () => "conv_a",
		});
		expect(msWithConv.persistMessages).toHaveBeenCalledOnce();

		const withoutConv = base();
		const msWithoutConv = makeMessageStoreStub();
		stopAgentRun({
			refs: {
				requestTypeRef: withoutConv.requestTypeRef,
				snapshotAndClearCurrentRequest:
					withoutConv.snapshotAndClearCurrentRequest,
			},
			streamBuffer: withoutConv.streamBuffer,
			interrupters: withoutConv.interrupters,
			messageStoreApi: msWithoutConv,
			clearWatchdog: withoutConv.clearWatchdog,
			getCurrentConversationId: () => null,
		});
		expect(msWithoutConv.persistMessages).not.toHaveBeenCalled();
	});

	it("skips the interrupt call entirely when no request id was captured", () => {
		const requestTypeRef = ref<AgentRunRequestType | null>(null);
		const snapshotAndClearCurrentRequest = vi.fn(() =>
			makeSnapshot(null, null),
		);
		const interrupters = makeInterrupters();
		const messageStoreApi = makeMessageStoreStub();
		const streamBuffer = makeStreamBufferStub();

		stopAgentRun({
			refs: { requestTypeRef, snapshotAndClearCurrentRequest },
			streamBuffer,
			interrupters,
			messageStoreApi,
			clearWatchdog: vi.fn(),
			getCurrentConversationId: () => null,
		});

		expect(interrupters.runtimeInterrupt).not.toHaveBeenCalled();
		expect(interrupters.agentSDKInterrupt).not.toHaveBeenCalled();
		expect(interrupters.legacyStopStream).not.toHaveBeenCalled();
		expect(messageStoreApi.setSessionStatus).toHaveBeenCalledWith("idle");
	});
});
