/**
 * LogDetailDrawer - Slide-out drawer showing full log entry details
 * Clean, well-organized layout with visual hierarchy
 */

import { CopyOutlined } from "@ant-design/icons";
import { Button, Drawer, message, Tag, theme } from "antd";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLogViewerStore } from "../../stores/logViewerStore";

const { useToken } = theme;

const LEVEL_COLORS: Record<string, string> = {
	DEBUG: "default",
	INFO: "blue",
	WARN: "orange",
	ERROR: "red",
};

export const LogDetailDrawer: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const { token } = useToken();
	const record = useLogViewerStore((s) => s.selectedRecord);
	const detailOpen = useLogViewerStore((s) => s.detailOpen);
	const setDetailOpen = useLogViewerStore((s) => s.setDetailOpen);

	const handleClose = useCallback(() => {
		setDetailOpen(false);
	}, [setDetailOpen]);

	const parsedMeta = useMemo(() => {
		if (!record?.meta) return null;
		try {
			const parsed = JSON.parse(record.meta);
			return JSON.stringify(parsed, null, 2);
		} catch {
			return record.meta;
		}
	}, [record?.meta]);

	const handleCopyAll = useCallback(() => {
		if (!record) return;
		const parts = [
			`Timestamp: ${record.timestamp}`,
			`Level: ${record.level}`,
			`Process: ${record.process}`,
			`Module: ${record.module || "-"}`,
			`Message: ${record.message}`,
		];
		if (parsedMeta) parts.push(`Metadata: ${parsedMeta}`);
		if (record.error_message) parts.push(`Error: ${record.error_message}`);
		if (record.error_stack) parts.push(`Stack: ${record.error_stack}`);
		if (record.session_id) parts.push(`Session: ${record.session_id}`);

		navigator.clipboard.writeText(parts.join("\n")).then(() => {
			message.success(t("detail.copied"));
		});
	}, [record, parsedMeta, t]);

	if (!record) return null;

	return (
		<Drawer
			title={
				<div className="flex items-center gap-2">
					<Tag
						color={LEVEL_COLORS[record.level] || "default"}
						className="!rounded-full !px-2.5 !m-0"
						bordered={false}
					>
						{record.level}
					</Tag>
					<span
						style={{ color: token.colorText, fontWeight: 600, fontSize: 14 }}
					>
						{t("detail.title")}
					</span>
				</div>
			}
			open={detailOpen}
			onClose={handleClose}
			width={540}
			styles={{ wrapper: { WebkitAppRegion: "no-drag" } as React.CSSProperties }}
			extra={
				<Button
					icon={<CopyOutlined />}
					size="small"
					onClick={handleCopyAll}
					type="text"
				>
					{t("detail.copyAll")}
				</Button>
			}
		>
			{/* Metadata header grid */}
			<div
				className="grid grid-cols-2 gap-3 p-3 rounded-xl mb-4"
				style={{ background: token.colorFillQuaternary }}
			>
				<MetaField
					label={t("detail.timestamp")}
					value={
						<span
							className="font-mono text-xs"
							style={{ color: token.colorText }}
						>
							{record.timestamp}
						</span>
					}
					token={token}
				/>
				<MetaField
					label={t("detail.process")}
					value={
						<Tag
							color={record.process === "main" ? "geekblue" : "purple"}
							className="!text-xs !rounded-full !px-2 !m-0"
							bordered={false}
						>
							{record.process}
						</Tag>
					}
					token={token}
				/>
				<MetaField
					label={t("detail.module")}
					value={
						record.module ? (
							<span
								className="text-xs font-medium px-1.5 py-0.5 rounded"
								style={{
									background: token.colorFillTertiary,
									color: token.colorTextSecondary,
								}}
							>
								{record.module}
							</span>
						) : (
							<span style={{ color: token.colorTextQuaternary }}>-</span>
						)
					}
					token={token}
				/>
				{record.session_id && (
					<MetaField
						label={t("detail.sessionId")}
						value={
							<span
								className="font-mono text-xs"
								style={{ color: token.colorTextSecondary }}
							>
								{record.session_id.slice(0, 12)}...
							</span>
						}
						token={token}
					/>
				)}
			</div>

			{/* Message section */}
			<DetailSection label={t("detail.message")} token={token}>
				<div
					className="rounded-lg p-3 text-sm break-all whitespace-pre-wrap leading-relaxed"
					style={{
						background: token.colorFillQuaternary,
						color: token.colorText,
					}}
				>
					{record.message}
				</div>
			</DetailSection>

			{/* Metadata section */}
			{parsedMeta && (
				<DetailSection label={t("detail.metadata")} token={token}>
					<pre
						className="rounded-lg p-3 text-xs overflow-auto max-h-60 font-mono leading-relaxed"
						style={{
							background: token.colorFillQuaternary,
							color: token.colorTextSecondary,
						}}
					>
						{parsedMeta}
					</pre>
				</DetailSection>
			)}

			{/* Error section */}
			{record.error_message && (
				<DetailSection label={t("detail.errorMessage")} token={token} isError>
					<div
						className="rounded-lg p-3 text-sm break-all leading-relaxed"
						style={{
							background: token.colorErrorBg,
							color: token.colorError,
						}}
					>
						{record.error_message}
					</div>
				</DetailSection>
			)}

			{/* Error Stack section */}
			{record.error_stack && (
				<DetailSection label={t("detail.errorStack")} token={token} isError>
					<pre
						className="rounded-lg p-3 text-xs overflow-auto max-h-80 font-mono whitespace-pre-wrap leading-relaxed"
						style={{
							background: "#1e1e1e",
							color: "#4ec9b0",
						}}
					>
						{record.error_stack}
					</pre>
				</DetailSection>
			)}
		</Drawer>
	);
};

function MetaField({
	label,
	value,
	token,
}: {
	label: string;
	value: React.ReactNode;
	token: ReturnType<typeof useToken>["token"];
}) {
	return (
		<div>
			<div
				className="text-[11px] font-medium mb-1"
				style={{ color: token.colorTextTertiary }}
			>
				{label}
			</div>
			{value}
		</div>
	);
}

function DetailSection({
	label,
	children,
	token,
	isError,
}: {
	label: string;
	children: React.ReactNode;
	token: ReturnType<typeof useToken>["token"];
	isError?: boolean;
}) {
	return (
		<div className="mb-4">
			<div
				className="text-xs font-semibold mb-2"
				style={{ color: isError ? token.colorError : token.colorTextTertiary }}
			>
				{label}
			</div>
			{children}
		</div>
	);
}
