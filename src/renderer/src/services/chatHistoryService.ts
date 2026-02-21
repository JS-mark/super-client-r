import type {
	ChatMessagePersist,
	ConversationSummary,
	IPCResponse,
} from "../types/electron";

export const chatHistoryService = {
	listConversations: (): Promise<IPCResponse<ConversationSummary[]>> =>
		window.electron.chat.listConversations(),

	createConversation: (
		name: string,
	): Promise<IPCResponse<ConversationSummary>> =>
		window.electron.chat.createConversation(name),

	deleteConversation: (id: string): Promise<IPCResponse> =>
		window.electron.chat.deleteConversation(id),

	renameConversation: (
		conversationId: string,
		name: string,
	): Promise<IPCResponse> =>
		window.electron.chat.renameConversation(conversationId, name),

	getMessages: (
		conversationId: string,
	): Promise<IPCResponse<ChatMessagePersist[]>> =>
		window.electron.chat.getMessages(conversationId),

	saveMessages: (
		conversationId: string,
		messages: ChatMessagePersist[],
	): Promise<IPCResponse> =>
		window.electron.chat.saveMessages(conversationId, messages),

	appendMessage: (
		conversationId: string,
		message: ChatMessagePersist,
	): Promise<IPCResponse> =>
		window.electron.chat.appendMessage(conversationId, message),

	updateMessage: (
		conversationId: string,
		messageId: string,
		updates: Partial<ChatMessagePersist>,
	): Promise<IPCResponse> =>
		window.electron.chat.updateMessage(conversationId, messageId, updates),

	clearMessages: (conversationId: string): Promise<IPCResponse> =>
		window.electron.chat.clearMessages(conversationId),

	getLastConversation: (): Promise<IPCResponse<string | undefined>> =>
		window.electron.chat.getLastConversation(),

	setLastConversation: (id: string): Promise<IPCResponse> =>
		window.electron.chat.setLastConversation(id),

	getConversationDir: (id: string): Promise<IPCResponse<string>> =>
		window.electron.chat.getConversationDir(id),
};
