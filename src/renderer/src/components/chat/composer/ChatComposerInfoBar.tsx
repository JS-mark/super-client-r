import {
  DesktopOutlined,
  FolderOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { Popover, theme } from "antd";
import type * as React from "react";

const { useToken } = theme;

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
  /** Trailing slot — 用于挂 ⋯ popup（批次 B 后接入） */
  trailing?: React.ReactNode;
}

export function ChatComposerInfoBar({
  workspaceName,
  remoteBinding,
  onClickWorkspace,
  onClickLocalRemote,
  trailing,
}: ChatComposerInfoBarProps) {
  const { token } = useToken();
  const localRemoteLabel = deriveLocalRemoteLabel(remoteBinding);

  return (
    <div
      className="w-full mx-auto max-w-4xl flex items-center justify-between"
      style={{
        fontSize: 12,
        color: token.colorTextTertiary,
        lineHeight: "24px",
      }}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onClickWorkspace}
          disabled={!onClickWorkspace}
          className="flex items-center gap-1"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: onClickWorkspace ? "pointer" : "default",
          }}
        >
          <FolderOutlined style={{ fontSize: 12 }} />
          <span>{workspaceName}</span>
        </button>
        <button
          type="button"
          onClick={onClickLocalRemote}
          disabled={!onClickLocalRemote}
          className="flex items-center gap-1"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: onClickLocalRemote ? "pointer" : "default",
          }}
        >
          <DesktopOutlined style={{ fontSize: 12 }} />
          <span>{localRemoteLabel}</span>
        </button>
      </div>
      {trailing && (
        <Popover
          content={<div className="max-w-[420px]">{trailing}</div>}
          trigger="click"
          placement="topRight"
        >
          <button
            type="button"
            className="inline-flex items-center justify-center w-5 h-5 rounded"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
            aria-label="更多状态"
          >
            <MoreOutlined style={{ fontSize: 14 }} />
          </button>
        </Popover>
      )}
    </div>
  );
}
