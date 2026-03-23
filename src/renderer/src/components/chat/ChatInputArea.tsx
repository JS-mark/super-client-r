import {
  CloseOutlined,
  PauseCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Sender } from "@ant-design/x";
import { Button, Flex, Tag, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useRef, useState, useEffect } from "react";
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
import { ChatModePanel } from "./ChatModePanel";
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
  const senderWrapperRef = useRef<HTMLDivElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
  const [modePanelOpen, setModePanelOpen] = useState(false);

  // Register capture-phase keydown handler for slash commands
  useEffect(() => {
    const cleanup = registerKeydownHandler(senderWrapperRef.current);
    return cleanup;
  }, [registerKeydownHandler]);

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

  return (
    <div className="px-6 py-4">
      <div
        ref={senderWrapperRef}
        className="relative w-full mx-auto max-w-4xl"
      >
        {/* Chat Mode Panel */}
        {!hideToolbar && modePanelOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
            <ChatModePanel
              chatMode={chatMode}
              onSelect={handleModeSelect}
              onClose={() => setModePanelOpen(false)}
            />
          </div>
        )}

        {/* Slash Command Panel */}
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

        {/* Search Engine Panel */}
        {!hideToolbar && searchPopoverOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
            <SearchEnginePanel
              selectedEngine={selectedEngine}
              onSelectEngine={onSelectEngine}
              onClose={() => setSearchPopoverOpen(false)}
            />
          </div>
        )}

        {/* Attached files preview */}
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

        {/* Sender component */}
        <Sender
          value={input}
          onChange={handleSenderChange}
          onSubmit={handleSend}
          onCancel={isStreaming ? onStopStream : undefined}
          loading={isStreaming}
          placeholder={placeholderProp ?? t(
            "chat.placeholder",
            "在这里输入消息，按 Enter 发送",
          )}
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
              return false;
            }
          }}
          autoSize={{ minRows: 2, maxRows: 6 }}
          suffix={() => null}
          footer={(_footerNode, { components }) => {
            const { SendButton } = components;
            if (hideToolbar) {
              return (
                <Flex justify="end" align="center">
                  {isStreaming ? (
                    <Tooltip
                      title={t("actions.stop", "Stop", { ns: "chat" })}
                    >
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
                <Flex align="center" gap={4}>
                  {/* Mode selector */}
                  <Tooltip
                    title={
                      isModeLocked
                        ? t("chatMode.modeLocked", {
                            ns: "chat",
                            defaultValue: "Mode locked for this conversation",
                          })
                        : t("chatMode.switchMode", "切换模式", {
                            ns: "chat",
                          })
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      disabled={isModeLocked}
                      icon={
                        chatMode === "agent" ? (
                          <ThunderboltOutlined />
                        ) : (
                          <RobotOutlined />
                        )
                      }
                      onClick={() => {
                        if (isModeLocked) return;
                        setModePanelOpen(!modePanelOpen);
                        if (searchPopoverOpen) setSearchPopoverOpen(false);
                      }}
                      style={
                        modePanelOpen
                          ? { backgroundColor: token.colorBgTextHover }
                          : undefined
                      }
                    >
                      <span className="text-xs">
                        {t(`chatMode.${chatMode}`, { ns: "chat" })}
                      </span>
                    </Button>
                  </Tooltip>

                  {/* Agent team selector (agent mode only) */}
                  {chatMode === "agent" && <AgentTeamSelector />}

                  {/* Skill indicator tag */}
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

                  <div
                    className="w-px h-3 opacity-25"
                    style={{
                      backgroundColor: token.colorBorder,
                    }}
                  />

                  {/* Toolbar (file upload, prompt, quote, doc, tools, search, etc.) */}
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
                    <Tooltip
                      title={t("actions.stop", "终止", { ns: "chat" })}
                    >
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
          }}
          styles={{
            input: { fontSize: 14 },
          }}
        />
      </div>
    </div>
  );
}
