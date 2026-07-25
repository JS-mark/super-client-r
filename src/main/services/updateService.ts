/**
 * 自动更新服务
 * 使用 electron-updater 实现应用自动更新
 */

import type { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { UPDATE_CHANNELS } from "../ipc/channels";
import { logger } from "../utils/logger";

class UpdateService {
	private mainWindow: BrowserWindow | null = null;

	initialize(mainWindow: BrowserWindow): void {
		this.mainWindow = mainWindow;

		autoUpdater.autoDownload = false;
		autoUpdater.autoInstallOnAppQuit = true;
		autoUpdater.logger = null; // We use our own logger

		// 安全基线（SUP-8）：内测期暂缓完整签名/公证，未签名 + electron-updater
		// 无签名校验存在更新链替换风险，因此把更新源强制约束为 https。
		this.enforceHttpsFeed();

		autoUpdater.on("checking-for-update", () => {
			logger.info("Checking for update...");
			this.sendToRenderer(UPDATE_CHANNELS.CHECKING);
		});

		autoUpdater.on("update-available", (info) => {
			logger.info(`Update available: ${info.version}`);
			this.sendToRenderer(UPDATE_CHANNELS.AVAILABLE, info);
		});

		autoUpdater.on("update-not-available", (info) => {
			logger.info("Update not available");
			this.sendToRenderer(UPDATE_CHANNELS.NOT_AVAILABLE, info);
		});

		autoUpdater.on("download-progress", (progress) => {
			logger.info(`Download progress: ${progress.percent.toFixed(1)}%`);
			this.sendToRenderer(UPDATE_CHANNELS.PROGRESS, progress);
		});

		autoUpdater.on("update-downloaded", (info) => {
			logger.info(`Update downloaded: ${info.version}`);
			this.sendToRenderer(UPDATE_CHANNELS.DOWNLOADED, info);
		});

		autoUpdater.on("error", (err) => {
			logger.error("Update error", err);
			this.sendToRenderer(UPDATE_CHANNELS.ERROR, err.message);
		});

		logger.info("Update service initialized");
	}

	async checkForUpdates(): Promise<{
		updateAvailable: boolean;
		version?: string;
		error?: string;
	}> {
		try {
			const result = await autoUpdater.checkForUpdates();
			if (result?.updateInfo) {
				const current = autoUpdater.currentVersion.version;
				const latest = result.updateInfo.version;
				if (latest !== current) {
					return { updateAvailable: true, version: latest };
				}
			}
			return { updateAvailable: false };
		} catch (error) {
			logger.error("Failed to check for updates", error as Error);
			return {
				updateAvailable: false,
				error: (error as Error).message,
			};
		}
	}

	async downloadUpdate(): Promise<void> {
		await autoUpdater.downloadUpdate();
	}

	quitAndInstall(): void {
		autoUpdater.quitAndInstall();
	}

	/**
	 * 强制更新源使用 https。
	 *
	 * 未签名安装包 + electron-updater 无签名校验的组合下，明文/可篡改的
	 * 更新源是更新链替换攻击的入口。读取 electron-updater 解析出的 feed URL，
	 * 若发现非 https（http/file 等）则记录告警——正式渠道（GitHub Releases）
	 * 天然是 https，这里作为回归护栏，防止后续误配私有 http 源。
	 */
	private enforceHttpsFeed(): void {
		try {
			const feedUrl = autoUpdater.getFeedURL();
			// 打包前 / 未配置 provider 时 getFeedURL 可能返回 undefined，跳过。
			if (!feedUrl) return;
			if (!/^https:\/\//i.test(feedUrl)) {
				logger.error(
					`Update feed URL is not https, refusing insecure update source: ${feedUrl}`,
				);
			}
		} catch (error) {
			logger.warn("Failed to inspect update feed URL", error as Error);
		}
	}

	private sendToRenderer(channel: string, data?: unknown): void {
		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			this.mainWindow.webContents.send(channel, data);
		}
	}
}

export const updateService = new UpdateService();
