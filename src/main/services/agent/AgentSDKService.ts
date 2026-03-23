/**
 * Agent SDK Service
 *
 * 封装 @anthropic-ai/claude-agent-sdk 的 query() API，提供：
 * - 完整 agent loop（工具调用 → 响应 → 工具调用循环）
 * - 自动最优配置（model/effort/thinking）
 * - Session 持久化与恢复
 * - 流式事件转发
 * - 权限控制
 */

import {
  type Query,
  type SDKMessage,
  type Options,
  type PermissionResult,
  listSessions,
  getSessionInfo,
  forkSession,
  renameSession,
  tagSession,
  getSessionMessages,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import type {
  AgentSDKQueryRequest,
  AgentSDKSessionInfo,
  AgentSDKSessionMessage,
  AgentSDKStreamEvent,
} from "../../ipc/types";
import { storeManager } from "../../store/StoreManager";
import { resolveOptimalConfig } from "./AgentAutoConfig";

/** 活跃查询的上下文 */
interface ActiveQuery {
  requestId: string;
  query: Query;
  sessionId?: string;
  abortController: AbortController;
}

export class AgentSDKService extends EventEmitter {
  private activeQueries: Map<string, ActiveQuery> = new Map();

  /**
   * 创建并执行查询
   */
  async createQuery(
    requestId: string,
    request: AgentSDKQueryRequest,
  ): Promise<void> {
    // 读取用户 Settings 页面配置
    const userConfig = storeManager.getAgentSDKConfig();
    // 获取 provider 级别的 agent 模型配置
    const providerModel = this.getProviderAgentModel();
    // 自动推断最优配置（合并用户配置 + provider 模型）
    const config = resolveOptimalConfig(request, userConfig, providerModel);
    const abortController = new AbortController();

    const cwd = request.cwd || process.cwd();

    // 从用户配置的 Anthropic provider 中解析认证环境变量
    const anthropicEnv = this.resolveAnthropicEnv(config.model);
    if (!anthropicEnv) {
      this.emit("stream-event", {
        requestId,
        type: "error",
        error: "未配置 Anthropic API Key。请在 设置 → 模型 中添加 Anthropic 提供商并填入 API Key，Agent 模式需要 Anthropic API 认证。",
      } satisfies AgentSDKStreamEvent);
      return;
    }

    console.log(`[AgentSDK] Resolved model: "${config.model}" (request=${request.model}, userConfig=${userConfig.defaultModel}, provider=${providerModel}, fallback=claude-sonnet-4-5)`);

    // 构建 query options
    const options: Options = {
      abortController,
      model: config.model,
      effort: config.effort,
      thinking: config.thinking,
      maxTurns: config.maxTurns,
      maxBudgetUsd: config.maxBudgetUsd,
      persistSession: config.persistSession,
      includePartialMessages: config.includePartialMessages,
      permissionMode: request.permissionMode || userConfig.defaultPermissionMode || "default",
      cwd,
      // 禁止子进程加载用户的 ~/.claude/settings.json，避免其中的 env/model 覆盖我们的注入
      settingSources: [],
      // 注入 Anthropic 认证环境变量到 SDK 子进程
      env: {
        ...process.env,
        ...anthropicEnv,
        ELECTRON_RUN_AS_NODE: "1",
        ELECTRON_NO_ATTACH_CONSOLE: "1",
      },
    };

    // 恢复已有 session
    if (request.resumeSessionId) {
      options.resume = request.resumeSessionId;
    }

    // 自定义 session ID
    if (request.sessionId && !request.resumeSessionId) {
      options.sessionId = request.sessionId;
    }

    // 子代理定义
    if (request.agents) {
      options.agents = request.agents;
    }

    // MCP 服务器（后续 Phase 4 完善 McpToolsBridge）
    // 目前通过 mcpServerNames 标记，后续转换为 Agent SDK 格式

    // 权限回调
    options.canUseTool = async (toolName, input, callbackOptions) => {
      return this.handlePermissionRequest(
        requestId,
        toolName,
        input,
        callbackOptions,
      );
    };

    // 创建 query
    const q = query({
      prompt: request.prompt,
      options,
    });

    const activeQuery: ActiveQuery = {
      requestId,
      query: q,
      abortController,
    };
    this.activeQueries.set(requestId, activeQuery);

    try {
      // 消费流式消息
      for await (const message of q) {
        const event = this.convertSDKMessage(requestId, message);
        if (event) {
          // 捕获 session ID
          if ("session_id" in message && message.session_id) {
            activeQuery.sessionId = message.session_id;
          }
          this.emit("stream-event", event);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.emit("stream-event", {
        requestId,
        type: "error",
        error: errorMessage,
        sessionId: activeQuery.sessionId,
      } satisfies AgentSDKStreamEvent);
    } finally {
      this.activeQueries.delete(requestId);
    }
  }

  /**
   * 中断查询
   */
  async interruptQuery(requestId: string): Promise<boolean> {
    const active = this.activeQueries.get(requestId);
    if (!active) return false;

    try {
      await active.query.interrupt();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 关闭查询
   */
  closeQuery(requestId: string): boolean {
    const active = this.activeQueries.get(requestId);
    if (!active) return false;

    active.query.close();
    active.abortController.abort();
    this.activeQueries.delete(requestId);
    return true;
  }

  /**
   * 切换模型
   */
  async setModel(requestId: string, model: string): Promise<boolean> {
    const active = this.activeQueries.get(requestId);
    if (!active) return false;

    try {
      await active.query.setModel(model);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出所有 Agent SDK sessions
   */
  async listSDKSessions(dir?: string): Promise<AgentSDKSessionInfo[]> {
    try {
      const sessions = await listSessions({ dir });
      return sessions.map((s) => ({
        sessionId: s.sessionId,
        summary: s.summary,
        lastModified: s.lastModified,
        createdAt: s.createdAt,
        cwd: s.cwd,
        tag: s.tag,
        customTitle: s.customTitle,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取 session 详情
   */
  async getSDKSessionInfo(
    sessionId: string,
  ): Promise<AgentSDKSessionInfo | null> {
    try {
      const info = await getSessionInfo(sessionId);
      if (!info) return null;
      return {
        sessionId: info.sessionId,
        summary: info.summary,
        lastModified: info.lastModified,
        createdAt: info.createdAt,
        cwd: info.cwd,
        tag: info.tag,
        customTitle: info.customTitle,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fork 一个已有 session
   */
  async forkSDKSession(
    sessionId: string,
    options?: { dir?: string },
  ): Promise<{ sessionId: string } | null> {
    try {
      const result = await forkSession(sessionId, options);
      return result ? { sessionId: result.sessionId } : null;
    } catch {
      return null;
    }
  }

  /**
   * 重命名 session
   */
  async renameSDKSession(
    sessionId: string,
    title: string,
    options?: { dir?: string },
  ): Promise<boolean> {
    try {
      await renameSession(sessionId, title, options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 给 session 打标签
   */
  async tagSDKSession(
    sessionId: string,
    tag: string,
    options?: { dir?: string },
  ): Promise<boolean> {
    try {
      await tagSession(sessionId, tag, options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 session 消息列表
   */
  async getSDKSessionMessages(
    sessionId: string,
    options?: { dir?: string },
  ): Promise<AgentSDKSessionMessage[]> {
    try {
      const messages = await getSessionMessages(sessionId, options);
      return messages.map((m) => ({
        type: m.type as "user" | "assistant",
        uuid: m.uuid,
        sessionId: m.session_id,
        message: m.message,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 检查是否有活跃查询
   */
  hasActiveQuery(requestId: string): boolean {
    return this.activeQueries.has(requestId);
  }

  /**
   * 获取活跃查询数量
   */
  getActiveQueryCount(): number {
    return this.activeQueries.size;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * 获取 claudeCodeEnabled provider 上配置的 agent 模型
   */
  private getProviderAgentModel(): string | undefined {
    try {
      const providers = storeManager.getModelProviders();
      const ccProvider = providers.find(
        (p) => p.claudeCodeEnabled && p.enabled,
      );
      return ccProvider?.claudeCodeModel;
    } catch {
      return undefined;
    }
  }

  /**
   * 从用户配置的 model provider 中解析 Agent SDK 子进程环境变量
   *
   * 认证模式：
   * - 原生 Anthropic (preset=anthropic): ANTHROPIC_API_KEY
   * - 第三方服务商 (OpenRouter 等):     ANTHROPIC_AUTH_TOKEN + ANTHROPIC_API_KEY=""
   *   参考: https://openrouter.ai/docs/guides/community/anthropic-agent-sdk
   */
  private resolveAnthropicEnv(modelId?: string): Record<string, string> | null {
    const userConfig = storeManager.getAgentSDKConfig();

    // 优先级: Agent Settings 覆盖 > Provider 配置 > 环境变量
    let apiKey: string | undefined;
    let baseUrl: string | undefined;
    let isNativeAnthropic = true; // 默认假设原生 Anthropic

    // 1. Agent Settings 页面的 API Key / Base URL 覆盖（最高优先级）
    if (userConfig.apiKeyOverride) {
      apiKey = userConfig.apiKeyOverride;
      baseUrl = userConfig.baseUrlOverride;
      // 有自定义 baseUrl 且不指向 Anthropic → 第三方服务商
      if (baseUrl && !this.isAnthropicUrl(baseUrl)) {
        isNativeAnthropic = false;
      }
    }

    // 2. 从用户配置的模型提供商中查找（优先 claudeCodeEnabled，回退 preset=anthropic）
    if (!apiKey) {
      try {
        const providers = storeManager.getModelProviders();
        // Tier 2a: claudeCodeEnabled 服务商
        const ccProvider = providers.find(
          (p) => p.claudeCodeEnabled && p.enabled && p.apiKey,
        );
        // Tier 2b: 回退到 preset=anthropic（向后兼容）
        const targetProvider = ccProvider || providers.find(
          (p) => p.preset === "anthropic" && p.enabled && p.apiKey,
        );
        if (targetProvider?.apiKey) {
          apiKey = targetProvider.apiKey;
          baseUrl = baseUrl || targetProvider.baseUrl;
          isNativeAnthropic = targetProvider.preset === "anthropic";
        }
      } catch {
        // StoreManager 可能未初始化
      }
    }

    // 3. 回退到环境变量（直接 Anthropic）
    if (!apiKey && process.env.ANTHROPIC_API_KEY) {
      apiKey = process.env.ANTHROPIC_API_KEY;
      isNativeAnthropic = true;
    }

    if (!apiKey) return null;

    const env: Record<string, string> = {};

    if (isNativeAnthropic) {
      // 原生 Anthropic: 标准 API Key
      env.ANTHROPIC_API_KEY = apiKey;
    } else {
      // 第三方服务商 (OpenRouter 等): Auth Token 模式
      // ANTHROPIC_AUTH_TOKEN 传递第三方 API Key
      // ANTHROPIC_API_KEY 必须显式为空，否则 SDK 会尝试直连 Anthropic
      env.ANTHROPIC_AUTH_TOKEN = apiKey;
      env.ANTHROPIC_API_KEY = "";
    }

    if (baseUrl) {
      // 第三方服务商的 baseUrl 通常带 /v1 后缀（OpenAI 兼容格式），
      // 但 Anthropic SDK 会自行拼接 /v1/messages，需要去掉以避免 /v1/v1/messages 重复
      // 例: https://openrouter.ai/api/v1 → https://openrouter.ai/api
      env.ANTHROPIC_BASE_URL = !isNativeAnthropic
        ? baseUrl.replace(/\/v1\/?$/, "")
        : baseUrl;
    }

    console.log(`[AgentSDK] Auth mode: ${isNativeAnthropic ? "native-anthropic" : "third-party"}, baseUrl=${env.ANTHROPIC_BASE_URL || "(default)"}`);

    // 模型覆盖
    const resolvedModel = modelId || "claude-sonnet-4-5";
    env.ANTHROPIC_MODEL = resolvedModel;
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolvedModel;
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolvedModel;
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolvedModel;
    // 注入小/快模型
    if (userConfig.smallFastModel) {
      env.ANTHROPIC_SMALL_FAST_MODEL = userConfig.smallFastModel;
    }
    // 注入自定义环境变量（最高优先级，可覆盖上述所有）
    if (userConfig.customEnvVars) {
      Object.assign(env, userConfig.customEnvVars);
    }
    return env;
  }

  /**
   * 检查 URL 是否指向 Anthropic 原生 API
   */
  private isAnthropicUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === "api.anthropic.com" || hostname.endsWith(".anthropic.com");
    } catch {
      return false;
    }
  }

  /**
   * 转换 SDK 消息为 IPC 流式事件
   */
  private convertSDKMessage(
    requestId: string,
    message: SDKMessage,
  ): AgentSDKStreamEvent | null {
    const sessionId =
      "session_id" in message ? message.session_id : undefined;

    switch (message.type) {
      case "system": {
        if (message.subtype === "init") {
          return {
            requestId,
            type: "init",
            sessionId,
            status: `Model: ${message.model}, Tools: ${message.tools?.length ?? 0}`,
          };
        }
        if (message.subtype === "status") {
          return {
            requestId,
            type: "status",
            sessionId,
            status: message.status ?? "unknown",
          };
        }
        return null;
      }

      case "assistant": {
        // 完整 assistant 消息 — 提取 text blocks
        const textBlocks = message.message.content
          .filter((b) => b.type === "text")
          .map((b) => ("text" in b ? (b as { text: string }).text : ""))
          .join("");

        const usage = message.message.usage;
        return {
          requestId,
          type: "assistant",
          sessionId,
          content: textBlocks,
          usage: usage
            ? {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              cacheCreationInputTokens:
                (usage as unknown as Record<string, number>)
                  .cache_creation_input_tokens,
              cacheReadInputTokens:
                (usage as unknown as Record<string, number>)
                  .cache_read_input_tokens,
            }
            : undefined,
        };
      }

      case "stream_event": {
        // 流式部分消息
        const event = message.event;
        if (
          event.type === "content_block_delta" &&
          "delta" in event &&
          event.delta.type === "text_delta"
        ) {
          return {
            requestId,
            type: "chunk",
            sessionId,
            content: (event.delta as { text: string }).text,
          };
        }
        return null;
      }

      case "tool_use_summary": {
        return {
          requestId,
          type: "tool_use_summary",
          sessionId,
          toolSummary: message.summary,
        };
      }

      case "result": {
        if (message.subtype === "success") {
          return {
            requestId,
            type: "result",
            sessionId,
            result: {
              success: true,
              text: message.result,
              durationMs: message.duration_ms,
              numTurns: message.num_turns,
              totalCostUsd: message.total_cost_usd,
              stopReason: message.stop_reason,
              usage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
                cacheCreationInputTokens:
                  message.usage
                    .cache_creation_input_tokens ?? 0,
                cacheReadInputTokens:
                  message.usage.cache_read_input_tokens ?? 0,
              },
            },
          };
        }
        // error result
        return {
          requestId,
          type: "result",
          sessionId,
          result: {
            success: false,
            text:
              "error" in message
                ? String(message.error)
                : "Query failed",
            durationMs:
              "duration_ms" in message
                ? (message.duration_ms as number)
                : 0,
            numTurns:
              "num_turns" in message
                ? (message.num_turns as number)
                : 0,
            totalCostUsd:
              "total_cost_usd" in message
                ? (message.total_cost_usd as number)
                : 0,
            stopReason: null,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
            },
          },
          error:
            "error" in message
              ? String(message.error)
              : "Query failed",
        };
      }

      case "rate_limit_event": {
        return {
          requestId,
          type: "rate_limit",
          sessionId,
          status: `Rate limited: ${message.rate_limit_info.status}`,
        };
      }

      default:
        // 其他消息类型暂不处理
        return null;
    }
  }

  /** 待解决的权限请求 */
  private pendingPermissions: Map<
    string,
    {
      resolve: (result: PermissionResult) => void;
    }
  > = new Map();

  /**
   * 处理权限请求
   */
  private handlePermissionRequest(
    requestId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: AbortSignal;
      title?: string;
      description?: string;
      displayName?: string;
      toolUseID: string;
    },
  ): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      const permissionId = options.toolUseID;

      // 存储 resolver
      this.pendingPermissions.set(permissionId, { resolve });

      // 发送权限请求到 renderer
      this.emit("stream-event", {
        requestId,
        type: "permission_request",
        permissionRequest: {
          toolName,
          toolUseId: permissionId,
          toolInput: input,
          title: options.title,
          description: options.description,
          displayName: options.displayName,
        },
      } satisfies AgentSDKStreamEvent);

      // 超时自动拒绝（60 秒）
      const timeout = setTimeout(() => {
        if (this.pendingPermissions.has(permissionId)) {
          this.pendingPermissions.delete(permissionId);
          resolve({ behavior: "deny", message: "Permission request timed out" });
        }
      }, 60_000);

      // abort 时清理
      options.signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        if (this.pendingPermissions.has(permissionId)) {
          this.pendingPermissions.delete(permissionId);
          resolve({ behavior: "deny", message: "Query aborted" });
        }
      });
    });
  }

  /**
   * 解决权限请求（由 renderer 调用）
   */
  resolvePermission(toolUseId: string, allowed: boolean): boolean {
    const pending = this.pendingPermissions.get(toolUseId);
    if (!pending) return false;

    if (allowed) {
      pending.resolve({ behavior: "allow" });
    } else {
      pending.resolve({ behavior: "deny", message: "User denied" });
    }
    this.pendingPermissions.delete(toolUseId);
    return true;
  }
}

// 单例
export const agentSDKService = new AgentSDKService();
