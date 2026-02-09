import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageType = "text" | "tool_use" | "tool_result" | "error";

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
		tokens?: number;
		duration?: number;
	};
}

export interface ChatSession {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
}

interface ChatState {
	// Messages
	messages: Message[];
	isStreaming: boolean;
	streamingContent: string;

	// Sessions
	sessions: ChatSession[];
	currentSessionId: string | null;

	// Actions
	addMessage: (message: Message) => void;
	updateLastMessage: (content: string) => void;
	updateMessageToolCall: (messageId: string, toolCall: Partial<ToolCall>) => void;
	setStreaming: (streaming: boolean) => void;
	setStreamingContent: (content: string) => void;
	appendStreamingContent: (content: string) => void;
	clearMessages: () => void;

	// Session actions
	createSession: (name?: string) => string;
	switchSession: (sessionId: string) => void;
	deleteSession: (sessionId: string) => void;
	renameSession: (sessionId: string, name: string) => void;
}

export const useChatStore = create<ChatState>()(
	persist(
		(set, get) => ({
			messages: [],
			isStreaming: false,
			streamingContent: "",
			sessions: [],
			currentSessionId: null,

			addMessage: (message) =>
				set((state) => {
					const newMessages = [...state.messages, message];
					// Update session message count
					if (state.currentSessionId) {
						const updatedSessions = state.sessions.map((s) =>
							s.id === state.currentSessionId
								? { ...s, messageCount: newMessages.length, updatedAt: Date.now() }
								: s,
						);
						return { messages: newMessages, sessions: updatedSessions };
					}
					return { messages: newMessages };
				}),

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

			setStreaming: (streaming) => set({ isStreaming: streaming }),

			setStreamingContent: (content) => set({ streamingContent: content }),

			appendStreamingContent: (content) =>
				set((state) => ({
					streamingContent: state.streamingContent + content,
				})),

			clearMessages: () =>
				set((state) => {
					// Clear messages for current session
					if (state.currentSessionId) {
						const updatedSessions = state.sessions.map((s) =>
							s.id === state.currentSessionId
								? { ...s, messageCount: 0, updatedAt: Date.now() }
								: s,
						);
						return { messages: [], sessions: updatedSessions };
					}
					return { messages: [] };
				}),

			createSession: (name) => {
				const sessionId = `session_${Date.now()}`;
				const newSession: ChatSession = {
					id: sessionId,
					name: name || `Chat ${get().sessions.length + 1}`,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messageCount: 0,
				};
				set((state) => ({
					sessions: [newSession, ...state.sessions],
					currentSessionId: sessionId,
					messages: [], // Start with empty messages for new session
				}));
				return sessionId;
			},

			switchSession: (sessionId) =>
				set((state) => {
					// In a real implementation, you'd load messages for this session
					// For now, we just switch the session ID
					return { currentSessionId: sessionId, messages: [] };
				}),

			deleteSession: (sessionId) =>
				set((state) => {
					const newSessions = state.sessions.filter((s) => s.id !== sessionId);
					// If we're deleting the current session, switch to another one
					let newCurrentSessionId = state.currentSessionId;
					if (state.currentSessionId === sessionId) {
						newCurrentSessionId = newSessions.length > 0 ? newSessions[0].id : null;
					}
					return {
						sessions: newSessions,
						currentSessionId: newCurrentSessionId,
						messages:
							state.currentSessionId === sessionId ? [] : state.messages,
					};
				}),

			renameSession: (sessionId, name) =>
				set((state) => ({
					sessions: state.sessions.map((s) =>
						s.id === sessionId ? { ...s, name } : s,
					),
				})),
		}),
		{
			name: "chat-storage",
			partialize: (state) => ({
				sessions: state.sessions,
				currentSessionId: state.currentSessionId,
				// Don't persist messages in memory, they should be loaded from disk/DB
			}),
		},
	),
);
