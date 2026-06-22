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
import { logger } from "../../utils/logger";
import type { AgentStreamEvent, AgentSDKQueryRequest } from "../types";

const log = logger.withContext("AgentSDKIPC");

export function registerStreamingHandlers(): void {
	// ─── Agent: sendMessage ──────────────────
	// 流式转发 agent events 到发起请求的 renderer
	ipcMain.handle(
		"agent:send-message",
		async (_event: IpcMainInvokeEvent, sessionId: string, content: string) => {
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
				log.info("agent-sdk:create-query received", {
					requestId,
					sessionId: request.sessionId,
					resumeSessionId: request.resumeSessionId,
					cwd: request.cwd,
					model: request.model,
					providerId: request.providerId,
					mcpServerCount: request.mcpServerNames?.length ?? 0,
					promptLength: request.prompt.length,
				});
				const onStreamEvent = (event: { requestId: string }) => {
					if (event.requestId === requestId) {
						const typed = event as { type?: string; error?: string };
						if (typed.type && typed.type !== "chunk") {
							log.info("agent-sdk:stream-event forwarded", {
								requestId,
								type: typed.type,
								error: typed.error,
							});
						}
						_event.sender.send("agent-sdk:stream-event", event);
					}
				};

				agentSDKService.on("stream-event", onStreamEvent);

				// 异步执行查询（不等待完成）
				agentSDKService.createQuery(requestId, request).finally(() => {
					log.info("agent-sdk:create-query finished", { requestId });
					agentSDKService.removeListener("stream-event", onStreamEvent);
				});

				return { success: true, data: { requestId } };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to create query";
				log.error(
					"agent-sdk:create-query handler failed",
					error instanceof Error ? error : undefined,
					{ requestId, error: message },
				);
				return { success: false, error: message };
			}
		},
	);
}
