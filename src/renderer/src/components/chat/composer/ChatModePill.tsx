import { DownOutlined, RobotOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatModePanel } from "../ChatModePanel";
import type { ChatMode } from "../../../hooks/useChat";
import type { ChatModeSelection } from "../ChatModePanel";

export interface ChatModePillProps {
  chatMode: ChatMode;
  isModeLocked: boolean;
  onSelect: (selection: ChatModeSelection) => void;
}

export function ChatModePill({ chatMode, isModeLocked, onSelect }: ChatModePillProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const isAgent = chatMode === "agent";
  const label = t(`chatMode.${chatMode}`, { ns: "chat", defaultValue: chatMode });

  const handleSelect = (selection: ChatModeSelection) => {
    onSelect(selection);
    setOpen(false);
  };

  return (
    <div className="relative inline-flex">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
          <ChatModePanel
            chatMode={chatMode}
            onSelect={handleSelect}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
      <Tooltip
        title={
          isModeLocked
            ? t("chatMode.modeLocked", { ns: "chat", defaultValue: "Mode locked" })
            : t("chatMode.switchMode", "切换模式", { ns: "chat" })
        }
      >
        <button
          type="button"
          disabled={isModeLocked}
          onClick={() => !isModeLocked && setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
          style={{
            background: open ? "rgba(0,0,0,0.06)" : "transparent",
            border: "none",
            cursor: isModeLocked ? "not-allowed" : "pointer",
            opacity: isModeLocked ? 0.6 : 1,
          }}
        >
          {isAgent ? <ThunderboltOutlined style={{ fontSize: 12 }} /> : <RobotOutlined style={{ fontSize: 12 }} />}
          <span>{label}</span>
          {!isModeLocked && <DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />}
        </button>
      </Tooltip>
    </div>
  );
}
