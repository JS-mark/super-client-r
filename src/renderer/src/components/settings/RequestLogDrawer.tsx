/**
 * 请求日志抽屉组件
 *
 * Live, DevTools-Network-style viewer over the main process's outbound HTTP.
 * Backed by `RequestLogService`:
 *   - `network:request-log-entry` event seeds a row when headers arrive.
 *   - `network:request-log-update` events progressively append body chunks
 *     and flip the row's state (streaming → complete / error).
 *
 * Why this is needed: LLM streaming requests happen in the main process and
 * never appear in the renderer DevTools Network panel. This drawer fills that
 * gap and supports SSE in real time.
 */

import {
	CheckCircleOutlined,
	CloseCircleOutlined,
	DeleteOutlined,
	LoadingOutlined,
	ReloadOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import {
	Button,
	Drawer,
	Empty,
	Input,
	Switch,
	Table,
	Tag,
	theme,
	Tooltip,
	Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	RequestLogEntry,
	RequestLogEntryUpdate,
} from "@/types/electron";
import { networkService } from "../../services/networkService";

const { useToken } = theme;
const { Text } = Typography;

interface RequestLogDrawerProps {
	open: boolean;
	onClose: () => void;
}

/** Merge an incremental update into an existing entry, returning a new copy. */
function applyUpdate(
	entry: RequestLogEntry,
	update: RequestLogEntryUpdate,
): RequestLogEntry {
	const next: RequestLogEntry = { ...entry };
	if (update.state) next.state = update.state;
	if (update.responseStatus !== undefined) {
		next.responseStatus = update.responseStatus;
	}
	if (update.responseStatusText !== undefined) {
		next.responseStatusText = update.responseStatusText;
	}
	if (update.responseHeaders) next.responseHeaders = update.responseHeaders;
	if (update.contentType) next.contentType = update.contentType;
	if (typeof update.isStreaming === "boolean") {
		next.isStreaming = update.isStreaming;
	}
	if (typeof update.durationMs === "number") {
		next.durationMs = update.durationMs;
	}
	if (update.error) next.error = update.error;
	if (update.appendBody) {
		next.responseBodyPreview =
			(entry.responseBodyPreview ?? "") + update.appendBody;
	}
	return next;
}

/**
 * Best-effort pretty-printer:
 *  - Whole-text JSON → 2-space indented.
 *  - SSE frames (`data: {...}`) → parse each frame separately and stitch back.
 *  - Anything else → return as-is.
 */
function formatBody(body: string | undefined, contentType?: string): string {
	if (!body) return "";
	const trimmed = body.trim();
	if (!trimmed) return body;

	// SSE: split on blank lines, parse each `data: ...` payload.
	if (contentType?.includes("event-stream") || /^data:\s/m.test(trimmed)) {
		const frames = trimmed.split(/\n\n+/);
		return frames
			.map((frame) =>
				frame
					.split("\n")
					.map((line) => {
						const m = /^data:\s?(.*)$/.exec(line);
						if (!m) return line;
						const payload = m[1];
						try {
							return `data: ${JSON.stringify(JSON.parse(payload), null, 2)}`;
						} catch {
							return line;
						}
					})
					.join("\n"),
			)
			.join("\n\n");
	}

	// Try JSON.
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.stringify(JSON.parse(trimmed), null, 2);
		} catch {
			return body;
		}
	}
	return body;
}

