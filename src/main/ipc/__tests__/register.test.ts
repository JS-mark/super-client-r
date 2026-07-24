// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteBotOfflineError } from "../../services/remote-chat/RemoteChatBridge";
import { registerAPI, toChannel } from "../register";

type IpcHandler = (
	event: unknown,
	...args: unknown[]
) => unknown | Promise<unknown>;

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, IpcHandler>(),
	ipcMain: {
		handle: vi.fn((channel: string, handler: IpcHandler) => {
			mocks.handlers.set(channel, handler);
		}),
		removeHandler: vi.fn(),
	},
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		withContext: vi.fn(() => ({
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		})),
	},
}));

vi.mock("electron", () => ({
	ipcMain: mocks.ipcMain,
}));

vi.mock("../../utils/logger", () => ({
	logger: mocks.logger,
}));

describe("registerAPI error responses", () => {
	beforeEach(() => {
		mocks.handlers.clear();
		vi.clearAllMocks();
	});

	it("returns remote.botOffline code and details through the IPC handler", async () => {
		const details = {
			conversationId: "conv-1",
			botId: "bot-1",
			chatId: "chat-1",
			platform: "telegram",
		} as const;
		registerAPI({
			remoteChat: {
				sendMessage: async () => {
					throw new RemoteBotOfflineError(details);
				},
			},
		});

		const handler = mocks.handlers.get(toChannel("remoteChat", "sendMessage"));
		const response = await handler?.({}, "conv-1", "hello");

		expect(response).toEqual({
			success: false,
			error: "Remote bot is offline",
			code: "remote.botOffline",
			details,
		});
	});

	it("keeps ordinary errors compatible with the existing IPC envelope", async () => {
		registerAPI({
			remoteChat: {
				sendMessage: async () => {
					throw new Error("plain failure");
				},
			},
		});

		const handler = mocks.handlers.get(toChannel("remoteChat", "sendMessage"));
		const response = await handler?.({}, "conv-1", "hello");

		expect(response).toEqual({
			success: false,
			error: "plain failure",
		});
	});
});
