/**
 * useLegacyLLMStreamHandler — subscribes to the legacy LLM stream channel
 * (`modelService.onStreamEvent`) and materialises `ChatStreamEvent`s into
 * the message store. Extracted from `useChat.ts` (Phase 0b hook slim-down).
 *
 * Behaviour preserved verbatim from the previous inline effect:
 *   - Bails when `event.requestId !== getCurrentRequestId()` or when the
 *     current request is an agent-sdk / runtime run (reverse gating — the
 *     dedicated Agent SDK / Runtime channels own those events).
 *   - `kickWatchdog()` on every accepted event; terminal branches (`done`,
 *     `error`) also call `clearWatchdog()`.
 *   - `tool_result`: promotes tool message state, captures file artefacts
 *     via `captureFileArtifactsFromToolResult`, and preserves the
 *     AskUserQuestion optimistic-answer guard (never overwrites a
 *     structured `{questions, answers}` payload with the main-process echo).
 *   - `done`: finalises stream, persists messages when a conversation is
 *     focused, writes usage/timing metadata onto the last assistant
 *     bubble and the preceding user message.
 *   - `error`: routes through `materializeStreamError` to convert the
 *     placeholder into an ErrorCard.
 *
 * Pure factory: the `handleLegacyLLMStreamEvent` function is exercised
 * directly by the unit tests — no React tree required. The hook wrapper
 * subscribes on mount and unsubscribes on unmount.
 */
import { useEffect, useRef } from "react";
import type { ChatStreamEvent } from "../types/models";
import type {
	ChatFileArtifact,
	ChatFileChangeSet,
} from "../types/electron";
import type {
	ChatSessionStatus,
	LLMErrorContext,
	Message,
	ToolCall,
} from "@super-client/shared-types/chat";
import type { AgentRunRequestType } from "./useAgentRunController";
import { isAskUserQuestionToolName } from "./useAgentEventReducer";
import { captureFileArtifactsFromToolResult } from "./useChatFileCapture";
import type { EffectiveModelSource } from "./useMessageModelResolution";

export interface LegacyLLMStreamModelInfo {
	model: string;
	providerPreset: string;
	providerName: string;
	modelSource?: EffectiveModelSource;
	modelSourceLabel?: string;
}

export interface LegacyLLMStreamHandlerDeps {
	/** Current request id (matched against `event.requestId`). */
	getCurrentRequestId: () => string | null;
	/** Request type — legacy handler bails when this is agent-sdk/runtime. */
	getRequestType: () => AgentRunRequestType | null;
	/** Session status snapshot — used to promote `preparing` → `streaming`. */
	getSessionStatus: () => ChatSessionStatus;
	/** Current messages snapshot — read for the AskUserQuestion guard and
	 *  the `done` usage/metadata write. */
	getMessages: () => Message[];
	getCurrentConversationId: () => string | null;
	/** Model info snapshot for stamping onto newly minted assistant bubbles. */
	getModelInfo: () => LegacyLLMStreamModelInfo | null;

	kickWatchdog: () => void;
	clearWatchdog: () => void;
	pauseForApproval: () => void;
	clearCurrentRequest: () => void;

	setSessionStatus: (status: ChatSessionStatus) => void;
	addMessage: (message: Message) => void;
	updateMessageToolCall: (id: string, patch: Partial<ToolCall>) => void;
	updateMessageMetadata: (
		id: string,
		metadata: Partial<NonNullable<Message["metadata"]>>,
	) => void;

	appendAssistantStreamChunk: (chunk: string) => void;
	finalizeAssistantStreamContent: () => void;
	clearAssistantStreamContent: () => void;

	persistMessages: () => void;
	materializeStreamError: (
		summary: string,
		errorContext?: LLMErrorContext,
	) => void;

	/** File artefact sink — real impl writes to `useFileArtifactStore`. */
	addFileArtifacts: (artifacts: ChatFileArtifact[]) => void;
	addChangeSet: (changeSet: ChatFileChangeSet) => void;

	/** Subscription factory — the hook wires `modelService.onStreamEvent`; tests
	 *  inject a fake to drive events synchronously. */
	subscribe: (callback: (event: ChatStreamEvent) => void) => () => void;
}

/**
 * Pure per-event handler. Extracted so tests can exercise it directly
 * without spinning up React or the real Zustand stores.
 */
