/**
 * Auth IPC 处理器
 * 处理 OAuth 登录/登出相关 IPC 通信
 */

import { ipcMain } from "electron";
import { AUTH_CHANNELS } from "../channels";
import { authService } from "../../services/auth/AuthService";
import type { AuthProvider } from "../types";
import { logger } from "../../utils/logger";

export function registerAuthHandlers(): void {
	ipcMain.handle(AUTH_CHANNELS.LOGIN, async (_, provider: AuthProvider) => {
		try {
			const user = await authService.login(provider);
			return { success: true, data: user };
		} catch (error) {
			logger.error("Auth login failed", error as Error);
			return { success: false, error: (error as Error).message };
		}
	});

	ipcMain.handle(AUTH_CHANNELS.LOGOUT, async () => {
		try {
			await authService.logout();
			return { success: true };
		} catch (error) {
			logger.error("Auth logout failed", error as Error);
			return { success: false, error: (error as Error).message };
		}
	});

	ipcMain.handle(AUTH_CHANNELS.GET_USER, async () => {
		try {
			const user = authService.getUser();
			return { success: true, data: user };
		} catch (error) {
			logger.error("Get auth user failed", error as Error);
			return { success: false, error: (error as Error).message };
		}
	});
}
