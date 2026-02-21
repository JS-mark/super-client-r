/**
 * UI 贡献注册表
 * 管理插件贡献的侧边栏项、设置面板、自定义页面
 */

import { EventEmitter } from "node:events";
import { BrowserWindow } from "electron";
import { logger } from "../../utils/logger";

const log = logger.withContext("UIContributions");

export interface SidebarContribution {
  pluginId: string;
  id: string;
  label: string;
  icon: string;
  iconType: "default" | "emoji";
  path: string;
  order?: number;
}

export interface SettingsPanelContribution {
  pluginId: string;
  id: string;
  title: string;
  icon: string;
  properties: Record<
    string,
    {
      type: string;
      default?: unknown;
      description: string;
      enum?: string[];
      enumDescriptions?: string[];
    }
  >;
}

export interface PageContribution {
  pluginId: string;
  id: string;
  path: string;
  title: string;
  htmlFile: string;
}

export class UIContributionRegistry extends EventEmitter {
  private sidebars: SidebarContribution[] = [];
  private settingsPanels: SettingsPanelContribution[] = [];
  private pages: PageContribution[] = [];

  /**
   * 注册侧边栏项
   */
  registerSidebar(
    config: Omit<SidebarContribution, "iconType" | "path"> & {
      iconType?: "default" | "emoji";
      path?: string;
    },
  ): { dispose(): void } {
    const contribution: SidebarContribution = {
      ...config,
      iconType: config.iconType ?? "default",
      path: config.path ?? `/plugin/${config.pluginId}/${config.id}`,
    };
    this.sidebars.push(contribution);
    log.info("Sidebar registered", {
      pluginId: config.pluginId,
      id: config.id,
    });
    this.broadcastChange();
    return {
      dispose: () => {
        this.sidebars = this.sidebars.filter(
          (s) =>
            !(
              s.pluginId === config.pluginId &&
              s.id === config.id
            ),
        );
        this.broadcastChange();
      },
    };
  }

  /**
   * 注册设置面板
   */
  registerSettingsPanel(
    config: SettingsPanelContribution,
  ): { dispose(): void } {
    this.settingsPanels.push(config);
    log.info("Settings panel registered", {
      pluginId: config.pluginId,
      id: config.id,
    });
    this.broadcastChange();
    return {
      dispose: () => {
        this.settingsPanels = this.settingsPanels.filter(
          (s) =>
            !(
              s.pluginId === config.pluginId &&
              s.id === config.id
            ),
        );
        this.broadcastChange();
      },
    };
  }

  /**
   * 注册自定义页面
   */
  registerPage(config: PageContribution): { dispose(): void } {
    this.pages.push(config);
    log.info("Page registered", {
      pluginId: config.pluginId,
      id: config.id,
    });
    this.broadcastChange();
    return {
      dispose: () => {
        this.pages = this.pages.filter(
          (p) =>
            !(
              p.pluginId === config.pluginId &&
              p.id === config.id
            ),
        );
        this.broadcastChange();
      },
    };
  }

  /**
   * 注销指定插件的所有 UI 贡献
   */
  unregisterAll(pluginId: string): void {
    const hadContributions =
      this.sidebars.some((s) => s.pluginId === pluginId) ||
      this.settingsPanels.some((s) => s.pluginId === pluginId) ||
      this.pages.some((p) => p.pluginId === pluginId);

    this.sidebars = this.sidebars.filter(
      (s) => s.pluginId !== pluginId,
    );
    this.settingsPanels = this.settingsPanels.filter(
      (s) => s.pluginId !== pluginId,
    );
    this.pages = this.pages.filter((p) => p.pluginId !== pluginId);

    if (hadContributions) {
      log.info("All UI contributions unregistered", { pluginId });
      this.broadcastChange();
    }
  }

  // Query methods
  getAllSidebars(): SidebarContribution[] {
    return [...this.sidebars].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100),
    );
  }

  getAllSettingsPanels(): SettingsPanelContribution[] {
    return [...this.settingsPanels];
  }

  getAllPages(): PageContribution[] {
    return [...this.pages];
  }

  getAllContributions(): {
    sidebars: SidebarContribution[];
    settingsPanels: SettingsPanelContribution[];
    pages: PageContribution[];
  } {
    return {
      sidebars: this.getAllSidebars(),
      settingsPanels: this.getAllSettingsPanels(),
      pages: this.getAllPages(),
    };
  }

  /**
   * 广播变更事件到所有 renderer 窗口
   */
  private broadcastChange(): void {
    this.emit("changed");
    const contributions = this.getAllContributions();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send(
            "plugin:ui-contributions-changed",
            contributions,
          );
        } catch {
          // Window may have been closed
        }
      }
    }
  }
}
