import {
  CloseOutlined,
  PauseCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Flex, Tag, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Attachment } from "../../stores/attachmentStore";
import {
  getShortcutFromEvent,
  normalizeShortcut,
  useShortcutStore,
} from "../../stores/shortcutStore";
import { AttachmentList } from "../attachment";
import { AgentTeamSelector } from "./AgentTeamSelector";
import type { ChatModeSelection } from "./ChatModePanel";
import { ApprovalModePill } from "./composer/ApprovalModePill";
import { ChatComposer } from "./composer/ChatComposer";
import { ChatComposerInfoBar } from "./composer/ChatComposerInfoBar";
import { ChatModePill } from "./composer/ChatModePill";
import { useChatStore } from "../../stores/chatStore";
import { useProjectSettings, useProjectStore } from "../../stores/projectStore";
import type { ActionsComponents } from "@ant-design/x/lib/sender/interface";
import type { ChatMode } from "../../hooks/useChat";
import { SearchEnginePanel } from "./SearchEnginePanel";
import type { SlashItem } from "./SlashCommandPanel";
import { SlashCommandPanel } from "./SlashCommandPanel";
import { ChatToolbar } from "./toolbar/ChatToolbar";
import type { PromptTemplate } from "./toolbar/PromptTemplatePanel";
import type { ToolItem } from "./toolbar/ToolsPanel";
import type { Message } from "../../stores/chatStore";

const { useToken } = theme;

interface ChatInputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: (value: string, attachmentIds?: string[]) => void;
  isStreaming: boolean;
  onStopStream: () => void;
  chatMode: ChatMode;
  isModeLocked: boolean;
  onModeSelect: (selection: ChatModeSelection) => void;
  selectedSkillId: string | null;
  onClearSkill: () => void;
  selectedEngine: string;
  onSelectEngine: (engine: string) => void;
  hasSearchEngines: boolean;
  currentEngine: { id: string; name: string; icon: React.ReactNode } | null;
  conversationId: string;
  // Slash panel (from useSlashCommands)
  slashPanelOpen: boolean;
  slashFilteredItems: SlashItem[];
  slashHighlight: number;
  onSlashHighlightChange: (index: number) => void;
  onSlashSelect: (item: SlashItem) => void;
  onSlashPanelClose: () => void;
  onSlashInputChange: (val: string) => void;
  registerKeydownHandler: (el: HTMLElement | null) => () => void;
  hideToolbar?: boolean;
  placeholder?: string;
}

