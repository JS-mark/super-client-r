/**
 * 协议处理服务
 * 处理自定义 scheme: superclient://
 * 支持 skill 导入、三方登录、配置文件导入
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import { logger } from "../utils/logger";
import { pathService } from "./pathService";
import { getSkillService } from "./skill/SkillService";

// 协议名称
const PROTOCOL_SCHEME = "superclient";

/** 协议参数里视为敏感、不得明文入日志的 key（大小写不敏感）。 */
const SENSITIVE_PARAM_KEYS = new Set([
	"code",
	"token",
	"access_token",
	"refresh_token",
	"id_token",
	"state",
	"client_secret",
	"secret",
	"password",
]);

/**
 * 脱敏协议参数用于日志：命中敏感 key 的值打码，其余保留。
 * 授权回调里的 code/token/state 绝不明文落日志。
 */
export function redactParams(
	params: Record<string, string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(params)) {
		out[k] = SENSITIVE_PARAM_KEYS.has(k.toLowerCase()) && v ? "***" : v;
	}
	return out;
}

/**
 * 把用户提供的 skill 名规范成安全的单段文件名（不含扩展名）。
 * 拒绝路径分隔符、`..`、绝对路径；无效时返回 null。
 */
export function sanitizeSkillName(raw: string | undefined): string | null {
	if (!raw) return null;
	const name = raw.trim();
	if (!name) return null;
	// 不允许任何路径语义：分隔符、`..`、绝对路径、盘符
	if (
		name.includes("/") ||
		name.includes("\\") ||
		name.includes("\0") ||
		name === "." ||
		name === ".." ||
		isAbsolute(name)
	) {
		return null;
	}
	return name;
}

/**
 * 校验 filePath 规范化后仍落在 baseDir 内（防 `..` 穿越）。
 */
export function isInsideDir(baseDir: string, filePath: string): boolean {
	const rel = relative(resolve(baseDir), resolve(filePath));
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

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
		params: redactParams(data.params),
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
 * 远程 skill 导入前的用户确认弹窗。
 * 无主窗口时（无 UI 上下文）保守拒绝，不静默落盘。
 */
async function confirmRemoteSkillImport(
	url: string,
	mainWindow?: BrowserWindow | null,
): Promise<boolean> {
	if (!mainWindow) return false;

	let host = url;
	try {
		host = new URL(url).host || url;
	} catch {
		// 无法解析的 url 直接拒绝
		return false;
	}

	const { response } = await dialog.showMessageBox(mainWindow, {
		type: "warning",
		buttons: ["取消", "导入"],
		defaultId: 0,
		cancelId: 0,
		title: "导入外部 Skill",
		message: "确认导入来自外部来源的 Skill？",
		detail: `来源：${host}\n\nSkill 会被保存到本地并由应用加载执行。请确认你信任该来源。`,
		noLink: true,
	});

	return response === 1;
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

	// 安全：远程 skill 会落盘并被 skill 服务加载/执行，属于代码执行入口。
	// 从任意 url 拉取前必须经用户显式确认，避免恶意深链静默植入 skill。
	if (!(await confirmRemoteSkillImport(url, mainWindow))) {
		logger.warn("Skill import cancelled by user", { url });
		mainWindow?.webContents.send("protocol:skill-imported", {
			success: false,
			error: "cancelled",
		});
		return;
	}

	try {
		// 下载 skill 配置
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to download skill: ${response.statusText}`);
		}

		const skillConfig = (await response.json()) as { name?: string };

		// 安全：skill 名只能来自可信来源且必须是安全的单段文件名。
		// 优先用 url 显式 name，其次用下载内容里的 name；两者都要过 sanitize，
		// 拒绝 `../`、绝对路径等穿越语义，否则 `name=../../x` 可写出 skills 目录。
		const skillName =
			sanitizeSkillName(name) ||
			sanitizeSkillName(skillConfig?.name) ||
			"imported-skill";

		// 保存到 skills 目录
		const skillsDir = join(pathService.getPaths().base, "skills");
		if (!existsSync(skillsDir)) {
			mkdirSync(skillsDir, { recursive: true });
		}

		const skillPath = join(skillsDir, `${skillName}.json`);

		// 双保险：规范化后的落点必须仍在 skillsDir 内。
		if (!isInsideDir(skillsDir, skillPath)) {
			throw new Error("Resolved skill path escapes skills directory");
		}

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
