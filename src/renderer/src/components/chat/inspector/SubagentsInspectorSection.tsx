/**
 * SubagentsInspectorSection — right-side inspector body that lists all
 * subagent runs of the current conversation (Phase 4 Round 7 MVP).
 *
 * Rendered as a Collapse panel body by `CodexEnvironmentInspector`, so
 * we only return the *children* here; the parent Collapse owns the
 * fold state via its `defaultActiveKey`.
 *
 * MVP rows show:
 *   [status chip] [profileName || taskGoal] · [N tools] · [duration]
 *
 * Not in scope this round:
 *   - Navigation on row click (we surface an `onSelect` callback that
 *     wires up the click but do not implement navigation ourselves).
 */

import { RobotOutlined } from "@ant-design/icons";
import { Tag, theme } from "antd";
import { useTranslation } from "react-i18next";
import {
	useSubagentsInspectorData,
	type SubagentInspectorEntry,
} from "../../../hooks/useSubagentsInspectorData";
import type { SubagentTaskStatus } from "@super-client/shared-types/subagent";

const { useToken } = theme;

/** AntD Tag color per status. Values map to antd built-in preset colors. */
const STATUS_COLOR: Record<SubagentTaskStatus, string> = {
	spawned: "default",
	running: "processing",
	completed: "success",
	failed: "error",
	cancelled: "warning",
};

function formatDurationSeconds(startedAt: number, endedAt: number): number {
	const ms = Math.max(0, endedAt - startedAt);
	return Math.max(0, Math.round(ms / 100) / 10);
}

export interface SubagentsInspectorSectionProps {
	conversationId?: string;
	onSelect?: (entry: SubagentInspectorEntry) => void;
}

export function SubagentsInspectorSection({
	conversationId,
	onSelect,
}: SubagentsInspectorSectionProps) {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const entries = useSubagentsInspectorData(conversationId);

	if (entries.length === 0) {
		return (
			<div
				data-testid="subagents-inspector-empty"
				style={{
					fontSize: 12,
					color: token.colorTextTertiary,
					padding: "6px 0",
				}}
			>
				{t(
					"subagentsInspector.emptyHint",
					"No subagents have run in this conversation.",
				)}
			</div>
		);
	}

	return (
		<div
			className="flex flex-col"
			data-testid="subagents-inspector-section"
		>
			{entries.map((entry) => {
				const displayName =
					entry.profileName?.trim() ||
					entry.taskGoal?.trim() ||
					t("subagentsInspector.fallbackName", "Subagent");
				const durationSec =
					entry.endedAt != null
						? formatDurationSeconds(entry.startedAt, entry.endedAt)
						: null;
				return (
					<div
						key={entry.subagentRunId}
						data-testid="subagents-inspector-row"
						data-status={entry.status}
						role={onSelect ? "button" : undefined}
						tabIndex={onSelect ? 0 : undefined}
						onClick={onSelect ? () => onSelect(entry) : undefined}
						onKeyDown={
							onSelect
								? (e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											onSelect(entry);
										}
									}
								: undefined
						}
						className="flex items-center gap-2"
						style={{
							fontSize: 12,
							padding: "4px 0",
							color: token.colorText,
							cursor: onSelect ? "pointer" : "default",
						}}
					>
						<Tag
							color={STATUS_COLOR[entry.status]}
							style={{ fontSize: 11, margin: 0, flexShrink: 0 }}
							data-testid="subagents-inspector-status"
						>
							{t(
								`subagentsInspector.status.${entry.status}`,
								entry.status,
							)}
						</Tag>
						<span style={{ flexShrink: 0, color: token.colorTextSecondary }}>
							<RobotOutlined />
						</span>
						<span
							className="truncate"
							title={displayName}
							style={{ flex: 1, minWidth: 0 }}
						>
							{displayName}
						</span>
						{entry.toolCallCount != null && (
							<span
								style={{ color: token.colorTextTertiary, fontSize: 11 }}
								data-testid="subagents-inspector-tools"
							>
								{t("subagentsInspector.toolsCount", "{{count}} tools", {
									count: entry.toolCallCount,
								})}
							</span>
						)}
						{durationSec != null && (
							<span
								style={{ color: token.colorTextTertiary, fontSize: 11 }}
								data-testid="subagents-inspector-duration"
							>
								{t("subagentsInspector.durationSeconds", "{{seconds}}s", {
									seconds: durationSec,
								})}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

export default SubagentsInspectorSection;
