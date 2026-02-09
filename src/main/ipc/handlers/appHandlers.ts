import { app, BrowserWindow, ipcMain, shell } from "electron";
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
} from "fs";
import { join } from "path";
import { APP_CHANNELS } from "../channels";

export interface LogFileInfo {
	name: string;
	path: string;
	size: number;
	createdAt: string;
	modifiedAt: string;
}

export function registerAppHandlers() {
	ipcMain.handle(APP_CHANNELS.GET_INFO, () => {
		return {
			name: app.getName(),
			version: app.getVersion(),
			electron: process.versions.electron,
			node: process.versions.node,
			platform: process.platform,
			arch: process.arch,
		};
	});

	ipcMain.handle(APP_CHANNELS.GET_USER_DATA_PATH, () => {
		return app.getPath("userData");
	});

	ipcMain.handle(APP_CHANNELS.OPEN_PATH, async (_, path: string) => {
		if (!path) {
			throw new Error("Path is required");
		}
		const error = await shell.openPath(path);
		if (error) {
			throw new Error(error);
		}
		return true;
	});

	ipcMain.handle(APP_CHANNELS.CHECK_UPDATE, async () => {
		// 实际项目中应引入 electron-updater
		// import { autoUpdater } from 'electron-updater'
		// return await autoUpdater.checkForUpdatesAndNotify()

		// 模拟检查
		return {
			updateAvailable: false,
			message: "当前已是最新版本",
		};
	});

	ipcMain.handle(APP_CHANNELS.QUIT, () => {
		app.quit();
	});

	ipcMain.handle(APP_CHANNELS.RELAUNCH, () => {
		app.relaunch();
		app.exit(0);
	});

	ipcMain.handle(APP_CHANNELS.OPEN_DEV_TOOLS, (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		win?.webContents.openDevTools({ mode: "detach" });
	});

	ipcMain.handle(APP_CHANNELS.GET_LOGS_PATH, () => {
		return join(app.getPath("userData"), "logs");
	});

	ipcMain.handle(APP_CHANNELS.LIST_LOG_FILES, () => {
		const logsDir = join(app.getPath("userData"), "logs");
		if (!existsSync(logsDir)) {
			return [];
		}

		const files = readdirSync(logsDir)
			.filter((f) => f.endsWith(".log"))
			.map((name) => {
				const filePath = join(logsDir, name);
				const stats = statSync(filePath);
				return {
					name,
					path: filePath,
					size: stats.size,
					createdAt: stats.birthtime.toISOString(),
					modifiedAt: stats.mtime.toISOString(),
				} as LogFileInfo;
			})
			.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

		return files;
	});

	ipcMain.handle(
		APP_CHANNELS.GET_LOGS,
		(_, filePath?: string, tail?: number) => {
			const logsDir = join(app.getPath("userData"), "logs");
			let targetFile = filePath;

			if (!targetFile) {
				if (!existsSync(logsDir)) {
					return "";
				}
				const files = readdirSync(logsDir)
					.filter((f) => f.endsWith(".log"))
					.sort()
					.reverse();
				if (files.length === 0) {
					return "";
				}
				targetFile = join(logsDir, files[0]);
			}

			if (!existsSync(targetFile)) {
				return "";
			}

			const content = readFileSync(targetFile, "utf-8");
			if (tail && tail > 0) {
				const lines = content.split("\n");
				return lines.slice(-tail).join("\n");
			}
			return content;
		},
	);

	ipcMain.handle(APP_CHANNELS.CLEAR_LOGS, () => {
		const logsDir = join(app.getPath("userData"), "logs");
		if (!existsSync(logsDir)) {
			return true;
		}

		const files = readdirSync(logsDir).filter((f) => f.endsWith(".log"));
		for (const file of files) {
			try {
				unlinkSync(join(logsDir, file));
			} catch {
				// ignore
			}
		}
		return true;
	});
}
