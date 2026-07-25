/**
 * Electron 主进程入口
 * 遵循 electron-vite 最佳实践
 */

import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	nativeImage,
	screen,
	shell,
	Tray,
} from "electron";
import { homedir } from "os";
import { join } from "path";
import { registerIpcHandlers } from "./ipc";
import {
	bootstrapAgentRuntime,
	disposeAgentRuntime,
} from "./services/agent/runtime/bootstrap";
import {
	setFloatingWindow,
	setLogViewerOpener,
	setIMBotService,
	setRemoteDeviceService,
	setRemoteControlEventService,
	setRemoteChatBridge,
} from "./ipc/service-holders";
import { initializePluginManager } from "./ipc/api-impl";
import { setupWindowEventListeners } from "./ipc/window-events";
import { localServer, migrateServerApiKey } from "./server";
import { logDatabaseService } from "./services/log";
import { pathService } from "./services/pathService";
import {
	handleOpenUrl,
	handleProtocolData,
	handleSecondInstance,
	parseProtocolUrl,
	registerProtocol,
} from "./services/protocolService";
import { getSkillService } from "./services/skill/SkillService";
import { conversationStorage } from "./services/chat/ConversationStorageService";
import { initializeProjectStorage } from "./services/storage/ProjectStorageService";
import {
	initializeSessionStorage,
	getSessionStorage,
} from "./services/storage/SessionStorageService";
import { initializeLegacyImporter } from "./services/storage/LegacyImporter";
import { storeManager } from "./store/StoreManager";
import { updateService } from "./services/updateService";
import { logger } from "./utils/logger";
import { internalMcpService } from "./services/mcp/internal";
import { mcpService } from "./services/mcp/McpService";
import { appConfigService } from "./services/config/AppConfigService";
import { ptyService } from "./services/pty/PtyService";

// 仅在开发环境禁用沙箱以避免 "Operation not permitted" 错误
// 生产环境启用沙箱以提高安全性
if (!app.isPackaged) {
	app.commandLine.appendSwitch("no-sandbox");
}
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
// 禁用 Chrome 扩展系统，消除 "Could not establish connection" 警告
app.commandLine.appendSwitch("disable-extensions");
// Disable Autofill features to prevent DevTools errors
app.commandLine.appendSwitch(
	"disable-features",
	"AutofillServer,PasswordManager,Autofill,AutofillAssistant,AutofillPasswordManager,AutofillAddress,AutofillCreditCard,AutofillProfile,AutofillDownloadManager,AutofillFeedback",
);

// 开发环境将 userData 设置到用户 home 目录下，避免权限问题
// dev 环境使用 .scr-data-dev，打包环境使用 .scr-data，实现数据隔离
if (!app.isPackaged) {
	const userDataPath = join(homedir(), ".scr-data-dev");
	app.setPath("userData", userDataPath);
}

// 注册为默认协议客户端
registerProtocol();

// 限制单实例运行
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	logger.info("Another instance is running, quitting...");
	app.quit();
}

let mainWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let logViewerWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

/**
 * 获取应用图标路径
 */
function getAppIconPath(): string {
	return app.isPackaged
		? join(process.resourcesPath, "build/icons/icon.png")
		: join(process.cwd(), "build/icons/icon.png");
}

/**
 * 创建主窗口
 */
function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1024,
		height: 750,
		minWidth: 1024,
		minHeight: 750,
		show: false, // 延迟显示，避免闪烁
		icon: getAppIconPath(),
		frame: false, // 隐藏默认标题栏，使用自定义标题栏
		titleBarStyle: "hidden", // macOS 隐藏标题栏
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: !app.isPackaged, // 生产环境启用沙箱
			webSecurity: true,
			devTools: true, // 始终启用开发者工具，便于调试
		},
	});

	// 窗口准备好后显示
	mainWindow.once("ready-to-show", () => {
		mainWindow?.show();
	});

	// 加载页面
	if (process.env["ELECTRON_RENDERER_URL"]) {
		mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	} else {
		mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}

	// 处理外部链接
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https:")) {
			shell.openExternal(url);
		}
		return { action: "deny" };
	});

	// 窗口关闭时清理
	mainWindow.on("close", (event) => {
		if (!isQuitting) {
			event.preventDefault();
			mainWindow?.hide();
			return false;
		}
		return true;
	});

	// 设置窗口事件监听（用于自定义标题栏状态同步）
	setupWindowEventListeners(mainWindow);

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	logger.info("Main window created");
}

