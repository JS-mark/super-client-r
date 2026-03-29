/**
 * Typed IPC Proxy — Preload Bridge
 *
 * 自动生成 ipcRenderer.invoke / ipcRenderer.on 的桥接对象。
 * 与 main 端的 register.ts 使用相同的 camelCase → kebab-case 命名规则，
 * 确保 channel 名称自动匹配。
 *
 * 用法：
 *   const webhook = createBridge<ElectronAPI['webhook']>('webhook', ['getConfigs', 'saveConfig', ...])
 *   // webhook.getConfigs()     → ipcRenderer.invoke('webhook:get-configs')
 *   // webhook.saveConfig(cfg)  → ipcRenderer.invoke('webhook:save-config', cfg)
 *
 *   // 事件监听（on* 方法）
 *   const theme = createBridge<ElectronAPI['theme']>('theme', ['get', 'set', 'onChange'])
 *   // theme.onChange(cb)       → ipcRenderer.on('theme:change', cb), 返回取消函数
 *
 * ⚠️ 注意：
 *   - contextBridge.exposeInMainWorld 不支持 Proxy，
 *     因此必须生成普通对象（带实际 function 属性）。
 *   - args 原样透传，不做包装。
 */

import { ipcRenderer } from "electron";

/**
 * camelCase → kebab-case（与 register.ts 中的 toKebab 保持一致）
 */
function toKebab(str: string): string {
	return str
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}

/**
 * 生成 RPC channel 名称
 */
function toChannel(ns: string, method: string): string {
	return `${toKebab(ns)}:${toKebab(method)}`;
}

/**
 * 生成 event channel 名称（去掉 on 前缀）
 */
function toEventChannel(ns: string, method: string): string {
	const eventName = method.replace(/^on/, "");
	return `${toKebab(ns)}:${toKebab(eventName)}`;
}

/**
 * 为指定 namespace 创建 IPC 桥接的普通对象
 *
 * - 普通方法：返回 (...args) => ipcRenderer.invoke(channel, ...args)
 * - on* 方法：返回 (callback) => { subscribe; return unsubscribe }
 *
 * @param ns - namespace 名称（camelCase，如 'webhook', 'appConfig'）
 * @param keys - 方法名列表
 * @returns 普通对象，每个 key 对应一个 IPC 调用函数
 */
export function createBridge<T extends Record<string, unknown>>(
	ns: string,
	keys: (keyof T & string)[],
): T {
	const obj: Record<string, unknown> = {};

	for (const method of keys) {
		// on* 方法 → 事件监听器
		if (/^on[A-Z]/.test(method)) {
			const channel = toEventChannel(ns, method);
			obj[method] = (callback: (...args: unknown[]) => void) => {
				const listener = (_event: unknown, ...data: unknown[]) =>
					callback(...data);
				ipcRenderer.on(channel, listener);
				return () => {
					ipcRenderer.off(channel, listener);
				};
			};
		} else {
			// 普通方法 → ipcRenderer.invoke
			const channel = toChannel(ns, method);
			obj[method] = (...args: unknown[]) =>
				ipcRenderer.invoke(channel, ...args);
		}
	}

	return obj as T;
}
