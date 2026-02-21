/**
 * PluginAPI 工厂
 * 为每个插件创建沙箱化的 PluginAPI 实例
 * 每个方法调用前检查权限
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BrowserWindow } from "electron";
import { storeManager } from "../../store/StoreManager";
import { logger } from "../../utils/logger";
import { internalMcpService } from "../mcp/internal/InternalMcpService";
import type { InternalMcpServer } from "../mcp/internal/types";
import { getSkillService } from "../skill/SkillService";
import type { ChatHookRegistry } from "./hooks/ChatHooks";
import type { PermissionService } from "./PermissionService";
import type {
  ConfigurationChangeEvent,
  EventEmitter,
  FileStat,
  InputBoxOptions,
  PageConfig,
  PluginAPI,
  PluginInfo,
  PluginMcpToolConfig,
  PluginPermission,
  PluginSkillConfig,
  PostResponseHook,
  PostStreamHook,
  PreSendHook,
  QuickPickItem,
  QuickPickOptions,
  SidebarItemConfig,
  SystemPromptHook,
  WindowState,
} from "./types";
import type { UIContributionRegistry } from "./UIContributionRegistry";

/**
 * 创建简单的事件发射器
 */
function createEventEmitter<T>(): EventEmitter<T> {
  const listeners = new Set<(e: T) => unknown>();
  return {
    event: (listener: (e: T) => unknown) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire(data: T) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error("[PluginAPI] Event listener error:", error);
        }
      }
    },
  };
}

/**
 * 权限检查辅助函数
 */
function requirePermission(
  permissionService: PermissionService,
  pluginId: string,
  permission: PluginPermission,
): void {
  if (!permissionService.hasPermission(pluginId, permission)) {
    throw new Error(
      `Plugin "${pluginId}" lacks permission "${permission}". ` +
      `Add "${permission}" to manifest.permissions and reinstall.`,
    );
  }
}

/**
 * 路径沙箱检查：验证路径在允许范围内
 */
function isPathWithin(targetPath: string, allowedDir: string): boolean {
  const resolved = path.resolve(targetPath);
  const allowed = path.resolve(allowedDir);
  return resolved.startsWith(allowed + path.sep) || resolved === allowed;
}

/**
 * 向 renderer 发送 IPC 消息并等待回复（用于 window 对话框）
 */
function sendToRendererAndWait<T>(
  channel: string,
  payload: unknown,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      resolve(undefined);
      return;
    }
    const win = windows[0];
    const responseChannel = `${channel}:response:${Date.now()}`;
    const { ipcMain } = require("electron");
    const handler = (_event: unknown, result: T | undefined) => {
      ipcMain.removeHandler(responseChannel);
      resolve(result);
    };
    ipcMain.handleOnce(responseChannel, handler);
    win.webContents.send(channel, { ...(payload as object), responseChannel });
    // Timeout after 5 minutes
    setTimeout(() => {
      ipcMain.removeHandler(responseChannel);
      resolve(undefined);
    }, 300_000);
  });
}

/**
 * 命令注册表接口（由 PluginManager 提供，避免循环依赖）
 */
export interface CommandRegistryDelegate {
	registerCommand(
		pluginId: string,
		command: string,
		callback: (...args: unknown[]) => unknown,
	): { dispose(): void };
	executeCommand(command: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * 为指定插件创建 PluginAPI 实例
 */
export function createPluginAPI(
  pluginInfo: PluginInfo,
  permissionService: PermissionService,
  chatHookRegistry?: ChatHookRegistry,
  uiContributionRegistry?: UIContributionRegistry,
  commandRegistry?: CommandRegistryDelegate,
): PluginAPI {
  const pluginId = pluginInfo.id;
  const pluginPath = pluginInfo.path;
  const storagePath = path.join(
    require("electron").app.getPath("userData"),
    "plugin-storage",
    pluginId,
  );

  const log = logger.withContext(`Plugin:${pluginId}`);
  const subscriptions: { dispose(): void }[] = [];

  // ====== commands ======
  const commands = {
    registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
    ): () => void {
      requirePermission(permissionService, pluginId, "commands");
      if (!commandRegistry) {
        throw new Error("Command registry not available");
      }
      const disposable = commandRegistry.registerCommand(
        pluginId,
        command,
        callback,
      );
      subscriptions.push(disposable);
      return () => disposable.dispose();
    },
    async executeCommand(
      command: string,
      ...args: unknown[]
    ): Promise<unknown> {
      if (!commandRegistry) {
        throw new Error("Command registry not available");
      }
      return commandRegistry.executeCommand(command, ...args);
    },
  };

  // ====== events ======
  const configChangeEmitter = createEventEmitter<ConfigurationChangeEvent>();
  const windowStateEmitter = createEventEmitter<WindowState>();
  const events = {
    onDidChangeConfiguration: configChangeEmitter,
    onDidChangeActiveTextEditor: createEventEmitter<unknown>(),
    onDidChangeWindowState: windowStateEmitter,
  };

  // ====== storage ======
  const storage = {
    async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
      requirePermission(permissionService, pluginId, "storage");
      const data = storeManager.getConfig("pluginsData") as
        | Record<string, T>
        | undefined;
      return data?.[`${pluginId}.${key}`] ?? defaultValue;
    },
    async set<T>(key: string, value: T): Promise<void> {
      requirePermission(permissionService, pluginId, "storage");
      const data =
        (storeManager.getConfig("pluginsData") as
          | Record<string, unknown>
          | undefined) || {};
      data[`${pluginId}.${key}`] = value;
      storeManager.setConfig("pluginsData", data);
    },
    async delete(key: string): Promise<void> {
      requirePermission(permissionService, pluginId, "storage");
      const data =
        (storeManager.getConfig("pluginsData") as
          | Record<string, unknown>
          | undefined) || {};
      delete data[`${pluginId}.${key}`];
      storeManager.setConfig("pluginsData", data);
    },
  };

