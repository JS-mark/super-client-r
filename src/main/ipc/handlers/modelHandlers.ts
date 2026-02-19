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
import { storeManager } from "../../store/StoreManager";

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
					error instanceof Error
						? error.message
						: "Failed to delete provider";
				return { success: false, error: message };
			}
		},
	);

	// ============ Connection & Models ============

	ipcMain.handle(
		MODEL_CHANNELS.TEST_CONNECTION,
		async (
			_event,
			request: TestConnectionRequest,
		): Promise<IPCResponse> => {
			try {
				const result = await llmService.testConnection(
					request.baseUrl,
					request.apiKey,
				);
				return { success: true, data: result };
			} catch (error: unknown) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to test connection";
				return { success: false, error: message };
			}
		},
	);

	ipcMain.handle(
		MODEL_CHANNELS.FETCH_MODELS,
		async (
			_event,
			request: FetchModelsRequest,
		): Promise<IPCResponse> => {
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
		async (
			_event,
			request: UpdateModelConfigRequest,
		): Promise<IPCResponse> => {
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
					error instanceof Error
						? error.message
						: "Failed to get active model";
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
					error instanceof Error
						? error.message
						: "Failed to set active model";
				return { success: false, error: message };
			}
		},
	);

	// ============ LLM Chat ============

	ipcMain.handle(
		LLM_CHANNELS.CHAT_COMPLETION,
		async (
			_event,
			request: ChatCompletionRequest,
		): Promise<IPCResponse> => {
			try {
				// Build a tool executor that maps prefixed tool names back to MCP servers
				const toolExecutor = request.toolMapping
					? async (name: string, args: Record<string, unknown>) => {
							const mapping = request.toolMapping![name];
							if (!mapping) throw new Error(`Unknown tool: ${name}`);
							const result = await mcpService.callTool(
								mapping.serverId,
								mapping.toolName,
								args,
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
