/**
 * Project / Session 重设计 (project-session-redesign-plan)
 *
 * 之前的 `Workspace` 抽象（chat.ts 里的 `WorkspaceConfig`）被取消，取而代之
 * 是 "Project = cwd 路径"。Session 分两类：
 *   - 普通对话 (Casual)：projectId === null
 *   - 项目对话 (Project-bound)：projectId === <Project.id>
 *
 * 本文件定义 Phase A 数据层需要的全部新类型。旧 `WorkspaceConfig /
 * SessionMetadata / SessionKind / ChatMessagePersist` 在 chat.ts 中保留
 * 不动（Phase B 才接迁移，Phase E 才删）。
 */

import type {
	EnabledCapability,
	AssistantPartEvent,
	InteractionProfile,
	Message,
	ModelSelection,
	PlanMode,
	RemoteBinding,
	SessionApprovalGrant,
	SessionFlags,
	SessionLineage,
	WorkspaceContextPolicy,
	WorkspaceRuntimePolicy,
} from "./chat";

// ─────────────────────────────────────────────────────────────────────
// Project
// ─────────────────────────────────────────────────────────────────────

/**
 * 项目 = "用户的一个工作目录 + 一点儿展示元数据"。
 *
 * - `id`：稳定 hash(cwd) 前 16 字符 hex（A-2 `hashCwd`）。
 * - `cwd`：绝对路径，即"工作环境"本身。
 * - `name`：用户改名前默认 = basename(cwd)。
 * - `pinned`：sidebar 顶部置顶。
 * - `firstRunSeen`：项目首页（plan §9.8）只在 false 时显示，被 CTA 点过后置 true，
 *   避免后续清空 sessions 又"假复活"项目首页。
 */
export interface Project {
	id: string;
	cwd: string;
	name: string;
	icon?: string;
	pinned?: boolean;
	firstRunSeen?: boolean;
	/**
	 * F-1: 归档态。归档项目默认从 sidebar 主列表过滤，session 数据原地保留。
	 * "已归档项目 (N)" 入口（Settings → 高级）可恢复。
	 */
	archived?: boolean;
	/**
	 * F-1: 派生关系。`worktree-of` 表示该项目由 git worktree add 自源项目派生。
	 * 用 union 形式留扩展空间（未来可加 fork-of / clone-of …）。
	 */
	lineage?: {
		kind: "worktree-of";
		sourceProjectId: string;
		/** 创建 worktree 时使用的 branch name（rev-parse 后写入），方便审计与显示 */
		branch?: string;
	};
	createdAt: number;
	updatedAt: number;
	/** 最近一次打开 session / 切换到该 project 的时间，影响 sidebar 排序 */
	lastSeenAt: number;
}

/**
 * 项目级配置覆盖 —— sparse，留空就走 app 全局默认。
 *
 * 不是 `Required<...>`：所有字段可缺省，avg 项目的 settings.json 多半只设
 * 1-2 个字段。
 */
export interface ProjectSettings {
	defaultModel?: ModelSelection;
	runtimePolicy?: Partial<WorkspaceRuntimePolicy>;
	contextPolicy?: Partial<WorkspaceContextPolicy>;
	interactionProfile?: InteractionProfile;
	enabledCapabilities?: EnabledCapability[];
}

// ─────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────

/**
 * (B7) 旧 SessionKind + 旧 chatMode 折叠成单一轴。chat 是默认的"普通直接对话"
 * （旧 'direct' / 旧 SessionKind='chat' 都映射这里），其它 4 值原样保留。
 */
export type ChatMode = "chat" | "agent" | "plan" | "remote" | "automation";

/**
 * 单个 session 的元数据，存在 `<sessionId>.meta.json`。
 *
 * - `projectId === null` → Casual（落到 `casual-sessions/`）
 * - `projectId === <id>` → 项目对话（落到 `projects/<id>/sessions/`）
 *
 * `flags / lineage` 沿用 R-9 的嵌套形态。`approvalGrants` 跟旧 SessionMetadata
 * 一样仅在用户授权后写入。
 */
export interface SessionMeta {
	id: string;
	projectId: string | null;
	name?: string;
	chatMode: ChatMode;
	remote?: RemoteBinding;
	createdAt: number;
	updatedAt: number;
	/** 来自 jsonl 行数（消息事件计数） */
	messageCount: number;
	/** 第一条用户消息的前 100 字 */
	preview?: string;
	flags?: SessionFlags;
	lineage?: SessionLineage;
	modelOverride?: ModelSelection;
	/** Plan §11 plan modes —— 会话级状态，不是 chatMode（B7 折叠 ChatMode 与 plan 模式分离）*/
	planMode?: PlanMode;
	/** Session-level interaction profile override (overlays project settings) */
	interactionProfileOverride?: InteractionProfile;
	approvalGrants?: SessionApprovalGrant[];
	/**
	 * 当 chatMode === 'agent' 时，Agent SDK 在 init 后回写一个会话 ID 用于后续
	 * resume。从 ChatMessagePersist.metadata 抬到 SessionMeta 顶层，因为它是
	 * 会话级状态而非单条消息属性。
	 *
	 * @deprecated v2.1: 改用 `nativeSessionId`。Phase 1-3 期间双写，Phase 4+N 删除。
	 *   读取顺序：`nativeSessionId ?? agentSDKSessionId`。
	 */
	agentSDKSessionId?: string;
	/**
	 * AgentRuntime 适配层引入（spec: 2026-06-21-agent-runtime-adapter-design §9）。
	 *
	 * 对应后端 runtime 在 init 后回写的原生 session id（如 Claude Agent SDK 的
	 * `session_id`、Codex 的 rollout id）。会话生命周期内**不变**——一个
	 * SessionMeta 只对应一个 runtime / 一个 nativeSessionId。Fork 必须新建
	 * SessionMeta。
	 *
	 * Phase 1-3 期间与 `agentSDKSessionId` 双写；Phase 4+N 删除旧字段。
	 */
	nativeSessionId?: string;
	/**
	 * AgentRuntime 适配层引入（spec: 2026-06-21-agent-runtime-adapter-design §5.1）。
	 *
	 * 选定的后端 runtime；**会话创建后不可变**。新建会话时按 `(profile, model.provider)`
	 * 派生默认值（`pickDefaultRuntimeId`），用户可显式覆盖。
	 *
	 * 类型故意宽松到 `string` 以避免 shared-types ↔ project 互相引用；运行时由
	 * `AgentRuntimeRegistry` 收紧到 `AgentRuntimeId | CustomAgentRuntimeId`。
	 */
	runtimeId?: string;
	/** Soft-delete marker. Deleted sessions are hidden from normal lists. */
	deletedAt?: number;
	tombstone?: SessionTombstone;
	/** Legacy import provenance for retry/relink/reporting. */
	importSource?: SessionImportSource;
	/** JSONL contained a non-trailing malformed line. */
	corrupted?: boolean;
	/** Meta write failed or is stale; storage should rebuild from JSONL. */
	metaNeedsRepair?: boolean;
	/** Physical storage root currently used for this session. */
	storageRoot?:
		| "casual-app-data"
		| "project-scr-data"
		| "project-app-data-fallback";
	/** Human-readable reason why project storage fell back to app data. */
	storageFallbackReason?: string;
	/** Timestamp when legacy app-data project data was copied into .scr-data. */
	storageMigratedAt?: number;
}

