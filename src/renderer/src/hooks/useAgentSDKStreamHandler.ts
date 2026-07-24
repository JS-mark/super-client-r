/**
 * useAgentSDKStreamHandler — subscribes to the Agent SDK stream channel
 * (`agentSDKClient.onStreamEvent`) and materialises events via the
 * reducer/dispatcher pipeline.
 *
 * Extracted from `useChat.ts` (Phase 0b hook slim-down). Preserves the
 * following invariants from the previous inline effect:
 *   - Request-id gate + `getRequestType() === "agent-sdk"` gate at the top.
 *   - `kickWatchdog()` on every accepted event.
 *   - Structured logging (`init`, first chunk latch, `tool_call`,
 *     `permission_request`, `result`, `error`, `status`) survives.
 *   - Every SDK event is forwarded through
 *     `applyActions(reduceAgentSDKStreamEvent(event, ctx))`.
 *
 * Pure per-event helper is exported for tests.
 */
import { useEffect, useRef } from "react";
import type { AgentSDKStreamEvent } from "@super-client/shared-types/agent-sdk";
import { createLogger } from "../services/logService";
import type { AgentRunRequestType } from "./useAgentRunController";
import {
	reduceAgentSDKStreamEvent,
	type AgentEventReducerAction,
	type AgentEventReducerContext,
} from "./useAgentEventReducer";

const agentLog = createLogger("ChatAgent");

export interface AgentSDKStreamHandlerDeps {
	getCurrentRequestId: () => string | null;
	getRequestType: () => AgentRunRequestType | null;
	kickWatchdog: () => void;
	applyActions: (actions: AgentEventReducerAction[]) => void;
	createReducerContext: () => AgentEventReducerContext;
	firstChunkLoggedRef: { current: boolean };
	subscribe: (
		callback: (event: AgentSDKStreamEvent) => void,
	) => () => void;
}

export function handleAgentSDKStreamEvent(
	event: AgentSDKStreamEvent,
	deps: AgentSDKStreamHandlerDeps,
): void {
	if (event.requestId !== deps.getCurrentRequestId()) return;
	if (deps.getRequestType() !== "agent-sdk") return;

	deps.kickWatchdog();

	switch (event.type) {
		case "init":
			agentLog.info("Agent SDK init event", {
				requestId: event.requestId,
				sessionId: event.sessionId,
				status: event.status,
			});
			break;

		case "chunk":
			if (event.content && !deps.firstChunkLoggedRef.current) {
				deps.firstChunkLoggedRef.current = true;
				agentLog.info("Agent SDK first chunk received", {
					requestId: event.requestId,
					chunkLength: event.content.length,
				});
			}
			break;

		case "tool_call":
			if (event.toolCall) {
				agentLog.info("Agent SDK tool_call event", {
					requestId: event.requestId,
					toolUseId: event.toolCall.id,
					name: event.toolCall.name,
					kind: event.toolCall.kind,
				});
			} else {
				return;
			}
			break;

		case "tool_error":
			if (!event.toolError) return;
			break;

		case "permission_request":
			if (!event.permissionRequest) return;
			agentLog.info("Agent SDK permission_request event", {
				requestId: event.requestId,
				toolUseId: event.permissionRequest.toolUseId,
				toolName: event.permissionRequest.toolName,
			});
			break;

		case "permission_denied":
			if (!event.toolCall) return;
			break;

		case "result":
			agentLog.info("Agent SDK result event", {
				requestId: event.requestId,
				success: event.result?.success,
				textLength: event.result?.text?.length ?? 0,
				numTurns: event.result?.numTurns,
				stopReason: event.result?.stopReason,
			});
			break;

		case "error":
			agentLog.error("Agent SDK error event", undefined, {
				requestId: event.requestId,
				error: event.error || "Agent execution failed",
				...(event.errorContext ? { errorContext: event.errorContext } : {}),
			});
			break;

		case "status":
			agentLog.info("Agent SDK status event", {
				requestId: event.requestId,
				status: event.status,
			});
			break;

		// Other cases (assistant_part, assistant, tool_use_summary, rate_limit)
		// pass through with no dedicated logging.
		default:
			break;
	}

	deps.applyActions(
		reduceAgentSDKStreamEvent(event, deps.createReducerContext()),
	);
}

export function useAgentSDKStreamHandler(
	deps: AgentSDKStreamHandlerDeps,
): void {
	const depsRef = useRef(deps);
	depsRef.current = deps;

	const subscribe = deps.subscribe;

	useEffect(() => {
		const unsubscribe = subscribe((event) => {
			handleAgentSDKStreamEvent(event, depsRef.current);
		});
		return unsubscribe;
	}, [subscribe]);
}
