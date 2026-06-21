import { App, Flex, theme } from "antd";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChat } from "../../hooks/useChat";
import { useChatStore } from "../../stores/chatStore";
import type { Message } from "../../stores/chatStore";
import {
  type Attachment,
  useAttachmentStore,
} from "../../stores/attachmentStore";
import { useProjectSettings, useProjectStore } from "../../stores/projectStore";
import { AttachmentList } from "../attachment";
import type { ChatModeSelection } from "./ChatModePanel";
import { ApprovalModePill } from "./composer/ApprovalModePill";
import { ChatComposer } from "./composer/ChatComposer";
import { ChatComposerInfoBar } from "./composer/ChatComposerInfoBar";
import { ChatModePill } from "./composer/ChatModePill";
import { ChatToolsMenu } from "./composer/ChatToolsMenu";
import { ModelPill } from "./composer/ModelPill";
import { ComposerStatusBar } from "./ComposerStatusBar";
import { PromptTemplatePanel } from "./toolbar/PromptTemplatePanel";
import type { PromptTemplate } from "./toolbar/PromptTemplatePanel";
import { QuotePanel } from "./toolbar/QuotePanel";
import { ToolsPanel } from "./toolbar/ToolsPanel";
import type { ToolItem } from "./toolbar/ToolsPanel";

const { useToken } = theme;

export interface ClaudeEmptyChatHomeProps {
  onSend: (text: string, attachmentIds?: string[]) => void;
  isStreaming?: boolean;
}

/**
 * Centered Claude-style empty chat home: workspace-aware title +
 * prominent composer card. Mounted in `Chat.tsx` for the
 * `claude-code` / `hybrid` interaction profiles when the
 * conversation has zero messages.
 *
 * Footer 与 ChatInputArea 视觉对齐：
 *   左：ChatToolsMenu + ChatModePill + (agent) ApprovalModePill
 *   右：ModelPill + Send
 * InfoBar：workspace + 本地远程 + ⋯ popup（含 ComposerStatusBar）。
 *
 * ChatToolsMenu 的四个回调（附件 / Prompt / 引用 / Tools）逻辑与
 * ChatInputArea 保持一致；搜索引擎与 Skill tag 暂不在欢迎页范围内。
 */
