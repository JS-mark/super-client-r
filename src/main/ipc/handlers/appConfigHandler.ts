/**
 * App Config IPC Handler
 * 处理应用配置相关的 IPC 请求
 */

import { ipcMain, BrowserWindow } from "electron";
import { APP_CONFIG_CHANNELS } from "../channels";
import type { IPCRequest } from "../types";
import { appConfigService } from "../../services/config/AppConfigService";
import { logger } from "../../utils/logger";

/**
 * 注册 App Config 相关的 IPC handlers
 */
export function registerAppConfigHandlers(): void {
	// 获取当前配置
	ipcMain.handle(APP_CONFIG_CHANNELS.GET_CONFIG, async () => {
		try {
			const config = appConfigService.getConfig();
			return { success: true, data: config };
		} catch (error) {
			logger.error("[AppConfigHandler] Failed to get config", error as Error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	});

	// 刷新配置
	ipcMain.handle(APP_CONFIG_CHANNELS.REFRESH, async () => {
		try {
			const config = await appConfigService.refresh();
			return { success: true, data: config };
		} catch (error) {
			logger.error("[AppConfigHandler] Failed to refresh config", error as Error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	});

	logger.info("[AppConfigHandler] Handlers registered");
}

/**
 * 广播配置更新事件到所有窗口
 */
export function broadcastConfigUpdate(config: any): void {
	BrowserWindow.getAllWindows().forEach((win) => {
		win.webContents.send(APP_CONFIG_CHANNELS.CONFIG_UPDATED, config);
	});
}