  // ====== window ======
  const windowAPI = {
    async showInformationMessage(
      message: string,
      ...items: string[]
    ): Promise<string | undefined> {
      requirePermission(permissionService, pluginId, "window.notify");
      return sendToRendererAndWait<string>("plugin:showMessage", {
        type: "info",
        message,
        items,
        pluginId,
      });
    },
    async showWarningMessage(
      message: string,
      ...items: string[]
    ): Promise<string | undefined> {
      requirePermission(permissionService, pluginId, "window.notify");
      return sendToRendererAndWait<string>("plugin:showMessage", {
        type: "warning",
        message,
        items,
        pluginId,
      });
    },
    async showErrorMessage(
      message: string,
      ...items: string[]
    ): Promise<string | undefined> {
      requirePermission(permissionService, pluginId, "window.notify");
      return sendToRendererAndWait<string>("plugin:showMessage", {
        type: "error",
        message,
        items,
        pluginId,
      });
    },
    async showInputBox(options?: InputBoxOptions): Promise<string | undefined> {
      requirePermission(permissionService, pluginId, "window.input");
      return sendToRendererAndWait<string>("plugin:showInputBox", {
        options,
        pluginId,
      });
    },
    async showQuickPick<T extends QuickPickItem>(
      items: T[],
      options?: QuickPickOptions,
    ): Promise<T | undefined> {
      requirePermission(permissionService, pluginId, "window.input");
      return sendToRendererAndWait<T>("plugin:showQuickPick", {
        items,
        options,
        pluginId,
      });
    },
  };

