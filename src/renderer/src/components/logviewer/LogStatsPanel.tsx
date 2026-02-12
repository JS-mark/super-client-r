/**
 * LogStatsPanel - Collapsible statistics overview with polished visual design
 */

import {
	BarChartOutlined,
	DownOutlined,
	ExclamationCircleFilled,
	UpOutlined,
} from "@ant-design/icons";
import { Button, Tag, Tooltip, theme } from "antd";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLogViewerStore } from "../../stores/logViewerStore";

const { useToken } = theme;

const LEVEL_COLORS: Record<string, string> = {
	DEBUG: "default",
	INFO: "blue",
	WARN: "orange",
	ERROR: "red",
};

export const LogStatsPanel: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const { token } = useToken();
	const stats = useLogViewerStore((s) => s.stats);
	const statsExpanded = useLogViewerStore((s) => s.statsExpanded);
	const setStatsExpanded = useLogViewerStore((s) => s.setStatsExpanded);

	const handleToggle = useCallback(() => {
		setStatsExpanded(!statsExpanded);
	}, [statsExpanded, setStatsExpanded]);

	if (!stats) return null;

	return (
		<div
			className="rounded-xl overflow-hidden shrink-0"
			style={{
				background: token.colorBgContainer,
				border: `1px solid ${token.colorBorderSecondary}`,
			}}
		>
			{/* Header - always visible */}
			<div
				className="flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
				onClick={handleToggle}
				style={{ borderBottom: statsExpanded ? `1px solid ${token.colorBorderSecondary}` : "none" }}
			>
				<div className="flex items-center gap-3">
					<span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: token.colorText }}>
						<BarChartOutlined style={{ color: token.colorPrimary }} />
						{t("stats.title")}
					</span>

					{/* Total count pill */}
					<span
						className="px-2 py-0.5 rounded-full text-xs font-medium"
						style={{
							background: token.colorPrimaryBg,
							color: token.colorPrimary,
						}}
					>
						{stats.totalCount.toLocaleString()}
					</span>

					{/* Error indicator */}
					{stats.recentErrorCount > 0 && (
						<Tooltip title={t("stats.recentErrors")}>
							<span
								className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
								style={{
									background: token.colorErrorBg,
									color: token.colorError,
								}}
							>
								<ExclamationCircleFilled style={{ fontSize: 10 }} />
								{stats.recentErrorCount}
							</span>
						</Tooltip>
					)}

					{/* Level breakdown inline tags */}
					<div className="flex items-center gap-1 ml-1">
						{Object.entries(stats.countByLevel).map(([level, count]) => (
							<Tag
								key={level}
								color={LEVEL_COLORS[level] || "default"}
								className="!text-xs !rounded-full !px-2 !m-0"
								bordered={false}
							>
								{level} {count}
							</Tag>
						))}
					</div>
				</div>

				<Button
					type="text"
					size="small"
					icon={statsExpanded ? <UpOutlined /> : <DownOutlined />}
					style={{ color: token.colorTextTertiary }}
				/>
			</div>

			{/* Expanded content */}
			{statsExpanded && (
				<div className="px-4 py-3 space-y-3">
					{/* Modules row */}
					{Object.keys(stats.countByModule).length > 0 && (
						<div className="flex items-start gap-2">
							<span
								className="text-xs shrink-0 mt-0.5 font-medium"
								style={{ color: token.colorTextTertiary, minWidth: 48 }}
							>
								{t("stats.byModule")}
							</span>
							<div className="flex flex-wrap gap-1">
								{Object.entries(stats.countByModule)
									.sort((a, b) => b[1] - a[1])
									.slice(0, 10)
									.map(([mod, count]) => (
										<span
											key={mod}
											className="px-2 py-0.5 rounded-md text-xs"
											style={{
												background: token.colorFillTertiary,
												color: token.colorTextSecondary,
											}}
										>
											{mod} <span style={{ color: token.colorTextTertiary }}>{count}</span>
										</span>
									))}
							</div>
						</div>
					)}

					{/* Process row */}
					{Object.keys(stats.countByProcess).length > 0 && (
						<div className="flex items-start gap-2">
							<span
								className="text-xs shrink-0 mt-0.5 font-medium"
								style={{ color: token.colorTextTertiary, minWidth: 48 }}
							>
								{t("stats.byProcess")}
							</span>
							<div className="flex flex-wrap gap-1">
								{Object.entries(stats.countByProcess).map(
									([proc, count]) => (
										<Tag key={proc} color="cyan" className="!text-xs !rounded-full !px-2 !m-0" bordered={false}>
											{proc} {count}
										</Tag>
									),
								)}
							</div>
						</div>
					)}

					{/* 24h histogram */}
					{stats.timeHistogram.length > 0 && (
						<div className="flex items-start gap-2">
							<span
								className="text-xs shrink-0 mt-1 font-medium"
								style={{ color: token.colorTextTertiary, minWidth: 48 }}
							>
								{t("stats.histogram")}
							</span>
							<div className="flex items-end gap-[2px] h-10 flex-1 pt-1">
								{(() => {
									const maxCount = Math.max(
										...stats.timeHistogram.map((h) => h.count),
										1,
									);
									return stats.timeHistogram.map((h, i) => (
										<Tooltip
											key={i}
											title={`${h.hour.slice(-5)}: ${h.count}`}
										>
											<div
												className="rounded-sm flex-1 transition-all"
												style={{
													height: `${Math.max(3, (h.count / maxCount) * 40)}px`,
													minWidth: 2,
													maxWidth: 10,
													background: h.count > 0
														? token.colorPrimary
														: token.colorFillQuaternary,
													opacity: h.count > 0 ? 0.7 + (h.count / maxCount) * 0.3 : 0.3,
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
