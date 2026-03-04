import { ipcMain } from "electron";
import { REMOTE_CONTROL_CHANNELS } from "../channels";
import type { RemoteControlEventService } from "../../services/remote/RemoteControlEventService";

let remoteControlEventService: RemoteControlEventService | null = null;

export function setRemoteControlEventService(
	service: RemoteControlEventService,
): void {
	remoteControlEventService = service;
}

export function registerRemoteControlHandlers(): void {
	// 获取所有事件
	ipcMain.handle(REMOTE_CONTROL_CHANNELS.GET_EVENTS, async () => {
		try {
			if (!remoteControlEventService) {
				return { success: false, error: "Service not initialized" };
			}
			const events = remoteControlEventService.getEvents();
			return { success: true, data: events };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	// 清空事件
	ipcMain.handle(REMOTE_CONTROL_CHANNELS.CLEAR_EVENTS, async () => {
		try {
			if (!remoteControlEventService) {
				return { success: false, error: "Service not initialized" };
			}
			remoteControlEventService.clearEvents();
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	// 获取设备连接信息
	ipcMain.handle(REMOTE_CONTROL_CHANNELS.GET_CONNECTION_INFO, async () => {
		try {
			if (!remoteControlEventService) {
				return { success: false, error: "Service not initialized" };
			}
			const info = remoteControlEventService.getConnectionInfo();
			return { success: true, data: info };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
}
