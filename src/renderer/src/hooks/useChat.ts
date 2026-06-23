import { App } from "antd";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionSettings } from "../components/chat/ChatSettingsModal";
import { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";
import {
  BROWSER_INSTRUCTIONS,
  buildSystemPrompt,
  CLEAR_INSTRUCTIONS,
  type EnvInfo,
  KNOWLEDGE_INSTRUCTIONS,
  TOOLS_INSTRUCTIONS,
  USER_CONFIG_INSTRUCTIONS,
} from "../prompt";
import { agentSDKClient } from "../services/agent/agentSDKService";
import { attachmentResolverService } from "../services/attachmentResolverService";
import { mcpClient } from "../services/mcp/mcpService";
import { modelService } from "../services/modelService";
import { runtimeService } from "../services/runtimeService";
import { searchService } from "../services/search/searchService";
import { skillClient } from "../services/skill/skillService";
import { sanitizeAssistantContent } from "../lib/assistantContent";
import { createLogger } from "../services/logService";
import {
  getProjectIdFromConversation,
  useChatStore,
} from "../stores/chatStore";
import { type Message, useChatMessageStore } from "../stores/chatMessageStore";
import { useFileArtifactStore } from "../stores/fileArtifactStore";
import { useMcpStore } from "../stores/mcpStore";
import { useModelStore } from "../stores/modelStore";
import { useProjectStore } from "../stores/projectStore";
import type { ActiveModelSelection } from "../types/models";
import type { SearchConfig } from "../types/search";
import { captureFileArtifactsFromToolResult } from "./useChatFileCapture";

export type {
  CustomParam,
  SessionSettings,
  ToolCallMode,
  ToolPermissionMode,
} from "../components/chat/ChatSettingsModal";
export { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";

export type ChatMode = "agent";

const agentLog = createLogger("ChatAgent");

export interface ChatOptions {
  mode?: ChatMode;
  content?: string;
  agentId?: string;
  skillId?: string;
  commandName?: string;
  searchEngine?: string;
  searchConfigs?: SearchConfig[];
  attachmentIds?: string[];
}

function isClaudeAgentModel(modelId?: string): boolean {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return (
    id.includes("claude") ||
    id.includes("anthropic/") ||
    id.includes("sonnet") ||
    id.includes("opus") ||
    id.includes("haiku")
  );
}

/**
 * Fetch MCP tools from all connected servers and build tool awareness prompt.
 * Returns tools array, toolMapping, and a tool hint string for the system prompt.
 */
/**
 * 将 serverId 转换为合法的 OpenAI 函数名前缀
 * OpenAI 要求: ^[a-zA-Z0-9_-]+$
 * 例如: "@scp/fetch" → "scp-fetch", "@mcp/browser" → "mcp-browser"
 */
function sanitizeServerId(serverId: string): string {
  return serverId.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function fetchMcpTools(): Promise<{
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolMapping?: Record<string, { serverId: string; toolName: string }>;
  toolHint: string;
}> {
  try {
    const mcpTools = await mcpClient.getAllTools();
    if (mcpTools.length > 0) {
      const tools: Array<{
        type: "function";
        function: {
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        };
      }> = [];
      const toolMapping: Record<
        string,
        { serverId: string; toolName: string }
      > = {};
      for (const { serverId, tool } of mcpTools) {
        const safePrefix = sanitizeServerId(serverId);
        const prefixedName = `${safePrefix}__${tool.name}`;
        tools.push({
          type: "function",
          function: {
            name: prefixedName,
            description: tool.description || "",
            parameters: tool.inputSchema || { type: "object", properties: {} },
          },
        });
        toolMapping[prefixedName] = { serverId, toolName: tool.name };
      }
      const toolNames = tools
        .map((t) => t.function.name.split("__").pop())
        .join(", ");

      // Build context-aware tool instructions based on available servers/tools
      const serverIds = new Set(mcpTools.map((t) => t.serverId));
      const allToolNames = new Set(mcpTools.map((t) => t.tool.name));
      const hints: string[] = [
        `\n\nYou have access to the following tools and SHOULD actively use them when the user's request can benefit from them: ${toolNames}. Do not say you cannot access files, databases, or the web if a relevant tool is available — use the tool instead.`,
        CLEAR_INSTRUCTIONS,
        TOOLS_INSTRUCTIONS,
      ];
      if (serverIds.has("@scp/browser")) {
        hints.push(BROWSER_INSTRUCTIONS);
      }
      if (allToolNames.has("knowledge_base_search")) {
        hints.push(KNOWLEDGE_INSTRUCTIONS);
      }
      if (allToolNames.has("request_user_config")) {
        hints.push(USER_CONFIG_INSTRUCTIONS);
      }
      const toolHint = hints.join("\n");
      return { tools, toolMapping, toolHint };
    }
  } catch (err) {
    console.warn("[useChat] Failed to fetch MCP tools:", err);
  }
  return { toolHint: "" };
}

/**
 * Fetch tools defined by a specific skill and build function calling format.
 * Uses `skill:{skillId}` as serverId convention to distinguish from MCP tools.
 */
async function fetchSkillTools(skillId: string): Promise<{
  tools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolMapping: Record<string, { serverId: string; toolName: string }>;
}> {
  try {
    const allSkillTools = await skillClient.getAllTools();
    const skillTools = allSkillTools.filter((t) => t.skillId === skillId);
    const tools: Array<{
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }> = [];
    const toolMapping: Record<string, { serverId: string; toolName: string }> =
      {};
    for (const { skillId: sid, tool } of skillTools) {
      const prefixedName = `skill-${sid}__${tool.name}`;
      tools.push({
        type: "function",
        function: {
          name: prefixedName,
          description: tool.description || "",
          parameters: tool.inputSchema || { type: "object", properties: {} },
        },
      });
      toolMapping[prefixedName] = {
        serverId: `skill:${sid}`,
        toolName: tool.name,
      };
    }
    return { tools, toolMapping };
  } catch (err) {
    console.warn("[useChat] Failed to fetch skill tools:", err);
    return { tools: [], toolMapping: {} };
  }
}

/**
 * Fetch tools from ALL enabled skills (not filtered by skillId).
 * Used by direct/agent modes so Claude can access skill tools globally.
 */
async function fetchAllSkillTools(): Promise<{
  tools: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolMapping: Record<string, { serverId: string; toolName: string }>;
}> {
  try {
    const allSkillTools = await skillClient.getAllTools();
    const tools: Array<{
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }> = [];
    const toolMapping: Record<string, { serverId: string; toolName: string }> =
      {};
    for (const { skillId, tool } of allSkillTools) {
      const prefixedName = `skill-${skillId}__${tool.name}`;
      tools.push({
        type: "function",
        function: {
          name: prefixedName,
          description: tool.description || "",
          parameters: tool.inputSchema || { type: "object", properties: {} },
        },
      });
      toolMapping[prefixedName] = {
        serverId: `skill:${skillId}`,
        toolName: tool.name,
      };
    }
    return { tools, toolMapping };
  } catch (err) {
    console.warn("[useChat] Failed to fetch all skill tools:", err);
    return { tools: [], toolMapping: {} };
  }
}

/**
 * Parse custom params from SessionSettings into a Record.
 */
function parseCustomParams(
  params: Array<{ name: string; type: string; value: string }>,
): Record<string, unknown> | undefined {
  const valid = params.filter((p) => p.name.trim());
  if (valid.length === 0) return undefined;
  const result: Record<string, unknown> = {};
  for (const p of valid) {
    const key = p.name.trim();
    switch (p.type) {
      case "number":
        result[key] = Number(p.value) || 0;
        break;
      case "boolean":
        result[key] = p.value.toLowerCase() === "true";
        break;
      case "json":
        try {
          result[key] = JSON.parse(p.value);
        } catch {
          result[key] = p.value;
        }
        break;
      default:
        result[key] = p.value;
    }
  }
  return result;
}

// 缓存环境信息（静态数据，应用生命周期内不变）
let cachedEnvInfo: EnvInfo | undefined;

async function getEnvInfo(): Promise<EnvInfo | undefined> {
  if (cachedEnvInfo) return cachedEnvInfo;
  try {
    const res = await window.electron.system.getEnvInfo();
    if (res.success && res.data) {
      cachedEnvInfo = res.data;
      return cachedEnvInfo;
    }
  } catch (err) {
    console.warn("[useChat] Failed to fetch env info:", err);
  }
  return undefined;
}

/**
 * Get env info for system prompt injection.
 * The cwd defaults to the user's home directory (set by the main process).
 * Attaches the per-conversation workspace directory when available.
 */
async function getEnvInfoForPrompt(): Promise<EnvInfo | undefined> {
  const envInfo = await getEnvInfo();
  if (!envInfo) return undefined;

  const conversationId = useChatStore.getState().currentConversationId;
  if (!conversationId) return envInfo;

  // G-2: workspaceDir = per-session 沙箱（cwd）；projectRoot = 项目真实根路径
  // （会注入系统提示词作为可操作范围约束）。两者独立解析，单字段失败不互相影响。
  let workspaceDir: string | undefined;
  let projectRoot: string | undefined;

  try {
    const res = await window.electron.cwd.resolveSessionCwd(conversationId);
    if (res.success && res.data) workspaceDir = res.data;
  } catch (err) {
    console.warn("[useChat] resolveSessionCwd failed:", err);
  }

  try {
    const res = await window.electron.cwd.resolveProjectRoot(conversationId);
    if (res.success && res.data) projectRoot = res.data;
  } catch (err) {
    console.warn("[useChat] resolveProjectRoot failed:", err);
  }

  return {
    ...envInfo,
    ...(workspaceDir && { workspaceDir }),
    ...(projectRoot && { projectRoot }),
  };
}

export function useChat() {
  const { message } = App.useApp();
  // R-3 step 2: messages + streaming state moved to useChatMessageStore.
  const messages = useChatMessageStore((s) => s.messages);
  const sessionStatus = useChatMessageStore((s) => s.sessionStatus);
  const isStreaming = useChatMessageStore((s) => s.isStreaming);
  const addMessage = useChatMessageStore((s) => s.addMessage);
  const updateLastMessage = useChatMessageStore((s) => s.updateLastMessage);
  const updateMessageToolCall = useChatMessageStore(
    (s) => s.updateMessageToolCall,
  );
  const updateMessageMetadata = useChatMessageStore(
    (s) => s.updateMessageMetadata,
  );
  const updateMessageContent = useChatMessageStore(
    (s) => s.updateMessageContent,
  );
  const setSessionStatus = useChatMessageStore((s) => s.setSessionStatus);
  const setStreamingContent = useChatMessageStore(
    (s) => s.setStreamingContent,
  );
  const clearMessages = useChatMessageStore((s) => s.clearMessages);
  const deleteMessage = useChatMessageStore((s) => s.deleteMessage);
  const deleteMessagesFrom = useChatMessageStore((s) => s.deleteMessagesFrom);

  const [input, setInput] = useState("");
  const editingMessageIdRef = useRef<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedCommandName, setSelectedCommandName] = useState<string | null>(
    null,
  );

  // Pending tool approval state
  const [pendingApproval, setPendingApproval] = useState<{
    toolCallId: string;
    name: string;
    arguments: string;
  } | null>(null);

  // Session-scoped model override (does not affect global setting).
  // Derived directly from conversation metadata `session.modelOverride`;
  // no local mirror state. Writes go through `chatStore.updateConversationMetadata`
  // which both persists to main and refreshes this selector.
  const currentConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.currentConversationId),
  );
  const sessionModelOverride = useMemo<ActiveModelSelection | null>(() => {
    const override = currentConversation?.session?.modelOverride;
    return override
      ? { providerId: override.providerId, modelId: override.modelId }
      : null;
  }, [currentConversation?.session?.modelOverride]);

  // Session-scoped settings (tools, temperature, maxTokens, systemPrompt)
  const [sessionSettings, setSessionSettings] = useState<SessionSettings>(
    DEFAULT_SESSION_SETTINGS,
  );

  // Available MCP tools for permission settings UI
  const [availableTools, setAvailableTools] = useState<
    Array<{ prefixedName: string; displayName: string }>
  >([]);

  const respondToApproval = useCallback(
    async (
      toolCallId: string,
      approved: boolean,
      updatedInput?: Record<string, unknown>,
      updatedPermissions?: Array<Record<string, unknown>>,
    ) => {
      // Optimistic update: immediately reflect in UI
      const toolMsgId = `tool_${toolCallId}`;
      if (approved) {
        updateMessageToolCall(toolMsgId, {
          status: "pending",
          ...(updatedInput ? { result: updatedInput } : {}),
        });
      } else {
        updateMessageToolCall(toolMsgId, {
          status: "error",
          error: "Tool call rejected by user",
        });
      }
      try {
        if (isAgentSDKRequestRef.current) {
          await agentSDKClient.resolvePermission(
            toolCallId,
            approved,
            updatedInput,
            updatedPermissions,
          );
        } else {
          await window.electron.llm.toolApprovalResponse(toolCallId, approved);
        }
      } catch (err) {
        console.error("[useChat] toolApprovalResponse failed:", err);
      }
      setPendingApproval(null);
    },
    [updateMessageToolCall],
  );

  // Fetch available tools list for settings UI
  useEffect(() => {
    const loadTools = async () => {
      try {
        const mcpTools = await mcpClient.getAllTools();
        const tools = mcpTools.map(({ serverId, tool }) => {
          const safePrefix = sanitizeServerId(serverId);
          const prefixedName = `${safePrefix}__${tool.name}`;
          return { prefixedName, displayName: tool.name };
        });

        // Also load skill tools when a skill is selected
        if (selectedSkillId) {
          try {
            const skillTools = await skillClient.getAllTools();
            const filtered = skillTools.filter(
              (t) => t.skillId === selectedSkillId,
            );
            for (const { skillId, tool } of filtered) {
              const prefixedName = `skill-${skillId}__${tool.name}`;
              tools.push({
                prefixedName,
                displayName: `${skillId}/${tool.name}`,
              });
            }
          } catch {
            // Skill tools loading failure is non-fatal
          }
        }

        setAvailableTools(tools);
      } catch {
        setAvailableTools([]);
      }
    };
    loadTools();
  }, [selectedSkillId]);

  const currentRequestIdRef = useRef<string | null>(null);
  const agentSDKSessionIdRef = useRef<string | null>(null);
  const isAgentSDKRequestRef = useRef(false);
  const agentFirstChunkLoggedRef = useRef(false);
  const streamContentRef = useRef("");
  const streamFlushRafRef = useRef<number | null>(null);
  const currentModelInfoRef = useRef<{
    model: string;
    providerPreset: string;
    providerName: string;
  } | null>(null);

  /**
   * Stream watchdog —— 后端长时间没有任何 event 推送时兜底把 sessionStatus
   * 切回 idle 并提示用户。覆盖以下 SDK / 网关静默场景：
   *   - SDK 子进程半死（无 result/error）
   *   - 第三方 Anthropic-compat 网关吞掉 cancelled
   *   - 主进程未捕获异常导致事件流断
   * 每收到任意 stream-event 时 `kickWatchdog()` 续命；result/error/done/
   * rate_limit 任一终态、stopCurrentStream、unmount 都 `clearWatchdog()`。
   */
  const STREAM_WATCHDOG_MS = 60_000;
  const streamWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWatchdog = useCallback(() => {
    if (streamWatchdogRef.current) {
      clearTimeout(streamWatchdogRef.current);
      streamWatchdogRef.current = null;
    }
  }, []);
  const kickWatchdog = useCallback(() => {
    if (streamWatchdogRef.current) {
      clearTimeout(streamWatchdogRef.current);
    }
    streamWatchdogRef.current = setTimeout(() => {
      streamWatchdogRef.current = null;
      // 仅在仍处于响应中且 currentRequestId 还活着时兜底；防止 race
      const status = useChatMessageStore.getState().sessionStatus;
      if (status === "idle" || !currentRequestIdRef.current) return;
      console.warn(
        "[useChat] stream watchdog timeout, force-resetting sessionStatus",
        { requestId: currentRequestIdRef.current },
      );
      message.warning(t("stream.watchdogTimeout", { ns: "chat" }));
      // 保住已经累计的内容，再清流式状态
      if (streamContentRef.current) {
        const sanitized = sanitizeAssistantContent(streamContentRef.current);
        setStreamingContent(sanitized);
        updateLastMessage(sanitized);
      }
      setSessionStatus("idle");
      if (streamFlushRafRef.current !== null) {
        cancelAnimationFrame(streamFlushRafRef.current);
        streamFlushRafRef.current = null;
      }
      setStreamingContent("");
      streamContentRef.current = "";
      currentRequestIdRef.current = null;
      isAgentSDKRequestRef.current = false;
    }, STREAM_WATCHDOG_MS);
  }, [message, setSessionStatus, setStreamingContent, updateLastMessage]);
  const armWatchdog = kickWatchdog;

  useEffect(() => {
    // hooks unmount 时清理，防泄漏
    return () => {
      clearWatchdog();
      if (streamFlushRafRef.current !== null) {
        cancelAnimationFrame(streamFlushRafRef.current);
        streamFlushRafRef.current = null;
      }
    };
  }, [clearWatchdog]);

  const applyAssistantStreamContent = useCallback(() => {
    streamFlushRafRef.current = null;
    const sanitized = sanitizeAssistantContent(streamContentRef.current);
    setStreamingContent(sanitized);
  }, [setStreamingContent]);

  const scheduleAssistantStreamFlush = useCallback(() => {
    if (streamFlushRafRef.current !== null) return;
    streamFlushRafRef.current = requestAnimationFrame(applyAssistantStreamContent);
  }, [applyAssistantStreamContent]);

  const flushAssistantStreamContent = useCallback(() => {
    if (streamFlushRafRef.current !== null) {
      cancelAnimationFrame(streamFlushRafRef.current);
      streamFlushRafRef.current = null;
    }
    if (!streamContentRef.current) return;
    applyAssistantStreamContent();
  }, [applyAssistantStreamContent]);

  const setAssistantStreamContent = useCallback(
    (content: string, immediate = false) => {
      streamContentRef.current = content;
      if (immediate) {
        flushAssistantStreamContent();
        return;
      }
      scheduleAssistantStreamFlush();
    },
    [flushAssistantStreamContent, scheduleAssistantStreamFlush],
  );

  const clearAssistantStreamContent = useCallback(() => {
    if (streamFlushRafRef.current !== null) {
      cancelAnimationFrame(streamFlushRafRef.current);
      streamFlushRafRef.current = null;
    }
    streamContentRef.current = "";
    setStreamingContent("");
  }, [setStreamingContent]);

  const finalizeAssistantStreamContent = useCallback(() => {
    if (streamFlushRafRef.current !== null) {
      cancelAnimationFrame(streamFlushRafRef.current);
      streamFlushRafRef.current = null;
    }
    if (!streamContentRef.current) return;
    const sanitized = sanitizeAssistantContent(streamContentRef.current);
    setStreamingContent(sanitized);
    updateLastMessage(sanitized);
  }, [setStreamingContent, updateLastMessage]);

  const appendAssistantStreamChunk = useCallback(
    (chunk: string) => {
      setAssistantStreamContent(streamContentRef.current + chunk);
    },
    [setAssistantStreamContent],
  );

  const updateLastAssistantContent = useCallback(
    (content: string) => {
      const sanitized = sanitizeAssistantContent(content);
      const lastAssistant = [...useChatMessageStore.getState().messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (lastAssistant) {
        updateMessageContent(lastAssistant.id, sanitized);
      } else {
        updateLastMessage(sanitized);
      }
    },
    [updateLastMessage, updateMessageContent],
  );

  // Restore Agent SDK session when conversation changes
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  useEffect(() => {
    // 从 ConversationSummary 恢复 agentSDKSessionId
    // modelOverride 不在此恢复 —— 由 sessionModelOverride selector 自动派生
    const conv = useChatStore
      .getState()
      .conversations.find((c) => c.id === currentConversationId);
    agentSDKSessionIdRef.current = conv?.agentSDKSessionId ?? null;
    isAgentSDKRequestRef.current = false;
  }, [currentConversationId]);

  /**
   * Set the session model override and persist it onto conversation metadata.
   * Passing `null` clears the override and removes it from metadata so the
   * resolver falls back to workspace/global defaults on next send.
   */
  const setSessionModelOverride = useCallback(
    (override: ActiveModelSelection | null) => {
      const convId = useChatStore.getState().currentConversationId;
      if (!convId) return;
      useChatStore.getState().updateConversationMetadata(convId, {
        session: {
          modelOverride: override
            ? { providerId: override.providerId, modelId: override.modelId }
            : undefined,
        },
      });
    },
    [],
  );

  /**
   * Look up provider + model objects from `useModelStore` for a given
   * selection. Pure helper, no I/O.
   */
  const findProviderModel = useCallback(
    (sel: { providerId: string; modelId: string }) => {
      const { providers } = useModelStore.getState();
      const provider = providers.find((p) => p.id === sel.providerId);
      const model = provider?.models.find((m) => m.id === sel.modelId);
      if (provider && model) return { provider, model };
      return null;
    },
    [],
  );

  /**
   * Local fallback resolution. Mirrors main-process `SessionRuntimeResolver`
   * order (sessionModelOverride → workspace default → global active) and is
   * used both for synchronous UI rendering and as a safety net when the IPC
   * resolver is unreachable.
   */
  const getEffectiveModel = useCallback(() => {
    if (sessionModelOverride) {
      const found = findProviderModel(sessionModelOverride);
      if (found) return found;
    }

    // E-6: project-level defaultModel comes from useProjectStore.settingsByProject;
    // the cache is populated lazily by useProjectSettings(). Synchronous reads
    // fall back to the global active model when no cached entry exists, which
    // is acceptable here — the UI re-renders once the cache loads.
    const projectId = getProjectIdFromConversation(currentConversation);
    if (projectId) {
      const settings = useProjectStore.getState().settingsByProject[projectId];
      const projDefault = settings?.defaultModel;
      if (projDefault) {
        const found = findProviderModel(projDefault);
        if (found) return found;
      }
    }

    return useModelStore.getState().getActiveProviderModel();
  }, [
    sessionModelOverride,
    currentConversation?.workspaceId,
    findProviderModel,
  ]);

  /**
   * Resolve the authoritative `EffectiveSessionRuntime` from main process.
   * Returns null when no current conversation or when the IPC call fails.
   */
  const resolveEffectiveRuntime = useCallback(async () => {
    const convId = useChatStore.getState().currentConversationId;
    if (!convId) return null;
    try {
      const res = await runtimeService.resolveSession({ sessionId: convId });
      if (res.success && res.data) return res.data;
      return null;
    } catch (err) {
      console.warn("[useChat] resolveEffectiveRuntime failed:", err);
      return null;
    }
  }, []);

  /**
   * R-2 — authoritative model resolution for chat send paths.
   *
   * Calls main-process `SessionRuntimeResolver` via IPC (authoritative), then
   * looks up provider + model objects in `useModelStore` so callers get the
   * full provider (apiKey, baseUrl, preset) and model (id, systemPrompt) they
   * need to make the request.
   *
   * Falls back to renderer-local `getEffectiveModel()` if either step fails:
   * - no current conversation
   * - IPC unreachable
   * - resolver succeeds but `useModelStore` is missing the resolved provider/model
   *
   * The fallback exists so a transient IPC failure doesn't break chat. Long
   * term, when R-1 (workspace store collapse) and reactive resolver state
   * land, this fallback can be removed.
   */
  const resolveActiveProviderModel = useCallback(async () => {
    const runtime = await resolveEffectiveRuntime();
    if (runtime) {
      const found = findProviderModel(runtime.model);
      if (found) return found;
      console.warn(
        "[useChat] resolver returned model not present in useModelStore; falling back",
        runtime.model,
      );
    }
    return getEffectiveModel();
  }, [resolveEffectiveRuntime, findProviderModel, getEffectiveModel]);

  const upsertToolMessage = useCallback(
    (
      toolUseId: string,
      toolCall: Partial<NonNullable<Message["toolCall"]>> & {
        name: string;
        input: Record<string, unknown>;
      },
      content?: string,
    ) => {
      const messageId = `tool_${toolUseId}`;
      const existing = useChatMessageStore
        .getState()
        .messages.find((m) => m.id === messageId);
      if (existing?.toolCall) {
        updateMessageToolCall(messageId, toolCall);
        return;
      }
      addMessage({
        id: messageId,
        role: "tool",
        content: content || `Tool call: ${toolCall.name}`,
        timestamp: Date.now(),
        type: "tool_use",
        toolCall: {
          id: toolUseId,
          name: toolCall.name,
          input: toolCall.input,
          status: toolCall.status || "pending",
          result: toolCall.result,
          error: toolCall.error,
          duration: toolCall.duration,
          approval: toolCall.approval,
        },
      });
    },
    [addMessage, updateMessageToolCall],
  );

  // Subscribe to LLM stream events
  useEffect(() => {
    const unsubscribe = modelService.onStreamEvent((event) => {
      if (event.requestId !== currentRequestIdRef.current) return;

      // 收到任意事件都给 watchdog 续命；终态事件下方各自再 clearWatchdog
      kickWatchdog();

      if (event.type === "chunk" && event.content) {
        // Transition preparing → streaming on first chunk
        if (useChatMessageStore.getState().sessionStatus === "preparing") {
          setSessionStatus("streaming");
        }
        appendAssistantStreamChunk(event.content);
      } else if (event.type === "tool_call" && event.toolCall) {
        setSessionStatus("tool_calling");

        // Finalize any accumulated assistant content BEFORE adding the tool message
        // (updateLastMessage targets messages[last], which is still the assistant here)
        finalizeAssistantStreamContent();
        clearAssistantStreamContent();

        // Model is calling a tool — show a tool message in the chat
        const toolMessage: Message = {
          id: `tool_${event.toolCall.id}`,
          role: "tool",
          content: `Calling tool: ${event.toolCall.name}`,
          timestamp: Date.now(),
          type: "tool_use",
          toolCall: {
            id: event.toolCall.id,
            name: event.toolCall.name,
            input: (() => {
              try {
                return JSON.parse(event.toolCall!.arguments || "{}");
              } catch {
                return {};
              }
            })(),
            status: "pending",
          },
        };
        addMessage(toolMessage);
      } else if (event.type === "tool_result" && event.toolResult) {
        setSessionStatus("streaming");
        // Tool execution completed — update the tool message
        const toolMsgId = `tool_${event.toolResult.toolCallId}`;
        updateMessageToolCall(toolMsgId, {
          status: event.toolResult.isError ? "error" : "success",
          result: event.toolResult.result,
          error: event.toolResult.isError
            ? String(event.toolResult.result)
            : undefined,
          duration: event.toolResult.duration,
        });

        // §17: capture file artifacts from file-system MCP tool results.
        // Correlate by toolCallId — read tool name + input from the tool message.
        const conversationId = useChatStore.getState().currentConversationId;
        if (conversationId) {
          const toolMsg = useChatMessageStore
            .getState()
            .messages.find((m) => m.id === toolMsgId);
          if (toolMsg?.toolCall) {
            const { artifacts, changeSets } =
              captureFileArtifactsFromToolResult({
                conversationId,
                messageId: toolMsgId,
                toolCallId: event.toolResult.toolCallId,
                toolName: toolMsg.toolCall.name,
                toolInput: toolMsg.toolCall.input,
                toolResult: event.toolResult.result,
                isError: Boolean(event.toolResult.isError),
              });
            if (artifacts.length > 0) {
              useFileArtifactStore.getState().addArtifacts(artifacts);
            }
            for (const cs of changeSets) {
              useFileArtifactStore.getState().addChangeSet(cs);
            }
          }
        }

        // After tool results, model will stream more — add a new assistant message
        const modelInfo = currentModelInfoRef.current;
        const assistantMessage: Message = {
          id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          metadata: modelInfo
            ? {
              model: modelInfo.model,
              providerPreset: modelInfo.providerPreset,
              providerName: modelInfo.providerName,
            }
            : undefined,
        };
        addMessage(assistantMessage);
      } else if (event.type === "tool_error" && event.toolError) {
        setSessionStatus("streaming");
        const toolMsgId = `tool_${event.toolError.toolCallId}`;
        updateMessageToolCall(toolMsgId, {
          status: "error",
          result: event.toolError.error,
          error:
            typeof event.toolError.error === "string"
              ? event.toolError.error
              : JSON.stringify(event.toolError.error),
          duration: event.toolError.duration,
        });

        const modelInfo = currentModelInfoRef.current;
        const assistantMessage: Message = {
          id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          metadata: modelInfo
            ? {
              model: modelInfo.model,
              providerPreset: modelInfo.providerPreset,
              providerName: modelInfo.providerName,
            }
            : undefined,
        };
        addMessage(assistantMessage);
      } else if (event.type === "tool_approval_request" && event.toolApproval) {
        // Update tool message to show inline approval UI
        const toolMsgId = `tool_${event.toolApproval.toolCallId}`;
        updateMessageToolCall(toolMsgId, {
          status: "awaiting_approval",
        });
      } else if (event.type === "tool_rejected" && event.toolResult) {
        // Update tool message to show rejection
        const toolMsgId = `tool_${event.toolResult.toolCallId}`;
        updateMessageToolCall(toolMsgId, {
          status: "error",
          error: String(event.toolResult.result),
        });
      } else if (event.type === "done") {
        // Persist the accumulated streaming content to the last message
        finalizeAssistantStreamContent();
        // Persist the complete assistant message to disk
        const currentConversationId =
          useChatStore.getState().currentConversationId;
        if (currentConversationId) {
          useChatMessageStore.getState().persistMessages();
        }

        // Store token usage and timing if available
        const allMessages = useChatMessageStore.getState().messages;
        const lastAssistant = allMessages[allMessages.length - 1];
        if (lastAssistant?.role === "assistant") {
          const outputTokens = event.usage?.outputTokens;
          const totalMs = event.timing?.totalMs;
          const tps =
            outputTokens && totalMs && totalMs > 0
              ? Math.round((outputTokens / totalMs) * 1000)
              : undefined;
          const modelInfo = currentModelInfoRef.current;
          updateMessageMetadata(lastAssistant.id, {
            model: modelInfo?.model,
            providerPreset: modelInfo?.providerPreset,
            providerName: modelInfo?.providerName,
            tokens: event.usage?.totalTokens,
            inputTokens: event.usage?.inputTokens,
            outputTokens: event.usage?.outputTokens,
            duration: totalMs,
            firstTokenMs: event.timing?.firstTokenMs,
            tokensPerSecond: tps,
          });
          // Also store input tokens on the preceding user message
          if (event.usage?.inputTokens) {
            const userMsg = [...allMessages]
              .reverse()
              .find((m) => m.role === "user" && m.id !== lastAssistant.id);
            if (userMsg) {
              updateMessageMetadata(userMsg.id, {
                inputTokens: event.usage.inputTokens,
              });
            }
          }
        }
        setSessionStatus("idle");
        clearAssistantStreamContent();
        currentRequestIdRef.current = null;
        clearWatchdog();
      } else if (event.type === "error") {
        message.error(`Stream error: ${event.error}`);
        setSessionStatus("idle");
        clearAssistantStreamContent();
        currentRequestIdRef.current = null;
        clearWatchdog();
      }
    });
    return unsubscribe;
  }, [
    addMessage,
    appendAssistantStreamChunk,
    clearAssistantStreamContent,
    finalizeAssistantStreamContent,
    setSessionStatus,
    updateLastMessage,
    updateMessageToolCall,
    updateMessageMetadata,
    message,
    kickWatchdog,
    clearWatchdog,
  ]);

  // Subscribe to Agent SDK stream events (separate channel from LLM events)
  useEffect(() => {
    const unsubscribe = agentSDKClient.onStreamEvent((event) => {
      // Only process events for the current request
      if (event.requestId !== currentRequestIdRef.current) return;
      // Only handle events when the current request is an Agent SDK request
      if (!isAgentSDKRequestRef.current) return;

      // 收到任意事件都给 watchdog 续命；终态分支下面各自再 clearWatchdog
      kickWatchdog();

      switch (event.type) {
        case "init": {
          agentLog.info("Agent SDK init event", {
            requestId: event.requestId,
            sessionId: event.sessionId,
            status: event.status,
          });
          if (event.sessionId) {
            agentSDKSessionIdRef.current = event.sessionId;
            // Tag the current assistant message with the session ID
            const msgs = useChatMessageStore.getState().messages;
            const lastAssistant = msgs[msgs.length - 1];
            if (lastAssistant?.role === "assistant") {
              updateMessageMetadata(lastAssistant.id, {
                agentSDKSessionId: event.sessionId,
              });
            }
            // E-1: 持久化到 SessionMeta（移到 SessionMeta.agentSDKSessionId）
            const convId = useChatStore.getState().currentConversationId;
            if (convId) {
              window.electron.sessions
                .updateMeta(convId, {
                  agentSDKSessionId: event.sessionId,
                })
                .catch(() => { });
            }
          }
          setSessionStatus("streaming");
          break;
        }

        case "chunk": {
          if (event.content) {
            if (useChatMessageStore.getState().sessionStatus === "preparing") {
              setSessionStatus("streaming");
            }
            if (!agentFirstChunkLoggedRef.current) {
              agentFirstChunkLoggedRef.current = true;
              agentLog.info("Agent SDK first chunk received", {
                requestId: event.requestId,
                chunkLength: event.content.length,
              });
            }
            appendAssistantStreamChunk(event.content);
          }
          break;
        }

        case "assistant": {
          // Full assistant message — update the last message with complete content
          if (event.content) {
            clearAssistantStreamContent();
            updateLastMessage(sanitizeAssistantContent(event.content));
          }
          // Update usage metadata if provided
          if (event.usage) {
            const msgs = useChatMessageStore.getState().messages;
            const lastAssistant = msgs[msgs.length - 1];
            if (lastAssistant?.role === "assistant") {
              updateMessageMetadata(lastAssistant.id, {
                inputTokens: event.usage.inputTokens,
                outputTokens: event.usage.outputTokens,
                // G-3: 用于上下文容量胶囊的累计缓存命中率统计
                cacheReadTokens: event.usage.cacheReadInputTokens,
                cacheCreationTokens: event.usage.cacheCreationInputTokens,
              });
            }
          }
          break;
        }

        case "tool_call": {
          if (!event.toolCall) break;
          agentLog.info("Agent SDK tool_call event", {
            requestId: event.requestId,
            toolUseId: event.toolCall.id,
            name: event.toolCall.name,
            kind: event.toolCall.kind,
          });
          finalizeAssistantStreamContent();
          clearAssistantStreamContent();
          setSessionStatus("tool_calling");
          upsertToolMessage(
            event.toolCall.id,
            {
              name: event.toolCall.name,
              input: event.toolCall.input || {},
              status: "pending",
              approval: {
                kind: event.toolCall.kind,
                title: event.toolCall.title,
                description: event.toolCall.description,
                displayName: event.toolCall.displayName,
              },
            },
            event.toolCall.displayName ||
            event.toolCall.title ||
            `Tool call: ${event.toolCall.name}`,
          );
          break;
        }

        case "tool_use_summary": {
          // Finalize any accumulated streaming content
          finalizeAssistantStreamContent();
          clearAssistantStreamContent();

          setSessionStatus("tool_calling");

          if (event.precedingToolUseIds?.length) {
            for (const toolUseId of event.precedingToolUseIds) {
              const messageId = `tool_${toolUseId}`;
              const existing = useChatMessageStore
                .getState()
                .messages.find((m) => m.id === messageId);
              if (existing?.toolCall) {
                updateMessageToolCall(messageId, {
                  status: "success",
                  result: event.toolSummary || "Tool execution",
                });
              }
            }
          } else {
            const toolId = `agent_tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            upsertToolMessage(
              toolId,
              {
                name: event.toolSummary?.split("(")[0]?.trim() || "tool",
                input: {},
                status: "success",
                result: event.toolSummary || "Tool execution",
              },
              event.toolSummary || "Tool execution",
            );
          }

          // Add a new empty assistant message for the next stream
          const modelInfo = currentModelInfoRef.current;
          const nextAssistant: Message = {
            id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            metadata: modelInfo
              ? {
                model: modelInfo.model,
                providerPreset: modelInfo.providerPreset,
                providerName: modelInfo.providerName,
              }
              : undefined,
          };
          addMessage(nextAssistant);
          setSessionStatus("streaming");
          break;
        }

        case "tool_error": {
          if (!event.toolError) break;
          upsertToolMessage(
            event.toolError.id,
            {
              name: event.toolError.name,
              input: event.toolError.input || {},
              status: "error",
              result: event.toolError.error,
              error:
                typeof event.toolError.error === "string"
                  ? event.toolError.error
                  : JSON.stringify(event.toolError.error),
              approval: {
                kind: event.toolError.kind,
                title: event.toolError.title,
                description: event.toolError.description,
                displayName: event.toolError.displayName,
              },
            },
            `Tool error: ${event.toolError.displayName || event.toolError.name}`,
          );
          setSessionStatus("streaming");
          break;
        }

        case "permission_request": {
          if (!event.permissionRequest) break;
          agentLog.info("Agent SDK permission_request event", {
            requestId: event.requestId,
            toolUseId: event.permissionRequest.toolUseId,
            toolName: event.permissionRequest.toolName,
          });

          // Finalize any accumulated streaming content
          finalizeAssistantStreamContent();
          clearAssistantStreamContent();

          setSessionStatus("tool_calling");

          const perm = event.permissionRequest;
          upsertToolMessage(
            perm.toolUseId,
            {
              name: perm.toolName,
              input: perm.toolInput || {},
              status: "awaiting_approval",
              approval: {
                kind:
                  perm.toolName === "AskUserQuestion"
                    ? "ask-user-question"
                    : "permission",
                title: perm.title,
                description: perm.description,
                displayName: perm.displayName,
                suggestions: perm.suggestions,
                blockedPath: perm.blockedPath,
                decisionReason: perm.decisionReason,
                agentId: perm.agentId,
              },
            },
            `Permission required: ${perm.displayName || perm.toolName}`,
          );
          break;
        }

        case "permission_denied": {
          if (!event.toolCall) break;
          upsertToolMessage(
            event.toolCall.id,
            {
              name: event.toolCall.name,
              input: event.toolCall.input || {},
              status: "error",
              error: event.error || "Permission denied",
              approval: {
                kind: "permission",
                title: event.toolCall.title,
                description: event.toolCall.description,
                displayName: event.toolCall.displayName,
              },
            },
            `Permission denied: ${event.toolCall.displayName || event.toolCall.name}`,
          );
          break;
        }

        case "result": {
          agentLog.info("Agent SDK result event", {
            requestId: event.requestId,
            success: event.result?.success,
            textLength: event.result?.text?.length ?? 0,
            numTurns: event.result?.numTurns,
            stopReason: event.result?.stopReason,
          });
          // Finalize streaming content
          const msgs = useChatMessageStore.getState().messages;
          const lastAssistant = [...msgs]
            .reverse()
            .find((m) => m.role === "assistant");
          if (streamContentRef.current) {
            finalizeAssistantStreamContent();
          } else if (
            event.result?.text &&
            lastAssistant &&
            !lastAssistant.content.trim()
          ) {
            updateLastMessage(sanitizeAssistantContent(event.result.text));
          }

          // Update metadata with final result data
          if (event.result) {
            if (lastAssistant) {
              updateMessageMetadata(lastAssistant.id, {
                duration: event.result.durationMs,
                totalCostUsd: event.result.totalCostUsd,
                numTurns: event.result.numTurns,
                inputTokens: event.result.usage?.inputTokens,
                outputTokens: event.result.usage?.outputTokens,
                // G-3: prompt-cache 统计
                cacheReadTokens: event.result.usage?.cacheReadInputTokens,
                cacheCreationTokens:
                  event.result.usage?.cacheCreationInputTokens,
                tokens:
                  (event.result.usage?.inputTokens || 0) +
                  (event.result.usage?.outputTokens || 0),
              });
            }
          }

          // Persist messages
          const convId = useChatStore.getState().currentConversationId;
          if (convId) useChatMessageStore.getState().persistMessages();

          // Reset state
          setSessionStatus("idle");
          clearAssistantStreamContent();
          currentRequestIdRef.current = null;
          isAgentSDKRequestRef.current = false;
          clearWatchdog();
          break;
        }

        case "error": {
          const errorText = event.error || "Agent execution failed";
          agentLog.error("Agent SDK error event", undefined, {
            requestId: event.requestId,
            error: errorText,
          });
          message.error(`Agent error: ${errorText}`);
          // Finalize any partial content
          const partial = sanitizeAssistantContent(streamContentRef.current);
          updateLastAssistantContent(
            partial
              ? `${partial}\n\nAgent error: ${errorText}`
              : `Agent error: ${errorText}`,
          );
          setSessionStatus("idle");
          clearAssistantStreamContent();
          currentRequestIdRef.current = null;
          isAgentSDKRequestRef.current = false;
          clearWatchdog();
          break;
        }

        case "rate_limit": {
          message.warning(`Rate limited: ${event.error || "Please wait..."}`);
          break;
        }

        case "status": {
          console.debug("[useChat] Agent SDK status:", event.status);
          agentLog.info("Agent SDK status event", {
            requestId: event.requestId,
            status: event.status,
          });
          if (
            event.status &&
            !streamContentRef.current &&
            useChatMessageStore
              .getState()
              .messages.filter((m) => m.role === "assistant")
              .at(-1)
              ?.content.trim() === ""
          ) {
            setStreamingContent(event.status);
          }
          break;
        }
      }
    });
    return unsubscribe;
  }, [
    addMessage,
    appendAssistantStreamChunk,
    clearAssistantStreamContent,
    finalizeAssistantStreamContent,
    setSessionStatus,
    setStreamingContent,
    upsertToolMessage,
    updateLastMessage,
    updateLastAssistantContent,
    updateMessageToolCall,
    updateMessageMetadata,
    message,
    kickWatchdog,
    clearWatchdog,
  ]);

  /**
   * Send message in direct chat mode (via IPC to main process)
   * Automatically includes MCP tools when servers are connected.
   */
  const sendDirectMessage = useCallback(
    async (
      content: string,
      options?: {
        searchEngine?: string;
        searchConfigs?: SearchConfig[];
        attachmentIds?: string[];
      },
    ) => {
      // R-2: pull model from main-process resolver (authoritative); fall
      // back to renderer-local resolution on transient IPC failure.
      const active = await resolveActiveProviderModel();
      if (!active) {
        message.error(
          "No active model selected. Please configure a model in Settings → Models.",
        );
        return;
      }

      const { provider, model } = active;
      currentModelInfoRef.current = {
        model: model.id,
        providerPreset: provider.preset,
        providerName: provider.name,
      };

      setSessionStatus("preparing");
      clearAssistantStreamContent();
      armWatchdog();

      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      currentRequestIdRef.current = requestId;
      agentFirstChunkLoggedRef.current = false;
      agentLog.info("Agent send requested", {
        requestId,
        contentLength: content.length,
        hasResumeSession: Boolean(agentSDKSessionIdRef.current),
      });

      try {
        // Read latest messages from store (not closure) to handle retry correctly
        const currentMessages = useChatMessageStore.getState().messages;
        let chatHistory = currentMessages
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              m.content.length > 0,
          )
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        // Apply context count limit
        if (
          sessionSettings.contextCount !== -1 &&
          chatHistory.length > sessionSettings.contextCount
        ) {
          chatHistory = chatHistory.slice(-sessionSettings.contextCount);
        }

        const history: Array<{
          role: "user" | "assistant" | "system";
          content: string;
        }> = chatHistory;

        // Inject system prompt: session override > model custom > global default
        const envInfo = await getEnvInfoForPrompt();
        console.debug("[useChat] System prompt cwd:", envInfo?.cwd);
        const baseSystemPrompt = sessionSettings.systemPrompt
          ? sessionSettings.systemPrompt
          : model.systemPrompt;
        // Build system prompt
        const systemPrompt = buildSystemPrompt(baseSystemPrompt, envInfo, {
          name: model.name,
          id: model.id,
        });
        history.unshift({
          role: "system",
          content: systemPrompt,
        });

        // Search augmentation: if a search engine is selected, execute search and prepend results
        console.log("[useChat] Search trigger check:", {
          searchEngine: options?.searchEngine,
          hasConfigs: !!options?.searchConfigs?.length,
        });
        if (options?.searchEngine && options.searchConfigs) {
          const searchConfig = options.searchConfigs.find(
            (c) => c.provider === options.searchEngine && c.enabled,
          );
          if (searchConfig) {
            try {
              const searchResult = await searchService.execute({
                provider: searchConfig.provider,
                query: content,
                apiKey: searchConfig.apiKey,
                apiUrl: searchConfig.apiUrl,
                maxResults: 5,
                config: searchConfig.config,
              });
              if (
                searchResult.success &&
                searchResult.data &&
                searchResult.data.results.length > 0
              ) {
                const searchContext = searchResult.data.results
                  .map(
                    (r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`,
                  )
                  .join("\n\n");
                // Insert after system prompt (index 0) so global prompt stays first
                history.splice(1, 0, {
                  role: "system",
                  content: `The following are web search results for the user's query "${content}" (searched via ${searchResult.data.provider} in ${searchResult.data.searchTimeMs}ms). Use these results to provide an informed, up-to-date response. Cite sources when relevant.\n\n${searchContext}`,
                });
              }
            } catch (searchError) {
              console.warn(
                "[useChat] Search failed, continuing without search results:",
                searchError,
              );
              message.warning(
                t("searchEngine.searchFailed", {
                  ns: "chat",
                  error:
                    searchError instanceof Error
                      ? searchError.message
                      : t("searchEngine.unknownError", { ns: "chat" }),
                }),
              );
            }
          }
        }

        // Fetch MCP tools for function calling (skip if permission mode is "none")
        const isToolsDisabled = sessionSettings.toolPermissionMode === "none";
        const mcpResult = isToolsDisabled
          ? { toolHint: "" }
          : await fetchMcpTools();

        // Fetch all enabled skill tools and merge with MCP tools
        const skillResult = isToolsDisabled
          ? { tools: [], toolMapping: {} }
          : await fetchAllSkillTools();

        const tools = isToolsDisabled
          ? undefined
          : [...(mcpResult.tools || []), ...skillResult.tools];
        const toolMapping = isToolsDisabled
          ? undefined
          : { ...(mcpResult.toolMapping || {}), ...skillResult.toolMapping };
        if (mcpResult.toolHint) {
          history[0].content += mcpResult.toolHint;
        }

        const toolPermission = isToolsDisabled
          ? undefined
          : {
            mode: sessionSettings.toolPermissionMode,
            authorizedTools: sessionSettings.authorizedTools,
          };

        // §14: resolve attachments and prefix their content into the
        // last user message ONLY for the model — leave the message
        // stored in chatStore untouched so the UI stays clean.
        const convForAttach = useChatStore.getState().currentConversationId;
        if (
          options?.attachmentIds &&
          options.attachmentIds.length > 0 &&
          convForAttach
        ) {
          try {
            const resolveRes = await attachmentResolverService.resolveContext({
              conversationId: convForAttach,
              attachmentIds: options.attachmentIds,
            });
            if (resolveRes.success && resolveRes.data?.length) {
              const fragments: string[] = [];
              for (const block of resolveRes.data) {
                if (block.resolution === "text") {
                  const truncAttr = block.truncated ? ' truncated="true"' : "";
                  fragments.push(
                    `<attachment file="${block.fileName}"${truncAttr}>\n${block.text ?? ""}\n</attachment>`,
                  );
                } else {
                  fragments.push(
                    `<attachment-ref file="${block.fileName}" size="${block.size}" mimeType="${block.mimeType ?? "?"}" />`,
                  );
                }
              }
              if (fragments.length > 0) {
                const prefix = `--- 附件内容 ---\n${fragments.join("\n\n")}\n`;
                // Find last user turn in history (which currently
                // ends with the user message we just added) and
                // prepend the prefix to its content.
                for (let i = history.length - 1; i >= 0; i--) {
                  if (history[i].role === "user") {
                    history[i] = {
                      role: "user",
                      content: `${prefix}${history[i].content}`,
                    };
                    break;
                  }
                }
              }
            }
          } catch (resolveErr) {
            console.warn(
              "[useChat] attachment resolveContext failed, sending without prefix:",
              resolveErr,
            );
          }
        }

        await modelService.chatCompletion({
          requestId,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: model.id,
          messages: history,
          tools: tools && tools.length > 0 ? tools : undefined,
          toolMapping:
            toolMapping && Object.keys(toolMapping).length > 0
              ? toolMapping
              : undefined,
          toolPermission,
          toolCallMode:
            sessionSettings.toolCallMode === "prompt" ||
              !model.capabilities?.includes("tool_use")
              ? "prompt"
              : "function",
          temperature: sessionSettings.temperatureEnabled
            ? sessionSettings.temperature
            : undefined,
          maxTokens: sessionSettings.maxTokens,
          topP: sessionSettings.topPEnabled ? sessionSettings.topP : undefined,
          stream: sessionSettings.streamingEnabled,
          providerPreset: provider.preset,
          extraParams: parseCustomParams(sessionSettings.customParams),
          conversationId:
            useChatStore.getState().currentConversationId ?? undefined,
          toolTimeout: sessionSettings.toolTimeout,
        });
      } catch (error: unknown) {
        console.error("[useChat] Failed to send direct message:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`Error: ${errorMsg}`);
        setSessionStatus("idle");
        clearAssistantStreamContent();
        currentRequestIdRef.current = null;
      }
    },
    [
      message,
      setSessionStatus,
      clearAssistantStreamContent,
      resolveActiveProviderModel,
      sessionSettings,
      armWatchdog,
    ],
  );

  /**
   * Send message using Agent mode (via Agent SDK)
   * Delegates to AgentSDKService which handles multi-turn tool execution,
   * session management, and streaming internally.
   */
  const sendAgentMessage = useCallback(
    async (
      content: string,
      _agentId?: string,
      options?: {
        searchEngine?: string;
        searchConfigs?: SearchConfig[];
        attachmentIds?: string[];
      },
    ) => {
      isAgentSDKRequestRef.current = false;

      setSessionStatus("preparing");
      clearAssistantStreamContent();
      armWatchdog();

      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      currentRequestIdRef.current = requestId;

      try {
        // Get workspace cwd for the current conversation
        const convId = useChatStore.getState().currentConversationId;
        let cwd: string | undefined;
        let envInfo: EnvInfo | undefined;
        if (convId) {
          try {
            envInfo = await getEnvInfoForPrompt();
            cwd = envInfo?.workspaceDir;
          } catch {
            // non-fatal
          }
        }

        // Gather connected MCP server IDs
        const connectedServers = useMcpStore.getState().getConnectedServers();
        const mcpServerNames = connectedServers.map((s) => s.id);
        agentLog.info("Agent context resolved", {
          requestId,
          conversationId: convId,
          cwd,
          connectedMcpCount: mcpServerNames.length,
          mcpServerNames,
        });

        // 模型解析优先级（与 getEffectiveModel 一致）：
        //   session.modelOverride  >  project.defaultModel  >  全局 active model
        //
        // Agent SDK 走 Anthropic 协议，但底层 base_url 可以是第三方网关
        // （DashScope `/compatible-mode` 跑 qwen、OpenRouter 跑任意模型 …）。
        // 这里**不**按 provider.preset 过滤——信任用户的选择，透传 model.id；
        // 上游网关识不识别由它自己决定，错了 SDK 会回 error stream event，
        // sniffer 会把失败原因落到 trace 里。
        //
        // 没有任何 override 时不传，让 SDK 走 Agent Settings 默认 → provider
        // agentModel → hardcoded fallback 链。
        const effective = await resolveActiveProviderModel();
        const overrideModelId = effective?.model.id;
        const projectIdForLog =
          getProjectIdFromConversation(currentConversation);
        const projectDefault = projectIdForLog
          ? useProjectStore.getState().settingsByProject[projectIdForLog]
            ?.defaultModel
          : undefined;
        const resolutionSource = sessionModelOverride
          ? "session"
          : projectDefault
            ? "project"
            : effective
              ? "global"
              : "agent-settings-default";
        console.info(
          `[useChat] agent model resolution: source=${resolutionSource} provider=${effective?.provider.preset ?? "(none)"} model=${effective?.model.id ?? "(fallback to SDK)"}`,
        );
        agentLog.info("Agent model resolved", {
          requestId,
          resolutionSource,
          providerId: effective?.provider.id,
          providerName: effective?.provider.name,
          providerPreset: effective?.provider.preset,
          modelId: effective?.model.id,
          hasProviderApiKey: Boolean(effective?.provider.apiKey),
          hasProviderBaseUrl: Boolean(effective?.provider.baseUrl),
        });
        currentModelInfoRef.current = {
          model: effective?.model.id ?? "agent",
          providerPreset: effective?.provider.preset ?? "anthropic",
          providerName: effective?.provider.name ?? "Agent SDK",
        };

        if (effective && !isClaudeAgentModel(effective.model.id)) {
          agentLog.info("Agent routed to local LLM loop", {
            requestId,
            model: effective.model.id,
            providerId: effective.provider.id,
            providerPreset: effective.provider.preset,
            modelToolUse: effective.model.capabilities?.includes("tool_use"),
          });
          await sendDirectMessage(content, options);
          return;
        }

        isAgentSDKRequestRef.current = true;

        const baseSystemPrompt = sessionSettings.systemPrompt
          ? sessionSettings.systemPrompt
          : effective?.model.systemPrompt;

        // 构建系统提示词，注入环境信息（如工作目录、已连接的 MCP 服务器等）
        const customSystemPrompt = buildSystemPrompt(baseSystemPrompt, envInfo, {
          name: effective?.model.name,
          id: effective?.model.id,
        });

        // Build agents map from selected team (Multi-Agent)
        let agents:
          | Record<
            string,
            {
              description: string;
              prompt: string;
              tools?: string[];
              disallowedTools?: string[];
              model?: string;
              maxTurns?: number;
            }
          >
          | undefined;
        const teamId = useChatStore.getState().selectedTeamId;
        if (teamId) {
          try {
            const [profiles, teams] = await Promise.all([
              agentSDKClient.getAgentProfiles(),
              agentSDKClient.getAgentTeams(),
            ]);
            const team = teams.find((t) => t.id === teamId);
            if (team && team.agents.length > 0) {
              agents = {};
              for (const profileId of team.agents) {
                const profile = profiles.find((p) => p.id === profileId);
                if (profile) {
                  agents[profile.name] = {
                    description: profile.description,
                    prompt: profile.prompt,
                    tools: profile.tools,
                    disallowedTools: profile.disallowedTools,
                    model: profile.model,
                    maxTurns: profile.maxTurns,
                  };
                }
              }
              if (Object.keys(agents).length === 0) agents = undefined;
            }
          } catch {
            // non-fatal: proceed without agents
          }
        }

        agentLog.info("Agent createQuery IPC start", {
          requestId,
          conversationId: convId,
          model: overrideModelId,
          providerId: effective?.provider.id,
          hasSystemPrompt: Boolean(customSystemPrompt.trim()),
          resumeSessionId: agentSDKSessionIdRef.current ?? undefined,
          mcpServerCount: mcpServerNames.length,
        });
        await agentSDKClient.createQuery(requestId, {
          prompt: content,
          sessionId: convId ?? undefined,
          cwd,
          model: overrideModelId,
          providerId: effective?.provider.id,
          systemPrompt: customSystemPrompt,
          resumeSessionId: agentSDKSessionIdRef.current ?? undefined,
          persistSession: true,
          includePartialMessages: true,
          mcpServerNames:
            mcpServerNames.length > 0 ? mcpServerNames : undefined,
          maxTurns: sessionSettings.maxTokens ? undefined : undefined,
          permissionMode: "default",
          agents,
        });
        agentLog.info("Agent createQuery IPC accepted", { requestId });
      } catch (error: unknown) {
        console.error("[useChat] Failed to send agent message:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        agentLog.error(
          "Agent createQuery IPC failed",
          error instanceof Error ? error : undefined,
          { requestId, error: errorMsg },
        );
        message.error(`Error: ${errorMsg}`);
        updateLastAssistantContent(`Agent error: ${errorMsg}`);
        setSessionStatus("idle");
        clearAssistantStreamContent();
        currentRequestIdRef.current = null;
        isAgentSDKRequestRef.current = false;
      }
    },
    [
      message,
      setSessionStatus,
      clearAssistantStreamContent,
      sessionSettings,
      currentConversation,
      sessionModelOverride,
      resolveActiveProviderModel,
      sendDirectMessage,
      updateLastAssistantContent,
      armWatchdog,
    ],
  );

  /**
   * Send message in skill mode (LLM streaming with skill systemPrompt injection)
   */
  const sendSkillMessage = useCallback(
    async (content: string, skillId?: string, commandName?: string) => {
      if (!skillId) {
        message.error(t("noSkillSelected", { ns: "chat" }));
        return;
      }

      // R-2: pull model from main-process resolver (authoritative).
      const active = await resolveActiveProviderModel();
      if (!active) {
        message.error(
          "No active model selected. Please configure a model in Settings → Models.",
        );
        return;
      }

      const { provider, model } = active;
      currentModelInfoRef.current = {
        model: model.id,
        providerPreset: provider.preset,
        providerName: provider.name,
      };

      // 获取提示词: command prompt > skill system prompt
      let skillSystemPrompt: string | null = null;
      try {
        if (commandName) {
          skillSystemPrompt = await skillClient.getCommandPrompt(
            skillId,
            commandName,
          );
        }
        if (!skillSystemPrompt) {
          skillSystemPrompt = await skillClient.getSystemPrompt(skillId);
        }
      } catch {
        console.warn("[useChat] Failed to load skill/command prompt");
      }

      setSessionStatus("preparing");
      clearAssistantStreamContent();
      armWatchdog();

      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      currentRequestIdRef.current = requestId;

      try {
        const currentMessages = useChatMessageStore.getState().messages;
        let chatHistory = currentMessages
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              m.content.length > 0,
          )
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        // Apply context count limit
        if (
          sessionSettings.contextCount !== -1 &&
          chatHistory.length > sessionSettings.contextCount
        ) {
          chatHistory = chatHistory.slice(-sessionSettings.contextCount);
        }

        const history: {
          role: "user" | "assistant" | "system";
          content: string;
        }[] = chatHistory;

        // 构建系统提示词: 会话自定义 > 模型自定义 > 全局默认 + 环境上下文 + Skill 上下文
        const envInfo = await getEnvInfoForPrompt();
        const baseSkillPrompt = sessionSettings.systemPrompt
          ? sessionSettings.systemPrompt
          : model.systemPrompt;
        // 构建系统提示词，注入环境信息（如工作目录、已连接的 MCP 服务器等）
        const basePrompt = buildSystemPrompt(baseSkillPrompt, envInfo, {
          name: model.name,
          id: model.id,
        });
        const systemPrompt = skillSystemPrompt
          ? `${basePrompt}\n\n--- Skill Context ---\n${skillSystemPrompt}`
          : basePrompt;

        history.unshift({
          role: "system",
          content: systemPrompt,
        });

        // Fetch MCP tools for function calling (skip if permission mode is "none")
        const isToolsDisabled = sessionSettings.toolPermissionMode === "none";
        const mcpResult = isToolsDisabled
          ? { toolHint: "" }
          : await fetchMcpTools();

        // Fetch skill tools and merge with MCP tools
        const skillToolsResult =
          skillId && !isToolsDisabled
            ? await fetchSkillTools(skillId)
            : { tools: [], toolMapping: {} };

        const tools = isToolsDisabled
          ? undefined
          : [...(mcpResult.tools || []), ...skillToolsResult.tools];
        const toolMapping = isToolsDisabled
          ? undefined
          : {
            ...(mcpResult.toolMapping || {}),
            ...skillToolsResult.toolMapping,
          };

        if (mcpResult.toolHint) {
          history[0].content += mcpResult.toolHint;
        }

        const toolPermission = isToolsDisabled
          ? undefined
          : {
            mode: sessionSettings.toolPermissionMode,
            authorizedTools: sessionSettings.authorizedTools,
          };

        await modelService.chatCompletion({
          requestId,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: model.id,
          messages: history,
          tools: tools && tools.length > 0 ? tools : undefined,
          toolMapping:
            toolMapping && Object.keys(toolMapping).length > 0
              ? toolMapping
              : undefined,
          toolPermission,
          toolCallMode:
            sessionSettings.toolCallMode === "prompt" ||
              !model.capabilities?.includes("tool_use")
              ? "prompt"
              : "function",
          temperature: sessionSettings.temperatureEnabled
            ? sessionSettings.temperature
            : undefined,
          maxTokens: sessionSettings.maxTokens,
          topP: sessionSettings.topPEnabled ? sessionSettings.topP : undefined,
          stream: sessionSettings.streamingEnabled,
          providerPreset: provider.preset,
          extraParams: parseCustomParams(sessionSettings.customParams),
          conversationId:
            useChatStore.getState().currentConversationId ?? undefined,
          toolTimeout: sessionSettings.toolTimeout,
        });
      } catch (error: unknown) {
        console.error("[useChat] Failed to send skill message:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`Error: ${errorMsg}`);
        setSessionStatus("idle");
        clearAssistantStreamContent();
        currentRequestIdRef.current = null;
      }
    },
    [
      message,
      setSessionStatus,
      clearAssistantStreamContent,
      resolveActiveProviderModel,
      sessionSettings,
      armWatchdog,
    ],
  );

  /**
   * Retry a message – resend from a given user or assistant message
   */
  const retryMessage = useCallback(
    async (messageId: string) => {
      const allMessages = useChatMessageStore.getState().messages;
      const idx = allMessages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const target = allMessages[idx];
      let userContent: string;

      if (target.role === "user") {
        userContent = target.content;
        // Delete everything from this user message onward (inclusive)
        deleteMessagesFrom(messageId);
      } else if (target.role === "assistant") {
        // Find the preceding user message
        const precedingUser = allMessages
          .slice(0, idx)
          .reverse()
          .find((m) => m.role === "user");
        if (!precedingUser) return;
        userContent = precedingUser.content;
        // Delete from the preceding user message onward
        deleteMessagesFrom(precedingUser.id);
      } else {
        return;
      }

      // Re-add user message + empty assistant message, then send
      const userMessage: Message = {
        id: `user_${Date.now()}`,
        role: "user",
        content: userContent,
        timestamp: Date.now(),
      };
      addMessage(userMessage);

      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        metadata: {
          model: "agent",
          providerPreset: "anthropic",
          providerName: "Agent SDK",
        },
      };
      addMessage(assistantMessage);

      await sendAgentMessage(userContent);
    },
    [addMessage, deleteMessagesFrom, sendAgentMessage],
  );

  /**
   * Edit a user message – populate input and mark for editing.
   * Messages are only truncated when the user actually sends the edited content.
   */
  const editMessage = useCallback(
    (messageId: string) => {
      const allMessages = useChatMessageStore.getState().messages;
      const target = allMessages.find((m) => m.id === messageId);
      if (!target || target.role !== "user") return;

      editingMessageIdRef.current = messageId;
      setInput(target.content);
    },
    [setInput],
  );

  /**
   * Main send message function
   */
  const sendMessage = useCallback(
    async (options?: ChatOptions) => {
      const content = (options?.content ?? input).trim();
      if (!content) return;

      const mode: ChatMode = "agent";

      // If editing a previous message, truncate from that point first
      if (editingMessageIdRef.current) {
        deleteMessagesFrom(editingMessageIdRef.current);
        editingMessageIdRef.current = null;
      }

      // Guard: conversation must exist (eager-created by handleNewConversation)
      const { currentConversationId: convId } = useChatStore.getState();
      if (!convId) return;

      // Persist chatMode to conversation metadata if changed
      const conv = useChatStore
        .getState()
        .conversations.find((c) => c.id === convId);
      if (conv?.chatMode !== mode) {
        useChatStore
          .getState()
          .updateConversationMetadata(convId, { chatMode: mode })
          .catch(() => { });
      }

      // Auto-name conversation from first user message: take first 15 chars
      // when the title is still a default placeholder.
      if (conv && (conv.name === "新对话" || conv.name === "远端对话")) {
        const autoName = content.replace(/\s+/g, " ").trim().slice(0, 15);
        if (autoName) {
          useChatStore
            .getState()
            .renameConversation(convId, autoName)
            .catch(() => { });
        }
      }

      const userMessage: Message = {
        id: `user_${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
        metadata: options?.attachmentIds?.length
          ? { attachmentIds: options.attachmentIds }
          : undefined,
      };
      addMessage(userMessage);
      setInput("");

      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        metadata: {
          model: "agent",
          providerPreset: "anthropic",
          providerName: "Agent SDK",
        },
      };
      addMessage(assistantMessage);

      // Slash command / skill overlay: if a skill (and optional command) is
      // selected — either via the slash panel state or explicitly in options —
      // route through sendSkillMessage so the skill / command systemPrompt is
      // injected. Otherwise fall through to the default agent path.
      //
      // 历史回归：0cb21a9 重构把 ChatMode 收敛为 "agent" 时，把 sendSkillMessage
      // 这一支顺手删了，但 slash 面板这一侧仍在更新 selectedSkillId /
      // selectedCommandName。结果就是"选了 /xxx 但发出去等于什么都没发"。
      const effectiveSkillId =
        options?.skillId || selectedSkillId || undefined;
      const effectiveCommandName =
        options?.commandName || selectedCommandName || undefined;

      if (effectiveSkillId) {
        await sendSkillMessage(
          content,
          effectiveSkillId,
          effectiveCommandName,
        );
        // One-shot semantics: clear after dispatch so the next message goes
        // back to the default agent path unless the user picks again.
        setSelectedCommandName(null);
        return;
      }

      await sendAgentMessage(
        content,
        options?.agentId || selectedAgentId || undefined,
        {
          searchEngine: options?.searchEngine,
          searchConfigs: options?.searchConfigs,
          attachmentIds: options?.attachmentIds,
        },
      );
    },
    [
      input,
      selectedAgentId,
      selectedSkillId,
      selectedCommandName,
      addMessage,
      deleteMessagesFrom,
      sendAgentMessage,
      sendSkillMessage,
      setSelectedCommandName,
    ],
  );

  const stopCurrentStream = useCallback(() => {
    // 1) Snapshot 当前请求并立即清 ref —— 让任何后续到达的 stream-event
    //    在订阅入口 `event.requestId !== currentRequestIdRef.current` 即 bail，
    //    避免在 setSessionStatus("idle") 之后被某个 case 重新切回 streaming。
    const reqId = currentRequestIdRef.current;
    const wasAgent = isAgentSDKRequestRef.current;
    currentRequestIdRef.current = null;
    isAgentSDKRequestRef.current = false;

    // 2) Best-effort interrupt —— 任何抛错都不能挡住下面的 UI 重置。
    if (reqId) {
      try {
        if (wasAgent) {
          agentSDKClient.interruptQuery(reqId).catch((err) => {
            console.error("[useChat] interruptQuery failed:", err);
          });
        } else {
          const r = modelService.stopStream(reqId) as unknown as
            | Promise<unknown>
            | undefined;
          if (r && typeof (r as Promise<unknown>).catch === "function") {
            (r as Promise<unknown>).catch((err) => {
              console.error("[useChat] stopStream failed:", err);
            });
          }
        }
      } catch (err) {
        console.error("[useChat] stop call threw:", err);
      }
    }

    // 3) 直接走 store.getState() 强制重置 —— 绕过任何潜在的 stale closure /
    //    React 渲染时序，确保「回复中」一定立刻消失。
    const store = useChatMessageStore.getState();
    if (streamFlushRafRef.current !== null) {
      cancelAnimationFrame(streamFlushRafRef.current);
      streamFlushRafRef.current = null;
    }
    if (streamContentRef.current) {
      store.updateLastMessage(sanitizeAssistantContent(streamContentRef.current));
    }
    streamContentRef.current = "";
    store.setStreamingContent("");
    store.setSessionStatus("idle");
    clearWatchdog();

    // 4) Persist messages
    const currentConversationId = useChatStore.getState().currentConversationId;
    if (currentConversationId) {
      store.persistMessages();
    }
  }, [clearWatchdog]);

  useEffect(() => {
    window.addEventListener("chat:stop-current-stream", stopCurrentStream);
    return () => {
      window.removeEventListener("chat:stop-current-stream", stopCurrentStream);
    };
  }, [stopCurrentStream]);

  return {
    // State
    messages,
    input,
    sessionStatus,
    isStreaming,
    selectedAgentId,
    selectedSkillId,
    selectedCommandName,
    sessionModelOverride,
    sessionSettings,
    availableTools,

    // Setters
    setInput,
    setSelectedAgentId,
    setSelectedSkillId,
    setSelectedCommandName,
    setSessionModelOverride,
    setSessionSettings,

    // Actions
    sendMessage,
    clearMessages,
    stopCurrentStream,
    retryMessage,
    editMessage,
    deleteMessage,
    getEffectiveModel,
    resolveEffectiveRuntime,
    respondToApproval,
  };
}
