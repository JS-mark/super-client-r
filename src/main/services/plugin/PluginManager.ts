import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as path from "path";
import type {
	Plugin,
	PluginContext,
	PluginInfo,
	PluginManifest,
	PluginState,
} from "./types";
import { app } from "electron";
import { storeManager } from "../../store/StoreManager";

interface PluginActivationRecord {
	plugin: Plugin;
	context: PluginContext;
	exports: unknown;
}

/**
 * 插件管理器
 * 负责插件的生命周期管理、激活/停用、安装/卸载
 */
export class PluginManager extends EventEmitter {
	private plugins = new Map<string, PluginInfo>();
	private activePlugins = new Map<string, PluginActivationRecord>();
	private pluginsDir: string;
	private globalStorageDir: string;
	private isInitialized = false;

	constructor() {
		super();
		this.pluginsDir = path.join(app.getPath("userData"), "plugins");
		this.globalStorageDir = path.join(app.getPath("userData"), "plugin-storage");
	}

	/**
	 * 初始化插件管理器
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		try {
			// 确保插件目录存在
			await fs.mkdir(this.pluginsDir, { recursive: true });
			await fs.mkdir(this.globalStorageDir, { recursive: true });

			// 从存储加载插件信息
			await this.loadPluginsFromStorage();

			// 扫描插件目录
			await this.scanPluginsDirectory();

			// 自动激活标记为启用的插件
			await this.autoActivatePlugins();

			this.isInitialized = true;
			this.emit("initialized");
			console.log("[PluginManager] Initialized successfully");
		} catch (error) {
			console.error("[PluginManager] Initialization failed:", error);
			this.emit("error", error);
			throw error;
		}
	}

	/**
	 * 从存储加载插件信息
	 */
	private async loadPluginsFromStorage(): Promise<void> {
		try {
			const storedPlugins = storeManager.getConfig("plugins") as PluginInfo[] | undefined;
			if (storedPlugins) {
				for (const pluginInfo of storedPlugins) {
					this.plugins.set(pluginInfo.id, {
						...pluginInfo,
						state: "installed",
					});
				}
			}
		} catch (error) {
			console.error("[PluginManager] Failed to load plugins from storage:", error);
		}
	}

