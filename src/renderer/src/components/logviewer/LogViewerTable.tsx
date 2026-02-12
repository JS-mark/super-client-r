/**
 * LogViewerTable - Ant Design Table with server-side pagination
 */

import { Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LogRecord } from "../../services/logService";
import { useLogViewerStore } from "../../stores/logViewerStore";

const LEVEL_COLORS: Record<string, string> = {
	DEBUG: "default",
	INFO: "blue",
	WARN: "orange",
	ERROR: "red",
};

function formatTime(timestamp: string): string {
	const d = new Date(timestamp);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function formatDate(timestamp: string): string {
	const d = new Date(timestamp);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const LogViewerTable: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const records = useLogViewerStore((s) => s.records);
	const total = useLogViewerStore((s) => s.total);
	const page = useLogViewerStore((s) => s.page);
	const pageSize = useLogViewerStore((s) => s.pageSize);
	const isLoading = useLogViewerStore((s) => s.isLoading);
	const setPage = useLogViewerStore((s) => s.setPage);
	const setPageSize = useLogViewerStore((s) => s.setPageSize);
	const setSelectedRecord = useLogViewerStore((s) => s.setSelectedRecord);

	const handleRowClick = useCallback(
		(record: LogRecord) => {
			setSelectedRecord(record);
		},
		[setSelectedRecord],
	);

	const columns: ColumnsType<LogRecord> = useMemo(
		() => [
			{
				title: t("columns.time"),
				dataIndex: "timestamp",
				key: "timestamp",
				width: 180,
				render: (timestamp: string) => (
					<span className="font-mono text-xs whitespace-nowrap">
						<span className="opacity-50">{formatDate(timestamp)}</span>{" "}
						{formatTime(timestamp)}
					</span>
				),
			},
			{
				title: t("columns.level"),
				dataIndex: "level",
				key: "level",
				width: 80,
				render: (level: string) => (
					<Tag color={LEVEL_COLORS[level] || "default"} className="!text-xs">
						{level}
					</Tag>
				),
			},
			{
				title: t("columns.process"),
				dataIndex: "process",
				key: "process",
				width: 80,
				render: (process: string) => (
					<Tag
						color={process === "main" ? "geekblue" : "purple"}
						className="!text-xs"
					>
						{process}
					</Tag>
				),
			},
			{
				title: t("columns.module"),
				dataIndex: "module",
				key: "module",
				width: 120,
				render: (module: string) =>
					module ? (
						<span className="text-xs font-medium">{module}</span>
					) : (
						<span className="text-xs opacity-30">-</span>
					),
			},
			{
				title: t("columns.message"),
				dataIndex: "message",
				key: "message",
				ellipsis: true,
				render: (message: string, record: LogRecord) => (
					<div className="text-xs">
						<span className="break-all">{message}</span>
						{record.error_message && (
							<span className="text-red-500 ml-1">
								[{record.error_message}]
							</span>
						)}
					</div>
				),
			},
		],
		[t],
	);

	return (
		<Table<LogRecord>
			columns={columns}
			dataSource={records}
			rowKey="id"
			size="small"
			loading={isLoading}
			locale={{ emptyText: <Empty description={t("noLogs")} /> }}
			pagination={{
				current: page,
				pageSize,
				total,
				showSizeChanger: true,
				showTotal: (total) => `${total}`,
				pageSizeOptions: [20, 50, 100],
				size: "small",
				onChange: (p, ps) => {
					if (ps !== pageSize) {
						setPageSize(ps);
					} else {
						setPage(p);
					}
				},
			}}
			onRow={(record) => ({
				onClick: () => handleRowClick(record),
				className: "cursor-pointer",
			})}
			scroll={{ y: "calc(100vh - 260px)" }}
			className="log-viewer-table"
		/>
	);
};
