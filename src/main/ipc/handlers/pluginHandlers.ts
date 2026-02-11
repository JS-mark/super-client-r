import { ipcMain, dialog } from "electron";
import * as path from "path";
import {
	getPluginManager,
	resetPluginManager,
} from "../../services/plugin/PluginManager";
import type { PluginManifest, PluginInfo } from "../../services/plugin/types";
import { storeManager } from "../../store/StoreManager";

// IPC 通道定义
export const PLUGIN_CHANNELS = {
	// 插件管理
	GET_ALL_PLUGINS: "plugin:getAll",
	GET_PLUGIN: "plugin:get",
	INSTALL_PLUGIN: "plugin:install",
	UNINSTALL_PLUGIN: "plugin:uninstall",
	ENABLE_PLUGIN: "plugin:enable",
	DISABLE_PLUGIN: "plugin:disable",
	ACTIVATE_PLUGIN: "plugin:activate",
	DEACTIVATE_PLUGIN: "plugin:deactivate",

	// 插件市场
	SEARCH_MARKET: "plugin:searchMarket",
	GET_MARKET_PLUGIN: "plugin:getMarketPlugin",
	DOWNLOAD_PLUGIN: "plugin:download",

	// 插件存储
	GET_STORAGE: "plugin:getStorage",
	SET_STORAGE: "plugin:setStorage",
	DELETE_STORAGE: "plugin:deleteStorage",

	// 快捷键
	GET_KEYBINDINGS: "plugin:getKeybindings",
	SET_KEYBINDINGS: "plugin:setKeybindings",
} as const;

// 插件市场API（模拟，实际应连接到远程服务）
interface MarketPlugin {
	id: string;
	name: string;
	displayName: string;
	description: string;
	version: string;
	author: string;
	icon?: string;
	categories: string[];
	downloads: number;
	rating: number;
	installed?: boolean;
}

// 模拟插件市场数据
const MOCK_MARKET_PLUGINS: MarketPlugin[] = [
	{
		id: "plugin-hello-world",
		name: "hello-world",
		displayName: "Hello World",
		description: "示例插件，演示插件系统基本功能",
		version: "1.0.0",
		author: "Super Client Team",
		categories: ["examples"],
		downloads: 1234,
		rating: 4.5,
	},
	{
		id: "plugin-markdown-exporter",
		name: "markdown-exporter",
		displayName: "Markdown导出器",
		description: "将聊天记录导出为Markdown格式",
		version: "1.2.0",
		author: "Community",
		categories: ["productivity", "export"],
	downloads: 5678,
		rating: 4.8,
	},
	{
		id: "plugin-code-runner",
		name: "code-runner",
		displayName: "代码运行器",
		description: "在沙箱环境中运行代码片段",
		version: "2.0.1",
		author: "DevTools Inc",
		categories: ["development", "tools"],
		downloads: 8901,
		rating: 4.2,
	},
	{
		id: "plugin-theme-switcher",
		name: "theme-switcher",
		displayName: "主题切换器",
		description: "快速切换和自定义主题",
		version: "1.5.0",
		author: "Theme Master",
		categories: ["themes", "customization"],
		downloads: 3456,
		rating: 4.6,
	},
];

/**
 * 注册插件相关IPC处理器
 */
