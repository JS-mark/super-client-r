import { RocketOutlined, ScheduleOutlined } from "@ant-design/icons";
import { Popover, Tooltip } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlanMode } from "@super-client/shared-types/chat";
import {
	AGENT_COMPOSER_MODE_DESCRIPTION,
	AGENT_COMPOSER_MODE_LABEL,
	type AgentComposerMode,
	toAgentComposerMode,
} from "../../../lib/planModePresentation";

/**
 * Round-4 Codex-style composer §3 — LaunchModePill (read-only slice).
 *
 * 说明：spec §3 里的「local vs worktree」被折叠回 Round-2 已定型的 Agent 双档
 * (`Plan` / `Execute`) —— 由 `toAgentComposerMode()` 从 `SessionMeta.planMode` 推导。
 * 编辑（切换 planMode / worktree）在本轮不做，点击只弹描述气泡。
 */

/** planMode 缺省时的展示 mode（对齐 spec §11 P1「先 disabled」占位口径）。 */
export function launchModeFromPlanMode(
	planMode: PlanMode | null | undefined,
): AgentComposerMode {
	if (!planMode) return "execute";
	return toAgentComposerMode(planMode);
}

export interface LaunchModePillProps {
	planMode: PlanMode | null | undefined;
}

export function LaunchModePill({ planMode }: LaunchModePillProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	const mode = launchModeFromPlanMode(planMode);
	const label =
		mode === "plan"
			? t("composer.launchMode.plan", AGENT_COMPOSER_MODE_LABEL.plan, {
					ns: "chat",
				})
			: t("composer.launchMode.execute", AGENT_COMPOSER_MODE_LABEL.execute, {
					ns: "chat",
				});
	const description =
		mode === "plan"
			? t(
					"composer.launchMode.planDesc",
					AGENT_COMPOSER_MODE_DESCRIPTION.plan,
					{ ns: "chat" },
				)
			: t(
					"composer.launchMode.executeDesc",
					AGENT_COMPOSER_MODE_DESCRIPTION.execute,
					{ ns: "chat" },
				);

	const icon =
		mode === "plan" ? <ScheduleOutlined /> : <RocketOutlined />;

	const popoverContent = (
		<div style={{ maxWidth: 260, padding: "4px 0" }}>
			<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
				{label}
			</div>
			<div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
				{description}
			</div>
		</div>
	);

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
			trigger="click"
			content={popoverContent}
			placement="top"
		>
			<Tooltip
				title={
					open
						? undefined
						: t("composer.launchMode.tooltip", "启动模式", { ns: "chat" })
				}
			>
				<button
					type="button"
					className={`composer-pill${open ? " is-active" : ""}`}
					aria-label={label}
				>
					{icon}
					<span>{label}</span>
				</button>
			</Tooltip>
		</Popover>
	);
}
