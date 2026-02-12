/**
 * LogViewerTable - Ant Design Table with server-side pagination
 * Clean, readable log table with proper styling
 */

import { FileSearchOutlined } from "@ant-design/icons";
import { Empty, Table, Tag, theme } from "antd";
import type { ColumnsType } from "antd/es/table";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LogRecord } from "../../services/logService";
import { useLogViewerStore } from "../../stores/logViewerStore";

const { useToken } = theme;

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
	const { token } = useToken();
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
				width: 170,
				render: (timestamp: string) => (
					<span className="font-mono text-xs whitespace-nowrap" style={{ color: token.colorTextSecondary }}>
						<span style={{ opacity: 0.5 }}>{formatDate(timestamp)}</span>{" "}
						<span style={{ color: token.colorText }}>{formatTime(timestamp)}</span>
					</span>
				),
			},
			{
				title: t("columns.level"),
				dataIndex: "level",
				key: "level",
				width: 80,
				render: (level: string) => (
					<Tag
						color={LEVEL_COLORS[level] || "default"}
						className="!text-xs !rounded-full !px-2 !m-0"
						bordered={false}
					>
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
						className="!text-xs !rounded-full !px-2 !m-0"
						bordered={false}
					>
						{process}
					</Tag>
				),
			},
			{
				title: t("columns.module"),
				dataIndex: "module",
				key: "module",
				width: 140,
				render: (module: string) =>
					module ? (
						<span
							className="text-xs font-medium px-1.5 py-0.5 rounded"
							style={{
								background: token.colorFillQuaternary,
								color: token.colorTextSecondary,
							}}
						>
							{module}
						</span>
					) : (
						<span style={{ color: token.colorTextQuaternary }}>-</span>
					),
			},
			{
				title: t("columns.message"),
				dataIndex: "message",
				key: "message",
				ellipsis: true,
				render: (msg: string, record: LogRecord) => (
					<div className="text-xs leading-relaxed">
						<span style={{ color: token.colorText }}>{msg}</span>
						{record.error_message && (
							<span
								className="ml-1.5 px-1.5 py-0.5 rounded text-xs"
								style={{
									background: token.colorErrorBg,
									color: token.colorError,
								}}
							>
								{record.error_message}
							</span>
						)}
					</div>
				),
			},
		],
		[t, token],
	);

	return (
		<div
			className="h-full rounded-xl overflow-hidden"
			style={{
				background: token.colorBgContainer,
				border: `1px solid ${token.colorBorderSecondary}`,
			}}
		>
			<Table<LogRecord>
				columns={columns}
				dataSource={records}
				rowKey="id"
				size="small"
				loading={isLoading}
				locale={{
					emptyText: (
						<Empty
							image={<FileSearchOutlined style={{ fontSize: 48, color: token.colorTextQuaternary }} />}
							description={
								<span style={{ color: token.colorTextTertiary }}>
									{t("noLogs")}
								</span>
							}
							className="!my-16"
						/>
					),
				}}
				pagination={{
					current: page,
					pageSize,
					total,
					showSizeChanger: true,
					showTotal: (total) => (
						<span style={{ color: token.colorTextTertiary }} className="text-xs">
							{total.toLocaleString()} {t("stats.total", { defaultValue: "total" })}
						</span>
					),
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
					style: { cursor: "pointer" },
				})}
				scroll={{ y: "calc(100vh - 300px)" }}
				className="log-viewer-table"
			/>
		</div>
	);
};
