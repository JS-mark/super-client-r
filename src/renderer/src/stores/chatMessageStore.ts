/**
 * useChatMessageStore — messages + streaming state of the **currently
 * focused** conversation. Split out from `useChatStore` per plan §26.4 R-3
 * step 2.
 *
 * Naming: the existing `useMessageStore` already exists for bookmarks /
 * export / search history; this store is "live chat messages of the current
 * conversation", hence the longer name.
 *
 * Why a separate store?
 *  - The list / metadata side (`useChatStore`) changes on creation, rename,
 *    delete, fork — relatively rare.
 *  - The message / streaming side updates on every chunk during a stream —
 *    very hot.
 *  - Putting them together meant every list-side selector subscribed to
 *    chunk-level updates, and tests that need to assert on messages had to
 *    reach through the whole conversation surface.
 *
 * Cross-store coordination
 *  - This store reads `currentConversationId` from `useChatStore` via
 *    `getState()` (action-time only; no reactive cross-subscribe).
 *  - The conversation store reaches back into THIS store from
 *    `switchConversation / deleteConversation` to clear / hydrate messages.
 *
 * Persistence side-effects (history service writes) live here so callers can
 * keep using single-call mutations like `addMessage` and not worry about
 * remembering to persist.
 */

import { create } from "zustand";
import { messageToEvents } from "@super-client/shared-types/messageConverter";
import type { SessionEvent } from "@super-client/shared-types/project";
import { useChatStore } from "./chatStore";

// A-1: Message / ToolCall / MessageRole / MessageType / ChatSessionStatus
// canonical 已迁到 @super-client/shared-types/chat。本文件继续 re-export 同名
// 类型，让所有 `import { Message } from "../stores/chatMessageStore"` 调用站点
// 不需要改。
export type {
	ChatSessionStatus,
	Message,
	MessageRole,
	MessageType,
	ToolCall,
} from "@super-client/shared-types/chat";

import type {
	AssistantPartEvent,
	ChatSessionStatus,
	LLMErrorContext,
	Message,
	MessagePart,
	ToolCall,
} from "@super-client/shared-types/chat";

/**
 * Fire-and-forget emit to the persistent session jsonl. Centralised here so all
 * in-place updaters in this store reach the same plumbing.
 *  - No-op when no conversation is currently focused (e.g. initial app load).
 *  - Errors are swallowed: persistence is best-effort; the UI keeps the
 *    in-memory state regardless.
 */
function emitSessionEvent(event: SessionEvent): void {
	const conversationId = useChatStore.getState().currentConversationId;
	if (!conversationId) return;
	window.electron.sessions.appendEvent(conversationId, event).catch(() => {});
}

function applyPartDelta(
	part: MessagePart,
	delta: unknown,
	updatedAt: number,
): MessagePart {
	if (part.type === "text" && typeof delta === "string") {
		return { ...part, content: part.content + delta, updatedAt };
	}
	if (part.type === "code_block" && typeof delta === "string") {
		return { ...part, content: part.content + delta, updatedAt };
	}
	if (delta && typeof delta === "object") {
		return { ...part, ...(delta as Partial<MessagePart>), updatedAt } as MessagePart;
	}
	return { ...part, updatedAt };
}

function contentFromParts(parts: MessagePart[], fallback: string): string {
	const text = parts
		.filter((part) => part.type === "text")
		.map((part) => part.content)
		.join("");
	return text || fallback;
}

