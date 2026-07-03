import { memo, useCallback, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Tag } from "antd";
import type {
	SubagentMessagePart,
} from "@super-client/shared-types/chat";
import type {
	SubagentRunSummary,
	SubagentTaskStatus,
} from "@super-client/shared-types/subagent";

export interface SubagentPartCardProps {
	part: SubagentMessagePart;
	className?: string;
}

type StatusChipColor = "blue" | "green" | "red" | "default";

function statusDefault(status: SubagentTaskStatus): string {
	switch (status) {
		case "spawned":
			return "Queued";
		case "running":
			return "Running";
		case "completed":
			return "Completed";
		case "failed":
			return "Failed";
		case "cancelled":
			return "Cancelled";
		default:
			return String(status);
	}
}

function statusColor(status: SubagentTaskStatus): StatusChipColor {
	switch (status) {
		case "spawned":
		case "running":
			return "blue";
		case "completed":
			return "green";
		case "failed":
			return "red";
		case "cancelled":
			return "default";
		default:
			return "default";
	}
}

function totalTokens(run: SubagentRunSummary): number | undefined {
	const usage = run.tokenUsage;
	if (!usage) return undefined;
	const input = typeof usage.input === "number" ? usage.input : 0;
	const output = typeof usage.output === "number" ? usage.output : 0;
	if (
		typeof usage.input !== "number" &&
		typeof usage.output !== "number"
	) {
		return undefined;
	}
	return input + output;
}

function formatEndedAt(endedAt?: number): string | undefined {
	if (typeof endedAt !== "number" || !Number.isFinite(endedAt)) return undefined;
	try {
		return new Date(endedAt).toLocaleString();
	} catch {
		return undefined;
	}
}

export const SubagentPartCard = memo(function SubagentPartCard({
	part,
	className,
}: SubagentPartCardProps) {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState<boolean>(part.collapsed === false);

	const toggle = useCallback(() => {
		setExpanded((prev) => !prev);
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				toggle();
			}
		},
		[toggle],
	);

	const run = part.run;
	const label =
		run.profileName?.trim() ||
		run.taskGoal?.trim() ||
		t("subagent.card.fallbackName", "Subagent", { ns: "chat" });

	const statusKey = `subagent.card.status.${run.status}`;
	const statusText = t(statusKey, statusDefault(run.status), { ns: "chat" });
	const chipColor = statusColor(run.status);

	const toolCount =
		typeof run.toolCallCount === "number" ? run.toolCallCount : 0;
	const tokenTotal = totalTokens(run);

	const toggleLabel = expanded
		? t("subagent.card.collapseLabel", "Collapse", { ns: "chat" })
		: t("subagent.card.expandLabel", "Expand", { ns: "chat" });

	const endedAtText = formatEndedAt(run.endedAt);

	const rootClass = [
		"my-2 overflow-hidden rounded-lg border border-black/10 bg-black/[0.02] text-sm dark:border-white/10 dark:bg-white/[0.03]",
		className ?? "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<section
			role="button"
			tabIndex={0}
			aria-expanded={expanded}
			aria-label={toggleLabel}
			data-part-id={`subagent-card-${run.subagentRunId}`}
			data-status={run.status}
			data-expanded={expanded ? "true" : "false"}
			onClick={toggle}
			onKeyDown={handleKeyDown}
			className={`${rootClass} cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40`}
		>
			<div className="flex min-w-0 items-center gap-2 px-3 py-2">
				<span
					aria-hidden="true"
					className="inline-block w-3 shrink-0 text-black/50 dark:text-white/50"
					data-testid="subagent-card-triangle"
				>
					{expanded ? "▼" : "▶"}
				</span>
				<span className="min-w-0 flex-1 truncate font-medium">{label}</span>
				<Tag
					bordered={false}
					color={chipColor}
					data-testid="subagent-card-status"
					data-status={run.status}
					style={{ fontSize: 11, marginInlineEnd: 0 }}
				>
					{statusText}
				</Tag>
				<Tag
					bordered={false}
					color="default"
					data-testid="subagent-card-tools"
					style={{ fontSize: 11, marginInlineEnd: 0 }}
				>
					{t("subagent.card.toolsCount", "{{count}} tools", {
						ns: "chat",
						count: toolCount,
					})}
				</Tag>
				{typeof tokenTotal === "number" && (
					<Tag
						bordered={false}
						color="default"
						data-testid="subagent-card-tokens"
						style={{ fontSize: 11, marginInlineEnd: 0 }}
					>
						{t("subagent.card.tokens", "{{value}} tok", {
							ns: "chat",
							value: tokenTotal,
						})}
					</Tag>
				)}
			</div>
			{expanded && (
				<div
					className="flex flex-col gap-2 border-t border-black/10 px-3 py-2 text-xs dark:border-white/10"
					data-testid="subagent-card-expanded"
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<div>
						<div className="mb-1 font-medium text-black/55 dark:text-white/55">
							{t("subagent.card.taskGoalLabel", "Task goal", {
								ns: "chat",
							})}
						</div>
						<div className="whitespace-pre-wrap break-words text-black/75 dark:text-white/75">
							{run.taskGoal ||
								t("subagent.card.fallbackName", "Subagent", { ns: "chat" })}
						</div>
					</div>
					{run.summary && (
						<div>
							<div className="mb-1 font-medium text-black/55 dark:text-white/55">
								{t("subagent.card.summaryLabel", "Summary", { ns: "chat" })}
							</div>
							<div className="whitespace-pre-wrap break-words text-black/70 dark:text-white/70">
								{run.summary}
							</div>
						</div>
					)}
					{run.status === "failed" && run.errorMessage && (
						<div>
							<div className="mb-1 font-medium text-red-600 dark:text-red-400">
								{t("subagent.card.errorLabel", "Error", { ns: "chat" })}
							</div>
							<div className="whitespace-pre-wrap break-words rounded bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">
								{run.errorMessage}
							</div>
						</div>
					)}
					{run.resultRef && (
						<div className="text-black/45 dark:text-white/45">
							<span className="font-mono">{run.resultRef}</span>
						</div>
					)}
					{endedAtText && (
						<div className="text-black/45 dark:text-white/45">
							{t("subagent.card.endedAtLabel", "Ended at", { ns: "chat" })}
							{": "}
							{endedAtText}
						</div>
					)}
				</div>
			)}
		</section>
	);
});
