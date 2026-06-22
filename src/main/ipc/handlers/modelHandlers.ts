/**
 * LLM Streaming Handlers
 * Model CRUD 已迁移至 api-impl.ts（Typed IPC Proxy）
 * 此文件仅保留需要复杂逻辑/streaming 的 LLM handlers
 */

import { ipcMain } from "electron";
import * as path from "path";
import { resolveConversationCwd } from "../../services/runtime/conversationCwd";
import { llmService } from "../../services/llm";
import { mcpService } from "../../services/mcp/McpService";
import { getSkillService } from "../../services/skill/SkillService";
import { logger } from "../../utils/logger";
import { LLM_CHANNELS } from "../channels";
import type { ChatCompletionRequest, IPCResponse } from "../types";

const log = logger.withContext("ModelHandlers");

const SERVERS_WITH_PATH_ARGS = new Set(["@scp/file-system", "@scp/grep"]);
const PATH_ARG_KEYS = ["path", "source", "destination"];
const SERVERS_WITH_STORAGE = new Set(["@scp/plan", "@scp/task"]);

/**
 * Get the working directory used as `cwd` for tools in a chat completion.
 *
 * R-4: routes through `resolveConversationCwd` which prefers
 * `WorkspaceConfig.path` (the user's project dir) when set, else falls back to
 * the per-conversation sandbox dir. Single source of truth across all consumers.
 */
function getConversationCwd(conversationId?: string): string | undefined {
	if (!conversationId) return undefined;
	try {
		return resolveConversationCwd(conversationId);
	} catch {
		return undefined;
	}
}

/**
 * Resolve relative file paths in tool arguments against the workspace directory.
 * Also injects _storageDir for servers that need persistent storage.
 */
function resolveToolPaths(
	serverId: string,
	args: Record<string, unknown>,
	workspaceDir?: string,
): Record<string, unknown> {
	if (!workspaceDir) return args;

	// Inject storage directory for plan/task servers
	if (SERVERS_WITH_STORAGE.has(serverId)) {
		return { ...args, _storageDir: path.join(workspaceDir, "todo") };
	}

	// Resolve relative paths for file-system and grep servers
	if (!SERVERS_WITH_PATH_ARGS.has(serverId)) return args;

	const resolved = { ...args };
	for (const key of PATH_ARG_KEYS) {
		const val = resolved[key];
		if (typeof val === "string" && val && !path.isAbsolute(val)) {
			resolved[key] = path.resolve(workspaceDir, val);
			log.debug("Resolved relative path", {
				key,
				original: val,
				resolved: resolved[key],
				workspaceDir,
			});
		}
	}
	return resolved;
}

function resolveToolMapping(
	toolMapping: NonNullable<ChatCompletionRequest["toolMapping"]>,
	name: string,
): { serverId: string; toolName: string } | undefined {
	const exact = toolMapping[name];
	if (exact) return exact;

	const matches = Object.entries(toolMapping).filter(
		([prefixedName, mapping]) =>
			mapping.toolName === name || prefixedName.endsWith(`__${name}`),
	);
	return matches.length === 1 ? matches[0][1] : undefined;
}

export function registerModelHandlers(): void {
	// Model CRUD (9 channels) → migrated to api-impl.ts
	// Only LLM streaming handlers remain here

	// ============ LLM Chat ============

	ipcMain.handle(
		LLM_CHANNELS.CHAT_COMPLETION,
		async (_event, request: ChatCompletionRequest): Promise<IPCResponse> => {
			try {
				// Resolve conversation cwd (main process is source of truth)
				const workspaceDir = getConversationCwd(request.conversationId);

				// Build a tool executor that maps prefixed tool names back to MCP servers
				const toolTimeoutMs = (request.toolTimeout ?? 180) * 1000;
				const toolExecutor = request.toolMapping
					? async (name: string, args: Record<string, unknown>) => {
							const mapping = resolveToolMapping(request.toolMapping!, name);
							if (!mapping) throw new Error(`Unknown tool: ${name}`);

							const timeoutPromise = new Promise<never>((_, reject) => {
								setTimeout(
									() =>
										reject(
											new Error(
												`Tool "${name}" timed out after ${request.toolTimeout ?? 180}s`,
											),
										),
									toolTimeoutMs,
								);
							});

							// Skill tool dispatch
							if (mapping.serverId.startsWith("skill:")) {
								const skillId = mapping.serverId.slice("skill:".length);
								const skillService = getSkillService();
								const callPromise = skillService.executeSkill(
									skillId,
									mapping.toolName,
									args,
								);
								const result = await Promise.race([
									callPromise,
									timeoutPromise,
								]);
								if (!result.success) {
									throw new Error(result.error || "Skill tool call failed");
								}
								return result.output;
							}

							// MCP tool dispatch (existing logic)
							const resolvedArgs = resolveToolPaths(
								mapping.serverId,
								args,
								workspaceDir,
							);
							const callPromise = mcpService.callTool(
								mapping.serverId,
								mapping.toolName,
								resolvedArgs,
							);
							const result = await Promise.race([callPromise, timeoutPromise]);
							if (!result.success) {
								throw new Error(result.error || "Tool call failed");
							}
							return result.data;
						}
					: undefined;

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
