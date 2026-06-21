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
  const accentClass =
    color === "blue"
      ? " is-accent-blue"
      : color === "orange"
        ? " is-accent-orange"
        : "";
  const className =
    "composer-pill" + accentClass + (open ? " is-active" : "");

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      content={popoverContent}
      placement="top"
    >
      <Tooltip title={open ? undefined : "工作区级权限策略，影响该工作区所有会话"}>
        <button type="button" className={className}>
          <SafetyOutlined />
          <span>{approvalModeLabel(approvalMode)}</span>
          <DownOutlined className="composer-pill-caret" />
        </button>
      </Tooltip>
    </Popover>
  );
}
