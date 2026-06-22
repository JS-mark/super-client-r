/**
 * AgentTraceCollector
 *
 * 详见 spec §17。
 *
 * 职责：
 * - 维护内存 ring buffer（默认 50 条）+ 当前 active trace map
 * - 每条 record 经过 `redactRecord` 后入库
 * - 支持订阅 summary 更新（debug:agent-traces:updated 推送）
 * - 可选委托 `AgentTracePersister` 落盘
 * - 提供 list / get / clear / export / set-config 给 IPC handler
 *
 * 性能预算（spec §17.8）：单事件入库 ≤ 50µs（不含订阅者回调）。
 */

import { EventEmitter } from "node:events";
import {
	type AgentRuntimeId,
	type AgentRuntimeStreamEvent,
	type AgentQueryRequest,
	type AgentToolBinding,
	type CustomAgentRuntimeId,
} from "@super-client/shared-types/agent-runtime";
import {
	DEFAULT_AGENT_TRACE_CONFIG,
	type AgentTraceConfig,
	type AgentTraceEntry,
	type AgentTraceFilter,
	type AgentTraceRecord,
	type AgentTraceRecordPayload,
	type AgentTraceStatus,
	type AgentTraceSummary,
	type AgentTraceTotals,
} from "@super-client/shared-types/agent-trace";

import { redactRecord } from "./redact";
import type { AgentTracePersister } from "./AgentTracePersister";

/** Begin 阶段需要的最小信息（broker 调用时即知）。 */
export interface AgentTraceBeginInfo {
	requestId: string;
	conversationId: string;
	runtimeId: AgentRuntimeId | CustomAgentRuntimeId;
	model?: string;
	prompt: AgentQueryRequest["prompt"];
	tools?: ReadonlyArray<AgentToolBinding>;
	startedAt?: number;
}

/** 可选 persister；测试可注入 NoOp。 */
export interface AgentTracePersisterLike {
	persist(entry: AgentTraceEntry): void | Promise<void>;
	dispose?(): Promise<void>;
}

const PROMPT_PREVIEW_LIMIT = 80;

export class AgentTraceCollector {
	private readonly ring: AgentTraceEntry[] = [];
	private readonly active = new Map<string, AgentTraceEntry>();
	private readonly emitter = new EventEmitter();
	private config: AgentTraceConfig;
	private readonly persister?: AgentTracePersisterLike;

	constructor(opts?: {
		config?: Partial<AgentTraceConfig>;
		persister?: AgentTracePersisterLike;
	}) {
		this.config = { ...DEFAULT_AGENT_TRACE_CONFIG, ...(opts?.config ?? {}) };
		this.persister = opts?.persister;
		this.emitter.setMaxListeners(50);
	}

	// ─────────────────────────── lifecycle ───────────────────────────

	begin(info: AgentTraceBeginInfo): void {
		const startedAt = info.startedAt ?? Date.now();
		const entry: AgentTraceEntry = {
			requestId: info.requestId,
			conversationId: info.conversationId,
			runtimeId: info.runtimeId,
			startedAt,
			status: "running",
			model: info.model,
			totals: emptyTotals(),
			promptPreview: previewPrompt(info.prompt),
			events: [],
			schemaVersion: 1,
		};
		this.active.set(info.requestId, entry);
		this.emitSummary(entry);
	}

	/**
	 * 写入一条 trace record。
	 *
	 * 输入会通过 redact 处理后才落库。
	 */
	record(
		requestId: string,
		rec: Omit<AgentTraceRecord, "ts"> & { ts?: number },
	): void {
		const entry = this.active.get(requestId);
		if (!entry) return; // begin 之前的 record / 已 finish；丢弃但不抛
		if (entry.events.length >= this.config.maxEventsPerTrace) {
			// 超过单 trace 上限：仅累计 totals，不再追加 events
			updateTotalsForPayload(entry.totals, rec.payload);
			return;
		}

		const full: AgentTraceRecord = {
			ts: rec.ts ?? Date.now(),
			kind: rec.kind,
			payload: rec.payload,
			durationMs: rec.durationMs,
			callId: rec.callId,
			approvalId: rec.approvalId,
			messageId: rec.messageId,
			tag: rec.tag,
		};

		const safe = redactRecord(full, this.config.redactionMode);
		entry.events.push(safe);
		updateTotalsForPayload(entry.totals, safe.payload);

		if (
			safe.kind === "event" &&
			safe.payload.kind === "event" &&
			safe.payload.event.type === "init"
		) {
			// init 事件携带 model；如果 begin 时未提供则补上
			if (!entry.model && safe.payload.event.model) {
				entry.model = safe.payload.event.model;
			}
		}

		this.emitSummary(entry);
	}

	finish(requestId: string, status: AgentTraceStatus): void {
		const entry = this.active.get(requestId);
		if (!entry) return;
		entry.status = status;
		entry.endedAt = Date.now();
		this.active.delete(requestId);
		this.pushToRing(entry);
		this.emitSummary(entry);
		// 落盘（fire-and-forget，错误内部 swallow）
		if (this.config.persist && this.persister) {
			Promise.resolve(this.persister.persist(entry)).catch(() => {
				/* TODO: log to RuntimePolicyService when wired */
			});
		}
	}

	// ─────────────────────────── queries ───────────────────────────

	/**
	 * 列表（不带 events）。Active + ring 合并，按 startedAt 降序，应用 filter / limit。
	 */
	list(filter?: AgentTraceFilter): AgentTraceSummary[] {
		const limit = filter?.limit ?? 50;
		const all: AgentTraceEntry[] = [...this.active.values(), ...this.ring];
		const matched = all
			.filter((e) => matchesFilter(e, filter))
			.sort((a, b) => b.startedAt - a.startedAt)
			.slice(0, limit);
		return matched.map(toSummary);
	}

