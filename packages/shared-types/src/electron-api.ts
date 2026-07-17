/**
 * ElectronAPI 共享契约
 *
 * 当前完整接口仍定义在 `src/preload/index.ts:11`，本文件是渐进迁移的目标位置：
 * 已经稳定的 IPC namespace 会先迁移到这里，preload 的 `ElectronAPI` 必须扩展
 * `ElectronAPIMigrated` 来保证 contract 单一源。新增 namespace 应先在此登记。
 *
 * E-7: chat / workspaceRuntime namespace 已废弃删除，由 projects / sessions / cwd 取代。
 */

import type { IPCResponse } from "./ipc-proxy";
import type {
	AgentQueryRequestPayload,
	AgentRuntimeDescriptor,
	AgentRuntimeId,
	AgentRuntimeStreamEvent,
	CustomAgentRuntimeId,
	NativeSessionInfo,
	PermissionDecision,
} from "./agent-runtime";
import type {
	AgentTraceConfig,
	AgentTraceEntry,
	AgentTraceFilter,
	AgentTraceSummary,
} from "./agent-trace";
import type {
	EffectiveSessionRuntime,
	FileOpenTarget,
	Message,
	ResolveSessionRuntimeInput,
	ResolvedAttachmentBlock,
	RuntimeAuditEntry,
	SessionApprovalGrant,
} from "./chat";
import type { ExtensionDescriptor } from "./extensions";
import type {
	CreateWorktreeResult,
	GitBranchInfo,
	GitCommit,
	WorktreePreflightResult,
} from "./git";
import type {
	ChatMode,
	Project,
	ProjectSettings,
	SessionEvent,
	SessionMeta,
	SessionTombstone,
} from "./project";

/** Result type for fileAction.open / reveal / copyPath. */
export interface FileActionResult {
	ok: boolean;
	error?: string;
	code?: string;
	messageKey?: string;
	details?: Record<string, unknown>;
}

export type SessionContentRefSource = "assistant" | "tool" | "artifact";

export interface SessionContentRefReadOptions {
	offset?: number;
	maxBytes?: number;
}

export interface SessionContentRefReadResult {
	contentRef: string;
	/** Backward-compatible alias for the complete payload byte length. */
	byteLength: number;
	totalByteLength?: number;
	offset?: number;
	bytesRead?: number;
	truncated?: boolean;
	nextOffset?: number;
	mediaType?: string;
	source?: SessionContentRefSource;
	text?: string;
}

export interface SessionMessagesPageResult {
	messages: Message[];
	total: number;
	offset: number;
	limit: number;
	hasMore: boolean;
	nextOffset?: number;
}

export type SessionArchiveRedactionMode = "home-and-app-data";

export interface SessionArchiveExportOptions {
	includeChatContent?: boolean;
}

export interface SessionArchiveFileEntry {
	path: string;
	kind: "manifest" | "session-meta" | "session-jsonl";
	byteLength?: number;
	sha256?: string;
	sourcePath?: string;
}

export interface SessionArchiveReferencedAttachment {
	id: string;
	name?: string;
	sourcePath?: string;
	byteLength?: number;
	missing?: boolean;
}

export interface SessionArchiveReferencedContentRef {
	contentRef: string;
	sha256?: string;
	sourcePath?: string;
	byteLength?: number;
	mediaType?: string;
	source?: SessionContentRefSource;
	missing?: boolean;
}

export interface SessionArchiveManifest {
	schemaVersion: 1;
	createdAt: string;
	appVersion?: string;
	sessionId: string;
	projectId: string | null;
	redactionMode: SessionArchiveRedactionMode;
	includeChatContent: boolean;
	/** Redacted export directory recorded inside the manifest. */
	exportDir: string;
	files: SessionArchiveFileEntry[];
	referencedPayloads: {
		copied: false;
		attachments: SessionArchiveReferencedAttachment[];
		contentRefs: SessionArchiveReferencedContentRef[];
	};
}

