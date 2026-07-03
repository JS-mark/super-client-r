// @vitest-environment node

import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeProjectStorage } from "../../storage/ProjectStorageService";
import {
	getSessionStorage,
	initializeSessionStorage,
} from "../../storage/SessionStorageService";
import type { IMBotService } from "../../imbot/IMBotService";
import type { BotStatus, IMBotConfig, IMMessage } from "../../imbot/types";
import type { RemoteChatMessage } from "../../../ipc/types";
import {
	RemoteBotOfflineError,
	RemoteChatBridge,
	RemoteOutboundRejectedError,
} from "../RemoteChatBridge";

const mocks = vi.hoisted(() => ({
	broadcastEvent: vi.fn(),
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../../../ipc/events", () => ({
	broadcastEvent: mocks.broadcastEvent,
}));

vi.mock("../../../utils/logger", () => ({
	logger: mocks.logger,
}));

interface MockSendBot {
	sendMessage(chatId: string, content: string): Promise<void>;
}

class MockIMBotService extends EventEmitter {
	readonly sendMessage = vi
		.fn<(chatId: string, content: string) => Promise<void>>()
		.mockResolvedValue(undefined);
	readonly bots = new Map<string, MockSendBot>();
	private status: BotStatus["status"] = "running";
	private readonly config: IMBotConfig = {
		id: "bot-1",
		type: "telegram",
		name: "Test Bot",
		enabled: true,
	};

	constructor() {
		super();
		this.bots.set(this.config.id, { sendMessage: this.sendMessage });
	}

	setBotStatus(status: BotStatus["status"]): void {
		this.status = status;
		if (status === "running") {
			this.bots.set(this.config.id, { sendMessage: this.sendMessage });
		} else {
			this.bots.delete(this.config.id);
		}
	}

	getBotConfig(botId: string): IMBotConfig | undefined {
		return botId === this.config.id ? this.config : undefined;
	}

	getBotStatuses(): BotStatus[] {
		return [
			{
				id: this.config.id,
				name: this.config.name,
				type: this.config.type,
				status: this.status,
			},
		];
	}
}

let baseDir: string;
let imbotService: MockIMBotService;
let bridge: RemoteChatBridge;

function createIncomingIMMessage(overrides: Partial<IMMessage> = {}): IMMessage {
	return {
		id: "platform-message-42",
		type: "text",
		platform: "telegram",
		content: "hello from telegram",
		sender: { id: "u1", name: "User One" },
		chatId: "chat-1",
		timestamp: 10,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	baseDir = mkdtempSync(join(tmpdir(), "super-client-remote-chat-test-"));
	const projectStorage = initializeProjectStorage(baseDir, "default");
	initializeSessionStorage(baseDir, "default", projectStorage);
	imbotService = new MockIMBotService();
	bridge = new RemoteChatBridge(imbotService as unknown as IMBotService);
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
});

