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
	RemoteBindingConflictError,
	RemoteBotMissingError,
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
		withContext: vi.fn(() => ({
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		})),
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

	private configPresent = true;

	getBotConfig(botId: string): IMBotConfig | undefined {
		if (!this.configPresent) return undefined;
		return botId === this.config.id ? this.config : undefined;
	}

	/** Test helper: simulate the bot config being deleted after bindings exist. */
	removeConfig(): void {
		this.configPresent = false;
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
		// Only ONE im-message broadcast (first delivery); the replay is
		// dropped before broadcast. The duplicate-dropped path itself
		// broadcasts on a separate lifecycle channel, so the total call
		// count is 2 — this assertion narrows to the im-message channel.
		const imBroadcasts = mocks.broadcastEvent.mock.calls.filter(
			(args: unknown[]) => args[0] === "remote-chat:im-message",
		);
		expect(imBroadcasts).toHaveLength(1);
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
		// The inbound IM must NOT surface as a chat message. The bridge is
		// allowed to broadcast a `remote-chat:inactive-received` lifecycle
		// event on this path (that's how renderer learns the drop happened),
		// but nothing on the im-message channel.
		expect(mocks.broadcastEvent).not.toHaveBeenCalledWith(
			"remote-chat:im-message",
			expect.anything(),
		);
		expect(bridge.getRemoteMessages(session.id)).toEqual([]);
		expect(events).toEqual([payload]);
		expect(mocks.logger.warn).toHaveBeenCalledWith(
			"[RemoteChatBridge] remote.inactive-received",
			payload,
		);
		// Replay counter bumped on the tombstone (spec §5).
		const listedTombstones = getSessionStorage().listDeleted();
		const tombstoned = listedTombstones.find((m) => m.id === session.id);
		expect(tombstoned?.tombstone?.replayCount).toBe(1);
		expect(typeof tombstoned?.tombstone?.lastReplayAt).toBe("number");

		// A second inbound to the same tombstoned session bumps to 2.
		imbotService.emit("raw-message", "bot-1", {
			botType: "telegram",
			chatId: "chat-1",
			messageId: "platform-message-99",
			senderId: "u1",
			senderName: "User One",
			content: "second replay",
			timestamp: 20,
		});
		const listedAgain = getSessionStorage().listDeleted();
		const tombstonedAgain = listedAgain.find((m) => m.id === session.id);
		expect(tombstonedAgain?.tombstone?.replayCount).toBe(2);
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
		// The inbound IM must NOT surface as a chat message. The bridge is
		// allowed to broadcast a `remote-chat:inactive-received` lifecycle
		// event on this path (that's how renderer learns the drop happened),
		// but nothing on the im-message channel.
		expect(mocks.broadcastEvent).not.toHaveBeenCalledWith(
			"remote-chat:im-message",
			expect.anything(),
		);
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
		// The inbound IM must NOT surface as a chat message. The bridge is
		// allowed to broadcast a `remote-chat:inactive-received` lifecycle
		// event on this path (that's how renderer learns the drop happened),
		// but nothing on the im-message channel.
		expect(mocks.broadcastEvent).not.toHaveBeenCalledWith(
			"remote-chat:im-message",
			expect.anything(),
		);
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

describe("RemoteChatBridge lifecycle broadcast wiring", () => {
	it("broadcasts remote-chat:outbound-rejected on outbound rejection", async () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		getSessionStorage().updateMeta(session.id, {
			archived: true,
		} as Parameters<ReturnType<typeof getSessionStorage>["updateMeta"]>[1]);

		try {
			await bridge.sendMessage(session.id, "hi");
		} catch {
			// expected
		}

		expect(mocks.broadcastEvent).toHaveBeenCalledWith(
			"remote-chat:outbound-rejected",
			expect.objectContaining({
				conversationId: session.id,
				code: "remote.archived",
				state: "archived",
			}),
		);
	});

	it("broadcasts remote-chat:inactive-received when IM arrives for a tombstoned session", () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		getSessionStorage().delete(session.id);
		mocks.broadcastEvent.mockClear();

		imbotService.emit("raw-message", "bot-1", createIncomingIMMessage());

		expect(mocks.broadcastEvent).toHaveBeenCalledWith(
			"remote-chat:inactive-received",
			expect.objectContaining({
				conversationId: session.id,
				reason: "deleted",
			}),
		);
	});

	it("broadcasts remote-chat:duplicate-dropped when a replayed IM message id is dropped", () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		const message = createIncomingIMMessage();
		imbotService.emit("raw-message", "bot-1", message);
		mocks.broadcastEvent.mockClear();
		// Replay same message id → duplicate-dropped path.
		imbotService.emit("raw-message", "bot-1", message);

		expect(mocks.broadcastEvent).toHaveBeenCalledWith(
			"remote-chat:duplicate-dropped",
			expect.objectContaining({
				conversationId: session.id,
				direction: "incoming",
			}),
		);
	});

	it("broadcasts remote-chat:bot-offline when sendMessage hits a stopped bot", async () => {
		const session = getSessionStorage().create({ projectId: null });
		bridge.bind(session.id, "bot-1", "chat-1");
		imbotService.setBotStatus("stopped");
		mocks.broadcastEvent.mockClear();

		try {
			await bridge.sendMessage(session.id, "hi");
		} catch {
			// expected — RemoteBotOfflineError
		}

		expect(mocks.broadcastEvent).toHaveBeenCalledWith(
			"remote-chat:bot-offline",
			expect.objectContaining({
				conversationId: session.id,
				botId: "bot-1",
			}),
		);
	});
});

