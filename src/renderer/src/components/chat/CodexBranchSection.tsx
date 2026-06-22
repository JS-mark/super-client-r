/**
 * Branch section of the Codex Environment Inspector.
 * Split out to keep the parent component under its line budget.
 */

import { BranchesOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Skeleton, Tag, Tooltip, theme } from "antd";
import { useCallback, useEffect, useState } from "react";

import { gitService } from "../../services/gitService";
import type { GitBranchInfo } from "@super-client/shared-types/git";

const { useToken } = theme;

export interface CodexBranchSectionProps {
	conversationId: string | null;
	/** Receives the rendered refresh button so the parent can mount it in the section header. */
	onHeaderActionsChange?: (node: React.ReactNode) => void;
}

export function useCodexBranchSection(conversationId: string | null) {
	const { token } = useToken();
	const [branchInfo, setBranchInfo] = useState<GitBranchInfo | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetch = useCallback(async (id: string) => {
		setLoading(true);
		setError(null);
		try {
			// G-2 之后 resolveSessionCwd 返回 per-session 沙箱目录，不是项目目录。
			// 分支信息要看的是项目本身的仓库，所以这里用 resolveProjectRoot。
			// casual 会话没有项目根 → 走「非 git 仓库」分支即可（UI 已经能处理）。
			const rootRes = await window.electron.cwd.resolveProjectRoot(id);
			if (!rootRes.success || !rootRes.data) {
				setBranchInfo(null);
				setError(null); // 无项目不是错，让 UI 自然显示「非 git 仓库」
				return;
			}
			const res = await gitService.getBranchInfo(rootRes.data);
			if (res.success && res.data) setBranchInfo(res.data);
			else {
				setBranchInfo(null);
				setError(res.error ?? "无法获取分支信息");
			}
		} catch (err) {
			setBranchInfo(null);
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!conversationId) {
			setBranchInfo(null);
			setError(null);
			return;
		}
		void fetch(conversationId);
	}, [conversationId, fetch]);

	const refresh = useCallback(() => {
		if (conversationId) void fetch(conversationId);
	}, [conversationId, fetch]);

	const ahead = branchInfo?.ahead ?? 0;
	const behind = branchInfo?.behind ?? 0;
	const summary = loading ? (
		<Skeleton active paragraph={{ rows: 1 }} title={false} />
	) : !branchInfo || error || !branchInfo.isRepo ? (
		<div style={{ fontSize: 12, color: token.colorTextSecondary }}>
			非 git 仓库
		</div>
	) : (
		<div className="flex items-center gap-2 flex-wrap">
			<span style={{ fontSize: 12, color: token.colorText }}>
				<BranchesOutlined /> {branchInfo.branch ?? "—"}
			</span>
			<Tag
				color={branchInfo.dirty ? "orange" : "green"}
				style={{ fontSize: 11, marginInlineEnd: 0 }}
			>
				{branchInfo.dirty ? "dirty" : "clean"}
			</Tag>
			{(ahead > 0 || behind > 0) && (
				<span style={{ fontSize: 11, color: token.colorTextSecondary }}>
					↑{ahead} ↓{behind}
				</span>
			)}
		</div>
	);

	const content = (
		<div className="flex flex-col gap-2">
			{summary}
			<div className="flex gap-2">
				<Tooltip title="即将推出">
					<Button size="small" disabled>
						提交
					</Button>
				</Tooltip>
				<Tooltip title="即将推出">
					<Button size="small" disabled>
						推送
					</Button>
				</Tooltip>
			</div>
		</div>
	);

	const refreshButton = (
		<Tooltip title="刷新">
			<Button
				type="text"
				size="small"
				icon={<ReloadOutlined />}
				loading={loading}
				onClick={(e) => {
					e.stopPropagation();
					refresh();
				}}
			/>
		</Tooltip>
	);

	return { content, refreshButton, refresh };
}
