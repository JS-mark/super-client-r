/**
 * useAgentRuntimeStreamHandler — subscribes to the Agent Runtime stream
 * channel (`agentRuntimeClient.onStreamEvent`) and materialises events via
 * the reducer/dispatcher pipeline.
 *
 * Extracted from `useChat.ts` (Phase 0b hook slim-down). Preserves the
 * following invariants from the previous inline effect:
 *   - Request-id gate (`event.requestId !== getCurrentRequestId()`)
 *     bails at the top.
 *   - Request-type gate (`getRequestType() !== "runtime"`) bails at the top.
 *   - `kickWatchdog()` on every accepted event.
 *   - `applyActions(reduceAgentRuntimeStreamEvent(event, ctx))` handles all
 *     state mutation via the dispatcher — no direct store writes here.
 *   - Structured logging (`init`, `text.delta` first chunk, `tool.call`,
 *     `error`) survives the extraction.
 *
 * Pure per-event helper is exported for tests.
 */
import { useEffect, useRef } from "react";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";
import { createLogger } from "../services/logService";
import type { AgentRunRequestType } from "./useAgentRunController";
import {
	reduceAgentRuntimeStreamEvent,
	type AgentEventReducerAction,
	type AgentEventReducerContext,
} from "./useAgentEventReducer";

const agentLog = createLogger("ChatAgent");

export interface AgentRuntimeStreamHandlerDeps {
	getCurrentRequestId: () => string | null;
	getRequestType: () => AgentRunRequestType | null;
	kickWatchdog: () => void;
	applyActions: (actions: AgentEventReducerAction[]) => void;
	createReducerContext: () => AgentEventReducerContext;
	/**
	 * Mutable flag toggled by the SDK/Runtime handlers when the first
	 * text delta of a run is observed. Extracted as a ref-shaped input so
	 * multiple handlers can share the same "first chunk" latch.
	 */
	firstChunkLoggedRef: { current: boolean };
	subscribe: (
		callback: (event: AgentRuntimeStreamEvent) => void,
	) => () => void;
}

export function handleAgentRuntimeStreamEvent(
	event: AgentRuntimeStreamEvent,
	deps: AgentRuntimeStreamHandlerDeps,
): void {
	if (event.requestId !== deps.getCurrentRequestId()) return;
	if (deps.getRequestType() !== "runtime") return;

	deps.kickWatchdog();

	if (event.type === "init") {
		agentLog.info("Agent runtime init event", {
			requestId: event.requestId,
			runtime: event.runtime,
			nativeSessionId: event.nativeSessionId,
		});
	} else if (event.type === "text.delta" && event.delta) {
		if (!deps.firstChunkLoggedRef.current) {
			deps.firstChunkLoggedRef.current = true;
			agentLog.info("Agent runtime first chunk received", {
				requestId: event.requestId,
				runtime: event.runtime,
				chunkLength: event.delta.length,
			});
		}
	} else if (event.type === "tool.call") {
		agentLog.info("Agent runtime tool.call event", {
			requestId: event.requestId,
			runtime: event.runtime,
			callId: event.callId,
			name: event.toolName,
		});
	} else if (event.type === "error") {
		agentLog.error("Agent runtime error event", undefined, {
			requestId: event.requestId,
			runtime: event.runtime,
			code: event.code,
			message: event.message,
		});
	}

	deps.applyActions(
		reduceAgentRuntimeStreamEvent(event, deps.createReducerContext()),
	);
}

export function useAgentRuntimeStreamHandler(
	deps: AgentRuntimeStreamHandlerDeps,
): void {
	const depsRef = useRef(deps);
	depsRef.current = deps;

	const subscribe = deps.subscribe;

	useEffect(() => {
		const unsubscribe = subscribe((event) => {
			handleAgentRuntimeStreamEvent(event, depsRef.current);
		});
		return unsubscribe;
	}, [subscribe]);
}