describe("RemoteChatBridge duplicate remote message handling", () => {
	it("drops duplicate persisted remote message ids for incoming and outgoing messages", () => {
		const session = getSessionStorage().create({ projectId: null });
		const incoming: RemoteChatMessage = {
			id: "in_platform-message-1",
			direction: "incoming",
			content: "first incoming",
			sender: { id: "u1", name: "User One" },
			platform: "telegram",
			timestamp: 1,
		};
		const outgoing: RemoteChatMessage = {
			id: "out_client-message-1",
			direction: "outgoing",
			content: "first outgoing",
			sender: { id: "self", name: "Me" },
			platform: "telegram",
			timestamp: 2,
		};

		bridge.appendRemoteMessage(session.id, incoming);
		bridge.appendRemoteMessage(session.id, {
			...incoming,
			content: "duplicate incoming should not win",
		});
		bridge.appendRemoteMessage(session.id, outgoing);
		bridge.appendRemoteMessage(session.id, {
			...outgoing,
			content: "duplicate outgoing should not win",
		});

		expect(bridge.getRemoteMessages(session.id)).toEqual([incoming, outgoing]);
		expect(mocks.logger.warn).toHaveBeenCalledTimes(2);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.duplicate-dropped",
			expect.objectContaining({
				conversationId: session.id,
				messageId: incoming.id,
				direction: "incoming",
			}),
		);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.duplicate-dropped",
			expect.objectContaining({
				conversationId: session.id,
				messageId: outgoing.id,
				direction: "outgoing",
			}),
		);
	});

	it("drops replayed incoming IM messages before broadcasting or persisting twice", () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		const message: IMMessage = {
			id: "platform-message-42",
			type: "text",
			platform: "telegram",
			content: "hello from telegram",
			sender: { id: "u1", name: "User One" },
			chatId: "chat-1",
			timestamp: 10,
		};

		imbotService.emit("raw-message", "bot-1", message);
		imbotService.emit("raw-message", "bot-1", {
			...message,
			content: "replayed payload should not win",
			timestamp: 11,
		});

		const persisted = bridge.getRemoteMessages(session.id);
		expect(persisted).toHaveLength(1);
		expect(persisted[0]).toEqual({
			id: "in_platform-message-42",
			direction: "incoming",
			content: "hello from telegram",
			sender: { id: "u1", name: "User One" },
			platform: "telegram",
			timestamp: 10,
		});
		expect(mocks.broadcastEvent).toHaveBeenCalledTimes(1);
		expect(mocks.broadcastEvent).toHaveBeenCalledWith(
			"remote-chat:im-message",
			expect.objectContaining({
				conversationId: session.id,
				content: "hello from telegram",
			}),
		);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.duplicate-dropped",
			expect.objectContaining({
				conversationId: session.id,
				messageId: "in_platform-message-42",
				direction: "incoming",
			}),
		);
	});
});

describe("RemoteChatBridge inactive remote receive handling", () => {
	it("drops incoming IM for a deleted/tombstoned bound session without broadcast or persistence", () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		getSessionStorage().delete(session.id);
		const events: unknown[] = [];
		bridge.on("remote.inactive-received", (payload) => events.push(payload));

		imbotService.emit("raw-message", "bot-1", createIncomingIMMessage());

		const payload = {
			conversationId: session.id,
			botId: "bot-1",
			chatId: "chat-1",
			platform: "telegram",
			reason: "deleted",
		};
		expect(mocks.broadcastEvent).not.toHaveBeenCalled();
		expect(bridge.getRemoteMessages(session.id)).toEqual([]);
		expect(events).toEqual([payload]);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.inactive-received",
			payload,
		);
	});

	it("drops incoming IM for an archived bound session without broadcast or persistence", () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		getSessionStorage().updateMeta(session.id, {
			archived: true,
		} as Parameters<ReturnType<typeof getSessionStorage>["updateMeta"]>[1]);
		const events: unknown[] = [];
		bridge.on("remote.inactive-received", (payload) => events.push(payload));

		imbotService.emit("raw-message", "bot-1", createIncomingIMMessage());

		const payload = {
			conversationId: session.id,
			botId: "bot-1",
			chatId: "chat-1",
			platform: "telegram",
			reason: "archived",
		};
		expect(mocks.broadcastEvent).not.toHaveBeenCalled();
		expect(bridge.getRemoteMessages(session.id)).toEqual([]);
		expect(events).toEqual([payload]);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.inactive-received",
			payload,
		);
	});

	it("drops incoming IM when bound session meta is missing", () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		rmSync(
			join(baseDir, "default", "casual-sessions", `${session.id}.meta.json`),
			{ force: true },
		);
		const events: unknown[] = [];
		bridge.on("remote.inactive-received", (payload) => events.push(payload));

		imbotService.emit("raw-message", "bot-1", createIncomingIMMessage());

		const payload = {
			conversationId: session.id,
			botId: "bot-1",
			chatId: "chat-1",
			platform: "telegram",
			reason: "missing-session",
		};
		expect(mocks.broadcastEvent).not.toHaveBeenCalled();
		expect(
			existsSync(
				join(
					baseDir,
					"default",
					"casual-sessions",
					session.id,
					"remote-messages.json",
				),
			),
		).toBe(false);
		expect(events).toEqual([payload]);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.inactive-received",
			payload,
		);
	});
});

