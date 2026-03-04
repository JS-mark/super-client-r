import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  LoadingOutlined,
  MoreOutlined,
  ReloadOutlined,
  RobotOutlined,
  StarFilled,
  StarOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Bubble } from "@ant-design/x";
import type { BubbleItemType, BubbleListRef } from "@ant-design/x/es/bubble";
import { App, Avatar, Button, Dropdown, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChatSessionStatus, Message } from "../../stores/chatStore";
import { useMessageStore } from "../../stores/messageStore";
import type { ModelProviderPreset } from "../../types/models";
import { Markdown } from "../Markdown";
import { MessageContextMenu } from "./MessageContextMenu";
import { ProviderIcon } from "../models/ProviderIcon";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { ToolCallCard } from "./ToolCallCard";

const { useToken } = theme;

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  sessionStatus: ChatSessionStatus;
  conversationId: string;
  bubbleListRef: React.RefObject<BubbleListRef | null>;
  retryMessage: (messageId: string) => void;
  editMessage: (messageId: string) => void;
  deleteMessage: (messageId: string) => void;
  respondToApproval: (toolCallId: string, approved: boolean) => void;
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamingContent,
  sessionStatus,
  conversationId,
  bubbleListRef,
  retryMessage,
  editMessage,
  deleteMessage,
  respondToApproval,
}: ChatMessageListProps) {
  const { t } = useTranslation();
  const { token } = useToken();
  const { message: messageApi } = App.useApp();
  const { isBookmarked, addBookmark, removeBookmark, getBookmarkByMessageId } =
    useMessageStore();

  // ── Message action callbacks ──
  const handleCopyMessage = useCallback(
    (content: string) => {
      navigator.clipboard.writeText(content);
      messageApi.success(t("actions.copied", "已复制", { ns: "chat" }));
    },
    [messageApi, t],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      deleteMessage(messageId);
      messageApi.success(t("actions.deleted", "已删除", { ns: "chat" }));
    },
    [deleteMessage, messageApi, t],
  );

  const handleExportMessage = useCallback(
    (msg: { id: string; content: string }) => {
      const blob = new Blob([msg.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `message-${msg.id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      messageApi.success(
        t("chat.messageExported", "消息已导出", { ns: "chat" }),
      );
    },
    [messageApi, t],
  );

  const handleToggleBookmark = useCallback(
    (msg: { id: string; role: string; content: string; timestamp: number }) => {
      const bm = getBookmarkByMessageId(msg.id);
      if (bm) {
        removeBookmark(bm.id);
        messageApi.success(
          t("chat.bookmarkRemoved", "已取消收藏", { ns: "chat" }),
        );
      } else if (msg.role === "user" || msg.role === "assistant") {
        addBookmark({
          messageId: msg.id,
          conversationId,
          content: msg.content,
          role: msg.role as "user" | "assistant",
          timestamp: msg.timestamp,
        });
        messageApi.success(
          t("chat.bookmarkAdded", "已收藏消息", { ns: "chat" }),
        );
      }
    },
    [
      addBookmark,
      removeBookmark,
      getBookmarkByMessageId,
      conversationId,
      messageApi,
      t,
    ],
  );

  // ── Roles config ──
  const roles = useMemo(
    () => ({
      user: {
        placement: "end" as const,
        variant: "filled" as const,
        shape: "round" as const,
        rootClassName: "group",
        avatar: undefined as React.ReactNode,
        styles: {
          content: {
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            color: "#fff",
            width: "fit-content",
            marginLeft: "auto",
            paddingInline: 10,
            borderRadius: 12,
          },
        },
      },
      ai: {
        placement: "start" as const,
        variant: "borderless" as const,
        shape: "round" as const,
        rootClassName: "group",
        avatar: undefined as React.ReactNode,
        loadingRender: () => <ThinkingIndicator />,
        styles: {
          content: {
            display: "inline-block",
          },
        },
      },
    }),
    [],
  );

  // Format timestamp: MM/DD HH:mm
  const formatHeaderTime = useCallback((ts: number) => {
    const d = new Date(ts);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hour = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    return `${month}/${day} ${hour}:${minute}`;
  }, []);

  // ── Build bubble items ──
  const bubbleItems = useMemo(() => {
    // Step 1: Group messages into turns
    type Turn =
      | { type: "user"; msg: Message }
      | { type: "ai"; messages: Message[] };
    const turns: Turn[] = [];
    let currentAiMessages: Message[] | null = null;

    for (const msg of messages) {
      if (msg.role === "system") continue;

      if (msg.role === "user") {
        if (currentAiMessages) {
          turns.push({ type: "ai", messages: currentAiMessages });
          currentAiMessages = null;
        }
        turns.push({ type: "user", msg });
      } else {
        if (!currentAiMessages) currentAiMessages = [];
        currentAiMessages.push(msg);
      }
    }
    if (currentAiMessages) {
      turns.push({ type: "ai", messages: currentAiMessages });
    }

    // Step 2: Build bubble items from turns
    const result: BubbleItemType[] = [];
    for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
      const turn = turns[turnIdx];
      const isLastTurn = turnIdx === turns.length - 1;

      // ════════════════════════════════════════
      //  User turn
      // ════════════════════════════════════════
      if (turn.type === "user") {
        const msg = turn.msg;
        const timeText = formatHeaderTime(msg.timestamp);
        const meta = msg.metadata;
        const userHeader = (
          <div className="flex flex-col items-end gap-0.5 mb-1">
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: token.colorText,
                }}
              >
                {t("chat.user", "用户", { ns: "chat" })}
              </span>
              <Avatar
                icon={<UserOutlined />}
                size={28}
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                  color: "#fff",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: token.colorTextQuaternary,
              }}
            >
              {timeText}
            </span>
          </div>
        );

        // Token info
        const tokenText =
          meta?.inputTokens != null ? `↑${meta.inputTokens}` : "";
        const tokenInfo = (
          <div className="flex items-center gap-1.5">
            {isBookmarked(msg.id) && (
              <StarFilled className="text-yellow-500 text-xs" />
            )}
            {tokenText && (
              <span
                className="text-xs"
                style={{ color: token.colorTextQuaternary }}
              >
                {tokenText}
              </span>
            )}
          </div>
        );
        const tokenInfoEl =
          meta?.inputTokens != null ? (
            <Tooltip title={`Tokens: ↑${meta.inputTokens}`}>
              {tokenInfo}
            </Tooltip>
          ) : (
            tokenInfo
          );

        const actionBtnStyle = { color: token.colorTextTertiary };
        const actionButtons = (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Tooltip title={t("actions.retry", "重试", { ns: "chat" })}>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                style={actionBtnStyle}
                onClick={() => retryMessage(msg.id)}
              />
            </Tooltip>
            <Tooltip title={t("actions.edit", "编辑", { ns: "chat" })}>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                style={actionBtnStyle}
                onClick={() => editMessage(msg.id)}
              />
            </Tooltip>
            <Tooltip title={t("actions.copy", "复制", { ns: "chat" })}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                style={actionBtnStyle}
                onClick={() => handleCopyMessage(msg.content)}
              />
            </Tooltip>
            <Tooltip title={t("actions.delete", "删除", { ns: "chat" })}>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                style={actionBtnStyle}
                onClick={() => handleDeleteMessage(msg.id)}
              />
            </Tooltip>
          </div>
        );

        result.push({
          key: msg.id,
          role: "user" as const,
          content: msg.content,
          header: userHeader,
          contentRender: () => (
            <MessageContextMenu
              message={msg}
              conversationId={conversationId}
              onDelete={() => {
                messageApi.info(
                  t("chat.messageDeleteNotImplemented", "消息删除功能待实现", {
                    ns: "chat",
                  }),
                );
              }}
            >
              <div id={`msg-${msg.id}`} className="user-bubble-content">
                <Markdown content={msg.content} />
              </div>
            </MessageContextMenu>
          ),
          footer: (
            <div className="flex items-center justify-end gap-2">
              {actionButtons}
              {tokenInfoEl}
            </div>
          ),
        });
        continue;
      }

      // ════════════════════════════════════════
      //  AI turn (assistant + tool messages grouped)
      // ════════════════════════════════════════
      const aiMessages = turn.messages;
      const lastMsg = aiMessages[aiMessages.length - 1];
      const isStreamingTurn =
        isLastTurn && isStreaming && lastMsg.role === "assistant";

      // Pre-compute content parts
      const precomputedParts: Array<{ msg: Message; idx: number }> = [];
      for (let i = 0; i < aiMessages.length; i++) {
        const m = aiMessages[i];
        if (m.role === "assistant") {
          const isLastInTurn = i === aiMessages.length - 1;
          const content =
            isStreamingTurn && isLastInTurn ? streamingContent : m.content;
          if (content?.trim()) {
            precomputedParts.push({ msg: m, idx: i });
          }
        } else if (m.role === "tool" && m.toolCall) {
          precomputedParts.push({ msg: m, idx: i });
        }
      }

      // Skip empty AI turns
      if (precomputedParts.length === 0 && !isStreamingTurn) continue;

      // Metadata
      const firstAssistant = aiMessages.find((m) => m.role === "assistant");
      const meta =
        firstAssistant?.metadata ||
        aiMessages.find((m) => m.metadata)?.metadata;

      const timeText = formatHeaderTime(
        firstAssistant?.timestamp || aiMessages[0].timestamp,
      );

      // AI header
      const preset = meta?.providerPreset as ModelProviderPreset | undefined;
      const avatarNode = preset ? (
        <ProviderIcon preset={preset} size={28} />
      ) : (
        <Avatar
          icon={<RobotOutlined />}
          size={28}
          style={{
            background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
            color: "#fff",
          }}
        />
      );
      const modelName = meta?.model;
      const providerName = meta?.providerName;

      const aiHeader = (
        <div className="flex items-center gap-2 mb-1">
          {avatarNode}
          <div className="flex items-baseline gap-1.5">
            {modelName ? (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: token.colorText,
                }}
              >
                {modelName}
                {providerName && (
                  <span
                    style={{
                      fontWeight: 400,
                      color: token.colorTextTertiary,
                    }}
                  >
                    {" "}
                    | {providerName}
                  </span>
                )}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: token.colorText,
                }}
              >
                AI
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                color: token.colorTextQuaternary,
              }}
            >
              {timeText}
            </span>
          </div>
        </div>
      );

      // Content: interleave assistant text + tool cards
      const contentRender = () => {
        const parts: React.ReactNode[] = [];
        for (let i = 0; i < aiMessages.length; i++) {
          const m = aiMessages[i];
          if (m.role === "assistant") {
            const isLastInTurn = i === aiMessages.length - 1;
            const content =
              isStreamingTurn && isLastInTurn ? streamingContent : m.content;
            if (content?.trim()) {
              parts.push(
                <Markdown
                  key={m.id}
                  content={content}
                  streaming={isStreamingTurn && isLastInTurn}
                />,
              );
            }
          } else if (m.role === "tool" && m.toolCall) {
            parts.push(
              <ToolCallCard
                key={m.id}
                toolCall={m.toolCall}
                onApproval={respondToApproval}
              />,
            );
          }
        }
        if (parts.length === 0 && !isStreamingTurn) return null;

        const representative =
          [...aiMessages]
            .reverse()
            .find((m) => m.role === "assistant" && m.content?.trim()) ||
          firstAssistant ||
          aiMessages[0];

        return (
          <MessageContextMenu
            message={representative}
            conversationId={conversationId}
            onDelete={() => {
              messageApi.info(
                t("chat.messageDeleteNotImplemented", "消息删除功能待实现", {
                  ns: "chat",
                }),
              );
            }}
          >
            <div id={`msg-${firstAssistant?.id || aiMessages[0].id}`}>
              {parts}
              {isStreamingTurn && sessionStatus !== "idle" && (
                <div
                  className="flex items-center gap-1.5 mt-2"
                  style={{ color: token.colorTextTertiary, fontSize: 12 }}
                >
                  <LoadingOutlined spin style={{ fontSize: 12 }} />
                  <span>
                    {t(`sessionStatus.${sessionStatus}`, { ns: "chat" })}
                  </span>
                </div>
              )}
            </div>
          </MessageContextMenu>
        );
      };

      // Footer: token stats + action buttons
      const footerMeta = (() => {
        const lastAssistant = [...aiMessages]
          .reverse()
          .find((m) => m.role === "assistant");
        return lastAssistant?.metadata || meta;
      })();
      const combinedContent = aiMessages
        .filter((m) => m.role === "assistant" && m.content)
        .map((m) => m.content)
        .join("\n\n");
      const representativeMsg =
        [...aiMessages].reverse().find((m) => m.role === "assistant") ||
        aiMessages[0];

      const footer = (() => {
        const tooltipLines: string[] = [];
        if (footerMeta?.firstTokenMs != null) {
          tooltipLines.push(
            `${t("chat.metrics.firstToken", "首字时延", { ns: "chat" })} ${footerMeta.firstTokenMs} ms`,
          );
        }
        if (footerMeta?.tokensPerSecond != null) {
          tooltipLines.push(
            `${t("chat.metrics.speed", "每秒", { ns: "chat" })} ${footerMeta.tokensPerSecond} tokens`,
          );
        }
        if (footerMeta?.duration != null) {
          const seconds = (footerMeta.duration / 1000).toFixed(1);
          tooltipLines.push(
            `${t("chat.metrics.duration", "回答耗时", { ns: "chat" })} ${seconds} s`,
          );
        }
        if (footerMeta?.tokens != null) {
          const parts = [`Tokens: ${footerMeta.tokens}`];
          if (footerMeta.inputTokens != null)
            parts.push(`↑${footerMeta.inputTokens}`);
          if (footerMeta.outputTokens != null)
            parts.push(`↓${footerMeta.outputTokens}`);
          tooltipLines.push(parts.join(" "));
        }

        let tokenText = "";
        if (
          footerMeta?.inputTokens != null &&
          footerMeta?.outputTokens != null
        ) {
          tokenText = `↑${footerMeta.inputTokens} ↓${footerMeta.outputTokens}`;
        } else if (footerMeta?.tokens != null) {
          tokenText = `${footerMeta.tokens} tokens`;
        }

        const tokenInfo = (
          <div className="flex items-center gap-1.5">
            {isBookmarked(representativeMsg.id) && (
              <StarFilled className="text-yellow-500 text-xs" />
            )}
            {tokenText && (
              <span
                className="text-xs"
                style={{ color: token.colorTextQuaternary }}
              >
                {tokenText}
              </span>
            )}
          </div>
        );

        const tokenInfoWithTooltip =
          tooltipLines.length > 0 ? (
            <Tooltip
              title={tooltipLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            >
              {tokenInfo}
            </Tooltip>
          ) : (
            tokenInfo
          );

        const actionBtnStyle = { color: token.colorTextTertiary };
        const moreMenuItems = [
          {
            key: "bookmark",
            icon: isBookmarked(representativeMsg.id) ? (
              <StarFilled className="text-yellow-500" />
            ) : (
              <StarOutlined />
            ),
            label: isBookmarked(representativeMsg.id)
              ? t("chat.removeBookmark", "取消收藏", { ns: "chat" })
              : t("actions.bookmark", "收藏", { ns: "chat" }),
            onClick: () => handleToggleBookmark(representativeMsg),
          },
          {
            key: "export",
            icon: <DownloadOutlined />,
            label: t("actions.export", "导出", { ns: "chat" }),
            onClick: () => handleExportMessage(representativeMsg),
          },
        ];

        const actionButtons = (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Tooltip title={t("actions.copy", "复制", { ns: "chat" })}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                style={actionBtnStyle}
                onClick={() =>
                  handleCopyMessage(
                    isStreamingTurn ? streamingContent : combinedContent,
                  )
                }
              />
            </Tooltip>
            <Tooltip
              title={t("actions.regenerate", "重新生成", {
                ns: "chat",
              })}
            >
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                style={actionBtnStyle}
                onClick={() => retryMessage(representativeMsg.id)}
              />
            </Tooltip>
            <Tooltip title={t("actions.delete", "删除", { ns: "chat" })}>
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                style={actionBtnStyle}
                onClick={() => handleDeleteMessage(representativeMsg.id)}
              />
            </Tooltip>
            <Dropdown menu={{ items: moreMenuItems }} trigger={["click"]}>
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                style={actionBtnStyle}
              />
            </Dropdown>
          </div>
        );

        return (
          <div className="flex items-center gap-2">
            {tokenInfoWithTooltip}
            {actionButtons}
          </div>
        );
      })();

      result.push({
        key: firstAssistant?.id || aiMessages[0].id,
        role: "ai" as const,
        content: "",
        loading:
          isStreamingTurn &&
          !streamingContent?.trim() &&
          !aiMessages.some(
            (m) =>
              m.role === "tool" ||
              (m.role === "assistant" && m.content?.trim()),
          ),
        typing: isStreamingTurn
          ? { effect: "fade-in" as const, step: 5, interval: 50 }
          : undefined,
        header: aiHeader,
        contentRender,
        footer,
      });
    }
    return result;
  }, [
    messages,
    isStreaming,
    streamingContent,
    sessionStatus,
    conversationId,
    isBookmarked,
    messageApi,
    t,
    token.colorText,
    token.colorTextTertiary,
    token.colorTextQuaternary,
    formatHeaderTime,
    retryMessage,
    editMessage,
    handleCopyMessage,
    handleDeleteMessage,
    handleToggleBookmark,
    handleExportMessage,
    respondToApproval,
  ]);

  return (
    <Bubble.List
      ref={bubbleListRef}
      items={bubbleItems}
      role={roles}
      autoScroll
      className="h-full"
      styles={{
        content: {
          maxWidth: "56rem",
          margin: "0 auto",
          padding: "2rem 1.5rem",
        },
      }}
    />
  );
}