export function ChatInputArea({
  input,
  onInputChange,
  onSend,
  isStreaming,
  onStopStream,
  chatMode,
  isModeLocked,
  onModeSelect,
  selectedSkillId,
  onClearSkill,
  selectedEngine,
  onSelectEngine,
  hasSearchEngines,
  currentEngine,
  conversationId,
  slashPanelOpen,
  slashFilteredItems,
  slashHighlight,
  onSlashHighlightChange,
  onSlashSelect,
  onSlashPanelClose,
  onSlashInputChange,
  registerKeydownHandler,
  hideToolbar,
  placeholder: placeholderProp,
}: ChatInputAreaProps) {
  const { t } = useTranslation();
  const { token } = useToken();
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
  const [modePanelOpen, setModePanelOpen] = useState(false);

  const handleModeSelect = useCallback(
    (selection: ChatModeSelection) => {
      onModeSelect(selection);
      setModePanelOpen(false);
    },
    [onModeSelect],
  );

  const handleSenderChange = useCallback(
    (val: string) => {
      onInputChange(val);
      onSlashInputChange(val);
    },
    [onInputChange, onSlashInputChange],
  );

  const handleSend = useCallback(
    (value: string) => {
      if ((value.trim() || attachedFiles.length > 0) && !isStreaming) {
        const attachmentIds = attachedFiles.map((f) => f.id);
        onSend(value, attachmentIds);
        setAttachedFiles([]);
      }
    },
    [attachedFiles, isStreaming, onSend],
  );

  const handlePromptSelect = useCallback(
    (template: PromptTemplate) => {
      // Insert template into input, replacing {{placeholders}} with selection hints
      const text = template.template.replace(
        /\{\{(\w+)\}\}/g,
        (_match, key: string) => `[${key}]`,
      );
      onInputChange(text);
    },
    [onInputChange],
  );

  const handleQuoteSelect = useCallback(
    (msg: Message) => {
      const role = msg.role === "user" ? "You" : "AI";
      const preview =
        msg.content.length > 200
          ? `${msg.content.slice(0, 200)}...`
          : msg.content;
      const quote = `> **${role}**: ${preview}\n\n`;
      onInputChange(input ? `${input}\n${quote}` : quote);
    },
    [onInputChange, input],
  );

  const handleToolSelect = useCallback(
    (tool: ToolItem) => {
      const hint = `Please use the "${tool.name}" tool to `;
      onInputChange(input ? `${input}\n${hint}` : hint);
    },
    [onInputChange, input],
  );

  const topOverlay = (
    <>
      {!hideToolbar && slashPanelOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
          <SlashCommandPanel
            items={slashFilteredItems}
            highlightIndex={slashHighlight}
            onSelect={onSlashSelect}
            onHighlightChange={onSlashHighlightChange}
            onClose={onSlashPanelClose}
          />
        </div>
      )}
      {!hideToolbar && searchPopoverOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
          <SearchEnginePanel
            selectedEngine={selectedEngine}
            onSelectEngine={onSelectEngine}
            onClose={() => setSearchPopoverOpen(false)}
          />
        </div>
      )}
      {attachedFiles.length > 0 && (
        <div className="mb-2">
          <AttachmentList
            attachments={attachedFiles}
            onRemove={(id) =>
              setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
            }
          />
        </div>
      )}
    </>
  );

  const currentConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === conversationId),
  );
  const projectId =
    currentConversation?.workspaceId &&
    currentConversation.workspaceId !== "default"
      ? currentConversation.workspaceId
      : null;
  const project = useProjectStore((s) =>
    projectId ? s.projects.find((p) => p.id === projectId) : null,
  );
  const workspaceName = project?.name ?? "未指定工作区";
  const remoteBinding = currentConversation?.remote;
  const projectSettings = useProjectSettings(projectId);
  const approvalMode = projectSettings?.runtimePolicy?.approvalMode;

  const existingFooterFn = useCallback(
    (
      _footerNode: React.ReactNode,
      opts: { components: ActionsComponents },
    ) => {
      const { SendButton } = opts.components;
      if (hideToolbar) {
        return (
          <Flex justify="end" align="center">
            {isStreaming ? (
              <Tooltip title={t("actions.stop", "Stop", { ns: "chat" })}>
                <Button
                  className="chat-stop-btn"
                  type="primary"
                  danger
                  shape="circle"
                  icon={<PauseCircleOutlined />}
                  onClick={onStopStream}
                />
              </Tooltip>
            ) : (
              <SendButton
                className="chat-send-btn"
                type="primary"
                shape="circle"
              />
            )}
          </Flex>
        );
      }
      return (
        <Flex justify="space-between" align="center">
          <Flex align="center" gap={8}>
            <ChatModePill
              chatMode={chatMode}
              isModeLocked={isModeLocked}
              onSelect={onModeSelect}
            />
            {chatMode === "agent" && (
              <ApprovalModePill
                projectId={projectId}
                approvalMode={approvalMode}
              />
            )}
            {chatMode === "agent" && <AgentTeamSelector />}
            {selectedSkillId && (
              <Tag
                color="green"
                className="text-xs flex items-center gap-0.5 m-0"
                closeIcon={<CloseOutlined className="text-[10px]" />}
                onClose={(e) => {
                  e.preventDefault();
                  onClearSkill();
                }}
              >
                <ThunderboltOutlined className="text-[10px]" />
                <span className="ml-0.5">
                  {t("chatMode.skillActive", "Skill", { ns: "chat" })}
                </span>
              </Tag>
            )}
            {/* 过渡期保留 ChatToolbar 在右侧 — 批次 C (T9) 替换为 ChatToolsMenu */}
            <ChatToolbar
              conversationId={conversationId}
              selectedEngine={selectedEngine}
              onSelectEngine={onSelectEngine}
              hasSearchEngines={hasSearchEngines}
              currentEngine={currentEngine}
              searchPopoverOpen={searchPopoverOpen}
              onSearchPopoverToggle={() =>
                setSearchPopoverOpen(!searchPopoverOpen)
              }
              onUploadComplete={(attachments) => {
                setAttachedFiles((prev) => [...prev, ...attachments]);
              }}
              onPromptSelect={handlePromptSelect}
              onQuoteSelect={handleQuoteSelect}
              onToolSelect={handleToolSelect}
            />
          </Flex>

          {/* Send or Stop button */}
          <Flex align="center" gap={8}>
            {isStreaming ? (
              <Tooltip title={t("actions.stop", "终止", { ns: "chat" })}>
                <Button
                  className="chat-stop-btn"
                  type="primary"
                  danger
                  shape="circle"
                  icon={<PauseCircleOutlined />}
                  onClick={onStopStream}
                />
              </Tooltip>
            ) : (
              <SendButton
                className="chat-send-btn"
                type="primary"
                shape="circle"
              />
            )}
          </Flex>
        </Flex>
      );
    },
    [
      t,
      hideToolbar,
      isStreaming,
      onStopStream,
      chatMode,
      isModeLocked,
      onModeSelect,
      projectId,
      approvalMode,
      searchPopoverOpen,
      selectedSkillId,
      onClearSkill,
      conversationId,
      selectedEngine,
      onSelectEngine,
      hasSearchEngines,
      currentEngine,
      handlePromptSelect,
      handleQuoteSelect,
      handleToolSelect,
    ],
  );

  return (
    <div className="chat-input-shell px-6 py-4">
      <ChatComposer
        value={input}
        onChange={handleSenderChange}
        onSubmit={handleSend}
        isStreaming={isStreaming}
        onStopStream={onStopStream}
        placeholder={
          placeholderProp ??
          t("chat.placeholder", "在这里输入消息，按 Enter 发送")
        }
        hideToolbar={hideToolbar}
        infoBar={
          hideToolbar ? null : (
            <ChatComposerInfoBar
              workspaceName={workspaceName}
              remoteBinding={remoteBinding}
            />
          )
        }
        topOverlay={topOverlay}
        registerKeydownHandler={registerKeydownHandler}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          const { getShortcut } = useShortcutStore.getState();
          const sendShortcut = getShortcut("send-message");
          const newLineShortcut = getShortcut("new-line");
          const pressed = normalizeShortcut(
            getShortcutFromEvent(e.nativeEvent),
          );
          if (
            newLineShortcut?.enabled &&
            normalizeShortcut(newLineShortcut.currentKey) === pressed
          ) {
            return;
          }
          if (
            sendShortcut?.enabled &&
            normalizeShortcut(sendShortcut.currentKey) === pressed
          ) {
            e.preventDefault();
            handleSend(input);
          }
        }}
        renderFooter={existingFooterFn}
      />
    </div>
  );
}
