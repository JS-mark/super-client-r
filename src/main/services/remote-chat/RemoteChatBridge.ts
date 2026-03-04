/**
 * Remote Chat Bridge
 *
 * Bridges conversations in Chat.tsx with IM Bots (Telegram/DingTalk/Lark).
 * - Manages conversationId -> RemoteBinding mappings
 * - Listens for IM messages and routes them to bound conversations
 * - Provides sendMessage for user-initiated outgoing IM messages
 * - Persists remote messages per conversation
 */

import { BrowserWindow } from "electron";
import { EventEmitter } from "events";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { REMOTE_CHAT_CHANNELS } from "../../ipc/channels";
import type { RemoteBinding, RemoteIMMessage } from "../../ipc/types";
import type { RemoteChatMessage } from "../../ipc/types";
import type { IMBotService } from "../imbot/IMBotService";
import type { IMMessage } from "../imbot/types";
import { conversationStorage } from "../chat/ConversationStorageService";
import { logger } from "../../utils/logger";

/** Platform message length limits */
const PLATFORM_LIMITS: Record<string, number> = {
	telegram: 4096,
	dingtalk: 20000,
	lark: 30000,
};

export class RemoteChatBridge extends EventEmitter {
	/** conversationId -> RemoteBinding */
	private bindings = new Map<string, RemoteBinding>();
	/** Reverse index: "botId:chatId" -> conversationId */
	private reverseIndex = new Map<string, string>();
	private imbotService: IMBotService;

	constructor(imbotService: IMBotService) {
		super();
		this.imbotService = imbotService;
		this.setupIMListener();
		this.loadBindingsFromStorage();
		logger.info("[RemoteChatBridge] Initialized");
	}

	/**
	 * Bind a conversation to a bot + chatId
	 */
	bind(conversationId: string, botId: string, chatId: string): RemoteBinding {
		const reverseKey = `${botId}:${chatId}`;

		// Check if this (botId, chatId) is already bound to another conversation
		const existingConvId = this.reverseIndex.get(reverseKey);
		if (existingConvId && existingConvId !== conversationId) {
			throw new Error(
				`Bot ${botId} chatId ${chatId} is already bound to conversation ${existingConvId}`,
			);
		}

		const config = this.imbotService.getBotConfig(botId);
		if (!config) {
			throw new Error(`Bot ${botId} not found`);
		}

		const binding: RemoteBinding = {
			botId,
			chatId,
			botName: config.name,
			platform: config.type,
			boundAt: Date.now(),
		};

		this.bindings.set(conversationId, binding);
		this.reverseIndex.set(reverseKey, conversationId);

		// Persist to metadata.json
		this.persistBinding(conversationId, binding);

		logger.info(
			`[RemoteChatBridge] Bound conv=${conversationId} -> bot=${botId} chat=${chatId}`,
		);
		return binding;
	}

	/**
	 * Unbind a conversation
	 */
	unbind(conversationId: string): void {
		const binding = this.bindings.get(conversationId);
		if (!binding) return;

		const reverseKey = `${binding.botId}:${binding.chatId}`;
		this.bindings.delete(conversationId);
		this.reverseIndex.delete(reverseKey);

		// Remove from metadata.json
		this.persistBinding(conversationId, undefined);

		logger.info(`[RemoteChatBridge] Unbound conv=${conversationId}`);
	}

	/**
	 * Get binding for a conversation
	 */
	getBinding(conversationId: string): RemoteBinding | undefined {
		return this.bindings.get(conversationId);
	}

	/**
	 * Check if a bot is online
	 */
	checkBotOnline(botId: string): boolean {
		const statuses = this.imbotService.getBotStatuses();
		return statuses.some((s) => s.id === botId && s.status === "running");
	}

	/**
	 * Send a message to IM via the bound bot (user-initiated).
	 * Splits long messages according to platform limits.
	 */
	async sendMessage(conversationId: string, content: string): Promise<void> {
		const binding = this.bindings.get(conversationId);
		if (!binding) {
			throw new Error(`No remote binding for conversation ${conversationId}`);
		}

		const bot = (this.imbotService as any).bots?.get(binding.botId);
		if (!bot) {
			throw new Error(`Bot ${binding.botId} is not running`);
		}

		const limit = PLATFORM_LIMITS[binding.platform] || 4096;
		const chunks = splitMessage(content, limit);

		for (const chunk of chunks) {
			await bot.sendMessage(binding.chatId, chunk);
		}

		// Persist as outgoing message
		const outMsg: RemoteChatMessage = {
			id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			direction: "outgoing",
			content,
			sender: { id: "self", name: "Me" },
			platform: binding.platform,
			timestamp: Date.now(),
		};
		this.appendRemoteMessage(conversationId, outMsg);

		logger.info(
			`[RemoteChatBridge] Sent ${chunks.length} chunk(s) to bot=${binding.botId} chat=${binding.chatId}`,
		);
	}

