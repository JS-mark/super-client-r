import { CloseOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { theme } from "antd";
import { useCallback, useMemo, useState } from "react";
import { useUserStore } from "../../stores/userStore";
import { ChatComposer } from "./composer/ChatComposer";

const { useToken } = theme;

export interface ClaudeEmptyChatHomeProps {
  userName?: string;
  modelLabel?: string;
  onSend: (text: string) => void;
  isStreaming?: boolean;
  onOpenModelSwitcher?: () => void;
  onOpenAttachment?: () => void;
}

interface QuickChip {
  key: string;
  label: string;
  prefill: string;
  more?: boolean;
}

/** Preset quick-intent chips shown beneath the centered composer. */
const QUICK_CHIPS: QuickChip[] = [
  { key: "code", label: "写代码", prefill: "帮我写一段代码：" },
  { key: "summarize", label: "总结文档", prefill: "请帮我总结以下内容：" },
  { key: "explain", label: "解释概念", prefill: "请通俗地解释：" },
  { key: "translate", label: "翻译", prefill: "请翻译以下内容：" },
  { key: "brainstorm", label: "头脑风暴", prefill: "和我一起头脑风暴：" },
  { key: "more", label: "… 更多", prefill: "", more: true },
];

const SERIF_FONT_FAMILY =
  'ui-serif, "PingFang SC", "Hiragino Sans GB", serif';

/** Time-of-day greeting in Chinese. */
function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour <= 11) return "早安";
  if (hour >= 12 && hour <= 13) return "中午好";
  if (hour >= 14 && hour <= 18) return "下午好";
  if (hour >= 19 && hour <= 23) return "晚上好";
  return "夜深了";
}

/**
 * Centered Claude-style empty chat home: editorial greeting + prominent
 * composer card + airy quick-intent chips + small footnote notice.
 * Mounted in `Chat.tsx` for the `claude-code` / `hybrid` interaction
 * profiles when the conversation has zero messages.
 */
export function ClaudeEmptyChatHome({
  userName,
  onSend,
  isStreaming = false,
}: ClaudeEmptyChatHomeProps) {
  const { token } = useToken();
  const storeUserName = useUserStore((s) => s.user?.name);
  const [text, setText] = useState("");
  const [noticeVisible, setNoticeVisible] = useState(true);

  const displayName = userName ?? storeUserName ?? "你";

  const timeWord = useMemo(
    () => getTimeGreeting(new Date().getHours()),
    [],
  );

  const handleChipClick = useCallback((chip: QuickChip) => {
    if (chip.more) return;
    setText((prev) => (prev ? prev : chip.prefill));
  }, []);

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
        className="m-0"
        style={{
          fontWeight: 400,
          fontSize: 30,
          letterSpacing: "-0.01em",
          color: token.colorTextHeading,
          opacity: 0.88,
          marginBottom: 44,
        }}
      >
        <span style={{ fontFamily: SERIF_FONT_FAMILY, fontStyle: "italic" }}>
          {timeWord}
        </span>
        <span>，{displayName}</span>
      </h1>

      <div className="mx-auto w-full" style={{ maxWidth: 680 }}>
        <ChatComposer
          value={text}
          onChange={setText}
          onSubmit={(value) => {
            if (!value.trim() || isStreaming) return;
            onSend(value.trim());
            setText("");
          }}
          isStreaming={isStreaming}
          placeholder="想做什么？"
          renderFooter={(_footerNode, opts) => {
            const { SendButton } = opts.components;
            return (
              <div className="flex items-center justify-between">
                <div />
                <SendButton type="primary" shape="circle" />
              </div>
            );
          }}
        />

        <div
          className="flex flex-wrap items-center justify-center"
          style={{ gap: 8, marginTop: 16 }}
        >
          {QUICK_CHIPS.map((chip) => (
            <ChipButton
              key={chip.key}
              chip={chip}
              onClick={() => handleChipClick(chip)}
            />
          ))}
        </div>

        {noticeVisible && (
          <div
            className="flex items-center justify-center"
            style={{
              marginTop: 28,
              fontSize: 12,
              color: token.colorTextTertiary,
              gap: 6,
            }}
          >
            <InfoCircleOutlined style={{ fontSize: 12 }} />
            <span>提示：在右上角切换工作区可改变默认模型</span>
            <button
              type="button"
              onClick={() => setNoticeVisible(false)}
              aria-label="关闭提示"
              style={{
                background: "transparent",
                border: "none",
                color: token.colorTextTertiary,
                cursor: "pointer",
                padding: 2,
                marginLeft: 4,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <CloseOutlined style={{ fontSize: 10 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Pill-shaped quick-intent chip with hover state. */
function ChipButton({
  chip,
  onClick,
}: {
  chip: QuickChip;
  onClick: () => void;
}) {
  const { token } = useToken();
  const [hover, setHover] = useState(false);
  const isDark = token.colorBgBase !== "#ffffff";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: 999,
        padding: "6px 14px",
        fontSize: 13,
        background: hover
          ? isDark
            ? "rgba(255,255,255,0.04)"
            : "rgba(0,0,0,0.025)"
          : "transparent",
        border: `1px solid ${
          hover ? token.colorBorder : token.colorBorderSecondary
        }`,
        color: token.colorTextSecondary,
        cursor: "pointer",
        transition: "background 150ms, border-color 150ms",
        whiteSpace: "nowrap",
      }}
    >
      {chip.label}
    </button>
  );
}
