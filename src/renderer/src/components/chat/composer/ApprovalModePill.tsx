import { DownOutlined, SafetyOutlined } from "@ant-design/icons";
import { Popover, Radio, Space, Tooltip } from "antd";
import { useState } from "react";
import { useProjectStore } from "../../../stores/projectStore";
import type { ApprovalMode } from "@super-client/shared-types/chat";

export function approvalModeLabel(mode: ApprovalMode): string {
  switch (mode) {
    case "request":
      return "按需审批";
    case "auto-safe":
      return "替我审批";
    case "full-access":
      return "完全放行";
  }
}

export function approvalModeColor(mode: ApprovalMode): string {
  switch (mode) {
    case "request":
      return "default";
    case "auto-safe":
      return "blue";
    case "full-access":
      return "orange";
  }
}

const APPROVAL_MODES: ApprovalMode[] = ["request", "auto-safe", "full-access"];

export interface ApprovalModePillProps {
  projectId: string | null;
  approvalMode: ApprovalMode | undefined;
}

/**
 * 工作区级权限胶囊。仅在 agent 模式 + projectId !== null + approvalMode 已知时由调用方决定渲染。
 * 写回路径：useProjectStore.saveSettings(projectId, { runtimePolicy: { approvalMode } })。
 */
export function ApprovalModePill({ projectId, approvalMode }: ApprovalModePillProps) {
  const [open, setOpen] = useState(false);

  if (!projectId || !approvalMode) return null;

  const handleChange = async (next: ApprovalMode) => {
    if (next === approvalMode) {
      setOpen(false);
      return;
    }
    await useProjectStore.getState().saveSettings(projectId, {
      runtimePolicy: { approvalMode: next },
    });
    setOpen(false);
  };

  const popoverContent = (
    <Radio.Group
      value={approvalMode}
      onChange={(e) => void handleChange(e.target.value as ApprovalMode)}
    >
      <Space direction="vertical" size={4}>
        {APPROVAL_MODES.map((mode) => (
          <Radio key={mode} value={mode}>
            {approvalModeLabel(mode)}
          </Radio>
        ))}
      </Space>
    </Radio.Group>
  );

  const color = approvalModeColor(approvalMode);

  return (
    <Tooltip title="工作区级权限策略，影响该工作区所有会话">
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        content={popoverContent}
        placement="top"
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
          style={{
            background:
              color === "blue"
                ? "rgba(22,119,255,0.12)"
                : color === "orange"
                  ? "rgba(250,140,22,0.14)"
                  : "rgba(0,0,0,0.06)",
            color:
              color === "blue"
                ? "#1677ff"
                : color === "orange"
                  ? "#fa8c16"
                  : "inherit",
            border: "none",
            cursor: "pointer",
          }}
        >
          <SafetyOutlined style={{ fontSize: 12 }} />
          <span>{approvalModeLabel(approvalMode)}</span>
          <DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />
        </button>
      </Popover>
    </Tooltip>
  );
}
