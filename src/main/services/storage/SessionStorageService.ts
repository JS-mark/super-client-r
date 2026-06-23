/**
 * Project / Session 重设计 A-5 — SessionStorageService
 *
 * 单个 session 的 JSONL 事件流 + .meta.json 元数据持久化。负责：
 *  - casual / project 两类会话的目录路由
 *  - **lazy 落盘**：create 只写 .meta.json；首条 appendEvent 才创建 .jsonl
 *  - reassignProject：首条消息发出前可改 projectId，发出后报错（§9.10 锁死）
 *  - fork：跨桶（casual ↔ project）消息复制 + lineage 标记
 *  - readMessages：调 jsonl 的 parseEvents + eventsToMessages
 *
 * 不做：
 *  - git worktree（renderer 调 git；本服务只接 fork 的消息复制部分）
 *  - 跨设备同步 / 索引 / 全文搜索
 */

import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
	appendFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Message } from "@super-client/shared-types/chat";
import type {
	ChatMode,
	SessionEvent,
	SessionMeta,
	SessionTombstone,
} from "@super-client/shared-types/project";
import {
	eventsToMessages,
	parseEvents,
	parseEventsWithReport,
	serializeEvent,
} from "./jsonl";
import type { ProjectStorageService } from "./ProjectStorageService";

const CASUAL_DIR = "casual-sessions";
const PROJECTS_DIR = "projects";
const PROJECT_SESSIONS_DIR = "sessions";

interface SessionBucket {
	dir: string;
	storageRoot: NonNullable<SessionMeta["storageRoot"]>;
	fallbackReason?: string;
	legacyDir?: string;
}

export interface CreateSessionInput {
	projectId: string | null;
	name?: string;
	chatMode?: ChatMode;
}

export interface ReadMessagesRange {
	/** 取最后 N 条消息（reduce 后再 slice，不是 byte-tail） */
	tail?: number;
}

export interface ForkOptions {
	/** 目标 projectId；null = casual。可与源不同（跨桶）。 */
	targetProjectId: string | null;
	/** "编辑历史 = fork" 场景下记录从哪条消息开始派生 */
	forkOriginMessageId?: string;
	/** 可选自定义 name；不传则 `<source.name> (副本)` */
	name?: string;
}

export class SessionStorageService {
	private readonly userRoot: string;

	constructor(
		baseDir: string,
		userId: string,
		// 只用于校验 projectId 存在；不持有强引用
		private readonly projectStorage?: ProjectStorageService,
	) {
		this.userRoot = join(baseDir, userId);
		mkdirSync(join(this.userRoot, CASUAL_DIR), { recursive: true });
	}

	// ─── public API ──────────────────────────────────────────────

	list(projectId: string | null): SessionMeta[] {
		const bucket = this.resolveSessionBucket(projectId);
		const dir = bucket.dir;
		if (!existsSync(dir)) return [];
		const result: SessionMeta[] = [];
		for (const entry of readdirSync(dir)) {
			if (!entry.endsWith(".meta.json")) continue;
			try {
				const raw = readFileSync(join(dir, entry), "utf-8");
				const meta = JSON.parse(raw) as SessionMeta;
				if (isValidMeta(meta) && !meta.deletedAt) {
					result.push(this.withStorageMarker(meta, bucket));
				}
			} catch {
				// 跳过损坏的 meta
			}
		}
		// 默认按 updatedAt desc 排序
		result.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
		return result;
	}

	listDeleted(projectId?: string | null): SessionMeta[] {
		const buckets =
			projectId === undefined ? this.allProjectBuckets() : [projectId];
		const result: SessionMeta[] = [];
		for (const bucket of buckets) {
			const resolved = this.resolveSessionBucket(bucket);
			const dir = resolved.dir;
			if (!existsSync(dir)) continue;
			for (const entry of readdirSync(dir)) {
				if (!entry.endsWith(".meta.json")) continue;
				try {
					const meta = JSON.parse(
						readFileSync(join(dir, entry), "utf-8"),
					) as SessionMeta;
					if (isValidMeta(meta) && meta.deletedAt) {
						result.push(this.withStorageMarker(meta, resolved));
					}
				} catch {
					// skip damaged tombstone meta
				}
			}
		}
		result.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
		return result;
	}