export interface SessionArchiveExportResult {
	/** App-managed absolute export directory for later reveal/open actions. */
	exportDir: string;
	/** App-managed absolute manifest path inside exportDir. */
	manifestPath: string;
	manifest: SessionArchiveManifest;
}

export interface ProjectArchiveSessionEntry {
	sessionId: string;
	metaPath: string;
	jsonlPath: string;
}

export interface ProjectArchiveReferencedPayloadSession {
	sessionId: string;
	attachments: SessionArchiveReferencedAttachment[];
	contentRefs: SessionArchiveReferencedContentRef[];
}

export interface ProjectArchiveManifest {
	schemaVersion: 1;
	createdAt: string;
	appVersion?: string;
	projectId: string;
	redactionMode: SessionArchiveRedactionMode;
	includeChatContent: boolean;
	/** Redacted export directory recorded inside the manifest. */
	exportDir: string;
	sessionCount: number;
	files: SessionArchiveFileEntry[];
	project?: {
		metadataPath?: string;
		settingsPath?: string;
	};
	sessions: ProjectArchiveSessionEntry[];
	referencedPayloads: {
		copied: false;
		sessions: ProjectArchiveReferencedPayloadSession[];
	};
}

export interface ProjectArchiveExportResult {
	/** App-managed absolute export directory for explicit copy/reveal actions. */
	exportDir: string;
	/** App-managed absolute manifest path inside exportDir. */
	manifestPath: string;
	manifest: ProjectArchiveManifest;
}

export interface DiagnosticExportResult {
	exportDir: string;
	manifestPath: string;
	diagnosticPath: string;
}

/** 已迁移到 shared-types 的 ElectronAPI namespace 子集。 */
export interface ElectronAPIMigrated {
	runtime: {
		resolveSession: (
			input: ResolveSessionRuntimeInput,
		) => Promise<IPCResponse<EffectiveSessionRuntime>>;
		getAuditLog: (limit?: number) => Promise<IPCResponse<RuntimeAuditEntry[]>>;
		clearAuditLog: () => Promise<IPCResponse<boolean>>;
		findGrant: (
			conversationId: string,
			operationType: string,
			target?: string,
		) => Promise<IPCResponse<SessionApprovalGrant | null>>;
		addGrant: (
			conversationId: string,
			input: Omit<SessionApprovalGrant, "id" | "grantedAt">,
		) => Promise<IPCResponse<SessionApprovalGrant>>;
		listGrants: (
			conversationId: string,
		) => Promise<IPCResponse<SessionApprovalGrant[]>>;
		removeGrant: (
			conversationId: string,
			grantId: string,
		) => Promise<IPCResponse<boolean>>;
		recordDeny: (
			conversationId: string,
			workspaceId: string,
			operationType: string,
			target?: string,
			reason?: string,
		) => Promise<IPCResponse<boolean>>;
		clearGrants: (conversationId: string) => Promise<IPCResponse<boolean>>;
	};

	fileAction: {
		open: (
			path: string,
			workspaceId?: string,
		) => Promise<IPCResponse<FileActionResult>>;
		reveal: (
			path: string,
			workspaceId?: string,
		) => Promise<IPCResponse<FileActionResult>>;
		copyPath: (
			path: string,
			workspaceId?: string,
		) => Promise<IPCResponse<FileActionResult>>;
		detectOpenTargets: (
			path: string,
			workspaceId?: string,
		) => Promise<IPCResponse<FileOpenTarget[]>>;
		openWith: (
			path: string,
			targetId: string,
			workspaceId?: string,
		) => Promise<IPCResponse<FileActionResult>>;
		getAppIcon: (appPath: string) => Promise<IPCResponse<string | null>>;
	};

	attachment: {
		/** §14 minimal slice — resolve text-like attachments for inclusion in prompts. */
		resolveContext: (args: {
			conversationId: string;
			attachmentIds: string[];
			maxBytesPerAttachment?: number;
		}) => Promise<IPCResponse<ResolvedAttachmentBlock[]>>;
	};

