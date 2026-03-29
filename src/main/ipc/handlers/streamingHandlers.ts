/**
 * Streaming IPC Handlers
 *
 * 需要 event.sender.send() 转发流式事件的 handlers。
 * 这些 handler 不能使用 Typed IPC Proxy（registerAPI），因为需要访问 event 对象。
 *
 * 包含：
 *   - Agent sendMessage（流式转发 agent stream events）
 *   - AgentSDK createQuery（流式转发 agent-sdk stream events）
 */

import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import { agentService } from "../../services/agent/AgentService";
import { agentSDKService } from "../../services/agent/AgentSDKService";
import type { AgentStreamEvent, AgentSDKQueryRequest } from "../types";

export function registerStreamingHandlers(): void {
	// ─── Agent: sendMessage ──────────────────
	// 流式转发 agent events 到发起请求的 renderer
	ipcMain.handle(
		"agent:send-message",
		async (
			_event: IpcMainInvokeEvent,
			sessionId: string,
			content: string,
		) => {
			try {
				const events: AgentStreamEvent[] = [];

				const eventListener = (event: AgentStreamEvent) => {
					if (event.sessionId === sessionId) {
						events.push(event);
						_event.sender.send("agent:stream-event", event);
					}
				};

				agentService.on("stream-event", eventListener);
				await agentService.sendMessage(sessionId, content);
				agentService.off("stream-event", eventListener);

				return { success: true, data: { sessionId, events } };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// ─── AgentSDK: createQuery ───────────────
	// 异步启动查询，流式转发 stream events 到发起请求的 renderer
	ipcMain.handle(
		"agent-sdk:create-query",
		async (
			_event: IpcMainInvokeEvent,
			requestId: string,
			request: AgentSDKQueryRequest,
		) => {
			try {
				const onStreamEvent = (event: { requestId: string }) => {
					if (event.requestId === requestId) {
						_event.sender.send("agent-sdk:stream-event", event);
					}
				};

				agentSDKService.on("stream-event", onStreamEvent);

				// 异步执行查询（不等待完成）
				agentSDKService
					.createQuery(requestId, request)
					.finally(() => {
						agentSDKService.removeListener(
							"stream-event",
							onStreamEvent,
						);
					});

				return { success: true, data: { requestId } };
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to create query";
				return { success: false, error: message };
			}
		},
	);
}