describe("RemoteChatBridge bot lifecycle handling", () => {
	it("sends through a running bound bot and persists the outgoing message", async () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");

		await bridge.sendMessage(session.id, "hello from app");

		expect(imbotService.sendMessage).toHaveBeenCalledTimes(1);
		expect(imbotService.sendMessage).toHaveBeenCalledWith(
			"chat-1",
			"hello from app",
		);
		expect(bridge.getRemoteMessages(session.id)).toEqual([
			expect.objectContaining({
				direction: "outgoing",
				content: "hello from app",
				sender: { id: "self", name: "Me" },
				platform: "telegram",
			}),
		]);
	});

	it("emits, logs, and throws a structured remote.bot-offline error for a stopped bound bot", async () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		imbotService.setBotStatus("stopped");
		const events: unknown[] = [];
		bridge.on("remote.bot-offline", (payload) => events.push(payload));
		let caught: unknown;

		try {
			await bridge.sendMessage(session.id, "hello");
		} catch (error) {
			caught = error;
		}

		const payload = {
			conversationId: session.id,
			botId: "bot-1",
			chatId: "chat-1",
			platform: "telegram",
		};
		expect(caught).toBeInstanceOf(RemoteBotOfflineError);
		expect(caught).toMatchObject({
			name: "RemoteBotOfflineError",
			message: "Remote bot is offline",
			code: "remote.botOffline",
			details: payload,
		});
		expect(events).toEqual([payload]);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.bot-offline",
			payload,
		);
		expect(imbotService.sendMessage).not.toHaveBeenCalled();
		expect(bridge.getRemoteMessages(session.id)).toEqual([]);
	});
});

describe("RemoteChatBridge outbound lifecycle rejection", () => {
	it("emits a structured remote.archived rejection when the bound session is archived", async () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		getSessionStorage().updateMeta(session.id, {
			archived: true,
		} as Parameters<ReturnType<typeof getSessionStorage>["updateMeta"]>[1]);
		const rejections: unknown[] = [];
		bridge.on("remote.outbound-rejected", (payload) =>
			rejections.push(payload),
		);
		let caught: unknown;

		try {
			await bridge.sendMessage(session.id, "hello archived");
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(RemoteOutboundRejectedError);
		expect(caught).toMatchObject({
			name: "RemoteOutboundRejectedError",
			code: "remote.archived",
			details: expect.objectContaining({
				conversationId: session.id,
				code: "remote.archived",
				reason: "archived",
				state: "archived",
				botId: "bot-1",
				chatId: "chat-1",
				platform: "telegram",
			}),
		});
		expect(rejections).toEqual([
			expect.objectContaining({
				conversationId: session.id,
				code: "remote.archived",
				reason: "archived",
				state: "archived",
			}),
		]);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.outbound-rejected",
			expect.objectContaining({
				code: "remote.archived",
				state: "archived",
			}),
		);
		expect(imbotService.sendMessage).not.toHaveBeenCalled();
		expect(bridge.getRemoteMessages(session.id)).toEqual([]);
	});

	it("emits a structured remote.tombstoned rejection when the bound session is deleted", async () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		getSessionStorage().delete(session.id);
		const rejections: unknown[] = [];
		bridge.on("remote.outbound-rejected", (payload) =>
			rejections.push(payload),
		);
		let caught: unknown;

		try {
			await bridge.sendMessage(session.id, "hello tombstoned");
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(RemoteOutboundRejectedError);
		expect(caught).toMatchObject({
			name: "RemoteOutboundRejectedError",
			code: "remote.tombstoned",
			details: expect.objectContaining({
				conversationId: session.id,
				code: "remote.tombstoned",
				reason: "tombstoned",
				state: "tombstoned",
				botId: "bot-1",
				chatId: "chat-1",
				platform: "telegram",
			}),
		});
		expect(rejections).toEqual([
			expect.objectContaining({
				conversationId: session.id,
				code: "remote.tombstoned",
				reason: "tombstoned",
				state: "tombstoned",
			}),
		]);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.outbound-rejected",
			expect.objectContaining({
				code: "remote.tombstoned",
				state: "tombstoned",
			}),
		);
		expect(imbotService.sendMessage).not.toHaveBeenCalled();
	});
});
