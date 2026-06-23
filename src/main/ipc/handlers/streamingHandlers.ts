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
import {
	adaptRuntimeEventToSdk,
	adaptSdkRequestToRuntime,
} from "../../services/agent/runtime/agentSdkLegacyAdapter";
import { getAgentRuntimeRegistry } from "../../services/agent/runtime/AgentRuntimeRegistry";
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

	// ─── AgentSDK: createQuery (compat layer) ───────────────
	// Legacy agent-sdk:create-query is now backed by the new llm-loop
	// runtime (ClaudeCodeAgentRuntime). The renderer (`useChat.ts`) still
	// uses the legacy IPC namespace and event shape via agentSDKClient,
	// so this handler translates both directions until Phase D switches
	// the renderer to agent-runtime:* channels.
	const activeQueries = new Map<string, AbortController>();
	ipcMain.handle(
		"agent-sdk:create-query",
		async (
			_event: IpcMainInvokeEvent,
			requestId: string,
			request: AgentSDKQueryRequest,
		) => {
			try {
				log.info("agent-sdk:create-query received (→ llm-loop)", {
					requestId,
					sessionId: request.sessionId,
					cwd: request.cwd,
					model: request.model,
					providerId: request.providerId,
					mcpServerCount: request.mcpServerNames?.length ?? 0,
					promptLength: request.prompt.length,
				});

				const registry = getAgentRuntimeRegistry();
				if (!registry) {
					return {
						success: false,
						error: "AgentRuntimeRegistry not initialized",
					};
				}
				const runtime =
					registry.tryGet("llm-loop") ?? registry.tryGet("claude-sdk");
				if (!runtime) {
					return {
						success: false,
						error: "No agent runtime registered",
					};
				}

				const controller = new AbortController();
				activeQueries.set(requestId, controller);
				const runtimeReq = adaptSdkRequestToRuntime(
					requestId,
					request,
					controller.signal,
				);

				// Pump in the background; per legacy contract this handler
				// returns the synthetic ack immediately and events flow via
				// agent-sdk:stream-event.
				(async () => {
					try {
						for await (const ev of runtime.createQuery(runtimeReq)) {
							const legacy = adaptRuntimeEventToSdk(ev);
							if (legacy) {
								if (legacy.type && legacy.type !== "chunk") {
									log.info("agent-sdk:stream-event forwarded", {
										requestId,
										type: legacy.type,
									});
								}
								_event.sender.send("agent-sdk:stream-event", legacy);
							}
						}
					} catch (err) {
						const message =
							err instanceof Error ? err.message : String(err);
						_event.sender.send("agent-sdk:stream-event", {
							requestId,
							type: "error",
							error: message,
						});
					} finally {
						activeQueries.delete(requestId);
						log.info("agent-sdk:create-query finished", { requestId });
					}
				})();

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

	// Reference `agentSDKService` so its singleton stays imported (Phase D
	// will delete this and the import along with the whole legacy path).
	void agentSDKService;
}
