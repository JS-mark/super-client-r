import { App } from "antd";
import { t } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionSettings } from "../components/chat/ChatSettingsModal";
import { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";
import { agentSDKClient } from "../services/agent/agentSDKService";
import { agentRuntimeClient } from "../services/agent/agentRuntimeClient";
import { modelService } from "../services/modelService";
import { sanitizeAssistantContent } from "../lib/assistantContent";
import { useChatStore } from "../stores/chatStore";
import { useChatInputStore } from "../stores/chatInputStore";
import { type Message, useChatMessageStore } from "../stores/chatMessageStore";
import { useFileArtifactStore } from "../stores/fileArtifactStore";
import { useAgentRunController } from "./useAgentRunController";
import { type AgentEventReducerContext } from "./useAgentEventReducer";
import { useMessageModelResolution } from "./useMessageModelResolution";
import { usePromptContextBuilder } from "./usePromptContextBuilder";
import { useToolApprovalFlow } from "./useToolApprovalFlow";
import { useAssistantStreamBuffer } from "./useAssistantStreamBuffer";
import { materializeStreamErrorPatch } from "./agentRunError";
import { useAgentRunStopper } from "./useAgentRunStopper";
import { useAvailableToolsCatalog } from "./useAvailableToolsCatalog";
import { useAgentEventDispatcher } from "./useAgentEventDispatcher";
import { useLegacyLLMStreamHandler } from "./useLegacyLLMStreamHandler";
import { useAgentRuntimeStreamHandler } from "./useAgentRuntimeStreamHandler";
import { useAgentSDKStreamHandler } from "./useAgentSDKStreamHandler";
import { useAgentSendPipeline } from "./useAgentSendPipeline";
import { useComposerSelectionState } from "./useComposerSelectionState";
import { useCurrentModelInfoRef } from "./useCurrentModelInfoRef";
import { useMessageRetry } from "./useMessageRetry";
import { useSendMessage, type SendMessageOptions } from "./useSendMessage";

export type {
  CustomParam,
  SessionSettings,
  ToolCallMode,
  ToolPermissionMode,
} from "../components/chat/ChatSettingsModal";
import { createLogger } from "../services/logService";

const log = createLogger("useChat");
export { DEFAULT_SESSION_SETTINGS } from "../components/chat/ChatSettingsModal";

export type ChatMode = "agent";

export interface ChatOptions extends SendMessageOptions {}

export function useChat() {
  const { message } = App.useApp();
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
  const markMessageAsError = useChatMessageStore((s) => s.markMessageAsError);
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

  // Composer selection lives in `useComposerSelectionState`; composer
  // text lives in `useChatInputStore` (both intentionally outside the
  // useChat subscription graph so typing doesn't re-render callers).
  const {
    selectedAgentId,
    setSelectedAgentId,
    selectedSkillId,
    setSelectedSkillId,
    selectedCommandName,
    setSelectedCommandName,
    messageModelOverride,
    setMessageModelOverride,
    editingMessageIdRef,
  } = useComposerSelectionState();

  // Session-scoped model override: derived directly from conversation
  // metadata via `useMessageModelResolution`, no local mirror state.
  const currentConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.currentConversationId),
  );
  const {
    sessionModelOverride,
    setSessionModelOverride,
    getEffectiveModel,
    resolveEffectiveRuntime,
    resolveActiveProviderModel,
  } = useMessageModelResolution(currentConversation, messageModelOverride);
  const { buildPromptContext } = usePromptContextBuilder();

  // Session-scoped settings (tools, temperature, maxTokens, systemPrompt)
  const [sessionSettings, setSessionSettings] = useState<SessionSettings>(
    DEFAULT_SESSION_SETTINGS,
  );
  const sessionSettingsRef = useRef(sessionSettings);
  sessionSettingsRef.current = sessionSettings;

  const { availableTools } = useAvailableToolsCatalog(selectedSkillId);

  const agentFirstChunkLoggedRef = useRef(false);
  const currentModelInfoHandle = useCurrentModelInfoRef();
  const currentModelInfoRef = currentModelInfoHandle.ref;

  // rAF-batched assistant stream buffer (Phase 0b extract).
  const streamBuffer = useAssistantStreamBuffer({
    setStreamingContent,
    updateLastMessage,
  });

  // Turn the in-flight assistant placeholder into an ErrorCard. Rich vs
  // lean merge logic lives in `materializeStreamErrorPatch`.
  const materializeStreamError = useCallback(
    (
      summary: string,
      errorContext?: import("@super-client/shared-types/chat").LLMErrorContext,
    ) => {
      const allMessages = useChatMessageStore.getState().messages;
      const result = materializeStreamErrorPatch({
        messages: allMessages,
        summary,
        errorContext,
        modelInfo: currentModelInfoRef.current,
      });
      if (result.reason === "prestream") {
        message.error(summary);
        return;
      }
      if (result.reason === "postcomplete" || !result.patch) {
        return;
      }
      markMessageAsError(result.patch.messageId, result.patch.patch);
    },
    [markMessageAsError, message, currentModelInfoRef],
  );

  const handleWatchdogTimeout = useCallback(() => {
    materializeStreamError(t("stream.watchdogTimeout", { ns: "chat" }));
    setSessionStatus("idle");
    streamBuffer.clear();
  }, [setSessionStatus, materializeStreamError, streamBuffer]);

  // Stream watchdog + request bookkeeping.
  const {
    currentRequestIdRef,
    agentRuntimeSessionIdRef,
    requestTypeRef,
    setRequestType,
    beginRequest,
    clearCurrentRequest,
    setAgentSDKSessionId,
    setAgentRuntimeSessionId,
    setAwaitingUserApproval,
    pauseForApproval,
    snapshotAndClearCurrentRequest,
    clearWatchdog,
    kickWatchdog,
    armWatchdog,
  } = useAgentRunController({
    getSessionStatus: () => useChatMessageStore.getState().sessionStatus,
    onWatchdogTimeout: handleWatchdogTimeout,
  });

  const respondToApproval = useToolApprovalFlow({
    getSessionStatus: () => useChatMessageStore.getState().sessionStatus,
    hasCurrentRequest: () => Boolean(currentRequestIdRef.current),
    setAwaitingUserApproval,
    kickWatchdog,
    getMessages: () => useChatMessageStore.getState().messages,
    updateMessageToolCall,
    isAgentSDKRequest: () =>
      requestTypeRef.current === "agent-sdk" ||
      requestTypeRef.current === "runtime",
    resolveAgentSDKPermission: (id, allowed, input, permissions) => {
      if (requestTypeRef.current === "runtime") {
        return agentRuntimeClient.resolveToolApproval(
          id,
          allowed,
          input,
          permissions,
        );
      }
      return agentSDKClient.resolvePermission(
        id,
        allowed,
        input,
        permissions,
      );
    },
    resolveLegacyApproval: window.electron.llm.toolApprovalResponse,
    onResolveError: (err) => {
      log.error("toolApprovalResponse failed", err instanceof Error ? err : new Error(String(err)));
    },
  });

  useEffect(() => () => clearWatchdog(), [clearWatchdog]);

  // `streamBuffer` methods are already stable (memoised per-mount); the
  // callback wrappers we used to have here just relayed calls.
  const appendAssistantStreamChunk = streamBuffer.append;
  const finalizeAssistantStreamContent = streamBuffer.finalize;
  const clearAssistantStreamContent = streamBuffer.clear;

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

  // Restore native agent sessions when conversation changes.
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  useEffect(() => {
    const conv = useChatStore
      .getState()
      .conversations.find((c) => c.id === currentConversationId);
    const nativeSessionId =
      conv &&
        "nativeSessionId" in conv &&
        typeof conv.nativeSessionId === "string"
        ? conv.nativeSessionId
        : null;
    setAgentSDKSessionId(conv?.agentSDKSessionId ?? null);
    setAgentRuntimeSessionId(nativeSessionId);
    setRequestType(null);
  }, [
    currentConversationId,
    setAgentRuntimeSessionId,
    setAgentSDKSessionId,
    setRequestType,
  ]);

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

  const createAgentEventReducerContext =
    useCallback((): AgentEventReducerContext => {
      const state = useChatMessageStore.getState();
      const modelInfo = currentModelInfoRef.current;
      return {
        messages: state.messages,
        sessionStatus: state.sessionStatus,
        streamContent: streamBuffer.getRef().current,
        modelInfo: modelInfo
          ? {
            model: modelInfo.model,
            providerPreset: modelInfo.providerPreset,
            providerName: modelInfo.providerName,
          }
          : null,
        now: () => Date.now(),
        makeId: (prefix) =>
          `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      };
    }, [streamBuffer, currentModelInfoRef]);

  const { applyActions: applyAgentEventActions } = useAgentEventDispatcher({
    runController: {
      setAgentSDKSessionId,
      setAgentRuntimeSessionId,
      pauseForApproval,
      clearCurrentRequest,
      clearWatchdog,
    },
    streamBuffer: {
      append: appendAssistantStreamChunk,
      finalize: finalizeAssistantStreamContent,
      clear: clearAssistantStreamContent,
    },
    messageStore: {
      setSessionStatus,
      setStreamingContent,
      addMessage,
      updateMessageToolCall,
      updateMessageMetadata,
      applyAssistantPartEvent,
    },
    upsertToolMessage,
    updateLastAssistantContent,
    materializeStreamError,
    getCurrentConversationId: () =>
      useChatStore.getState().currentConversationId,
    persistMessages: () => useChatMessageStore.getState().persistMessages(),
    sessionsApi: {
      updateMeta: (convId, meta) =>
        window.electron.sessions.updateMeta(convId, meta),
    },
    showRateLimit: (msg) => message.warning(msg),
  });

  // Stream handlers — one per channel; invariants preserved verbatim.
  useLegacyLLMStreamHandler({
    getCurrentRequestId: () => currentRequestIdRef.current,
    getRequestType: () => requestTypeRef.current,
    getSessionStatus: () => useChatMessageStore.getState().sessionStatus,
    getMessages: () => useChatMessageStore.getState().messages,
    getCurrentConversationId: () =>
      useChatStore.getState().currentConversationId,
    getModelInfo: () => currentModelInfoRef.current,
    kickWatchdog,
    clearWatchdog,
    pauseForApproval,
    clearCurrentRequest,
    setSessionStatus,
    addMessage,
    updateMessageToolCall,
    updateMessageMetadata,
    appendAssistantStreamChunk,
    finalizeAssistantStreamContent,
    clearAssistantStreamContent,
    persistMessages: () => useChatMessageStore.getState().persistMessages(),
    materializeStreamError,
    addFileArtifacts: (artifacts) =>
      useFileArtifactStore.getState().addArtifacts(artifacts),
    addChangeSet: (cs) => useFileArtifactStore.getState().addChangeSet(cs),
    subscribe: modelService.onStreamEvent,
  });

  useAgentRuntimeStreamHandler({
    getCurrentRequestId: () => currentRequestIdRef.current,
    getRequestType: () => requestTypeRef.current,
    kickWatchdog,
    applyActions: applyAgentEventActions,
    createReducerContext: createAgentEventReducerContext,
    firstChunkLoggedRef: agentFirstChunkLoggedRef,
    subscribe: agentRuntimeClient.onStreamEvent,
  });

  useAgentSDKStreamHandler({
    getCurrentRequestId: () => currentRequestIdRef.current,
    getRequestType: () => requestTypeRef.current,
    kickWatchdog,
    applyActions: applyAgentEventActions,
    createReducerContext: createAgentEventReducerContext,
    firstChunkLoggedRef: agentFirstChunkLoggedRef,
    subscribe: agentSDKClient.onStreamEvent,
  });

  // Send pipeline (runtime createQuery + skill/command prompt lookup).
  const { sendAgentMessage, sendSkillMessage } = useAgentSendPipeline({
    runController: {
      agentRuntimeSessionIdRef,
      requestTypeRef,
      setRequestType,
      beginRequest,
      clearCurrentRequest,
      clearWatchdog,
      armWatchdog,
    },
    streamBuffer: { clear: clearAssistantStreamContent },
    messageStoreApi: {
      setSessionStatus,
      updateMessageMetadata,
      appendSessionEvent: async (sessionId, event) => {
        const response = await window.electron.sessions.appendEvent(
          sessionId,
          event,
        );
        if (!response.success) {
          throw new Error(response.error || "Failed to append session event");
        }
      },
    },
    buildPromptContext,
    resolveActiveProviderModel,
    currentModelInfoRef,
    materializeStreamError,
    getSessionSettings: () => sessionSettingsRef.current,
    getMessages: () => useChatMessageStore.getState().messages,
    getSelectedSkillId: () => selectedSkillId,
  });

  // Top-level composer send flow.
  const { sendMessage } = useSendMessage({
    pipeline: { sendAgentMessage, sendSkillMessage },
    chatStoreApi: {
      getCurrentConversationId: () =>
        useChatStore.getState().currentConversationId,
      getConversation: (id) =>
        useChatStore.getState().conversations.find((c) => c.id === id) ?? null,
      updateConversationMetadata: (id, meta) =>
        useChatStore.getState().updateConversationMetadata(id, meta),
      renameConversation: (id, name) =>
        useChatStore.getState().renameConversation(id, name),
    },
    messageStoreApi: { addMessage, deleteMessagesFrom },
    chatInputStoreApi: {
      getValue: () => useChatInputStore.getState().value,
      clear: () => useChatInputStore.getState().clear(),
    },
    selectionState: {
      getSelectedAgentId: () => selectedAgentId,
      getSelectedSkillId: () => selectedSkillId,
      getSelectedCommandName: () => selectedCommandName,
      setSelectedCommandName,
      editingMessageIdRef,
    },
    messageModelOverride,
    setMessageModelOverride,
    getEffectiveModel,
  });

  // Retry-from-message.
  const { retryMessage } = useMessageRetry({
    getEffectiveModel,
    sendAgentMessage,
    messageStoreApi: {
      getMessages: () => useChatMessageStore.getState().messages,
      addMessage,
      deleteMessagesFrom,
    },
  });

  // Edit a user message – populate input + mark for editing. Truncation
  // happens on the actual re-send inside `useSendMessage`.
  const editMessage = useCallback(
    (messageId: string) => {
      const allMessages = useChatMessageStore.getState().messages;
      const target = allMessages.find((m) => m.id === messageId);
      if (!target || target.role !== "user") return;

      editingMessageIdRef.current = messageId;
      useChatInputStore.getState().setValue(target.content);
    },
    [editingMessageIdRef],
  );

  // Stop routine + `chat:stop-current-stream` window listener.
  const { stopCurrentStream } = useAgentRunStopper({
    refs: {
      requestTypeRef,
      snapshotAndClearCurrentRequest,
    },
    streamBuffer,
    interrupters: {
      runtimeInterrupt: (reqId) => agentRuntimeClient.interrupt(reqId),
      agentSDKInterrupt: (reqId) => agentSDKClient.interruptQuery(reqId),
      legacyStopStream: (reqId) => modelService.stopStream(reqId),
    },
    messageStoreApi: {
      updateLastMessage: (content) =>
        useChatMessageStore.getState().updateLastMessage(content),
      setStreamingContent: (content) =>
        useChatMessageStore.getState().setStreamingContent(content),
      setSessionStatus: (status) =>
        useChatMessageStore.getState().setSessionStatus(status),
      persistMessages: () => useChatMessageStore.getState().persistMessages(),
    },
    clearWatchdog,
    getCurrentConversationId: () =>
      useChatStore.getState().currentConversationId,
  });

  return {
    // State
    messages,
    sessionStatus,
    isStreaming,
    selectedAgentId,
    selectedSkillId,
    selectedCommandName,
    sessionModelOverride,
    messageModelOverride,
    sessionSettings,
    availableTools,
    // NOTE: composer text lives in `useChatInputStore` (perf pass).

    // Setters
    setSelectedAgentId,
    setSelectedSkillId,
    setSelectedCommandName,
    setSessionModelOverride,
    setMessageModelOverride,
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