	/** 完整 entry（含 events）。 */
	get(requestId: string): AgentTraceEntry | null {
		const a = this.active.get(requestId);
		if (a) return a;
		return this.ring.find((e) => e.requestId === requestId) ?? null;
	}

	clear(): void {
		this.active.clear();
		this.ring.length = 0;
	}

	// ─────────────────────────── config ───────────────────────────

	getConfig(): AgentTraceConfig {
		return { ...this.config };
	}

	setConfig(patch: Partial<AgentTraceConfig>): AgentTraceConfig {
		this.config = { ...this.config, ...patch };
		// ring buffer 缩小：drop 旧
		while (this.ring.length > this.config.ringBufferSize) {
			this.ring.shift();
		}
		return this.getConfig();
	}

	// ─────────────────────────── subscribe ───────────────────────────

	subscribe(cb: (s: AgentTraceSummary) => void): () => void {
		this.emitter.on("summary", cb);
		return () => this.emitter.off("summary", cb);
	}

	async dispose(): Promise<void> {
		this.emitter.removeAllListeners();
		await this.persister?.dispose?.();
	}

	// ─────────────────────────── internals ───────────────────────────

	private pushToRing(entry: AgentTraceEntry): void {
		this.ring.push(entry);
		while (this.ring.length > this.config.ringBufferSize) {
			this.ring.shift();
		}
	}

	private emitSummary(entry: AgentTraceEntry): void {
		this.emitter.emit("summary", toSummary(entry));
	}
}

// ─────────────────────────── helpers ───────────────────────────

function emptyTotals(): AgentTraceTotals {
	return {
		events: 0,
		textDeltas: 0,
		toolCalls: 0,
		permissions: 0,
		errors: 0,
	};
}

function updateTotalsForPayload(
	totals: AgentTraceTotals,
	payload: AgentTraceRecordPayload,
): void {
	if (payload.kind !== "event") return;
	totals.events += 1;
	const ev = payload.event;
	switch (ev.type) {
		case "text.delta":
			totals.textDeltas += 1;
			break;
		case "tool.call":
			totals.toolCalls += 1;
			break;
		case "permission.request":
		case "permission.resolved":
			totals.permissions += 1;
			break;
		case "error":
			totals.errors += 1;
			break;
		default:
			break;
	}
}

function toSummary(entry: AgentTraceEntry): AgentTraceSummary {
	return {
		requestId: entry.requestId,
		conversationId: entry.conversationId,
		runtimeId: entry.runtimeId,
		startedAt: entry.startedAt,
		endedAt: entry.endedAt,
		status: entry.status,
		model: entry.model,
		totals: { ...entry.totals },
		promptPreview: entry.promptPreview,
	};
}

function matchesFilter(entry: AgentTraceEntry, f?: AgentTraceFilter): boolean {
	if (!f) return true;
	if (f.runtimeId && entry.runtimeId !== f.runtimeId) return false;
	if (f.status && entry.status !== f.status) return false;
	if (f.conversationId && entry.conversationId !== f.conversationId)
		return false;
	if (f.since && entry.startedAt < f.since) return false;
	if (f.until && entry.startedAt > f.until) return false;
	if (f.q) {
		const q = f.q.toLowerCase();
		if (
			!entry.promptPreview.toLowerCase().includes(q) &&
			!matchesEventQ(entry, q)
		) {
			return false;
		}
	}
	return true;
}

function matchesEventQ(entry: AgentTraceEntry, q: string): boolean {
	for (const r of entry.events) {
		if (r.payload.kind === "event") {
			const ev = r.payload.event;
			if (ev.type === "tool.call" && ev.toolName.toLowerCase().includes(q)) {
				return true;
			}
			if (ev.type === "error" && ev.message.toLowerCase().includes(q)) {
				return true;
			}
		} else if (r.payload.kind === "dispatcher.call") {
			if (r.payload.toolName.toLowerCase().includes(q)) return true;
		}
	}
	return false;
}

function previewPrompt(prompt: AgentQueryRequest["prompt"]): string {
	if (prompt.kind === "text") {
		const base = truncatePreview(prompt.text);
		const att = prompt.attachments?.length
			? ` [+${prompt.attachments.length} attachments]`
			: "";
		return base + att;
	}
	// parts
	const text = prompt.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join(" ");
	const imageCount = prompt.parts.filter((p) => p.type === "image").length;
	const att = imageCount > 0 ? ` [+${imageCount} images]` : "";
	return truncatePreview(text) + att;
}

function truncatePreview(s: string): string {
	if (s.length <= PROMPT_PREVIEW_LIMIT) return s;
	return `${s.slice(0, PROMPT_PREVIEW_LIMIT)}…`;
}

// ─────────────────────────── singleton ───────────────────────────

let singleton: AgentTraceCollector | null = null;

/** 主进程单例（bootstrap 后可用）。 */
export function getAgentTraceCollector(): AgentTraceCollector {
	if (!singleton) {
		singleton = new AgentTraceCollector();
	}
	return singleton;
}

/** 测试 / bootstrap 替换；调用方应保证不在并发请求中替换。 */
export function setAgentTraceCollector(
	instance: AgentTraceCollector | null,
): void {
	singleton = instance;
}

/** 仅测试用：重置单例。 */
export function _resetAgentTraceCollectorForTest(): void {
	singleton = null;
}

// 为持久化器声明做 import-cycle 兜底
export type { AgentTracePersister };
