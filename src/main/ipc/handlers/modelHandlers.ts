/**
 * LLM Streaming Handlers
 * Model CRUD 已迁移至 api-impl.ts（Typed IPC Proxy）
 * 此文件仅保留需要复杂逻辑/streaming 的 LLM handlers
 */

import { ipcMain } from "electron";
import { llmService } from "../../services/llm";
import { buildToolExecutorFromRequest } from "../../services/llm/toolExecutorFactory";
import { localServer } from "../../server";
import { getOrCreateApiKey } from "../../server/config";
import { LLM_CHANNELS } from "../channels";
import type { ChatCompletionRequest, IPCResponse } from "../types";

export function registerModelHandlers(): void {
	// Model CRUD (9 channels) → migrated to api-impl.ts
	// Only LLM streaming handlers remain here

	// ============ LLM Chat ============

	ipcMain.handle(
		LLM_CHANNELS.CHAT_COMPLETION,
		async (_event, request: ChatCompletionRequest): Promise<IPCResponse> => {
			try {
				// Build a tool executor that maps prefixed tool names back to MCP
				// servers / skills. Shared with the HTTP route (see
				// `src/main/server/routes/llm.ts`) so both entry points have
				// identical dispatch semantics. Pass scpPort/scpApiKey so the
				// agent-builtins Task tool can HTTP-recurse for subagents.
				const toolExecutor = buildToolExecutorFromRequest(request, {
					scpPort: localServer.getPort(),
					scpApiKey: getOrCreateApiKey(),
				});

				// Fire and forget — stream events are sent via BrowserWindow.send
				llmService.chatCompletion(request, toolExecutor);
				return { success: true, data: { requestId: request.requestId } };
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to start chat completion";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		LLM_CHANNELS.TOOL_APPROVAL_RESPONSE,
		async (
			_event,
			toolCallId: string,
			approved: boolean,
		): Promise<IPCResponse> => {
			try {
				llmService.resolveToolApproval(toolCallId, approved);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to resolve tool approval";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		LLM_CHANNELS.STOP_STREAM,
		async (_event, requestId: string): Promise<IPCResponse> => {
			try {
				const stopped = llmService.stopStream(requestId);
				return { success: true, data: { stopped } };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to stop stream";
				return { success: false, error: message };
			}
		},
	);
}
