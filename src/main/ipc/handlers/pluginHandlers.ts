import { app, dialog, ipcMain } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getPluginManager,
  resetPluginManager,
} from "../../services/plugin/PluginManager";
import {
  BUILTIN_MARKET_PLUGINS,
  BUILTIN_PLUGIN_SOURCES,
  type BuiltinMarketPlugin,
} from "../../services/plugin/builtinPlugins";
import type { PluginInfo } from "../../services/plugin/types";
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

  // 命令
  GET_COMMANDS: "plugin:getCommands",
  EXECUTE_COMMAND: "plugin:executeCommand",

  // 快捷键
  GET_KEYBINDINGS: "plugin:getKeybindings",
  SET_KEYBINDINGS: "plugin:setKeybindings",

  // 皮肤
  GET_ACTIVE_SKIN: "plugin:getActiveSkin",
  SET_ACTIVE_SKIN: "plugin:setActiveSkin",

  // Markdown 主题
  GET_ACTIVE_MARKDOWN_THEME: "plugin:getActiveMarkdownTheme",
  SET_ACTIVE_MARKDOWN_THEME: "plugin:setActiveMarkdownTheme",
} as const;

// Market plugins sourced from builtin definitions
const MARKET_PLUGINS = BUILTIN_MARKET_PLUGINS;

/**
 * 注册插件相关IPC处理器
 */
