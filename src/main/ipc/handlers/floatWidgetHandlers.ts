/**
 * 悬浮窗 IPC 处理器
 * 处理悬浮窗的显示/隐藏等操作
 */

import { ipcMain } from "electron";
import { FLOAT_WIDGET_CHANNELS } from "../channels";

// 悬浮窗状态
let floatWidgetVisible = false;

export function registerFloatWidgetHandlers(): void {
	// 显示悬浮窗
	ipcMain.on(FLOAT_WIDGET_CHANNELS.SHOW, () => {
		floatWidgetVisible = true;
		console.log("[FloatWidget] Show float widget");
		// TODO: 实现悬浮窗显示逻辑
	});

	// 隐藏悬浮窗
	ipcMain.on(FLOAT_WIDGET_CHANNELS.HIDE, () => {
		floatWidgetVisible = false;
		console.log("[FloatWidget] Hide float widget");
		// TODO: 实现悬浮窗隐藏逻辑
	});

	// 获取悬浮窗状态
	ipcMain.handle(FLOAT_WIDGET_CHANNELS.GET_STATUS, () => {
		return {
			success: true,
			data: { visible: floatWidgetVisible },
		};
	});
}
