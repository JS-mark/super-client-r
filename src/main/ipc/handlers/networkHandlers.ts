/**
 * 网络相关 IPC 处理器
 * 代理管理 + 请求日志追踪
 */

import { ipcMain } from "electron";
import { NETWORK_CHANNELS } from "../channels";
import type { ProxyConfig } from "../types";
import { proxyService } from "../../services/network/ProxyService";
import { requestLogService } from "../../services/network/RequestLogService";

export function registerNetworkHandlers(): void {
	// ============ 代理配置 ============

	ipcMain.handle(NETWORK_CHANNELS.GET_PROXY_CONFIG, async () => {
		try {
			const config = proxyService.getConfig();
			return { success: true, data: config ?? null };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	ipcMain.handle(
		NETWORK_CHANNELS.SET_PROXY_CONFIG,
		async (_event, config: ProxyConfig) => {
			try {
				proxyService.updateConfig(config);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	ipcMain.handle(
		NETWORK_CHANNELS.TEST_PROXY,
		async (_event, config: ProxyConfig) => {
			try {
				const result = await proxyService.testConnection(config);
				return { success: true, data: result };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// ============ 请求日志 ============

	ipcMain.handle(NETWORK_CHANNELS.GET_LOG_ENABLED, async () => {
		try {
			return { success: true, data: requestLogService.getEnabled() };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	ipcMain.handle(
		NETWORK_CHANNELS.SET_LOG_ENABLED,
		async (_event, enabled: boolean) => {
			try {
				requestLogService.setEnabled(enabled);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	ipcMain.handle(NETWORK_CHANNELS.GET_REQUEST_LOG, async () => {
		try {
			const entries = requestLogService.getEntries();
			return { success: true, data: entries };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	ipcMain.handle(NETWORK_CHANNELS.CLEAR_REQUEST_LOG, async () => {
		try {
			requestLogService.clearEntries();
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
}
