/**
 * Typed IPC Proxy — 事件工具
 *
 * 提供跨进程事件通信的工具函数：
 *   - broadcastEvent: 广播到所有窗口
 *   - unicastEvent: 发送到指定窗口
 *   - forwardEvents: 将 EventEmitter 事件转发到渲染进程
 */

import { BrowserWindow, type WebContents } from "electron";
import type { EventEmitter } from "events";

/**
 * 广播事件到所有窗口
 *
 * 用于：主题变更、配置更新、插件 UI 变更等全局事件
 *
 * @param channel - IPC channel 名称
 * @param data - 发送的数据
 */
export function broadcastEvent(channel: string, data?: unknown): void {
	BrowserWindow.getAllWindows().forEach((win) => {
		if (!win.isDestroyed()) {
			win.webContents.send(channel, data);
		}
	});
}

/**
 * 单播事件到指定窗口
 *
 * 用于：Agent SDK stream、远程命令输出等针对特定请求的事件
 *
 * @param sender - 目标 WebContents
 * @param channel - IPC channel 名称
 * @param data - 发送的数据
 */
export function unicastEvent(
	sender: WebContents,
	channel: string,
	data?: unknown,
): void {
	if (!sender.isDestroyed()) {
		sender.send(channel, data);
	}
}

/**
 * 将 EventEmitter 事件转发到渲染进程
 *
 * 用法：
 *   // 单播：只发给请求发起的窗口
 *   const cleanup = forwardEvents(
 *     agentSDKService, 'stream-event',
 *     event.sender, 'agent-sdk:stream-event',
 *     (data) => data.requestId === requestId,
 *   )
 *
 *   // 广播：发给所有窗口
 *   const cleanup = forwardEvents(
 *     llmService, 'stream-event',
 *     'broadcast', 'llm:stream-event',
 *   )
 *
 *   // 操作完成后清理
 *   cleanup()
 *
 * @param emitter - 事件源（EventEmitter）
 * @param sourceEvent - 源事件名称
 * @param target - 目标：WebContents（单播）或 'broadcast'（广播）
 * @param targetChannel - 目标 IPC channel
 * @param filter - 可选过滤函数，返回 false 则跳过
 * @returns 清理函数，移除事件监听
 */
export function forwardEvents(
	emitter: EventEmitter,
	sourceEvent: string,
	target: WebContents | "broadcast",
	targetChannel: string,
	filter?: (data: unknown) => boolean,
): () => void {
	const listener = (data: unknown) => {
		if (filter && !filter(data)) return;

		if (target === "broadcast") {
			broadcastEvent(targetChannel, data);
		} else {
			unicastEvent(target, targetChannel, data);
		}
	};

	emitter.on(sourceEvent, listener);
	return () => emitter.off(sourceEvent, listener);
}