	/** §22 rollback flags — renderer 主导，main 只同步 runtimeEnforcement 一个位。 */
	featureFlags: {
		set: (flags: {
			unifiedNavigation: boolean;
			runtimeEnforcement: boolean;
			fileArtifacts: boolean;
			profileLayouts: boolean;
		}) => Promise<IPCResponse<boolean>>;
		get: () => Promise<IPCResponse<{ runtimeEnforcement: boolean }>>;
	};

	/** §20 unified read-only view over MCP / Skills / App Plugins. */
	extensions: {
		list: () => Promise<IPCResponse<ExtensionDescriptor[]>>;
	};

	/** Read-only git branch info for UI surfaces (Codex inspector etc.). */
	git: {
		getBranchInfo: (cwd: string) => Promise<IPCResponse<GitBranchInfo>>;
		createWorktree: (
			cwd: string,
			worktreePath: string,
			branchName?: string,
		) => Promise<IPCResponse<CreateWorktreeResult>>;
		preflightCreateWorktree: (
			cwd: string,
			worktreePath: string,
			branchName?: string,
		) => Promise<IPCResponse<WorktreePreflightResult>>;
		/** List local branches with the currently checked-out one flagged. */
		listBranches: (
			cwd: string,
		) => Promise<IPCResponse<{ name: string; current: boolean }[]>>;
		/**
		 * `git checkout <branch>`. Returns `dirty: true` when the failure is due
		 * to uncommitted local changes that would be overwritten.
		 */
		switchBranch: (
			cwd: string,
			branch: string,
		) => Promise<
			IPCResponse<{ ok: boolean; error?: string; dirty?: boolean }>
		>;
		/** `git checkout -b <branch>` — create and checkout in one step. */
		createBranch: (
			cwd: string,
			branch: string,
		) => Promise<
			IPCResponse<{ ok: boolean; error?: string; branch?: string }>
		>;
		/**
		 * 拉取最近 N 条 commit（默认 200，最大 1000）用于 Git 图谱视图。
		 * 全部 ref / topo order，失败返回空数组。
		 */
		listCommits: (
			cwd: string,
			opts?: { limit?: number },
		) => Promise<IPCResponse<GitCommit[]>>;
	};

	/**
	 * Project / Session 重设计 Phase A — 项目 registry。会话归属于项目（cwd）；
	 * 普通对话见 `sessions` namespace 下的 `projectId: null` 调用。
	 */
	projects: {
		list: () => Promise<IPCResponse<Project[]>>;
		add: (cwd: string, name?: string) => Promise<IPCResponse<Project>>;
		/** Native directory picker → projects.add. Resolves to null on cancel. */
		pickAndAdd: (name?: string) => Promise<IPCResponse<Project | null>>;
		rename: (id: string, name: string) => Promise<IPCResponse<Project>>;
		pin: (id: string, pinned: boolean) => Promise<IPCResponse<Project>>;
		markFirstRunSeen: (id: string) => Promise<IPCResponse<Project>>;
		archive: (id: string, archived: boolean) => Promise<IPCResponse<Project>>;
		createWorktree: (
			sourceId: string,
			opts: { worktreePath: string; branchName?: string },
		) => Promise<IPCResponse<Project>>;
		remove: (
			id: string,
			opts?: { keepFiles?: boolean },
		) => Promise<IPCResponse<{ removed: boolean; orphan?: boolean }>>;
		getSettings: (id: string) => Promise<IPCResponse<ProjectSettings>>;
		saveSettings: (
			id: string,
			patch: Partial<ProjectSettings>,
		) => Promise<IPCResponse<ProjectSettings>>;
		exportArchive: (
			projectId: string,
			options?: SessionArchiveExportOptions,
		) => Promise<IPCResponse<ProjectArchiveExportResult>>;
		listOrphans: () => Promise<
			IPCResponse<
				Array<{ projectId: string; cwd: string; sessionCount: number }>
			>
		>;
		restoreOrphan: (projectId: string) => Promise<IPCResponse<Project>>;
	};

