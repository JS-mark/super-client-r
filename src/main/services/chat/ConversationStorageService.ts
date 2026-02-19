/**
 * Per-conversation directory-based storage service with multi-user isolation
 * Replaces the flat chat-history.json electron-store approach
 *
 * Directory structure:
 *   {userData}/chats/
 *     {userId}/                  # Per-user isolation (or "default" when not logged in)
 *       {conversationId}/
 *         metadata.json          - ConversationSummary
 *         messages.json          - ChatMessagePersist[]
 *         attachments/           - Per-conversation attachments
 *         tool-outputs/          - Tool execution results
 *       .last-conversation       - Plain text: last conversation ID
 */

import { app } from "electron";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "fs";
import { join } from "path";
import Store from "electron-store";
import type {
	ChatMessagePersist,
	ConversationData,
	ConversationSummary,
} from "../../ipc/types";
import { logger } from "../../utils/logger";

interface LegacyChatStoreData {
	conversations: Record<string, ConversationData>;
	conversationOrder: string[];
	lastConversationId?: string;
}

const MAX_MESSAGES_PER_CONVERSATION = 500;
const DEFAULT_USER_DIR = "default";

export class ConversationStorageService {
	private chatsBaseDir = "";
	private currentUserDir = DEFAULT_USER_DIR;
	private cachedList: ConversationSummary[] | null = null;

	/** Active user's chats directory */
	private get chatsDir(): string {
		return join(this.chatsBaseDir, this.currentUserDir);
	}

	initialize(): void {
		// Compute path here (not in constructor) because app.setPath("userData")
		// hasn't been called yet when the singleton is instantiated at import time
		this.chatsBaseDir = join(app.getPath("userData"), "chats");
		if (!existsSync(this.chatsBaseDir)) {
			mkdirSync(this.chatsBaseDir, { recursive: true });
		}

		// Determine initial user from persisted auth state
		this.resolveCurrentUser();

		// Ensure current user dir exists
		if (!existsSync(this.chatsDir)) {
			mkdirSync(this.chatsDir, { recursive: true });
		}

		this.migrateFromLegacy();
	}

	// ============ Multi-User ============

	/**
	 * Read persisted authUser from config store to determine initial user dir.
	 * Called once at startup.
	 */
	private resolveCurrentUser(): void {
		try {
			const StoreClass = (Store as any).default || Store;
			const configStore = new StoreClass({ name: "config" }) as Store;
			const authUser = configStore.get("authUser") as
				| { id: string }
				| undefined;
			this.currentUserDir = authUser?.id || DEFAULT_USER_DIR;
		} catch {
			this.currentUserDir = DEFAULT_USER_DIR;
		}
	}

	/**
	 * Switch to a different user's chat directory.
	 * Called by auth handlers on login/logout.
	 */
	setCurrentUser(userId: string | null): void {
		this.currentUserDir = userId || DEFAULT_USER_DIR;
		this.cachedList = null;

		if (!existsSync(this.chatsDir)) {
			mkdirSync(this.chatsDir, { recursive: true });
		}

		logger.info(`Switched conversation storage to user: ${this.currentUserDir}`);
	}

	getCurrentUserDir(): string {
		return this.currentUserDir;
	}

	// ============ Migration ============

