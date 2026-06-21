import { Flex, theme } from "antd";
import { useCallback, useState } from "react";
import { useChat } from "../../hooks/useChat";
import { useChatStore } from "../../stores/chatStore";
import { useProjectSettings, useProjectStore } from "../../stores/projectStore";
import type { ChatModeSelection } from "./ChatModePanel";
import { ApprovalModePill } from "./composer/ApprovalModePill";
import { ChatComposer } from "./composer/ChatComposer";
import { ChatComposerInfoBar } from "./composer/ChatComposerInfoBar";
import { ChatModePill } from "./composer/ChatModePill";
import { ModelPill } from "./composer/ModelPill";
import { ComposerStatusBar } from "./ComposerStatusBar";

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
 *
 * Footer 与 ChatInputArea 视觉对齐（简化版）：
 *   左：ChatModePill + (agent) ApprovalModePill
 *   右：ModelPill + Send
 * InfoBar：workspace + 本地远程 + ⋯ popup（含 ComposerStatusBar）。
 *
 * 取舍：欢迎页未引入 ChatToolsMenu / 搜索引擎 / Skill tag —— 它们依赖
 * conversation 范围内的状态（attachedFiles / searchEngine 等），首条消息
 * 发出后会切到 ChatInputArea，那里有完整工具集。
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