function createFloatingWindow(): void {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width: workWidth } = primaryDisplay.workAreaSize;

	floatingWindow = new BrowserWindow({
		width: 56,
		height: 56,
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		hasShadow: false,
		skipTaskbar: true,
		show: false, // 初始不显示，根据设置决定是否显示
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: !app.isPackaged, // 生产环境启用沙箱
			webSecurity: true, // 启用 web 安全
		},
	});

	const x = workWidth - 80;
	const y = 100;
	floatingWindow.setPosition(x, y);

	if (process.env["ELECTRON_RENDERER_URL"]) {
		floatingWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/#/float`);
	} else {
		floatingWindow.loadFile(join(__dirname, "../renderer/index.html"), {
			hash: "float",
		});
	}

	// 将窗口实例设置到 handler 中
	setFloatingWindow(floatingWindow);

	// floatingWindow.webContents.openDevTools({ mode: 'detach' })
}

function createLogViewerWindow(): void {
	// Single instance: if exists, focus it
	if (logViewerWindow && !logViewerWindow.isDestroyed()) {
		logViewerWindow.show();
		logViewerWindow.focus();
		return;
	}

	logViewerWindow = new BrowserWindow({
		width: 1100,
		height: 700,
		minWidth: 800,
		minHeight: 500,
		frame: false,
		icon: getAppIconPath(),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: !app.isPackaged,
			webSecurity: true,
		},
	});

	if (process.env["ELECTRON_RENDERER_URL"]) {
		logViewerWindow.loadURL(
			`${process.env["ELECTRON_RENDERER_URL"]}/#/log-viewer`,
		);
	} else {
		logViewerWindow.loadFile(join(__dirname, "../renderer/index.html"), {
			hash: "log-viewer",
		});
	}

	logViewerWindow.on("closed", () => {
		logViewerWindow = null;
	});
}

function createTray(): void {
	// macOS 托盘图标: 20x20 彩色图标
	const iconPath = app.isPackaged
		? join(process.resourcesPath, "build/icons/tray-icon.png")
		: join(process.cwd(), "build/icons/tray-icon.png");
	const icon = nativeImage.createFromPath(iconPath);

	tray = new Tray(icon);
	const contextMenu = Menu.buildFromTemplate([
		{
			label: "显示主窗口",
			click: () => {
				mainWindow?.show();
				mainWindow?.focus();
			},
		},
		{ type: "separator" },
		{
			label: "使用说明",
			click: () => {
				shell.openExternal("https://js-mark.com/super-client-r/");
			},
		},
		{
			label: "关于",
			click: () => {
				mainWindow?.show();
				mainWindow?.webContents.send("show-about-modal");
			},
		},
		{ type: "separator" },
		{ type: "separator" },
		{
			label: "退出",
			click: () => {
				isQuitting = true;
				app.quit();
			},
		},
	]);
	tray.setToolTip("Super Client");
	tray.setContextMenu(contextMenu);

	tray.on("click", () => {
		if (mainWindow?.isVisible()) {
			if (mainWindow.isFocused()) {
				mainWindow.hide();
			} else {
				mainWindow.show();
				mainWindow.focus();
			}
		} else {
			mainWindow?.show();
			mainWindow?.focus();
		}
	});
}

