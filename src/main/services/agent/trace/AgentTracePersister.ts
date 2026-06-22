/**
 * AgentTracePersister
 *
 * 把 finished trace 落盘到 `userData/agent-traces/YYYY-MM-DD/<requestId>.jsonl`，
 * 每行一条 record，第一行是 trace summary header，第二行起是 events。
 *
 * 行为：
 * - 文件名按 trace.startedAt 的本地日期分目录
 * - 写入采用 fs.appendFile（每条 trace 一个文件，不需要并发互锁）
 * - 启动时按 retentionDays 清理过期目录
 *
 * 不在事件 hot path 上工作；fire-and-forget 调用，错误内部 swallow。
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
	AgentTraceEntry,
	AgentTraceRecord,
	AgentTraceSummary,
} from "@super-client/shared-types/agent-trace";

const HEADER_KIND = "header";

interface HeaderLine {
	kind: typeof HEADER_KIND;
	summary: AgentTraceSummary;
	schemaVersion: number;
}

export interface AgentTracePersisterOptions {
	/** 落盘目录；默认 `<userData>/agent-traces` */
	baseDir: string;
	/** 保留天数；超过的目录会在 init / 每日 GC 时被删 */
	retentionDays: number;
}

export class AgentTracePersister {
	private gcTimer: NodeJS.Timeout | null = null;

	constructor(private readonly opts: AgentTracePersisterOptions) {}

	async init(): Promise<void> {
		await fs.mkdir(this.opts.baseDir, { recursive: true });
		await this.runGc().catch(() => undefined);
		// 每 24h 跑一次 GC（开发模式下可能不会触发，但启动 GC 已覆盖）
		this.gcTimer = setInterval(
			() => this.runGc().catch(() => undefined),
			24 * 60 * 60 * 1000,
		);
		this.gcTimer.unref?.();
	}

	async persist(entry: AgentTraceEntry): Promise<void> {
		const dateDir = join(this.opts.baseDir, formatYmd(entry.startedAt));
		await fs.mkdir(dateDir, { recursive: true });
		const file = join(dateDir, `${sanitize(entry.requestId)}.jsonl`);
		const header: HeaderLine = {
			kind: HEADER_KIND,
			summary: summaryOf(entry),
			schemaVersion: entry.schemaVersion,
		};
		const lines: string[] = [
			JSON.stringify(header),
			...entry.events.map((r) => JSON.stringify(serializeRecord(r))),
		];
		await fs.writeFile(file, `${lines.join("\n")}\n`, "utf8");
	}

	async dispose(): Promise<void> {
		if (this.gcTimer) {
			clearInterval(this.gcTimer);
			this.gcTimer = null;
		}
	}

	// ─────────────────────────── GC ───────────────────────────

	private async runGc(): Promise<void> {
		const cutoff = Date.now() - this.opts.retentionDays * 24 * 60 * 60 * 1000;
		let entries: string[];
		try {
			entries = await fs.readdir(this.opts.baseDir);
		} catch {
			return;
		}
		await Promise.all(
			entries.map(async (name) => {
				const ts = parseYmd(name);
				if (ts === null) return; // 不识别的目录名，留着
				if (ts < cutoff) {
					await fs
						.rm(join(this.opts.baseDir, name), {
							recursive: true,
							force: true,
						})
						.catch(() => undefined);
				}
			}),
		);
	}
}

// ─────────────────────────── helpers ───────────────────────────

function summaryOf(entry: AgentTraceEntry): AgentTraceSummary {
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

function serializeRecord(r: AgentTraceRecord): AgentTraceRecord {
	// payload 已 redact；这里仅保证 JSON serializable
	return r;
}

function formatYmd(ts: number): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function parseYmd(name: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(name);
	if (!m) return null;
	const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return Number.isFinite(ts) ? ts : null;
}

const UNSAFE_FILENAME = /[^A-Za-z0-9._-]/g;

function sanitize(name: string): string {
	return name.replace(UNSAFE_FILENAME, "_").slice(0, 128) || "trace";
}
