import {
  EditOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { theme } from "antd";
import { useTranslation } from "react-i18next";
import type { ChatMode } from "../../hooks/useChat";

const { useToken } = theme;

interface ChatNewSessionProps {
  chatMode: ChatMode;
}

export function ChatNewSession({ chatMode }: ChatNewSessionProps) {
  const { t } = useTranslation("chat");
  const { token } = useToken();

  const isAgent = chatMode === "agent";

  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="text-center px-6">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
          style={{
            backgroundColor: isAgent
              ? token.colorPrimaryBg
              : token.colorFillQuaternary,
          }}
        >
          {isAgent ? (
            <ThunderboltOutlined
              className="text-2xl"
              style={{ color: token.colorPrimary }}
            />
          ) : (
            <RobotOutlined
              className="text-2xl"
              style={{ color: token.colorTextSecondary }}
            />
          )}
        </div>

        <div
          className="text-lg font-semibold mb-2"
          style={{ color: token.colorText }}
        >
          {isAgent
            ? t("newSession.titleAgent", "New Agent Conversation")
            : t("newSession.titleDirect", "New Conversation")}
        </div>

        <div
          className="text-sm mb-6"
          style={{ color: token.colorTextTertiary }}
        >
          {isAgent
            ? t(
                "newSession.descAgent",
                "Agent mode enables tool use and multi-step reasoning",
              )
            : t(
                "newSession.descDirect",
                "Type a message below to start the conversation",
              )}
        </div>

        <div
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
          style={{
            color: token.colorTextQuaternary,
            backgroundColor: token.colorFillQuaternary,
          }}
        >
          <EditOutlined />
          {t("newSession.hint", "Click + to start a new conversation")}
        </div>
      </div>
    </div>
  );
}
