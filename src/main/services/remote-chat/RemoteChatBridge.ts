/**
 * Remote Chat Bridge
 *
 * Bridges conversations in Chat.tsx with IM Bots (Telegram/DingTalk/Lark).
 * - Manages conversationId -> RemoteBinding mappings
 * - Listens for IM messages and routes them to bound conversations
 * - Provides sendMessage for user-initiated outgoing IM messages
 * - Persists remote messages per conversation
 */

import { EventEmitter } from "events";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { broadcastEvent } from "../../ipc/events";
import type { RemoteBinding, RemoteIMMessage } from "../../ipc/types";
import type { RemoteChatMessage } from "../../ipc/types";
import type { IMBotService } from "../imbot/IMBotService";
import type { IMMessage } from "../imbot/types";
import { getSessionStorage } from "../storage/SessionStorageService";
import { logger } from "../../utils/logger";
import {
	computeRemoteLifecycle,
	resolveTransition,
	type RemoteLifecycleInput,
	type RemoteLifecycleState,
} from "./RemoteSessionLifecycle";

/** Platform message length limits */
const PLATFORM_LIMITS: Record<string, number> = {
	telegram: 4096,
	dingtalk: 20000,
	lark: 30000,
};

export interface RemoteBotOfflinePayload {
	conversationId: string;
	botId: string;
	chatId: string;
	platform: RemoteBinding["platform"];
}

export type RemoteInactiveReceiveReason =
	| "deleted"
	| "archived"
	| "missing-session";

export interface RemoteInactiveReceivedPayload {
	conversationId: string;
	botId: string;
	chatId: string;
	platform: RemoteBinding["platform"];
	reason: RemoteInactiveReceiveReason;
}

export class RemoteBotOfflineError extends Error {
	readonly code = "remote.botOffline";
	readonly details: RemoteBotOfflinePayload;

	constructor(details: RemoteBotOfflinePayload) {
		super("Remote bot is offline");
		this.name = "RemoteBotOfflineError";
		this.details = details;
	}
}

export interface RemoteOutboundRejectedPayload {
	conversationId: string;
	code: string;
	reason?: string;
	state: RemoteLifecycleState;
	botId?: string;
	chatId?: string;
	platform?: RemoteBinding["platform"];
}

export interface RemoteDuplicateDroppedPayload {
	conversationId: string;
	messageId: string;
	direction: RemoteChatMessage["direction"];
	platform: RemoteBinding["platform"];
}

/**
 * Thrown for outbound rejections that are NOT bot-offline (archived /
 * tombstoned / fatal). Bot-offline still throws `RemoteBotOfflineError` for
 * API surface compatibility. Unbound still throws a plain `Error` with the
 * pre-existing message so callers that string-match on it keep working.
 */
export class RemoteOutboundRejectedError extends Error {
	readonly code: string;
	readonly details: RemoteOutboundRejectedPayload;

	constructor(details: RemoteOutboundRejectedPayload) {
		super(`Remote outbound rejected: ${details.code}`);
		this.name = "RemoteOutboundRejectedError";
		this.code = details.code;
		this.details = details;
	}
}

interface SendCapableBot {
	sendMessage(chatId: string, content: string): Promise<void>;
}

interface RuntimeBotRegistry {
	bots?: Map<string, SendCapableBot>;
}