	private migrateFromLegacy(): void {
		try {
			const StoreClass = (Store as any).default || Store;
			const legacyStore = new StoreClass({
				name: "chat-history",
				defaults: {
					conversations: {},
					conversationOrder: [],
				},
			}) as Store<LegacyChatStoreData>;

			const legacyPath = legacyStore.path;
			if (!existsSync(legacyPath)) {
				return;
			}

			const conversations = legacyStore.get("conversations") || {};
			const order = legacyStore.get("conversationOrder") || [];
			const lastConvId = legacyStore.get("lastConversationId");

			const convIds = Object.keys(conversations);
			if (convIds.length === 0) {
				renameSync(legacyPath, `${legacyPath}.bak`);
				logger.info("Legacy chat-history.json had no conversations, renamed to .bak");
				return;
			}

			logger.info(`Migrating ${convIds.length} conversations from legacy chat-history.json to user: ${this.currentUserDir}`);

			// Build ordered list: use order array first, then any remaining
			const orderedIds = [
				...order.filter((id) => conversations[id]),
				...convIds.filter((id) => !order.includes(id)),
			];

			for (const id of orderedIds) {
				const conv = conversations[id];
				if (!conv) continue;

				const convDir = join(this.chatsDir, id);
				if (existsSync(convDir)) {
					continue;
				}

				mkdirSync(convDir, { recursive: true });
				mkdirSync(join(convDir, "attachments"), { recursive: true });
				mkdirSync(join(convDir, "tool-outputs"), { recursive: true });

				const metadata: ConversationSummary = {
					id: conv.id,
					name: conv.name,
					createdAt: conv.createdAt,
					updatedAt: conv.updatedAt,
					messageCount: conv.messageCount,
					preview: conv.preview || "",
				};

				writeFileSync(
					join(convDir, "metadata.json"),
					JSON.stringify(metadata, null, 2),
					"utf-8",
				);
				writeFileSync(
					join(convDir, "messages.json"),
					JSON.stringify(conv.messages || [], null, 2),
					"utf-8",
				);
			}

			// Migrate attachments: best-effort (can't determine conversationId from filename)
			const legacyAttachmentsDir = join(app.getPath("userData"), "attachments");
			if (existsSync(legacyAttachmentsDir)) {
				try {
					const files = readdirSync(legacyAttachmentsDir);
					for (const file of files) {
						const filePath = join(legacyAttachmentsDir, file);
						if (!statSync(filePath).isFile()) continue;
						// Legacy attachments stay in the legacy directory
					}
				} catch {
					// Non-fatal
				}
			}

			if (lastConvId) {
				writeFileSync(
					join(this.chatsDir, ".last-conversation"),
					lastConvId,
					"utf-8",
				);
			}

			renameSync(legacyPath, `${legacyPath}.bak`);
			logger.info("Migration complete. Legacy chat-history.json renamed to .bak");
		} catch (error) {
			logger.error(
				"Migration from legacy chat-history.json failed",
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	// ============ Conversation CRUD ============

	getConversationList(): ConversationSummary[] {
		if (this.cachedList) return this.cachedList;

		const list: ConversationSummary[] = [];

		if (!existsSync(this.chatsDir)) {
			this.cachedList = list;
			return list;
		}

		const entries = readdirSync(this.chatsDir);
		for (const entry of entries) {
			if (entry.startsWith(".")) continue;
			const metadataPath = join(this.chatsDir, entry, "metadata.json");
			if (!existsSync(metadataPath)) continue;

			try {
				const raw = readFileSync(metadataPath, "utf-8");
				const metadata: ConversationSummary = JSON.parse(raw);
				list.push(metadata);
			} catch {
				// Skip corrupted entries
			}
		}

		list.sort((a, b) => b.updatedAt - a.updatedAt);
		this.cachedList = list;
		return list;
	}

	createConversation(name: string): ConversationSummary {
		const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const now = Date.now();

		const convDir = join(this.chatsDir, id);
		mkdirSync(convDir, { recursive: true });
		mkdirSync(join(convDir, "attachments"), { recursive: true });
		mkdirSync(join(convDir, "tool-outputs"), { recursive: true });

		const metadata: ConversationSummary = {
			id,
			name,
			createdAt: now,
			updatedAt: now,
			messageCount: 0,
			preview: "",
		};

		writeFileSync(
			join(convDir, "metadata.json"),
			JSON.stringify(metadata, null, 2),
			"utf-8",
		);
		writeFileSync(join(convDir, "messages.json"), "[]", "utf-8");

		this.cachedList = null;
		return metadata;
	}

	deleteConversation(id: string): void {
		const convDir = join(this.chatsDir, id);
		if (existsSync(convDir)) {
			rmSync(convDir, { recursive: true, force: true });
		}

		const lastId = this.getChatLastConversationId();
		if (lastId === id) {
			const lastConvPath = join(this.chatsDir, ".last-conversation");
			if (existsSync(lastConvPath)) {
				rmSync(lastConvPath);
			}
		}

		this.cachedList = null;
	}

	renameConversation(id: string, name: string): void {
		const metadataPath = join(this.chatsDir, id, "metadata.json");
		if (!existsSync(metadataPath)) {
			throw new Error(`Conversation not found: ${id}`);
		}

		const raw = readFileSync(metadataPath, "utf-8");
		const metadata: ConversationSummary = JSON.parse(raw);
		metadata.name = name;
		metadata.updatedAt = Date.now();

		writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
		this.cachedList = null;
	}

	// ============ Messages ============

	getMessages(conversationId: string): ChatMessagePersist[] {
		const messagesPath = join(this.chatsDir, conversationId, "messages.json");
		if (!existsSync(messagesPath)) return [];

		try {
			const raw = readFileSync(messagesPath, "utf-8");
			return JSON.parse(raw);
		} catch {
			return [];
		}
	}

	saveMessages(conversationId: string, messages: ChatMessagePersist[]): void {
		const convDir = join(this.chatsDir, conversationId);
		if (!existsSync(convDir)) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		const trimmed = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);

		writeFileSync(
			join(convDir, "messages.json"),
			JSON.stringify(trimmed, null, 2),
			"utf-8",
		);

		const metadataPath = join(convDir, "metadata.json");
		const raw = readFileSync(metadataPath, "utf-8");
		const metadata: ConversationSummary = JSON.parse(raw);
		metadata.messageCount = trimmed.length;
		metadata.updatedAt = Date.now();
		const firstUser = trimmed.find((m) => m.role === "user");
		metadata.preview = firstUser ? firstUser.content.slice(0, 100) : "";

		writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
		this.cachedList = null;
	}

	appendMessage(conversationId: string, message: ChatMessagePersist): void {
		const convDir = join(this.chatsDir, conversationId);
		if (!existsSync(convDir)) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		const messagesPath = join(convDir, "messages.json");
		let messages: ChatMessagePersist[] = [];
		if (existsSync(messagesPath)) {
			try {
				messages = JSON.parse(readFileSync(messagesPath, "utf-8"));
			} catch {
				messages = [];
			}
		}

		messages.push(message);
		if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
			messages = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
		}

		writeFileSync(messagesPath, JSON.stringify(messages, null, 2), "utf-8");

		const metadataPath = join(convDir, "metadata.json");
		const raw = readFileSync(metadataPath, "utf-8");
		const metadata: ConversationSummary = JSON.parse(raw);
		metadata.messageCount = messages.length;
		metadata.updatedAt = Date.now();
		if (message.role === "user" && !metadata.preview) {
			metadata.preview = message.content.slice(0, 100);
		}

		writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
		this.cachedList = null;
	}

	updateChatMessage(
		conversationId: string,
		messageId: string,
		updates: Partial<ChatMessagePersist>,
	): void {
		const convDir = join(this.chatsDir, conversationId);
		const messagesPath = join(convDir, "messages.json");
		if (!existsSync(messagesPath)) return;

		let messages: ChatMessagePersist[];
		try {
			messages = JSON.parse(readFileSync(messagesPath, "utf-8"));
		} catch {
			return;
		}

		const idx = messages.findIndex((m) => m.id === messageId);
		if (idx === -1) return;

		messages[idx] = { ...messages[idx], ...updates };
		writeFileSync(messagesPath, JSON.stringify(messages, null, 2), "utf-8");

		const metadataPath = join(convDir, "metadata.json");
		if (existsSync(metadataPath)) {
			const raw = readFileSync(metadataPath, "utf-8");
			const metadata: ConversationSummary = JSON.parse(raw);
			metadata.updatedAt = Date.now();
			writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
			this.cachedList = null;
		}
	}

	clearConversationMessages(conversationId: string): void {
		const convDir = join(this.chatsDir, conversationId);
		if (!existsSync(convDir)) return;

		writeFileSync(join(convDir, "messages.json"), "[]", "utf-8");

		const metadataPath = join(convDir, "metadata.json");
		if (existsSync(metadataPath)) {
			const raw = readFileSync(metadataPath, "utf-8");
			const metadata: ConversationSummary = JSON.parse(raw);
			metadata.messageCount = 0;
			metadata.preview = "";
			metadata.updatedAt = Date.now();
			writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
			this.cachedList = null;
		}
	}

	// ============ Last Conversation ============

	getChatLastConversationId(): string | undefined {
		const filePath = join(this.chatsDir, ".last-conversation");
		if (!existsSync(filePath)) return undefined;

		try {
			return readFileSync(filePath, "utf-8").trim() || undefined;
		} catch {
			return undefined;
		}
	}

	setChatLastConversationId(id: string): void {
		writeFileSync(join(this.chatsDir, ".last-conversation"), id, "utf-8");
	}

	// ============ Workspace Paths ============

	getConversationDir(conversationId: string): string {
		return join(this.chatsDir, conversationId);
	}

	getAttachmentsDir(conversationId: string): string {
		const dir = join(this.chatsDir, conversationId, "attachments");
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	getToolOutputsDir(conversationId: string): string {
		const dir = join(this.chatsDir, conversationId, "tool-outputs");
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}
}

export const conversationStorage = new ConversationStorageService();
