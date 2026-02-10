import { app, BrowserWindow, ipcMain, shell } from "electron";
import {
	existsSync,
	readdirSync,
	statSync,
	unlinkSync,
} from "fs";
import { join } from "path";
import { storeManager } from "../../store";
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
		async (_, filePath?: string, tail?: number) => {
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

			// 始终使用流式读取，避免阻塞
			const lineCount = tail && tail > 0 ? tail : 500;
			return await readLastLines(targetFile, lineCount);
		},
	);

	/**
	 * 从文件末尾高效读取最后 N 行
	 * 使用分块从后向前读取，避免读取整个文件
	 */
	async function readLastLines(filePath: string, lineCount: number): Promise<string> {
		const fs = await import('fs');
		const CHUNK_SIZE = 16384; // 16KB chunks

		return new Promise((resolve, reject) => {
			try {
				const fd = fs.openSync(filePath, 'r');
				const stats = fs.fstatSync(fd);
				const fileSize = stats.size;

				if (fileSize === 0) {
					fs.closeSync(fd);
					resolve('');
					return;
				}

				// 如果文件很小，直接读取
				if (fileSize <= CHUNK_SIZE) {
					const buffer = Buffer.alloc(fileSize);
					fs.readSync(fd, buffer, 0, fileSize, 0);
					fs.closeSync(fd);
					const lines = buffer.toString('utf-8').split('\n');
					resolve(lines.slice(-lineCount).join('\n'));
					return;
				}

				// 从文件末尾开始读取
				let position = fileSize;
				let chunks: Buffer[] = [];
				let totalBytes = 0;
				let foundLines = 0;

				// 循环读取块直到找到足够的行或到达文件开头
				while (position > 0 && foundLines <= lineCount) {
					const chunkSize = Math.min(CHUNK_SIZE, position);
					position -= chunkSize;

					const chunkBuffer = Buffer.alloc(chunkSize);
					fs.readSync(fd, chunkBuffer, 0, chunkSize, position);

					chunks.unshift(chunkBuffer);
					totalBytes += chunkSize;

					// 检查当前已读取的内容中有多少行
					const currentContent = Buffer.concat(chunks).toString('utf-8');
					foundLines = currentContent.split('\n').length - 1;

					// 限制最大读取 256KB，防止内存溢出
					if (totalBytes >= 262144) {
						break;
					}
				}

				fs.closeSync(fd);

				// 处理读取的内容
				const content = Buffer.concat(chunks).toString('utf-8');
				const lines = content.split('\n');

				// 第一行可能是不完整的（除非读到文件开头），丢弃它
				const startIndex = position > 0 ? 1 : 0;
				const result = lines.slice(startIndex).slice(-lineCount).join('\n');

				resolve(result);
			} catch (err) {
				reject(err);
			}
		});
	}

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

	// 打开外部链接
	ipcMain.handle(APP_CHANNELS.OPEN_EXTERNAL, async (_, url: string) => {
		if (!url) {
			throw new Error("URL is required");
		}
		await shell.openExternal(url);
		return true;
	});

	// 获取配置项
	ipcMain.handle("app:get-config", (_, key: string) => {
		return storeManager.getConfig(key as any);
	});

	// 设置配置项
	ipcMain.handle("app:set-config", (_, key: string, value: unknown) => {
		storeManager.setConfig(key as any, value);
		return true;
	});
}