function applyAssistantPartToMessage(
	message: Message,
	event: AssistantPartEvent,
): Message {
	const currentParts = message.parts ?? [];
	let nextParts = currentParts;

	switch (event.type) {
		case "assistant.part_start": {
			const existing = currentParts.findIndex(
				(part) => part.id === event.part.id,
			);
			nextParts =
				existing >= 0
					? currentParts.map((part, index) =>
							index === existing ? event.part : part,
						)
					: [...currentParts, event.part];
			break;
		}
		case "assistant.part_delta":
			nextParts = currentParts.map((part) =>
				part.id === event.partId
					? applyPartDelta(part, event.delta, event.ts)
					: part,
			);
			break;
		case "assistant.part_update":
			nextParts = currentParts.map((part) =>
				part.id === event.partId
					? ({ ...part, ...event.patch, updatedAt: event.ts } as MessagePart)
					: part,
			);
			break;
		case "assistant.part_done":
			nextParts = currentParts.map((part) =>
				part.id === event.partId
					? ({
							...part,
							...event.patch,
							state: "complete",
							updatedAt: event.ts,
						} as MessagePart)
					: part,
			);
			break;
		case "assistant.part_error":
			nextParts = currentParts.map((part) =>
				part.id === event.partId
					? ({
							...part,
							state: "error",
							error: event.error,
							updatedAt: event.ts,
						} as MessagePart)
					: part,
			);
			break;
	}

	return {
		...message,
		parts: nextParts,
		content: contentFromParts(nextParts, message.content),
	};
}

function shouldPersistAssistantPartEvent(
	message: Message,
	event: AssistantPartEvent,
): boolean {
	if (event.type === "assistant.part_start") return !event.part.transient;
	const part = message.parts?.find((item) => item.id === event.partId);
	return !part?.transient;
}

interface ChatMessageState {
	messages: Message[];
	sessionStatus: ChatSessionStatus;
	isStreaming: boolean;
	streamingContent: string;

	// Bulk replace — used when switching conversations.
	setMessages: (messages: Message[]) => void;

	// CRUD
	addMessage: (message: Message) => void;
	updateLastMessage: (content: string) => void;
	updateMessageToolCall: (
		messageId: string,
		toolCall: Partial<ToolCall>,
	) => void;
	updateMessageMetadata: (
		messageId: string,
		metadata: Partial<NonNullable<Message["metadata"]>>,
	) => void;
	/**
	 * Convert the message into an error message (sets `type:'error'`, fills
	 * `metadata.errorContext / errorQuery / errorSummary`, and replaces
	 * `content` with the summary). Used by the LLM stream error branch in
	 * `useChat.ts` to materialize an ErrorCard.
	 */
	markMessageAsError: (
		messageId: string,
		payload: {
			summary: string;
			errorContext?: LLMErrorContext;
			query?: string;
		},
	) => void;
	applyAssistantPartEvent: (
		messageId: string,
		event: AssistantPartEvent,
	) => void;
	clearMessages: () => void;
	deleteMessage: (messageId: string) => void;
	updateMessageContent: (messageId: string, content: string) => void;
	deleteMessagesFrom: (messageId: string) => void;

	// Streaming runtime
	setSessionStatus: (status: ChatSessionStatus) => void;
	setStreaming: (streaming: boolean) => void;
	setStreamingContent: (content: string) => void;
	appendStreamingContent: (content: string) => void;

	// Persistence helper
	persistMessages: () => void;
}

