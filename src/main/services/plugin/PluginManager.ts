import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { app, BrowserWindow } from "electron";
import { storeManager } from "../../store/StoreManager";
import { internalMcpService } from "../mcp/internal/InternalMcpService";
import { getSkillService } from "../skill/SkillService";
import { BUILTIN_PLUGIN_SOURCES } from "./builtin";
import { ChatHookRegistry } from "./hooks/ChatHooks";
import { PermissionService } from "./PermissionService";
import { createPluginAPI } from "./PluginAPIFactory";
import type {
  Plugin,
  PluginContext,
  PluginInfo,
  PluginManifest,
  PluginPermission,
} from "./types";
import { UIContributionRegistry } from "./UIContributionRegistry";

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
  private commandRegistry = new Map<
    string,
    { pluginId: string; handler: (...args: unknown[]) => unknown }
  >();
  private pluginsDir: string;
  private globalStorageDir: string;
  private isInitialized = false;

  // Skin state: stores { pluginId, themeId } or null
  private activeSkinPluginId: string | null = null;
  private activeSkinThemeId: string | null = null;
  private skinCssKeys = new Map<number, string>(); // BrowserWindow.id → cssKey
  private activeSkinCSS: string | null = null; // cached CSS for re-injection on reload
  private activeSkinTokens: Record<string, unknown> | null = null; // cached tokens for re-injection

  // Markdown theme state: separate from skin
  private activeMarkdownPluginId: string | null = null;
  private activeMarkdownThemeId: string | null = null;
  private activeMarkdownCSS: string | null = null; // cached CSS for renderer-side injection

  // Track windows with reload listeners
  private windowReloadListeners = new Map<number, () => void>();

  // Plugin system services
  readonly permissionService = new PermissionService();
  readonly chatHookRegistry = new ChatHookRegistry();
  readonly uiContributionRegistry = new UIContributionRegistry();

  constructor() {
    super();
    this.pluginsDir = path.join(app.getPath("userData"), "plugins");
    this.globalStorageDir = path.join(
      app.getPath("userData"),
      "plugin-storage",
    );
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

      // 同步内置插件（版本更新时自动覆盖文件）
      await this.syncBuiltinPlugins();

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
      const storedPlugins = storeManager.getConfig("plugins") as
        | PluginInfo[]
        | undefined;
      if (storedPlugins) {
        for (const pluginInfo of storedPlugins) {
          this.plugins.set(pluginInfo.id, {
            ...pluginInfo,
            state: "installed",
          });
        }
      }
    } catch (error) {
      console.error(
        "[PluginManager] Failed to load plugins from storage:",
        error,
      );
    }
  }

  /**
   * 扫描插件目录
   */
  private async scanPluginsDirectory(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginsDir, {
        withFileTypes: true,
      });

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
          console.error(
            `[PluginManager] Failed to scan plugin at ${pluginPath}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error("[PluginManager] Failed to scan plugins directory:", error);
    }
  }

  /**
   * 同步内置插件：当源版本高于已安装版本时，覆盖磁盘文件
   */
  private async syncBuiltinPlugins(): Promise<void> {
    for (const [pluginId, source] of Object.entries(BUILTIN_PLUGIN_SOURCES)) {
      const sourceVersion = (source.manifest as { version?: string }).version;
      if (!sourceVersion) continue;

      const installed = this.plugins.get(pluginId);
      if (!installed) continue; // 未安装则跳过，等用户主动安装

      const installedVersion = installed.manifest?.version;
      if (installedVersion === sourceVersion) continue; // 版本相同则跳过

      console.log(
        `[PluginManager] Syncing builtin plugin ${pluginId}: ${installedVersion} → ${sourceVersion}`,
      );

      try {
        const targetPath = installed.path;

        // 写入 package.json
        await fs.writeFile(
          path.join(targetPath, "package.json"),
          JSON.stringify(source.manifest, null, 2),
          "utf-8",
        );

        // 写入 index.js（主入口）
        await fs.writeFile(
          path.join(targetPath, "index.js"),
          source.source,
          "utf-8",
        );

        // 写入额外文件（CSS 等）
        if (source.extraFiles) {
          for (const [fileName, content] of Object.entries(source.extraFiles)) {
            await fs.writeFile(
              path.join(targetPath, fileName),
              content,
              "utf-8",
            );
          }
        }

        // 更新内存中的 manifest
        installed.manifest =
          (await this.readManifest(targetPath)) ?? installed.manifest;
        installed.updatedAt = Date.now();

        console.log(
          `[PluginManager] Builtin plugin ${pluginId} synced to v${sourceVersion}`,
        );
      } catch (error) {
        console.error(
          `[PluginManager] Failed to sync builtin plugin ${pluginId}:`,
          error,
        );
      }
    }
  }

  /**
   * 读取插件清单
   */
  private async readManifest(
    pluginPath: string,
  ): Promise<PluginManifest | null> {
    try {
      const manifestPath = path.join(pluginPath, "package.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as PluginManifest;

      // 验证必需字段
      if (!manifest.name || !manifest.version || !manifest.main) {
        console.warn(
          `[PluginManager] Invalid manifest at ${pluginPath}: missing required fields`,
        );
        return null;
      }

      return manifest;
    } catch (error) {
      console.error(
        `[PluginManager] Failed to read manifest at ${pluginPath}:`,
        error,
      );
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
          console.error(
            `[PluginManager] Failed to auto-activate plugin ${id}:`,
            error,
          );
          pluginInfo.state = "error";
          pluginInfo.error = String(error);
        }
      }
    }
    await this.savePluginsToStorage();

    // Restore active skin and markdown theme after all plugins activated
    await this.restoreActiveSkin();
    await this.restoreActiveMarkdownTheme();
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

    // Auto-grant permissions for builtin plugins
    const declaredPermissions = pluginInfo.manifest.permissions ?? [];
    if (pluginInfo.isBuiltin && declaredPermissions.length > 0) {
      this.permissionService.autoGrantBuiltin(pluginId, declaredPermissions);
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

      // 清理该插件注册的命令（safety net）
      for (const [cmdId, entry] of this.commandRegistry) {
        if (entry.pluginId === pluginId) {
          this.commandRegistry.delete(cmdId);
        }
      }

      // 清理插件注册的聊天钩子
      this.chatHookRegistry.unregisterAll(pluginId);

      // 清理插件注册的 MCP 工具
      internalMcpService.unregisterDynamic(pluginId);

      // 清理插件注册的 Skills
      try {
        getSkillService().unregisterDynamic(pluginId);
      } catch {
        // Skill service may not be initialized
      }

      // 清理插件的 UI 贡献
      this.uiContributionRegistry.unregisterAll(pluginId);

      // If this is the active skin's plugin, remove its CSS
      if (this.activeSkinPluginId === pluginId) {
        await this.removeSkinCSS();
      }

      // If this is the active markdown theme's plugin, remove its CSS
      if (this.activeMarkdownPluginId === pluginId) {
        await this.removeMarkdownCSS();
      }

      // 从激活列表移除
      this.activePlugins.delete(pluginId);

      pluginInfo.state = "inactive";
      pluginInfo.enabled = false;
      await this.savePluginsToStorage();

      this.emit("pluginDeactivated", pluginId);
      console.log(
        `[PluginManager] Plugin ${pluginId} deactivated successfully`,
      );
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
    const subscriptions: { dispose(): void }[] = [];

    // Create PluginAPI instance
    const api = createPluginAPI(
      pluginInfo,
      this.permissionService,
      this.chatHookRegistry,
      this.uiContributionRegistry,
      {
        registerCommand: (pid: string, cmd: string, cb: (...args: unknown[]) => unknown) =>
          this.registerCommand(pid, cmd, cb),
        executeCommand: (cmd: string, ...args: unknown[]) =>
          this.executeCommand(cmd, ...args),
      },
    );

    return {
      extensionPath,
      extensionUri,
      storageUri: `file://${storagePath}`,
      globalStorageUri: `file://${this.globalStorageDir}`,
      logUri: `file://${path.join(app.getPath("logs"), "plugins", pluginInfo.id)}`,
      subscriptions,
      workspaceState: this.createMemento(`workspace:${pluginInfo.id}`),
      globalState: this.createMemento(`global:${pluginInfo.id}`),
      commands: {
        registerCommand: (
          command: string,
          callback: (...args: unknown[]) => unknown,
        ) => {
          const disposable = this.registerCommand(
            pluginInfo.id,
            command,
            callback,
          );
          subscriptions.push(disposable);
          return disposable;
        },
      },
      api,
    };
  }

  /**
   * 创建存储器
   */
  private createMemento(key: string) {
    const storageKey = `plugin:${key}`;
    return {
      get: <T>(keySuffix: string, defaultValue?: T): T | undefined => {
        const data = storeManager.getConfig("pluginsData") as
          | Record<string, T>
          | undefined;
        return data?.[`${storageKey}.${keySuffix}`] ?? defaultValue;
      },
      update: async (keySuffix: string, value: unknown): Promise<void> => {
        const data =
          (storeManager.getConfig("pluginsData") as
            | Record<string, unknown>
            | undefined) || {};
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
      console.log(
        `[PluginManager] Plugin ${pluginId} uninstalled successfully`,
      );
    } catch (error) {
      console.error(
        `[PluginManager] Failed to uninstall plugin ${pluginId}:`,
        error,
      );
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
   * 注册命令
   */
  registerCommand(
    pluginId: string,
    commandId: string,
    handler: (...args: unknown[]) => unknown,
  ): { dispose(): void } {
    this.commandRegistry.set(commandId, { pluginId, handler });
    return {
      dispose: () => {
        this.commandRegistry.delete(commandId);
      },
    };
  }

  /**
   * 执行命令
   */
  async executeCommand(
    commandId: string,
    ...args: unknown[]
  ): Promise<unknown> {
    const entry = this.commandRegistry.get(commandId);
    if (!entry) {
      throw new Error(`Command ${commandId} not found`);
    }
    if (!this.activePlugins.has(entry.pluginId)) {
      throw new Error(`Plugin ${entry.pluginId} is not active`);
    }
    return entry.handler(...args);
  }

  /**
   * 获取已注册命令
   */
  getRegisteredCommands(pluginId?: string): Array<{
    command: string;
    pluginId: string;
    title?: string;
    category?: string;
  }> {
    const commands: Array<{
      command: string;
      pluginId: string;
      title?: string;
      category?: string;
    }> = [];
    for (const [commandId, entry] of this.commandRegistry) {
      if (pluginId && entry.pluginId !== pluginId) continue;
      const pluginInfo = this.plugins.get(entry.pluginId);
      const contributed = pluginInfo?.manifest.contributes?.commands?.find(
        (c) => c.command === commandId,
      );
      commands.push({
        command: commandId,
        pluginId: entry.pluginId,
        title: contributed?.title,
        category: contributed?.category,
      });
    }
    return commands;
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

  // ============ 皮肤管理 ============

  /**
   * 检查插件是否为皮肤插件
   */
  isSkinPlugin(pluginInfo: PluginInfo): boolean {
    return (
      (pluginInfo.manifest.categories?.includes("theme") ?? false) &&
      (pluginInfo.manifest.contributes?.themes?.length ?? 0) > 0
    );
  }

  /**
   * 获取当前激活的皮肤信息
   */
  getActiveSkinId(): { pluginId: string; themeId: string } | null {
    if (this.activeSkinPluginId && this.activeSkinThemeId) {
      return {
        pluginId: this.activeSkinPluginId,
        themeId: this.activeSkinThemeId,
      };
    }
    return null;
  }

  /**
   * 移除当前皮肤CSS（仅清理注入的CSS，不广播不清状态）
   */
  private async removeCurrentSkinCSSOnly(): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      const key = this.skinCssKeys.get(win.id);
      if (key) {
        try {
          await win.webContents.removeInsertedCSS(key);
        } catch {
          // Window may have been closed
        }
      }
    }
    this.skinCssKeys.clear();
  }

  /**
   * 应用皮肤CSS（指定主题ID）
   */
  async applySkinCSS(pluginInfo: PluginInfo, themeId: string): Promise<void> {
    const themes = pluginInfo.manifest.contributes?.themes;
    const themeEntry = themes?.find((t: { id: string }) => t.id === themeId);
    if (!themeEntry) {
      console.error(
        `[PluginManager] Theme ${themeId} not found in plugin ${pluginInfo.id}`,
      );
      return;
    }

    // Read CSS file
    const cssPath = path.join(pluginInfo.path, themeEntry.style);
    let css: string;
    try {
      css = await fs.readFile(cssPath, "utf-8");
    } catch (error) {
      console.error(
        `[PluginManager] Failed to read skin CSS at ${cssPath}:`,
        error,
      );
      return;
    }

    // Read optional tokens
    let tokens: Record<string, unknown> | null = null;
    if (themeEntry.antdTokens) {
      try {
        const tokensPath = path.join(pluginInfo.path, themeEntry.antdTokens);
        const tokensContent = await fs.readFile(tokensPath, "utf-8");
        tokens = JSON.parse(tokensContent);
      } catch (error) {
        console.warn(`[PluginManager] Failed to read skin tokens:`, error);
      }
    }

    // Remove old CSS first (without broadcasting null tokens)
    await this.removeCurrentSkinCSSOnly();

    // Cache CSS for re-injection on reload
    this.activeSkinCSS = css;
    this.activeSkinTokens = tokens;

    // Inject CSS into all windows
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        const key = await win.webContents.insertCSS(css);
        this.skinCssKeys.set(win.id, key);
      } catch (error) {
        console.error(
          `[PluginManager] Failed to inject CSS into window ${win.id}:`,
          error,
        );
      }
    }

    this.activeSkinPluginId = pluginInfo.id;
    this.activeSkinThemeId = themeId;
    storeManager.setConfig("activeSkin", { pluginId: pluginInfo.id, themeId });

    // Broadcast tokens to renderer
    for (const win of windows) {
      win.webContents.send("skin:tokens-changed", tokens);
    }

    this.emit("skinApplied", pluginInfo.id, themeId);
    console.log(
      `[PluginManager] Theme ${themeId} from plugin ${pluginInfo.id} applied`,
    );
  }

  /**
   * 移除当前皮肤CSS
   */
  async removeSkinCSS(): Promise<void> {
    await this.removeCurrentSkinCSSOnly();

    this.activeSkinPluginId = null;
    this.activeSkinThemeId = null;
    this.activeSkinCSS = null;
    this.activeSkinTokens = null;
    storeManager.deleteConfig("activeSkin");

    // Broadcast null tokens
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send("skin:tokens-changed", null);
    }

    this.emit("skinRemoved");
    console.log("[PluginManager] Skin removed, restored defaults");
  }

  /**
   * 恢复上次激活的皮肤（应用启动时）
   */
  async restoreActiveSkin(): Promise<void> {
    const saved = storeManager.getConfig("activeSkin") as
      | { pluginId: string; themeId: string }
      | string
      | undefined;
    if (!saved) return;

    // Handle legacy string format
    const skinInfo =
      typeof saved === "string" ? { pluginId: saved, themeId: "" } : saved;

    if (skinInfo.pluginId && skinInfo.themeId) {
      const pluginInfo = this.plugins.get(skinInfo.pluginId);
      if (pluginInfo && this.isSkinPlugin(pluginInfo) && pluginInfo.enabled) {
        await this.applySkinCSS(pluginInfo, skinInfo.themeId);
      }
    }
  }

  // ============ Markdown 主题管理 ============

  /**
   * 检查插件是否为 Markdown 主题插件
   */
  isMarkdownThemePlugin(pluginInfo: PluginInfo): boolean {
    return (
      (pluginInfo.manifest.categories?.includes("markdown") ?? false) &&
      (pluginInfo.manifest.contributes?.themes?.length ?? 0) > 0
    );
  }

  /**
   * 获取当前激活的 Markdown 主题信息
   */
  getActiveMarkdownThemeId(): { pluginId: string; themeId: string } | null {
    if (this.activeMarkdownPluginId && this.activeMarkdownThemeId) {
      return {
        pluginId: this.activeMarkdownPluginId,
        themeId: this.activeMarkdownThemeId,
      };
    }
    return null;
  }

  /**
   * 广播 Markdown 主题 CSS 到所有渲染进程窗口
   */
  private broadcastMarkdownCSS(css: string | null): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send("markdown-theme:css-changed", css);
        } catch {
          // Window may have been closed
        }
      }
    }
  }

  /**
   * 应用 Markdown 主题 CSS
   */
  async applyMarkdownCSS(
    pluginInfo: PluginInfo,
    themeId: string,
  ): Promise<void> {
    const themes = pluginInfo.manifest.contributes?.themes;
    const themeEntry = themes?.find((t: { id: string }) => t.id === themeId);
    if (!themeEntry) {
      console.error(
        `[PluginManager] Markdown theme ${themeId} not found in plugin ${pluginInfo.id}`,
      );
      return;
    }

    // Read CSS file
    const cssPath = path.join(pluginInfo.path, themeEntry.style);
    let css: string;
    try {
      css = await fs.readFile(cssPath, "utf-8");
    } catch (error) {
      console.error(
        `[PluginManager] Failed to read markdown theme CSS at ${cssPath}:`,
        error,
      );
      return;
    }

    // Cache CSS and broadcast to renderer
    this.activeMarkdownCSS = css;
    this.broadcastMarkdownCSS(css);

    this.activeMarkdownPluginId = pluginInfo.id;
    this.activeMarkdownThemeId = themeId;
    storeManager.setConfig("activeMarkdownTheme", {
      pluginId: pluginInfo.id,
      themeId,
    });

    this.emit("markdownThemeApplied", pluginInfo.id, themeId);
    console.log(
      `[PluginManager] Markdown theme ${themeId} from plugin ${pluginInfo.id} applied`,
    );
  }

  /**
   * 移除当前 Markdown 主题 CSS
   */
  async removeMarkdownCSS(): Promise<void> {
    this.activeMarkdownCSS = null;
    this.broadcastMarkdownCSS(null);

    this.activeMarkdownPluginId = null;
    this.activeMarkdownThemeId = null;
    storeManager.deleteConfig("activeMarkdownTheme");

    this.emit("markdownThemeRemoved");
    console.log("[PluginManager] Markdown theme removed, restored defaults");
  }

  /**
   * 获取当前激活的 Markdown 主题 CSS 内容
   */
  getActiveMarkdownThemeCSS(): string | null {
    return this.activeMarkdownCSS;
  }

  /**
   * 恢复上次激活的 Markdown 主题（应用启动时）
   */
  async restoreActiveMarkdownTheme(): Promise<void> {
    const saved = storeManager.getConfig("activeMarkdownTheme") as
      | { pluginId: string; themeId: string }
      | undefined;
    if (!saved) return;

    if (saved.pluginId && saved.themeId) {
      const pluginInfo = this.plugins.get(saved.pluginId);
      if (
        pluginInfo &&
        this.isMarkdownThemePlugin(pluginInfo) &&
        pluginInfo.enabled
      ) {
        await this.applyMarkdownCSS(pluginInfo, saved.themeId);
      }
    }
  }

  /**
   * 为窗口注册 did-finish-load 监听器，页面重载时自动重新注入 CSS
   */
  setupWindowReloadListener(win: BrowserWindow): void {
    if (this.windowReloadListeners.has(win.id)) return;

    const listener = () => {
      this.reinjectCSSForWindow(win).catch((err) => {
        console.error(
          `[PluginManager] Failed to re-inject CSS on reload for window ${win.id}:`,
          err,
        );
      });
    };

    win.webContents.on("did-finish-load", listener);
    this.windowReloadListeners.set(win.id, listener);

    win.on("closed", () => {
      this.windowReloadListeners.delete(win.id);
      this.skinCssKeys.delete(win.id);
    });
  }

  /**
   * 页面重载后重新注入当前活跃的 skin 和 markdown CSS
   */
  private async reinjectCSSForWindow(win: BrowserWindow): Promise<void> {
    if (win.isDestroyed()) return;

    // Re-inject skin CSS
    if (this.activeSkinCSS) {
      try {
        const key = await win.webContents.insertCSS(this.activeSkinCSS);
        this.skinCssKeys.set(win.id, key);
      } catch {
        // Window may have been destroyed
      }
      // Re-broadcast skin tokens
      if (this.activeSkinTokens) {
        try {
          win.webContents.send("skin:tokens-changed", this.activeSkinTokens);
        } catch {
          // ignore
        }
      }
    }

    // Re-broadcast markdown CSS to renderer
    if (this.activeMarkdownCSS) {
      try {
        win.webContents.send(
          "markdown-theme:css-changed",
          this.activeMarkdownCSS,
        );
      } catch {
        // Window may have been destroyed
      }
    }
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
   * 授予插件权限
   */
  grantPermissions(pluginId: string, permissions: PluginPermission[]): void {
    this.permissionService.grantPermissions(pluginId, permissions);
  }

  /**
   * 获取插件权限
   */
  getPermissions(pluginId: string): PluginPermission[] {
    return this.permissionService.getPermissions(pluginId);
  }

  /**
   * 安装插件依赖
   */
  private async installDependencies(pluginPath: string): Promise<void> {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    await promisify(execFile)("npm", ["install", "--production"], {
      cwd: pluginPath,
      timeout: 120_000,
    });
  }

  /**
   * 开发模式安装（使用 symlink）
   */
  async installDev(sourcePath: string): Promise<PluginInfo> {
    const manifest = await this.readManifest(sourcePath);
    if (!manifest) {
      throw new Error("Invalid plugin: missing or invalid manifest");
    }
    const pluginId = manifest.name;
    const targetPath = path.join(this.pluginsDir, pluginId);

    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} is already installed`);
    }

    // Create symlink instead of copy
    await fs.symlink(sourcePath, targetPath, "dir");

    const pluginInfo: PluginInfo = {
      id: pluginId,
      manifest,
      state: "installed",
      path: targetPath,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      enabled: false,
      isBuiltin: false,
      isDev: true,
    };

    this.plugins.set(pluginId, pluginInfo);
    await this.savePluginsToStorage();
    this.emit("pluginInstalled", pluginId);
    console.log(`[PluginManager] Dev plugin ${pluginId} installed (symlink)`);
    return pluginInfo;
  }

  /**
   * 重新加载开发模式插件
   */
  async reloadDev(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo?.isDev) {
      throw new Error(`Plugin ${pluginId} is not in dev mode`);
    }

    if (this.activePlugins.has(pluginId)) {
      await this.deactivatePlugin(pluginId);
    }

    // Re-read manifest
    const manifest = await this.readManifest(pluginInfo.path);
    if (manifest) {
      pluginInfo.manifest = manifest;
      pluginInfo.updatedAt = Date.now();
    }

    // Re-activate if was enabled
    if (pluginInfo.enabled) {
      await this.activatePlugin(pluginId);
    }

    console.log(`[PluginManager] Dev plugin ${pluginId} reloaded`);
  }

  /**
   * 检查插件更新
   */
  async checkForUpdates(): Promise<
    Array<{ pluginId: string; currentVersion: string; newVersion: string }>
  > {
    const updates: Array<{
      pluginId: string;
      currentVersion: string;
      newVersion: string;
    }> = [];

    for (const [pluginId, pluginInfo] of this.plugins) {
      if (pluginInfo.isBuiltin) {
        const source = BUILTIN_PLUGIN_SOURCES[pluginId];
        if (source) {
          const sourceVersion = (source.manifest as { version?: string })
            .version;
          if (sourceVersion && sourceVersion !== pluginInfo.manifest.version) {
            updates.push({
              pluginId,
              currentVersion: pluginInfo.manifest.version,
              newVersion: sourceVersion,
            });
          }
        }
      }
    }

    return updates;
  }

  /**
   * 更新插件
   */
  async updatePlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const wasActive = this.activePlugins.has(pluginId);
    if (wasActive) {
      await this.deactivatePlugin(pluginId);
    }

    // For builtin plugins, sync from sources
    if (pluginInfo.isBuiltin) {
      await this.syncBuiltinPlugins();
    }

    // Re-activate if was active
    if (wasActive) {
      pluginInfo.enabled = true;
      await this.activatePlugin(pluginId);
    }

    await this.savePluginsToStorage();
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
        console.error(
          `[PluginManager] Failed to deactivate plugin ${pluginId} during dispose:`,
          error,
        );
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