export function registerPluginHandlers(): void {
  const pluginManager = getPluginManager();

  // ============ 插件管理 ============

  // 获取所有插件
  ipcMain.handle(
    PLUGIN_CHANNELS.GET_ALL_PLUGINS,
    async (): Promise<{
      success: boolean;
      data?: PluginInfo[];
      error?: string;
    }> => {
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
      { query, category }: { query?: string; category?: string } = {},
    ): Promise<{ success: boolean; data?: BuiltinMarketPlugin[]; error?: string }> => {
      try {
        let results = [...MARKET_PLUGINS];

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
    ): Promise<{ success: boolean; data?: BuiltinMarketPlugin; error?: string }> => {
      try {
        const plugin = MARKET_PLUGINS.find((p) => p.id === pluginId);
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
        console.log(`[Plugin] Downloading plugin ${pluginId}...`);

        const pluginData = MARKET_PLUGINS.find((p) => p.id === pluginId);
        if (!pluginData) {
          return { success: false, error: "Plugin not found in market" };
        }

        // Check if already installed
        const existing = pluginManager.getPlugin(pluginId);
        if (existing) {
          return { success: false, error: "Plugin is already installed" };
        }

        // Create a temporary plugin directory with manifest and entry file
        const tmpDir = path.join(
          app.getPath("temp"),
          `plugin-install-${pluginId}-${Date.now()}`,
        );
        await fs.mkdir(tmpDir, { recursive: true });

        // Check if this is a builtin plugin with real source code
        const builtinSource = BUILTIN_PLUGIN_SOURCES[pluginId];
        if (builtinSource) {
          // Write real manifest and source
          await fs.writeFile(
            path.join(tmpDir, "package.json"),
            JSON.stringify(builtinSource.manifest, null, 2),
            "utf-8",
          );
          await fs.writeFile(
            path.join(tmpDir, "index.js"),
            builtinSource.source,
            "utf-8",
          );
          // Write extra files (e.g., theme.css, tokens.json for skin plugins)
          if (builtinSource.extraFiles) {
            for (const [fileName, content] of Object.entries(builtinSource.extraFiles)) {
              await fs.writeFile(
                path.join(tmpDir, fileName),
                content,
                "utf-8",
              );
            }
          }
        } else {
          // Fallback: stub plugin
          const manifest = {
            name: pluginData.id,
            displayName: pluginData.displayName,
            version: pluginData.version,
            description: pluginData.description,
            author: pluginData.author,
            main: "index.js",
            categories: pluginData.categories,
            engines: { "super-client-r": "^1.0.0" },
          };
          await fs.writeFile(
            path.join(tmpDir, "package.json"),
            JSON.stringify(manifest, null, 2),
            "utf-8",
          );
          const entryCode = `"use strict";
module.exports = {
  activate(context) {
    console.log("[${pluginData.displayName}] Plugin activated");
  },
  deactivate() {
    console.log("[${pluginData.displayName}] Plugin deactivated");
  }
};
`;
          await fs.writeFile(path.join(tmpDir, "index.js"), entryCode, "utf-8");
        }

        // Install via PluginManager
        const plugin = await pluginManager.installPlugin(tmpDir);

        // Cleanup temp directory
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { });

        return { success: true, data: plugin };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // ============ 命令 ============

  // 获取已注册命令
  ipcMain.handle(
    PLUGIN_CHANNELS.GET_COMMANDS,
    async (
      _event,
      { pluginId }: { pluginId?: string } = {},
    ): Promise<{ success: boolean; data?: Array<{ command: string; pluginId: string; title?: string; category?: string }>; error?: string }> => {
      try {
        const commands = pluginManager.getRegisteredCommands(pluginId);
        return { success: true, data: commands };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // 执行命令
  ipcMain.handle(
    PLUGIN_CHANNELS.EXECUTE_COMMAND,
    async (
      _event,
      { command, args }: { command: string; args?: unknown[] },
    ): Promise<{ success: boolean; data?: unknown; error?: string }> => {
      try {
        const result = await pluginManager.executeCommand(command, ...(args || []));
        return { success: true, data: result };
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
      {
        pluginId,
        key,
        value,
      }: { pluginId: string; key: string; value: unknown },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const pluginsData =
          (storeManager.getConfig("pluginsData") as Record<string, unknown>) ||
          {};
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
        const pluginsData =
          (storeManager.getConfig("pluginsData") as Record<string, unknown>) ||
          {};
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

  // ============ 皮肤 ============

  // 获取当前激活的皮肤
  ipcMain.handle(
    PLUGIN_CHANNELS.GET_ACTIVE_SKIN,
    async (): Promise<{ success: boolean; data?: { pluginId: string; themeId: string } | null; error?: string }> => {
      try {
        const skinInfo = pluginManager.getActiveSkinId();
        return { success: true, data: skinInfo };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // 设置激活的皮肤
  ipcMain.handle(
    PLUGIN_CHANNELS.SET_ACTIVE_SKIN,
    async (
      _event,
      { pluginId, themeId }: { pluginId: string | null; themeId?: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        if (pluginId === null) {
          // Restore default
          await pluginManager.removeSkinCSS();
        } else {
          if (!themeId) {
            return { success: false, error: "themeId is required" };
          }
          const pluginInfo = pluginManager.getPlugin(pluginId);
          if (!pluginInfo) {
            return { success: false, error: `Plugin ${pluginId} not found` };
          }
          if (!pluginManager.isSkinPlugin(pluginInfo)) {
            return { success: false, error: `Plugin ${pluginId} is not a skin plugin` };
          }
          // Ensure plugin is activated
          if (!pluginManager.isPluginActive(pluginId)) {
            await pluginManager.enablePlugin(pluginId);
          }
          // applySkinCSS handles removing old CSS internally
          await pluginManager.applySkinCSS(pluginInfo, themeId);
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // ============ Markdown 主题 ============

  // 获取当前激活的 Markdown 主题
  ipcMain.handle(
    PLUGIN_CHANNELS.GET_ACTIVE_MARKDOWN_THEME,
    async (): Promise<{ success: boolean; data?: { pluginId: string; themeId: string } | null; error?: string }> => {
      try {
        const themeInfo = pluginManager.getActiveMarkdownThemeId();
        return { success: true, data: themeInfo };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // 设置激活的 Markdown 主题
  ipcMain.handle(
    PLUGIN_CHANNELS.SET_ACTIVE_MARKDOWN_THEME,
    async (
      _event,
      { pluginId, themeId }: { pluginId: string | null; themeId?: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        if (pluginId === null) {
          await pluginManager.removeMarkdownCSS();
        } else {
          if (!themeId) {
            return { success: false, error: "themeId is required" };
          }
          const pluginInfo = pluginManager.getPlugin(pluginId);
          if (!pluginInfo) {
            return { success: false, error: `Plugin ${pluginId} not found` };
          }
          if (!pluginManager.isMarkdownThemePlugin(pluginInfo)) {
            return { success: false, error: `Plugin ${pluginId} is not a markdown theme plugin` };
          }
          // Ensure plugin is activated
          if (!pluginManager.isPluginActive(pluginId)) {
            await pluginManager.enablePlugin(pluginId);
          }
          // applyMarkdownCSS handles removing old CSS internally
          await pluginManager.applyMarkdownCSS(pluginInfo, themeId);
        }
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