export const useChatMessageStore = create<ChatMessageState>()((set) => ({
	messages: [],
	sessionStatus: "idle",
	isStreaming: false,
	streamingContent: "",

	setMessages: (messages) => set({ messages }),

	addMessage: (message) => {
		set((state) => ({ messages: [...state.messages, message] }));
		const conversationId = useChatStore.getState().currentConversationId;
		if (!conversationId) return;
		// D-2: 走新 sessions.appendEvent，每个 Message 转 0..N 个 SessionEvent
		// （tool_use 含 result → tool_call + tool_result 两条；其它各一条）
		const events = messageToEvents(message);
		for (const ev of events) {
			window.electron.sessions.appendEvent(conversationId, ev).catch(() => {});
		}
	},

	updateLastMessage: (content) =>
		set((state) => {
			const lastMsg = state.messages[state.messages.length - 1];
			if (!lastMsg) return state;
			const newMessages = [...state.messages];
			const updated: Message = { ...lastMsg, content };
			newMessages[newMessages.length - 1] = updated;

			// Persist as a same-id `assistant_message` event so the final
			// streamed content survives a conversation reload. The reducer
			// (`eventsToMessages`) upserts by id and `appendEvent` does not
			// double-count messageCount, so re-emitting is safe.
			if (updated.role === "assistant") {
				emitSessionEvent({
					type: "assistant_message",
					id: updated.id,
					ts: updated.timestamp || Date.now(),
					content,
					...(updated.metadata ? { metadata: updated.metadata } : {}),
				});
			} else if (updated.role === "user") {
				emitSessionEvent({
					type: "user_message",
					id: updated.id,
					ts: updated.timestamp || Date.now(),
					content,
					...(updated.metadata?.attachmentIds &&
					updated.metadata.attachmentIds.length > 0
						? { attachmentIds: updated.metadata.attachmentIds }
						: {}),
				});
			}
			return { messages: newMessages };
		}),

	updateMessageToolCall: (messageId, toolCallUpdate) =>
		set((state) => {
			const messageIndex = state.messages.findIndex((m) => m.id === messageId);
			if (messageIndex === -1) return state;
			const newMessages = [...state.messages];
			const message = newMessages[messageIndex];
			const nextToolCall: ToolCall = {
				...message.toolCall,
				...toolCallUpdate,
			} as ToolCall;
			newMessages[messageIndex] = {
				...message,
				toolCall: nextToolCall,
			};

				// Persist terminal tool state once the tool call finishes.
				// Without this, reload would see only the initial `tool_call` event
				// and leave the card stuck in "pending" / "执行中..." forever.
			if (
				(nextToolCall.status === "success" ||
					nextToolCall.status === "error") &&
				nextToolCall.id
			) {
					if (nextToolCall.status === "error") {
						emitSessionEvent({
							type: "tool_error",
							toolCallId: nextToolCall.id,
							ts: Date.now(),
							error:
								nextToolCall.error ??
								(nextToolCall.result !== undefined ? nextToolCall.result : ""),
							...(typeof nextToolCall.duration === "number"
								? { duration: nextToolCall.duration }
								: {}),
						});
					} else {
						emitSessionEvent({
							type: "tool_result",
							toolCallId: nextToolCall.id,
							ts: Date.now(),
							output: nextToolCall.result ?? "",
							...(typeof nextToolCall.duration === "number"
								? { duration: nextToolCall.duration }
								: {}),
						});
					}
				}
			return { messages: newMessages };
		}),

	updateMessageMetadata: (messageId, metadataUpdate) => {
		set((state) => {
			const messageIndex = state.messages.findIndex((m) => m.id === messageId);
			if (messageIndex === -1) return state;
			const newMessages = [...state.messages];
			const message = newMessages[messageIndex];
			const nextMetadata = { ...message.metadata, ...metadataUpdate };
			newMessages[messageIndex] = {
				...message,
				metadata: nextMetadata,
			};

			// Re-emit the message with updated metadata so token usage / timing
			// captured at stream-end is persisted alongside the final content.
			// Same-id upsert keeps storage from creating a duplicate message.
			if (message.role === "assistant") {
				emitSessionEvent({
					type: "assistant_message",
					id: message.id,
					ts: message.timestamp || Date.now(),
					content: message.content,
					metadata: nextMetadata,
				});
			} else if (message.role === "user") {
				emitSessionEvent({
					type: "user_message",
					id: message.id,
					ts: message.timestamp || Date.now(),
					content: message.content,
					...(nextMetadata?.attachmentIds &&
					nextMetadata.attachmentIds.length > 0
						? { attachmentIds: nextMetadata.attachmentIds }
						: {}),
				});
			}
			return { messages: newMessages };
		});
	},

	markMessageAsError: (messageId, payload) => {
		set((state) => {
			const idx = state.messages.findIndex((m) => m.id === messageId);
			if (idx === -1) return state;
			const message = state.messages[idx];
			const nextMetadata = {
				...message.metadata,
				errorSummary: payload.summary,
				...(payload.errorContext
					? { errorContext: payload.errorContext }
					: {}),
				...(payload.query !== undefined ? { errorQuery: payload.query } : {}),
			};
			const newMessages = [...state.messages];
			newMessages[idx] = {
				...message,
				type: "error",
				// Keep the summary in `content` so non-card consumers (plain
				// text export, search index) can still read the failure reason.
				content: payload.summary,
				metadata: nextMetadata,
				// Drop any in-flight streaming parts — the card replaces them.
				parts: undefined,
			};

			// Persist as an `assistant_message` event with the same id so a
			// conversation reload re-materializes the ErrorCard rather than
			// showing an empty bubble. `messageType: 'error'` is the field
			// jsonl.ts replays into `Message.type` so the renderer routes
			// the rebuilt message back through ErrorCard.
			if (message.role === "assistant") {
				emitSessionEvent({
					type: "assistant_message",
					id: message.id,
					ts: message.timestamp || Date.now(),
					content: payload.summary,
					metadata: nextMetadata,
					messageType: "error",
				});
			}
			return { messages: newMessages };
		});
	},

	applyAssistantPartEvent: (messageId, event) => {
		set((state) => {
			const messageIndex = state.messages.findIndex((m) => m.id === messageId);
			if (messageIndex === -1) return state;
			const message = state.messages[messageIndex];
			if (message.role !== "assistant") return state;

			const eventForMessage = { ...event, messageId };
			const newMessages = [...state.messages];
			newMessages[messageIndex] = applyAssistantPartToMessage(
				message,
				eventForMessage,
			);
			if (shouldPersistAssistantPartEvent(message, eventForMessage)) {
				emitSessionEvent(eventForMessage);
			}
			return { messages: newMessages };
		});
	},

	setSessionStatus: (status) =>
		set({ sessionStatus: status, isStreaming: status !== "idle" }),

	setStreaming: (streaming) =>
		set({
			isStreaming: streaming,
			sessionStatus: streaming ? "streaming" : "idle",
		}),

	setStreamingContent: (content) => set({ streamingContent: content }),

	appendStreamingContent: (content) =>
		set((state) => ({ streamingContent: state.streamingContent + content })),

	clearMessages: () => {
		// D-2: append-only 模型下"clear"只清内存。如果用户真要清空历史，
		// 应该走 chatStore.deleteConversation（删整个 session）或重建新 session。
		set({ messages: [] });
	},

	deleteMessage: (messageId) => {
		// D-2: 内存层删除。jsonl 是 append-only，单条历史无法物理删；
		// 真要"删历史" → 走 fork from previous message（plan §10 #5 编辑 = fork）。
		set((state) => ({
			messages: state.messages.filter((m) => m.id !== messageId),
		}));
	},

	updateMessageContent: (messageId, content) => {
		// D-2: 内存层修改（如用户编辑历史消息）。append-only jsonl 不会重写；
		// "已发送的内容编辑" 应该走 fork 新会话来表达。
		set((state) => {
			const idx = state.messages.findIndex((m) => m.id === messageId);
			if (idx === -1) return state;
			const newMessages = [...state.messages];
			newMessages[idx] = { ...newMessages[idx], content };
			return { messages: newMessages };
		});
	},

	deleteMessagesFrom: (messageId) => {
		// D-2: 同 deleteMessage —— 内存层。
		set((state) => {
			const idx = state.messages.findIndex((m) => m.id === messageId);
			if (idx === -1) return state;
			return { messages: state.messages.slice(0, idx) };
		});
	},

	persistMessages: () => {
		// NO-OP shim. The append-only persistence is now spread across
		// `addMessage` (initial event), `updateLastMessage` (assistant content
		// finalize), `updateMessageMetadata` (token / timing finalize) and
		// `updateMessageToolCall` (tool_result on terminal status). Kept only
		// so existing callers don't need to change their import.
	},
}));
