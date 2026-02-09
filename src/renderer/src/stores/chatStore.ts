import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

interface ChatState {
	messages: Message[];
	isStreaming: boolean;
	addMessage: (message: Message) => void;
	updateLastMessage: (content: string) => void;
	setStreaming: (streaming: boolean) => void;
	clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
	persist(
		(set) => ({
			messages: [],
			isStreaming: false,
			addMessage: (message) =>
				set((state) => ({ messages: [...state.messages, message] })),
			updateLastMessage: (content) =>
				set((state) => {
					const lastMsg = state.messages[state.messages.length - 1];
					if (!lastMsg) return state;
					const newMessages = [...state.messages];
					newMessages[newMessages.length - 1] = { ...lastMsg, content };
					return { messages: newMessages };
				}),
			setStreaming: (streaming) => set({ isStreaming: streaming }),
			clearMessages: () => set({ messages: [] }),
		}),
		{
			name: "chat-storage",
		},
	),
);
