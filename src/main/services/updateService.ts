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
    message: string;
  }> {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        const current = autoUpdater.currentVersion.version;
        const latest = result.updateInfo.version;
        if (latest !== current) {
          return {
            updateAvailable: true,
            version: latest,
            message: `New version ${latest} available`,
          };
        }
      }
      return {
        updateAvailable: false,
        message: "You are using the latest version",
      };
    } catch (error) {
      logger.error("Failed to check for updates", error as Error);
      return {
        updateAvailable: false,
        message: `Failed to check for updates: ${(error as Error).message}`,
      };
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  private sendToRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export const updateService = new UpdateService();