	/**
	 * 跨桶列出所有 sessions（casual + 全部 project）。给老的 `getConversationList`
	 * 消费者迁移用（G-2: RemoteChatBridge.loadBindingsFromStorage）。
	 */
	listAll(): SessionMeta[] {
		const casual = this.list(null);
		const projectsRoot = join(this.userRoot, PROJECTS_DIR);
		const projectIds = existsSync(projectsRoot)
			? readdirSync(projectsRoot).filter((n) => !n.startsWith("."))
			: [];
		const all: SessionMeta[] = [...casual];
		for (const projectId of projectIds) {
			all.push(...this.list(projectId));
		}
		all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
		return all;
	}

	create(input: CreateSessionInput): SessionMeta {
		this.assertProjectExists(input.projectId);
		const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
		const now = Date.now();
		const meta: SessionMeta = {
			id,
			projectId: input.projectId,
			name: input.name,
			chatMode: "agent",
			createdAt: now,
			updatedAt: now,
			messageCount: 0,
		};
		const marked = this.withStorageMarker(
			meta,
			this.resolveSessionBucket(input.projectId),
		);
		this.writeMeta(marked);
		return marked;
	}

	getMeta(sessionId: string): SessionMeta {
		const meta = this.findMeta(sessionId, { includeDeleted: true });
		if (!meta) throw new Error(`session not found: ${sessionId}`);
		return meta;
	}

	updateMeta(sessionId: string, patch: Partial<SessionMeta>): SessionMeta {
		const current = this.getMeta(sessionId);
		// 不允许通过 updateMeta 改 projectId / id —— 走 reassignProject
		const { id: _id, projectId: _pid, ...safePatch } = patch as SessionMeta;
		if (safePatch.chatMode !== undefined) {
			safePatch.chatMode = "agent";
		}

		const merged: SessionMeta = {
			...current,
			...safePatch,
			updatedAt: Date.now(),
		};
		this.writeMeta(merged);
		return merged;
	}

	rename(sessionId: string, name: string): SessionMeta {
		return this.updateMeta(sessionId, { name });
	}

	delete(sessionId: string): {
		deleted: boolean;
		tombstone?: SessionTombstone;
	} {
		const meta = this.findMeta(sessionId);
		if (!meta) return { deleted: false };
		if (meta.deletedAt && meta.tombstone) {
			return { deleted: false, tombstone: meta.tombstone };
		}
		const deletedAt = Date.now();
		const tombstone: SessionTombstone = {
			id: sessionId,
			kind: "session",
			deletedAt,
			reason: "user-delete",
			...(meta.remote ? { remoteBinding: meta.remote } : {}),
			restoreHint: "Settings > Advanced > Project Management",
		};
		this.writeMeta({
			...meta,
			deletedAt,
			tombstone,
			updatedAt: deletedAt,
		});
		return { deleted: true, tombstone };
	}

	restoreDeleted(sessionId: string): SessionMeta {
		const meta = this.findMeta(sessionId, { includeDeleted: true });
		if (!meta) throw new Error(`session not found: ${sessionId}`);
		const restored: SessionMeta = { ...meta, updatedAt: Date.now() };
		delete restored.deletedAt;
		delete restored.tombstone;
		this.writeMeta(restored);
		return restored;
	}

	/**
	 * §9.10 (C1) 锁死前可改 projectId / 锁死后必须 fork。
	 *
	 * 锁定信号 = `<id>.jsonl` 存在（首条 appendEvent 创建）。
	 * 未锁定 → 移动 `<id>.meta.json` 到新桶；锁定 → 抛错让 caller 走 fork。
	 */
	reassignProject(
		sessionId: string,
		nextProjectId: string | null,
	): SessionMeta {
		const meta = this.getMeta(sessionId);
		if (meta.projectId === nextProjectId) return meta;
		this.assertProjectExists(nextProjectId);

		const oldBucket = this.resolveSessionBucket(meta.projectId);
		if (existsSync(join(oldBucket.dir, `${sessionId}.jsonl`))) {
			throw new Error(
				`cannot reassign session ${sessionId}: messages already persisted (lock acquired)`,
			);
		}

		const updated: SessionMeta = {
			...meta,
			projectId: nextProjectId,
			updatedAt: Date.now(),
		};
		// 写新桶的 meta，再删旧桶的 meta（避免中途崩了两边都没数据）
		const marked = this.withStorageMarker(
			updated,
			this.resolveSessionBucket(nextProjectId),
		);
		this.writeMeta(marked);
		const oldMetaPath = join(oldBucket.dir, `${sessionId}.meta.json`);
		if (existsSync(oldMetaPath)) rmSync(oldMetaPath);
		return marked;
	}

