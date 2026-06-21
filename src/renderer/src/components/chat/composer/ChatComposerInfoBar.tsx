import {
  DesktopOutlined,
  FolderOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { Popover } from "antd";
import type * as React from "react";

export function deriveLocalRemoteLabel(
  remote: unknown | null | undefined,
): string {
  return remote ? "已绑定 IM" : "本地模式";
}

export interface ChatComposerInfoBarProps {
  workspaceName: string;
  remoteBinding: unknown | null | undefined;
  onClickWorkspace?: () => void;
  onClickLocalRemote?: () => void;
  /** Trailing slot — 用于挂 ⋯ popup */
  trailing?: React.ReactNode;
}

export function ChatComposerInfoBar({
  workspaceName,
  remoteBinding,
  onClickWorkspace,
  onClickLocalRemote,
  trailing,
}: ChatComposerInfoBarProps) {
  const localRemoteLabel = deriveLocalRemoteLabel(remoteBinding);

  return (
    <div className="w-full mx-auto max-w-4xl flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClickWorkspace}
          disabled={!onClickWorkspace}
          className={`composer-info-item${onClickWorkspace ? " is-clickable" : ""}`}
        >
          <FolderOutlined />
          <span>{workspaceName}</span>
        </button>
        <button
          type="button"
          onClick={onClickLocalRemote}
          disabled={!onClickLocalRemote}
          className={`composer-info-item${onClickLocalRemote ? " is-clickable" : ""}`}
        >
          <DesktopOutlined />
          <span>{localRemoteLabel}</span>
        </button>
      </div>
      {trailing && (
        <Popover
          content={<div style={{ maxWidth: 420, padding: "4px 0" }}>{trailing}</div>}
          trigger="click"
          placement="topRight"
        >
          <button
            type="button"
            className="composer-info-item is-clickable"
            aria-label="更多状态"
            style={{ padding: "2px 4px" }}
          >
            <MoreOutlined style={{ fontSize: 14 }} />
          </button>
        </Popover>
      )}
    </div>
  );
}