interface RemoteSessionLifecycleMeta {
	deletedAt?: number;
	tombstone?: unknown;
	archived?: boolean;
}

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
		this.wireLifecycleBroadcasts();
		logger.info("[RemoteChatBridge] Initialized");
	}

	/**
	 * Subscribe to our own lifecycle EventEmitter events and re-broadcast
	 * them to the renderer via `broadcastEvent`. These channels are
	 * additive — nothing else changes about when/how events are emitted.
	 * Renderer consumers subscribe via
	 * `window.electron.remoteChat.on{OutboundRejected,DuplicateDropped,InactiveReceived,BotOffline}`.
	 */
	private wireLifecycleBroadcasts(): void {
		this.on("remote.outbound-rejected", (payload: RemoteOutboundRejectedPayload) => {
			broadcastEvent("remote-chat:outbound-rejected", payload);
		});
		this.on("remote.duplicate-dropped", (payload: RemoteDuplicateDroppedPayload) => {
			broadcastEvent("remote-chat:duplicate-dropped", payload);
		});
		this.on("remote.inactive-received", (payload: RemoteInactiveReceivedPayload) => {
			broadcastEvent("remote-chat:inactive-received", payload);
		});
		this.on("remote.bot-offline", (payload: RemoteBotOfflinePayload) => {
			broadcastEvent("remote-chat:bot-offline", payload);
		});
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
		const bot = binding
			? (this.imbotService as unknown as RuntimeBotRegistry).bots?.get(
					binding.botId,
				)
			: undefined;
		const state = this.classifyLifecycle(conversationId, binding, bot);
		const transition = resolveTransition(state, "outbound");

		if (transition.action !== "allow-outbound") {
			this.reportOutboundRejected(conversationId, binding, state, transition);
			if (transition.code === "remote.botOffline" && binding) {
				throw this.reportBotOffline(conversationId, binding);
			}
			if (!binding) {
				// Preserve pre-existing plain-Error contract for the unbound case.
				throw new Error(
					`No remote binding for conversation ${conversationId}`,
				);
			}
			throw new RemoteOutboundRejectedError({
				conversationId,
				code: transition.code ?? "remote.unknown",
				reason: transition.reason,
				state,
				botId: binding.botId,
				chatId: binding.chatId,
				platform: binding.platform,
			});
		}

		// After a healthy transition we always have both a binding and a bot.
		if (!binding || !bot) {
			throw this.reportBotOffline(conversationId, binding as RemoteBinding);
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
	appendRemoteMessage(conversationId: string, msg: RemoteChatMessage): void {
		const filePath = this.getRemoteMessagesPath(conversationId);
		const messages = this.getRemoteMessages(conversationId);
		if (messages.some((existing) => existing.id === msg.id)) {
			this.reportDuplicateDrop(conversationId, msg);
			return;
		}

		messages.push(msg);
		try {
			const dir = getSessionStorage().getSessionDir(conversationId);
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
		this.imbotService.on("raw-message", (botId: string, message: IMMessage) => {
			const reverseKey = `${botId}:${message.chatId}`;
			const conversationId = this.reverseIndex.get(reverseKey);
			if (!conversationId) return;

			// Skip command messages (start with /)
			if (message.content.trim().startsWith("/")) return;

			const binding = this.bindings.get(conversationId);
			if (!binding) return;

			const bot = (
				this.imbotService as unknown as RuntimeBotRegistry
			).bots?.get(binding.botId);
			const state = this.classifyLifecycle(conversationId, binding, bot);
			const transition = resolveTransition(state, "inbound");

			if (transition.action === "drop-inbound-with-log") {
				const inactiveReason =
					this.getInactiveReceiveReason(conversationId) ?? "missing-session";
				this.reportInactiveReceived(conversationId, binding, inactiveReason);
				return;
			}
			if (transition.action === "drop-inbound") {
				// error-fatal / unbound classifications: silently drop, matching the
				// pre-existing behavior for unbound inbound messages.
				return;
			}

			const inMsg: RemoteChatMessage = {
				id: this.getIncomingRemoteMessageId(message),
				direction: "incoming",
				content: message.content,
				sender: message.sender,
				platform: binding.platform,
				timestamp: message.timestamp,
			};

			if (this.hasRemoteMessage(conversationId, inMsg.id)) {
				this.reportDuplicateDrop(conversationId, inMsg);
				return;
			}

			const imMessage: RemoteIMMessage = {
				conversationId,
				content: message.content,
				sender: message.sender,
				platform: binding.platform,
				chatId: message.chatId,
				timestamp: message.timestamp,
			};

			// Broadcast to all renderer windows
			broadcastEvent("remote-chat:im-message", imMessage);

			// Persist as incoming message
			this.appendRemoteMessage(conversationId, inMsg);

			logger.info(
				`[RemoteChatBridge] Routed IM message from ${message.sender.name} to conv=${conversationId}`,
			);
		});
	}

	/**
	 * Load bindings from conversation metadata files on startup
	 */
	private loadBindingsFromStorage(): void {
		try {
			const sessions = getSessionStorage().listAll();
			for (const meta of sessions) {
				if (meta.remote) {
					this.bindings.set(meta.id, meta.remote);
					const reverseKey = `${meta.remote.botId}:${meta.remote.chatId}`;
					this.reverseIndex.set(reverseKey, meta.id);
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
	 * Persist binding to session meta.json
	 */
	private persistBinding(
		conversationId: string,
		binding: RemoteBinding | undefined,
	): void {
		try {
			getSessionStorage().updateMeta(conversationId, {
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
			getSessionStorage().getSessionDir(conversationId),
			"remote-messages.json",
		);
	}

	private getIncomingRemoteMessageId(message: IMMessage): string {
		return `in_${message.id}`;
	}

	private hasRemoteMessage(conversationId: string, messageId: string): boolean {
		return this.getRemoteMessages(conversationId).some(
			(message) => message.id === messageId,
		);
	}

	private getInactiveReceiveReason(
		conversationId: string,
	): RemoteInactiveReceiveReason | undefined {
		try {
			const meta = getSessionStorage().getMeta(
				conversationId,
			) as RemoteSessionLifecycleMeta;
			if (meta.deletedAt || meta.tombstone) return "deleted";
			if (meta.archived) return "archived";
			return undefined;
		} catch {
			return "missing-session";
		}
	}

	private readSessionLifecycleFacts(
		conversationId: string,
	): { exists: boolean; tombstoned: boolean; archived: boolean } {
		try {
			const meta = getSessionStorage().getMeta(
				conversationId,
			) as RemoteSessionLifecycleMeta;
			return {
				exists: true,
				tombstoned: !!(meta.deletedAt || meta.tombstone),
				archived: !!meta.archived,
			};
		} catch {
			return { exists: false, tombstoned: false, archived: false };
		}
	}

	private classifyLifecycle(
		conversationId: string,
		binding: RemoteBinding | undefined,
		bot: SendCapableBot | undefined,
	): RemoteLifecycleState {
		const facts = this.readSessionLifecycleFacts(conversationId);
		const botConfigured = binding
			? !!this.imbotService.getBotConfig(binding.botId)
			: false;
		const botRunning = binding
			? this.checkBotOnline(binding.botId) && !!bot
			: false;
		const input: RemoteLifecycleInput = {
			hasBinding: !!binding,
			sessionExists: facts.exists,
			sessionTombstoned: facts.tombstoned,
			sessionArchived: facts.archived,
			botConfigured,
			botRunning,
		};
		return computeRemoteLifecycle(input);
	}

	private reportOutboundRejected(
		conversationId: string,
		binding: RemoteBinding | undefined,
		state: RemoteLifecycleState,
		transition: { code?: string; reason?: string },
	): void {
		const payload: RemoteOutboundRejectedPayload = {
			conversationId,
			code: transition.code ?? "remote.unknown",
			reason: transition.reason,
			state,
			botId: binding?.botId,
			chatId: binding?.chatId,
			platform: binding?.platform,
		};
		this.emit("remote.outbound-rejected", payload);
		logger.warn("[RemoteChatBridge] remote.outbound-rejected", payload);
	}

	private reportDuplicateDrop(
		conversationId: string,
		msg: RemoteChatMessage,
	): void {
		const payload: RemoteDuplicateDroppedPayload = {
			conversationId,
			messageId: msg.id,
			direction: msg.direction,
			platform: msg.platform,
		};
		this.emit("remote.duplicate-dropped", payload);
		logger.warn("[RemoteChatBridge] remote.duplicate-dropped", payload);
	}

	private reportInactiveReceived(
		conversationId: string,
		binding: RemoteBinding,
		reason: RemoteInactiveReceiveReason,
	): void {
		const payload: RemoteInactiveReceivedPayload = {
			conversationId,
			botId: binding.botId,
			chatId: binding.chatId,
			platform: binding.platform,
			reason,
		};
		this.emit("remote.inactive-received", payload);
		logger.warn("[RemoteChatBridge] remote.inactive-received", payload);
	}

	private reportBotOffline(
		conversationId: string,
		binding: RemoteBinding,
	): RemoteBotOfflineError {
		const payload: RemoteBotOfflinePayload = {
			conversationId,
			botId: binding.botId,
			chatId: binding.chatId,
			platform: binding.platform,
		};
		this.emit("remote.bot-offline", payload);
		logger.warn("[RemoteChatBridge] remote.bot-offline", payload);
		return new RemoteBotOfflineError(payload);
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