	/**
	 * 追加一条事件到 `<id>.jsonl`。首次调用懒创建文件并把 messageCount 增量更新。
	 * 内部使用 `appendFileSync`，O(1) 末端追加。
	 *
	 * 同 id 重发语义（plan §10 #2 流式落盘配套）：
	 *  - 同 id 的 `user_message` / `assistant_message` 第二次写入视作 "update"，
	 *    新行仍然追加到 jsonl（append-only 不改写历史），但 messageCount 不再 +1。
	 *  - reducer 在读侧合并这两条同 id 事件为同一条 Message。
	 */
	appendEvent(sessionId: string, event: SessionEvent): void {
		const meta = this.getMeta(sessionId);
		if (meta.deletedAt) {
			throw new Error(`cannot append to deleted session: ${sessionId}`);
		}
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		const normalized = this.normalizeEvent(meta, event);
		if (this.hasEventId(jsonlPath, normalized.eventId)) return;

		// 写入前先判定是不是同 id 的"消息更新"（assistant placeholder 落空 content，
		// 流式结束后再以最终 content + metadata 重发同 id 事件做覆盖）。
		const countedMessageKey = this.getCountedMessageKey(normalized);
		const isMessageUpdate =
			countedMessageKey !== null &&
			existsSync(jsonlPath) &&
			this.hasCountedMessageWithKey(jsonlPath, countedMessageKey);

		appendFileSync(jsonlPath, serializeEvent(normalized), "utf-8");

		// 维护 messageCount —— 仅"新增"的 user_message / assistant_message /
		// assistant.part_start(messageId) 计数；tool / approval / file_artifact /
		// session_marker 不算"消息"；同 id update / 同 messageId 多 part 不算。
		if (countedMessageKey !== null && !isMessageUpdate) {
			const next: SessionMeta = {
				...meta,
				messageCount: meta.messageCount + 1,
				updatedAt: Date.now(),
				...(normalized.type === "user_message" && !meta.preview
					? { preview: normalized.content.slice(0, 100) }
					: {}),
			};
			this.safeWriteMetaAfterAppend(meta, next);
		} else {
			// 非新增的事件（tool / approval / 同 id update / ...）只更新 updatedAt
			this.safeWriteMetaAfterAppend(meta, { ...meta, updatedAt: Date.now() });
		}
	}

	/**
	 * 读消息：reduce jsonl 事件流为 Message[]。
	 * range.tail 设了就只取最后 N 条 message（reduce 后 slice，简单不假设 byte 长度）。
	 * jsonl 不存在时返回 []。
	 */
	readMessages(sessionId: string, range?: ReadMessagesRange): Message[] {
		const meta = this.getMeta(sessionId);
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		if (!existsSync(jsonlPath)) return [];
		const content = readFileSync(jsonlPath, "utf-8");
		const report = parseEventsWithReport(content);
		if (report.malformedMiddleLines > 0 && !meta.corrupted) {
			this.writeMeta({ ...meta, corrupted: true, updatedAt: Date.now() });
		}
		const events = report.events;
		const msgs = eventsToMessages(events);
		if (range?.tail !== undefined && range.tail >= 0) {
			return msgs.slice(-range.tail);
		}
		return msgs;
	}

