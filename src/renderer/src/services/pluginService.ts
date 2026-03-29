import type { PluginInfo, PluginCommand, MarketPlugin } from "../types/plugin";

/**
 * IPC 通道定义（kebab-case，与 api-impl registerAPI 自动生成的 channel 对齐）
 */
const PLUGIN_CHANNELS = {
	GET_ALL_PLUGINS: "plugin:get-all-plugins",
	GET_PLUGIN: "plugin:get-plugin",
	INSTALL_PLUGIN: "plugin:install-plugin",
	UNINSTALL_PLUGIN: "plugin:uninstall-plugin",
	ENABLE_PLUGIN: "plugin:enable-plugin",
	DISABLE_PLUGIN: "plugin:disable-plugin",
	ACTIVATE_PLUGIN: "plugin:activate-plugin",
	DEACTIVATE_PLUGIN: "plugin:deactivate-plugin",
	SEARCH_MARKET: "plugin:search-market",
	GET_MARKET_PLUGIN: "plugin:get-market-plugin",
	DOWNLOAD_PLUGIN: "plugin:download-plugin",
	GET_COMMANDS: "plugin:get-commands",
	EXECUTE_COMMAND: "plugin:execute-command",
	GET_STORAGE: "plugin:get-storage",
	SET_STORAGE: "plugin:set-storage",
	DELETE_STORAGE: "plugin:delete-storage",
	GET_KEYBINDINGS: "plugin:get-keybindings",
	SET_KEYBINDINGS: "plugin:set-keybindings",
} as const;

interface IPCResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * 插件服务
 * 提供与插件系统交互的API
 */
