import { App } from "antd";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionSettings } from "../components/chat/ChatSettingsModal";
import { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";
import {
  buildSystemPrompt,
  type EnvInfo,
} from "../prompt";
import { agentSDKClient } from "../services/agent/agentSDKService";
import { agentRuntimeClient } from "../services/agent/agentRuntimeClient";
import { mcpClient } from "../services/mcp/mcpService";
import { modelService } from "../services/modelService";
import { runtimeService } from "../services/runtimeService";
import { skillClient } from "../services/skill/skillService";
import { sanitizeAssistantContent } from "../lib/assistantContent";
import { createLogger } from "../services/logService";
import {
  getProjectIdFromConversation,
  useChatStore,
} from "../stores/chatStore";
import { useChatInputStore } from "../stores/chatInputStore";
import { type Message, useChatMessageStore } from "../stores/chatMessageStore";
import { useFileArtifactStore } from "../stores/fileArtifactStore";
import { useMcpStore } from "../stores/mcpStore";
import { useModelStore } from "../stores/modelStore";
import { useProjectStore } from "../stores/projectStore";
import type { ActiveModelSelection } from "../types/models";
import type { SearchConfig } from "../types/search";
import { buildAgentPromptWithContext } from "./agentPromptContext";
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

/**
 * Renderer-side pre-flight for the agent run.
 *
 * After the ClaudeCodeAgentRuntime / llm-loop swap (Phase D), agent calls
 * work with any provider+model the user has configured — the runtime
 * goes through unified LLMService.chatCompletion and supports OpenAI /
 * DashScope / DeepSeek / Anthropic / Gemini / etc.
 *
 * So the only thing the pre-flight needs to verify is "at least one
 * enabled provider exists and has an API key".
 */
function resolveAgentSdkIntent(
  providers: Array<{
    id: string;
    name: string;
    enabled?: boolean;
    apiKey?: string;
    preset?: string;
    models?: Array<{ id: string; name?: string; enabled?: boolean }>;
  }>,
):
  | { ok: true; providerName: string; modelId: string }
  | { ok: false; message: string } {
  const ready = providers.find((p) => p.enabled && p.apiKey);
  if (ready) {
    const firstEnabledModel = ready.models?.find(
      (m) => m.enabled !== false,
    );
    return {
      ok: true,
      providerName: ready.name,
      modelId: firstEnabledModel?.id ?? "default",
    };
  }
  return {
    ok: false,
    message:
      "未配置任何可用 Provider。请到「设置 → 模型」添加 Provider、填入 API Key 并启用至少一个模型。",
  };
}

/**
 * 将 serverId 转换为合法的 OpenAI 函数名前缀
 * OpenAI 要求: ^[a-zA-Z0-9_-]+$
 * 例如: "@scp/fetch" → "scp-fetch", "@mcp/browser" → "mcp-browser"
 */
function sanitizeServerId(serverId: string): string {
  return serverId.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
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
  const markMessageAsError = useChatMessageStore(
    (s) => s.markMessageAsError,
  );
  const applyAssistantPartEvent = useChatMessageStore(
    (s) => s.applyAssistantPartEvent,
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

  // Composer text lives in `useChatInputStore` (see store comment for the
  // perf rationale). We read it via `getState()` where we need a one-shot
  // snapshot (sendMessage fallback, conversation-name derivation) and write
  // via `getState().setValue / .clear` from the edit/send flows below. No
  // subscription here, so typing doesn't re-render `useChat`.
  const editingMessageIdRef = useRef<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedCommandName, setSelectedCommandName] = useState<string | null>(
    null,
  );

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

  // Available tools (builtin facade + MCP + active skill) for permission
  // settings UI. `source` lets the settings panel render section headers.
  const [availableTools, setAvailableTools] = useState<
    Array<{
      prefixedName: string;
      displayName: string;
      source: "builtin" | "mcp" | "skill";
    }>
  >([]);

  const respondToApproval = useCallback(
    async (
      toolCallId: string,
      approved: boolean,
      updatedInput?: Record<string, unknown>,
      updatedPermissions?: Array<Record<string, unknown>>,
    ) => {
      // Resume the stream watchdog — we're un-pausing now that the user
      // has decided. Re-arm a fresh 60s clock so we can still detect a
      // stuck post-submit roundtrip (e.g. main process never sending the
      // follow-up tool_result event, OpenRouter network hang, etc.).
      awaitingUserApprovalRef.current = false;
      if (
        useChatMessageStore.getState().sessionStatus !== "idle" &&
        currentRequestIdRef.current
      ) {
        kickWatchdog();
      }
      // Optimistic update: immediately reflect in UI
      const toolMsgId = `tool_${toolCallId}`;
      if (approved) {
        // AskUserQuestion belt-and-suspenders: also stash the answers on
        // `toolCall.approval.userAnswers`. The `tool_result` handler will
        // shallow-overwrite `toolCall.result` with whatever the main
        // process echoes back (which in some IPC paths arrives missing
        // the `answers` field), but it does NOT touch `approval`. The
        // read-only summary in `AskUserQuestionCard` prefers
        // `approval.userAnswers` first, falling back to `result.answers`
        // so this stays a no-op for the normal happy path.
        const existing = useChatMessageStore
          .getState()
          .messages.find((m) => m.id === toolMsgId);
        const existingApproval = existing?.toolCall?.approval;
        const askAnswers =
          updatedInput &&
          typeof updatedInput === "object" &&
          "answers" in updatedInput &&
          updatedInput.answers &&
          typeof updatedInput.answers === "object"
            ? (updatedInput.answers as Record<string, string>)
            : undefined;
        updateMessageToolCall(toolMsgId, {
          status: "pending",
          ...(updatedInput ? { result: updatedInput } : {}),
          ...(askAnswers
            ? {
                approval: {
                  ...(existingApproval ?? {}),
                  userAnswers: askAnswers,
                },
              }
            : {}),
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
          // `updatedInput` is currently only populated by the
          // AskUserQuestionCard submit (`{questions, answers}`). The
          // legacy approval/runtime-policy cards don't use it, so
          // passing it through unconditionally is safe.
          await window.electron.llm.toolApprovalResponse(
            toolCallId,
            approved,
            updatedInput,
          );
        }
      } catch (err) {
        console.error("[useChat] toolApprovalResponse failed:", err);
      }
    },
    [updateMessageToolCall],
  );

  // Fetch available tools list for settings UI
  useEffect(() => {
    const loadTools = async () => {
      const tools: Array<{
        prefixedName: string;
        displayName: string;
        source: "builtin" | "mcp" | "skill";
      }> = [];

      // 1) Builtin facade tools (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task)
      // injected by ClaudeCodeAgentRuntime. The LLM calls these by their bare
      // facade name (e.g. "Read"), so authorizedTools[] also stores the bare
      // name — no `serverId__tool` prefix.
      try {
        const builtinTools = await agentRuntimeClient.listBuiltinTools();
        for (const t of builtinTools) {
          tools.push({
            prefixedName: t.name,
            displayName: t.name,
            source: "builtin",
          });
        }
      } catch {
        // Builtin tools loading failure is non-fatal; user can still pre-auth MCP.
      }

      // 2) MCP tools (prefixed by sanitized serverId).
      try {
        const mcpTools = await mcpClient.getAllTools();
        for (const { serverId, tool } of mcpTools) {
          const safePrefix = sanitizeServerId(serverId);
          tools.push({
            prefixedName: `${safePrefix}__${tool.name}`,
            displayName: tool.name,
            source: "mcp",
          });
        }
      } catch {
        // MCP tool loading failure is non-fatal.
      }

      // 3) Active skill's tools (prefixed by `skill-{skillId}__`).
      if (selectedSkillId) {
        try {
          const skillTools = await skillClient.getAllTools();
          const filtered = skillTools.filter(
            (t) => t.skillId === selectedSkillId,
          );
          for (const { skillId, tool } of filtered) {
            tools.push({
              prefixedName: `skill-${skillId}__${tool.name}`,
              displayName: `${skillId}/${tool.name}`,
              source: "skill",
            });
          }
        } catch {
          // Skill tools loading failure is non-fatal
        }
      }

      setAvailableTools(tools);
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
    apiFormat?: "anthropic-messages" | "chat-completions" | "responses";
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
  /**
   * Watchdog is paused while we're blocked on user input (approval prompt
   * / `AskUserQuestion` card / runtime-policy decision). Without this
   * gate, a user who takes >60s to read & answer would trip the
   * "connection timed out" watchdog even though the stream is healthy
   * and main process is just waiting on `resolveToolApproval`. Set by
   * `tool_approval_request` arrival, cleared by `respondToApproval`.
   *
   * While true, `kickWatchdog()` no-ops so any spurious in-flight
   * stream events (rare but possible — e.g. a late `chunk` arriving
   * after the request flipped into approval-wait) can't restart the
   * timer.
   */
  const awaitingUserApprovalRef = useRef(false);
  const clearWatchdog = useCallback(() => {
    if (streamWatchdogRef.current) {
      clearTimeout(streamWatchdogRef.current);
      streamWatchdogRef.current = null;
    }
    // Also drop the pause flag so a new stream that re-uses this hook
    // instance doesn't inherit a stale "awaiting user" state from a
    // previous turn — terminal events, stopStream and unmount all funnel
    // through clearWatchdog().
    awaitingUserApprovalRef.current = false;
  }, []);

  /**
   * Convert the in-flight assistant placeholder into a `type:'error'`
   * Message so the ErrorCard renders in the chat list. Replaces the prior
   * toast + inline-text pattern. Used by:
   *   - LLM / Agent SDK stream `error` events (carry errorContext)
   *   - Watchdog timeout (no errorContext)
   *   - Pre-flight blockers (intent unresolved, IPC createQuery failure)
   * The triggering user prompt is located via positional walk-back — same
   * pattern used by the `done` branch's usage attribution.
   */
  const materializeStreamError = useCallback(
    (
      summary: string,
      errorContext?: import("@super-client/shared-types/chat").LLMErrorContext,
    ) => {
      const allMessages = useChatMessageStore.getState().messages;
      const lastAssistant = [...allMessages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (!lastAssistant) {
        // No bubble to attach to (pre-stream validation) — fall back to
        // a toast so the user still sees something.
        message.error(summary);
        return;
      }
      // Defensive: if the bubble was already converted into an error
      // message (via an earlier, richer event from the same request),
      // don't let a follow-up event with weaker context overwrite it —
      // e.g. a broker fallback `Bad Request` arriving after the
      // translator already shipped statusCode + responseBody + stack.
      const incomingRichness =
        Number(Boolean(errorContext?.statusCode !== undefined)) +
        Number(Boolean(errorContext?.responseBodySnippet)) +
        Number(Boolean(errorContext?.stack));
      const existingRichness =
        Number(
          Boolean(lastAssistant.metadata?.errorContext?.statusCode !== undefined),
        ) +
        Number(
          Boolean(lastAssistant.metadata?.errorContext?.responseBodySnippet),
        ) +
        Number(Boolean(lastAssistant.metadata?.errorContext?.stack));
      if (
        lastAssistant.type === "error" &&
        existingRichness >= incomingRichness
      ) {
        return;
      }
      const triggeringUser = [...allMessages]
        .slice(
          0,
          allMessages.findIndex((m) => m.id === lastAssistant.id),
        )
        .reverse()
        .find((m) => m.role === "user");
      // Merge what we know locally (active model resolved just before the
      // request fired) into the errorContext so the card always shows
      // model / preset / apiFormat — even when the failure came from a
      // path that doesn't produce a fully populated errorContext (broker
      // exceptions, pre-flight blockers, etc.).
      const modelInfo = currentModelInfoRef.current;
      const mergedContext: import("@super-client/shared-types/chat").LLMErrorContext =
        {
          preset: errorContext?.preset ?? modelInfo?.providerPreset,
          apiFormat: errorContext?.apiFormat ?? modelInfo?.apiFormat,
          baseUrl: errorContext?.baseUrl,
          model: errorContext?.model ?? modelInfo?.model,
          statusCode: errorContext?.statusCode,
          endpointUrl: errorContext?.endpointUrl,
          responseBodySnippet: errorContext?.responseBodySnippet,
          providerErrorCode: errorContext?.providerErrorCode,
          providerErrorMessage: errorContext?.providerErrorMessage,
          ...(errorContext?.stack ? { stack: errorContext.stack } : {}),
        };
      markMessageAsError(lastAssistant.id, {
        summary,
        errorContext: mergedContext,
        ...(triggeringUser?.content
          ? { query: triggeringUser.content }
          : {}),
      });
    },
    [markMessageAsError, message],
  );

  const kickWatchdog = useCallback(() => {
    // Don't re-arm while we're blocked on a user decision (approval card
    // / AskUserQuestion). The next legitimate kick happens in
    // `respondToApproval` when the user submits and we expect the stream
    // to resume.
    if (awaitingUserApprovalRef.current) return;
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
      // Surface the timeout as a proper ErrorCard on the in-flight assistant
      // bubble — this is a stream failure, not a transient warning.
      materializeStreamError(t("stream.watchdogTimeout", { ns: "chat" }));
      // 清流式状态（已被 markMessageAsError 替换的消息会自带 summary 文案）
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
  }, [setSessionStatus, setStreamingContent, materializeStreamError, t]);
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
      // Agent SDK 路径下，同一份 ChatStreamEvent 会被 LLMService.broadcast 同时
      // 发到这条 `model:stream-event` 通道 + per-request 订阅者；后者会被
      // ClaudeCodeAgentRuntime 翻译成 text.delta 再经 agentSdkLegacyAdapter
      // 转回 `{ type: "chunk" }` 通过 `agent-sdk:stream-event` 走 agentSDK
      // 分支。两条都跑就会把每个 chunk append 两次，导致正文出现
      // "文件文件内容内容" 这种叠字、并且 ``` fence 被叠加成错误序列而无法
      // 被 messagePartsAdapter 解析成 code_block。这里反向门控：agent SDK
      // 请求时只听 agentSDK 通道。
      if (isAgentSDKRequestRef.current) return;

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

        // AskUserQuestion is a UI affordance, not a real tool — tag the
        // tool message so `isAskUserQuestionToolCall` picks the
        // `AskUserQuestionCard` renderer regardless of whether the model
        // called the bare name or the `scp-agent-builtins__` prefixed
        // variant. The main process's `toolAdapter` flips the same
        // tool message into `awaiting_approval` via the
        // `tool_approval_request` event a moment later.
        const bareName = event.toolCall.name
          .toLowerCase()
          .split("__")
          .pop();
        const isAskUserQuestion =
          bareName === "askuserquestion" || bareName === "ask_user_question";

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
            ...(isAskUserQuestion
              ? { approval: { kind: "ask-user-question" } }
              : {}),
          },
        };
        addMessage(toolMessage);
      } else if (event.type === "tool_result" && event.toolResult) {
        setSessionStatus("streaming");
        // Tool execution completed — update the tool message
        const toolMsgId = `tool_${event.toolResult.toolCallId}`;

        // AskUserQuestion guard: the renderer's `respondToApproval`
        // optimistic update already wrote the canonical
        // `{questions, answers}` payload into `toolCall.result` BEFORE
        // sending the IPC. The main-process echo can lose fields
        // depending on the IPC serialization path (and in practice has
        // been observed to arrive with empty `answers`). Treat the
        // optimistic value as authoritative — only promote `status`
        // to terminal and write `result` when we don't already have
        // the structured answers, so we never regress from "showing
        // the user's selections" to "showing 未作答 placeholders".
        const existing = useChatMessageStore
          .getState()
          .messages.find((m) => m.id === toolMsgId);
        const existingResult = existing?.toolCall?.result as
          | { answers?: Record<string, unknown> }
          | undefined;
        const isAskUserQuestionMsg =
          existing?.toolCall &&
          (existing.toolCall.approval?.kind === "ask-user-question" ||
            (() => {
              const lower = existing.toolCall.name.toLowerCase();
              const bare = lower.includes("__")
                ? (lower.split("__").pop() ?? lower)
                : lower;
              return (
                bare === "askuserquestion" || bare === "ask_user_question"
              );
            })());
        const optimisticAlreadyHasAnswers = Boolean(
          existingResult?.answers &&
            typeof existingResult.answers === "object" &&
            Object.keys(existingResult.answers).length > 0,
        );
        const keepOptimisticResult =
          isAskUserQuestionMsg && optimisticAlreadyHasAnswers;

        updateMessageToolCall(toolMsgId, {
          status: event.toolResult.isError ? "error" : "success",
          ...(keepOptimisticResult
            ? {}
            : { result: event.toolResult.result }),
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
        // Update tool message to show inline approval UI. When the main
        // process tags `source:"ask-user-question"`, also stamp
        // `approval.kind` so the renderer dispatches to
        // `AskUserQuestionCard` (matches the Agent SDK path's behaviour).
        const toolMsgId = `tool_${event.toolApproval.toolCallId}`;
        const isAskUserQuestion =
          event.toolApproval.source === "ask-user-question";
        updateMessageToolCall(toolMsgId, {
          status: "awaiting_approval",
          ...(isAskUserQuestion
            ? { approval: { kind: "ask-user-question" } }
            : {}),
        });
        // Pause the stream watchdog while we wait for the user. The
        // top-of-handler `kickWatchdog()` already ran for this event and
        // would otherwise tick down for 60s while the user reads/answers,
        // killing a healthy stream with a "connection timeout".
        awaitingUserApprovalRef.current = true;
        clearWatchdog();
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
        // Materialize an ErrorCard on the in-flight assistant message.
        materializeStreamError(
          event.error ?? "Stream failed",
          event.errorContext,
        );
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
    materializeStreamError,
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

        case "assistant_part": {
          if (!event.assistantPart) break;
          const msgs = useChatMessageStore.getState().messages;
          const lastAssistant = [...msgs]
            .reverse()
            .find((msg) => msg.role === "assistant");
          if (lastAssistant) {
            applyAssistantPartEvent(lastAssistant.id, event.assistantPart);
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
          // Pause the stream watchdog — same reasoning as the LLM path's
          // `tool_approval_request` branch: user reading/answering can
          // take longer than the 60s watchdog window. Re-armed when the
          // user clicks Approve/Reject/Submit in `respondToApproval`.
          awaitingUserApprovalRef.current = true;
          clearWatchdog();
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
          // If the placeholder was already converted into an error message
          // by `materializeStreamError`, short-circuit so a stray runtime
          // `result` event arriving after `error` can't reset the bubble
          // (e.g. by clobbering content / metadata through the finalize +
          // updateMessageMetadata path below).
          if (lastAssistant?.type === "error") {
            setSessionStatus("idle");
            clearAssistantStreamContent();
            currentRequestIdRef.current = null;
            isAgentSDKRequestRef.current = false;
            clearWatchdog();
            break;
          }
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
          const errorContext = event.errorContext;
          agentLog.error("Agent SDK error event", undefined, {
            requestId: event.requestId,
            error: errorText,
            ...(errorContext ? { errorContext } : {}),
          });
          materializeStreamError(errorText, errorContext);
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
    applyAssistantPartEvent,
    clearAssistantStreamContent,
    finalizeAssistantStreamContent,
    setSessionStatus,
    setStreamingContent,
    upsertToolMessage,
    updateLastMessage,
    updateLastAssistantContent,
    updateMessageToolCall,
    updateMessageMetadata,
    materializeStreamError,
    message,
    kickWatchdog,
    clearWatchdog,
  ]);

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
        skillContext?: string;
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

        // Pre-flight: check the *Claude Code* model the provider will use,
        // not the chat-side model in the composer. See `resolveAgentSdkIntent`
        // for rationale.
        const intent = resolveAgentSdkIntent(
          useModelStore.getState().providers,
        );
        if (!intent.ok) {
          agentLog.info("Agent blocked: claude code intent unresolved", {
            requestId,
            chatModel: effective?.model.id,
            chatProviderId: effective?.provider.id,
            chatProviderPreset: effective?.provider.preset,
          });
          // Surface as an ErrorCard with minimal context so the user sees
          // which chat-side model was attempted and why it was blocked.
          materializeStreamError(intent.message, {
            preset: effective?.provider.preset,
            apiFormat: undefined,
            baseUrl: effective?.provider.baseUrl,
            model: effective?.model.id,
            statusCode: undefined,
            endpointUrl: undefined,
            responseBodySnippet: undefined,
            providerErrorCode: "claude_code_intent_unresolved",
            providerErrorMessage: intent.message,
          });
          setSessionStatus("idle");
          clearAssistantStreamContent();
          currentRequestIdRef.current = null;
          return;
        }

        isAgentSDKRequestRef.current = true;

        const baseSystemPrompt = sessionSettings.systemPrompt
          ? sessionSettings.systemPrompt
          : effective?.model.systemPrompt;

        // 构建系统提示词，注入环境信息（如工作目录、已连接的 MCP 服务器等）
        const baseAgentSystemPrompt = buildSystemPrompt(baseSystemPrompt, envInfo, {
          name: effective?.model.name,
          id: effective?.model.id,
        });
        const skillContext = options?.skillContext?.trim();
        const customSystemPrompt = skillContext
          ? `${baseAgentSystemPrompt}\n\n--- Skill Context ---\n${skillContext}`
          : baseAgentSystemPrompt;

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

        const promptContext = await buildAgentPromptWithContext({
          conversationId: convId,
          content,
          attachmentIds: options?.attachmentIds,
          searchEngine: options?.searchEngine,
          searchConfigs: options?.searchConfigs,
        });
        if (promptContext.warnings.length > 0) {
          agentLog.warn("Agent prompt context warnings", {
            requestId,
            warnings: promptContext.warnings,
          });
        }

        agentLog.info("Agent createQuery IPC start", {
          requestId,
          conversationId: convId,
          model: overrideModelId,
          providerId: effective?.provider.id,
          hasSystemPrompt: Boolean(customSystemPrompt.trim()),
          resumeSessionId: agentSDKSessionIdRef.current ?? undefined,
          mcpServerCount: mcpServerNames.length,
          attachmentCount: promptContext.attachmentCount,
          searchResultCount: promptContext.searchResultCount,
        });
        await agentSDKClient.createQuery(requestId, {
          prompt: promptContext.prompt,
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
        // Surface IPC-create failures (main process throwing before any
        // stream event lands) through the same ErrorCard path. Pull the
        // attempted model from currentModelInfoRef (set just before the
        // createQuery call) — `effective` itself is local to the try block.
        const modelInfo = currentModelInfoRef.current;
        materializeStreamError(errorMsg, {
          preset: modelInfo?.providerPreset,
          apiFormat: modelInfo?.apiFormat,
          baseUrl: undefined,
          model: modelInfo?.model,
          statusCode: undefined,
          endpointUrl: undefined,
          responseBodySnippet: undefined,
          providerErrorCode: "agent_create_query_ipc_failed",
          providerErrorMessage: errorMsg,
        });
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
      updateLastAssistantContent,
      materializeStreamError,
      armWatchdog,
      t,
    ],
  );

  /**
   * Send message in skill mode (LLM streaming with skill systemPrompt injection)
   */
  const sendSkillMessage = useCallback(
    async (
      content: string,
      skillId?: string,
      commandName?: string,
      options?: {
        searchEngine?: string;
        searchConfigs?: SearchConfig[];
        attachmentIds?: string[];
      },
    ) => {
      if (!skillId) {
        message.error(t("noSkillSelected", { ns: "chat" }));
        return;
      }

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
      await sendAgentMessage(content, undefined, {
        skillContext: skillSystemPrompt ?? undefined,
        searchEngine: options?.searchEngine,
        searchConfigs: options?.searchConfigs,
        attachmentIds: options?.attachmentIds,
      });
    },
    [
      message,
      sendAgentMessage,
      t,
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

      // Pre-resolve the active model from renderer state (no IPC) so the
      // assistant bubble's header shows the *real* model name and provider
      // icon from the very first frame. `sendAgentMessage` still does the
      // authoritative IPC resolve and will update `currentModelInfoRef` /
      // metadata in-place if the answer changes.
      const preResolved = getEffectiveModel();
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        metadata: {
          model: preResolved?.model.id ?? "agent",
          providerPreset: preResolved?.provider.preset ?? "anthropic",
          providerName: preResolved?.provider.name ?? "Agent SDK",
        },
      };
      addMessage(assistantMessage);

      await sendAgentMessage(userContent);
    },
    [addMessage, deleteMessagesFrom, getEffectiveModel, sendAgentMessage],
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
      // Push the message body into the composer via the shared store so
      // we don't need to thread a setter through Chat.tsx anymore.
      useChatInputStore.getState().setValue(target.content);
    },
    [],
  );

  /**
   * Main send message function
   */
  const sendMessage = useCallback(
    async (options?: ChatOptions) => {
      // Snapshot read — we don't want sendMessage to re-create on every
      // keystroke, so we go through `getState()` rather than subscribing.
      const content = (
        options?.content ?? useChatInputStore.getState().value
      ).trim();
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
      useChatInputStore.getState().clear();

      // Pre-resolve the active model from renderer state so the bubble
      // header reflects the real model / provider icon immediately on send.
      // The `sendAgentMessage` path below still does the authoritative IPC
      // resolve and patches `currentModelInfoRef` (and the message metadata
      // via stream events) if the resolved model differs.
      const preResolved = getEffectiveModel();
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        metadata: {
          model: preResolved?.model.id ?? "agent",
          providerPreset: preResolved?.provider.preset ?? "anthropic",
          providerName: preResolved?.provider.name ?? "Agent SDK",
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
          {
            searchEngine: options?.searchEngine,
            searchConfigs: options?.searchConfigs,
            attachmentIds: options?.attachmentIds,
          },
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
      // `input` is intentionally NOT a dep — we snapshot it inside the
      // callback via `useChatInputStore.getState()`. Including it would
      // re-create `sendMessage` on every keystroke, which is exactly the
      // re-render cascade we moved the state out of the tree to avoid.
      selectedAgentId,
      selectedSkillId,
      selectedCommandName,
      addMessage,
      deleteMessagesFrom,
      getEffectiveModel,
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
    sessionStatus,
    isStreaming,
    selectedAgentId,
    selectedSkillId,
    selectedCommandName,
    sessionModelOverride,
    sessionSettings,
    availableTools,
    // NOTE: `input` / `setInput` were removed in the 2026-06-28 perf pass.
    // Composer text now lives in `useChatInputStore` — components that
    // *display* the value subscribe to the store directly, and one-shot
    // consumers (editMessage, sendMessage, slash insertion, etc.) call
    // `useChatInputStore.getState().setValue / .value` instead. This kept
    // `useChat`'s memoised return value referentially stable across
    // keystrokes, so `Chat.tsx` no longer re-renders on every character.

    // Setters
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