	/**
	 * Project / Session 重设计 Phase A — 单个 session 的 jsonl 事件流 + meta。
	 * `projectId === null` 走 casual 桶；非 null 走 projects/<id>/sessions/。
	 */
	sessions: {
		list: (projectId: string | null) => Promise<IPCResponse<SessionMeta[]>>;
		listDeleted: (
			projectId?: string | null,
		) => Promise<IPCResponse<SessionMeta[]>>;
		create: (input: {
			projectId: string | null;
			name?: string;
			chatMode?: ChatMode;
		}) => Promise<IPCResponse<SessionMeta>>;
		getMeta: (sessionId: string) => Promise<IPCResponse<SessionMeta>>;
		updateMeta: (
			sessionId: string,
			patch: Partial<SessionMeta>,
		) => Promise<IPCResponse<SessionMeta>>;
		rename: (
			sessionId: string,
			name: string,
		) => Promise<IPCResponse<SessionMeta>>;
		delete: (
			sessionId: string,
		) => Promise<
			IPCResponse<{ deleted: boolean; tombstone?: SessionTombstone }>
		>;
		restoreDeleted: (sessionId: string) => Promise<IPCResponse<SessionMeta>>;
		/** §9.10 (C1) 锁前可改 projectId；锁后报错。 */
		reassignProject: (
			sessionId: string,
			nextProjectId: string | null,
		) => Promise<IPCResponse<SessionMeta>>;
		appendEvent: (
			sessionId: string,
			event: SessionEvent,
		) => Promise<IPCResponse<void>>;
		readMessages: (
			sessionId: string,
			range?: { tail?: number },
		) => Promise<IPCResponse<Message[]>>;
		readMessagesPage: (
			sessionId: string,
			options?: { offset?: number; limit?: number },
		) => Promise<IPCResponse<SessionMessagesPageResult>>;
		readContentRef: (
			sessionId: string,
			contentRef: string,
			options?: SessionContentRefReadOptions,
		) => Promise<IPCResponse<SessionContentRefReadResult>>;
		exportArchive: (
			sessionId: string,
			options?: SessionArchiveExportOptions,
		) => Promise<IPCResponse<SessionArchiveExportResult>>;
		fork: (
			sourceId: string,
			opts: {
				targetProjectId: string | null;
				forkOriginMessageId?: string;
				name?: string;
			},
		) => Promise<IPCResponse<SessionMeta>>;
	};

	/** Diagnostic export API. Renderer cannot provide output paths. */
	diagnostics: {
		export: () => Promise<IPCResponse<DiagnosticExportResult>>;
	};

	/**
	 * Project / Session cwd 解析。
	 *
	 * G-2: `resolveSessionCwd` 返回 per-session 沙箱目录
	 * (`<userData>/chats/<userId>/(<projectId>/)session/<sid>`)，调用方
	 * 可直接作为子进程 cwd 使用。`resolveProjectRoot` 给系统提示词使用，
	 * 返回项目根目录字面量；casual 会话或项目缺失返回 null。
	 */
	cwd: {
		resolveSessionCwd: (sessionId: string) => Promise<IPCResponse<string>>;
		resolveProjectRoot: (
			sessionId: string,
		) => Promise<IPCResponse<string | null>>;
	};

	/**
	 * Workspace file enumeration — backs the composer's "@" file-mention panel.
	 *
	 * Lists files under the conversation's project root AND its per-session
	 * sandbox (deduped, project wins). Hidden dirs and common build/output
	 * directories are filtered server-side; fuzzy filtering happens in the
	 * renderer.
	 */
	workspace: {
		listFiles: (req: {
			sessionId: string;
			limit?: number;
		}) => Promise<
			IPCResponse<{
				files: Array<{
					absolutePath: string;
					relativePath: string;
					root: "project" | "session";
					name: string;
					dir: string;
					ext: string;
					size: number;
					mtimeMs: number;
				}>;
				roots: { projectRoot?: string; sessionCwd?: string };
			}>
		>;
	};