export function handleLegacyLLMStreamEvent(
	event: ChatStreamEvent,
	deps: LegacyLLMStreamHandlerDeps,
): void {
	// Request-id gate.
	if (event.requestId !== deps.getCurrentRequestId()) return;
	// Reverse channel gate — Agent SDK / Runtime requests own their own
	// stream channel; the shared legacy `model:stream-event` fanout would
	// otherwise duplicate every chunk into the SDK bubble.
	const requestType = deps.getRequestType();
	if (requestType === "agent-sdk" || requestType === "runtime") return;

	// Every accepted event kicks the watchdog. Terminal branches below
	// also call `clearWatchdog()` themselves.
	deps.kickWatchdog();

	if (event.type === "chunk" && event.content) {
		if (deps.getSessionStatus() === "preparing") {
			deps.setSessionStatus("streaming");
		}
		deps.appendAssistantStreamChunk(event.content);
		return;
	}

	if (event.type === "tool_call" && event.toolCall) {
		deps.setSessionStatus("tool_calling");

		// Finalize any accumulated assistant content BEFORE adding the tool
		// message (updateLastMessage targets messages[last], which is still
		// the assistant here).
		deps.finalizeAssistantStreamContent();
		deps.clearAssistantStreamContent();

		const isAskUserQuestion = isAskUserQuestionToolName(event.toolCall.name);

		let parsedInput: Record<string, unknown> = {};
		try {
			parsedInput = JSON.parse(event.toolCall.arguments || "{}");
		} catch {
			parsedInput = {};
		}

		const toolMessage: Message = {
			id: `tool_${event.toolCall.id}`,
			role: "tool",
			content: `Calling tool: ${event.toolCall.name}`,
			timestamp: Date.now(),
			type: "tool_use",
			toolCall: {
				id: event.toolCall.id,
				name: event.toolCall.name,
				input: parsedInput,
				status: "pending",
				...(event.subagentRunId
					? { subagentRunId: event.subagentRunId }
					: {}),
				...(isAskUserQuestion
					? { approval: { kind: "ask-user-question" } }
					: {}),
			},
		};
		deps.addMessage(toolMessage);
		return;
	}

	if (event.type === "tool_result" && event.toolResult) {
		deps.setSessionStatus("streaming");
		const toolMsgId = `tool_${event.toolResult.toolCallId}`;

		// AskUserQuestion optimistic-answer guard — see legacy comment in
		// useChat.ts for the full story. Preserve the renderer-side answer
		// payload when the main-process echo would clobber it.
		const messages = deps.getMessages();
		const existing = messages.find((m) => m.id === toolMsgId);
		const existingResult = existing?.toolCall?.result as
			| { answers?: Record<string, unknown> }
			| undefined;
		const isAskUserQuestionMsg =
			existing?.toolCall &&
			(existing.toolCall.approval?.kind === "ask-user-question" ||
				isAskUserQuestionToolName(existing.toolCall.name));
		const optimisticAlreadyHasAnswers = Boolean(
			existingResult?.answers &&
				typeof existingResult.answers === "object" &&
				Object.keys(existingResult.answers).length > 0,
		);
		const keepOptimisticResult =
			isAskUserQuestionMsg && optimisticAlreadyHasAnswers;

		deps.updateMessageToolCall(toolMsgId, {
			status: event.toolResult.isError ? "error" : "success",
			...(keepOptimisticResult
				? {}
				: { result: event.toolResult.result }),
			error: event.toolResult.isError
				? String(event.toolResult.result)
				: undefined,
			duration: event.toolResult.duration,
		});

		// §17: capture file artifacts from file-system MCP tool results.
		const conversationId = deps.getCurrentConversationId();
		if (conversationId) {
			// Re-read messages so we see the just-applied patch.
			const afterMessages = deps.getMessages();
			const toolMsg = afterMessages.find((m) => m.id === toolMsgId);
			if (toolMsg?.toolCall) {
				const { artifacts, changeSets } =
					captureFileArtifactsFromToolResult({
						conversationId,
						messageId: toolMsgId,
						toolCallId: event.toolResult.toolCallId,
						toolName: toolMsg.toolCall.name,
						toolInput: toolMsg.toolCall.input,
						toolResult: event.toolResult.result,
						isError: Boolean(event.toolResult.isError),
					});
				if (artifacts.length > 0) {
					deps.addFileArtifacts(artifacts);
				}
				for (const cs of changeSets) {
					deps.addChangeSet(cs);
				}
			}
		}

		const modelInfo = deps.getModelInfo();
		const assistantMessage: Message = {
			id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			role: "assistant",
			content: "",
			timestamp: Date.now(),
			metadata: modelInfo
				? {
						model: modelInfo.model,
						providerPreset: modelInfo.providerPreset,
						providerName: modelInfo.providerName,
					}
				: undefined,
		};
		deps.addMessage(assistantMessage);
		return;
	}

	if (event.type === "tool_error" && event.toolError) {
		deps.setSessionStatus("streaming");
		const toolMsgId = `tool_${event.toolError.toolCallId}`;
		deps.updateMessageToolCall(toolMsgId, {
			status: "error",
			result: event.toolError.error,
			error:
				typeof event.toolError.error === "string"
					? event.toolError.error
					: JSON.stringify(event.toolError.error),
			duration: event.toolError.duration,
		});
		const modelInfo = deps.getModelInfo();
		const assistantMessage: Message = {
			id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			role: "assistant",
			content: "",
			timestamp: Date.now(),
			metadata: modelInfo
				? {
						model: modelInfo.model,
						providerPreset: modelInfo.providerPreset,
						providerName: modelInfo.providerName,
					}
				: undefined,
		};
		deps.addMessage(assistantMessage);
		return;
	}

	if (event.type === "tool_approval_request" && event.toolApproval) {
		const toolMsgId = `tool_${event.toolApproval.toolCallId}`;
		const isAskUserQuestion =
			event.toolApproval.source === "ask-user-question";
		deps.updateMessageToolCall(toolMsgId, {
			status: "awaiting_approval",
			...(isAskUserQuestion
				? { approval: { kind: "ask-user-question" } }
				: {}),
		});
		// Pause watchdog — we already `kickWatchdog`'d for this event and
		// don't want it ticking down while the user reads/answers.
		deps.pauseForApproval();
		return;
	}

	if (event.type === "tool_rejected" && event.toolResult) {
		const toolMsgId = `tool_${event.toolResult.toolCallId}`;
		deps.updateMessageToolCall(toolMsgId, {
			status: "error",
			error: String(event.toolResult.result),
		});
		return;
	}

	if (event.type === "done") {
		deps.finalizeAssistantStreamContent();
		const conversationId = deps.getCurrentConversationId();
		if (conversationId) {
			deps.persistMessages();
		}

		const allMessages = deps.getMessages();
		const lastAssistant = allMessages[allMessages.length - 1];
		if (lastAssistant?.role === "assistant") {
			const outputTokens = event.usage?.outputTokens;
			const totalMs = event.timing?.totalMs;
			const tps =
				outputTokens && totalMs && totalMs > 0
					? Math.round((outputTokens / totalMs) * 1000)
					: undefined;
			const modelInfo = deps.getModelInfo();
			deps.updateMessageMetadata(lastAssistant.id, {
				model: modelInfo?.model,
				providerPreset: modelInfo?.providerPreset,
				providerName: modelInfo?.providerName,
				modelSource: modelInfo?.modelSource,
				modelSourceLabel: modelInfo?.modelSourceLabel,
				tokens: event.usage?.totalTokens,
				inputTokens: event.usage?.inputTokens,
				outputTokens: event.usage?.outputTokens,
				duration: totalMs,
				firstTokenMs: event.timing?.firstTokenMs,
				tokensPerSecond: tps,
			});
			if (event.usage?.inputTokens) {
				const userMsg = [...allMessages]
					.reverse()
					.find((m) => m.role === "user" && m.id !== lastAssistant.id);
				if (userMsg) {
					deps.updateMessageMetadata(userMsg.id, {
						inputTokens: event.usage.inputTokens,
					});
				}
			}
		}
		deps.setSessionStatus("idle");
		deps.clearAssistantStreamContent();
		deps.clearCurrentRequest();
		deps.clearWatchdog();
		return;
	}

	if (event.type === "error") {
		deps.materializeStreamError(
			event.error ?? "Stream failed",
			event.errorContext,
		);
		deps.setSessionStatus("idle");
		deps.clearAssistantStreamContent();
		deps.clearCurrentRequest();
		deps.clearWatchdog();
		return;
	}
}

/**
 * React hook wrapper. Subscribes on mount, unsubscribes on unmount. The
 * `deps` object is captured by reference on every call — no attempt to
 * stabilise identities here since the subscription itself is set up once
 * (see the empty dep array on the effect).
 *
 * The dispatcher's `applyActions` is not used by the legacy path; the
 * legacy handler pre-dates the reducer pipeline and directly mutates the
 * message store to preserve exact ordering + the AskUserQuestion guard.
 */
export function useLegacyLLMStreamHandler(
	deps: LegacyLLMStreamHandlerDeps,
): void {
	// Keep a mutable ref to the latest deps so the subscription callback
	// always reads current values without re-subscribing on every render.
	const depsRef = useRef(deps);
	depsRef.current = deps;

	const subscribe = deps.subscribe;

	useEffect(() => {
		const unsubscribe = subscribe((event) => {
			handleLegacyLLMStreamEvent(event, depsRef.current);
		});
		return unsubscribe;
	}, [subscribe]);
}
