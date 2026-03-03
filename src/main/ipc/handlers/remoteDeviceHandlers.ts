import { ipcMain } from "electron";
import { REMOTE_DEVICE_CHANNELS } from "../channels";
import type {
	IPCRequest,
	IPCResponse,
	RegisterDeviceRequest,
	ExecuteCommandRequest,
	RemoteDevice,
} from "../types";
import type { CommandResult } from "../../services/remote/types";
import { storeManager } from "../../store/StoreManager";

// 延迟导入服务实例(避免循环依赖)
let remoteDeviceServiceInstance: any = null;

export function setRemoteDeviceService(service: any) {
	remoteDeviceServiceInstance = service;
}

export function getRemoteDeviceService() {
	if (!remoteDeviceServiceInstance) {
		throw new Error(
			"RemoteDeviceService not initialized. Call setRemoteDeviceService first.",
		);
	}
	return remoteDeviceServiceInstance;
}

/**
 * 注册 Remote Device 相关的 IPC 处理器
 */
export function registerRemoteDeviceHandlers(): void {
	// 列出所有设备
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.LIST_DEVICES,
		async (): Promise<IPCResponse<RemoteDevice[]>> => {
			try {
				const remoteDeviceService = getRemoteDeviceService();
				const devices = remoteDeviceService.listDevices();
				return { success: true, data: devices };
			} catch (error) {
				console.error("[IPC] LIST_DEVICES error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 注册设备
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.REGISTER_DEVICE,
		async (
			_event,
			request: IPCRequest<RegisterDeviceRequest>,
		): Promise<IPCResponse<RemoteDevice>> => {
			try {
				const { name, platform, tags, description } = request.payload!;
				const remoteDeviceService = getRemoteDeviceService();
				const { nanoid } = await import("nanoid");

				const device = remoteDeviceService.registerDevice({
					id: nanoid(),
					name,
					platform,
					tags,
					description,
				});

				// 持久化到 store
				storeManager.saveRemoteDevice(device);

				return { success: true, data: device };
			} catch (error) {
				console.error("[IPC] REGISTER_DEVICE error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 删除设备
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.REMOVE_DEVICE,
		async (
			_event,
			request: IPCRequest<{ deviceId: string }>,
		): Promise<IPCResponse<boolean>> => {
			try {
				const { deviceId } = request.payload!;
				const remoteDeviceService = getRemoteDeviceService();
				const success = remoteDeviceService.removeDevice(deviceId);

				// 从 store 删除
				if (success) {
					storeManager.deleteRemoteDevice(deviceId);
				}

				return { success: true, data: success };
			} catch (error) {
				console.error("[IPC] REMOVE_DEVICE error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 获取单个设备
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.GET_DEVICE,
		async (
			_event,
			request: IPCRequest<{ deviceId: string }>,
		): Promise<IPCResponse<RemoteDevice | null>> => {
			try {
				const { deviceId } = request.payload!;
				const remoteDeviceService = getRemoteDeviceService();
				const device = remoteDeviceService.getDevice(deviceId) || null;
				return { success: true, data: device };
			} catch (error) {
				console.error("[IPC] GET_DEVICE error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 执行命令
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.EXECUTE_COMMAND,
		async (
			_event,
			request: IPCRequest<ExecuteCommandRequest>,
		): Promise<IPCResponse<CommandResult>> => {
			try {
				const { deviceId, command, timeout } = request.payload!;
				const remoteDeviceService = getRemoteDeviceService();
				const result = await remoteDeviceService.executeCommand(
					deviceId,
					command,
					timeout,
				);
				return { success: true, data: result };
			} catch (error) {
				console.error("[IPC] EXECUTE_COMMAND error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 终止命令
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.KILL_COMMAND,
		async (
			_event,
			request: IPCRequest<{ deviceId: string; requestId: string }>,
		): Promise<IPCResponse> => {
			try {
				const { deviceId, requestId } = request.payload!;
				const remoteDeviceService = getRemoteDeviceService();
				remoteDeviceService.killCommand(deviceId, requestId);
				return { success: true };
			} catch (error) {
				console.error("[IPC] KILL_COMMAND error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Tab 补全
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.TAB_COMPLETE,
		async (
			_event,
			request: IPCRequest<{ deviceId: string; line: string; cursorPos: number }>,
		): Promise<IPCResponse<{ matches: string[]; wordStart: number }>> => {
			try {
				const { deviceId, line, cursorPos } = request.payload!;
				const remoteDeviceService = getRemoteDeviceService();
				const result = await remoteDeviceService.tabComplete(
					deviceId,
					line,
					cursorPos,
				);
				return { success: true, data: result };
			} catch (error) {
				console.error("[IPC] TAB_COMPLETE error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 获取设备当前工作目录
	ipcMain.handle(
		REMOTE_DEVICE_CHANNELS.GET_CWD,
		async (
			_event,
			request: IPCRequest<{ deviceId: string }>,
		): Promise<IPCResponse<string>> => {
			try {
				const { deviceId } = request.payload!;
				const remoteDeviceService = getRemoteDeviceService();
				const cwd = await remoteDeviceService.getCwd(deviceId);
				return { success: true, data: cwd };
			} catch (error) {
				console.error("[IPC] GET_CWD error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	console.log("[IPC] Remote Device handlers registered");
}