export function registerPluginHandlers(): void {
	const pluginManager = getPluginManager();

	// ============ 插件管理 ============

	// 获取所有插件
	ipcMain.handle(
		PLUGIN_CHANNELS.GET_ALL_PLUGINS,
		async (): Promise<{ success: boolean; data?: PluginInfo[]; error?: string }> => {
			try {
				const plugins = pluginManager.getAllPlugins();
				return { success: true, data: plugins };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 获取单个插件
	ipcMain.handle(
		PLUGIN_CHANNELS.GET_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; data?: PluginInfo; error?: string }> => {
			try {
				const plugin = pluginManager.getPlugin(pluginId);
				if (!plugin) {
					return { success: false, error: `Plugin ${pluginId} not found` };
				}
				return { success: true, data: plugin };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 安装插件
	ipcMain.handle(
		PLUGIN_CHANNELS.INSTALL_PLUGIN,
		async (
			_event,
			{ sourcePath }: { sourcePath?: string } = {},
		): Promise<{ success: boolean; data?: PluginInfo; error?: string }> => {
			try {
				let targetPath = sourcePath;

				// 如果没有提供路径，打开文件选择对话框
				if (!targetPath) {
					const result = await dialog.showOpenDialog({
						properties: ["openDirectory"],
						title: "选择插件目录",
						buttonLabel: "安装插件",
					});

					if (result.canceled || result.filePaths.length === 0) {
						return { success: false, error: "Installation cancelled" };
					}

					targetPath = result.filePaths[0];
				}

				const plugin = await pluginManager.installPlugin(targetPath);
				return { success: true, data: plugin };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 卸载插件
	ipcMain.handle(
		PLUGIN_CHANNELS.UNINSTALL_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				await pluginManager.uninstallPlugin(pluginId);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 启用插件
	ipcMain.handle(
		PLUGIN_CHANNELS.ENABLE_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				await pluginManager.enablePlugin(pluginId);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 禁用插件
	ipcMain.handle(
		PLUGIN_CHANNELS.DISABLE_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				await pluginManager.disablePlugin(pluginId);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 激活插件
	ipcMain.handle(
		PLUGIN_CHANNELS.ACTIVATE_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				await pluginManager.activatePlugin(pluginId);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 停用插件
	ipcMain.handle(
		PLUGIN_CHANNELS.DEACTIVATE_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				await pluginManager.deactivatePlugin(pluginId);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// ============ 插件市场 ============

	// 搜索插件市场
	ipcMain.handle(
		PLUGIN_CHANNELS.SEARCH_MARKET,
		async (
			_event,
			{
				query,
				category,
			}: { query?: string; category?: string } = {},
		): Promise<{ success: boolean; data?: MarketPlugin[]; error?: string }> => {
			try {
				let results = [...MOCK_MARKET_PLUGINS];

				// 过滤已安装的插件
				const installedPlugins = pluginManager.getAllPlugins();
				const installedIds = new Set(installedPlugins.map((p) => p.id));

				results = results.map((p) => ({
					...p,
					installed: installedIds.has(p.id),
				}));

				// 搜索过滤
				if (query) {
					const lowerQuery = query.toLowerCase();
					results = results.filter(
						(p) =>
							p.name.toLowerCase().includes(lowerQuery) ||
							p.displayName.toLowerCase().includes(lowerQuery) ||
							p.description.toLowerCase().includes(lowerQuery),
					);
				}

				// 分类过滤
				if (category) {
					results = results.filter((p) => p.categories.includes(category));
				}

				return { success: true, data: results };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 获取市场插件详情
	ipcMain.handle(
		PLUGIN_CHANNELS.GET_MARKET_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; data?: MarketPlugin; error?: string }> => {
			try {
				const plugin = MOCK_MARKET_PLUGINS.find((p) => p.id === pluginId);
				if (!plugin) {
					return { success: false, error: "Plugin not found in market" };
				}

				const installedPlugins = pluginManager.getAllPlugins();
				const installed = installedPlugins.some((p) => p.id === pluginId);

				return {
					success: true,
					data: { ...plugin, installed },
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 下载并安装插件
	ipcMain.handle(
		PLUGIN_CHANNELS.DOWNLOAD_PLUGIN,
		async (
			_event,
			{ pluginId }: { pluginId: string },
		): Promise<{ success: boolean; data?: PluginInfo; error?: string }> => {
			try {
				// 模拟下载过程
				console.log(`[Plugin] Downloading plugin ${pluginId}...`);

				// TODO: 实际应从远程下载插件包
				// 这里创建一个模拟的插件目录
				const pluginData = MOCK_MARKET_PLUGINS.find((p) => p.id === pluginId);
				if (!pluginData) {
					return { success: false, error: "Plugin not found in market" };
				}

				// 模拟下载延迟
				await new Promise((resolve) => setTimeout(resolve, 1000));

				// TODO: 解压并安装插件
				// const plugin = await pluginManager.installPlugin(downloadedPath);

				return {
					success: false,
					error: "Not implemented: Actual download functionality",
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// ============ 插件存储 ============

	// 获取插件存储数据
	ipcMain.handle(
		PLUGIN_CHANNELS.GET_STORAGE,
		async (
			_event,
			{ pluginId, key }: { pluginId: string; key: string },
		): Promise<{ success: boolean; data?: unknown; error?: string }> => {
			try {
				const pluginsData = storeManager.getConfig("pluginsData") || {};
				const data = pluginsData[`${pluginId}.${key}`];
				return { success: true, data };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 设置插件存储数据
	ipcMain.handle(
		PLUGIN_CHANNELS.SET_STORAGE,
		async (
			_event,
			{ pluginId, key, value }: { pluginId: string; key: string; value: unknown },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				const pluginsData = (storeManager.getConfig("pluginsData") as Record<string, unknown>) || {};
				pluginsData[`${pluginId}.${key}`] = value;
				storeManager.setConfig("pluginsData", pluginsData);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 删除插件存储数据
	ipcMain.handle(
		PLUGIN_CHANNELS.DELETE_STORAGE,
		async (
			_event,
			{ pluginId, key }: { pluginId: string; key: string },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				const pluginsData = (storeManager.getConfig("pluginsData") as Record<string, unknown>) || {};
				delete pluginsData[`${pluginId}.${key}`];
				storeManager.setConfig("pluginsData", pluginsData);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// ============ 快捷键 ============

	// 获取快捷键配置
	ipcMain.handle(
		PLUGIN_CHANNELS.GET_KEYBINDINGS,
		async (): Promise<{
			success: boolean;
			data?: Record<string, string>;
			error?: string;
		}> => {
			try {
				const keybindings = storeManager.getConfig("keybindings") || {};
				return { success: true, data: keybindings };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 设置快捷键配置
	ipcMain.handle(
		PLUGIN_CHANNELS.SET_KEYBINDINGS,
		async (
			_event,
			{ keybindings }: { keybindings: Record<string, string> },
		): Promise<{ success: boolean; error?: string }> => {
			try {
				storeManager.setConfig("keybindings", keybindings);
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);
}

/**
 * 初始化插件管理器
 */
export async function initializePluginManager(): Promise<void> {
	const pluginManager = getPluginManager();
	await pluginManager.initialize();
	console.log("[PluginHandlers] Plugin manager initialized");
}

/**
 * 清理插件处理器
 */
export function disposePluginHandlers(): void {
	const pluginManager = getPluginManager();
	pluginManager.dispose();
	resetPluginManager();
	console.log("[PluginHandlers] Plugin manager disposed");
}
