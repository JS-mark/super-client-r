import { FolderOpenOutlined } from "@ant-design/icons";
import { Alert, App, Button, theme } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatModeSelection } from "../components/chat/ChatModePanel";
import { ChatInputArea } from "../components/chat/ChatInputArea";
import { ChatMessageList } from "../components/chat/ChatMessageList";
import { ChatModals } from "../components/chat/ChatModals";
import { CodexEnvironmentInspector } from "../components/chat/CodexEnvironmentInspector";
import { ModelSwitcherModal } from "../components/chat/ModelSwitcherModal";
import { ChatNewSession } from "../components/chat/ChatNewSession";
import { ChatWelcomeScreen } from "../components/chat/ChatWelcomeScreen";
import { ClaudeEmptyChatHome } from "../components/chat/ClaudeEmptyChatHome";
import { RemoteChatPane } from "../components/chat/RemoteChatPane";
import { useSearchEngine } from "../components/chat/SearchEnginePanel";
import { MainLayout } from "../components/layout/MainLayout";
import { useChat } from "../hooks/useChat";
import { useChatPageState } from "../hooks/useChatPageState";
import { useEffectiveInteractionProfile } from "../hooks/useEffectiveInteractionProfile";
import { useRemoteChat } from "../hooks/useRemoteChat";
import { useSlashCommands } from "../hooks/useSlashCommands";

import { useModelStore } from "../stores/modelStore";
import { useChatStore } from "../stores/chatStore";
import { useFeatureFlagsStore } from "../stores/featureFlagsStore";
import { useFileArtifactStore } from "../stores/fileArtifactStore";
import { useUserStore } from "../stores/userStore";

const { useToken } = theme;