export const pluginService = {
	// ============ 插件管理 ============

	/**
	 * 获取所有插件
	 */
	async getAllPlugins(): Promise<PluginInfo[]> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.GET_ALL_PLUGINS,
		)) as IPCResult<PluginInfo[]>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data || [];
	},

	/**
	 * 获取单个插件信息
	 */
	async getPlugin(pluginId: string): Promise<PluginInfo> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.GET_PLUGIN,
			pluginId,
		)) as IPCResult<PluginInfo>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data!;
	},

	/**
	 * 安装插件
	 * @param sourcePath 可选，插件目录路径。如果不提供，将打开文件选择对话框
	 */
	async installPlugin(sourcePath?: string): Promise<PluginInfo> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.INSTALL_PLUGIN,
			sourcePath,
		)) as IPCResult<PluginInfo>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data!;
	},

	/**
	 * 卸载插件
	 */
	async uninstallPlugin(pluginId: string): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.UNINSTALL_PLUGIN,
			pluginId,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	/**
	 * 启用插件
	 */
	async enablePlugin(pluginId: string): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.ENABLE_PLUGIN,
			pluginId,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	/**
	 * 禁用插件
	 */
	async disablePlugin(pluginId: string): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.DISABLE_PLUGIN,
			pluginId,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	/**
	 * 激活插件
	 */
	async activatePlugin(pluginId: string): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.ACTIVATE_PLUGIN,
			pluginId,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	/**
	 * 停用插件
	 */
	async deactivatePlugin(pluginId: string): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.DEACTIVATE_PLUGIN,
			pluginId,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	// ============ 插件市场 ============

	/**
	 * 搜索插件市场
	 */
	async searchMarket(
		query?: string,
		category?: string,
	): Promise<MarketPlugin[]> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.SEARCH_MARKET,
			query,
			category,
		)) as IPCResult<MarketPlugin[]>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data || [];
	},

	/**
	 * 获取市场插件详情
	 */
	async getMarketPlugin(pluginId: string): Promise<MarketPlugin> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.GET_MARKET_PLUGIN,
			pluginId,
		)) as IPCResult<MarketPlugin>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data!;
	},

	/**
	 * 下载并安装插件
	 */
	async downloadPlugin(pluginId: string): Promise<PluginInfo> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.DOWNLOAD_PLUGIN,
			pluginId,
		)) as IPCResult<PluginInfo>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data!;
	},

	// ============ 命令 ============

	/**
	 * 获取已注册命令
	 */
	async getCommands(pluginId?: string): Promise<PluginCommand[]> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.GET_COMMANDS,
			pluginId,
		)) as IPCResult<PluginCommand[]>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data || [];
	},

	/**
	 * 执行命令
	 */
	async executeCommand<T = unknown>(
		command: string,
		...args: unknown[]
	): Promise<T> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.EXECUTE_COMMAND,
			command,
			args,
		)) as IPCResult<T>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data as T;
	},

	// ============ 插件存储 ============

	/**
	 * 获取插件存储数据
	 */
	async getStorage<T>(pluginId: string, key: string): Promise<T | undefined> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.GET_STORAGE,
			pluginId,
			key,
		)) as IPCResult<T>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data as T;
	},

	/**
	 * 设置插件存储数据
	 */
	async setStorage<T>(pluginId: string, key: string, value: T): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.SET_STORAGE,
			pluginId,
			key,
			value,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	/**
	 * 删除插件存储数据
	 */
	async deleteStorage(pluginId: string, key: string): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.DELETE_STORAGE,
			pluginId,
			key,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	// ============ 快捷键 ============

	/**
	 * 获取快捷键配置
	 */
	async getKeybindings(): Promise<Record<string, string>> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.GET_KEYBINDINGS,
		)) as IPCResult<Record<string, string>>;
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data || {};
	},

	/**
	 * 设置快捷键配置
	 */
	async setKeybindings(keybindings: Record<string, string>): Promise<void> {
		const result = (await window.electron.ipc.invoke(
			PLUGIN_CHANNELS.SET_KEYBINDINGS,
			keybindings,
		)) as IPCResult;
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	// ============ 权限 ============

	/**
	 * 授予插件权限
	 */
	async grantPermissions(
		pluginId: string,
		permissions: string[],
	): Promise<void> {
		const result = await window.electron.plugin.grantPermissions(
			pluginId,
			permissions,
		);
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	/**
	 * 获取插件已授予的权限
	 */
	async getPermissions(pluginId: string): Promise<string[]> {
		const result = await window.electron.plugin.getPermissions(pluginId);
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data || [];
	},

	// ============ UI 贡献 ============

	/**
	 * 获取所有 UI 贡献
	 */
	async getUIContributions(): Promise<unknown> {
		const result = await window.electron.plugin.getUIContributions();
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data;
	},

	/**
	 * 获取插件页面 HTML
	 */
	async getPluginPageHTML(
		pluginId: string,
		pagePath: string,
	): Promise<{ html: string; title?: string }> {
		const result = await window.electron.plugin.getPluginPageHTML(
			pluginId,
			pagePath,
		);
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data!;
	},

	// ============ 开发模式 ============

	/**
	 * 开发模式安装插件
	 */
	async installDev(sourcePath: string): Promise<void> {
		const result = await window.electron.plugin.installDev(sourcePath);
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	/**
	 * 重新加载开发模式插件
	 */
	async reloadDev(pluginId: string): Promise<void> {
		const result = await window.electron.plugin.reloadDev(pluginId);
		if (!result.success) {
			throw new Error(result.error);
		}
	},

	// ============ 更新 ============

	/**
	 * 检查插件更新
	 */
	async checkUpdates(): Promise<
		Array<{
			pluginId: string;
			currentVersion: string;
			newVersion: string;
		}>
	> {
		const result = await window.electron.plugin.checkUpdates();
		if (!result.success) {
			throw new Error(result.error);
		}
		return result.data || [];
	},

	/**
	 * 更新插件
	 */
	async updatePlugin(pluginId: string): Promise<void> {
		const result = await window.electron.plugin.updatePlugin(pluginId);
		if (!result.success) {
			throw new Error(result.error);
		}
	},
};
