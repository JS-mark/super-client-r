import { BranchesOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";

/**
 * Round-4 Codex-style composer §4 — BranchPill (read-only slice).
 *
 * 分支列表 / switchBranch / createBranch 走后续批次；本轮只做展示：
 *   - 有分支：`🌿 <branch>`
 *   - 无分支 / 非 git 仓库：`🌿 no branch`（muted）
 * 不发起 git IPC；`branch` 由上层从 session meta 或 store 读取后透传。
 */

export interface BranchDescriptor {
	label: string;
	muted: boolean;
}

export function describeBranch(
	branch: string | null | undefined,
	fallbackLabel: string,
): BranchDescriptor {
	const trimmed = typeof branch === "string" ? branch.trim() : "";
	if (!trimmed) {
		return { label: fallbackLabel, muted: true };
	}
	return { label: trimmed, muted: false };
}

export interface BranchPillProps {
	branch: string | null | undefined;
	onClick?: () => void;
}

export function BranchPill({ branch, onClick }: BranchPillProps) {
	const { t } = useTranslation();
	const fallback = t("composer.branchPill.none", "no branch", { ns: "chat" });
	const { label, muted } = describeBranch(branch, fallback);

	const tooltip = muted
		? t(
				"composer.branchPill.tooltipMissing",
				"当前会话未关联 git 分支",
				{ ns: "chat" },
			)
		: t("composer.branchPill.tooltip", "分支 · {{branch}}", {
				ns: "chat",
				branch: label,
			});

	return (
		<Tooltip title={tooltip}>
			<button
				type="button"
				onClick={onClick}
				disabled={!onClick}
				aria-label={tooltip}
				className={
					"composer-pill" +
					(muted ? " is-muted" : "") +
					(onClick ? " is-clickable" : "")
				}
				style={muted ? { opacity: 0.55 } : undefined}
			>
				<BranchesOutlined />
				<span>{label}</span>
			</button>
		</Tooltip>
	);
}