	/**
	 * Crash-recovery sweep for a single session.
	 *
	 * Scans the jsonl for `tool_call` events that have no matching
	 * `tool_result` / `tool_error`, and appends a synthetic `tool_error` for
	 * each one. Without this, a session whose previous run crashed (or whose
	 * process was killed) mid-tool-execution would reload with the tool card
	 * stuck in "执行中..." forever.
	 *
	 * `reason` is written into `error` so the user can see WHY it was
	 * cancelled (e.g. "中断：应用未正常退出").
	 *
	 * Returns the number of tool calls sealed.
	 */
	sealInflightToolCalls(sessionId: string, reason: string): number {
		const meta = this.findMeta(sessionId, { includeDeleted: false });
		if (!meta || meta.deletedAt) return 0;
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		if (!existsSync(jsonlPath)) return 0;

		const events = parseEvents(readFileSync(jsonlPath, "utf-8"));
		const completed = new Set<string>();
		for (const e of events) {
			if (e.type === "tool_result" || e.type === "tool_error") {
				completed.add(e.toolCallId);
			}
		}
		const orphans: string[] = [];
		for (const e of events) {
			if (e.type === "tool_call" && !completed.has(e.id)) {
				orphans.push(e.id);
			}
		}
		if (orphans.length === 0) return 0;

		const now = Date.now();
			for (const toolCallId of orphans) {
				this.appendEvent(sessionId, {
					type: "tool_error",
					toolCallId,
					ts: now,
					error: reason,
				});
			}
		return orphans.length;
	}

	/**
	 * Walk every non-deleted session and seal any in-flight tool calls. Called
	 * once at app startup to recover from crashes / forced exits in the
	 * previous run.
	 *
	 * Best-effort: per-session failures are swallowed (logged by caller via
	 * the returned `errors` count) so one bad jsonl can't block the entire
	 * sweep.
	 */
	sealAllInflightToolCalls(reason: string): {
		sessions: number;
		toolCalls: number;
		errors: number;
	} {
		let sessions = 0;
		let toolCalls = 0;
		let errors = 0;
		for (const meta of this.listAll()) {
			try {
				const sealed = this.sealInflightToolCalls(meta.id, reason);
				if (sealed > 0) {
					sessions += 1;
					toolCalls += sealed;
				}
			} catch {
				errors += 1;
			}
		}
		return { sessions, toolCalls, errors };
	}

	/**
	 * Fork: 复制源 session 的 jsonl + meta 到目标桶。
	 * - 跨桶（casual ↔ project）通过 `targetProjectId` 切换
	 * - lineage.forkOriginId = source.id；可选 forkOriginMessageId 标记起点
	 * - 复制 per-session 子目录（attachments / tool-outputs）
	 *
	 * 不做 git worktree（renderer 那层调 git，再把结果带回来）。
	 */
	fork(sourceId: string, opts: ForkOptions): SessionMeta {
		const source = this.getMeta(sourceId);
		this.assertProjectExists(opts.targetProjectId);

		const newId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
		const now = Date.now();
		const target: SessionMeta = {
			id: newId,
			projectId: opts.targetProjectId,
			name: opts.name ?? `${source.name ?? "未命名会话"} (副本)`,
			chatMode: source.chatMode,
			createdAt: now,
			updatedAt: now,
			messageCount: source.messageCount,
			preview: source.preview,
			lineage: {
				...source.lineage,
				forkOriginId: sourceId,
				...(opts.forkOriginMessageId
					? { forkOriginMessageId: opts.forkOriginMessageId }
					: {}),
			},
		};
		const markedTarget = this.withStorageMarker(
			target,
			this.resolveSessionBucket(target.projectId),
		);
		this.writeMeta(markedTarget);

		// 复制 jsonl（如果源有）
		const sourceJsonl = this.sessionFile(source, ".jsonl");
		if (existsSync(sourceJsonl)) {
			const targetJsonl = this.sessionFile(markedTarget, ".jsonl");
			cpSync(sourceJsonl, targetJsonl);
		}

		// 复制 per-session 子目录
		const sourceSub = join(
			this.resolveSessionBucket(source.projectId).dir,
			source.id,
		);
		if (existsSync(sourceSub)) {
			const targetSub = join(
				this.resolveSessionBucket(markedTarget.projectId).dir,
				markedTarget.id,
			);
			cpSync(sourceSub, targetSub, { recursive: true });
		}

		return markedTarget;
	}