function createMenu(): void {
	if (process.platform === "darwin") {
		const template: any[] = [
			{
				label: app.name,
				submenu: [
					{
						label: `关于 ${app.name}`,
						click: () => {
							mainWindow?.show();
							mainWindow?.webContents.send(
								"navigate-to",
								"/settings?tab=about",
							);
						},
					},
					{ type: "separator" },
					{
						label: "设置...",
						accelerator: "CmdOrCtrl+,",
						click: () => {
							mainWindow?.show();
							mainWindow?.webContents.send("navigate-to", "/settings");
						},
					},
					{ type: "separator" },
					{ role: "services" },
					{ type: "separator" },
					{ role: "hide" },
					{ role: "hideOthers" },
					{ role: "unhide" },
					{ type: "separator" },
					{ role: "quit" },
				],
			},
			{
				role: "editMenu",
			},
			{
				label: "窗口",
				submenu: [
					{ role: "minimize" },
					{ role: "zoom" },
					{ type: "separator" },
					{ role: "front" },
					{ type: "separator" },
					{ role: "window" },
				],
			},
			{
				label: "工具",
				submenu: [
					{
						label: "开发者工具",
						accelerator: "Alt+CmdOrCtrl+I",
						click: () => {
							mainWindow?.webContents.toggleDevTools();
						},
					},
					{ type: "separator" },
					{
						label: "重新加载",
						accelerator: "CmdOrCtrl+R",
						click: () => {
							mainWindow?.webContents.reload();
						},
					},
				],
			},
			{
				label: "帮助",
				submenu: [
					{
						label: "使用文档",
						click: () => {
							shell.openExternal("https://js-mark.com/super-client-r/");
						},
					},
					{
						label: "快捷键说明",
						click: () => {
							mainWindow?.show();
							mainWindow?.webContents.send(
								"navigate-to",
								"/settings?tab=shortcuts",
							);
						},
					},
					{
						label: "查看日志",
						click: () => {
							createLogViewerWindow();
						},
					},
					{
						label: "网络请求日志",
						accelerator: "CommandOrControl+Shift+N",
						click: () => {
							mainWindow?.show();
							mainWindow?.webContents.send("network:open-log-drawer");
						},
					},
					{ type: "separator" },
					{
						label: "发送反馈",
						click: () => {
							shell.openExternal(
								"https://github.com/js-mark/super-client-r/issues",
							);
						},
					},
					{ type: "separator" },
					{
						label: "关于",
						click: () => {
							mainWindow?.show();
							mainWindow?.webContents.send("show-about-modal");
						},
					},
				],
			},
		];
		const menu = Menu.buildFromTemplate(template);
		Menu.setApplicationMenu(menu);
	}
}

function registerWindowHandlers(): void {
	ipcMain.on("resize-float-window", (_event, { width, height }) => {
		if (floatingWindow) {
			const [currentX, currentY] = floatingWindow.getPosition();
			const [currentWidth] = floatingWindow.getSize();
			const newX = currentX + (currentWidth - width);
			floatingWindow.setBounds({ x: newX, y: currentY, width, height });
		}
	});

	ipcMain.on("open-main-window", (_event, data?: { message?: string }) => {
		if (mainWindow) {
			mainWindow.show();
			mainWindow.focus();
		} else {
			createWindow();
		}
		if (data?.message && mainWindow) {
			mainWindow.webContents.send("navigate-to", "/chat");
			mainWindow.webContents.send("float:pending-message", {
				message: data.message,
			});
		}
	});
}

/**
 * 应用就绪
 */