export interface SessionTombstone {
	id: string;
	kind: "session";
	deletedAt: number;
	reason: "user-delete" | "project-remove" | "migration";
	remoteBinding?: RemoteBinding;
	restoreHint?: string;
}

export interface SessionImportSource {
	kind: "legacy-conversation";
	id: string;
	legacyDir?: string;
	needsCwdReview?: boolean;
	warnings?: string[];
}

// ─────────────────────────────────────────────────────────────────────
// JSONL 事件协议（A-4 SessionStorageService 消费）
// ─────────────────────────────────────────────────────────────────────

/**
 * 写入 `<sessionId>.jsonl` 的每行一个 JSON 事件。事件流通过
 * `eventsToMessages(events)` reduce 成 renderer `Message[]`：
 *   - tool_call + tool_result/tool_error 配对 → 单个 `Message{type:'tool_use', toolCall:...}`
 *   - file_artifact / approval / session_marker 不进 messages，但保留在事件流以备审计 / 重放
 */
export type SessionEvent =
	| UserMessageEvent
	| AssistantMessageEvent
	| ToolCallEvent
	| ToolResultEvent
	| ToolErrorEvent
	| SessionAssistantPartEvent
	| ApprovalEvent
	| FileArtifactEvent
	| SessionMarkerEvent;

interface BaseEvent {
	/** Stable event-level id for dedupe. Distinct from message/tool ids. */
	eventId?: string;
	/** Writer-assigned monotonically increasing sequence within one session. */
	seq?: number;
	/** event 的 wall-clock 时间戳（ms） */
	ts: number;
	/** Time when the storage writer accepted the event. */
	writtenAt?: number;
}

/** 用户输入的一条消息，落盘形态。chat / streaming chunk 不在此列。 */
export interface UserMessageEvent extends BaseEvent {
	type: "user_message";
	id: string;
	content: string;
	attachmentIds?: string[];
}

/** Assistant 完整回复（流结束后落一行；不持久化中间 chunk）。 */
export interface AssistantMessageEvent extends BaseEvent {
	type: "assistant_message";
	id: string;
	content: string;
	metadata?: Message["metadata"];
}

/** Structured assistant output part event. New JSONL writes can stream rich parts. */
export type SessionAssistantPartEvent = AssistantPartEvent & BaseEvent;

/** 模型发起的工具调用请求。`parentId` 指向触发该 tool_call 的 assistant_message id。 */
export interface ToolCallEvent extends BaseEvent {
	type: "tool_call";
	id: string;
	parentId?: string;
	name: string;
	input: Record<string, unknown>;
}

/** 工具执行结果。`toolCallId` 配对 `ToolCallEvent.id`。 */
export interface ToolResultEvent extends BaseEvent {
	type: "tool_result";
	toolCallId: string;
	output: unknown;
	/** @deprecated 新写入使用 `tool_error`；保留用于读取旧 JSONL。 */
	isError?: boolean;
	duration?: number;
}

/** 工具执行失败。`toolCallId` 配对 `ToolCallEvent.id`。 */
export interface ToolErrorEvent extends BaseEvent {
	type: "tool_error";
	toolCallId: string;
	error: unknown;
	code?: string;
	duration?: number;
}

/** 审批决策（plan §12 + R-6）。落盘以便审计 / 重放。 */
export interface ApprovalEvent extends BaseEvent {
	type: "approval";
	toolCallId: string;
	decision: "allow_once" | "allow_session" | "deny";
	reason?: string;
}

/** 工具产生 / 修改的文件标记（plan §10 chat file artifact pipeline）。 */
export interface FileArtifactEvent extends BaseEvent {
	type: "file_artifact";
	messageId: string;
	path: string;
	kind: "created" | "modified" | "read" | "referenced" | "attached";
}

/**
 * Session 级别的标记事件。用作 chatMode 锁定、首条消息时间戳、profile 切换
 * 等"非消息但又需要按时间序的状态变更"的承载。
 */
export interface SessionMarkerEvent extends BaseEvent {
	type: "session_marker";
	key: string;
	value: unknown;
}
