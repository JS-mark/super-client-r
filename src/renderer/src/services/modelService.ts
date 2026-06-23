import type {
  ActiveModelSelection,
  ChatStreamEvent,
  FetchModelsResponse,
  ModelProvider,
  ModelProviderPreset,
  ProviderModel,
  TestConnectionResponse,
} from "../types/models";
import { httpJson } from "./localApiClient";

export const modelService = {
  listProviders: (): Promise<{
    success: boolean;
    data?: ModelProvider[];
    error?: string;
  }> => window.electron.model.listProviders(),

  getProvider: (id: string) => window.electron.model.getProvider(id),

  saveProvider: (provider: ModelProvider) =>
    window.electron.model.saveProvider(provider),

  deleteProvider: (id: string) => window.electron.model.deleteProvider(id),

  /**
   * Test provider connectivity. Routed through the local HTTP API
   * (`POST /v1/llm/test-connection`) so requests are logged and the same
   * code path is exercised as external clients use.
   */
  testConnection: async (
    baseUrl: string,
    apiKey: string,
  ): Promise<{
    success: boolean;
    data?: TestConnectionResponse;
    error?: string;
  }> => {
    try {
      const data = await httpJson<TestConnectionResponse>(
        "/v1/llm/test-connection",
        { method: "POST", body: { baseUrl, apiKey } },
      );
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to test connection",
      };
    }
  },

  /**
   * Fetch the provider's `/v1/models` list. Routed through the local HTTP API
   * (`POST /v1/llm/models`) so logs appear in the API request log and external
   * clients can invoke the same endpoint.
   */
  fetchModels: async (
    baseUrl: string,
    apiKey: string,
    preset?: ModelProviderPreset,
  ): Promise<{
    success: boolean;
    data?: FetchModelsResponse;
    error?: string;
  }> => {
    try {
      const data = await httpJson<FetchModelsResponse>("/v1/llm/models", {
        method: "POST",
        body: { baseUrl, apiKey, preset },
      });
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch models",
      };
    }
  },

  updateModelConfig: (
    providerId: string,
    modelId: string,
    config: Partial<ProviderModel>,
  ): Promise<{ success: boolean; error?: string }> =>
    window.electron.model.updateModelConfig(providerId, modelId, config),

  getActiveModel: (): Promise<{
    success: boolean;
    data?: ActiveModelSelection | undefined;
    error?: string;
  }> => window.electron.model.getActiveModel(),

  setActiveModel: (selection: ActiveModelSelection | null) =>
    window.electron.model.setActiveModel(selection),

  chatCompletion: (request: {
    requestId: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: Array<
      | { role: "user" | "assistant" | "system"; content: string }
      | {
        role: "assistant";
        content: null;
        tool_calls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      }
      | { role: "tool"; tool_call_id: string; content: string }
    >;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stream?: boolean;
    tools?: Array<{
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }>;
    toolMapping?: Record<string, { serverId: string; toolName: string }>;
    toolPermission?: {
      mode: "none" | "auto" | "approve_always" | "approve_except_authorized";
      authorizedTools?: string[];
    };
    toolCallMode?: "function" | "prompt";
    /** Wire format ('/v1/messages' | '/chat/completions' | '/responses'). */
    apiFormat?: "anthropic-messages" | "chat-completions" | "responses";
    providerPreset?: string;
    extraParams?: Record<string, unknown>;
    conversationId?: string;
    toolTimeout?: number;
  }) => window.electron.llm.chatCompletion(request),

  stopStream: (requestId: string) => window.electron.llm.stopStream(requestId),

  onStreamEvent: (callback: (event: ChatStreamEvent) => void): (() => void) =>
    window.electron.llm.onStreamEvent(callback),
};
