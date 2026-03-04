/**
 * Remote Chat Bridge IPC Handlers
 */

import { ipcMain } from "electron";
import { REMOTE_CHAT_CHANNELS } from "../channels";
import type {
	BindRemoteRequest,
	IPCRequest,
	IPCResponse,
	RemoteBinding,
	RemoteChatMessage,
	SendRemoteMessageRequest,
} from "../types";
import type { RemoteChatBridge } from "../../services/remote-chat/RemoteChatBridge";

let bridgeInstance: RemoteChatBridge | null = null;

export function setRemoteChatBridge(bridge: RemoteChatBridge) {
	bridgeInstance = bridge;
}

function getBridge(): RemoteChatBridge {
	if (!bridgeInstance) {
		throw new Error(
			"RemoteChatBridge not initialized. Call setRemoteChatBridge first.",
		);
	}
	return bridgeInstance;
}

export function registerRemoteChatHandlers(): void {
	// Bind conversation to bot + chatId
	ipcMain.handle(
		REMOTE_CHAT_CHANNELS.BIND,
		async (
			_event,
			request: IPCRequest<BindRemoteRequest>,
		): Promise<IPCResponse<RemoteBinding>> => {
			try {
				const { conversationId, botId, chatId } = request.payload!;
				const bridge = getBridge();
				const binding = bridge.bind(conversationId, botId, chatId);
				return { success: true, data: binding };
			} catch (error) {
				console.error("[IPC] REMOTE_CHAT:BIND error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Unbind conversation
	ipcMain.handle(
		REMOTE_CHAT_CHANNELS.UNBIND,
		async (
			_event,
			request: IPCRequest<{ conversationId: string }>,
		): Promise<IPCResponse<void>> => {
			try {
				const { conversationId } = request.payload!;
				const bridge = getBridge();
				bridge.unbind(conversationId);
				return { success: true };
			} catch (error) {
				console.error("[IPC] REMOTE_CHAT:UNBIND error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Get binding for a conversation
	ipcMain.handle(
		REMOTE_CHAT_CHANNELS.GET_BINDING,
		async (
			_event,
			request: IPCRequest<{ conversationId: string }>,
		): Promise<IPCResponse<RemoteBinding | null>> => {
			try {
				const { conversationId } = request.payload!;
				const bridge = getBridge();
				const binding = bridge.getBinding(conversationId) || null;
				return { success: true, data: binding };
			} catch (error) {
				console.error("[IPC] REMOTE_CHAT:GET_BINDING error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Check if bot is online
	ipcMain.handle(
		REMOTE_CHAT_CHANNELS.CHECK_BOT_ONLINE,
		async (
			_event,
			request: IPCRequest<{ botId: string }>,
		): Promise<IPCResponse<boolean>> => {
			try {
				const { botId } = request.payload!;
				const bridge = getBridge();
				const online = bridge.checkBotOnline(botId);
				return { success: true, data: online };
			} catch (error) {
				console.error("[IPC] REMOTE_CHAT:CHECK_BOT_ONLINE error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Send message to IM via bound bot
	ipcMain.handle(
		REMOTE_CHAT_CHANNELS.SEND_MESSAGE,
		async (
			_event,
			request: IPCRequest<SendRemoteMessageRequest>,
		): Promise<IPCResponse<void>> => {
			try {
				const { conversationId, content } = request.payload!;
				const bridge = getBridge();
				await bridge.sendMessage(conversationId, content);
				return { success: true };
			} catch (error) {
				console.error("[IPC] REMOTE_CHAT:SEND_MESSAGE error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Get remote messages for a conversation
	ipcMain.handle(
		REMOTE_CHAT_CHANNELS.GET_REMOTE_MESSAGES,
		async (
			_event,
			request: IPCRequest<{ conversationId: string }>,
		): Promise<IPCResponse<RemoteChatMessage[]>> => {
			try {
				const { conversationId } = request.payload!;
				const bridge = getBridge();
				const messages = bridge.getRemoteMessages(conversationId);
				return { success: true, data: messages };
			} catch (error) {
				console.error("[IPC] REMOTE_CHAT:GET_REMOTE_MESSAGES error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	console.log("[IPC] Remote Chat Bridge handlers registered");
}