	/**
	 * G-3 老数据导入专用：直接落一份完整的 SessionMeta + JSONL 事件流。
	 * 不走 `create` / `appendEvent` 的常规路径——保留原始 id、时间戳、
	 * messageCount，避免被生成式逻辑覆盖。
	 *
	 * 普通业务代码不要用。
	 */
	injectLegacy(meta: SessionMeta, events: SessionEvent[]): void {
		this.assertProjectExists(meta.projectId);
		this.writeMeta(meta);
		if (events.length === 0) return;
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		let seq = 0;
		const buf = events
			.map((event) => {
				seq += 1;
				return serializeEvent(this.normalizeEvent(meta, event, seq));
			})
			.join("");
		appendFileSync(jsonlPath, buf, "utf-8");
	}

	// ─── 目录工具（G-2: 给 ApprovalGrantStore / RemoteChatBridge /
	// AttachmentContextResolver 用，让 main 端老消费者从 ConversationStorageService
	// 切到新 storage） ─────────────────────────────────────

	/**
	 * 该 session 的 per-session 子目录，用于挂附件 / 工具产物等。
	 * 不存在时**不**自动创建——由 caller 自己 mkdirSync 决定。
	 *
	 * 路径形态：
	 *   casual:  `<userRoot>/casual-sessions/<id>/`
	 *   project: `<userRoot>/projects/<projectId>/sessions/<id>/`
	 */
	getSessionDir(sessionId: string): string {
		const meta = this.getMeta(sessionId);
		return join(this.resolveSessionBucket(meta.projectId).dir, meta.id);
	}

	/**
	 * 该 session 的附件目录。**会自动创建**（与老 ConversationStorageService.getAttachmentsDir
	 * 行为对齐，避免上游 caller 写文件前还得自己 ensure）。
	 */
	getAttachmentsDir(sessionId: string): string {
		const dir = join(this.getSessionDir(sessionId), "attachments");
		mkdirSync(dir, { recursive: true });
		return dir;
	}

	/**
	 * 该 session 的工具输出目录。同上自动创建。
	 */
	getToolOutputsDir(sessionId: string): string {
		const dir = join(this.getSessionDir(sessionId), "tool-outputs");
		mkdirSync(dir, { recursive: true });
		return dir;
	}

	// ─── helpers ─────────────────────────────────────────────────

	private appDataSessionsDir(projectId: string | null): string {
		if (projectId === null) {
			return join(this.userRoot, CASUAL_DIR);
		}
		return join(this.userRoot, PROJECTS_DIR, projectId, PROJECT_SESSIONS_DIR);
	}

	private resolveSessionBucket(projectId: string | null): SessionBucket {
		if (projectId === null) {
			return {
				dir: this.appDataSessionsDir(null),
				storageRoot: "casual-app-data",
			};
		}

		// G-2: 项目会话数据**统一**写在 userData 下，不再侵入 `project.cwd/.scr-data/`。
		// 历史上写到 .scr-data 的会话不会被本服务再次读取（用户若需可手动迁移）；
		// 这里只保留兼容字段 `legacyDir`（即 userData 路径自身）方便 trace 标记。
		const dir = this.appDataSessionsDir(projectId);
		return {
			dir,
			storageRoot: "project-app-data-fallback",
			fallbackReason: this.projectStorage
				? "scr-data-disabled-by-policy"
				: "project-storage-unavailable",
			legacyDir: dir,
		};
	}

	private sessionFile(meta: SessionMeta, ext: ".jsonl" | ".meta.json"): string {
		return join(
			this.resolveSessionBucket(meta.projectId).dir,
			`${meta.id}${ext}`,
		);
	}

	private writeMeta(meta: SessionMeta): void {
		const bucket = this.resolveSessionBucket(meta.projectId);
		const marked = this.withStorageMarker(meta, bucket);
		const dir = bucket.dir;
		mkdirSync(dir, { recursive: true });
		const target = join(dir, `${marked.id}.meta.json`);
		const tmp = join(
			dir,
			`${marked.id}.meta.json.tmp-${process.pid}-${Date.now()}`,
		);
		writeFileSync(tmp, JSON.stringify(marked, null, 2), "utf-8");
		renameSync(tmp, target);
	}

	private safeWriteMetaAfterAppend(
		previous: SessionMeta,
		next: SessionMeta,
	): void {
		try {
			this.writeMeta(next);
		} catch (err) {
			try {
				this.writeMeta({ ...previous, metaNeedsRepair: true });
			} catch {
				// JSONL is source of truth; callers will surface original failure.
			}
			throw err;
		}
	}