app.whenReady().then(async () => {
	// macOS / Linux GUI 进程从 Finder/Dock 启动时拿到的 PATH 极简（不含
	// /usr/local/bin、/opt/homebrew/bin、/opt/local/bin 等），会导致后续
	// execFile("git", ...) 等命令 ENOENT，UI 显示「非 git 仓库」之类的误报。
	// 在 whenReady 最前面、任何依赖 PATH 的 service 启动之前修一次。
	// fix-path v5 是 ESM-only，main bundle 是 CJS，所以必须走动态 import。
	if (process.platform !== "win32") {
		try {
			const { default: fixPath } = await import("fix-path");
			fixPath();
		} catch (err) {
			logger.warn("[fix-path] failed to extend PATH", err);
		}
	}

	// Initialize log database before anything else
	logDatabaseService.initialize();

	// Initialize network proxy & request log (must be before any HTTP requests)
	const { proxyService } = await import("./services/network/ProxyService");
	const { requestLogService } = await import(
		"./services/network/RequestLogService"
	);
	proxyService.initialize();
	requestLogService.initialize();

	logger.info("App is ready");

	// Initialize app config from remote server (OAuth URLs, feature flags, etc.)
	appConfigService.initialize().catch((error) => {
		logger.warn("Failed to initialize app config, using defaults", error);
	});

	// E1 密钥安全改造：把历史明文 apiKey（modelProviders / server sk- key）一次性
	// 迁移到 safeStorage 加密的分表存储，并从 config 磁盘移除明文。幂等；
	// 加密不可用时不迁移、不清明文（避免丢失用户密钥）。
	try {
		const providerMig = storeManager.migrateModelProviderKeys();
		if (providerMig.migrated > 0) {
			logger.info(
				`Encrypted key migration: moved ${providerMig.migrated} provider key(s) to encrypted store`,
			);
		}
		if (!providerMig.available) {
			logger.warn(
				"safeStorage encryption unavailable; provider keys stay plaintext-in-config until encryption is available (memory-only fallback for new keys)",
			);
		}
		const searchMig = storeManager.migrateSearchConfigKeys();
		if (searchMig.migrated > 0) {
			logger.info(
				`Encrypted key migration: moved ${searchMig.migrated} search config key(s) to encrypted store`,
			);
		}
		migrateServerApiKey();
	} catch (error) {
		logger.error(
			"Encrypted key migration failed",
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	// E-7: ConversationStorageService 仍被 main 端 5 个 runtime 服务（SessionRuntimeResolver
	// / AttachmentContextResolver / ApprovalGrantStore / RemoteChatBridge / conversationCwd）
	// 用作"目录工具"层；保留 initialize 但不再走旧 chat.* IPC（已删）。
	conversationStorage.initialize();

	// Project / session storage —— project-session-redesign 主存储。
	const psBaseDir = join(app.getPath("userData"), "super-client");
	const psUserId = conversationStorage.getCurrentUserDir();
	const projectStorage = initializeProjectStorage(psBaseDir, psUserId);
	const sessionStorage = initializeSessionStorage(
		psBaseDir,
		psUserId,
		projectStorage,
	);
	// Wire the project → sessions archive cascade so archiving a project
	// flips archived flag on every non-tombstoned session under it. Kept
	// as a runtime DI point so ProjectStorageService stays session-storage-
	// agnostic (avoids circular deps).
	projectStorage.setArchiveSessionsSink((projectId, archived) => {
		sessionStorage.archiveByProject(projectId, archived);
	});

	// Crash recovery sweep: if the previous run crashed / was killed
	// mid-tool-execution, the jsonl will have a `tool_call` with no matching
	// `tool_result`. The renderer reducer leaves such tool calls in
	// "pending" / "执行中..." forever. Seal them now with a synthetic
	// `tool_result(isError: true)` so the UI loads in a consistent terminal
	// state. Best-effort: errors are logged but don't block app startup.
	try {
		const swept = sessionStorage.sealAllInflightToolCalls(
			"中断：应用未正常退出（上次会话被强制结束）",
		);
		if (swept.toolCalls > 0) {
			logger.warn(
				`Crash recovery: sealed ${swept.toolCalls} in-flight tool call(s) across ${swept.sessions} session(s)`,
			);
		}
		if (swept.errors > 0) {
			logger.warn(
				`Crash recovery: ${swept.errors} session(s) failed to sweep (jsonl corrupt?)`,
			);
		}
	} catch (error) {
		logger.error(
			"Crash recovery sweep failed",
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	// G-3 老数据导入器：detect 在启动时就绪，import 由 renderer Modal 触发。
	initializeLegacyImporter(getSessionStorage(), storeManager, psUserId);

	// 启动本地服务
	await localServer.start();

	// 启动 AgentRuntime 适配层（spec: 2026-06-21-agent-runtime-adapter-design）
	// 必须在 IPC handlers 注册之前——handler 依赖 registry / collector 单例
	bootstrapAgentRuntime();
	logger.info("AgentRuntime registry + trace collector booted");

	// 注册 IPC 处理器
	registerIpcHandlers();
	registerWindowHandlers();
	setLogViewerOpener(createLogViewerWindow);
	logger.info("IPC handlers registered");

	// 初始化内置 MCP 服务器
	internalMcpService
		.initialize()
		.then(() => {
			mcpService.registerInternalServers(
				internalMcpService.getAllServerConfigs(),
			);
			logger.info("Internal MCP servers registered");
		})
		.catch((error) => {
			logger.error("Failed to initialize internal MCP servers", error);
		});

	// 初始化插件管理器（从存储加载已安装插件并自动激活）
	initializePluginManager().catch((error) => {
		logger.error("Failed to initialize plugin manager", error);
	});

	// 初始化技能服务
	// 使用 pathService 提供的路径，实现 dev/release 隔离
	const skillsDir = join(pathService.getPaths().base, "skills");
	getSkillService(skillsDir)
		.initialize()
		.catch((error) => {
			logger.error("Failed to initialize skill service", error);
		});

	// 初始化 IM Bot 和 Remote Device 服务
	try {
		const { remoteDeviceService } = await import("./services/remote");
		const { IMBotService } = await import("./services/imbot");
		const { RemoteControlEventService } = await import(
			"./services/remote/RemoteControlEventService"
		);
		// Service setters are now imported from service-holders at the top

		// 根据 relay 配置决定启动模式
		const relayConfig = storeManager.getRelayConfig();
		const wsPort = 8088;
		if (
			relayConfig?.mode === "relay" &&
			relayConfig.relayUrl &&
			relayConfig.relayKey
		) {
			await remoteDeviceService.startRelay(
				relayConfig.relayUrl,
				relayConfig.relayKey,
			);
			logger.info(
				`Remote Device started in relay mode: ${relayConfig.relayUrl}`,
			);
		} else {
			await remoteDeviceService.start(wsPort);
			logger.info("Remote Device WebSocket server started on port 8088");
		}
		setRemoteDeviceService(remoteDeviceService); // 设置到 IPC 处理器

		// 从存储加载设备
		const devices = storeManager.getRemoteDevices();
		remoteDeviceService.loadDevices(devices);

		// 创建并初始化 IM Bot 服务
		const imbotService = new IMBotService(remoteDeviceService);
		setIMBotService(imbotService); // 设置到 IPC 处理器
		const imbotConfigs = storeManager.getIMBotConfigs();
		await imbotService.loadBots(imbotConfigs);

		// 创建 Remote Chat Bridge（桥接 Chat 页面与 IM Bot）
		const { RemoteChatBridge } = await import(
			"./services/remote-chat/RemoteChatBridge"
		);
		// setRemoteChatBridge is now imported from service-holders at the top
		const remoteChatBridge = new RemoteChatBridge(imbotService);
		setRemoteChatBridge(remoteChatBridge);
		// Wire the storage-side delete → remote-unbind sink so any delete
		// path (renderer chatStore, project remove, migration, purge)
		// unbinds the remote binding, not just the renderer chatStore one.
		getSessionStorage().setRemoteBindingSink((sessionId) => {
			remoteChatBridge.unbind(sessionId);
		});
		logger.info("Remote Chat Bridge initialized");

		// 创建远程控制事件服务
		const eventService = new RemoteControlEventService(
			imbotService,
			remoteDeviceService,
			storeManager,
			wsPort,
		);
		setRemoteControlEventService(eventService);
		logger.info("IM Bot and Remote Control Event services initialized");
	} catch (error) {
		logger.error(
			"Failed to initialize IM Bot / Remote Device services",
			error instanceof Error ? error : new Error(String(error)),
		);
	}

	// 创建窗口
	createWindow();
	createFloatingWindow();
	createTray();
	createMenu();

	// Initialize auto-update service
	if (mainWindow) {
		updateService.initialize(mainWindow);
		// Auto-check for updates in production
		if (app.isPackaged) {
			updateService.checkForUpdates();
		}
	}

	// 根据设置决定是否显示悬浮窗
	const floatWidgetEnabled = storeManager.getConfig("floatWidgetEnabled");
	if (floatWidgetEnabled && floatingWindow) {
		floatingWindow.show();
	}

	// macOS: 点击 dock 图标时重新创建窗口
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		} else if (mainWindow) {
			mainWindow.show();
		}
	});

	// 处理协议 URL (macOS)
	app.on("open-url", (_event, url) => {
		handleOpenUrl(url, mainWindow);
	});

	// 处理第二个实例启动 (Windows/Linux)
	app.on("second-instance", (_event, argv) => {
		handleSecondInstance(argv, mainWindow);
	});

	// 处理启动参数中的协议 URL
	if (process.env.PENDING_PROTOCOL_URL) {
		const data = parseProtocolUrl(process.env.PENDING_PROTOCOL_URL);
		if (data) {
			handleProtocolData(data, mainWindow);
		}
		delete process.env.PENDING_PROTOCOL_URL;
	}
});

/**
 * 所有窗口关闭
 */
app.on("window-all-closed", () => {
	logger.info("All windows closed");
	if (process.platform !== "darwin") {
		app.quit();
	}
});

/**
 * 应用退出前清理
 */
app.on("before-quit", () => {
	isQuitting = true;
	logger.info("App is quitting");

	// 停止配置定期检查
	appConfigService.stopPeriodicCheck();

	internalMcpService.cleanup().catch((error) => {
		logger.error("Failed to cleanup internal MCP servers", error);
	});

	// 关闭 AgentRuntime 适配层（trace sniffer / registry / collector）
	disposeAgentRuntime().catch((error) => {
		logger.error("Failed to dispose AgentRuntime", error);
	});

	// 关闭所有 pty 终端会话
	try {
		ptyService.disposeAll();
	} catch (error) {
		logger.error(
			"Failed to dispose pty sessions",
			error instanceof Error ? error : undefined,
		);
	}

	logDatabaseService.close();
});

/**
 * Best-effort: when an unhandled error reaches the main process we may be on
 * the way to crashing. Try to seal any in-flight tool calls synchronously so
 * the next launch doesn't re-show "执行中..." for tools that were torn down
 * with the process. All I/O is wrapped — we never let the seal itself throw.
 *
 * Note: the startup sweep on the next launch is the real safety net. This
 * hook just narrows the recovery window for the common case where the
 * process actually keeps running after `uncaughtException` (Electron does
 * not exit by default).
 */
function bestEffortSealInflight(reason: string): void {
	try {
		// SessionStorage may not be initialised yet if the crash happens very
		// early (before whenReady resolves). Guard with try/catch.
		const swept = getSessionStorage().sealAllInflightToolCalls(reason);
		if (swept.toolCalls > 0) {
			logger.warn(
				`Best-effort seal on crash hook: ${swept.toolCalls} tool call(s) sealed across ${swept.sessions} session(s)`,
			);
		}
	} catch {
		// Ignore — startup sweep on next launch will catch anything missed.
	}
}

/**
 * 处理未捕获的异常
 */
process.on("uncaughtException", (error) => {
	logger.error("Uncaught exception", error);
	bestEffortSealInflight("中断：主进程未捕获异常");
});

process.on("unhandledRejection", (reason) => {
	logger.error(
		"Unhandled rejection",
		reason instanceof Error ? reason : new Error(String(reason)),
	);
	bestEffortSealInflight("中断：主进程 Promise 拒绝未处理");
});
