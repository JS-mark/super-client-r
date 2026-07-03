import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

vi.mock("../../services/logService", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}));

import {
	handleAgentRuntimeStreamEvent,
	type AgentRuntimeStreamHandlerDeps,
} from "../useAgentRuntimeStreamHandler";
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
	overrides: Partial<AgentRuntimeStreamHandlerDeps> = {},
): {
	deps: AgentRuntimeStreamHandlerDeps;
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
	const deps: AgentRuntimeStreamHandlerDeps = {
		getCurrentRequestId: () => "req_1",
		getRequestType: () => "runtime",
		kickWatchdog: spies.kickWatchdog,
		applyActions: spies.applyActions,
		createReducerContext: spies.createReducerContext,
		firstChunkLoggedRef,
		subscribe: spies.subscribe,
		...overrides,
	};
	return { deps, spies };
}

describe("handleAgentRuntimeStreamEvent — gating", () => {
	it("ignores events when requestType is not 'runtime'", () => {
		const { deps, spies } = makeDeps({
			getRequestType: () => "agent-sdk",
		});
		const event: AgentRuntimeStreamEvent = {
			v: 1,
			runtime: "claude-code",
			requestId: "req_1",
			timestamp: 1,
			type: "text.delta",
			delta: "hi",
		} as AgentRuntimeStreamEvent;
		handleAgentRuntimeStreamEvent(event, deps);
		expect(spies.kickWatchdog).not.toHaveBeenCalled();
		expect(spies.applyActions).not.toHaveBeenCalled();
	});

	it("ignores events whose requestId does not match the current one", () => {
		const { deps, spies } = makeDeps({
			getCurrentRequestId: () => "req_current",
		});
		const event: AgentRuntimeStreamEvent = {
			v: 1,
			runtime: "claude-code",
			requestId: "req_other",
			timestamp: 1,
			type: "text.delta",
			delta: "hi",
		} as AgentRuntimeStreamEvent;
		handleAgentRuntimeStreamEvent(event, deps);
		expect(spies.kickWatchdog).not.toHaveBeenCalled();
		expect(spies.applyActions).not.toHaveBeenCalled();
	});
});

describe("handleAgentRuntimeStreamEvent — watchdog + dispatch", () => {
	it("kicks the watchdog on every accepted event", () => {
		const { deps, spies } = makeDeps();
		const events: AgentRuntimeStreamEvent[] = [
			{
				v: 1,
				runtime: "claude-code",
				requestId: "req_1",
				timestamp: 1,
				type: "init",
				nativeSessionId: "s1",
			} as AgentRuntimeStreamEvent,
			{
				v: 1,
				runtime: "claude-code",
				requestId: "req_1",
				timestamp: 2,
				type: "text.delta",
				delta: "hello",
			} as AgentRuntimeStreamEvent,
			{
				v: 1,
				runtime: "claude-code",
				requestId: "req_1",
				timestamp: 3,
				type: "error",
				code: "boom",
				message: "kaboom",
			} as AgentRuntimeStreamEvent,
		];
		for (const ev of events) handleAgentRuntimeStreamEvent(ev, deps);
		expect(spies.kickWatchdog).toHaveBeenCalledTimes(3);
		expect(spies.applyActions).toHaveBeenCalledTimes(3);
	});

	it("routes each accepted event through applyActions(reduceAgentRuntimeStreamEvent)", () => {
		const { deps, spies } = makeDeps();
		const event: AgentRuntimeStreamEvent = {
			v: 1,
			runtime: "claude-code",
			requestId: "req_1",
			timestamp: 1,
			type: "init",
			nativeSessionId: "session_abc",
		} as AgentRuntimeStreamEvent;
		handleAgentRuntimeStreamEvent(event, deps);

		expect(spies.applyActions).toHaveBeenCalledTimes(1);
		const actions = spies.applyActions.mock.calls[0][0] as Array<{
			type: string;
		}>;
		// The reducer's init handler emits `remember_session` +
		// `set_session_status`.
		expect(actions.some((a) => a.type === "remember_session")).toBe(true);
		expect(
			actions.some(
				(a) =>
					a.type === "set_session_status" &&
					(a as unknown as { status: string }).status === "streaming",
			),
		).toBe(true);
	});
});