const Chat: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useToken();
  const { message } = App.useApp();

  const {
    messages,
    input,
    setInput,
    sendMessage,
    isStreaming,
    stopCurrentStream,
    retryMessage,
    editMessage,
    deleteMessage,
    chatMode,
    isModeLocked,
    setChatMode,
    selectedSkillId,
    setSelectedSkillId,
    selectedCommandName,
    setSelectedCommandName,
    sessionModelOverride,
    setSessionModelOverride,
    sessionSettings,
    setSessionSettings,
    respondToApproval,
    availableTools,
    getEffectiveModel,
  } = useChat();

  // Search engine state
  const {
    selectedEngine,
    setSelectedEngine,
    currentEngine,
    searchConfigs,
    hasSearchEngines,
  } = useSearchEngine();

  // Model state
  const isModelLoading = useModelStore((s) => s.isLoading);
  const hasActiveModel = !!useModelStore((s) => s.getActiveProviderModel)();

  // Remote chat bridge
  const {
    binding: remoteBinding,
    remoteMessages,
    bindToBot,
    unbind: unbindRemote,
    checkBotOnline,
    sendRemoteMessage,
  } = useRemoteChat();

  // Page-level state (sidebar, dialogs, conversations, workspace, etc.)
  const pageState = useChatPageState({
    messages,
    sendMessage,
    setInput,
    setSelectedSkillId,
    setSessionSettings,
    remoteBinding,
    remoteMessages,
    checkBotOnline,
    unbindRemote,
    input,
  });

  // Effective interactionProfile for the current conversation.
  // Drives the data-interaction-profile attribute on the page wrapper so
  // CSS in `styles/interaction-profile.css` can differentiate density.
  const currentConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.currentConversationId),
  );
  const interactionProfile = useEffectiveInteractionProfile();

  // Codex Environment Inspector visibility:
  //   - codex profile: always show.
  //   - hybrid profile: show when there is "content to inspect"
  //     (artifacts present OR a tool is running OR planMode != "chat").
  //   - claude-code: never show.
  // Read the raw map via selector (stable ref) and derive the per-conversation
  // list with useMemo. Selector must NOT build a new array each render — that
  // breaks zustand's strict-equal short-circuit and infinite-loops.
  const artifactsMap = useFileArtifactStore((s) => s.artifacts);
  const inspectorArtifacts = useMemo(() => {
    const cid = pageState.currentConversationId;
    return cid ? (artifactsMap[cid] ?? []) : [];
  }, [artifactsMap, pageState.currentConversationId]);
  const sessionPlanMode = currentConversation?.session?.planMode;
  // §22 rollback flags: fileArtifacts=false 时强制隐藏 inspector；
  // profileLayouts=false 时把 hybrid/claude 一并视为 codex（永远显示）。
  const fileArtifactsEnabled = useFeatureFlagsStore((s) => s.fileArtifacts);
  const profileLayoutsEnabled = useFeatureFlagsStore((s) => s.profileLayouts);
  const showInspector = useMemo(() => {
    if (!fileArtifactsEnabled) return false;
    if (!profileLayoutsEnabled) return true;
    if (interactionProfile === "claude-code") return false;
    if (interactionProfile === "codex") return true;
    // hybrid
    if (inspectorArtifacts.length > 0) return true;
    if (isStreaming) return true;
    if (sessionPlanMode && sessionPlanMode !== "chat") return true;
    return false;
  }, [
    fileArtifactsEnabled,
    profileLayoutsEnabled,
    interactionProfile,
    inspectorArtifacts.length,
    isStreaming,
    sessionPlanMode,
  ]);

  // Claude empty home: derive user name and effective model label.
  const claudeHomeUserName = useUserStore((s) => s.user?.name) ?? "你";
  const claudeHomeModelLabel = useMemo(() => {
    if (messages.length !== 0) return undefined;
    if (interactionProfile === "codex") return undefined;
    const eff = getEffectiveModel();
    if (!eff) return undefined;
    const label = `${eff.provider.name} · ${eff.model.name}`;
    return label.length > 20 ? `${label.slice(0, 20)}…` : label;
  }, [messages.length, interactionProfile, getEffectiveModel]);

  // Slash commands
  const slash = useSlashCommands({
    setSelectedSkillId,
    setSelectedCommandName,
    setInput,
  });

  // ── Send handler (AI chat) ──
  const handleSend = useCallback(
    (value: string, attachmentIds?: string[]) => {
      // Safety guard: prevent send when slash command panel is open
      if (slash.slashStateRef.current.open) return;
      if (value.trim() && !isStreaming) {
        sendMessage({
          mode: chatMode,
          // Skill is independent of mode — always pass through
          skillId: selectedSkillId ?? undefined,
          commandName: selectedCommandName ?? undefined,
          searchEngine: selectedEngine || undefined,
          searchConfigs: searchConfigs,
          attachmentIds,
        });
      }
    },
    [
      isStreaming,
      sendMessage,
      chatMode,
      selectedSkillId,
      selectedCommandName,
      selectedEngine,
      searchConfigs,
      slash.slashStateRef,
    ],
  );

  // ── Send handler (remote IM — routes to sendRemoteMessage) ──
  const handleRemoteSend = useCallback(
    (value: string) => {
      if (value.trim()) {
        sendRemoteMessage(value.trim());
        setInput("");
      }
    },
    [sendRemoteMessage, setInput],
  );

  // ── Mode selection ──
  const handleModeSelect = useCallback(
    (selection: ChatModeSelection) => {
      setChatMode(selection.mode);
    },
    [setChatMode],
  );

  // ── Skill clear ──
  const handleClearSkill = useCallback(() => {
    setSelectedSkillId(null);
    setSelectedCommandName(null);
  }, [setSelectedSkillId, setSelectedCommandName]);

  // ── Remote bind handler ──
  // R-7 / §25.3: remote conversations are now created via NewConversationModal
  // (TitleBar 新建对话…) which calls chatStore.createConversationAdvanced and
  // binds the remote in one step. The local-then-bind flow this comment used to
  // describe is no longer reachable from any live UI surface.
  const handleRemoteBind = useCallback(
    async (botId: string, chatId: string) => {
      try {
        await bindToBot(botId, chatId);
        message.success(
          t("remoteChat.bindSuccess", "Bot bound successfully", {
            ns: "chat",
          }),
        );
        pageState.setSidebarTab("remote");
        pageState.setViewMode("remote");
      } catch (err) {
        message.error(
          `${t("remoteChat.bindFailed", "Bind failed", { ns: "chat" })}: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    },
    [
      bindToBot,
      message,
      t,
      pageState.setSidebarTab,
      pageState.setViewMode,
    ],
  );

  // ── Model value for settings ──
  const modelValue = sessionModelOverride
    ? `${sessionModelOverride.providerId}||${sessionModelOverride.modelId}`
    : pageState.activeSelection
      ? `${pageState.activeSelection.providerId}||${pageState.activeSelection.modelId}`
      : undefined;

  const handleModelChange = useCallback(
    (val: string) => {
      if (!val) {
        setSessionModelOverride(null);
        return;
      }
      const [providerId, modelId] = val.split("||");
      setSessionModelOverride({ providerId, modelId });
    },
    [setSessionModelOverride],
  );

  // ── Model switcher (Cmd/Ctrl+M, or chip click via window event) ──
  const [modelSwitcherOpen, setModelSwitcherOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "m" || e.key === "M") && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setModelSwitcherOpen((prev) => !prev);
      }
    };
    const onOpen = () => setModelSwitcherOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("chat:open-model-switcher", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("chat:open-model-switcher", onOpen);
    };
  }, []);

  // ── Session settings opener (triggered from TitleBar more menu) ──
  useEffect(() => {
    const onOpenSessionSettings = () => pageState.setSettingsOpen(true);
    window.addEventListener("chat:open-session-settings", onOpenSessionSettings);
    return () => {
      window.removeEventListener(
        "chat:open-session-settings",
        onOpenSessionSettings,
      );
    };
  }, [pageState.setSettingsOpen]);

  return (
    <MainLayout>
      <div className="flex h-full" data-interaction-profile={interactionProfile}>
        {/* Main Chat Area */}
        <div className="flex flex-col flex-1 h-full min-w-0">
          <div
            className="flex flex-col h-full min-w-0"
            style={{ backgroundColor: token.colorBgContainer }}
          >
            {pageState.viewMode === "local" ? (
              <>
                {/* Session tip — only when there are messages */}
                {messages.length > 0 && (
                  <div className="px-4 sm:px-6 pt-2 shrink-0">
                    <Alert
                      type="info"
                      title={
                        <span className="text-xs flex items-center gap-2 flex-wrap">
                          <span>
                            {t(
                              "sessionTip",
                              "Type / to invoke skills",
                              { ns: "chat" },
                            )}
                          </span>
                          {pageState.workspaceDir && (
                            <Button
                              type="text"
                              size="small"
                              icon={<FolderOpenOutlined />}
                              style={{ color: token.colorPrimary }}
                              onClick={pageState.handleOpenWorkspace}
                            >
                              {t("workspace", "Workspace", { ns: "chat" })}
                            </Button>
                          )}
                        </span>
                      }
                    />
                  </div>
                )}

                {/* Chat Area */}
                <div className="chat-message-area flex-1 overflow-hidden w-full px-4 sm:px-6">
                  {!pageState.currentConversationId ? (
                    <ChatNewSession chatMode={chatMode} />
                  ) : messages.length === 0 ? (
                    profileLayoutsEnabled &&
                    (interactionProfile === "claude-code" ||
                      interactionProfile === "hybrid") ? (
                      <ClaudeEmptyChatHome
                        userName={claudeHomeUserName}
                        modelLabel={claudeHomeModelLabel}
                        onSend={(text) => {
                          setInput(text);
                          handleSend(text);
                        }}
                        isStreaming={isStreaming}
                        onOpenModelSwitcher={() =>
                          window.dispatchEvent(
                            new Event("chat:open-model-switcher"),
                          )
                        }
                      />
                    ) : (
                      <ChatWelcomeScreen
                        hasActiveModel={hasActiveModel}
                        isModelLoading={isModelLoading}
                        onInputChange={setInput}
                        messageApi={message}
                      />
                    )
                  ) : (
                    <ChatMessageList
                      messages={messages}
                      isStreaming={isStreaming}
                      conversationId={pageState.conversationId}
                      bubbleListRef={pageState.bubbleListRef}
                      retryMessage={retryMessage}
                      editMessage={editMessage}
                      deleteMessage={deleteMessage}
                      respondToApproval={respondToApproval}
                    />
                  )}
                </div>

                {/* Input Area — hidden when no conversation (app-level empty state)
                    or when Claude empty home owns the centered composer. */}
                {pageState.currentConversationId &&
                  !(
                    messages.length === 0 &&
                    (interactionProfile === "claude-code" ||
                      interactionProfile === "hybrid")
                  ) && (
                <ChatInputArea
                  input={input}
                  onInputChange={setInput}
                  onSend={handleSend}
                  isStreaming={isStreaming}
                  onStopStream={stopCurrentStream}
                  chatMode={chatMode}
                  isModeLocked={isModeLocked}
                  onModeSelect={handleModeSelect}
                  selectedSkillId={selectedSkillId}
                  onClearSkill={handleClearSkill}
                  selectedEngine={selectedEngine}
                  onSelectEngine={setSelectedEngine}
                  hasSearchEngines={hasSearchEngines}
                  currentEngine={currentEngine}
                  conversationId={pageState.conversationId}
                  slashPanelOpen={slash.slashPanelOpen}
                  slashFilteredItems={slash.slashFilteredItems}
                  slashHighlight={slash.slashHighlight}
                  onSlashHighlightChange={slash.setSlashHighlight}
                  onSlashSelect={slash.handleSlashSelect}
                  onSlashPanelClose={() => {
                    slash.setSlashPanelOpen(false);
                    slash.setSlashQuery("");
                  }}
                  onSlashInputChange={slash.handleSlashInputChange}
                  registerKeydownHandler={slash.registerKeydownHandler}
                />
                )}
              </>
            ) : (
              <>
                {/* Remote IM View — header + messages from RemoteChatPane, input from ChatInputArea */}
                <RemoteChatPane
                  binding={remoteBinding}
                  remoteMessages={remoteMessages}
                  onSendMessage={sendRemoteMessage}
                  onBind={() => pageState.setRemoteBindModalOpen(true)}
                  onUnbind={pageState.handleUnbindRemote}
                  botOnline={pageState.remoteBotOnline}
                  isBotChecking={pageState.remoteBotChecking}
                  hideInput
                />

                {/* Chat's own input — hideToolbar mode for IM */}
                <ChatInputArea
                  input={input}
                  onInputChange={setInput}
                  onSend={handleRemoteSend}
                  isStreaming={false}
                  onStopStream={stopCurrentStream}
                  chatMode={chatMode}
                  isModeLocked={isModeLocked}
                  onModeSelect={handleModeSelect}
                  selectedSkillId={null}
                  onClearSkill={handleClearSkill}
                  selectedEngine={selectedEngine}
                  onSelectEngine={setSelectedEngine}
                  hasSearchEngines={hasSearchEngines}
                  currentEngine={currentEngine}
                  conversationId={pageState.conversationId}
                  slashPanelOpen={false}
                  slashFilteredItems={[]}
                  slashHighlight={0}
                  onSlashHighlightChange={() => {}}
                  onSlashSelect={() => {}}
                  onSlashPanelClose={() => {}}
                  onSlashInputChange={() => {}}
                  registerKeydownHandler={() => () => {}}
                  hideToolbar
                  placeholder={t(
                    "remoteChat.inputPlaceholder",
                    "Type a message to send to IM...",
                    { ns: "chat" },
                  )}
                />
              </>
            )}
          </div>
        </div>

        {/* Codex Environment Inspector — rightmost column for codex/hybrid */}
        {showInspector && <CodexEnvironmentInspector />}
      </div>

      {/* Modals */}
      <ChatModals
        messages={messages}
        isSearchOpen={pageState.isSearchOpen}
        onSearchClose={() => pageState.setIsSearchOpen(false)}
        pendingScrollKeyRef={pageState.pendingScrollKeyRef}
        isExportOpen={pageState.isExportOpen}
        onExportClose={() => pageState.setIsExportOpen(false)}
        settingsOpen={pageState.settingsOpen}
        onSettingsClose={() => pageState.setSettingsOpen(false)}
        sessionSettings={sessionSettings}
        onSettingsChange={setSessionSettings}
        modelValue={modelValue}
        onModelChange={handleModelChange}
        groupedModelOptions={pageState.groupedModelOptions}
        isStreaming={isStreaming}
        availableTools={availableTools}
        remoteBindModalOpen={pageState.remoteBindModalOpen}
        onRemoteBindClose={() => {
          pageState.setRemoteBindModalOpen(false);
        }}
        onBind={handleRemoteBind}
        checkBotOnline={checkBotOnline}
      />

      <ModelSwitcherModal
        open={modelSwitcherOpen}
        onClose={() => setModelSwitcherOpen(false)}
        currentSelection={sessionModelOverride}
        onSelect={(sel) => setSessionModelOverride(sel)}
        onClear={() => setSessionModelOverride(null)}
      />
    </MainLayout>
  );
};

export default Chat;
