/**
 * /debug/agent-traces —— Agent 调用追踪页 v0
 *
 * 详见 spec §17.5。v0 范围：
 *   - 实时 trace 列表（订阅 onTraceUpdated）+ filter（status / runtime / q）
 *   - 详情面板：基本信息 + Timeline + 原始 JSON
 *   - 操作：刷新、清空、导出当前 trace
 *
 * 暂未实现（spec §17.5 后续完善）：
 *   - 连续 text.delta 折叠
 *   - "Re-emit" 重放
 *   - 跳转到对应 conversation
 */

import {
	ClearOutlined,
	DownloadOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import {
	Badge,
	Button,
	Empty,
	Input,
	Layout,
	List,
	message,
	Select,
	Space,
	Spin,
	Tabs,
	Tag,
	theme,
	Tooltip,
	Typography,
} from "antd";
import type {
	AgentTraceEntry,
	AgentTraceFilter,
	AgentTraceSummary,
} from "@super-client/shared-types/agent-trace";
import { useCallback, useEffect, useMemo, useState } from "react";
import { agentDebugClient } from "../services/agent/agentDebugClient";

const { Sider, Content } = Layout;
const { Text, Title } = Typography;

// ─────────────────────────── status colors ───────────────────────────

const STATUS_COLOR: Record<AgentTraceSummary["status"], string> = {
	running: "processing",
	completed: "success",
	cancelled: "default",
	errored: "error",
};

const STATUS_LABEL: Record<AgentTraceSummary["status"], string> = {
	running: "运行中",
	completed: "完成",
	cancelled: "已取消",
	errored: "出错",
};

// ─────────────────────────── component ───────────────────────────

export default function AgentTraces() {
	const { token } = theme.useToken();
	const [traces, setTraces] = useState<AgentTraceSummary[]>([]);
	const [loadingList, setLoadingList] = useState(false);
	const [filter, setFilter] = useState<AgentTraceFilter>({});
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detail, setDetail] = useState<AgentTraceEntry | null>(null);
	const [loadingDetail, setLoadingDetail] = useState(false);

	const reload = useCallback(async () => {
		setLoadingList(true);
		try {
			const list = await agentDebugClient.listTraces(filter);
			setTraces(list);
		} catch (err) {
			message.error(
				`加载 trace 列表失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setLoadingList(false);
		}
	}, [filter]);

	// 初次加载 + filter 变更时刷新
	useEffect(() => {
		void reload();
	}, [reload]);

	// 订阅实时更新
	useEffect(() => {
		const off = agentDebugClient.onTraceUpdated((summary) => {
			setTraces((prev) => mergeSummary(prev, summary));
			// 详情面板：若当前选中的 trace 状态变了，刷新
			setSelectedId((cur) => {
				if (cur === summary.requestId) {
					void loadDetail(summary.requestId);
				}
				return cur;
			});
		});
		return off;
	}, []);

	const loadDetail = useCallback(async (requestId: string) => {
		setLoadingDetail(true);
		try {
			const d = await agentDebugClient.getTrace(requestId);
			setDetail(d);
		} catch (err) {
			message.error(
				`加载详情失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setLoadingDetail(false);
		}
	}, []);

	const handleSelect = useCallback(
		(id: string) => {
			setSelectedId(id);
			void loadDetail(id);
		},
		[loadDetail],
	);

	const handleClear = useCallback(async () => {
		try {
			await agentDebugClient.clearTraces();
			setTraces([]);
			setDetail(null);
			setSelectedId(null);
			message.success("已清空");
		} catch (err) {
			message.error(
				`清空失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, []);

	const handleExport = useCallback(async () => {
		if (!selectedId) return;
		try {
			const path = await agentDebugClient.exportTrace(selectedId);
			message.success(`已导出：${path}`);
		} catch (err) {
			message.error(
				`导出失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, [selectedId]);

	const runtimes = useMemo(() => {
		const set = new Set(traces.map((t) => t.runtimeId));
		return [...set];
	}, [traces]);

	return (
		<Layout style={{ height: "100vh", background: token.colorBgLayout }}>
			<Sider
				width={420}
				style={{
					background: token.colorBgContainer,
					borderRight: `1px solid ${token.colorBorderSecondary}`,
				}}
			>
				<div
					style={{
						padding: 12,
						borderBottom: `1px solid ${token.colorBorderSecondary}`,
					}}
				>
					<Space direction="vertical" style={{ width: "100%" }} size={8}>
						<Space style={{ justifyContent: "space-between", width: "100%" }}>
							<Title level={5} style={{ margin: 0 }}>
								Agent Traces
							</Title>
							<Space>
								<Tooltip title="刷新">
									<Button
										icon={<ReloadOutlined />}
										size="small"
										onClick={reload}
									/>
								</Tooltip>
								<Tooltip title="清空">
									<Button
										icon={<ClearOutlined />}
										size="small"
										danger
										onClick={handleClear}
									/>
								</Tooltip>
							</Space>
						</Space>
						<Input.Search
							placeholder="搜索 prompt / tool / 错误"
							allowClear
							size="small"
							onSearch={(v) => setFilter((f) => ({ ...f, q: v || undefined }))}
						/>
						<Space size={4} wrap>
							<Select
								size="small"
								placeholder="状态"
								style={{ minWidth: 100 }}
								allowClear
								value={filter.status}
								onChange={(v) =>
									setFilter((f) => ({ ...f, status: v ?? undefined }))
								}
								options={(
									["running", "completed", "cancelled", "errored"] as const
								).map((s) => ({ label: STATUS_LABEL[s], value: s }))}
							/>
							<Select
								size="small"
								placeholder="Runtime"
								style={{ minWidth: 130 }}
								allowClear
								value={filter.runtimeId}
								onChange={(v) =>
									setFilter((f) => ({ ...f, runtimeId: v ?? undefined }))
								}
								options={runtimes.map((r) => ({ label: r, value: r }))}
							/>
						</Space>
					</Space>
				</div>

				<div style={{ overflowY: "auto", height: "calc(100vh - 138px)" }}>
					<Spin spinning={loadingList}>
						{traces.length === 0 ? (
							<Empty
								description="暂无 trace"
								style={{ marginTop: 60 }}
								image={Empty.PRESENTED_IMAGE_SIMPLE}
							/>
						) : (
							<List
								size="small"
								dataSource={traces}
								renderItem={(t) => (
									<List.Item
										style={{
											cursor: "pointer",
											background:
												selectedId === t.requestId
													? token.colorFillSecondary
													: "transparent",
											padding: "8px 12px",
											display: "block",
										}}
										onClick={() => handleSelect(t.requestId)}
									>
										<Space
											style={{
												justifyContent: "space-between",
												width: "100%",
											}}
										>
											<Badge
												status={
													STATUS_COLOR[t.status] as
														| "processing"
														| "success"
														| "default"
														| "error"
												}
												text={
													<Text style={{ fontSize: 12 }}>
														{STATUS_LABEL[t.status]}
													</Text>
												}
											/>
											<Tag color="blue" style={{ marginRight: 0 }}>
												{t.runtimeId}
											</Tag>
										</Space>
										<div
											style={{
												fontSize: 12,
												color: token.colorTextSecondary,
												marginTop: 4,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{t.promptPreview || <em>(empty prompt)</em>}
										</div>
										<Space
											size={8}
											style={{
												fontSize: 11,
												color: token.colorTextTertiary,
												marginTop: 4,
											}}
										>
											<span>{formatDuration(t)}</span>
											<span>·</span>
											<span>{t.totals.events} ev</span>
											{t.totals.toolCalls > 0 && (
												<>
													<span>·</span>
													<span>{t.totals.toolCalls} tool</span>
												</>
											)}
											{t.totals.errors > 0 && (
												<>
													<span>·</span>
													<span style={{ color: token.colorError }}>
														{t.totals.errors} err
													</span>
												</>
											)}
										</Space>
									</List.Item>
								)}
							/>
						)}
					</Spin>
				</div>
			</Sider>

			<Content style={{ padding: 16, overflow: "auto" }}>
				{!detail ? (
					<Empty
						description={
							selectedId ? "trace 不存在或已被淘汰" : "从左侧选择一条 trace"
						}
						style={{ marginTop: 100 }}
					/>
				) : (
					<Spin spinning={loadingDetail}>
						<TraceDetail entry={detail} onExport={handleExport} token={token} />
					</Spin>
				)}
			</Content>
		</Layout>
	);
}

// ─────────────────────────── TraceDetail ───────────────────────────

interface TraceDetailProps {
	entry: AgentTraceEntry;
	onExport: () => void;
	token: ReturnType<typeof theme.useToken>["token"];
}

function TraceDetail({ entry, onExport, token }: TraceDetailProps) {
	return (
		<div>
			<Space
				direction="vertical"
				size={4}
				style={{ width: "100%", marginBottom: 16 }}
			>
				<Space style={{ justifyContent: "space-between", width: "100%" }}>
					<Title level={5} style={{ margin: 0, fontFamily: "monospace" }}>
						{entry.requestId}
					</Title>
					<Button icon={<DownloadOutlined />} size="small" onClick={onExport}>
						导出 JSONL
					</Button>
				</Space>
				<Space wrap>
					<Tag>conversation: {entry.conversationId}</Tag>
					<Tag color="blue">{entry.runtimeId}</Tag>
					{entry.model && <Tag color="purple">{entry.model}</Tag>}
					<Badge
						status={
							STATUS_COLOR[entry.status] as
								| "processing"
								| "success"
								| "default"
								| "error"
						}
						text={STATUS_LABEL[entry.status]}
					/>
					<Text type="secondary" style={{ fontSize: 12 }}>
						{formatDuration(entry)}
					</Text>
				</Space>
				{entry.promptPreview && (
					<div
						style={{
							background: token.colorFillTertiary,
							padding: 8,
							borderRadius: token.borderRadius,
							fontSize: 12,
							maxHeight: 120,
							overflow: "auto",
							whiteSpace: "pre-wrap",
						}}
					>
						{entry.promptPreview}
					</div>
				)}
			</Space>

			<Tabs
				items={[
					{
						key: "timeline",
						label: `Timeline (${entry.events.length})`,
						children: <Timeline entry={entry} token={token} />,
					},
					{
						key: "json",
						label: "Raw JSON",
						children: (
							<pre
								style={{
									background: token.colorFillTertiary,
									padding: 12,
									borderRadius: token.borderRadius,
									fontSize: 11,
									maxHeight: "60vh",
									overflow: "auto",
								}}
							>
								{JSON.stringify(entry, null, 2)}
							</pre>
						),
					},
				]}
			/>
		</div>
	);
}

// ─────────────────────────── Timeline ───────────────────────────

interface TimelineProps {
	entry: AgentTraceEntry;
	token: ReturnType<typeof theme.useToken>["token"];
}

function Timeline({ entry, token }: TimelineProps) {
	const t0 = entry.startedAt;
	if (entry.events.length === 0) {
		return <Empty description="无事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
	}
	return (
		<div style={{ fontFamily: "monospace", fontSize: 11 }}>
			{entry.events.map((r, idx) => (
				<details
					key={`${r.ts}-${idx}`}
					style={{
						borderBottom: `1px solid ${token.colorBorderSecondary}`,
						padding: "4px 0",
					}}
				>
					<summary
						style={{
							cursor: "pointer",
							display: "flex",
							gap: 8,
							alignItems: "center",
						}}
					>
						<span
							style={{
								color: token.colorTextTertiary,
								minWidth: 60,
								display: "inline-block",
							}}
						>
							+{Math.max(0, r.ts - t0)}ms
						</span>
						<Tag color={kindColor(r.kind)} style={{ margin: 0 }}>
							{r.kind}
						</Tag>
						<span style={{ flex: 1 }}>{summarize(r)}</span>
						{r.durationMs !== undefined && (
							<Text type="secondary" style={{ fontSize: 10 }}>
								{r.durationMs}ms
							</Text>
						)}
					</summary>
					<pre
						style={{
							margin: "4px 0 4px 68px",
							padding: 8,
							background: token.colorFillTertiary,
							borderRadius: token.borderRadius,
							fontSize: 11,
							maxHeight: 240,
							overflow: "auto",
						}}
					>
						{JSON.stringify(r, null, 2)}
					</pre>
				</details>
			))}
		</div>
	);
}

// ─────────────────────────── helpers ───────────────────────────

function mergeSummary(
	prev: AgentTraceSummary[],
	next: AgentTraceSummary,
): AgentTraceSummary[] {
	const idx = prev.findIndex((s) => s.requestId === next.requestId);
	if (idx === -1) return [next, ...prev];
	const out = [...prev];
	out[idx] = next;
	return out;
}

function formatDuration(t: AgentTraceSummary | AgentTraceEntry): string {
	if (!t.endedAt) return "running…";
	const ms = t.endedAt - t.startedAt;
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function kindColor(kind: string): string {
	switch (kind) {
		case "event":
			return "blue";
		case "dispatcher.call":
			return "geekblue";
		case "dispatcher.result":
			return "cyan";
		case "permission":
			return "orange";
		case "native.log":
			return "default";
		default:
			return "default";
	}
}

function summarize(r: AgentTraceEntry["events"][number]): string {
	const p = r.payload;
	if (p.kind === "event") {
		const ev = p.event;
		switch (ev.type) {
			case "init":
				return `init · ${ev.model ?? ""} · ${ev.nativeSessionId ?? ""}`;
			case "text.delta":
				return `text.delta · "${ev.delta.slice(0, 40)}"`;
			case "reasoning.delta":
				return `reasoning.delta · "${ev.delta.slice(0, 40)}"`;
			case "message.final":
				return `message.final · "${ev.text.slice(0, 40)}"`;
			case "tool.call":
				return `tool.call · ${ev.toolName}`;
			case "tool.result":
				return `tool.result · ${ev.isError ? "ERROR" : ev.content.kind}`;
			case "permission.request":
				return `permission.request · ${ev.toolName}`;
			case "permission.resolved":
				return `permission.resolved · ${ev.decision.approved ? "allow" : "deny"} (${ev.source})`;
			case "status":
				return `status · ${ev.status}`;
			case "usage":
				return `usage · in=${ev.inputTokens} out=${ev.outputTokens}`;
			case "rate_limit":
				return `rate_limit · ${ev.message ?? ""}`;
			case "result":
				return `result · ${ev.reason}`;
			case "error":
				return `error · ${ev.code} · ${ev.message}`;
			default:
				return "(unknown event)";
		}
	}
	if (p.kind === "dispatcher.call") return `${p.stage} · ${p.toolName}`;
	if (p.kind === "dispatcher.result") return `${p.stage} · ${p.toolName}`;
	if (p.kind === "permission")
		return `decision: ${p.decision.approved ? "allow" : "deny"} (${p.source})`;
	if (p.kind === "native.log") return `[${p.stream}] ${p.line.slice(0, 60)}`;
	return "";
}
