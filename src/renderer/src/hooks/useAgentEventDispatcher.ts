/**
 * useAgentEventDispatcher — applies the pure `AgentEventReducerAction[]`
 * output of `reduceAgentSDKStreamEvent` / `reduceAgentRuntimeStreamEvent`
 * against the concrete side-effect surface (message store, run controller,
 * stream buffer, ipc).
 *
 * Extracted from `useChat.ts` (Phase 0b hook slim-down). Previously an
 * inline `useCallback` (~120 lines) walking the action `switch`.
 *
 * Behavior invariants preserved verbatim:
 *   - `remember_session` writes the session id back to `useChatStore`'s
 *     conversation metadata via `sessions.updateMeta`. For `agent-sdk`
 *     target it stores `agentSDKSessionId`; for `runtime` it stores
 *     `nativeSessionId`. Failures are swallowed.
 *   - `persist_messages` only runs when a conversation is focused
 *     (`getCurrentConversationId()` returns a non-null id).
 *   - `complete_request` calls `clearCurrentRequest` FOLLOWED BY
 *     `clearWatchdog` (order matters — same as the original inline impl).
 *   - `add_message`, `update_last_message`, `set_streaming_content`,
 *     `append_assistant_chunk`, `finalize_assistant_stream`,
 *     `clear_assistant_stream` route through the correct side-effect target
 *     (stream buffer vs message store).
 */
import { useCallback, useMemo, useRef } from "react";
import type {
	AssistantPartEvent,
	ChatSessionStatus,
	LLMErrorContext,
	Message,
	ToolCall,
} from "@super-client/shared-types/chat";
import type { AgentEventReducerAction } from "./useAgentEventReducer";
import type { AssistantStreamBufferHandle } from "./useAssistantStreamBuffer";

export interface AgentEventDispatcherRunController {
	setAgentSDKSessionId: (sessionId: string | null) => void;
	setAgentRuntimeSessionId: (sessionId: string | null) => void;
	pauseForApproval: () => void;
	clearCurrentRequest: () => void;
	clearWatchdog: () => void;
}

export interface AgentEventDispatcherStreamBuffer
	extends Pick<
		AssistantStreamBufferHandle,
		"append" | "finalize" | "clear"
	> {}

export interface AgentEventDispatcherMessageStore {
	setSessionStatus: (status: ChatSessionStatus) => void;
	setStreamingContent: (content: string) => void;
	addMessage: (message: Message) => void;
	updateMessageToolCall: (id: string, patch: Partial<ToolCall>) => void;
	updateMessageMetadata: (
		id: string,
		metadata: Partial<NonNullable<Message["metadata"]>>,
	) => void;
	applyAssistantPartEvent: (id: string, event: AssistantPartEvent) => void;
}

export interface AgentEventDispatcherSessionsApi {
	updateMeta: (
		conversationId: string,
		meta: { agentSDKSessionId?: string; nativeSessionId?: string },
	) => Promise<unknown>;
}

export interface AgentEventDispatcherDeps {
	runController: AgentEventDispatcherRunController;
	streamBuffer: AgentEventDispatcherStreamBuffer;
	messageStore: AgentEventDispatcherMessageStore;
	/** Upserts a `tool_${toolUseId}` message; delegates to useChat helper. */
	upsertToolMessage: (
		toolUseId: string,
		toolCall: Partial<ToolCall> & Pick<ToolCall, "name" | "input">,
		content?: string,
	) => void;
	/** Committed-only variant of updateLastMessage that targets the last assistant. */
	updateLastAssistantContent: (content: string) => void;
	materializeStreamError: (
		summary: string,
		errorContext?: LLMErrorContext,
	) => void;
	getCurrentConversationId: () => string | null;
	persistMessages: () => void;
	sessionsApi: AgentEventDispatcherSessionsApi;
	showRateLimit: (message: string) => void;
}

/**
 * Pure applier. Given a batch of reducer actions and a wired-up deps bag,
 * dispatch each side-effect. Returned void — actions are inherently
 * imperative.
 */
export function applyAgentEventActions(
	actions: AgentEventReducerAction[],
	deps: AgentEventDispatcherDeps,
): void {
	for (const action of actions) {
		switch (action.type) {
			case "set_session_status":
				deps.messageStore.setSessionStatus(action.status);
				break;
			case "append_assistant_chunk":
				deps.streamBuffer.append(action.content);
				break;
			case "finalize_assistant_stream":
				deps.streamBuffer.finalize();
				break;
			case "clear_assistant_stream":
				deps.streamBuffer.clear();
				break;
			case "set_streaming_content":
				deps.messageStore.setStreamingContent(action.content);
				break;
			case "add_message":
				deps.messageStore.addMessage(action.message);
				break;
			case "upsert_tool_message":
				deps.upsertToolMessage(
					action.toolUseId,
					action.toolCall,
					action.content,
				);
				break;
			case "update_tool_call":
				deps.messageStore.updateMessageToolCall(action.messageId, action.patch);
				break;
			case "update_message_metadata":
				deps.messageStore.updateMessageMetadata(
					action.messageId,
					action.metadata,
				);
				break;
			case "apply_assistant_part":
				deps.messageStore.applyAssistantPartEvent(
					action.messageId,
					action.event,
				);
				break;
			case "update_last_message":
				deps.updateLastAssistantContent(action.content);
				break;
			case "materialize_error":
				deps.materializeStreamError(
					action.summary,
					action.errorContext as LLMErrorContext | undefined,
				);
				break;
			case "pause_for_approval":
				deps.runController.pauseForApproval();
				break;
			case "remember_session": {
				if (action.target === "agent-sdk") {
					deps.runController.setAgentSDKSessionId(action.sessionId);
					const convId = deps.getCurrentConversationId();
					if (convId) {
						deps.sessionsApi
							.updateMeta(convId, { agentSDKSessionId: action.sessionId })
							.catch(() => {});
					}
				} else {
					deps.runController.setAgentRuntimeSessionId(action.sessionId);
					const convId = deps.getCurrentConversationId();
					if (convId) {
						deps.sessionsApi
							.updateMeta(convId, { nativeSessionId: action.sessionId })
							.catch(() => {});
					}
				}
				break;
			}
			case "persist_messages": {
				const convId = deps.getCurrentConversationId();
				if (convId) deps.persistMessages();
				break;
			}
			case "complete_request":
				deps.runController.clearCurrentRequest();
				deps.runController.clearWatchdog();
				break;
			case "rate_limit":
				deps.showRateLimit(action.message);
				break;
		}
	}
}

export interface UseAgentEventDispatcherHandle {
	applyActions: (actions: AgentEventReducerAction[]) => void;
}

/**
 * React hook wrapper. Captures the deps in a ref so the returned callback
 * stays stable across renders — consumers can list it in the effect
 * dependency array without churning subscriptions on every parent render.
 */
export function useAgentEventDispatcher(
	deps: AgentEventDispatcherDeps,
): UseAgentEventDispatcherHandle {
	const depsRef = useRef(deps);
	depsRef.current = deps;

	const applyActions = useCallback(
		(actions: AgentEventReducerAction[]): void => {
			applyAgentEventActions(actions, depsRef.current);
		},
		[],
	);

	return useMemo(() => ({ applyActions }), [applyActions]);
}
