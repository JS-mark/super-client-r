/**
 * LogDetailDrawer - Slide-out drawer showing full log entry details
 */

import { CopyOutlined } from "@ant-design/icons";
import { Button, Descriptions, Drawer, message, Tag } from "antd";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLogViewerStore } from "../../stores/logViewerStore";

const LEVEL_COLORS: Record<string, string> = {
	DEBUG: "default",
	INFO: "blue",
	WARN: "orange",
	ERROR: "red",
};

export const LogDetailDrawer: React.FC = () => {
	const { t } = useTranslation("logviewer");
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
		if (record.error_message)
			parts.push(`Error: ${record.error_message}`);
		if (record.error_stack) parts.push(`Stack: ${record.error_stack}`);
		if (record.session_id) parts.push(`Session: ${record.session_id}`);

		navigator.clipboard.writeText(parts.join("\n")).then(() => {
			message.success(t("detail.copied"));
		});
	}, [record, parsedMeta, t]);

	if (!record) return null;

	return (
		<Drawer
			title={t("detail.title")}
			open={detailOpen}
			onClose={handleClose}
			width={520}
			extra={
				<Button
					icon={<CopyOutlined />}
					size="small"
					onClick={handleCopyAll}
				>
					{t("detail.copyAll")}
				</Button>
			}
		>
			<Descriptions column={1} size="small" bordered>
				<Descriptions.Item label={t("detail.timestamp")}>
					<span className="font-mono text-xs">{record.timestamp}</span>
				</Descriptions.Item>
				<Descriptions.Item label={t("detail.level")}>
					<Tag color={LEVEL_COLORS[record.level] || "default"}>
						{record.level}
					</Tag>
				</Descriptions.Item>
				<Descriptions.Item label={t("detail.process")}>
					<Tag
						color={record.process === "main" ? "geekblue" : "purple"}
					>
						{record.process}
					</Tag>
				</Descriptions.Item>
				<Descriptions.Item label={t("detail.module")}>
					{record.module || "-"}
				</Descriptions.Item>
			</Descriptions>

			<div className="mt-4 space-y-4">
				{/* Message */}
				<div>
					<div className="text-xs font-medium text-gray-500 mb-1">
						{t("detail.message")}
					</div>
					<div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm break-all whitespace-pre-wrap">
						{record.message}
					</div>
				</div>

				{/* Metadata */}
				{parsedMeta && (
					<div>
						<div className="text-xs font-medium text-gray-500 mb-1">
							{t("detail.metadata")}
						</div>
						<pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs overflow-auto max-h-60 font-mono">
							{parsedMeta}
						</pre>
					</div>
				)}

				{/* Error */}
				{record.error_message && (
					<div>
						<div className="text-xs font-medium text-red-500 mb-1">
							{t("detail.errorMessage")}
						</div>
						<div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm text-red-600 dark:text-red-400 break-all">
							{record.error_message}
						</div>
					</div>
				)}

				{/* Error Stack */}
				{record.error_stack && (
					<div>
						<div className="text-xs font-medium text-red-500 mb-1">
							{t("detail.errorStack")}
						</div>
						<pre className="bg-gray-900 rounded-lg p-3 text-xs text-green-400 overflow-auto max-h-80 font-mono whitespace-pre-wrap">
							{record.error_stack}
						</pre>
					</div>
				)}

				{/* Session ID */}
				{record.session_id && (
					<div>
						<div className="text-xs font-medium text-gray-500 mb-1">
							{t("detail.sessionId")}
						</div>
						<span className="font-mono text-xs">{record.session_id}</span>
					</div>
				)}
			</div>
		</Drawer>
	);
};
