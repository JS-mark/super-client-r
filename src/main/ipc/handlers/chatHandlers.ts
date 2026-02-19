import { ipcMain } from "electron";
import { CHAT_CHANNELS } from "../channels";
import type {
	AppendMessageRequest,
	ConversationSummary,
	ChatMessagePersist,
	IPCResponse,
	RenameConversationRequest,
	SaveMessagesRequest,
	UpdateMessageRequest,
} from "../types";
import { storeManager } from "../../store/StoreManager";

export function registerChatHandlers(): void {
	// ============ Conversation CRUD ============

	ipcMain.handle(
		CHAT_CHANNELS.LIST_CONVERSATIONS,
		async (): Promise<IPCResponse<ConversationSummary[]>> => {
			try {
				const list = storeManager.getConversationList();
				return { success: true, data: list };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to list conversations";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.CREATE_CONVERSATION,
		async (_event, name: string): Promise<IPCResponse<ConversationSummary>> => {
			try {
				const conv = storeManager.createConversation(name || "New Chat");
				return { success: true, data: conv };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to create conversation";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.DELETE_CONVERSATION,
		async (_event, id: string): Promise<IPCResponse> => {
			try {
				storeManager.deleteConversation(id);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to delete conversation";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.RENAME_CONVERSATION,
		async (_event, request: RenameConversationRequest): Promise<IPCResponse> => {
			try {
				storeManager.renameConversation(request.conversationId, request.name);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to rename conversation";
				return { success: false, error: message };
			}
		},
	);

	// ============ Message CRUD ============

	ipcMain.handle(
		CHAT_CHANNELS.GET_MESSAGES,
		async (_event, conversationId: string): Promise<IPCResponse<ChatMessagePersist[]>> => {
			try {
				const messages = storeManager.getMessages(conversationId);
				return { success: true, data: messages };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to get messages";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.SAVE_MESSAGES,
		async (_event, request: SaveMessagesRequest): Promise<IPCResponse> => {
			try {
				storeManager.saveMessages(request.conversationId, request.messages);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to save messages";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.APPEND_MESSAGE,
		async (_event, request: AppendMessageRequest): Promise<IPCResponse> => {
			try {
				storeManager.appendMessage(request.conversationId, request.message);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to append message";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.UPDATE_MESSAGE,
		async (_event, request: UpdateMessageRequest): Promise<IPCResponse> => {
			try {
				storeManager.updateChatMessage(
					request.conversationId,
					request.messageId,
					request.updates,
				);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to update message";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.CLEAR_MESSAGES,
		async (_event, conversationId: string): Promise<IPCResponse> => {
			try {
				storeManager.clearConversationMessages(conversationId);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to clear messages";
				return { success: false, error: message };
			}
		},
	);

	// ============ Last Conversation ============

	ipcMain.handle(
		CHAT_CHANNELS.GET_LAST_CONVERSATION,
		async (): Promise<IPCResponse<string | undefined>> => {
			try {
				const id = storeManager.getChatLastConversationId();
				return { success: true, data: id };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to get last conversation";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		CHAT_CHANNELS.SET_LAST_CONVERSATION,
		async (_event, id: string): Promise<IPCResponse> => {
			try {
				storeManager.setChatLastConversationId(id);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to set last conversation";
				return { success: false, error: message };
			}
		},
	);
}
