import {
  CloseOutlined,
  PauseCircleOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { App, Button, Flex, Tag, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type Attachment,
  useAttachmentStore,
} from "../../stores/attachmentStore";
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
import { ChatToolsMenu } from "./composer/ChatToolsMenu";
import { ComposerStatusBar } from "./ComposerStatusBar";
import { useChatStore } from "../../stores/chatStore";
import { useProjectSettings, useProjectStore } from "../../stores/projectStore";
import type { ActionsComponents } from "@ant-design/x/lib/sender/interface";
import type { ChatMode } from "../../hooks/useChat";
import { SearchEnginePanel } from "./SearchEnginePanel";
import type { SlashItem } from "./SlashCommandPanel";
import { SlashCommandPanel } from "./SlashCommandPanel";
import { PromptTemplatePanel } from "./toolbar/PromptTemplatePanel";
import type { PromptTemplate } from "./toolbar/PromptTemplatePanel";
import { QuotePanel } from "./toolbar/QuotePanel";
import { ToolsPanel } from "./toolbar/ToolsPanel";
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
  const { message } = App.useApp();
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
  const [promptPanelOpen, setPromptPanelOpen] = useState(false);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeAllToolPanels = useCallback(() => {
    setPromptPanelOpen(false);
    setQuotePanelOpen(false);
    setToolsPanelOpen(false);
  }, []);

  const handleAttachmentFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const completed: Attachment[] = [];
      for (const file of Array.from(files)) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const result = await window.electron.file.saveAttachmentBytes({
            bytes,
            fileName: file.name,
            mimeType: file.type || undefined,
            conversationId,
          });
          if (!result.success || !result.data) {
            throw new Error(result.error || "saveAttachmentBytes failed");
          }
          const info = result.data;
          const ext = (file.name.split(".").pop() || "").toLowerCase();
          const mime = info.mimeType ?? file.type ?? "application/octet-stream";
          const type: Attachment["type"] = mime.startsWith("image/")
            ? "image"
            : mime.startsWith("video/")
              ? "video"
              : mime.startsWith("audio/")
                ? "audio"
                : mime.includes("pdf") ||
                    mime.includes("word") ||
                    mime.includes("excel")
                  ? "document"
                  : mime.includes("zip") ||
                      mime.includes("rar") ||
                      mime.includes("7z")
                    ? "archive"
                    : ["js", "ts", "jsx", "tsx", "json"].includes(ext)
                      ? "code"
                      : "other";
          const attachment: Attachment = {
            id: info.id,
            name: info.name ?? file.name,
            originalName: info.originalName ?? file.name,
            path: info.path,
            size: info.size ?? file.size,
            mimeType: mime,
            type,
            createdAt: info.createdAt ?? new Date().toISOString(),
            conversationId: info.conversationId ?? conversationId,
            messageId: info.messageId,
          };
          useAttachmentStore.getState().addAttachment(attachment);
          completed.push(attachment);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          message.error(
            t("attachment.upload.error", "上传失败：{{error}}", {
              error: errorMsg,
            }),
          );
        }
      }
      if (completed.length > 0) {
        setAttachedFiles((prev) => [...prev, ...completed]);
      }
    },
    [conversationId, message, t],
  );

  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
      {!hideToolbar && promptPanelOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
          <PromptTemplatePanel
            onSelect={(tpl) => {
              handlePromptSelect(tpl);
              closeAllToolPanels();
            }}
            onClose={closeAllToolPanels}
          />
        </div>
      )}
      {!hideToolbar && quotePanelOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
          <QuotePanel
            onSelect={(msg) => {
              handleQuoteSelect(msg);
              closeAllToolPanels();
            }}
            onClose={closeAllToolPanels}
          />
        </div>
      )}
      {!hideToolbar && toolsPanelOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
          <ToolsPanel
            onSelect={(tool) => {
              handleToolSelect(tool);
              closeAllToolPanels();
            }}
            onClose={closeAllToolPanels}
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
            <ChatToolsMenu
              onAttachment={handleAttachmentClick}
              onPromptTemplate={() => {
                closeAllToolPanels();
                setPromptPanelOpen(true);
              }}
              onQuote={() => {
                closeAllToolPanels();
                setQuotePanelOpen(true);
              }}
              onTools={() => {
                closeAllToolPanels();
                setToolsPanelOpen(true);
              }}
            />
            {hasSearchEngines && (
              <Tooltip
                title={
                  currentEngine?.name ??
                  t("chat.toolbar.search", "搜索", { ns: "chat" })
                }
              >
                <Button
                  type="text"
                  size="small"
                  icon={currentEngine?.icon ?? <SearchOutlined />}
                  onClick={() => setSearchPopoverOpen(!searchPopoverOpen)}
                  style={
                    searchPopoverOpen
                      ? { backgroundColor: token.colorBgTextHover }
                      : selectedEngine
                        ? { color: token.colorPrimary }
                        : undefined
                  }
                />
              </Tooltip>
            )}
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
      token,
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
      selectedEngine,
      hasSearchEngines,
      currentEngine,
      handleAttachmentClick,
      closeAllToolPanels,
    ],
  );

  return (
    <div className="chat-input-shell px-6 py-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleAttachmentFiles(e.target.files);
          if (e.target) e.target.value = "";
        }}
      />
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
              trailing={<ComposerStatusBar />}
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
