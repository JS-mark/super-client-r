import { FolderOpenOutlined } from "@ant-design/icons";
import { Alert, App, Button, theme } from "antd";
import type * as React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChatModeSelection } from "../components/chat/ChatModePanel";
import { ChatSidebar } from "../components/chat/ChatInlineSidebar";
import { ChatInputArea } from "../components/chat/ChatInputArea";
import { ChatMessageList } from "../components/chat/ChatMessageList";
import { ChatModals } from "../components/chat/ChatModals";
import { ChatPageTitle } from "../components/chat/ChatPageTitle";
import { ChatWelcomeScreen } from "../components/chat/ChatWelcomeScreen";
import { RemoteChatPane } from "../components/chat/RemoteChatPane";
import { useSearchEngine } from "../components/chat/SearchEnginePanel";
import { MainLayout } from "../components/layout/MainLayout";
import { useChat } from "../hooks/useChat";
import { useChatPageState } from "../hooks/useChatPageState";
import { useRemoteChat } from "../hooks/useRemoteChat";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { useTitle } from "../hooks/useTitle";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

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
    sessionStatus,
    isStreaming,
    streamingContent,
    clearMessages,
    stopCurrentStream,
    retryMessage,
    editMessage,
    deleteMessage,
    chatMode,
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
    setChatMode,
    setSelectedSkillId,
    setSessionModelOverride,
    setSessionSettings,
    remoteBinding,
    remoteMessages,
    checkBotOnline,
    unbindRemote,
    input,
  });

  // Slash commands
  const slash = useSlashCommands({
    setChatMode,
    setSelectedSkillId,
    setSelectedCommandName,
    setInput,
  });

  // ── Send handler (AI chat) ──
  const handleSend = useCallback(
    (value: string) => {
      // Safety guard: prevent send when slash command panel is open
      if (slash.slashStateRef.current.open) return;
      if (value.trim() && !isStreaming) {
        sendMessage({
          mode: chatMode,
          skillId:
            chatMode === "skill" ? (selectedSkillId ?? undefined) : undefined,
          commandName:
            chatMode === "skill"
              ? (selectedCommandName ?? undefined)
              : undefined,
          searchEngine: selectedEngine || undefined,
          searchConfigs: searchConfigs,
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
      if (selection.mode === "skill" && selection.skillId) {
        setSelectedSkillId(selection.skillId);
      }
    },
    [setChatMode, setSelectedSkillId],
  );

  // ── Switch to remote conversation ──
  const handleSwitchToRemote = useCallback(
    (_id: string) => {
      pageState.setViewMode("remote");
    },
    [pageState.setViewMode],
  );

  // ── Page title ──
  const pageTitle = useMemo(
    () => (
      <ChatPageTitle
        hasMessages={messages.length > 0}
        isStreaming={isStreaming}
        remoteBinding={remoteBinding}
        unreadRemoteCount={pageState.unreadRemoteCount}
        viewMode={pageState.viewMode}
        sidebarVisible={pageState.sidebarVisible}
        onViewModeChange={pageState.setViewMode}
        onSearch={() => pageState.setIsSearchOpen(true)}
        onExport={() => pageState.setIsExportOpen(true)}
        onClear={clearMessages}
        onNewChat={() => useChatStore.getState().createConversation()}
        onToggleSidebar={() => pageState.setSidebarVisible((v) => !v)}
        onOpenSettings={() => pageState.setSettingsOpen(true)}
        onBindRemote={() => pageState.setRemoteBindModalOpen(true)}
        onUnbindRemote={unbindRemote}
      />
    ),
    [
      messages.length,
      isStreaming,
      remoteBinding,
      pageState.unreadRemoteCount,
      pageState.viewMode,
      pageState.sidebarVisible,
      pageState.setViewMode,
      clearMessages,
      unbindRemote,
      pageState.setIsSearchOpen,
      pageState.setIsExportOpen,
      pageState.setSidebarVisible,
      pageState.setSettingsOpen,
      pageState.setRemoteBindModalOpen,
    ],
  );
  useTitle(pageTitle);

  // ── Remote bind handler ──
  // If pendingNewRemoteRef is set, create a new conversation first then bind.
  const handleRemoteBind = useCallback(
    async (botId: string, chatId: string) => {
      try {
        // New remote session flow: create conversation before binding
        if (pageState.pendingNewRemoteRef.current) {
          pageState.pendingNewRemoteRef.current = false;
          await useChatStore.getState().createConversation();
        }
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
      pageState.pendingNewRemoteRef,
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

  return (
    <MainLayout>
      <div className="flex h-full">
        {/* Inline Collapsible Sidebar */}
        <ChatSidebar
          visible={pageState.sidebarVisible}
          onNewChat={pageState.handleNewChat}
          onNewRemoteChat={pageState.handleNewRemoteChat}
          newChatDisabled={
            isStreaming ||
            (!!pageState.currentConversationId && messages.length === 0)
          }
          activeTab={pageState.sidebarTab}
          onTabChange={pageState.setSidebarTab}
          unreadRemoteCount={pageState.unreadRemoteCount}
          onSwitchToRemote={handleSwitchToRemote}
        />

        {/* Main Chat Area */}
        <div className="flex flex-col flex-1 h-full min-w-0">
          <div
            className="flex flex-col h-full min-w-0"
            style={{ backgroundColor: token.colorBgLayout }}
          >
            {pageState.viewMode === "local" ? (
              <>
                {/* Session tip */}
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
                <div className="flex-1 overflow-hidden w-full px-4 sm:px-6">
                  {messages.length === 0 ? (
                    <ChatWelcomeScreen
                      hasActiveModel={hasActiveModel}
                      isModelLoading={isModelLoading}
                      onInputChange={setInput}
                      messageApi={message}
                    />
                  ) : (
                    <ChatMessageList
                      messages={messages}
                      isStreaming={isStreaming}
                      streamingContent={streamingContent}
                      sessionStatus={sessionStatus}
                      conversationId={pageState.conversationId}
                      bubbleListRef={pageState.bubbleListRef}
                      retryMessage={retryMessage}
                      editMessage={editMessage}
                      deleteMessage={deleteMessage}
                      respondToApproval={respondToApproval}
                    />
                  )}
                </div>

                {/* Input Area */}
                <ChatInputArea
                  input={input}
                  onInputChange={setInput}
                  onSend={handleSend}
                  isStreaming={isStreaming}
                  onStopStream={stopCurrentStream}
                  chatMode={chatMode}
                  onModeSelect={handleModeSelect}
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
                  onModeSelect={handleModeSelect}
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
          pageState.pendingNewRemoteRef.current = false;
        }}
        onBind={handleRemoteBind}
        checkBotOnline={checkBotOnline}
      />
    </MainLayout>
  );
};

export default Chat;
