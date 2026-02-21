import * as path from "path";
import { ipcMain } from "electron";
import { LLM_CHANNELS, MODEL_CHANNELS } from "../channels";
import type {
	ActiveModelSelection,
	ChatCompletionRequest,
	FetchModelsRequest,
	IPCResponse,
	ModelProvider,
	TestConnectionRequest,
	UpdateModelConfigRequest,
} from "../types";
import { llmService } from "../../services/llm";
import { mcpService } from "../../services/mcp/McpService";
import { conversationStorage } from "../../services/chat/ConversationStorageService";
import { storeManager } from "../../store/StoreManager";
import { logger } from "../../utils/logger";

const log = logger.withContext("ModelHandlers");

const FILE_SYSTEM_SERVER_ID = "@scp/file-system";
const PATH_ARG_KEYS = ["path", "source", "destination"];

/**
 * Get the workspace directory for a conversation.
 * Returns undefined if no conversation ID is provided.
 */
function getWorkspaceDir(conversationId?: string): string | undefined {
	if (!conversationId) return undefined;
	try {
		return conversationStorage.getWorkspaceDir(conversationId);
	} catch {
		return undefined;
	}
}

/**
 * Resolve relative file paths in tool arguments against the workspace directory.
 * Only applies to the internal file-system server's tools.
 */
function resolveToolPaths(
	serverId: string,
	args: Record<string, unknown>,
	workspaceDir?: string,
): Record<string, unknown> {
	if (!workspaceDir || serverId !== FILE_SYSTEM_SERVER_ID) return args;

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

export function registerModelHandlers(): void {
	// ============ Model Provider CRUD ============

	ipcMain.handle(
		MODEL_CHANNELS.LIST_PROVIDERS,
		async (): Promise<IPCResponse<ModelProvider[]>> => {
			try {
				const providers = storeManager.getModelProviders();
				return { success: true, data: providers };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to list providers";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		MODEL_CHANNELS.GET_PROVIDER,
		async (_event, id: string): Promise<IPCResponse<ModelProvider>> => {
			try {
				const provider = storeManager.getModelProvider(id);
				if (!provider) {
					return { success: false, error: "Provider not found" };
				}
				return { success: true, data: provider };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to get provider";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		MODEL_CHANNELS.SAVE_PROVIDER,
		async (_event, provider: ModelProvider): Promise<IPCResponse> => {
			try {
				storeManager.saveModelProvider(provider);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to save provider";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		MODEL_CHANNELS.DELETE_PROVIDER,
		async (_event, id: string): Promise<IPCResponse> => {
			try {
				storeManager.deleteModelProvider(id);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to delete provider";
				return { success: false, error: message };
			}
		},
	);

	// ============ Connection & Models ============

	ipcMain.handle(
		MODEL_CHANNELS.TEST_CONNECTION,
		async (_event, request: TestConnectionRequest): Promise<IPCResponse> => {
			try {
				const result = await llmService.testConnection(
					request.baseUrl,
					request.apiKey,
				);
				return { success: true, data: result };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to test connection";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		MODEL_CHANNELS.FETCH_MODELS,
		async (_event, request: FetchModelsRequest): Promise<IPCResponse> => {
			try {
				const models = await llmService.fetchModels(
					request.baseUrl,
					request.apiKey,
					request.preset,
				);
				return { success: true, data: { models } };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to fetch models";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		MODEL_CHANNELS.UPDATE_MODEL_CONFIG,
		async (_event, request: UpdateModelConfigRequest): Promise<IPCResponse> => {
			try {
				storeManager.updateModelConfig(
					request.providerId,
					request.modelId,
					request.config,
				);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to update model config";
				return { success: false, error: message };
			}
		},
	);

	// ============ Active Model Selection ============

	ipcMain.handle(
		MODEL_CHANNELS.GET_ACTIVE_MODEL,
		async (): Promise<IPCResponse<ActiveModelSelection | undefined>> => {
			try {
				const selection = storeManager.getActiveModelSelection();
				return { success: true, data: selection };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to get active model";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		MODEL_CHANNELS.SET_ACTIVE_MODEL,
		async (
			_event,
			selection: ActiveModelSelection | null,
		): Promise<IPCResponse> => {
			try {
				storeManager.setActiveModelSelection(selection);
				return { success: true };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Failed to set active model";
				return { success: false, error: message };
			}
		},
	);

	// ============ LLM Chat ============

	ipcMain.handle(
		LLM_CHANNELS.CHAT_COMPLETION,
		async (_event, request: ChatCompletionRequest): Promise<IPCResponse> => {
			try {
				// Resolve workspace directory from conversation ID (main process is source of truth)
				const workspaceDir = getWorkspaceDir(request.conversationId);

				// Build a tool executor that maps prefixed tool names back to MCP servers
				const toolExecutor = request.toolMapping
					? async (name: string, args: Record<string, unknown>) => {
							const mapping = request.toolMapping![name];
							if (!mapping) throw new Error(`Unknown tool: ${name}`);
							const resolvedArgs = resolveToolPaths(
								mapping.serverId,
								args,
								workspaceDir,
							);
							const result = await mcpService.callTool(
								mapping.serverId,
								mapping.toolName,
								resolvedArgs,
							);
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