	/** 扫描 casual + 全部 project sessions 找一个 sessionId（O(n)，但 n 通常很小）。 */
	private findMeta(
		sessionId: string,
		opts: { includeDeleted?: boolean } = {},
	): SessionMeta | null {
		// casual 桶
		const casualMeta = this.tryReadMeta(null, sessionId, opts);
		if (casualMeta) return casualMeta;
		// 各 project 桶
		for (const projectId of this.listProjectBucketIds()) {
			if (projectId.startsWith(".")) continue;
			const meta = this.tryReadMeta(projectId, sessionId, opts);
			if (meta) return meta;
		}
		return null;
	}

	private tryReadMeta(
		projectId: string | null,
		sessionId: string,
		opts: { includeDeleted?: boolean } = {},
	): SessionMeta | null {
		const bucket = this.resolveSessionBucket(projectId);
		const path = join(bucket.dir, `${sessionId}.meta.json`);
		if (!existsSync(path)) return null;
		try {
			const meta = this.withStorageMarker(
				JSON.parse(readFileSync(path, "utf-8")) as SessionMeta,
				bucket,
			);
			if (!isValidMeta(meta)) return null;
			if (meta.deletedAt && !opts.includeDeleted) return null;
			if (meta.metaNeedsRepair) return this.repairMetaFromJsonl(meta);
			return meta;
		} catch {
			return null;
		}
	}

	private normalizeEvent(
		meta: SessionMeta,
		event: SessionEvent,
		forcedSeq?: number,
	): SessionEvent & { eventId: string; seq: number; writtenAt: number } {
		const now = Date.now();
		const seq = forcedSeq ?? this.nextSeq(meta);
		const eventId =
			event.eventId ??
			`${meta.id}:${event.type}:${"id" in event ? String(event.id) : seq}:${seq}`;
		return {
			...event,
			eventId,
			seq,
			writtenAt: event.writtenAt ?? now,
		};
	}

	private nextSeq(meta: SessionMeta): number {
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		if (!existsSync(jsonlPath)) return 1;
		const events = parseEvents(readFileSync(jsonlPath, "utf-8"));
		const lastSeq = events.reduce(
			(max, event) => Math.max(max, event.seq ?? 0),
			0,
		);
		return lastSeq + 1;
	}

	private hasEventId(jsonlPath: string, eventId: string): boolean {
		if (!existsSync(jsonlPath)) return false;
		const events = parseEvents(readFileSync(jsonlPath, "utf-8"));
		return events.some((event) => event.eventId === eventId);
	}

	private hasCountedMessageWithKey(jsonlPath: string, key: string): boolean {
		if (!existsSync(jsonlPath)) return false;
		const events = parseEvents(readFileSync(jsonlPath, "utf-8"));
		return events.some((event) => this.getCountedMessageKey(event) === key);
	}

	private repairMetaFromJsonl(meta: SessionMeta): SessionMeta {
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		if (!existsSync(jsonlPath)) {
			const repaired = { ...meta };
			delete repaired.metaNeedsRepair;
			this.writeMeta(repaired);
			return repaired;
		}
		const report = parseEventsWithReport(readFileSync(jsonlPath, "utf-8"));
		const firstUser = report.events.find(
			(event) => event.type === "user_message",
		);
		const lastTs = report.events.reduce(
			(max, event) => Math.max(max, event.ts ?? 0, event.writtenAt ?? 0),
			meta.updatedAt,
		);
		const repaired: SessionMeta = {
			...meta,
			messageCount: this.countRenderedMessages(report.events),
			updatedAt: lastTs,
			...(firstUser?.type === "user_message"
				? { preview: firstUser.content.slice(0, 100) }
				: {}),
			...(report.malformedMiddleLines > 0 ? { corrupted: true } : {}),
		};
		delete repaired.metaNeedsRepair;
		this.writeMeta(repaired);
		return repaired;
	}

	private countRenderedMessages(events: SessionEvent[]): number {
		const keys = new Set<string>();
		for (const event of events) {
			const key = this.getCountedMessageKey(event);
			if (key) keys.add(key);
		}
		return keys.size;
	}