	/**
	 * 扫描插件目录
	 */
	private async scanPluginsDirectory(): Promise<void> {
		try {
			const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;

				const pluginPath = path.join(this.pluginsDir, entry.name);
				try {
					const manifest = await this.readManifest(pluginPath);
					if (manifest) {
						const pluginId = manifest.name;
						const existing = this.plugins.get(pluginId);

						if (!existing) {
							// 新发现的插件
							this.plugins.set(pluginId, {
								id: pluginId,
								manifest,
								state: "installed",
								path: pluginPath,
								installedAt: Date.now(),
								updatedAt: Date.now(),
								enabled: false,
								isBuiltin: false,
								isDev: false,
							});
						} else {
							// 更新现有插件信息
							existing.path = pluginPath;
							existing.manifest = manifest;
							existing.updatedAt = Date.now();
						}
					}
				} catch (error) {
					console.error(`[PluginManager] Failed to scan plugin at ${pluginPath}:`, error);
				}
			}
		} catch (error) {
			console.error("[PluginManager] Failed to scan plugins directory:", error);
		}
	}

	/**
	 * 读取插件清单
	 */
	private async readManifest(pluginPath: string): Promise<PluginManifest | null> {
		try {
			const manifestPath = path.join(pluginPath, "package.json");
			const content = await fs.readFile(manifestPath, "utf-8");
			const manifest = JSON.parse(content) as PluginManifest;

			// 验证必需字段
			if (!manifest.name || !manifest.version || !manifest.main) {
				console.warn(`[PluginManager] Invalid manifest at ${pluginPath}: missing required fields`);
				return null;
			}

			return manifest;
		} catch (error) {
			console.error(`[PluginManager] Failed to read manifest at ${pluginPath}:`, error);
			return null;
		}
	}

	/**
	 * 自动激活启用的插件
	 */
	private async autoActivatePlugins(): Promise<void> {
		for (const [id, pluginInfo] of this.plugins) {
			if (pluginInfo.enabled && pluginInfo.state === "installed") {
				try {
					await this.activatePlugin(id);
				} catch (error) {
					console.error(`[PluginManager] Failed to auto-activate plugin ${id}:`, error);
					pluginInfo.state = "error";
					pluginInfo.error = String(error);
				}
			}
		}
		await this.savePluginsToStorage();
	}

	/**
	 * 激活插件
	 */
	async activatePlugin(pluginId: string): Promise<void> {
		const pluginInfo = this.plugins.get(pluginId);
		if (!pluginInfo) {
			throw new Error(`Plugin ${pluginId} not found`);
		}

		if (this.activePlugins.has(pluginId)) {
			console.log(`[PluginManager] Plugin ${pluginId} is already active`);
			return;
		}

		try {
			pluginInfo.state = "activating";
			this.emit("pluginActivating", pluginId);

			// 加载插件模块
			const pluginModule = await this.loadPluginModule(pluginInfo);

			// 创建插件上下文
			const context = this.createPluginContext(pluginInfo);

			// 调用激活方法
			if (pluginModule.activate) {
				const exports = await pluginModule.activate(context);

				// 记录激活状态
				this.activePlugins.set(pluginId, {
					plugin: pluginModule,
					context,
					exports,
				});
			}

			pluginInfo.state = "active";
			pluginInfo.enabled = true;
			pluginInfo.error = undefined;

			await this.savePluginsToStorage();
			this.emit("pluginActivated", pluginId);
			console.log(`[PluginManager] Plugin ${pluginId} activated successfully`);
		} catch (error) {
			pluginInfo.state = "error";
			pluginInfo.error = String(error);
			await this.savePluginsToStorage();
			this.emit("pluginError", pluginId, error);
			throw error;
		}
	}

	/**
	 * 停用插件
	 */
	async deactivatePlugin(pluginId: string): Promise<void> {
		const pluginInfo = this.plugins.get(pluginId);
		if (!pluginInfo) {
			throw new Error(`Plugin ${pluginId} not found`);
		}

		const activationRecord = this.activePlugins.get(pluginId);
		if (!activationRecord) {
			console.log(`[PluginManager] Plugin ${pluginId} is not active`);
			return;
		}

		try {
			pluginInfo.state = "deactivating";
			this.emit("pluginDeactivating", pluginId);

			// 调用停用方法
			if (activationRecord.plugin.deactivate) {
				await activationRecord.plugin.deactivate();
			}

			// 清理订阅
			for (const subscription of activationRecord.context.subscriptions) {
				subscription.dispose();
			}

			// 从激活列表移除
			this.activePlugins.delete(pluginId);

			pluginInfo.state = "inactive";
			pluginInfo.enabled = false;
			await this.savePluginsToStorage();

			this.emit("pluginDeactivated", pluginId);
			console.log(`[PluginManager] Plugin ${pluginId} deactivated successfully`);
		} catch (error) {
			pluginInfo.state = "error";
			pluginInfo.error = String(error);
			await this.savePluginsToStorage();
			this.emit("pluginError", pluginId, error);
			throw error;
		}
	}

	/**
	 * 加载插件模块
	 */
	private async loadPluginModule(pluginInfo: PluginInfo): Promise<Plugin> {
		const mainPath = path.join(pluginInfo.path, pluginInfo.manifest.main);

		// 清除缓存以确保加载最新版本
		delete require.cache[require.resolve(mainPath)];

		// 加载模块
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const module = require(mainPath) as Plugin | { default: Plugin };

		// 支持ES Module和CommonJS
		return "default" in module ? module.default : module;
	}

	/**
	 * 创建插件上下文
	 */
	private createPluginContext(pluginInfo: PluginInfo): PluginContext {
		const extensionPath = pluginInfo.path;
		const extensionUri = `file://${extensionPath}`;
		const storagePath = path.join(this.globalStorageDir, pluginInfo.id);

		return {
			extensionPath,
			extensionUri,
			storageUri: `file://${storagePath}`,
			globalStorageUri: `file://${this.globalStorageDir}`,
			logUri: `file://${path.join(app.getPath("logs"), "plugins", pluginInfo.id)}`,
			subscriptions: [],
			workspaceState: this.createMemento(`workspace:${pluginInfo.id}`),
			globalState: this.createMemento(`global:${pluginInfo.id}`),
		};
	}

	/**
	 * 创建存储器
	 */
	private createMemento(key: string) {
		const storageKey = `plugin:${key}`;
		return {
			get: <T>(keySuffix: string, defaultValue?: T): T | undefined => {
				const data = storeManager.getConfig("pluginsData") as Record<string, T> | undefined;
				return data?.[`${storageKey}.${keySuffix}`] ?? defaultValue;
			},
			update: async (keySuffix: string, value: unknown): Promise<void> => {
				const data = (storeManager.getConfig("pluginsData") as Record<string, unknown> | undefined) || {};
				data[`${storageKey}.${keySuffix}`] = value;
				storeManager.setConfig("pluginsData", data);
			},
		};
	}

	/**
	 * 安装插件
	 */
	async installPlugin(sourcePath: string): Promise<PluginInfo> {
		try {
			// 读取源目录的manifest
			const manifest = await this.readManifest(sourcePath);
			if (!manifest) {
				throw new Error("Invalid plugin: missing or invalid manifest");
			}

			const pluginId = manifest.name;
			const targetPath = path.join(this.pluginsDir, pluginId);

			// 检查是否已存在
			if (this.plugins.has(pluginId)) {
				throw new Error(`Plugin ${pluginId} is already installed`);
			}

			// 复制插件文件
			await this.copyDirectory(sourcePath, targetPath);

			// 创建插件信息
			const pluginInfo: PluginInfo = {
				id: pluginId,
				manifest,
				state: "installed",
				path: targetPath,
				installedAt: Date.now(),
				updatedAt: Date.now(),
				enabled: false,
				isBuiltin: false,
				isDev: false,
			};

			this.plugins.set(pluginId, pluginInfo);
			await this.savePluginsToStorage();

			this.emit("pluginInstalled", pluginId);
			console.log(`[PluginManager] Plugin ${pluginId} installed successfully`);

			return pluginInfo;
		} catch (error) {
			console.error("[PluginManager] Failed to install plugin:", error);
			throw error;
		}
	}

	/**
	 * 卸载插件
	 */
	async uninstallPlugin(pluginId: string): Promise<void> {
		const pluginInfo = this.plugins.get(pluginId);
		if (!pluginInfo) {
			throw new Error(`Plugin ${pluginId} not found`);
		}

		try {
			pluginInfo.state = "uninstalling";

			// 如果插件处于激活状态，先停用
			if (this.activePlugins.has(pluginId)) {
				await this.deactivatePlugin(pluginId);
			}

			// 删除插件目录
			await fs.rm(pluginInfo.path, { recursive: true, force: true });

			// 从存储中移除
			this.plugins.delete(pluginId);
			await this.savePluginsToStorage();

			this.emit("pluginUninstalled", pluginId);
			console.log(`[PluginManager] Plugin ${pluginId} uninstalled successfully`);
		} catch (error) {
			console.error(`[PluginManager] Failed to uninstall plugin ${pluginId}:`, error);
			throw error;
		}
	}

	/**
	 * 启用插件
	 */
	async enablePlugin(pluginId: string): Promise<void> {
		const pluginInfo = this.plugins.get(pluginId);
		if (!pluginInfo) {
			throw new Error(`Plugin ${pluginId} not found`);
		}

		if (pluginInfo.enabled) {
			return;
		}

		pluginInfo.enabled = true;
		await this.savePluginsToStorage();

		// 激活插件
		await this.activatePlugin(pluginId);
	}

	/**
	 * 禁用插件
	 */
	async disablePlugin(pluginId: string): Promise<void> {
		const pluginInfo = this.plugins.get(pluginId);
		if (!pluginInfo) {
			throw new Error(`Plugin ${pluginId} not found`);
		}

		if (!pluginInfo.enabled) {
			return;
		}

		pluginInfo.enabled = false;
		await this.savePluginsToStorage();

		// 停用插件
		await this.deactivatePlugin(pluginId);
	}

	/**
	 * 获取所有插件
	 */
	getAllPlugins(): PluginInfo[] {
		return Array.from(this.plugins.values());
	}

	/**
	 * 获取插件信息
	 */
	getPlugin(pluginId: string): PluginInfo | undefined {
		return this.plugins.get(pluginId);
	}

	/**
	 * 检查插件是否激活
	 */
	isPluginActive(pluginId: string): boolean {
		return this.activePlugins.has(pluginId);
	}

	/**
	 * 获取激活的插件
	 */
	getActivePlugins(): string[] {
		return Array.from(this.activePlugins.keys());
	}

	/**
	 * 保存插件到存储
	 */
	private async savePluginsToStorage(): Promise<void> {
		const plugins = Array.from(this.plugins.values());
		storeManager.setConfig("plugins", plugins as any);
	}

	/**
	 * 复制目录
	 */
	private async copyDirectory(src: string, dest: string): Promise<void> {
		await fs.mkdir(dest, { recursive: true });

		const entries = await fs.readdir(src, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);

			if (entry.isDirectory()) {
				await this.copyDirectory(srcPath, destPath);
			} else {
				await fs.copyFile(srcPath, destPath);
			}
		}
	}

	/**
	 * 清理资源
	 */
	async dispose(): Promise<void> {
		// 停用所有插件
		for (const pluginId of this.activePlugins.keys()) {
			try {
				await this.deactivatePlugin(pluginId);
			} catch (error) {
				console.error(`[PluginManager] Failed to deactivate plugin ${pluginId} during dispose:`, error);
			}
		}

		this.plugins.clear();
		this.activePlugins.clear();
		this.removeAllListeners();
	}
}

// 单例实例
let pluginManagerInstance: PluginManager | null = null;

export function getPluginManager(): PluginManager {
	if (!pluginManagerInstance) {
		pluginManagerInstance = new PluginManager();
	}
	return pluginManagerInstance;
}

export function resetPluginManager(): void {
	pluginManagerInstance = null;
}
