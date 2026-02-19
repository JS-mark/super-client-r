import { create } from "zustand";
import { chatHistoryService } from "../services/chatHistoryService";
import type { ConversationSummary } from "../types/electron";

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageType = "text" | "tool_use" | "tool_result" | "error";

/**
 * Chat session lifecycle states:
 * - idle: 空闲 — waiting for user input (also the state after completion/stop/error)
 * - preparing: 创建中 — building request (fetching MCP tools, constructing system prompt)
 * - streaming: 聊天中 — receiving streamed response chunks from LLM
 * - tool_calling: 工具调用中 — model is executing MCP tool calls
 */
export type ChatSessionStatus = "idle" | "preparing" | "streaming" | "tool_calling";

export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	status: "pending" | "success" | "error";
	result?: unknown;
	error?: string;
	duration?: number;
}

export interface Message {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: number;
	type?: MessageType;
	toolCall?: ToolCall;
	metadata?: {
		model?: string;
		providerPreset?: string;
		providerName?: string;
		tokens?: number;
		inputTokens?: number;
		outputTokens?: number;
		duration?: number;
		firstTokenMs?: number;
		tokensPerSecond?: number;
	};
}

interface ChatState {
	// Messages
	messages: Message[];
	sessionStatus: ChatSessionStatus;
	isStreaming: boolean;
	streamingContent: string;

	// Pending input (from plugins, etc.)
	pendingInput: string | null;
	setPendingInput: (input: string | null) => void;

	// Conversations
	conversations: ConversationSummary[];
	currentConversationId: string | null;
	isLoadingConversations: boolean;

	// Message actions
	addMessage: (message: Message) => void;
	updateLastMessage: (content: string) => void;
	updateMessageToolCall: (messageId: string, toolCall: Partial<ToolCall>) => void;
	updateMessageMetadata: (messageId: string, metadata: Partial<NonNullable<Message["metadata"]>>) => void;
	setSessionStatus: (status: ChatSessionStatus) => void;
	setStreaming: (streaming: boolean) => void;
	setStreamingContent: (content: string) => void;
	appendStreamingContent: (content: string) => void;
	clearMessages: () => void;
	deleteMessage: (messageId: string) => void;
	updateMessageContent: (messageId: string, content: string) => void;
	deleteMessagesFrom: (messageId: string) => void;

	// Conversation actions
	loadConversations: () => Promise<void>;
	createConversation: (name?: string) => Promise<string | null>;
	switchConversation: (conversationId: string) => Promise<void>;
	deleteConversation: (conversationId: string) => Promise<void>;
	renameConversation: (conversationId: string, name: string) => Promise<void>;

	// Persistence helpers
	persistMessages: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
	messages: [],
	sessionStatus: "idle",
	isStreaming: false,
	streamingContent: "",
	pendingInput: null,
	setPendingInput: (input) => set({ pendingInput: input }),
	conversations: [],
	currentConversationId: null,
	isLoadingConversations: false,

	addMessage: (message) => {
		set((state) => ({ messages: [...state.messages, message] }));
		// Fire-and-forget persist
		const { currentConversationId } = get();
		if (currentConversationId) {
			chatHistoryService.appendMessage(currentConversationId, message).catch(() => {});
		}
	},

	updateLastMessage: (content) =>
		set((state) => {
			const lastMsg = state.messages[state.messages.length - 1];
			if (!lastMsg) return state;
			const newMessages = [...state.messages];
			newMessages[newMessages.length - 1] = { ...lastMsg, content };
			return { messages: newMessages };
		}),

	updateMessageToolCall: (messageId, toolCallUpdate) =>
		set((state) => {
			const messageIndex = state.messages.findIndex((m) => m.id === messageId);
			if (messageIndex === -1) return state;

			const newMessages = [...state.messages];
			const message = newMessages[messageIndex];
			newMessages[messageIndex] = {
				...message,
				toolCall: { ...message.toolCall, ...toolCallUpdate } as ToolCall,
			};
			return { messages: newMessages };
		}),

	updateMessageMetadata: (messageId, metadataUpdate) => {
		set((state) => {
			const messageIndex = state.messages.findIndex((m) => m.id === messageId);
			if (messageIndex === -1) return state;

			const newMessages = [...state.messages];
			const message = newMessages[messageIndex];
			newMessages[messageIndex] = {
				...message,
				metadata: { ...message.metadata, ...metadataUpdate },
			};
			return { messages: newMessages };
		});
		// Persist updated message
		const { currentConversationId, messages } = get();
		if (currentConversationId) {
			const msg = messages.find((m) => m.id === messageId);
			if (msg) {
				chatHistoryService
					.updateMessage(currentConversationId, messageId, {
						metadata: msg.metadata,
					})
					.catch(() => {});
			}
		}
	},

