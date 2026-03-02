/**
 * Webhook IPC 处理器
 */

import { ipcMain } from "electron";
import { WEBHOOK_CHANNELS } from "../channels";
import type { WebhookConfig } from "../types";
import { storeManager } from "../../store/StoreManager";
import { webhookService } from "../../services/market/WebhookService";

export function registerWebhookHandlers(): void {
	// 获取 Webhook 配置列表
	ipcMain.handle(WEBHOOK_CHANNELS.GET_CONFIGS, async () => {
		try {
			const configs = storeManager.getWebhookConfigs();
			return { success: true, data: configs };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to get webhook configs",
			};
		}
	});

	// 保存 Webhook 配置
	ipcMain.handle(WEBHOOK_CHANNELS.SAVE_CONFIG, async (_event, config: WebhookConfig) => {
		try {
			storeManager.saveWebhookConfig(config);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to save webhook config",
			};
		}
	});

	// 删除 Webhook 配置
	ipcMain.handle(WEBHOOK_CHANNELS.DELETE_CONFIG, async (_event, id: string) => {
		try {
			storeManager.deleteWebhookConfig(id);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to delete webhook config",
			};
		}
	});

	// 测试 Webhook
	ipcMain.handle(WEBHOOK_CHANNELS.TEST_WEBHOOK, async (_event, configId: string) => {
		try {
			const result = await webhookService.test(configId);
			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Webhook test failed",
			};
		}
	});
}