describe("RemoteChatBridge typed binding errors", () => {
	it("bind throws RemoteBindingConflictError when (botId, chatId) is already bound to another conversation", () => {
		const s1 = getSessionStorage().create({ projectId: null });
		const s2 = getSessionStorage().create({ projectId: null });
		bridge.bind(s1.id, "bot-1", "chat-1");
		let caught: unknown;
		try {
			bridge.bind(s2.id, "bot-1", "chat-1");
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(RemoteBindingConflictError);
		expect(caught).toMatchObject({
			name: "RemoteBindingConflictError",
			code: "remote.binding-conflict",
			details: {
				requestedConversationId: s2.id,
				existingConversationId: s1.id,
				botId: "bot-1",
				chatId: "chat-1",
			},
		});
	});

	it("bind throws RemoteBotMissingError when bot config is not present", () => {
		const s = getSessionStorage().create({ projectId: null });
		let caught: unknown;
		try {
			bridge.bind(s.id, "bot-missing-xyz", "chat-1");
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(RemoteBotMissingError);
		expect(caught).toMatchObject({
			name: "RemoteBotMissingError",
			code: "remote.bot-missing",
			details: { botId: "bot-missing-xyz", conversationId: s.id },
		});
	});

	it("bind is idempotent when the same conversationId re-binds the same (botId, chatId)", () => {
		const s = getSessionStorage().create({ projectId: null });
		const first = bridge.bind(s.id, "bot-1", "chat-1");
		const second = bridge.bind(s.id, "bot-1", "chat-1");
		expect(second.botId).toBe(first.botId);
		expect(second.chatId).toBe(first.chatId);
	});
});

describe("RemoteChatBridge startup bot-missing detection", () => {
	it("emits remote.bot-missing when a stored binding references a missing bot config", () => {
		// Create a session with a binding to bot-1, then delete the bot
		// config, then re-construct the bridge to trigger the startup scan.
		const s = getSessionStorage().create({ projectId: null });
		bridge.bind(s.id, "bot-1", "chat-1");
		imbotService.removeConfig();

		const emitted: unknown[] = [];
		const nextService = new MockIMBotService();
		nextService.removeConfig();
		const nextBridge = new RemoteChatBridge(nextService as unknown as IMBotService);
		nextBridge.on("remote.bot-missing", (payload) => emitted.push(payload));
		// The emit happens INSIDE the constructor (via loadBindingsFromStorage);
		// to capture it we listen on the same channel via broadcastEvent mock.
		expect(mocks.broadcastEvent).toHaveBeenCalledWith(
			"remote-chat:bot-missing",
			expect.objectContaining({
				botId: "bot-1",
				conversationIds: expect.arrayContaining([s.id]),
			}),
		);
		// Binding is retained (spec: "startup with missing bot preserves
		// binding as recoverable") — grep by getBinding.
		expect(nextBridge.getBinding(s.id)).toMatchObject({ botId: "bot-1" });
	});

	it("does not emit remote.bot-missing when all bindings have live bot configs", () => {
		const s = getSessionStorage().create({ projectId: null });
		bridge.bind(s.id, "bot-1", "chat-1");
		mocks.broadcastEvent.mockClear();
		const nextService = new MockIMBotService();
		void new RemoteChatBridge(nextService as unknown as IMBotService);
		expect(mocks.broadcastEvent).not.toHaveBeenCalledWith(
			"remote-chat:bot-missing",
			expect.anything(),
		);
	});
});

describe("RemoteChatBridge listBindingsWithLifecycle", () => {
	it("returns every current binding with a classified lifecycle state", () => {
		const s1 = getSessionStorage().create({ projectId: null });
		const s2 = getSessionStorage().create({ projectId: null });
		bridge.bind(s1.id, "bot-1", "chat-1");
		bridge.bind(s2.id, "bot-1", "chat-2");

		const entries = bridge.listBindingsWithLifecycle();
		expect(entries).toHaveLength(2);
		const ids = entries.map((e) => e.conversationId).sort();
		expect(ids).toEqual([s1.id, s2.id].sort());
		// Both are live + bound + bot running → bound-idle.
		for (const entry of entries) {
			expect(entry.binding.botId).toBe("bot-1");
			expect(entry.state).toBe("bound-idle");
		}
	});

	it("classifies a tombstoned binding as tombstoned in the list", () => {
		const s = getSessionStorage().create({ projectId: null });
		bridge.bind(s.id, "bot-1", "chat-1");
		getSessionStorage().delete(s.id);
		const entries = bridge.listBindingsWithLifecycle();
		const entry = entries.find((e) => e.conversationId === s.id);
		expect(entry?.state).toBe("tombstoned");
	});

	it("returns an empty array when there are no bindings", () => {
		expect(bridge.listBindingsWithLifecycle()).toEqual([]);
	});
});
