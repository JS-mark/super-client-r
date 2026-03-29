/**
 * 窗口事件监听设置
 *
 * 从 windowHandlers.ts 提取的非 IPC handler 功能。
 * 设置 BrowserWindow 事件监听并广播状态变化到渲染进程。
 */

import type { BrowserWindow } from "electron";
import { broadcastEvent } from "./events";

/**
 * 设置窗口事件监听，用于广播窗口状态变化
 */
export function setupWindowEventListeners(mainWindow: BrowserWindow): void {
	mainWindow.on("maximize", () => {
		broadcastEvent("window:maximize-change", true);
	});

	mainWindow.on("unmaximize", () => {
		broadcastEvent("window:maximize-change", false);
	});
}
