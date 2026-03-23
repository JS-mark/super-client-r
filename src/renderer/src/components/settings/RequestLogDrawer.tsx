/**
 * 请求日志抽屉组件
 * 展示所有出站 HTTP 请求的详细日志
 */

import {
	CheckCircleOutlined,
	CloseCircleOutlined,
	DeleteOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Empty, Table, Tag, theme, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RequestLogEntry } from "@/types/electron";
import { networkService } from "../../services/networkService";

const { useToken } = theme;
const { Text } = Typography;

interface RequestLogDrawerProps {
	open: boolean;
	onClose: () => void;
}

export function RequestLogDrawer({ open, onClose }: RequestLogDrawerProps) {
	const { t } = useTranslation("settings");
	const { token } = useToken();

	const [entries, setEntries] = useState<RequestLogEntry[]>([]);
	const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
	const unsubRef = useRef<(() => void) | null>(null);

	// 加载数据 & 订阅实时推送
	useEffect(() => {
		if (!open) return;

		networkService.getRequestLog().then((res) => {
			if (res.success) setEntries(res.data);
		});

		unsubRef.current = networkService.onRequestLogEntry((entry) => {
			setEntries((prev) => {
				const next = [...prev, entry];
				if (next.length > 500) next.splice(0, next.length - 500);
				return next;
			});
		});

		return () => {
			unsubRef.current?.();
			unsubRef.current = null;
		};
	}, [open]);

	const handleRefresh = useCallback(() => {
		networkService.getRequestLog().then((res) => {
			if (res.success) setEntries(res.data);
		});
	}, []);

	const handleClear = useCallback(() => {
		networkService.clearRequestLog().then(() => setEntries([]));
	}, []);

	const columns: ColumnsType<RequestLogEntry> = useMemo(
		() => [
			{
				title: t("network.time"),
				dataIndex: "timestamp",
				key: "timestamp",
				width: 90,
				render: (ts: number) => {
					const d = new Date(ts);
					return (
						<Text className="text-[11px]" style={{ color: token.colorTextSecondary }}>
							{d.toLocaleTimeString()}
						</Text>
					);
				},
			},
			{
				title: t("network.method"),
				dataIndex: "method",
				key: "method",
				width: 70,
				render: (method: string) => (
					<Tag
						color={method === "GET" ? "blue" : method === "POST" ? "green" : "default"}
						className="text-[11px]"
					>
						{method}
					</Tag>
				),
			},
			{
				title: t("network.url"),
				dataIndex: "url",
				key: "url",
				ellipsis: true,
				render: (url: string) => (
					<Text
						className="text-[12px]"
						style={{ color: token.colorText }}
						ellipsis={{ tooltip: url }}
					>
						{url}
					</Text>
				),
			},
			{
				title: t("network.status"),
				dataIndex: "responseStatus",
				key: "status",
				width: 70,
				render: (status: number | undefined, record: RequestLogEntry) => {
					if (record.error) {
						return (
							<Tag color="red" icon={<CloseCircleOutlined />} className="text-[11px]">
								ERR
							</Tag>
						);
					}
					if (!status) return <Text style={{ color: token.colorTextQuaternary }}>-</Text>;
					return (
						<Tag
							color={status >= 200 && status < 300 ? "green" : status >= 400 ? "red" : "orange"}
							className="text-[11px]"
						>
							{status}
						</Tag>
					);
				},
			},
			{
				title: t("network.duration"),
				dataIndex: "durationMs",
				key: "duration",
				width: 80,
				render: (ms: number) => (
					<Text
						className="text-[11px]"
						style={{
							color: ms > 3000 ? token.colorError : ms > 1000 ? token.colorWarning : token.colorTextSecondary,
						}}
					>
						{ms}ms
					</Text>
				),
			},
			{
				title: t("network.source"),
				dataIndex: "source",
				key: "source",
				width: 60,
				render: (source: string) => (
					<Text className="text-[11px]" style={{ color: token.colorTextQuaternary }}>
						{source}
					</Text>
				),
			},
		],
		[t, token],
	);

	// 展开行详情
	const expandedRowRender = useCallback(
		(record: RequestLogEntry) => (
			<div className="space-y-2 text-[12px]" style={{ color: token.colorTextSecondary }}>
				{record.error && (
					<div>
						<Text strong style={{ color: token.colorError }}>
							{t("network.error")}:
						</Text>{" "}
						{record.error}
					</div>
				)}
				{record.requestHeaders && Object.keys(record.requestHeaders).length > 0 && (
					<div>
						<Text strong>{t("network.requestHeaders")}:</Text>
						<pre
							className="mt-1 p-2 rounded text-[11px] overflow-x-auto max-h-40"
							style={{ backgroundColor: token.colorFillTertiary }}
						>
							{JSON.stringify(record.requestHeaders, null, 2)}
						</pre>
					</div>
				)}
				{record.requestBodyPreview && (
					<div>
						<Text strong>{t("network.requestBody")}:</Text>
						<pre
							className="mt-1 p-2 rounded text-[11px] overflow-x-auto max-h-40"
							style={{ backgroundColor: token.colorFillTertiary }}
						>
							{record.requestBodyPreview}
						</pre>
					</div>
				)}
				{record.responseBodyPreview && (
					<div>
						<Text strong>{t("network.responseBody")}:</Text>
						<pre
							className="mt-1 p-2 rounded text-[11px] overflow-x-auto max-h-40"
							style={{ backgroundColor: token.colorFillTertiary }}
						>
							{record.responseBodyPreview}
						</pre>
					</div>
				)}
			</div>
		),
		[token, t],
	);

	return (
		<Drawer
			title={t("network.logDrawerTitle")}
			size={720}
			open={open}
			onClose={onClose}
			styles={{
				wrapper: { WebkitAppRegion: "no-drag" } as React.CSSProperties,
				header: { paddingBlock: 7 },
			}}
			extra={
				<div className="flex items-center gap-2">
					<Button
						size="small"
						icon={<ReloadOutlined />}
						onClick={handleRefresh}
					/>
					<Button
						size="small"
						danger
						icon={<DeleteOutlined />}
						onClick={handleClear}
						disabled={entries.length === 0}
					>
						{t("network.clearLog")}
					</Button>
				</div>
			}
		>
			{entries.length === 0 ? (
				<Empty description={t("network.noEntries")} />
			) : (
				<Table
					dataSource={[...entries].reverse()}
					columns={columns}
					rowKey="id"
					size="small"
					pagination={{ pageSize: 50, showSizeChanger: false }}
					expandable={{
						expandedRowKeys,
						onExpandedRowsChange: (keys) =>
							setExpandedRowKeys(keys as string[]),
						expandedRowRender,
					}}
					scroll={{ y: "calc(100vh - 200px)" }}
				/>
			)}
		</Drawer>
	);
}
