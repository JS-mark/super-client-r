import { theme } from "antd";
import { useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";
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

/**
 * Centered Claude-style empty chat home: workspace-aware title +
 * prominent composer card. Mounted in `Chat.tsx` for the
 * `claude-code` / `hybrid` interaction profiles when the
 * conversation has zero messages.
 */
export function ClaudeEmptyChatHome({
  onSend,
  isStreaming = false,
}: ClaudeEmptyChatHomeProps) {
  const { token } = useToken();
  const [text, setText] = useState("");

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
          textAlign: "center",
        }}
      >
        {titleText}
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
      </div>
    </div>
  );
}
