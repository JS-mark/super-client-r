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
import { join } from "path";
import { registerIpcHandlers } from "./ipc";
import { setFloatingWindow } from "./ipc/handlers/floatWidgetHandlers";
import { setupWindowEventListeners } from "./ipc/handlers/windowHandlers";
import { localServer } from "./server";
import { pathService } from "./services/pathService";
import {
	handleOpenUrl,
	handleProtocolData,
	handleSecondInstance,
	parseProtocolUrl,
	registerProtocol,
} from "./services/protocolService";
import { getSkillService } from "./services/skill/SkillService";
import { storeManager } from "./store/StoreManager";
import { logger } from "./utils/logger";

// 仅在开发环境禁用沙箱以避免 "Operation not permitted" 错误
// 生产环境启用沙箱以提高安全性
if (!app.isPackaged) {
	app.commandLine.appendSwitch("no-sandbox");
}
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
// Disable Autofill features to prevent DevTools errors
app.commandLine.appendSwitch(
	"disable-features",
	"AutofillServer,PasswordManager,Autofill,AutofillAssistant,AutofillPasswordManager,AutofillAddress,AutofillCreditCard,AutofillProfile,AutofillDownloadManager,AutofillFeedback",
);

// 开发环境将 userData 设置到用户 home 目录下，避免权限问题
// dev 环境使用 .scr-data-dev，打包环境使用 .scr-data，实现数据隔离
import { homedir } from "os";

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
		width: 1000,
		height: 700,
		minWidth: 600,
		minHeight: 400,
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
		width: 300,
		height: 60,
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

	const x = workWidth - 350;
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
				label: "编辑",
				submenu: [
					{ role: "undo" },
					{ role: "redo" },
					{ type: "separator" },
					{ role: "cut" },
					{ role: "copy" },
					{ role: "paste" },
					{ role: "pasteAndMatchStyle" },
					{ role: "delete" },
					{ role: "selectAll" },
				],
			},
			{
				label: "视图",
				submenu: [
					{ role: "reload" },
					{ role: "forceReload" },
					{ role: "toggleDevTools" },
					{ type: "separator" },
					{ role: "resetZoom" },
					{ role: "zoomIn" },
					{ role: "zoomOut" },
					{ type: "separator" },
					{ role: "togglefullscreen" },
				],
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
					{ type: "separator" },
					{
						label: "显示悬浮窗",
						click: () => {
							mainWindow?.webContents.send("toggle-float-widget", true);
						},
					},
					{
						label: "隐藏悬浮窗",
						click: () => {
							mainWindow?.webContents.send("toggle-float-widget", false);
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
							mainWindow?.webContents.send("navigate-to", "/settings?tab=shortcuts");
						},
					},
					{ type: "separator" },
					{
						label: "发送反馈",
						click: () => {
							shell.openExternal("https://github.com/js-mark/super-client-r/issues");
						},
					},
					{ type: "separator" },
					{
						label: "关于",
						click: () => {
							mainWindow?.show();
							mainWindow?.webContents.send("navigate-to", "/settings?tab=about");
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
			floatingWindow.setSize(width, height);
		}
	});

	ipcMain.on("open-main-window", () => {
		if (mainWindow) {
			mainWindow.show();
			mainWindow.focus();
		} else {
			createWindow();
		}
	});
}

/**
 * 应用就绪
 */
app.whenReady().then(async () => {
	logger.info("App is ready");

	// 启动本地服务
	await localServer.start();

	// 注册 IPC 处理器
	registerIpcHandlers();
	registerWindowHandlers();
	logger.info("IPC handlers registered");

	// 初始化技能服务
	// 使用 pathService 提供的路径，实现 dev/release 隔离
	const skillsDir = join(pathService.getPaths().base, "skills");
	getSkillService(skillsDir)
		.initialize()
		.catch((error) => {
			logger.error("Failed to initialize skill service", error);
		});

	// 创建窗口
	createWindow();
	createFloatingWindow();
	createTray();
	createMenu();

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
});

/**
 * 处理未捕获的异常
 */
process.on("uncaughtException", (error) => {
	logger.error("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
	logger.error(
		"Unhandled rejection",
		reason instanceof Error ? reason : new Error(String(reason)),
	);
});
