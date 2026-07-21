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
	statSync,
	writeFileSync,
	appendFileSync,
	openSync,
	readSync,
	closeSync,
} from "node:fs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import type { Message, MessagePart } from "@super-client/shared-types/chat";
import type {
	ProjectArchiveExportResult as SharedProjectArchiveExportResult,
	ProjectArchiveManifest as SharedProjectArchiveManifest,
	ProjectArchiveReferencedPayloadSession as SharedProjectArchiveReferencedPayloadSession,
	ProjectArchiveSessionEntry as SharedProjectArchiveSessionEntry,
	SessionArchiveExportResult as SharedSessionArchiveExportResult,
	SessionArchiveFileEntry as SharedSessionArchiveFileEntry,
	SessionArchiveManifest as SharedSessionArchiveManifest,
	SessionArchiveRedactionMode as SharedSessionArchiveRedactionMode,
	SessionArchiveReferencedAttachment as SharedSessionArchiveReferencedAttachment,
	SessionArchiveReferencedContentRef as SharedSessionArchiveReferencedContentRef,
	SessionMessagesPageResult,
} from "@super-client/shared-types/electron-api";
import type {
	ChatMode,
	Project,
	ProjectSettings,
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
import { isBlockedPath } from "../../utils/pathSafety";
import { redactPath, type PrivacyRedactionContext } from "../privacy/redaction";

const CASUAL_DIR = "casual-sessions";
const PROJECTS_DIR = "projects";
const PROJECT_SESSIONS_DIR = "sessions";
const CONTENT_REF_DIR = "content-refs";
const CONTENT_REF_PREFIX = "session-content://v1/tool-outputs/content-refs/";
const CONTENT_REF_ID_RE = /^[a-f0-9]{64}$/;
// Keep JSONL readable for normal responses and only externalize payloads that
// are large enough to affect replay and renderer memory. This intentionally
// targets complete/patch payload fields, not streaming deltas.
const ASSISTANT_PART_CONTENT_REF_THRESHOLD_BYTES = 64 * 1024;

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

export interface ReadMessagesPageOptions {
	/**
	 * 从最新消息往前跳过多少条。`offset: 0` 读取最新一页；
	 * `offset: 当前已加载数量` 读取再往前一页。
	 */
	offset?: number;
	limit?: number;
}

/**
 * Re-exported from `@super-client/shared-types/electron-api` so the IPC
 * contract and the storage-service return type stay in lockstep. The local
 * name is kept for backward compatibility with existing imports.
 */
export type ReadMessagesPageResult = SessionMessagesPageResult;

export interface ForkOptions {
	/** 目标 projectId；null = casual。可与源不同（跨桶）。 */
	targetProjectId: string | null;
	/** "编辑历史 = fork" 场景下记录从哪条消息开始派生 */
	forkOriginMessageId?: string;
	/** 可选自定义 name；不传则 `<source.name> (副本)` */
	name?: string;
}

export type ContentRefPayload = string | Buffer | Uint8Array | ArrayBuffer;

export interface WriteContentRefInput {
	payload: ContentRefPayload;
	mediaType?: string;
	source?: "assistant" | "tool" | "artifact";
}

export interface StoredContentRef {
	contentRef: string;
	byteLength: number;
	sha256: string;
	mediaType?: string;
	source?: "assistant" | "tool" | "artifact";
}

export interface ReadContentRefOptions {
	offset?: number;
	maxBytes?: number;
}

export interface ReadContentRefResult extends StoredContentRef {
	data: Buffer;
	offset: number;
	bytesRead: number;
	totalByteLength: number;
	truncated: boolean;
	nextOffset?: number;
}

export interface ExportSessionArchiveOptions {
	appVersion?: string;
	includeChatContent?: boolean;
}

// Archive-related types below are re-exported as aliases of the canonical
// shared-types contracts (SessionArchiveFileEntry.kind was widened to the
// full 5-member union on the shared side in the same change, so project
// archives emitting `project-metadata` / `project-settings` now type-check
// against the shared contract too). The local names are preserved for
// import compatibility.
export type SessionArchiveRedactionMode = SharedSessionArchiveRedactionMode;
export type SessionArchiveFileEntry = SharedSessionArchiveFileEntry;
export type SessionArchiveReferencedAttachment = SharedSessionArchiveReferencedAttachment;
export type SessionArchiveReferencedContentRef = SharedSessionArchiveReferencedContentRef;
export type SessionArchiveManifest = SharedSessionArchiveManifest;
export type SessionArchiveExportResult = SharedSessionArchiveExportResult;
export type ProjectArchiveSessionEntry = SharedProjectArchiveSessionEntry;
export type ProjectArchiveReferencedPayloadSession = SharedProjectArchiveReferencedPayloadSession;
export type ProjectArchiveManifest = SharedProjectArchiveManifest;
export type ProjectArchiveExportResult = SharedProjectArchiveExportResult;

export type ProjectArchiveMetadata = Omit<Project, "cwd"> & {
	cwd: string;
};

/**
 * Called by `delete()` when tombstoning a session that had a remote
 * binding — so downstream services (e.g. `RemoteChatBridge.unbind`) can
 * mirror the local delete regardless of which code path triggered it
 * (renderer chatStore, project remove, migration, purge…). Kept as a
 * pluggable sink to avoid `SessionStorageService` → `RemoteChatBridge`
 * hard dependency (the storage layer must remain remote-chat-agnostic).
 */
export type RemoteBindingSink = (sessionId: string) => void;

export class SessionStorageService {
	private readonly userRoot: string;
	private remoteBindingSink: RemoteBindingSink | undefined;

	constructor(
		private readonly baseDir: string,
		userId: string,
		// 只用于校验 projectId 存在；不持有强引用
		private readonly projectStorage?: ProjectStorageService,
	) {
		this.userRoot = join(baseDir, userId);
		mkdirSync(join(this.userRoot, CASUAL_DIR), { recursive: true });
	}

	/**
	 * Inject a callback invoked by `delete()` when tombstoning a session
	 * whose meta carries `remote` binding. `main.ts` wires this to
	 * `RemoteChatBridge.unbind` at boot so any delete path unbinds
	 * remote bindings without relying on renderer chatStore.
	 */
	setRemoteBindingSink(sink: RemoteBindingSink | undefined): void {
		this.remoteBindingSink = sink;
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
		// If this session had a remote binding, mirror the delete downstream
		// (RemoteChatBridge.unbind) so any code path that reaches here —
		// renderer chatStore, project remove, migration, purge — unbinds
		// regardless. The sink is a no-op if not wired (e.g. tests).
		if (meta.remote && this.remoteBindingSink) {
			try {
				this.remoteBindingSink(sessionId);
			} catch (error) {
				// Never block delete on downstream failure; the tombstone is
				// already written, so the local delete is authoritative.
				// eslint-disable-next-line no-console
				console.warn(
					`[SessionStorageService] remoteBindingSink failed for session ${sessionId}:`,
					error instanceof Error ? error.message : String(error),
				);
			}
		}
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
	 * Physically remove a tombstoned session's on-disk artifacts:
	 * `<sid>.meta.json`, `<sid>.jsonl`, and the per-session subdir
	 * (`attachments/`, `tool-outputs/`, `tool-outputs/content-refs/`).
	 * Irreversible.
	 *
	 * SAFETY:
	 *   - Refuses to purge a live (non-tombstoned) session.
	 *   - Bucket dir is asserted to be strictly inside `userRoot`.
	 *   - Idempotent: a session that no longer exists returns `{purged:false}`.
	 */
	purgeTombstone(sessionId: string): {
		purged: boolean;
		removedPaths?: string[];
	} {
		const meta = this.findMeta(sessionId, { includeDeleted: true });
		if (!meta) return { purged: false };
		if (!meta.deletedAt) {
			throw new Error(
				`refusing to purge live session ${sessionId} (not tombstoned)`,
			);
		}
		const bucket = this.resolveSessionBucket(meta.projectId);
		const resolvedBucket = resolve(bucket.dir);
		const resolvedRoot = resolve(this.userRoot);
		if (
			resolvedBucket !== resolvedRoot &&
			!resolvedBucket.startsWith(resolvedRoot + sep)
		) {
			throw new Error(
				`refusing to purge outside storage root: ${resolvedBucket}`,
			);
		}
		if (isBlockedPath(resolvedBucket)) {
			throw new Error(`refusing to purge blocked path: ${resolvedBucket}`);
		}
		const metaPath = this.sessionFile(meta, ".meta.json");
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		const sessionSubdir = join(bucket.dir, meta.id);
		const removed: string[] = [];
		if (existsSync(jsonlPath)) {
			rmSync(jsonlPath, { force: true });
			removed.push(jsonlPath);
		}
		if (existsSync(metaPath)) {
			rmSync(metaPath, { force: true });
			removed.push(metaPath);
		}
		if (existsSync(sessionSubdir)) {
			rmSync(sessionSubdir, { recursive: true, force: true });
			removed.push(sessionSubdir);
		}
		return { purged: true, removedPaths: removed };
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
		const normalizedBase = this.normalizeEvent(meta, event);
		if (this.hasEventId(jsonlPath, normalizedBase.eventId)) return;
		const normalized = this.normalizeEvent(meta, event, normalizedBase.seq, {
			externalizeAssistantPartPayloads: true,
		});

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
		const msgs = this.reduceMessages(sessionId);
		if (range?.tail !== undefined && range.tail >= 0) {
			return msgs.slice(-range.tail);
		}
		return msgs;
	}

	readMessagesPage(
		sessionId: string,
		options: ReadMessagesPageOptions = {},
	): ReadMessagesPageResult {
		const msgs = this.reduceMessages(sessionId);
		const total = msgs.length;
		const offset = normalizeMessagePageOffset(options.offset);
		const limit = normalizeMessagePageLimit(options.limit);
		const end = Math.max(total - offset, 0);
		const start = Math.max(end - limit, 0);
		const messages = msgs.slice(start, end);
		const nextOffset = offset + messages.length;
		const hasMore = start > 0;
		return {
			messages,
			total,
			offset,
			limit,
			hasMore,
			...(hasMore ? { nextOffset } : {}),
		};
	}

	private reduceMessages(sessionId: string): Message[] {
		const meta = this.getMeta(sessionId);
		const jsonlPath = this.sessionFile(meta, ".jsonl");
		if (!existsSync(jsonlPath)) return [];
		const content = readFileSync(jsonlPath, "utf-8");
		const report = parseEventsWithReport(content);
		if (report.malformedMiddleLines > 0 && !meta.corrupted) {
			this.writeMeta({ ...meta, corrupted: true, updatedAt: Date.now() });
		}
		const events = report.events;
		return eventsToMessages(events);
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
	/**
	 * Absolute path to the per-user storage root
	 * (`<baseDir>/<userId>/`). Used by peer services that need to compose
	 * paths under the same user root (e.g. RecoveryBundleService places its
	 * bundle dir at `<userRoot>/exports/bundles/...`).
	 */
	getUserRoot(): string {
		return this.userRoot;
	}

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

	/**
	 * Writes a large assistant/tool payload outside JSONL and returns a stable,
	 * session-relative reference that renderer message parts can carry as
	 * `contentRef`.
	 *
	 * The ref intentionally does not include the session id. `fork()` copies the
	 * per-session directory, so existing JSONL part refs remain readable in the
	 * forked session without rewriting historical events.
	 */
	writeContentRef(
		sessionId: string,
		input: WriteContentRefInput,
	): StoredContentRef {
		const meta = this.getMeta(sessionId);
		if (meta.deletedAt) {
			throw new Error(
				`cannot write contentRef for deleted session: ${sessionId}`,
			);
		}

		const data = toBuffer(input.payload);
		const sha256 = createHash("sha256").update(data).digest("hex");
		const dir = this.ensureContentRefsDir(sessionId);
		const payloadPath = join(dir, `${sha256}.bin`);
		const metaPath = join(dir, `${sha256}.meta.json`);
		writeFileSync(payloadPath, data);
		this.writeContentRefMeta(metaPath, {
			contentRef: `${CONTENT_REF_PREFIX}${sha256}`,
			byteLength: data.byteLength,
			sha256,
			...(input.mediaType ? { mediaType: input.mediaType } : {}),
			...(input.source ? { source: input.source } : {}),
		});
		return {
			contentRef: `${CONTENT_REF_PREFIX}${sha256}`,
			byteLength: data.byteLength,
			sha256,
			...(input.mediaType ? { mediaType: input.mediaType } : {}),
			...(input.source ? { source: input.source } : {}),
		};
	}

	/**
	 * Reads a previously externalized payload. The caller provides the owning
	 * session id, keeping refs portable across forks while preventing path-based
	 * reads outside this session's `tool-outputs/content-refs` directory.
	 */
	readContentRef(
		sessionId: string,
		contentRef: string,
		options: ReadContentRefOptions = {},
	): ReadContentRefResult {
		const refId = parseContentRefId(contentRef);
		const dir = this.contentRefsDir(sessionId);
		const payloadPath = join(dir, `${refId}.bin`);
		if (!existsSync(payloadPath)) {
			throw new Error(`contentRef not found: ${contentRef}`);
		}
		const totalByteLength = statSync(payloadPath).size;
		const offset = normalizeContentRefOffset(options.offset, totalByteLength);
		const maxBytes = normalizeContentRefMaxBytes(options.maxBytes);
		const bytesToRead = Math.min(
			maxBytes ?? totalByteLength - offset,
			totalByteLength - offset,
		);
		const data = readContentRefRange(payloadPath, offset, bytesToRead);
		const nextOffset = offset + data.byteLength;
		const truncated = nextOffset < totalByteLength;
		const stored = this.tryReadContentRefMeta(join(dir, `${refId}.meta.json`));
		return {
			contentRef,
			byteLength: totalByteLength,
			sha256: refId,
			...(stored?.mediaType ? { mediaType: stored.mediaType } : {}),
			...(stored?.source ? { source: stored.source } : {}),
			data,
			offset,
			bytesRead: data.byteLength,
			totalByteLength,
			truncated,
			...(truncated ? { nextOffset } : {}),
		};
	}

	exportSessionArchive(
		sessionId: string,
		options: ExportSessionArchiveOptions = {},
	): SessionArchiveExportResult {
		const meta = this.getMeta(sessionId);
		const includeChatContent = options.includeChatContent === true;
		const createdAt = new Date().toISOString();
		const archiveDir = join(
			this.userRoot,
			"exports",
			"session-archives",
			`${sessionId}-${createdAt.replace(/[:.]/g, "-")}`,
		);
		mkdirSync(archiveDir, { recursive: true });

		const metaFileName = `${sessionId}.meta.json`;
		const jsonlFileName = `${sessionId}.jsonl`;
		const metaPath = join(archiveDir, metaFileName);
		const jsonlPath = join(archiveDir, jsonlFileName);
		const manifestPath = join(archiveDir, "manifest.json");
		const sourceMetaPath = this.sessionFile(meta, ".meta.json");
		const sourceJsonlPath = this.sessionFile(meta, ".jsonl");
		const redactionContext = this.privacyRedactionContext();

		writeFileSync(
			metaPath,
			JSON.stringify(
				includeChatContent ? meta : this.archiveMetaWithoutChatPreview(meta),
				null,
				2,
			),
			"utf-8",
		);
		if (includeChatContent && existsSync(sourceJsonlPath)) {
			cpSync(sourceJsonlPath, jsonlPath);
		} else {
			writeFileSync(jsonlPath, "", "utf-8");
		}

		const jsonlContent = readFileSync(jsonlPath, "utf-8");
		const files: SessionArchiveFileEntry[] = [
			{ path: "manifest.json", kind: "manifest" },
			this.buildArchiveFileEntry(
				metaPath,
				metaFileName,
				"session-meta",
				existsSync(sourceMetaPath) ? sourceMetaPath : undefined,
				redactionContext,
			),
			this.buildArchiveFileEntry(
				jsonlPath,
				jsonlFileName,
				"session-jsonl",
				includeChatContent && existsSync(sourceJsonlPath)
					? sourceJsonlPath
					: undefined,
				redactionContext,
			),
		];
		const manifest: SessionArchiveManifest = {
			schemaVersion: 1,
			createdAt,
			...(options.appVersion ? { appVersion: options.appVersion } : {}),
			sessionId: meta.id,
			projectId: meta.projectId,
			redactionMode: "home-and-app-data",
			includeChatContent,
			exportDir: redactPath(archiveDir, redactionContext),
			files,
			referencedPayloads: {
				copied: false,
				attachments: includeChatContent
					? this.listArchiveAttachments(
							sessionId,
							jsonlContent,
							redactionContext,
						)
					: [],
				contentRefs: includeChatContent
					? this.listArchiveContentRefs(
							sessionId,
							jsonlContent,
							redactionContext,
						)
					: [],
			},
		};
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
		return { exportDir: archiveDir, manifestPath, manifest };
	}

	exportProjectArchive(
		projectId: string,
		options: ExportSessionArchiveOptions = {},
	): ProjectArchiveExportResult {
		this.assertProjectExists(projectId);
		const includeChatContent = options.includeChatContent === true;
		const createdAt = new Date().toISOString();
		const archiveDir = join(
			this.userRoot,
			"exports",
			"project-archives",
			`${projectId}-${createdAt.replace(/[:.]/g, "-")}`,
		);
		const sessionsDir = join(archiveDir, "sessions");
		mkdirSync(sessionsDir, { recursive: true });

		const manifestPath = join(archiveDir, "manifest.json");
		const redactionContext = this.privacyRedactionContext();
		const files: SessionArchiveFileEntry[] = [
			{ path: "manifest.json", kind: "manifest" },
		];
		const projectManifest: ProjectArchiveManifest["project"] = {};

		const project = this.projectStorage?.get(projectId) ?? null;
		if (project) {
			const metadataPath = "project.json";
			const metadataFilePath = join(archiveDir, metadataPath);
			writeFileSync(
				metadataFilePath,
				JSON.stringify(
					this.redactProjectMetadata(project, redactionContext),
					null,
					2,
				),
				"utf-8",
			);
			files.push(
				this.buildArchiveFileEntry(
					metadataFilePath,
					metadataPath,
					"project-metadata",
					undefined,
					redactionContext,
				),
			);
			projectManifest.metadataPath = metadataPath;
		}

		if (this.projectStorage) {
			const settingsPath = "project-settings.json";
			const settingsFilePath = join(archiveDir, settingsPath);
			const settings = this.projectStorage.getSettings(projectId);
			writeFileSync(
				settingsFilePath,
				JSON.stringify(
					redactArchiveValue(settings, redactionContext),
					null,
					2,
				),
				"utf-8",
			);
			files.push(
				this.buildArchiveFileEntry(
					settingsFilePath,
					settingsPath,
					"project-settings",
					undefined,
					redactionContext,
				),
			);
			projectManifest.settingsPath = settingsPath;
		}

		const sessionEntries: ProjectArchiveSessionEntry[] = [];
		const referencedPayloadSessions: ProjectArchiveReferencedPayloadSession[] =
			[];
		for (const meta of this.list(projectId)) {
			const metaArchivePath = `sessions/${meta.id}.meta.json`;
			const jsonlArchivePath = `sessions/${meta.id}.jsonl`;
			const metaPath = join(archiveDir, metaArchivePath);
			const jsonlPath = join(archiveDir, jsonlArchivePath);
			const sourceMetaPath = this.sessionFile(meta, ".meta.json");
			const sourceJsonlPath = this.sessionFile(meta, ".jsonl");

			writeFileSync(
				metaPath,
				JSON.stringify(
					includeChatContent ? meta : this.archiveMetaWithoutChatPreview(meta),
					null,
					2,
				),
				"utf-8",
			);
			if (includeChatContent && existsSync(sourceJsonlPath)) {
				cpSync(sourceJsonlPath, jsonlPath);
			} else {
				writeFileSync(jsonlPath, "", "utf-8");
			}

			files.push(
				this.buildArchiveFileEntry(
					metaPath,
					metaArchivePath,
					"session-meta",
					existsSync(sourceMetaPath) ? sourceMetaPath : undefined,
					redactionContext,
				),
				this.buildArchiveFileEntry(
					jsonlPath,
					jsonlArchivePath,
					"session-jsonl",
					includeChatContent && existsSync(sourceJsonlPath)
						? sourceJsonlPath
						: undefined,
					redactionContext,
				),
			);
			sessionEntries.push({
				sessionId: meta.id,
				metaPath: metaArchivePath,
				jsonlPath: jsonlArchivePath,
			});

			const jsonlContent = readFileSync(jsonlPath, "utf-8");
			referencedPayloadSessions.push({
				sessionId: meta.id,
				attachments: includeChatContent
					? this.listArchiveAttachments(meta.id, jsonlContent, redactionContext)
					: [],
				contentRefs: includeChatContent
					? this.listArchiveContentRefs(meta.id, jsonlContent, redactionContext)
					: [],
			});
		}

		const manifest: ProjectArchiveManifest = {
			schemaVersion: 1,
			createdAt,
			...(options.appVersion ? { appVersion: options.appVersion } : {}),
			projectId,
			redactionMode: "home-and-app-data",
			includeChatContent,
			exportDir: redactPath(archiveDir, redactionContext),
			sessionCount: sessionEntries.length,
			files,
			...(Object.keys(projectManifest).length > 0
				? { project: projectManifest }
				: {}),
			sessions: sessionEntries,
			referencedPayloads: {
				copied: false,
				sessions: referencedPayloadSessions,
			},
		};
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
		return { exportDir: archiveDir, manifestPath, manifest };
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

	private contentRefsDir(sessionId: string): string {
		return join(this.getSessionDir(sessionId), "tool-outputs", CONTENT_REF_DIR);
	}

	private ensureContentRefsDir(sessionId: string): string {
		const dir = this.contentRefsDir(sessionId);
		mkdirSync(dir, { recursive: true });
		return dir;
	}

	private writeContentRefMeta(path: string, meta: StoredContentRef): void {
		const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
		writeFileSync(tmp, JSON.stringify(meta, null, 2), "utf-8");
		renameSync(tmp, path);
	}

	private tryReadContentRefMeta(path: string): StoredContentRef | null {
		if (!existsSync(path)) return null;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
			if (!isStoredContentRef(parsed)) return null;
			return parsed;
		} catch {
			return null;
		}
	}

	private privacyRedactionContext(): PrivacyRedactionContext {
		return {
			appUserDataDir: this.baseDir,
			homeDir: homedir(),
		};
	}

	private redactProjectMetadata(
		project: Project,
		redactionContext: PrivacyRedactionContext,
	): ProjectArchiveMetadata {
		return {
			...project,
			cwd: redactArchivePath(project.cwd, redactionContext),
		};
	}

	private archiveMetaWithoutChatPreview(meta: SessionMeta): SessionMeta {
		return {
			...meta,
			preview: "",
		};
	}

	private buildArchiveFileEntry(
		filePath: string,
		archivePath: string,
		kind: SessionArchiveFileEntry["kind"],
		sourcePath: string | undefined,
		redactionContext: PrivacyRedactionContext,
	): SessionArchiveFileEntry {
		const data = readFileSync(filePath);
		return {
			path: archivePath,
			kind,
			byteLength: data.byteLength,
			sha256: createHash("sha256").update(data).digest("hex"),
			...(sourcePath
				? { sourcePath: redactPath(sourcePath, redactionContext) }
				: {}),
		};
	}

	private listArchiveAttachments(
		sessionId: string,
		jsonlContent: string,
		redactionContext: PrivacyRedactionContext,
	): SessionArchiveReferencedAttachment[] {
		const byId = new Map<string, SessionArchiveReferencedAttachment>();
		const attachmentsDir = join(this.getSessionDir(sessionId), "attachments");
		if (existsSync(attachmentsDir)) {
			for (const name of readdirSync(attachmentsDir)) {
				const sourcePath = join(attachmentsDir, name);
				try {
					const stat = statSync(sourcePath);
					if (!stat.isFile()) continue;
					const id = name.replace(extname(name), "");
					byId.set(id, {
						id,
						name,
						sourcePath: redactPath(sourcePath, redactionContext),
						byteLength: stat.size,
					});
				} catch {
					// best-effort manifest listing
				}
			}
		}

		for (const id of collectAttachmentIds(jsonlContent)) {
			if (!byId.has(id)) byId.set(id, { id, missing: true });
		}

		return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
	}

	private listArchiveContentRefs(
		sessionId: string,
		jsonlContent: string,
		redactionContext: PrivacyRedactionContext,
	): SessionArchiveReferencedContentRef[] {
		const byRef = new Map<string, SessionArchiveReferencedContentRef>();
		const contentRefsDir = this.contentRefsDir(sessionId);
		if (existsSync(contentRefsDir)) {
			for (const name of readdirSync(contentRefsDir)) {
				if (!name.endsWith(".meta.json")) continue;
				const metaPath = join(contentRefsDir, name);
				const stored = this.tryReadContentRefMeta(metaPath);
				if (!stored) continue;
				const payloadPath = join(contentRefsDir, `${stored.sha256}.bin`);
				byRef.set(stored.contentRef, {
					contentRef: stored.contentRef,
					sha256: stored.sha256,
					sourcePath: redactPath(payloadPath, redactionContext),
					byteLength: stored.byteLength,
					...(stored.mediaType ? { mediaType: stored.mediaType } : {}),
					...(stored.source ? { source: stored.source } : {}),
					...(existsSync(payloadPath) ? {} : { missing: true }),
				});
			}
		}

		for (const contentRef of collectContentRefs(jsonlContent)) {
			if (!byRef.has(contentRef))
				byRef.set(contentRef, { contentRef, missing: true });
		}

		return [...byRef.values()].sort((a, b) =>
			a.contentRef.localeCompare(b.contentRef),
		);
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
		options: { externalizeAssistantPartPayloads?: boolean } = {},
	): SessionEvent & { eventId: string; seq: number; writtenAt: number } {
		const now = Date.now();
		const seq = forcedSeq ?? this.nextSeq(meta);
		const eventId =
			event.eventId ??
			`${meta.id}:${event.type}:${"id" in event ? String(event.id) : seq}:${seq}`;
		const normalizedEvent = options.externalizeAssistantPartPayloads
			? this.externalizeAssistantPartPayloads(meta, event)
			: event;
		return {
			...normalizedEvent,
			eventId,
			seq,
			writtenAt: event.writtenAt ?? now,
		};
	}

	private externalizeAssistantPartPayloads(
		meta: SessionMeta,
		event: SessionEvent,
	): SessionEvent {
		if (event.type === "assistant.part_start") {
			const part = this.externalizeAssistantPart(meta.id, event.part);
			return part === event.part ? event : { ...event, part };
		}
		if (event.type === "assistant.part_update") {
			const patch = this.externalizeAssistantPartPatch(meta.id, event.patch);
			return patch === event.patch ? event : { ...event, patch };
		}
		return event;
	}

	private externalizeAssistantPart(
		sessionId: string,
		part: MessagePart,
	): MessagePart {
		if (part.contentRef) return part;
		const candidate = externalizablePartPayload(part);
		if (!candidate) return part;
		const ref = this.writeContentRef(sessionId, {
			payload: candidate.payload,
			mediaType: candidate.mediaType,
			source: candidate.source,
		});
		return clearExternalizedPayloadField(
			{
				...part,
				contentRef: ref.contentRef,
				byteLength: ref.byteLength,
				truncated: true,
			},
			candidate.field,
		) as unknown as MessagePart;
	}

	private externalizeAssistantPartPatch(
		sessionId: string,
		patch: Partial<MessagePart>,
	): Partial<MessagePart> {
		if (patch.contentRef) return patch;
		const candidate = externalizablePatchPayload(patch);
		if (!candidate) return patch;
		const ref = this.writeContentRef(sessionId, {
			payload: candidate.payload,
			mediaType: candidate.mediaType,
			source: candidate.source,
		});
		return clearExternalizedPayloadField(
			{
				...patch,
				contentRef: ref.contentRef,
				byteLength: ref.byteLength,
				truncated: true,
			},
			candidate.field,
		) as Partial<MessagePart>;
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
			storageMigratedAt: undefined,
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

function redactArchiveValue(
	value: ProjectSettings,
	redactionContext: PrivacyRedactionContext,
): ProjectSettings {
	return redactArchiveUnknown(value, redactionContext) as ProjectSettings;
}

function redactArchiveUnknown(
	value: unknown,
	redactionContext: PrivacyRedactionContext,
): unknown {
	if (typeof value === "string") {
		return redactArchiveString(value, redactionContext);
	}
	if (Array.isArray(value)) {
		return value.map((item) => redactArchiveUnknown(item, redactionContext));
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	const out: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		out[key] = redactArchiveUnknown(nested, redactionContext);
	}
	return out;
}

function redactArchiveString(
	value: string,
	redactionContext: PrivacyRedactionContext,
): string {
	return looksLikeAbsolutePath(value)
		? redactArchivePath(value, redactionContext)
		: redactPath(value, redactionContext);
}

function redactArchivePath(
	value: string,
	redactionContext: PrivacyRedactionContext,
): string {
	const redacted = redactPath(value, redactionContext);
	return redacted === value ? "<redacted-path>" : redacted;
}

function looksLikeAbsolutePath(value: string): boolean {
	return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function collectAttachmentIds(jsonlContent: string): Set<string> {
	const ids = new Set<string>();
	for (const event of parseEvents(jsonlContent)) {
		if (event.type === "user_message") {
			for (const id of event.attachmentIds ?? []) ids.add(id);
		}
	}
	return ids;
}

function collectContentRefs(jsonlContent: string): Set<string> {
	const refs = new Set<string>();
	for (const event of parseEvents(jsonlContent)) {
		collectContentRefsFromValue(event, refs);
	}
	return refs;
}

function collectContentRefsFromValue(value: unknown, refs: Set<string>): void {
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		for (const item of value) collectContentRefsFromValue(item, refs);
		return;
	}

	const record = value as Record<string, unknown>;
	if (typeof record.contentRef === "string") {
		refs.add(record.contentRef);
	}
	for (const nested of Object.values(record)) {
		collectContentRefsFromValue(nested, refs);
	}
}

type ExternalizedPayloadField =
	| "content"
	| "input"
	| "output"
	| "value"
	| "preview";

interface ExternalizedPayloadCandidate {
	field: ExternalizedPayloadField;
	payload: ContentRefPayload;
	mediaType: string;
	source: NonNullable<WriteContentRefInput["source"]>;
}

function externalizablePartPayload(
	part: MessagePart,
): ExternalizedPayloadCandidate | null {
	switch (part.type) {
		case "text":
			return externalizableValue("content", part.content, {
				mediaType: "text/plain",
				source: "assistant",
			});
		case "code_block":
			return externalizableValue("content", part.content, {
				mediaType: "text/plain",
				source: "assistant",
			});
		case "tool":
			return (
				externalizableValue("output", part.output, {
					source: "tool",
				}) ??
				externalizableValue("input", part.input, {
					source: "tool",
				})
			);
		case "data":
			return externalizableValue("value", part.value, {
				source: "assistant",
			});
		case "artifact":
			return externalizableValue("preview", part.preview, {
				mediaType: mediaTypeForArtifactPreview(part.artifactType),
				source: "artifact",
			});
		default:
			return null;
	}
}

function externalizablePatchPayload(
	patch: Partial<MessagePart>,
): ExternalizedPayloadCandidate | null {
	const record = patch as Record<string, unknown>;
	const type = record.type;
	if (
		type === "text" ||
		type === "code_block" ||
		record.content !== undefined
	) {
		const candidate = externalizableValue("content", record.content, {
			mediaType: "text/plain",
			source: "assistant",
		});
		if (candidate) return candidate;
	}
	if (
		type === "tool" ||
		record.output !== undefined ||
		record.input !== undefined
	) {
		const output = externalizableValue("output", record.output, {
			source: "tool",
		});
		if (output) return output;
		const input = externalizableValue("input", record.input, {
			source: "tool",
		});
		if (input) return input;
	}
	if (type === "data" || record.value !== undefined) {
		const candidate = externalizableValue("value", record.value, {
			source: "assistant",
		});
		if (candidate) return candidate;
	}
	if (type === "artifact" || record.preview !== undefined) {
		const candidate = externalizableValue("preview", record.preview, {
			mediaType:
				type === "artifact" && typeof record.artifactType === "string"
					? mediaTypeForArtifactPreview(record.artifactType)
					: "text/plain",
			source: "artifact",
		});
		if (candidate) return candidate;
	}
	return null;
}

function externalizableValue(
	field: ExternalizedPayloadField,
	value: unknown,
	defaults: {
		mediaType?: string;
		source: NonNullable<WriteContentRefInput["source"]>;
	},
): ExternalizedPayloadCandidate | null {
	const encoded = encodeContentRefPayload(value, defaults.mediaType);
	if (
		!encoded ||
		encoded.byteLength <= ASSISTANT_PART_CONTENT_REF_THRESHOLD_BYTES
	) {
		return null;
	}
	return {
		field,
		payload: encoded.payload,
		mediaType: encoded.mediaType,
		source: defaults.source,
	};
}

function encodeContentRefPayload(
	value: unknown,
	mediaType?: string,
): {
	payload: ContentRefPayload;
	byteLength: number;
	mediaType: string;
} | null {
	if (typeof value === "string") {
		return {
			payload: value,
			byteLength: Buffer.byteLength(value, "utf-8"),
			mediaType: mediaType ?? "text/plain",
		};
	}
	if (Buffer.isBuffer(value)) {
		return {
			payload: value,
			byteLength: value.byteLength,
			mediaType: mediaType ?? "application/octet-stream",
		};
	}
	if (value instanceof Uint8Array) {
		return {
			payload: value,
			byteLength: value.byteLength,
			mediaType: mediaType ?? "application/octet-stream",
		};
	}
	if (value === undefined) return null;
	try {
		const payload = JSON.stringify(value);
		if (typeof payload !== "string") return null;
		return {
			payload,
			byteLength: Buffer.byteLength(payload, "utf-8"),
			mediaType: mediaType ?? "application/json",
		};
	} catch {
		return null;
	}
}

function clearExternalizedPayloadField(
	part: Record<string, unknown>,
	field: ExternalizedPayloadField,
): Record<string, unknown> {
	const next = { ...part };
	switch (field) {
		case "content":
		case "preview":
			next[field] = "";
			break;
		case "input":
			next.input = {};
			break;
		case "output":
		case "value":
			next[field] = null;
			break;
	}
	return next;
}

function mediaTypeForArtifactPreview(artifactType: string): string {
	switch (artifactType) {
		case "html":
			return "text/html";
		case "markdown":
			return "text/markdown";
		default:
			return "text/plain";
	}
}

function toBuffer(payload: ContentRefPayload): Buffer {
	if (typeof payload === "string") return Buffer.from(payload, "utf-8");
	if (Buffer.isBuffer(payload)) return payload;
	if (payload instanceof ArrayBuffer) return Buffer.from(payload);
	return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
}

function normalizeContentRefOffset(
	offset: number | undefined,
	totalByteLength: number,
): number {
	if (offset === undefined) return 0;
	if (!Number.isSafeInteger(offset) || offset < 0) {
		throw new Error(`invalid contentRef offset: ${offset}`);
	}
	if (offset > totalByteLength) {
		throw new Error(`contentRef offset outside payload: ${offset}`);
	}
	return offset;
}

function normalizeMessagePageOffset(offset: number | undefined): number {
	if (offset === undefined) return 0;
	if (!Number.isSafeInteger(offset) || offset < 0) {
		throw new Error(`invalid message page offset: ${offset}`);
	}
	return offset;
}

function normalizeMessagePageLimit(limit: number | undefined): number {
	if (limit === undefined) return 100;
	if (!Number.isSafeInteger(limit) || limit < 1) {
		throw new Error(`invalid message page limit: ${limit}`);
	}
	return Math.min(limit, 500);
}

function normalizeContentRefMaxBytes(
	maxBytes: number | undefined,
): number | undefined {
	if (maxBytes === undefined) return undefined;
	if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
		throw new Error(`invalid contentRef maxBytes: ${maxBytes}`);
	}
	return maxBytes;
}

function readContentRefRange(
	payloadPath: string,
	offset: number,
	bytesToRead: number,
): Buffer {
	if (bytesToRead === 0) return Buffer.alloc(0);

	const buffer = Buffer.allocUnsafe(bytesToRead);
	const fd = openSync(payloadPath, "r");
	try {
		const bytesRead = readSync(fd, buffer, 0, bytesToRead, offset);
		return bytesRead === bytesToRead ? buffer : buffer.subarray(0, bytesRead);
	} finally {
		closeSync(fd);
	}
}

function parseContentRefId(contentRef: string): string {
	if (!contentRef.startsWith(CONTENT_REF_PREFIX)) {
		throw new Error(`invalid contentRef: ${contentRef}`);
	}
	const id = contentRef.slice(CONTENT_REF_PREFIX.length);
	if (!CONTENT_REF_ID_RE.test(id)) {
		throw new Error(`invalid contentRef: ${contentRef}`);
	}
	return id;
}

function isStoredContentRef(value: unknown): value is StoredContentRef {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.contentRef === "string" &&
		typeof record.byteLength === "number" &&
		typeof record.sha256 === "string" &&
		CONTENT_REF_ID_RE.test(record.sha256) &&
		(record.mediaType === undefined || typeof record.mediaType === "string") &&
		(record.source === undefined ||
			record.source === "assistant" ||
			record.source === "tool" ||
			record.source === "artifact")
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