	setSessionStatus: (status) => set({ sessionStatus: status, isStreaming: status !== "idle" }),

	setStreaming: (streaming) => set({
		isStreaming: streaming,
		sessionStatus: streaming ? "streaming" : "idle",
	}),

	setStreamingContent: (content) => set({ streamingContent: content }),

	appendStreamingContent: (content) =>
		set((state) => ({
			streamingContent: state.streamingContent + content,
		})),

	clearMessages: () => {
		const { currentConversationId } = get();
		set({ messages: [] });
		if (currentConversationId) {
			chatHistoryService.clearMessages(currentConversationId).catch(() => {});
		}
	},

	deleteMessage: (messageId) => {
		set((state) => ({
			messages: state.messages.filter((m) => m.id !== messageId),
		}));
		get().persistMessages();
	},

	updateMessageContent: (messageId, content) => {
		set((state) => {
			const idx = state.messages.findIndex((m) => m.id === messageId);
			if (idx === -1) return state;
			const newMessages = [...state.messages];
			newMessages[idx] = { ...newMessages[idx], content };
			return { messages: newMessages };
		});
		const { currentConversationId } = get();
		if (currentConversationId) {
			chatHistoryService
				.updateMessage(currentConversationId, messageId, { content })
				.catch(() => {});
		}
	},

	deleteMessagesFrom: (messageId) => {
		set((state) => {
			const idx = state.messages.findIndex((m) => m.id === messageId);
			if (idx === -1) return state;
			return { messages: state.messages.slice(0, idx) };
		});
		get().persistMessages();
	},

	// ============ Conversation actions ============

	loadConversations: async () => {
		set({ isLoadingConversations: true });
		try {
			const res = await chatHistoryService.listConversations();
			if (res.success && res.data) {
				set({ conversations: res.data });
			}
		} finally {
			set({ isLoadingConversations: false });
		}
	},

	createConversation: async (name) => {
		try {
			const res = await chatHistoryService.createConversation(name || "New Chat");
			if (res.success && res.data) {
				set((state) => ({
					conversations: [res.data!, ...state.conversations],
					currentConversationId: res.data!.id,
					messages: [],
				}));
				chatHistoryService.setLastConversation(res.data.id).catch(() => {});
				return res.data.id;
			}
		} catch (error) {
			console.error("[chatStore] Failed to create conversation:", error);
		}
		return null;
	},

	switchConversation: async (conversationId) => {
		const { sessionStatus, currentConversationId } = get();
		if (sessionStatus !== "idle") return; // Don't switch while active
		if (conversationId === currentConversationId) return;

		set({ currentConversationId: conversationId, messages: [] });

		try {
			const res = await chatHistoryService.getMessages(conversationId);
			if (res.success && res.data) {
				set({ messages: res.data as Message[] });
			}
		} catch (error) {
			console.error("[chatStore] Failed to load messages:", error);
		}

		chatHistoryService.setLastConversation(conversationId).catch(() => {});
	},

	deleteConversation: async (conversationId) => {
		try {
			const res = await chatHistoryService.deleteConversation(conversationId);
			if (res.success) {
				set((state) => {
					const newConversations = state.conversations.filter(
						(c) => c.id !== conversationId,
					);
					const isCurrent = state.currentConversationId === conversationId;
					return {
						conversations: newConversations,
						currentConversationId: isCurrent ? null : state.currentConversationId,
						messages: isCurrent ? [] : state.messages,
					};
				});
			}
		} catch (error) {
			console.error("[chatStore] Failed to delete conversation:", error);
		}
	},

	renameConversation: async (conversationId, name) => {
		try {
			const res = await chatHistoryService.renameConversation(conversationId, name);
			if (res.success) {
				set((state) => ({
					conversations: state.conversations.map((c) =>
						c.id === conversationId ? { ...c, name } : c,
					),
				}));
			}
		} catch (error) {
			console.error("[chatStore] Failed to rename conversation:", error);
		}
	},

	persistMessages: () => {
		const { currentConversationId, messages } = get();
		if (currentConversationId) {
			chatHistoryService
				.saveMessages(currentConversationId, messages)
				.then(() => {
					// Update conversation summary in local state
					set((state) => ({
						conversations: state.conversations.map((c) =>
							c.id === currentConversationId
								? {
									...c,
									messageCount: messages.length,
									updatedAt: Date.now(),
									preview: messages.find((m) => m.role === "user")?.content.slice(0, 100) || c.preview,
								}
								: c,
						),
					}));
				})
				.catch(() => {});
		}
	},
}));