export function ClaudeEmptyChatHome({
  onSend,
  isStreaming = false,
}: ClaudeEmptyChatHomeProps) {
  const { token } = useToken();
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [text, setText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const [promptPanelOpen, setPromptPanelOpen] = useState(false);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentConvId = useChatStore((s) => s.currentConversationId);
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === currentConvId),
  );
  const projectId =
    conversation?.workspaceId && conversation.workspaceId !== "default"
      ? conversation.workspaceId
      : null;
  const project = useProjectStore((s) =>
    projectId ? s.projects.find((p) => p.id === projectId) : null,
  );

  const titleText = project
    ? `我们应该在 ${project.name} 中构建什么?`
    : "今天想做什么?";

  // Composer footer 派生数据
  const { chatMode, isModeLocked, setChatMode, getEffectiveModel } = useChat();
  const projectSettings = useProjectSettings(projectId);
  const approvalMode = projectSettings?.runtimePolicy?.approvalMode;

  const remoteBinding = conversation?.remote;
  const workspaceName = project?.name ?? "未指定工作区";

  const effective = getEffectiveModel();
  const modelLabel = effective
    ? `${effective.provider.name} · ${effective.model.name || effective.model.id}`
    : null;

  const handleOpenModelSwitcher = useCallback(() => {
    window.dispatchEvent(new Event("chat:open-model-switcher"));
  }, []);

  const handleModeSelect = useCallback(
    (selection: ChatModeSelection) => {
      setChatMode(selection.mode);
    },
    [setChatMode],
  );

  const closeAllToolPanels = useCallback(() => {
    setPromptPanelOpen(false);
    setQuotePanelOpen(false);
    setToolsPanelOpen(false);
  }, []);

  const handleAttachmentFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !currentConvId) return;
      const completed: Attachment[] = [];
      for (const file of Array.from(files)) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const result = await window.electron.file.saveAttachmentBytes({
            bytes,
            fileName: file.name,
            mimeType: file.type || undefined,
            conversationId: currentConvId,
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
            conversationId: info.conversationId ?? currentConvId,
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
    [currentConvId, message, t],
  );

  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePromptSelect = useCallback(
    (template: PromptTemplate) => {
      const next = template.template.replace(
        /\{\{(\w+)\}\}/g,
        (_match, key: string) => `[${key}]`,
      );
      setText(next);
      closeAllToolPanels();
    },
    [closeAllToolPanels],
  );

  const handleQuoteSelect = useCallback(
    (msg: Message) => {
      const role = msg.role === "user" ? "You" : "AI";
      const preview =
        msg.content.length > 200
          ? `${msg.content.slice(0, 200)}...`
          : msg.content;
      const quote = `> **${role}**: ${preview}\n\n`;
      setText((prev) => (prev ? `${prev}\n${quote}` : quote));
      closeAllToolPanels();
    },
    [closeAllToolPanels],
  );

  const handleToolSelect = useCallback(
    (tool: ToolItem) => {
      const hint = `Please use the "${tool.name}" tool to `;
      setText((prev) => (prev ? `${prev}\n${hint}` : hint));
      closeAllToolPanels();
    },
    [closeAllToolPanels],
  );

  return (
    <div
      className="flex w-full flex-col items-center justify-center"
      style={{
        backgroundColor: token.colorBgContainer,
        minHeight: "100%",
        paddingTop: "8vh",
        paddingBottom: "8vh",
      }}
    >
      <h1
        className="m-0 px-6"
        style={{
          fontWeight: 500,
          fontSize: 32,
          letterSpacing: "-0.01em",
          color: token.colorTextHeading,
          opacity: 0.92,
          marginBottom: 56,
          textAlign: "center",
          maxWidth: 760,
          lineHeight: 1.3,
        }}
      >
        {titleText}
      </h1>

      <div className="mx-auto w-full px-6" style={{ maxWidth: 760 }}>
        <ChatComposer
          value={text}
          onChange={setText}
          onSubmit={(value) => {
            if ((!value.trim() && attachedFiles.length === 0) || isStreaming)
              return;
            const attachmentIds = attachedFiles.map((f) => f.id);
            onSend(
              value.trim(),
              attachmentIds.length > 0 ? attachmentIds : undefined,
            );
            setText("");
            setAttachedFiles([]);
          }}
          isStreaming={isStreaming}
          placeholder="想做什么？"
          topOverlay={
            <>
              {promptPanelOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
                  <PromptTemplatePanel
                    onSelect={handlePromptSelect}
                    onClose={closeAllToolPanels}
                  />
                </div>
              )}
              {quotePanelOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
                  <QuotePanel
                    onSelect={handleQuoteSelect}
                    onClose={closeAllToolPanels}
                  />
                </div>
              )}
              {toolsPanelOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
                  <ToolsPanel
                    onSelect={handleToolSelect}
                    onClose={closeAllToolPanels}
                  />
                </div>
              )}
              {attachedFiles.length > 0 && (
                <div className="mb-2">
                  <AttachmentList
                    attachments={attachedFiles}
                    onRemove={(id) =>
                      setAttachedFiles((prev) =>
                        prev.filter((f) => f.id !== id),
                      )
                    }
                  />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  handleAttachmentFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          }
          infoBar={
            <ChatComposerInfoBar
              workspaceName={workspaceName}
              remoteBinding={remoteBinding}
              trailing={<ComposerStatusBar />}
            />
          }
          renderFooter={(_footerNode, opts) => {
            const { SendButton } = opts.components;
            return (
              <Flex justify="space-between" align="center">
                <Flex align="center" gap={8}>
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
                  <ChatModePill
                    chatMode={chatMode}
                    isModeLocked={isModeLocked}
                    onSelect={handleModeSelect}
                  />
                  {chatMode === "agent" && (
                    <ApprovalModePill
                      projectId={projectId}
                      approvalMode={approvalMode}
                    />
                  )}
                </Flex>
                <Flex align="center" gap={8}>
                  <ModelPill
                    label={modelLabel}
                    onClick={handleOpenModelSwitcher}
                  />
                  <SendButton type="primary" shape="circle" />
                </Flex>
              </Flex>
            );
          }}
        />
      </div>
    </div>
  );
}
