import { ipcMain } from "electron";
import { storeManager, type SearchConfig, type SearchProviderType } from "../../store";
import { SEARCH_CHANNELS } from "../channels";

export function registerSearchHandlers() {
	// 获取所有搜索配置
	ipcMain.handle(SEARCH_CHANNELS.GET_CONFIGS, () => {
		try {
			const configs = storeManager.getSearchConfigs();
			const defaultProvider = storeManager.getDefaultSearchProvider();
			return {
				success: true,
				data: {
					configs,
					defaultProvider,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to get search configs",
			};
		}
	});

	// 保存搜索配置
	ipcMain.handle(SEARCH_CHANNELS.SAVE_CONFIG, (_, config: SearchConfig) => {
		try {
			storeManager.saveSearchConfig(config);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to save search config",
			};
		}
	});

	// 删除搜索配置
	ipcMain.handle(SEARCH_CHANNELS.DELETE_CONFIG, (_, id: string) => {
		try {
			storeManager.deleteSearchConfig(id);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to delete search config",
			};
		}
	});

	// 设置默认搜索引擎
	ipcMain.handle(SEARCH_CHANNELS.SET_DEFAULT, (_, provider: SearchProviderType | null) => {
		try {
			storeManager.setDefaultSearchProvider(provider);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to set default provider",
			};
		}
	});

	// 获取默认搜索引擎
	ipcMain.handle(SEARCH_CHANNELS.GET_DEFAULT, () => {
		try {
			const provider = storeManager.getDefaultSearchProvider();
			return {
				success: true,
				data: provider,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to get default provider",
			};
		}
	});

	// 验证搜索配置（模拟验证，实际应调用对应 API）
	ipcMain.handle(SEARCH_CHANNELS.VALIDATE_CONFIG, async (_, config: SearchConfig) => {
		try {
			// 模拟 API 验证延迟
			await new Promise((resolve) => setTimeout(resolve, 500));

			// 简单验证：检查 API Key 是否为空
			if (!config.apiKey || config.apiKey.trim() === "") {
				return {
					success: false,
					valid: false,
					error: "API Key is required",
				};
			}

			// 对于需要 API URL 的服务商，检查 URL 是否有效
			if (config.provider === "searxng" && (!config.apiUrl || config.apiUrl.trim() === "")) {
				return {
					success: false,
					valid: false,
					error: "API URL is required for SearXNG",
				};
			}

			// 模拟验证成功
			return {
				success: true,
				valid: true,
			};
		} catch (error) {
			return {
				success: false,
				valid: false,
				error: error instanceof Error ? error.message : "Validation failed",
			};
		}
	});
}
