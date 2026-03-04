/**
 * useRemoteChat hook
 *
 * Manages remote chat bridge state for a conversation:
 * - Binding/unbinding to IM bots
 * - Remote message list (incoming + outgoing)
 * - Sending messages to IM via bound bot
 */

import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "../stores/chatStore";
import type {
	RemoteBinding,
	RemoteChatMessage,
	RemoteIMMessage,
} from "../types/electron";

export function useRemoteChat() {
	const [binding, setBinding] = useState<RemoteBinding | null>(null);
	const [isBindingLoading, setIsBindingLoading] = useState(false);
	const [remoteMessages, setRemoteMessages] = useState<RemoteChatMessage[]>(
		[],
	);

	const { currentConversationId, conversations } = useChatStore();

	// Load binding when conversation changes
	useEffect(() => {
		if (!currentConversationId) {
			setBinding(null);
			setRemoteMessages([]);
			return;
		}

		// Check from conversations list first (cached)
		const conv = conversations.find((c) => c.id === currentConversationId);
		if (conv?.remote) {
			setBinding(conv.remote);
		} else {
			setBinding(null);
			// Also fetch from main process in case it's not in the cache
			window.electron.remoteChat
				.getBinding(currentConversationId)
				.then((res) => {
					if (res.success && res.data) {
						setBinding(res.data);
					}
				})
				.catch(() => {});
		}

		// Load remote messages from persistent storage
		loadRemoteMessages(currentConversationId);
	}, [currentConversationId, conversations]);

	// Load remote messages from main process
	const loadRemoteMessages = useCallback(
		async (conversationId: string) => {
			try {
				const res =
					await window.electron.remoteChat.getRemoteMessages(conversationId);
				if (res.success && res.data) {
					setRemoteMessages(res.data);
				} else {
					setRemoteMessages([]);
				}
			} catch {
				setRemoteMessages([]);
			}
		},
		[],
	);

	// Listen for incoming IM messages from main process
	useEffect(() => {
		const unsubscribe = window.electron.remoteChat.onIMMessage(
			(imMessage: RemoteIMMessage) => {
				const convId = useChatStore.getState().currentConversationId;
				if (imMessage.conversationId !== convId) return;

				// Append to local state for immediate display
				const newMsg: RemoteChatMessage = {
					id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
					direction: "incoming",
					content: imMessage.content,
					sender: imMessage.sender,
					platform: imMessage.platform,
					timestamp: imMessage.timestamp,
				};
				setRemoteMessages((prev) => [...prev, newMsg]);
			},
		);
		return unsubscribe;
	}, []);

	// Bind conversation to a bot
	const bindToBot = useCallback(
		async (botId: string, chatId: string) => {
			if (!currentConversationId) return;

			setIsBindingLoading(true);
			try {
				const res = await window.electron.remoteChat.bind(
					currentConversationId,
					botId,
					chatId,
				);
				if (res.success && res.data) {
					setBinding(res.data);
					// Update conversation in store
					useChatStore.setState((state) => ({
						conversations: state.conversations.map((c) =>
							c.id === currentConversationId
								? { ...c, remote: res.data }
								: c,
						),
					}));
				} else {
					throw new Error(res.error || "Bind failed");
				}
			} finally {
				setIsBindingLoading(false);
			}
		},
		[currentConversationId],
	);

	// Unbind conversation
	const unbind = useCallback(async () => {
		if (!currentConversationId) return;

		setIsBindingLoading(true);
		try {
			const res = await window.electron.remoteChat.unbind(
				currentConversationId,
			);
			if (res.success) {
				setBinding(null);
				// Update conversation in store
				useChatStore.setState((state) => ({
					conversations: state.conversations.map((c) =>
						c.id === currentConversationId
							? { ...c, remote: undefined }
							: c,
					),
				}));
			}
		} finally {
			setIsBindingLoading(false);
		}
	}, [currentConversationId]);

	// Check bot online status
	const checkBotOnline = useCallback(async (botId: string) => {
		const res = await window.electron.remoteChat.checkBotOnline(botId);
		return res.success && res.data === true;
	}, []);

	// Send message to IM via bound bot
	const sendRemoteMessage = useCallback(
		async (content: string) => {
			if (!currentConversationId || !content.trim()) return;

			// Optimistically add to local state
			const outMsg: RemoteChatMessage = {
				id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				direction: "outgoing",
				content: content.trim(),
				sender: { id: "self", name: "Me" },
				platform: binding?.platform || "telegram",
				timestamp: Date.now(),
			};
			setRemoteMessages((prev) => [...prev, outMsg]);

			try {
				const res = await window.electron.remoteChat.sendMessage(
					currentConversationId,
					content.trim(),
				);
				if (!res.success) {
					throw new Error(res.error || "Send failed");
				}
			} catch (error) {
				// Remove optimistic message on failure
				setRemoteMessages((prev) =>
					prev.filter((m) => m.id !== outMsg.id),
				);
				throw error;
			}
		},
		[currentConversationId, binding],
	);

	return {
		binding,
		isBindingLoading,
		remoteMessages,
		bindToBot,
		unbind,
		checkBotOnline,
		sendRemoteMessage,
	};
}
