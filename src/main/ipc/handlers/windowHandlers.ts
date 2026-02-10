/**
 * 窗口控制 IPC 处理器
 * 处理窗口最小化、最大化、关闭等操作
 */

import { BrowserWindow, ipcMain } from "electron";
import { WINDOW_CHANNELS } from "../channels";

export function registerWindowControlHandlers(): void {
	// 最小化窗口
	ipcMain.handle(WINDOW_CHANNELS.MINIMIZE, () => {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			win.minimize();
		}
		return { success: true };
	});

	// 最大化/还原窗口
	ipcMain.handle(WINDOW_CHANNELS.MAXIMIZE, () => {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			if (win.isMaximized()) {
				win.unmaximize();
			} else {
				win.maximize();
			}
		}
		return { success: true };
	});

	// 关闭窗口
	ipcMain.handle(WINDOW_CHANNELS.CLOSE, () => {
		const win = BrowserWindow.getFocusedWindow();
		if (win) {
			win.close();
		}
		return { success: true };
	});

	// 获取窗口最大化状态
	ipcMain.handle(WINDOW_CHANNELS.IS_MAXIMIZED, () => {
		const win = BrowserWindow.getFocusedWindow();
		return {
			success: true,
			data: win ? win.isMaximized() : false,
		};
	});
}

/**
 * 设置窗口事件监听，用于广播窗口状态变化
 */
export function setupWindowEventListeners(mainWindow: BrowserWindow): void {
	mainWindow.on("maximize", () => {
		mainWindow.webContents.send(WINDOW_CHANNELS.ON_MAXIMIZE_CHANGE, true);
	});

	mainWindow.on("unmaximize", () => {
		mainWindow.webContents.send(WINDOW_CHANNELS.ON_MAXIMIZE_CHANGE, false);
	});
}
