/**
 * App Config Service Client
 * Renderer 进程访问应用配置的客户端
 */

import type { AppInitConfig } from "@/types";

export const appConfigService = {
	/**
	 * 获取当前配置
	 */
	getConfig: async (): Promise<AppInitConfig | null> => {
		const response = await window.electron.appConfig.getConfig();
		if (response.success) {
			return response.data || null;
		}
		throw new Error(response.error || "Failed to get config");
	},

	/**
	 * 刷新配置
	 */
	refresh: async (): Promise<AppInitConfig | null> => {
		const response = await window.electron.appConfig.refresh();
		if (response.success) {
			return response.data || null;
		}
		throw new Error(response.error || "Failed to refresh config");
	},

	/**
	 * 监听配置更新事件
	 */
	onConfigUpdated: (callback: (config: AppInitConfig) => void) => {
		return window.electron.appConfig.onConfigUpdated(callback);
	},
};
