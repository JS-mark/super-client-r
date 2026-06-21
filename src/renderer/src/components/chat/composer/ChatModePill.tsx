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

  const tooltipTitle = isModeLocked
    ? t("chatMode.modeLocked", { ns: "chat", defaultValue: "Mode locked" })
    : t("chatMode.switchMode", "切换模式", { ns: "chat" });

  const classes = ["composer-pill"];
  if (open) classes.push("is-active");
  if (isModeLocked) classes.push("is-disabled");

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
      <Tooltip title={tooltipTitle}>
        <span className="inline-flex">
          <button
            type="button"
            disabled={isModeLocked}
            onClick={() => !isModeLocked && setOpen((v) => !v)}
            className={classes.join(" ")}
          >
            {isAgent ? <ThunderboltOutlined /> : <RobotOutlined />}
            <span>{label}</span>
            {!isModeLocked && <DownOutlined className="composer-pill-caret" />}
          </button>
        </span>
      </Tooltip>
    </div>
  );
}
