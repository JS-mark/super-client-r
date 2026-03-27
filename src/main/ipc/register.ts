/**
 * Typed IPC Proxy — 自动注册
 *
 * 从实现对象自动注册 IPC handlers：
 *   - 普通方法 → ipcMain.handle（请求/响应）
 *   - on* 方法 → 跳过（事件通过 events.ts 工具触发）
 *
 * 使用方式：
 *   registerAPI({
 *     webhook: {
 *       getConfigs: () => storeManager.getWebhookConfigs(),
 *       saveConfig: (config) => storeManager.saveWebhookConfig(config),
 *     }
 *   })
 */

import { ipcMain } from "electron";
import { logger } from "../utils/logger";

/**
 * camelCase → kebab-case
 * 'agentSDK' → 'agent-sdk'
 * 'createQuery' → 'create-query'
 */
function toKebab(str: string): string {
	return str
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}

/**
 * 生成 IPC channel 名称
 * ('agentSDK', 'createQuery') → 'agent-sdk:create-query'
 */
export function toChannel(ns: string, method: string): string {
	return `${toKebab(ns)}:${toKebab(method)}`;
}

/**
 * 生成事件 channel 名称（on* 方法去掉 on 前缀）
 * ('agentSDK', 'onStreamEvent') → 'agent-sdk:stream-event'
 * ('theme', 'onChange') → 'theme:change'
 */
export function toEventChannel(ns: string, method: string): string {
	// onStreamEvent → StreamEvent → stream-event
	const eventName = method.replace(/^on/, "");
	return `${toKebab(ns)}:${toKebab(eventName)}`;
}

/**
 * 判断方法是否为事件监听器
 */
function isListener(method: string): boolean {
	return /^on[A-Z]/.test(method);
}

/**
 * 从实现对象自动注册所有 IPC handlers
 *
 * - 只注册非 on* 方法（RPC 调用）
 * - on* 方法通过 broadcastEvent / forwardEvents 手动触发
 * - 自动包装 try-catch 和 { success, data, error } 响应格式
 */
export function registerAPI(
	impl: Record<string, Record<string, unknown>>,
): void {
	let count = 0;

	for (const [ns, methods] of Object.entries(impl)) {
		for (const [method, fn] of Object.entries(methods)) {
			if (isListener(method) || typeof fn !== "function") continue;

			const channel = toChannel(ns, method);

			ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
				try {
					const result = await (fn as (...a: unknown[]) => unknown)(
						...args,
					);
					return { success: true, data: result };
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					logger.error(`[IPC] ${channel} failed: ${message}`);
					return { success: false, error: message };
				}
			});

			count++;
		}
	}

	logger.info(`[IPC] Registered ${count} RPC handlers via registerAPI`);
}

/**
 * 反注册所有 IPC handlers（用于 HMR / 测试 / 清理）
 */
export function unregisterAPI(
	impl: Record<string, Record<string, unknown>>,
): void {
	for (const [ns, methods] of Object.entries(impl)) {
		for (const method of Object.keys(methods)) {
			if (isListener(method)) continue;
			ipcMain.removeHandler(toChannel(ns, method));
		}
	}
}
