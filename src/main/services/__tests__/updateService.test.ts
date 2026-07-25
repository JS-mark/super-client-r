// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// electron-updater 的 autoUpdater 是模块级单例：用可控 mock 替换，
// 捕获注册的事件回调，便于断言 main → renderer 的事件转发。
// vi.mock 会被提升到文件顶部，因此 mock 对象必须经 vi.hoisted 提供。
const { listeners, mockAutoUpdater, mockLogger } = vi.hoisted(() => {
	const listeners = new Map<string, (arg?: unknown) => void>();
	const mockAutoUpdater = {
		autoDownload: true,
		autoInstallOnAppQuit: false,
		logger: {} as unknown,
		currentVersion: { version: "1.0.0" },
		on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
			listeners.set(event, cb);
		}),
		getFeedURL: vi.fn(() => "https://github.com/js-mark/super-client-r"),
		checkForUpdates: vi.fn(),
		downloadUpdate: vi.fn(async () => {}),
		quitAndInstall: vi.fn(),
	};
	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
	return { listeners, mockAutoUpdater, mockLogger };
});

vi.mock("electron-updater", () => ({
	autoUpdater: mockAutoUpdater,
}));

vi.mock("../../utils/logger", () => ({
	logger: mockLogger,
}));

// mock 声明后再引入被测单例。
import { UPDATE_CHANNELS } from "../../ipc/channels";
import { updateService } from "../updateService";

function makeMainWindow() {
	const send = vi.fn();
	return {
		window: {
			isDestroyed: () => false,
			webContents: { send },
		},
		send,
	};
}

describe("updateService", () => {
	beforeEach(() => {
		listeners.clear();
		vi.clearAllMocks();
		mockAutoUpdater.getFeedURL.mockReturnValue(
			"https://github.com/js-mark/super-client-r",
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("configures autoUpdater and registers event listeners on initialize", () => {
		const { window } = makeMainWindow();
		// biome-ignore lint/suspicious/noExplicitAny: test double
		updateService.initialize(window as any);

		expect(mockAutoUpdater.autoDownload).toBe(false);
		expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
		// 六个事件都应注册
		expect(listeners.has("checking-for-update")).toBe(true);
		expect(listeners.has("update-available")).toBe(true);
		expect(listeners.has("update-not-available")).toBe(true);
		expect(listeners.has("download-progress")).toBe(true);
		expect(listeners.has("update-downloaded")).toBe(true);
		expect(listeners.has("error")).toBe(true);
	});

	it("logs an error when the feed URL is not https (SUP-8 update source guard)", () => {
		mockAutoUpdater.getFeedURL.mockReturnValue(
			"http://insecure.example.com/feed",
		);
		const { window } = makeMainWindow();
		// biome-ignore lint/suspicious/noExplicitAny: test double
		updateService.initialize(window as any);

		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.stringContaining("not https"),
		);
	});

	it("does not flag an https feed URL", () => {
		const { window } = makeMainWindow();
		// biome-ignore lint/suspicious/noExplicitAny: test double
		updateService.initialize(window as any);

		const flaggedHttps = mockLogger.error.mock.calls.some((c) =>
			String(c[0]).includes("not https"),
		);
		expect(flaggedHttps).toBe(false);
	});

	it("forwards autoUpdater events to the renderer over UPDATE_CHANNELS", () => {
		const { window, send } = makeMainWindow();
		// biome-ignore lint/suspicious/noExplicitAny: test double
		updateService.initialize(window as any);

		listeners.get("checking-for-update")?.();
		expect(send).toHaveBeenCalledWith(UPDATE_CHANNELS.CHECKING, undefined);

		listeners.get("update-available")?.({ version: "2.0.0" });
		expect(send).toHaveBeenCalledWith(UPDATE_CHANNELS.AVAILABLE, {
			version: "2.0.0",
		});

		listeners.get("update-not-available")?.({ version: "1.0.0" });
		expect(send).toHaveBeenCalledWith(UPDATE_CHANNELS.NOT_AVAILABLE, {
			version: "1.0.0",
		});

		listeners.get("download-progress")?.({ percent: 42 });
		expect(send).toHaveBeenCalledWith(UPDATE_CHANNELS.PROGRESS, {
			percent: 42,
		});

		listeners.get("update-downloaded")?.({ version: "2.0.0" });
		expect(send).toHaveBeenCalledWith(UPDATE_CHANNELS.DOWNLOADED, {
			version: "2.0.0",
		});

		listeners.get("error")?.(new Error("boom"));
		expect(send).toHaveBeenCalledWith(UPDATE_CHANNELS.ERROR, "boom");
	});

	it("checkForUpdates reports an available update when versions differ", async () => {
		mockAutoUpdater.checkForUpdates.mockResolvedValue({
			updateInfo: { version: "2.0.0" },
		});
		const result = await updateService.checkForUpdates();
		expect(result).toEqual({ updateAvailable: true, version: "2.0.0" });
	});

	it("checkForUpdates reports no update when versions match", async () => {
		mockAutoUpdater.checkForUpdates.mockResolvedValue({
			updateInfo: { version: "1.0.0" },
		});
		const result = await updateService.checkForUpdates();
		expect(result).toEqual({ updateAvailable: false });
	});

	it("checkForUpdates returns an error field when autoUpdater throws", async () => {
		mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error("network"));
		const result = await updateService.checkForUpdates();
		expect(result.updateAvailable).toBe(false);
		expect(result.error).toBe("network");
	});

	it("downloadUpdate delegates to autoUpdater.downloadUpdate", async () => {
		await updateService.downloadUpdate();
		expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
	});

	it("quitAndInstall delegates to autoUpdater.quitAndInstall", () => {
		updateService.quitAndInstall();
		expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
	});
});