	/**
	 * G-3 老数据导入。renderer 启动时调 detect 看是否有老数据，
	 * 用户确认后调 importAll 一次性把老 chats/ 目录下的 conversations 转成
	 * 新 SessionStorage 的 casual sessions（保留 id 与时间戳）。
	 */
	legacyData: {
		detect: () => Promise<
			IPCResponse<{
				count: number;
				alreadyImported: boolean;
				legacyDir: string;
				preview: Array<{
					id: string;
					name: string;
					createdAt: number;
					updatedAt: number;
					messageCount: number;
					preview: string;
				}>;
			}>
		>;
		importAll: () => Promise<
			IPCResponse<{
				total: number;
				imported: number;
				skipped: number;
				failed: number;
				warnings: Array<{ id: string; code: string; message: string }>;
				failures: Array<{
					id: string;
					code: string;
					message: string;
					recoverable: boolean;
				}>;
				dismissed: boolean;
			}>
		>;
	};

	/**
	 * AgentRuntime 适配层（spec: 2026-06-21-agent-runtime-adapter-design）。
	 *
	 * 命名空间用 `agentRuntime`，channel 经 createBridge 自动转 `agent-runtime:*`，
	 * 与 legacy `agent:*`（AgentService）分离。
	 */
	agentRuntime: {
		/** 启动一次查询；事件通过 `onStreamEvent` 推送。 */
		createQuery: (
			payload: AgentQueryRequestPayload,
		) => Promise<IPCResponse<{ runtimeId: string }>>;
		/** 用户裁决审批。 */
		resolvePermission: (args: {
			id: string;
			decision: PermissionDecision;
		}) => Promise<IPCResponse<undefined>>;
		/** 终止某次请求。 */
		interrupt: (args: {
			requestId: string;
		}) => Promise<IPCResponse<{ ok: boolean }>>;
		/** 列举注册的 runtime descriptors。 */
		listRuntimes: () => Promise<IPCResponse<AgentRuntimeDescriptor[]>>;
		/**
		 * 列举 ClaudeCodeAgentRuntime 注入的 8 个内置 facade 工具的静态元数据
		 * （Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task）。供 ChatSettingsModal
		 * 的“预授权工具”面板渲染。
		 */
		listBuiltinTools: () => Promise<
			IPCResponse<
				Array<{
					name: string;
					description: string;
					inputSchema: Record<string, unknown>;
				}>
			>
		>;
		/** 仅 `nativeSession=true` 的 adapter 支持。 */
		listNativeSessions: (args: {
			runtimeId: AgentRuntimeId | CustomAgentRuntimeId;
		}) => Promise<IPCResponse<NativeSessionInfo[]>>;
		forkNativeSession: (args: {
			runtimeId: AgentRuntimeId | CustomAgentRuntimeId;
			sessionId: string;
			atMessageId?: string;
		}) => Promise<IPCResponse<{ sessionId: string }>>;
		/** 流式事件订阅；返回取消函数。 */
		onStreamEvent: (
			callback: (event: AgentRuntimeStreamEvent) => void,
		) => () => void;
	};

	/**
	 * AgentTrace 调试通道（spec §17.4）。命名空间 `agentDebug`，channel
	 * 经 createBridge 自动转 `agent-debug:*`——但本设计要求 `debug:agent-traces:*`，
	 * 所以这一对桥接走手工 wiring（见 preload/index.ts 内的 manual section）。
	 */
	agentDebug: {
		listTraces: (
			filter?: AgentTraceFilter,
		) => Promise<IPCResponse<AgentTraceSummary[]>>;
		getTrace: (
			requestId: string,
		) => Promise<IPCResponse<AgentTraceEntry | null>>;
		clearTraces: () => Promise<IPCResponse<undefined>>;
		exportTrace: (requestId: string) => Promise<IPCResponse<{ path: string }>>;
		getConfig: () => Promise<IPCResponse<AgentTraceConfig>>;
		setConfig: (
			patch: Partial<AgentTraceConfig>,
		) => Promise<IPCResponse<AgentTraceConfig>>;
		onTraceUpdated: (
			callback: (summary: AgentTraceSummary) => void,
		) => () => void;
	};
}