export function RequestLogDrawer({ open, onClose }: RequestLogDrawerProps) {
	const { t } = useTranslation("settings");
	const { token } = useToken();

	const [entries, setEntries] = useState<RequestLogEntry[]>([]);
	const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
	const [filter, setFilter] = useState("");
	const [autoExpandLatest, setAutoExpandLatest] = useState(false);
	const [enabled, setEnabled] = useState(true);
	const entriesRef = useRef<RequestLogEntry[]>([]);
	entriesRef.current = entries;
	const unsubEntryRef = useRef<(() => void) | null>(null);
	const unsubUpdateRef = useRef<(() => void) | null>(null);

	const refresh = useCallback(() => {
		networkService.getRequestLog().then((res) => {
			if (res.success) setEntries(res.data);
		});
	}, []);

	// 加载数据 & 订阅实时推送
	useEffect(() => {
		if (!open) return;

		refresh();
		networkService.getLogEnabled().then((res) => {
			if (res.success) setEnabled(res.data);
		});

		// New entry (response headers arrived)
		unsubEntryRef.current = networkService.onRequestLogEntry((entry) => {
			setEntries((prev) => {
				// Some entries may already exist if main pushed both add + update
				// before the drawer mounted; dedupe by id.
				const without = prev.filter((e) => e.id !== entry.id);
				const next = [...without, entry];
				if (next.length > 500) next.splice(0, next.length - 500);
				return next;
			});
			if (autoExpandLatest) {
				setExpandedRowKeys((prev) =>
					prev.includes(entry.id) ? prev : [...prev, entry.id],
				);
			}
		});

		// Streaming chunk / state change for an existing entry
		unsubUpdateRef.current = networkService.onRequestLogUpdate((update) => {
			setEntries((prev) => {
				const idx = prev.findIndex((e) => e.id === update.id);
				if (idx === -1) return prev;
				const next = [...prev];
				next[idx] = applyUpdate(prev[idx], update);
				return next;
			});
		});

		return () => {
			unsubEntryRef.current?.();
			unsubEntryRef.current = null;
			unsubUpdateRef.current?.();
			unsubUpdateRef.current = null;
		};
	}, [open, refresh, autoExpandLatest]);

	const handleClear = useCallback(() => {
		networkService.clearRequestLog().then(() => setEntries([]));
	}, []);

	const handleToggleEnabled = useCallback(async (next: boolean) => {
		setEnabled(next);
		await networkService.setLogEnabled(next);
	}, []);

	// Filter rows by url / method / status / content-type.
	const filtered = useMemo(() => {
		if (!filter.trim()) return entries;
		const needle = filter.trim().toLowerCase();
		return entries.filter((e) => {
			return (
				e.url.toLowerCase().includes(needle) ||
				e.method.toLowerCase().includes(needle) ||
				(e.responseStatus && String(e.responseStatus).includes(needle)) ||
				(e.contentType?.includes(needle) ?? false)
			);
		});
	}, [entries, filter]);

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
						<Text
							className="text-[11px]"
							style={{ color: token.colorTextSecondary }}
						>
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
						color={
							method === "GET"
								? "blue"
								: method === "POST"
									? "green"
									: method === "PUT" || method === "PATCH"
										? "orange"
										: method === "DELETE"
											? "red"
											: "default"
						}
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
				render: (url: string, record) => {
					// Show short host + path tail to keep the column readable.
					let label = url;
					try {
						const u = new URL(url);
						label = `${u.host}${u.pathname}${u.search}`;
					} catch {
						/* keep raw */
					}
					return (
						<div className="flex items-center gap-1.5 min-w-0">
							{record.isStreaming && (
								<Tooltip title="Streaming response">
									<ThunderboltOutlined
										style={{
											color: token.colorWarning,
											fontSize: 11,
										}}
									/>
								</Tooltip>
							)}
							<Text
								className="text-[12px]"
								style={{ color: token.colorText }}
								ellipsis={{ tooltip: url }}
							>
								{label}
							</Text>
						</div>
					);
				},
			},
			{
				title: t("network.status"),
				dataIndex: "responseStatus",
				key: "status",
				width: 80,
				render: (status: number | undefined, record: RequestLogEntry) => {
					if (record.error) {
						return (
							<Tag
								color="red"
								icon={<CloseCircleOutlined />}
								className="text-[11px]"
							>
								ERR
							</Tag>
						);
					}
					if (record.state === "pending") {
						return (
							<Tag
								icon={<LoadingOutlined spin />}
								className="text-[11px]"
								color="default"
							>
								wait
							</Tag>
						);
					}
					if (record.state === "streaming") {
						return (
							<Tag
								icon={<LoadingOutlined spin />}
								className="text-[11px]"
								color="processing"
							>
								{status ?? "···"}
							</Tag>
						);
					}
					if (!status)
						return <Text style={{ color: token.colorTextQuaternary }}>-</Text>;
					return (
						<Tag
							color={
								status >= 200 && status < 300
									? "green"
									: status >= 400
										? "red"
										: "orange"
							}
							icon={
								status >= 200 && status < 300 ? (
									<CheckCircleOutlined />
								) : undefined
							}
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
				render: (ms: number, record) => (
					<Text
						className="text-[11px]"
						style={{
							color:
								ms > 3000
									? token.colorError
									: ms > 1000
										? token.colorWarning
										: token.colorTextSecondary,
						}}
					>
						{record.state === "streaming" ? `${ms}ms…` : `${ms}ms`}
					</Text>
				),
			},
			{
				title: t("network.source"),
				dataIndex: "source",
				key: "source",
				width: 60,
				render: (source: string) => (
					<Text
						className="text-[11px]"
						style={{ color: token.colorTextQuaternary }}
					>
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
			<div
				className="space-y-3 text-[12px]"
				style={{ color: token.colorTextSecondary }}
			>
				<div className="flex items-baseline gap-2 flex-wrap">
					<Text strong style={{ color: token.colorText }}>
						{record.method}
					</Text>
					<Text
						copyable={{ text: record.url }}
						className="text-[11px]"
						style={{ color: token.colorText, wordBreak: "break-all" }}
					>
						{record.url}
					</Text>
				</div>
				{record.contentType && (
					<div>
						<Text strong>Content-Type:</Text>{" "}
						<Text code className="text-[11px]">
							{record.contentType}
						</Text>
					</div>
				)}
				{record.error && (
					<div>
						<Text strong style={{ color: token.colorError }}>
							{t("network.error")}:
						</Text>{" "}
						{record.error}
					</div>
				)}
				{record.requestHeaders &&
					Object.keys(record.requestHeaders).length > 0 && (
						<details>
							<summary
								className="cursor-pointer select-none"
								style={{ color: token.colorTextSecondary }}
							>
								<Text strong>{t("network.requestHeaders")}</Text> (
								{Object.keys(record.requestHeaders).length})
							</summary>
							<pre
								className="mt-1 p-2 rounded text-[11px] overflow-x-auto max-h-60"
								style={{ backgroundColor: token.colorFillTertiary }}
							>
								{JSON.stringify(record.requestHeaders, null, 2)}
							</pre>
						</details>
					)}
				{record.responseHeaders &&
					Object.keys(record.responseHeaders).length > 0 && (
						<details>
							<summary
								className="cursor-pointer select-none"
								style={{ color: token.colorTextSecondary }}
							>
								<Text strong>Response Headers</Text> (
								{Object.keys(record.responseHeaders).length})
							</summary>
							<pre
								className="mt-1 p-2 rounded text-[11px] overflow-x-auto max-h-60"
								style={{ backgroundColor: token.colorFillTertiary }}
							>
								{JSON.stringify(record.responseHeaders, null, 2)}
							</pre>
						</details>
					)}
				{record.requestBodyPreview && (
					<div>
						<Text strong>{t("network.requestBody")}:</Text>
						<pre
							className="mt-1 p-2 rounded text-[11px] overflow-x-auto max-h-80"
							style={{ backgroundColor: token.colorFillTertiary }}
						>
							{formatBody(record.requestBodyPreview)}
						</pre>
					</div>
				)}
				{record.responseBodyPreview && (
					<div>
						<div className="flex items-center gap-2">
							<Text strong>{t("network.responseBody")}:</Text>
							{record.state === "streaming" && (
								<Tag
									color="processing"
									icon={<LoadingOutlined spin />}
									className="text-[10px]"
								>
									streaming
								</Tag>
							)}
							{record.state === "complete" && (
								<Tag color="success" className="text-[10px]">
									{record.responseBodyPreview.length}B
								</Tag>
							)}
						</div>
						<pre
							className="mt-1 p-2 rounded text-[11px] overflow-x-auto max-h-[480px]"
							style={{ backgroundColor: token.colorFillTertiary }}
						>
							{formatBody(record.responseBodyPreview, record.contentType)}
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
			size="large"
			width={920}
			open={open}
			onClose={onClose}
			styles={{
				wrapper: { WebkitAppRegion: "no-drag" } as React.CSSProperties,
				header: { paddingBlock: 7 },
				body: { padding: 12 },
			}}
			extra={
				<div className="flex items-center gap-2">
					<Tooltip title={enabled ? "已启用日志拦截" : "未启用 — 不会捕获新请求"}>
						<Switch
							size="small"
							checked={enabled}
							onChange={handleToggleEnabled}
						/>
					</Tooltip>
					<Tooltip title="自动展开新请求">
						<Switch
							size="small"
							checkedChildren="auto"
							unCheckedChildren="auto"
							checked={autoExpandLatest}
							onChange={setAutoExpandLatest}
						/>
					</Tooltip>
					<Button size="small" icon={<ReloadOutlined />} onClick={refresh} />
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
			<div className="mb-2">
				<Input.Search
					size="small"
					allowClear
					placeholder="filter by url / method / status / content-type"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
				/>
			</div>
			{filtered.length === 0 ? (
				<Empty
					description={
						entries.length === 0
							? t("network.noEntries")
							: "没有匹配的请求 (清空过滤试试)"
					}
				/>
			) : (
				<Table
					dataSource={[...filtered].reverse()}
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
					scroll={{ y: "calc(100vh - 240px)" }}
				/>
			)}
		</Drawer>
	);
}
