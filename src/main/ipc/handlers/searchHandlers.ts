import { ipcMain } from "electron";
import {
	storeManager,
	type SearchConfig,
	type SearchProviderType,
} from "../../store";
import { SEARCH_CHANNELS } from "../channels";
import { searchService } from "../../services/search/SearchService";
import type { SearchExecuteRequest } from "../types";

export function registerSearchHandlers() {
	// 执行搜索
	ipcMain.handle(
		SEARCH_CHANNELS.EXECUTE,
		async (_, request: SearchExecuteRequest) => {
			try {
				console.log(
					`[SearchHandler] Executing search: provider=${request.provider}, query="${request.query}"`,
				);
				const result = await searchService.execute(request);
				console.log(
					`[SearchHandler] Search completed: ${result.results.length} results in ${result.searchTimeMs}ms`,
				);
				return { success: true, data: result };
			} catch (error) {
				const errorMsg =
					error instanceof Error ? error.message : "Search execution failed";
				console.error(`[SearchHandler] Search failed:`, errorMsg);
				return {
					success: false,
					error: errorMsg,
				};
			}
		},
	);

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
				error:
					error instanceof Error
						? error.message
						: "Failed to get search configs",
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
				error:
					error instanceof Error
						? error.message
						: "Failed to save search config",
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
				error:
					error instanceof Error
						? error.message
						: "Failed to delete search config",
			};
		}
	});

	// 设置默认搜索引擎
	ipcMain.handle(
		SEARCH_CHANNELS.SET_DEFAULT,
		(_, provider: SearchProviderType | null) => {
			try {
				storeManager.setDefaultSearchProvider(provider);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to set default provider",
				};
			}
		},
	);

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
				error:
					error instanceof Error
						? error.message
						: "Failed to get default provider",
			};
		}
	});

	// 验证搜索配置 — 执行一次实际搜索来验证 API Key
	ipcMain.handle(
		SEARCH_CHANNELS.VALIDATE_CONFIG,
		async (_, config: SearchConfig) => {
			try {
				// 基本检查
				if (!config.apiKey || config.apiKey.trim() === "") {
					// SearXNG 不一定需要 apiKey
					if (config.provider !== "searxng") {
						return {
							success: true,
							data: { valid: false, error: "API Key is required" },
						};
					}
				}

				if (
					config.provider === "searxng" &&
					(!config.apiUrl || config.apiUrl.trim() === "")
				) {
					return {
						success: true,
						data: { valid: false, error: "API URL is required for SearXNG" },
					};
				}

				// 执行一次真实搜索来验证凭据
				console.log(`[SearchHandler] Validating ${config.provider} config...`);
				const result = await searchService.execute({
					provider: config.provider,
					query: "test",
					apiKey: config.apiKey,
					apiUrl: config.apiUrl,
					maxResults: 1,
					config: config.config,
				});
				console.log(
					`[SearchHandler] Validation succeeded for ${config.provider}, got ${result.results.length} results in ${result.searchTimeMs}ms`,
				);

				return {
					success: true,
					data: { valid: true },
				};
			} catch (error) {
				const errorMsg =
					error instanceof Error ? error.message : "Validation failed";
				console.error(
					`[SearchHandler] Validation failed for ${config.provider}:`,
					errorMsg,
				);
				return {
					success: true,
					data: { valid: false, error: errorMsg },
				};
			}
		},
	);
}
