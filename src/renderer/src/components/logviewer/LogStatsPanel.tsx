/**
 * LogStatsPanel - Collapsible statistics overview panel
 */

import {
	BarChartOutlined,
	DownOutlined,
	UpOutlined,
	WarningOutlined,
} from "@ant-design/icons";
import { Badge, Button, Tag, Tooltip } from "antd";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLogViewerStore } from "../../stores/logViewerStore";

const LEVEL_COLORS: Record<string, string> = {
	DEBUG: "default",
	INFO: "blue",
	WARN: "orange",
	ERROR: "red",
};

export const LogStatsPanel: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const stats = useLogViewerStore((s) => s.stats);
	const statsExpanded = useLogViewerStore((s) => s.statsExpanded);
	const setStatsExpanded = useLogViewerStore((s) => s.setStatsExpanded);

	const handleToggle = useCallback(() => {
		setStatsExpanded(!statsExpanded);
	}, [statsExpanded, setStatsExpanded]);

	if (!stats) return null;

	return (
		<div className="border border-solid border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
			{/* Header - always visible */}
			<div
				className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
				onClick={handleToggle}
			>
				<div className="flex items-center gap-4">
					<span className="flex items-center gap-1.5 text-sm font-medium">
						<BarChartOutlined />
						{t("stats.title")}
					</span>
					<Badge count={stats.totalCount} showZero overflowCount={99999} />
					{stats.recentErrorCount > 0 && (
						<Tooltip title={t("stats.recentErrors")}>
							<Tag icon={<WarningOutlined />} color="error">
								{stats.recentErrorCount}
							</Tag>
						</Tooltip>
					)}
					{/* Level breakdown inline */}
					<div className="flex items-center gap-1">
						{Object.entries(stats.countByLevel).map(([level, count]) => (
							<Tag
								key={level}
								color={LEVEL_COLORS[level] || "default"}
								className="!text-xs"
							>
								{level}: {count}
							</Tag>
						))}
					</div>
				</div>
				<Button
					type="text"
					size="small"
					icon={statsExpanded ? <UpOutlined /> : <DownOutlined />}
				>
					{statsExpanded ? t("stats.collapse") : t("stats.expand")}
				</Button>
			</div>

			{/* Expanded content */}
			{statsExpanded && (
				<div className="px-4 py-3 border-t border-solid border-gray-200 dark:border-gray-700 space-y-3">
					{/* Top modules */}
					{Object.keys(stats.countByModule).length > 0 && (
						<div>
							<span className="text-xs text-gray-500 mr-2">
								{t("stats.byModule")}:
							</span>
							<div className="inline-flex flex-wrap gap-1">
								{Object.entries(stats.countByModule)
									.slice(0, 10)
									.map(([mod, count]) => (
										<Tag key={mod} className="!text-xs">
											{mod}: {count}
										</Tag>
									))}
							</div>
						</div>
					)}

					{/* Process breakdown */}
					{Object.keys(stats.countByProcess).length > 0 && (
						<div>
							<span className="text-xs text-gray-500 mr-2">
								{t("stats.byProcess")}:
							</span>
							<div className="inline-flex flex-wrap gap-1">
								{Object.entries(stats.countByProcess).map(
									([proc, count]) => (
										<Tag key={proc} color="cyan" className="!text-xs">
											{proc}: {count}
										</Tag>
									),
								)}
							</div>
						</div>
					)}

					{/* 24h histogram (simple text representation) */}
					{stats.timeHistogram.length > 0 && (
						<div>
							<span className="text-xs text-gray-500 mr-2">
								{t("stats.histogram")}:
							</span>
							<div className="flex items-end gap-px h-8 mt-1">
								{(() => {
									const maxCount = Math.max(
										...stats.timeHistogram.map((h) => h.count),
									);
									return stats.timeHistogram.map((h, i) => (
										<Tooltip
											key={i}
											title={`${h.hour.slice(-5)}: ${h.count}`}
										>
											<div
												className="bg-blue-400 dark:bg-blue-500 rounded-sm min-w-[3px] max-w-[8px] flex-1"
												style={{
													height: `${Math.max(2, (h.count / maxCount) * 32)}px`,
												}}
											/>
										</Tooltip>
									));
								})()}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
