import {
  BulbOutlined,
  FileTextOutlined,
  LeftOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  RightOutlined,
  RobotOutlined,
  SearchOutlined,
  TagsOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import { Sender } from "@ant-design/x";
import { App, Button, Flex, Tooltip, theme } from "antd";
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
import { FileUploadButton } from "../attachment/FileUpload";
import type { ChatModeSelection } from "./ChatModePanel";
import { ChatModePanel } from "./ChatModePanel";
import type { ChatMode } from "../../hooks/useChat";
import { SearchEnginePanel } from "./SearchEnginePanel";
import type { SlashItem } from "./SlashCommandPanel";
import { SlashCommandPanel } from "./SlashCommandPanel";

const { useToken } = theme;

// Toolbar item definition
interface ToolbarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

// Primary toolbar items - always visible
const PRIMARY_TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: "quote", icon: <PlusOutlined />, label: "toolbar.quote" },
  { id: "prompt", icon: <BulbOutlined />, label: "toolbar.prompt" },
  { id: "doc", icon: <FileTextOutlined />, label: "toolbar.doc" },
  { id: "tools", icon: <ToolOutlined />, label: "toolbar.tools" },
];

// Extra toolbar items - shown when "More" is expanded
const EXTRA_TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: "tags", icon: <TagsOutlined />, label: "toolbar.tags" },
  {
    id: "translate",
    icon: <TranslationOutlined />,
    label: "toolbar.translate",
  },
];

interface ChatInputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: (value: string) => void;
  isStreaming: boolean;
  onStopStream: () => void;
  chatMode: ChatMode;
  onModeSelect: (selection: ChatModeSelection) => void;
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
  onModeSelect,
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
  const senderWrapperRef = useRef<HTMLDivElement>(null);
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
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

  const handleToolbarClick = useCallback(
    (itemId: string) => {
      switch (itemId) {
        case "doc":
          message.info(
            t("toolbar.docComingSoon", "文档功能即将推出", { ns: "chat" }),
          );
          break;
        default:
          message.info(t(`toolbar.${itemId}`, { ns: "chat" }));
          break;
      }
    },
    [t, message],
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
        onSend(value);
        setAttachedFiles([]);
      }
    },
    [attachedFiles.length, isStreaming, onSend],
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
              selectedSkillId={null}
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
                    title={t("chatMode.switchMode", "切换模式", {
                      ns: "chat",
                    })}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={
                        chatMode === "skill" ? (
                          <ThunderboltOutlined />
                        ) : (
                          <RobotOutlined />
                        )
                      }
                      onClick={() => {
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

                  <div
                    className="w-px h-3 opacity-25"
                    style={{
                      backgroundColor: token.colorBorder,
                    }}
                  />

                  {/* File upload */}
                  <FileUploadButton
                    onUploadComplete={(attachments) => {
                      setAttachedFiles((prev) => [...prev, ...attachments]);
                    }}
                    conversationId={conversationId}
                  />

                  {/* Primary toolbar items */}
                  {PRIMARY_TOOLBAR_ITEMS.map((item) => (
                    <Tooltip
                      key={item.id}
                      title={t(item.label, {
                        ns: "chat",
                      })}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={item.icon}
                        onClick={() => handleToolbarClick(item.id)}
                      />
                    </Tooltip>
                  ))}

                  {/* Search engine - only show when engines are configured */}
                  {hasSearchEngines && (
                    <Tooltip
                      title={t("chat.toolbar.search", "搜索", {
                        ns: "chat",
                      })}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={currentEngine?.icon ?? <SearchOutlined />}
                        onClick={() =>
                          setSearchPopoverOpen(!searchPopoverOpen)
                        }
                        style={
                          searchPopoverOpen
                            ? {
                                backgroundColor: token.colorBgTextHover,
                              }
                            : selectedEngine
                              ? { color: token.colorPrimary }
                              : undefined
                        }
                      />
                    </Tooltip>
                  )}

                  {/* Extra items - visible when expanded */}
                  {toolbarExpanded && (
                    <>
                      <div
                        className="w-px h-3 opacity-25"
                        style={{
                          backgroundColor: token.colorBorder,
                        }}
                      />
                      {EXTRA_TOOLBAR_ITEMS.map((item) => (
                        <Tooltip
                          key={item.id}
                          title={t(item.label, {
                            ns: "chat",
                          })}
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={item.icon}
                            onClick={() => handleToolbarClick(item.id)}
                          />
                        </Tooltip>
                      ))}
                    </>
                  )}

                  <div
                    className="w-px h-3 opacity-25"
                    style={{
                      backgroundColor: token.colorBorder,
                    }}
                  />

                  {/* More / Collapse toggle */}
                  <Tooltip
                    title={
                      toolbarExpanded
                        ? t("toolbar.collapse", "收起", {
                            ns: "chat",
                          })
                        : t("toolbar.more", "更多", {
                            ns: "chat",
                          })
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={
                        toolbarExpanded ? (
                          <LeftOutlined />
                        ) : (
                          <RightOutlined />
                        )
                      }
                      onClick={() => setToolbarExpanded((prev) => !prev)}
                    />
                  </Tooltip>
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
