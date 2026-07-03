import { describe, expect, it, vi } from "vitest";
import type { AgentSDKStreamEvent } from "@super-client/shared-types/agent-sdk";

vi.mock("../../services/logService", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}));

import {
	handleAgentSDKStreamEvent,
	type AgentSDKStreamHandlerDeps,
} from "../useAgentSDKStreamHandler";
import type { AgentEventReducerContext } from "../useAgentEventReducer";

function makeReducerContext(): AgentEventReducerContext {
	return {
		messages: [],
		sessionStatus: "streaming",
		streamContent: "",
		modelInfo: null,
		now: () => 1_000,
		makeId: (prefix) => `${prefix}_test`,
	};
}

function makeDeps(
	overrides: Partial<AgentSDKStreamHandlerDeps> = {},
): {
	deps: AgentSDKStreamHandlerDeps;
	spies: {
		kickWatchdog: ReturnType<typeof vi.fn>;
		applyActions: ReturnType<typeof vi.fn>;
		createReducerContext: ReturnType<typeof vi.fn>;
		subscribe: ReturnType<typeof vi.fn>;
	};
} {
	const spies = {
		kickWatchdog: vi.fn(),
		applyActions: vi.fn(),
		createReducerContext: vi.fn(() => makeReducerContext()),
		subscribe: vi.fn(() => () => {}),
	};
	const firstChunkLoggedRef = { current: false };
	const deps: AgentSDKStreamHandlerDeps = {
		getCurrentRequestId: () => "req_1",
		getRequestType: () => "agent-sdk",
		kickWatchdog: spies.kickWatchdog,
		applyActions: spies.applyActions,
		createReducerContext: spies.createReducerContext,
		firstChunkLoggedRef,
		subscribe: spies.subscribe,
		...overrides,
	};
	return { deps, spies };
}

describe("handleAgentSDKStreamEvent — gating", () => {
	it("ignores events when requestType is not 'agent-sdk'", () => {
		const { deps, spies } = makeDeps({
			getRequestType: () => "runtime",
		});
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "chunk",
			content: "hi",
		};
		handleAgentSDKStreamEvent(event, deps);
		expect(spies.kickWatchdog).not.toHaveBeenCalled();
		expect(spies.applyActions).not.toHaveBeenCalled();
	});

	it("ignores events whose requestId does not match the current one", () => {
		const { deps, spies } = makeDeps({
			getCurrentRequestId: () => "req_current",
		});
		const event: AgentSDKStreamEvent = {
			requestId: "req_other",
			type: "chunk",
			content: "hi",
		};
		handleAgentSDKStreamEvent(event, deps);
		expect(spies.kickWatchdog).not.toHaveBeenCalled();
		expect(spies.applyActions).not.toHaveBeenCalled();
	});
});

describe("handleAgentSDKStreamEvent — watchdog + dispatch", () => {
	it("kicks the watchdog on every accepted event", () => {
		const { deps, spies } = makeDeps();
		const events: AgentSDKStreamEvent[] = [
			{ requestId: "req_1", type: "init", sessionId: "s1" },
			{ requestId: "req_1", type: "chunk", content: "hi" },
			{ requestId: "req_1", type: "status", status: "thinking" },
		];
		for (const ev of events) handleAgentSDKStreamEvent(ev, deps);
		expect(spies.kickWatchdog).toHaveBeenCalledTimes(3);
	});

	it("routes an init event through applyActions(reduceAgentSDKStreamEvent)", () => {
		const { deps, spies } = makeDeps();
		handleAgentSDKStreamEvent(
			{
				requestId: "req_1",
				type: "init",
				sessionId: "sess_abc",
				status: "ready",
			},
			deps,
		);
		expect(spies.applyActions).toHaveBeenCalledTimes(1);
		const actions = spies.applyActions.mock.calls[0][0] as Array<{
			type: string;
		}>;
		// The reducer's init emits remember_session + set_session_status.
		expect(actions.some((a) => a.type === "remember_session")).toBe(true);
		expect(actions.some((a) => a.type === "set_session_status")).toBe(true);
	});

	it("routes an error event through applyActions(reduceAgentSDKStreamEvent)", () => {
		const { deps, spies } = makeDeps();
		handleAgentSDKStreamEvent(
			{
				requestId: "req_1",
				type: "error",
				error: "boom",
			},
			deps,
		);
		expect(spies.applyActions).toHaveBeenCalledTimes(1);
		const actions = spies.applyActions.mock.calls[0][0] as Array<{
			type: string;
		}>;
		// Error path produces materialize_error + terminal actions.
		expect(actions.some((a) => a.type === "materialize_error")).toBe(true);
		expect(actions.some((a) => a.type === "complete_request")).toBe(true);
	});
});
