import { Popover, Progress, Tooltip, theme } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type ContextUsageCategory,
	useContextUsage,
} from "../../../hooks/useContextUsage";

/**
 * 触发器圆环 —— SVG donut，stroke 颜色驱动剩余/已用对比。
 * 尺寸 16px，stroke 2px，跟同行 pill 的高度（26）目测对齐。
 */
function ContextUsageRing({
	percent,
	color,
	trailColor,
}: {
	/** 0..100；null 表示无数据 */
	percent: number | null;
	color: string;
	trailColor: string;
}) {
	const size = 16;
	const stroke = 2;
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const safePct =
		percent == null ? 0 : Math.max(0, Math.min(100, percent));
	const dash = (safePct / 100) * circumference;
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			aria-hidden
			style={{ display: "block", flexShrink: 0 }}
		>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={trailColor}
				strokeWidth={stroke}
			/>
			{percent != null && safePct > 0 && (
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke={color}
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={`${dash} ${circumference - dash}`}
					transform={`rotate(-90 ${size / 2} ${size / 2})`}
					style={{ transition: "stroke-dasharray 200ms ease" }}
				/>
			)}
		</svg>
	);
}

const { useToken } = theme;

/**
 * 数字格式：≥ 1万 → "X.X万"，否则原数。和截图一致。
 */
function formatTokens(n: number): string {
	if (n >= 10_000) {
		const wan = n / 10_000;
		return `${wan.toFixed(wan >= 100 ? 0 : 1)}万`;
	}
	return n.toLocaleString();
}

function formatPercent(p: number | null, digits = 1): string {
	if (p == null || !Number.isFinite(p)) return "—";
	return `${(p * 100).toFixed(digits)}%`;
}

/**
 * 分类配色 —— 与截图蓝色系一致，从深到浅渐变，区分主次。
 */
const CATEGORY_COLOR: Record<ContextUsageCategory, string> = {
	messages: "#3B82F6", // 主蓝
	systemTools: "#60A5FA",
	other: "#93C5FD",
	skill: "#BFDBFE",
	systemPrompt: "#DBEAFE",
};

const CATEGORY_I18N_KEY: Record<ContextUsageCategory, string> = {
	messages: "contextUsage.categories.messages",
	systemTools: "contextUsage.categories.systemTools",
	other: "contextUsage.categories.other",
	skill: "contextUsage.categories.skill",
	systemPrompt: "contextUsage.categories.systemPrompt",
};

export function ContextUsagePill() {
	const { t } = useTranslation();
	const { token } = useToken();
	const usage = useContextUsage();
	const [open, setOpen] = useState(false);

	const pctNum = usage.percent;
	const pillLabel =
		pctNum == null
			? t("contextUsage.noData", "—", { ns: "chat" })
			: formatPercent(pctNum, 1);

	// Progress 数值（0..100），上限 100 避免溢出
	const progressValue =
		pctNum == null ? 0 : Math.min(100, Math.round(pctNum * 1000) / 10);

	const tooltipText = usage.isEstimated
		? t("contextUsage.tooltipEstimated", "上下文容量（估算）", {
				ns: "chat",
			})
		: t("contextUsage.tooltip", "上下文容量", { ns: "chat" });

	const headerLine = (() => {
		if (usage.contextWindow == null) {
			return formatTokens(usage.usedTokens);
		}
		return `${formatTokens(usage.usedTokens)}/${formatTokens(usage.contextWindow)} (${formatPercent(pctNum, 1)})`;
	})();

	const popoverContent = (
		<div
			className="select-none"
			style={{
				width: 320,
				padding: "4px 0",
				color: token.colorText,
			}}
		>
			{/* Title row */}
			<div className="flex items-center justify-between mb-2">
				<span style={{ fontSize: 14, fontWeight: 600 }}>
					{t("contextUsage.title", "上下文容量", { ns: "chat" })}
				</span>
				<span
					style={{
						fontSize: 12,
						color: token.colorTextSecondary,
						fontVariantNumeric: "tabular-nums",
					}}
				>
					{headerLine}
				</span>
			</div>

			{/* Progress bar */}
			<Progress
				percent={progressValue}
				showInfo={false}
				strokeColor={CATEGORY_COLOR.messages}
				trailColor={token.colorFillSecondary}
				size="small"
				style={{ marginBottom: 12 }}
			/>

			{/* Breakdown rows */}
			<div className="flex flex-col gap-2 mb-3">
				{usage.breakdown.map((item) => (
					<div
						key={item.category}
						className="flex items-center justify-between"
						style={{ fontSize: 13 }}
					>
						<span className="flex items-center gap-2">
							<span
								aria-hidden
								style={{
									width: 8,
									height: 8,
									borderRadius: "50%",
									background: CATEGORY_COLOR[item.category],
									display: "inline-block",
								}}
							/>
							<span style={{ color: token.colorText }}>
								{t(CATEGORY_I18N_KEY[item.category], item.category, {
									ns: "chat",
								})}
							</span>
						</span>
						<span
							style={{
								color: token.colorTextSecondary,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{formatPercent(item.ratio, 1)}
						</span>
					</div>
				))}
			</div>

			{/* Divider */}
			<div
				style={{
					borderTop: `1px solid ${token.colorBorderSecondary}`,
					margin: "0 -2px 8px",
				}}
			/>

			{/* Cache hit rate */}
			<div
				className="flex items-center justify-between"
				style={{ fontSize: 13 }}
			>
				<Tooltip
					title={
						usage.cacheHitRate == null
							? t("contextUsage.llmNoCache", "当前路径无缓存数据", {
									ns: "chat",
								})
							: undefined
					}
				>
					<span style={{ color: token.colorTextSecondary }}>
						{t("contextUsage.avgCacheHit", "平均缓存命中率", { ns: "chat" })}
					</span>
				</Tooltip>
				<span
					style={{
						color:
							usage.cacheHitRate == null
								? token.colorTextTertiary
								: token.colorText,
						fontVariantNumeric: "tabular-nums",
					}}
				>
					{usage.cacheHitRate == null
						? t("contextUsage.noData", "—", { ns: "chat" })
						: formatPercent(usage.cacheHitRate, 1)}
				</span>
			</div>
		</div>
	);

	return (
		<Popover
			content={popoverContent}
			trigger="click"
			open={open}
			onOpenChange={setOpen}
			placement="top"
      styles={{ container: { padding: 12 } }}
		>
			<Tooltip
				title={
					open
						? undefined
						: pctNum == null
							? tooltipText
							: `${tooltipText} · ${pillLabel}`
				}
			>
				<button
					type="button"
					className={`composer-pill is-icon${open ? " is-active" : ""}`}
					aria-label={
						pctNum == null ? tooltipText : `${tooltipText} ${pillLabel}`
					}
					aria-expanded={open}
				>
					<ContextUsageRing
						percent={progressValue}
						color={CATEGORY_COLOR.messages}
						trailColor={token.colorFillSecondary}
					/>
				</button>
			</Tooltip>
		</Popover>
	);
}
