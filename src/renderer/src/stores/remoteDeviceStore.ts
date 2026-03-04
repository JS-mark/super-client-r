/**
 * Remote Device Store
 * 管理远程设备状态
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RemoteDevice, CommandResult } from "@/types/electron";

interface RemoteDeviceState {
	// 状态
	devices: RemoteDevice[];
	isLoading: boolean;
	error: string | null;
	commandHistory: Array<{
		deviceId: string;
		command: string;
		result: CommandResult;
		timestamp: number;
	}>;

	// 操作
	fetchDevices: () => Promise<void>;
	registerDevice: (req: {
		name: string;
		platform: "linux" | "windows" | "macos";
		tags?: string[];
		description?: string;
	}) => Promise<RemoteDevice>;
	removeDevice: (deviceId: string) => Promise<void>;
	getDevice: (deviceId: string) => Promise<RemoteDevice | null>;
	executeCommand: (
		deviceId: string,
		command: string,
		timeout?: number,
	) => Promise<CommandResult>;

	// 辅助方法
	getDeviceById: (deviceId: string) => RemoteDevice | undefined;
	getOnlineDevices: () => RemoteDevice[];
	getOfflineDevices: () => RemoteDevice[];
	getDevicesByPlatform: (platform: string) => RemoteDevice[];
	clearCommandHistory: () => void;
}

export const useRemoteDeviceStore = create<RemoteDeviceState>()(
	persist(
		(set, get) => ({
			// 初始状态
			devices: [],
			isLoading: false,
			error: null,
			commandHistory: [],

			// 获取设备列表
			fetchDevices: async () => {
				set({ isLoading: true, error: null });
				try {
					const response = await window.electron.remoteDevice.listDevices();
					if (response.success && response.data) {
						set({ devices: response.data });
					} else {
						set({ error: response.error || "获取设备列表失败" });
					}
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
				} finally {
					set({ isLoading: false });
				}
			},

			// 注册设备
			registerDevice: async (req) => {
				set({ isLoading: true, error: null });
				try {
					const response =
						await window.electron.remoteDevice.registerDevice(req);
					if (response.success && response.data) {
						set((state) => ({
							devices: [...state.devices, response.data!],
						}));
						return response.data;
					}
					throw new Error(response.error || "注册设备失败");
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 移除设备
			removeDevice: async (deviceId: string) => {
				set({ isLoading: true, error: null });
				try {
					const response =
						await window.electron.remoteDevice.removeDevice(deviceId);
					if (response.success) {
						set((state) => ({
							devices: state.devices.filter((device) => device.id !== deviceId),
						}));
					} else {
						throw new Error(response.error || "移除设备失败");
					}
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 获取单个设备
			getDevice: async (deviceId: string) => {
				set({ isLoading: true, error: null });
				try {
					const response =
						await window.electron.remoteDevice.getDevice(deviceId);
					if (response.success) {
						return response.data || null;
					}
					throw new Error(response.error || "获取设备失败");
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 执行命令
			executeCommand: async (
				deviceId: string,
				command: string,
				timeout?: number,
			) => {
				set({ isLoading: true, error: null });
				try {
					const response = await window.electron.remoteDevice.executeCommand(
						deviceId,
						command,
						timeout,
					);
					if (response.success && response.data) {
						// 添加到历史记录
						set((state) => ({
							commandHistory: [
								{
									deviceId,
									command,
									result: response.data!,
									timestamp: Date.now(),
								},
								...state.commandHistory.slice(0, 99), // 保留最近 100 条
							],
						}));
						return response.data;
					}
					throw new Error(response.error || "执行命令失败");
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 根据 ID 获取设备
			getDeviceById: (deviceId: string) => {
				return get().devices.find((device) => device.id === deviceId);
			},

			// 获取在线设备
			getOnlineDevices: () => {
				return get().devices.filter((device) => device.status === "online");
			},

			// 获取离线设备
			getOfflineDevices: () => {
				return get().devices.filter((device) => device.status === "offline");
			},

			// 根据平台获取设备
			getDevicesByPlatform: (platform: string) => {
				return get().devices.filter((device) => device.platform === platform);
			},

			// 清空命令历史
			clearCommandHistory: () => {
				set({ commandHistory: [] });
			},
		}),
		{
			name: "remote-device-storage",
			partialize: (state) => ({
				commandHistory: state.commandHistory.slice(0, 20), // 只持久化最近 20 条
			}),
		},
	),
);