  // ====== network ======
  const network = {
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      requirePermission(permissionService, pluginId, "network");
      log.debug("Network fetch", { url });
      return globalThis.fetch(url, init);
    },
  };

  // ====== fs ======
  function requireFsRead(targetPath: string): void {
    const inPlugin = isPathWithin(targetPath, pluginPath);
    const inStorage = isPathWithin(targetPath, storagePath);
    if (inPlugin || inStorage) {
      requirePermission(permissionService, pluginId, "fs.read");
    } else {
      requirePermission(permissionService, pluginId, "fs.readExternal");
    }
  }

  function requireFsWrite(targetPath: string): void {
    const inPlugin = isPathWithin(targetPath, pluginPath);
    const inStorage = isPathWithin(targetPath, storagePath);
    if (inPlugin || inStorage) {
      requirePermission(permissionService, pluginId, "fs.write");
    } else {
      requirePermission(permissionService, pluginId, "fs.writeExternal");
    }
  }

  const fsAPI = {
    async readFile(filePath: string): Promise<Uint8Array> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsRead(resolved);
      return fs.readFile(resolved);
    },
    async writeFile(filePath: string, data: Uint8Array): Promise<void> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsWrite(resolved);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, data);
    },
    async readTextFile(filePath: string): Promise<string> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsRead(resolved);
      return fs.readFile(resolved, "utf-8");
    },
    async writeTextFile(filePath: string, content: string): Promise<void> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsWrite(resolved);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf-8");
    },
    async exists(filePath: string): Promise<boolean> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsRead(resolved);
      try {
        await fs.access(resolved);
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(
      filePath: string,
      options?: { recursive?: boolean },
    ): Promise<void> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsWrite(resolved);
      await fs.mkdir(resolved, options);
    },
    async readdir(filePath: string): Promise<string[]> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsRead(resolved);
      return fs.readdir(resolved);
    },
    async stat(filePath: string): Promise<FileStat> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsRead(resolved);
      const stat = await fs.stat(resolved);
      return {
        type: stat.isFile()
          ? "file"
          : stat.isDirectory()
            ? "directory"
            : "symlink",
        size: stat.size,
        ctime: stat.ctimeMs,
        mtime: stat.mtimeMs,
      };
    },
    async delete(
      filePath: string,
      options?: { recursive?: boolean },
    ): Promise<void> {
      const resolved = path.resolve(pluginPath, filePath);
      requireFsWrite(resolved);
      await fs.rm(resolved, { ...options, force: true });
    },
  };

  // ====== logger ======
  const loggerAPI = {
    trace(message: string, ...args: unknown[]): void {
      log.debug(message, args.length > 0 ? args : undefined);
    },
    debug(message: string, ...args: unknown[]): void {
      log.debug(message, args.length > 0 ? args : undefined);
    },
    info(message: string, ...args: unknown[]): void {
      log.info(message, args.length > 0 ? args : undefined);
    },
    warn(message: string, ...args: unknown[]): void {
      log.warn(message, args.length > 0 ? args : undefined);
    },
    error(message: string, ...args: unknown[]): void {
      log.error(
        message,
        args[0] instanceof Error ? args[0] : undefined,
        args.length > 1 ? args.slice(1) : undefined,
      );
    },
  };

  // ====== chat hooks ======
  const chat = {
    onPreSend(handler: PreSendHook): { dispose(): void } {
      requirePermission(permissionService, pluginId, "chat.hooks");
      if (!chatHookRegistry) {
        throw new Error("Chat hook registry not available");
      }
      return chatHookRegistry.register(pluginId, "preSend", handler);
    },
    onSystemPrompt(handler: SystemPromptHook): { dispose(): void } {
      requirePermission(permissionService, pluginId, "chat.hooks");
      if (!chatHookRegistry) {
        throw new Error("Chat hook registry not available");
      }
      return chatHookRegistry.register(pluginId, "systemPrompt", handler);
    },
    onPostStream(handler: PostStreamHook): { dispose(): void } {
      requirePermission(permissionService, pluginId, "chat.hooks");
      if (!chatHookRegistry) {
        throw new Error("Chat hook registry not available");
      }
      return chatHookRegistry.register(pluginId, "postStream", handler);
    },
    onPostResponse(handler: PostResponseHook): { dispose(): void } {
      requirePermission(permissionService, pluginId, "chat.hooks");
      if (!chatHookRegistry) {
        throw new Error("Chat hook registry not available");
      }
      return chatHookRegistry.register(pluginId, "postResponse", handler);
    },
  };

  // ====== mcp ======
  const mcp = {
    registerTools(config: PluginMcpToolConfig): { dispose(): void } {
      requirePermission(permissionService, pluginId, "mcp.tools");
      const serverId = `plugin:${pluginId}/${config.id}`;
      const handlers = new Map<
        string,
        (args: Record<string, unknown>) => Promise<{
          content: Array<{ type: "text"; text: string }>;
          isError?: boolean;
        }>
      >();
      for (const tool of config.tools) {
        handlers.set(tool.name, tool.handler);
      }
      const server: InternalMcpServer = {
        id: serverId,
        name: config.name,
        description: config.description,
        version: "1.0.0",
        tools: config.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        handlers: handlers as any,
      };
      internalMcpService.registerDynamic(server, pluginId);
      log.info("Registered MCP tools", { serverId });
      const disposable = {
        dispose() {
          internalMcpService.unregisterDynamic(pluginId);
        },
      };
      subscriptions.push(disposable);
      return disposable;
    },
  };

  // ====== skills ======
  const skills = {
    registerSkill(config: PluginSkillConfig): { dispose(): void } {
      requirePermission(permissionService, pluginId, "skills.create");
      const skillId = `plugin:${pluginId}/${config.id}`;
      const skillService = getSkillService();
      const handlers: Record<
        string,
        (input: Record<string, unknown>) => Promise<unknown>
      > = {};
      for (const tool of config.tools) {
        handlers[tool.name] = tool.handler;
      }
      skillService.registerDynamic(
        {
          id: skillId,
          manifest: {
            id: skillId,
            name: config.name,
            description: config.description,
            version: "1.0.0",
            author: pluginId,
            icon: config.icon,
            category: config.category,
            systemPrompt: config.systemPrompt,
            tools: config.tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
          path: pluginPath,
          enabled: true,
          handlers,
        },
        pluginId,
      );
      log.info("Registered skill", { skillId });
      const disposable = {
        dispose() {
          skillService.unregisterDynamic(pluginId);
        },
      };
      subscriptions.push(disposable);
      return disposable;
    },
  };

  // ====== ui ======
  const ui = {
    registerSidebarItem(config: SidebarItemConfig): { dispose(): void } {
      requirePermission(permissionService, pluginId, "ui.sidebar");
      if (!uiContributionRegistry) {
        throw new Error("UI contribution registry not available");
      }
      return uiContributionRegistry.registerSidebar({
        pluginId,
        ...config,
      });
    },
    registerPage(config: PageConfig): { dispose(): void } {
      requirePermission(permissionService, pluginId, "ui.pages");
      if (!uiContributionRegistry) {
        throw new Error("UI contribution registry not available");
      }
      return uiContributionRegistry.registerPage({
        pluginId,
        ...config,
      });
    },
  };

  return {
    version: "1.0.0",
    commands,
    events,
    storage,
    window: windowAPI,
    network,
    fs: fsAPI,
    logger: loggerAPI,
    chat,
    mcp,
    skills,
    ui,
    extensionPath: pluginPath,
    subscriptions,
  };
}
