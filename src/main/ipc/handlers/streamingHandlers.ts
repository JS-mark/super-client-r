/**
 * Streaming IPC Handlers
 *
 * 需要 event.sender.send() 转发流式事件的 handlers。
 * 这些 handler 不能使用 Typed IPC Proxy（registerAPI），因为需要访问 event 对象。
 *
 * 当前仅保留 legacy `agent-sdk:create-query` 兼容入口,内部转调
 * `llm-loop` runtime。Phase D 之后用户应直接使用 `agent-runtime:*` 通道。
 */

import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	adaptRuntimeEventToSdk,
	adaptSdkRequestToRuntime,
} from "../../services/agent/runtime/agentSdkLegacyAdapter";
import { getAgentRuntimeRegistry } from "../../services/agent/runtime/AgentRuntimeRegistry";
import { logger } from "../../utils/logger";
import type { AgentSDKQueryRequest } from "../types";

const log = logger.withContext("AgentSDKIPC");

export function registerStreamingHandlers(): void {
	// ─── Legacy agent-sdk:create-query (compat layer) ──────────────────
	// Renderer still uses window.electron.agentSDK.* via this legacy IPC
	// namespace. We translate the request → AgentQueryRequest, run it on
	// the llm-loop runtime, and translate emitted events back to the
	// AgentSDKStreamEvent shape the renderer's useChat.ts expects.
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
				const runtime = registry.tryGet("llm-loop");
				if (!runtime) {
					return {
						success: false,
						error: "llm-loop runtime not registered",
					};
				}

				const controller = new AbortController();
				const runtimeReq = adaptSdkRequestToRuntime(
					requestId,
					request,
					controller.signal,
				);

				// Pump in the background; ack returns immediately and events
				// flow via agent-sdk:stream-event.
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
}
