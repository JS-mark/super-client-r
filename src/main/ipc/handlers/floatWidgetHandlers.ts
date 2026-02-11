/**
 * 悬浮窗 IPC 处理器
 * 处理悬浮窗的显示/隐藏等操作
 */

import { type BrowserWindow, ipcMain } from "electron";
import { storeManager } from "../../store/StoreManager";
import { FLOAT_WIDGET_CHANNELS } from "../channels";

// 悬浮窗状态
let floatWidgetVisible = false;
let floatingWindow: BrowserWindow | null = null;

export function registerFloatWidgetHandlers(): void {
	// 显示悬浮窗
	ipcMain.on(FLOAT_WIDGET_CHANNELS.SHOW, () => {
		floatWidgetVisible = true;
		storeManager.setConfig("floatWidgetEnabled", true);
		console.log("[FloatWidget] Show float widget");
		if (floatingWindow) {
			floatingWindow.show();
		}
	});

	// 隐藏悬浮窗
	ipcMain.on(FLOAT_WIDGET_CHANNELS.HIDE, () => {
		floatWidgetVisible = false;
		storeManager.setConfig("floatWidgetEnabled", false);
		console.log("[FloatWidget] Hide float widget");
		if (floatingWindow) {
			floatingWindow.hide();
		}
	});

	// 获取悬浮窗状态
	ipcMain.handle(FLOAT_WIDGET_CHANNELS.GET_STATUS, () => {
		return {
			success: true,
			data: { visible: floatWidgetVisible },
		};
	});
}

/**
 * 设置悬浮窗窗口实例
 * 由 main.ts 在创建窗口后调用
 */
export function setFloatingWindow(window: BrowserWindow | null): void {
	floatingWindow = window;
}

/**
 * 获取悬浮窗窗口实例
 */
export function getFloatingWindow(): BrowserWindow | null {
	return floatingWindow;
}