	/**
	 * Get remote messages for a conversation
	 */
	getRemoteMessages(conversationId: string): RemoteChatMessage[] {
		const filePath = this.getRemoteMessagesPath(conversationId);
		if (!existsSync(filePath)) return [];
		try {
			const raw = readFileSync(filePath, "utf-8");
			return JSON.parse(raw) as RemoteChatMessage[];
		} catch {
			return [];
		}
	}

	/**
	 * Append a remote message to persistent storage
	 */
	appendRemoteMessage(
		conversationId: string,
		msg: RemoteChatMessage,
	): void {
		const filePath = this.getRemoteMessagesPath(conversationId);
		const messages = this.getRemoteMessages(conversationId);
		messages.push(msg);
		try {
			const dir = join(
				conversationStorage.getConversationDir(conversationId),
			);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			writeFileSync(filePath, JSON.stringify(messages, null, 2), "utf-8");
		} catch (error) {
			logger.error(
				`[RemoteChatBridge] Failed to persist remote message for ${conversationId}`,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Listen for raw IM messages and route to bound conversations
	 */
	private setupIMListener(): void {
		this.imbotService.on(
			"raw-message",
			(botId: string, message: IMMessage) => {
				const reverseKey = `${botId}:${message.chatId}`;
				const conversationId = this.reverseIndex.get(reverseKey);
				if (!conversationId) return;

				// Skip command messages (start with /)
				if (message.content.trim().startsWith("/")) return;

				const binding = this.bindings.get(conversationId);
				if (!binding) return;

				const imMessage: RemoteIMMessage = {
					conversationId,
					content: message.content,
					sender: message.sender,
					platform: binding.platform,
					chatId: message.chatId,
					timestamp: message.timestamp,
				};

				// Broadcast to all renderer windows
				BrowserWindow.getAllWindows().forEach((win) => {
					win.webContents.send(REMOTE_CHAT_CHANNELS.IM_MESSAGE, imMessage);
				});

				// Persist as incoming message
				const inMsg: RemoteChatMessage = {
					id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
					direction: "incoming",
					content: message.content,
					sender: message.sender,
					platform: binding.platform,
					timestamp: message.timestamp,
				};
				this.appendRemoteMessage(conversationId, inMsg);

				logger.info(
					`[RemoteChatBridge] Routed IM message from ${message.sender.name} to conv=${conversationId}`,
				);
			},
		);
	}

	/**
	 * Load bindings from conversation metadata files on startup
	 */
	private loadBindingsFromStorage(): void {
		try {
			const conversations = conversationStorage.getConversationList();
			for (const conv of conversations) {
				if (conv.remote) {
					this.bindings.set(conv.id, conv.remote);
					const reverseKey = `${conv.remote.botId}:${conv.remote.chatId}`;
					this.reverseIndex.set(reverseKey, conv.id);
				}
			}
			logger.info(
				`[RemoteChatBridge] Loaded ${this.bindings.size} binding(s) from storage`,
			);
		} catch (error) {
			logger.error(
				"[RemoteChatBridge] Failed to load bindings",
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Persist binding to conversation metadata.json
	 */
	private persistBinding(
		conversationId: string,
		binding: RemoteBinding | undefined,
	): void {
		try {
			conversationStorage.updateConversationMetadata(conversationId, {
				remote: binding,
			});
		} catch (error) {
			logger.error(
				`[RemoteChatBridge] Failed to persist binding for ${conversationId}`,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Get path to remote-messages.json for a conversation
	 */
	private getRemoteMessagesPath(conversationId: string): string {
		return join(
			conversationStorage.getConversationDir(conversationId),
			"remote-messages.json",
		);
	}
}

/**
 * Split a long message into chunks respecting the platform limit.
 * Tries to split on newline boundaries when possible.
 */
function splitMessage(content: string, limit: number): string[] {
	if (content.length <= limit) return [content];

	const chunks: string[] = [];
	let remaining = content;

	while (remaining.length > 0) {
		if (remaining.length <= limit) {
			chunks.push(remaining);
			break;
		}

		// Try to split at a newline near the limit
		let splitAt = remaining.lastIndexOf("\n", limit);
		if (splitAt < limit * 0.5) {
			// No good newline split point, force split at limit
			splitAt = limit;
		}

		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt).trimStart();
	}

	return chunks;
}
