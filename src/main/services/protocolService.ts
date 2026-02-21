/**
 * 协议处理服务
 * 处理自定义 scheme: superclient://
 * 支持 skill 导入、三方登录、配置文件导入
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, type BrowserWindow } from "electron";
import { logger } from "../utils/logger";
import { pathService } from "./pathService";
import { getSkillService } from "./skill/SkillService";

// 协议名称
const PROTOCOL_SCHEME = "superclient";

// 协议动作类型
export type ProtocolAction =
  | "import-skill" // 导入 skill
  | "import-config" // 导入配置文件
  | "auth-callback"; // 三方登录回调

// 协议数据接口
export interface ProtocolData {
  action: ProtocolAction;
  params: Record<string, string>;
}

/**
 * 解析协议 URL
 * superclient://import-skill?url=https://example.com/skill.json
 * superclient://import-config?url=https://example.com/config.json
 * superclient://auth-callback?provider=github&code=xxx&state=yyy
 */
export function parseProtocolUrl(url: string): ProtocolData | null {
  try {
    const urlObj = new URL(url);

    if (urlObj.protocol !== `${PROTOCOL_SCHEME}:`) {
      return null;
    }

    const action = urlObj.hostname as ProtocolAction;
    const params: Record<string, string> = {};

    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return { action, params };
  } catch (error) {
    logger.error(
      "Failed to parse protocol URL",
      error instanceof Error ? error : undefined,
    );
    return null;
  }
}

/**
 * 处理协议数据
 */
export async function handleProtocolData(
  data: ProtocolData,
  mainWindow?: BrowserWindow | null,
): Promise<void> {
  logger.info("Handling protocol action", {
    action: data.action,
    params: data.params,
  });

  switch (data.action) {
    case "import-skill":
      await handleImportSkill(data.params, mainWindow);
      break;
    case "import-config":
      await handleImportConfig(data.params, mainWindow);
      break;
    case "auth-callback":
      await handleAuthCallback(data.params, mainWindow);
      break;
    default:
      logger.warn("Unknown protocol action", { action: data.action });
  }
}

/**
 * 处理 skill 导入
 * superclient://import-skill?url=https://example.com/skill.json
 */
async function handleImportSkill(
  params: Record<string, string>,
  mainWindow?: BrowserWindow | null,
): Promise<void> {
  const { url, name } = params;

  if (!url) {
    logger.error("Missing url parameter for import-skill");
    return;
  }

  try {
    // 下载 skill 配置
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download skill: ${response.statusText}`);
    }

    const skillConfig = (await response.json()) as { name?: string };
    const skillName = name || skillConfig?.name || "imported-skill";

    // 保存到 skills 目录
    const skillsDir = join(pathService.getPaths().base, "skills");
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    const skillPath = join(skillsDir, `${skillName}.json`);
    writeFileSync(skillPath, JSON.stringify(skillConfig, null, 2));

    // 重新加载 skill 服务
    await getSkillService(skillsDir).initialize();

    logger.info("Skill imported successfully", {
      name: skillName,
      path: skillPath,
    });

    // 通知渲染进程
    mainWindow?.webContents.send("protocol:skill-imported", {
      success: true,
      name: skillName,
    });

    // 显示主窗口并导航到技能页面
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send("navigate-to", "/skills");
  } catch (error) {
    logger.error(
      "Failed to import skill",
      error instanceof Error ? error : undefined,
    );
    mainWindow?.webContents.send("protocol:skill-imported", {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * 处理配置文件导入
 * superclient://import-config?url=https://example.com/config.json
 */
async function handleImportConfig(
  params: Record<string, string>,
  mainWindow?: BrowserWindow | null,
): Promise<void> {
  const { url, type = "app" } = params;

  if (!url) {
    logger.error("Missing url parameter for import-config");
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download config: ${response.statusText}`);
    }

    const config = await response.json();

    logger.info("Config imported successfully", { type });

    // 通知渲染进程
    mainWindow?.webContents.send("protocol:config-imported", {
      success: true,
      type,
      config,
    });

    mainWindow?.show();
    mainWindow?.focus();
  } catch (err) {
    logger.error(
      "Failed to import config",
      err instanceof Error ? err : new Error(String(err)),
    );
    mainWindow?.webContents.send("protocol:config-imported", {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * 处理三方登录回调
 * superclient://auth-callback?provider=github&code=xxx&state=yyy
 * superclient://auth-callback?provider=google&code=xxx&state=yyy
 * superclient://auth-callback?provider=oidc&code=xxx&state=yyy&iss=xxx
 */
async function handleAuthCallback(
  params: Record<string, string>,
  mainWindow?: BrowserWindow | null,
): Promise<void> {
  const { provider, code, state, error, error_description } = params;

  if (error) {
    logger.error("Auth callback error", new Error(error), {
      error_description,
    });
    mainWindow?.webContents.send("protocol:auth-error", {
      provider,
      authError: error,
      authErrorDescription: error_description,
    });
    return;
  }

  if (!code || !provider) {
    logger.error("Missing code or provider in auth callback");
    return;
  }

  logger.info("Auth callback received", { provider, hasState: !!state });

  // 通知渲染进程
  mainWindow?.webContents.send("protocol:auth-callback", {
    provider,
    code,
    state,
    params,
  });

  // 显示主窗口
  mainWindow?.show();
  mainWindow?.focus();
}

/**
 * 注册为默认协议客户端
 */
export function registerProtocol(): boolean {
  if (process.defaultApp) {
    // 开发环境，使用命令行参数处理
    return false;
  }

  const success = app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  logger.info("Protocol registration", { scheme: PROTOCOL_SCHEME, success });
  return success;
}

/**
 * 处理第二个实例启动（Windows/Linux）
 */
export function handleSecondInstance(
  argv: string[],
  mainWindow?: BrowserWindow | null,
): void {
  logger.info("Second instance started", { argv });

  // Windows/Linux: 协议 URL 在命令行参数中
  const protocolUrl = argv.find((arg) =>
    arg.startsWith(`${PROTOCOL_SCHEME}://`),
  );

  if (protocolUrl) {
    const data = parseProtocolUrl(protocolUrl);
    if (data) {
      handleProtocolData(data, mainWindow);
    }
  }

  // 显示主窗口
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * 处理 macOS open-url 事件
 */
export function handleOpenUrl(
  url: string,
  mainWindow?: BrowserWindow | null,
): void {
  logger.info("Open URL received", { url });

  const data = parseProtocolUrl(url);
  if (data) {
    handleProtocolData(data, mainWindow);
  }
}

/**
 * 检查启动参数中是否有协议 URL
 */
export function checkStartupProtocol(argv: string[]): void {
  const protocolUrl = argv.find((arg) =>
    arg.startsWith(`${PROTOCOL_SCHEME}://`),
  );

  if (protocolUrl) {
    logger.info("Startup with protocol URL", { url: protocolUrl });
    // 存储待处理的 URL，等窗口创建后处理
    process.env.PENDING_PROTOCOL_URL = protocolUrl;
  }
}
