/**
 * AgentTrace —— 调试 / 追踪类型定义
 *
 * 详见 `docs/superpowers/specs/2026-06-21-agent-runtime-adapter-design.md` §17。
 *
 * 设计要点：
 * - 每次 `agent:create-query` 全程记录为一个 `AgentTraceEntry`，含
 *   `AgentStreamEvent` 流 + dispatcher 调用 + 用户裁决 + adapter native log
 * - `AgentTraceSummary` 用于列表（不带 events，避免每次拉重数据）
 * - 收集器在 main 进程内置；renderer 通过 `debug:agent-traces:*` IPC 查询
 *
 * @packageDocumentation
 */

import type {
	AgentPermissionSource,
	AgentRuntimeId,
	AgentRuntimeStreamEvent,
	CustomAgentRuntimeId,
	PermissionDecision,
} from "./agent-runtime";

// ─────────────────────────────────────────────────────────────────────
// Trace 摘要 / 完整条目
// ─────────────────────────────────────────────────────────────────────

export type AgentTraceStatus =
	| "running"
	| "completed"
	| "cancelled"
	| "errored";

/** 列表项；不带 events，约 1KB。 */
export interface AgentTraceSummary {
	requestId: string;
	conversationId: string;
	runtimeId: AgentRuntimeId | CustomAgentRuntimeId;
	startedAt: number;
	endedAt?: number;
	status: AgentTraceStatus;
	model?: string;
	totals: AgentTraceTotals;
	/** 用户输入摘要（前 80 字 + 是否含图） */
	promptPreview: string;
}

export interface AgentTraceTotals {
	events: number;
	textDeltas: number;
	toolCalls: number;
	permissions: number;
	errors: number;
}

/** 完整 trace；详情页加载。 */
export interface AgentTraceEntry extends AgentTraceSummary {
	events: AgentTraceRecord[];
	/** Adapter 给出的 schemaVersion */
	schemaVersion: number;
}

// ─────────────────────────────────────────────────────────────────────
// 单条记录
// ─────────────────────────────────────────────────────────────────────

/** 记录种类。 */
export type AgentTraceRecordKind =
	/** AgentStreamEvent */
	| "event"
	/** 进 dispatcher（checkApproval / execute 调用） */
	| "dispatcher.call"
	/** 出 dispatcher（带 durationMs） */
	| "dispatcher.result"
	/** 用户裁决审批落地 */
	| "permission"
	/** Adapter 内部诊断（SDK stderr 等） */
	| "native.log";

/** Dispatcher 调用阶段。 */
export type AgentTraceDispatcherStage = "checkApproval" | "execute";

export interface AgentTraceRecord {
	ts: number;
	kind: AgentTraceRecordKind;
	/** Payload 形态由 kind 决定；trace UI 直接 JSON 展示 */
	payload: AgentTraceRecordPayload;
	/** 单步耗时（仅 dispatcher.result / permission 等） */
	durationMs?: number;
	/** 关联键 */
	callId?: string;
	approvalId?: string;
	messageId?: string;
	/** 自由标签，用于诊断（如 `auto-grant by ApprovalGrantStore`） */
	tag?: string;
}

export type AgentTraceRecordPayload =
	| AgentTraceEventPayload
	| AgentTraceDispatcherCallPayload
	| AgentTraceDispatcherResultPayload
	| AgentTracePermissionPayload
	| AgentTraceNativeLogPayload;

export interface AgentTraceEventPayload {
	kind: "event";
	event: AgentRuntimeStreamEvent;
}

export interface AgentTraceDispatcherCallPayload {
	kind: "dispatcher.call";
	stage: AgentTraceDispatcherStage;
	toolName: string;
	input: unknown;
}

export interface AgentTraceDispatcherResultPayload {
	kind: "dispatcher.result";
	stage: AgentTraceDispatcherStage;
	toolName: string;
	/** 任意 JSON：approval check 结果 / 执行结果摘要 */
	result: unknown;
	error?: { message: string; raw?: unknown };
}

export interface AgentTracePermissionPayload {
	kind: "permission";
	decision: PermissionDecision;
	source: AgentPermissionSource;
}

export interface AgentTraceNativeLogPayload {
	kind: "native.log";
	/** stdout / stderr / debug */
	stream: "stdout" | "stderr" | "debug";
	line: string;
}

// ─────────────────────────────────────────────────────────────────────
// 过滤 / 配置
// ─────────────────────────────────────────────────────────────────────

export interface AgentTraceFilter {
	runtimeId?: AgentRuntimeId | CustomAgentRuntimeId;
	status?: AgentTraceStatus;
	conversationId?: string;
	/** prompt / toolName / errorMessage 模糊匹配 */
	q?: string;
	since?: number;
	until?: number;
	/** 默认 50 */
	limit?: number;
}

export type AgentTraceRedactionMode = "strict" | "loose" | "off";

/**
 * Trace 行为配置。
 *
 * v2.1 默认值：
 * - dev: `persist=true`, `redactionMode='loose'`
 * - prod: `persist=false`（仅 ring buffer），`redactionMode='loose'`
 */
export interface AgentTraceConfig {
	/** 内存 ring buffer 上限 */
	ringBufferSize: number;
	/** 是否同时落盘 jsonl */
	persist: boolean;
	/** 落盘保留天数 */
	retentionDays: number;
	/** redact 模式 */
	redactionMode: AgentTraceRedactionMode;
	/** 单条 trace 的最大事件数（超过后只记摘要） */
	maxEventsPerTrace: number;
}

/** 推荐默认值；具体环境的覆盖在 main 端 bootstrap 决定。 */
export const DEFAULT_AGENT_TRACE_CONFIG: AgentTraceConfig = {
	ringBufferSize: 50,
	persist: false,
	retentionDays: 7,
	redactionMode: "loose",
	maxEventsPerTrace: 5000,
};

// ─────────────────────────────────────────────────────────────────────
// IPC 通道（renderer 侧 client 使用）
// ─────────────────────────────────────────────────────────────────────

export const AGENT_TRACE_CHANNELS = {
	LIST: "debug:agent-traces:list",
	GET: "debug:agent-traces:get",
	UPDATED: "debug:agent-traces:updated",
	CLEAR: "debug:agent-traces:clear",
	EXPORT: "debug:agent-traces:export",
	SET_CONFIG: "debug:agent-traces:set-config",
	GET_CONFIG: "debug:agent-traces:get-config",
} as const;

export type AgentTraceChannel =
	(typeof AGENT_TRACE_CHANNELS)[keyof typeof AGENT_TRACE_CHANNELS];
