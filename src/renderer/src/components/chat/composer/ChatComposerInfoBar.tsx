import {
	DesktopOutlined,
	FolderOutlined,
	MoreOutlined,
} from "@ant-design/icons";
import { Popover } from "antd";
import type * as React from "react";
import type { PlanMode } from "@super-client/shared-types/chat";
import type { Project } from "@super-client/shared-types/project";
import { BranchPill } from "./BranchPill";
import { LaunchModePill } from "./LaunchModePill";
import { ProjectPill } from "./ProjectPill";

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
	/**
	 * Round-4 Codex composer §2 项目 pill 数据源。缺省时该 pill 不渲染
	 * （casual session）。
	 */
	project?: Project | null;
	/**
	 * Round-4 §3 launchMode pill。当前会话的 planMode（`SessionMeta.planMode`）。
	 * 缺省时按 execute 显示。
	 */
	planMode?: PlanMode | null;
	/**
	 * Round-4 §4 branch pill。有分支名 → 直接展示；缺省 → 展示 muted "no branch"。
	 * 本轮不发起 git IPC，由上层从 store / session meta 透传。
	 */
	branch?: string | null;
	/** Trailing slot — 用于挂 ⋯ popup */
	trailing?: React.ReactNode;
}

export function ChatComposerInfoBar({
	workspaceName,
	remoteBinding,
	onClickWorkspace,
	onClickLocalRemote,
	project,
	planMode,
	branch,
	trailing,
}: ChatComposerInfoBarProps) {
	const localRemoteLabel = deriveLocalRemoteLabel(remoteBinding);

	return (
		<div className="w-full mx-auto max-w-4xl flex items-center justify-between">
			<div className="flex items-center gap-2 flex-wrap">
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
				{/*
				 * Round-4 §2/§3/§4: read-only 新增 pill 组。数据缺失时优雅隐藏
				 * （project=null / planMode=null / branch=null）而不改动 layout 语义。
				 */}
				{project ? <ProjectPill project={project} /> : null}
				<LaunchModePill planMode={planMode ?? undefined} />
				<BranchPill branch={branch ?? undefined} />
			</div>
			{trailing && (
				<Popover
					content={
						<div style={{ maxWidth: 420, padding: "4px 0" }}>{trailing}</div>
					}
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