	private getCountedMessageKey(event: SessionEvent): string | null {
		switch (event.type) {
			case "user_message":
				return `user:${event.id}`;
			case "assistant_message":
				return `assistant:${event.id}`;
			case "assistant.part_start":
				return `assistant:${event.messageId}`;
			default:
				return null;
		}
	}

	private allProjectBuckets(): Array<string | null> {
		const buckets: Array<string | null> = [null];
		buckets.push(...this.listProjectBucketIds());
		return buckets;
	}

	private listProjectBucketIds(): string[] {
		const ids = new Set<string>();
		if (this.projectStorage) {
			for (const project of this.projectStorage.list()) ids.add(project.id);
		}
		const projectsRoot = join(this.userRoot, PROJECTS_DIR);
		if (existsSync(projectsRoot)) {
			for (const projectId of readdirSync(projectsRoot)) {
				if (!projectId.startsWith(".")) ids.add(projectId);
			}
		}
		return [...ids];
	}

	private migrateLegacyProjectBucket(
		projectId: string,
		legacyDir: string,
		targetDir: string,
	): void {
		if (!existsSync(legacyDir)) return;
		mkdirSync(targetDir, { recursive: true });
		for (const entry of readdirSync(legacyDir)) {
			const source = join(legacyDir, entry);
			const target = join(targetDir, entry);
			if (existsSync(target)) continue;
			cpSync(source, target, { recursive: true });
		}
		const now = Date.now();
		for (const entry of readdirSync(targetDir)) {
			if (!entry.endsWith(".meta.json")) continue;
			const path = join(targetDir, entry);
			try {
				const meta = JSON.parse(readFileSync(path, "utf-8")) as SessionMeta;
				if (!isValidMeta(meta) || meta.projectId !== projectId) continue;
				if (meta.storageRoot === "project-scr-data" && meta.storageMigratedAt) {
					continue;
				}
				writeFileSync(
					path,
					JSON.stringify(
						{
							...meta,
							storageRoot: "project-scr-data",
							storageMigratedAt: meta.storageMigratedAt ?? now,
						},
						null,
						2,
					),
					"utf-8",
				);
			} catch {
				// Damaged meta will be skipped by normal readers.
			}
		}
	}

	private withStorageMarker(
		meta: SessionMeta,
		bucket: SessionBucket,
	): SessionMeta {
		return {
			...meta,
			storageRoot: bucket.storageRoot,
			...(bucket.fallbackReason
				? { storageFallbackReason: bucket.fallbackReason }
				: { storageFallbackReason: undefined }),
			...(bucket.storageRoot === "project-scr-data" && meta.storageMigratedAt
				? { storageMigratedAt: meta.storageMigratedAt }
				: {}),
		};
	}

	private assertProjectExists(projectId: string | null): void {
		if (projectId === null) return;
		// 优先用 projectStorage（更准），否则 fallback 到 fs 检查
		if (this.projectStorage) {
			const exists = this.projectStorage.list().some((p) => p.id === projectId);
			if (!exists) throw new Error(`project not found: ${projectId}`);
			return;
		}
		const dir = join(this.userRoot, PROJECTS_DIR, projectId);
		if (!existsSync(dir)) throw new Error(`project dir not found: ${dir}`);
	}
}

function isValidMeta(m: unknown): m is SessionMeta {
	if (!m || typeof m !== "object") return false;
	const r = m as Record<string, unknown>;
	return (
		typeof r.id === "string" &&
		(r.projectId === null || typeof r.projectId === "string") &&
		typeof r.chatMode === "string" &&
		typeof r.createdAt === "number" &&
		typeof r.updatedAt === "number" &&
		typeof r.messageCount === "number"
	);
}

// ─────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────

let _singleton: SessionStorageService | null = null;

export function initializeSessionStorage(
	baseDir: string,
	userId: string,
	projectStorage: ProjectStorageService,
): SessionStorageService {
	_singleton = new SessionStorageService(baseDir, userId, projectStorage);
	return _singleton;
}

export function getSessionStorage(): SessionStorageService {
	if (!_singleton) {
		throw new Error(
			"SessionStorageService not initialized — call initializeSessionStorage() first",
		);
	}
	return _singleton;
}
