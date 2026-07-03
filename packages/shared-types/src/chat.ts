/**
 * Chat 相关类型定义
 */

import type {
	PlanCard,
	PlanDecision,
	PlanDecisionAction,
	PlanDecisionRecord,
	PlanExecuteTurnLink,
} from "./plan-execute";
import type { SubagentRunSummary } from "./subagent";

/** 聊天消息 */
export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	model?: string;
}

/** 聊天历史 */
export interface ChatHistory {
	sessionId: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
}

/** 持久化的聊天消息 */
export interface ChatMessagePersist {
	id: string;
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	timestamp: number;
	type?: "text" | "tool_use" | "tool_result" | "error";
	toolCall?: {
		id: string;
		name: string;
		input: Record<string, unknown>;
		status: "pending" | "awaiting_approval" | "success" | "error";
		result?: unknown;
		error?: string;
		duration?: number;
		approval?: ToolCallApproval;
	};
	metadata?: {
		model?: string;
		modelSource?:
			| "message"
			| "session"
			| "project"
			| "global"
			| "runtime-fallback"
			| "subagent";
		modelSourceLabel?: string;
		tokens?: number;
		inputTokens?: number;
		outputTokens?: number;
		/** Anthropic prompt-cache 读取的 token 数（已缓存命中部分） */
		cacheReadTokens?: number;
		/** Anthropic prompt-cache 本轮新建的 token 数 */
		cacheCreationTokens?: number;
		duration?: number;
		firstTokenMs?: number;
		tokensPerSecond?: number;
		attachmentIds?: string[];
		planDecision?: PlanDecisionRecord;
		planExecute?: PlanExecuteTurnLink;
	};
}

/** 远程绑定 */
export interface RemoteBinding {
	botId: string;
	chatId: string;
	botName: string;
	platform: IMPlatform;
	boundAt: number;
}

/** 绑定远程请求 */
export interface BindRemoteRequest {
	conversationId: string;
	botId: string;
	chatId: string;
}

/** 远程 IM 消息 */
export interface RemoteIMMessage {
	conversationId: string;
	content: string;
	sender: { id: string; name: string };
	platform: IMPlatform;
	chatId: string;
	timestamp: number;
}

/** 远程聊天消息 */
export interface RemoteChatMessage {
	id: string;
	direction: "incoming" | "outgoing";
	content: string;
	sender: { id: string; name: string };
	platform: IMPlatform;
	timestamp: number;
}

/** 发送远程消息请求 */
export interface SendRemoteMessageRequest {
	conversationId: string;
	content: string;
}

/** Session 类型 */
export type SessionKind = "chat" | "agent" | "plan" | "remote" | "automation";

/** 创建对话选项 */
export interface CreateConversationOptions {
	workspaceId?: string;
	kind?: SessionKind;
	chatMode?: "direct" | "agent";
}

/** 交互模式 */
export type InteractionProfile = "claude-code" | "codex" | "hybrid";

/** 计划模式 */
export type PlanMode =
	| "chat"
	| "plan-only"
	| "plan-then-ask"
	| "auto-execute-safe"
	| "full-agent";

/** 审批模式 */
export type ApprovalMode = "request" | "auto-safe" | "full-access";

/** 沙箱模式 */
export type SandboxMode = "read-only" | "workspace-write" | "system-access";

/** 模型选择 */
export interface ModelSelection {
	providerId: string;
	modelId: string;
	reasoningEffort?: "low" | "medium" | "high";
	temperature?: number;
	maxOutputTokens?: number;
	contextMode?: "auto" | "compact" | "full";
	fallbackModel?: {
		providerId: string;
		modelId: string;
	};
}

/** 工作区运行策略 */
export interface WorkspaceRuntimePolicy {
	approvalMode: ApprovalMode;
	sandboxMode: SandboxMode;
	writableRoots: string[];
	networkAccess: "blocked" | "approval-required" | "allowed";
	externalAppAccess: "blocked" | "approval-required" | "allowed";
}

/** 工作区上下文策略 */
export interface WorkspaceContextPolicy {
	defaultAttachmentMode:
		| "include-content"
		| "reference-only"
		| "ask-before-read"
		| "ignore";
	includeWorkspaceKnowledge: boolean;
	maxAttachmentBytes?: number;
	ignoreRules?: string[];
}

/** 启用的能力 */
export interface EnabledCapability {
	id: string;
	type:
		| "mcp"
		| "skill"
		| "hook"
		| "app-plugin"
		| "theme"
		| "capability-package";
	scope: "global" | "workspace" | "session";
	enabled: boolean;
}

/** Session 审批授权 */
export interface SessionApprovalGrant {
	id: string;
	operationType: string;
	scope: "once" | "session" | "workspace" | "global";
	target?: string;
	riskLevel?: "low" | "medium" | "high";
	grantedAt: number;
	expiresAt?: number;
}

/** R-9: lifecycle flags grouped under `SessionMetadata.flags`. */
export interface SessionFlags {
	/** plan §23.4: 置顶后的会话排序到所属项目顶部 */
	pinned?: boolean;
	/** plan §23.2: 归档后会话从主列表隐藏，仅在 "已归档" 折叠组中可见 */
	archived?: boolean;
	/** plan §23.4: 未读小圆点指示 */
	unread?: boolean;
}

/** R-9: fork lineage info grouped under `SessionMetadata.lineage`. */
export interface SessionLineage {
	/** plan §23.2: 派生而来的源会话 id（"派生到本地" / "派生到新工作树" 都填） */
	forkOriginId?: string;
	/** plan §23.2: "派生到新工作树" 创建的 git worktree 绝对路径 */
	worktreePath?: string;
	/**
	 * project-session-redesign §10 #5 + §9.10：编辑历史 = fork。在该位置记录
	 * 从源会话的哪条消息开始派生。其它 fork（local 复制 / worktree）留空。
	 */
	forkOriginMessageId?: string;
}

/** Conversation 迁移期承载的 Session 元数据 */
export interface SessionMetadata {
	id: string;
	workspaceId: string;
	kind: SessionKind;
	planMode: PlanMode;
	modelOverride?: ModelSelection;
	interactionProfileOverride?: InteractionProfile;
	runtimePolicyOverride?: Partial<WorkspaceRuntimePolicy>;
	enabledCapabilityOverrides?: EnabledCapability[];
	attachmentIds: string[];
	/**
	 * 仅在用户授予会话级审批时写入。Phase 2（approval adapter）才会接入读路径；
	 * 在那之前保持 optional，避免在每个会话 metadata 里写入空数组造成死字段。
	 */
	approvalGrants?: SessionApprovalGrant[];
	/**
	 * R-9: lifecycle flags collected under one nested object so future
	 * additions (e.g. `starred`) don't keep growing the top-level shape.
	 * Stored only when at least one inner flag is truthy; older on-disk data
	 * with flat `pinned/archived/unread` is auto-translated by
	 * `normalizeSessionMetadata` on first read.
	 */
	flags?: SessionFlags;
	/**
	 * R-9: fork lineage. Same nesting rationale as `flags`; legacy flat
	 * `forkOriginId/worktreePath` are still accepted on read and rewritten
	 * into `lineage` on next save.
	 */
	lineage?: SessionLineage;
	createdAt: number;
	updatedAt: number;
}

/** 主进程可读的工作区配置 */
export interface WorkspaceConfig {
	id: string;
	name: string;
	path?: string;
	/**
	 * R-1: 显示用图标（emoji 或 icon id）。Phase 1 之前由 renderer 的
	 * useWorkspaceStore 独家持有，是 dual-source-of-truth 的一处。这里加成 optional，
	 * 让 main 可作为权威；renderer 写时双写，未来切到 read-through 时移除 renderer 写。
	 */
	icon?: string;
	/** R-1: 列表排序权重；同上从 renderer 移到 main 配置以收口。 */
	order?: number;
	interactionProfile: InteractionProfile;
	defaultModel?: ModelSelection;
	runtimePolicy: WorkspaceRuntimePolicy;
	enabledCapabilities: EnabledCapability[];
	contextPolicy: WorkspaceContextPolicy;
	createdAt: number;
	updatedAt: number;
}

/** Runtime policy 操作分类 */
export type RuntimeOperationKind =
	| "tool-execute"
	| "file-read"
	| "file-write"
	| "file-delete"
	| "command-exec"
	| "network-request"
	| "external-app";

/** Runtime policy 风险评级 */
export type RuntimeRiskLevel = "low" | "medium" | "high";

/** Runtime policy 作用域 */
export type RuntimeScope =
	| "conversation-workspace"
	| "workspace"
	| "external"
	| "network"
	| "system";

/** Runtime policy 决策 */
export type RuntimeDecision = "allowed" | "denied" | "audit-only";

/** 操作上下文（caller 提供） */
export interface RuntimeOperationContext {
	workspaceId: string;
	sessionId?: string;
	source:
		| "llm"
		| "agent-sdk"
		| "mcp"
		| "skill"
		| "app-plugin"
		| "user"
		| "system";
	operation: string;
	kind: RuntimeOperationKind;
	target?: string;
	input?: Record<string, unknown>;
}

/** Service 分类后的操作 */
export interface ClassifiedRuntimeOperation extends RuntimeOperationContext {
	risk: RuntimeRiskLevel;
	scope: RuntimeScope;
}

/** Audit 条目 */
export interface RuntimeAuditEntry extends ClassifiedRuntimeOperation {
	id: string;
	timestamp: number;
	decision: RuntimeDecision;
	reason?: string;
}

/** Resolver 输入：单条消息发送时的临时覆盖 */
export interface SessionMessageOverride {
	model?: ModelSelection;
	planMode?: PlanMode;
	interactionProfile?: InteractionProfile;
}

/** Resolver 输入参数 */
export interface ResolveSessionRuntimeInput {
	/** 显式指定的工作区 ID；省略时由 sessionId 关联的 conversation 决定 */
	workspaceId?: string;
	/** 当前迁移期 sessionId 等于 conversationId */
	sessionId: string;
	/** 单条消息级别的临时覆盖，不写回 metadata */
	messageOverride?: SessionMessageOverride;
}

/** 解析后的附件上下文（骨架阶段为占位，待 Phase 3 attachment resolver 填充） */
export interface ResolvedAttachmentContext {
	attachmentId: string;
	contextMode:
		| "include-content"
		| "reference-only"
		| "ask-before-read"
		| "ignore";
	mimeType?: string;
	bytes?: number;
}

/**
 * Attachment context resolver 的解析结果（§14 minimal slice）。
 *
 * - `text`：附件内容已读取到 `text` 字段，可直接拼接到 prompt；
 *   `truncated` 为 true 时表示文件超出字节预算被截断。
 * - `reference`：未读取内容，仅暴露元信息；上层应使用 `<attachment-ref>`
 *   形式提示模型，避免传输二进制或超大文本。
 */
export interface ResolvedAttachmentBlock {
	attachmentId: string;
	fileName: string;
	mimeType?: string;
	size: number;
	resolution: "text" | "reference";
	text?: string;
	truncated?: boolean;
}

/** 解析后的有效 Session 运行时快照 */
export interface EffectiveSessionRuntime {
	workspaceId: string;
	sessionId: string;
	model: ModelSelection;
	interactionProfile: InteractionProfile;
	planMode: PlanMode;
	runtimePolicy: WorkspaceRuntimePolicy;
	contextPolicy: WorkspaceContextPolicy;
	enabledCapabilities: EnabledCapability[];
	attachments: ResolvedAttachmentContext[];
	approvalGrants: SessionApprovalGrant[];
}

/** Chat 文件打开目标 */
export interface FileOpenTarget {
	id: string;
	label: string;
	kind: "editor" | "terminal" | "finder" | "custom";
	available: boolean;
	/** Absolute path to .app bundle (macOS) or executable (other platforms). */
	appPath?: string;
}

/** Chat 文件工件（由工具调用、Agent 或附件产生/引用的文件） */
export interface ChatFileArtifact {
	id: string;
	conversationId: string;
	messageId: string;
	path: string;
	relativePath?: string;
	name: string;
	extension?: string;
	mimeType?: string;
	kind: "created" | "modified" | "read" | "referenced" | "attached";
	source: "tool" | "agent" | "attachment" | "user" | "plugin";
	openTargets: FileOpenTarget[];
	policy: {
		canOpen: boolean;
		canReveal: boolean;
		canDiff: boolean;
		requiresApproval?: boolean;
	};
}

/** Chat 文件变更集（聚合一次工具/Agent 运行涉及的多个文件改动） */
export interface ChatFileChangeSet {
	id: string;
	conversationId: string;
	messageId: string;
	files: Array<{
		path: string;
		status: "added" | "modified" | "deleted" | "renamed";
		additions: number;
		deletions: number;
		diffPreview?: string;
	}>;
	additions: number;
	deletions: number;
}

/** 对话摘要 */
export interface ConversationSummary {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	preview: string;
	remote?: RemoteBinding;
	/** 关联的 Agent SDK session ID */
	agentSDKSessionId?: string;
	/** 会话绑定的聊天模式，首次发送后锁定 */
	chatMode?: "direct" | "agent";
	/** 关联的产品工作区 ID；不同于 per-conversation execution workspace directory */
	workspaceId?: string;
	/** 迁移期 Session 元数据，长期会演进为正式 Session 存储 */
	session?: SessionMetadata;
}

/**
 * 增量更新 ConversationSummary 时使用的形状。`session` 字段允许只传需要变更的
 * 子字段，由 main 端 `mergeSessionMetadata` 与现有 metadata 浅合并，避免每次
 * 调用都要构造完整 `SessionMetadata`。
 */
export type ConversationSummaryUpdate = Omit<
	Partial<ConversationSummary>,
	"session"
> & {
	session?: Partial<SessionMetadata>;
};

/** 对话数据 */
export interface ConversationData extends ConversationSummary {
	messages: ChatMessagePersist[];
}

/** IM 平台 */
export type IMPlatform = "dingtalk" | "lark" | "telegram";

// ─────────────────────────────────────────────────────────────────────
// Renderer Message canonical types (project-session-redesign A-1)
//
// 之前 Message / ToolCall / MessageRole / MessageType / ChatSessionStatus
// 定义在 src/renderer/src/stores/chatMessageStore.ts。新存储层（main 进程
// SessionStorageService + JSONL 事件）也要消费同一个 Message 形状，所以
// 把这几个类型提升到 shared-types 作为 canonical。renderer 仍可从
// chatMessageStore re-export 以向后兼容。
// ─────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageType = "text" | "tool_use" | "tool_result" | "error";

/**
 * Structured context attached to a failed LLM stream request. Carries enough
 * information to diagnose config mismatches (preset/apiFormat/baseUrl/model)
 * and surface the provider's business-error code/message + raw response body.
 *
 * Built in the main process by `buildLLMErrorContext` and broadcast to the
 * renderer on the `type:'error'` stream event so the chat UI can render a
 * rich error card instead of a plain toast.
 *
 * Canonical home is shared-types so all four ChatStreamEvent declaration
 * sites (main/ipc, preload, renderer ambient .d.ts, renderer types/models)
 * import the same type.
 */
export interface LLMErrorContext {
	preset: string | undefined;
	apiFormat: string | undefined;
	baseUrl: string | undefined;
	model: string | undefined;
	statusCode: number | undefined;
	endpointUrl: string | undefined;
	responseBodySnippet: string | undefined;
	/** Parsed business-error code from the provider, when available. */
	providerErrorCode: string | undefined;
	/** Parsed business-error message from the provider, when available. */
	providerErrorMessage: string | undefined;
	/**
	 * JS error stack (truncated) for the underlying exception. Useful for
	 * diagnosing transport / SDK issues distinct from provider business
	 * errors. Optional — not all error sources have a stack.
	 */
	stack?: string;
}

/**
 * Chat session lifecycle states (live request state, NOT historical):
 * - idle: 空闲 — waiting for user input (also the state after completion/stop/error)
 * - preparing: 创建中 — building request (fetching MCP tools, constructing system prompt)
 * - streaming: 聊天中 — receiving streamed response chunks from LLM
 * - tool_calling: 工具调用中 — model is executing MCP tool calls
 */
export type ChatSessionStatus =
	| "idle"
	| "preparing"
	| "streaming"
	| "tool_calling";

export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	status: "pending" | "awaiting_approval" | "success" | "error";
	result?: unknown;
	error?: string;
	duration?: number;
	approval?: ToolCallApproval;
}

export interface ToolCallApproval {
	title?: string;
	description?: string;
	displayName?: string;
	kind?: "ask-user-question" | "permission" | "tool";
	suggestions?: Array<Record<string, unknown>>;
	blockedPath?: string;
	decisionReason?: string;
	agentId?: string;
	/**
	 * AskUserQuestion-only: the renderer-collected `{question → answer}`
	 * map at submit time. Stored on `approval` (not `result`) because the
	 * `tool_result` / `tool_error` event handlers shallow-overwrite `result`
	 * with whatever main-process echoes back — in some IPC paths this
	 * arrives as `{}` and would wipe the user's answers out of the chat
	 * history. `approval` is never touched by those handlers, so the
	 * answers survive into the read-only summary.
	 */
	userAnswers?: Record<string, string>;
}

export type MessagePartState =
	| "streaming"
	| "complete"
	| "error"
	| "requires-approval"
	| "executing"
	| "denied";

export type MessagePartType =
	| "text"
	| "code_block"
	| "diff"
	| "tool"
	| "data"
	| "table"
	| "tree"
	| "sources"
	| "artifact"
	| "status"
	| "plan"
	| "subagent";

export interface BaseMessagePart {
	id: string;
	type: MessagePartType;
	state: MessagePartState;
	transient?: boolean;
	/** Externalized payload reference for large content kept out of UI memory. */
	contentRef?: string;
	/** Original payload size in bytes when known. */
	byteLength?: number;
	/** True when the inline payload was intentionally shortened. */
	truncated?: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface TextMessagePart extends BaseMessagePart {
	type: "text";
	content: string;
}

export interface CodeBlockMessagePart extends BaseMessagePart {
	type: "code_block";
	language?: string;
	path?: string;
	title?: string;
	content: string;
	completeFence?: boolean;
	lineCount?: number;
}

export interface DiffMessagePart extends BaseMessagePart {
	type: "diff";
	files: Array<{
		path: string;
		status: "added" | "modified" | "deleted" | "renamed" | "unknown";
		hunks?: Array<{
			header?: string;
			lines: Array<{ type: "add" | "remove" | "context"; content: string }>;
		}>;
	}>;
	valid?: boolean;
}

export interface ToolMessagePart extends BaseMessagePart {
	type: "tool";
	toolUseId: string;
	name: string;
	input?: Record<string, unknown>;
	output?: unknown;
	error?: { code?: string; messageKey?: string; details?: unknown };
	duration?: number;
	approval?: ToolCallApproval;
}

export interface DataMessagePart extends BaseMessagePart {
	type: "data";
	format?: "json" | "yaml" | "text" | "unknown";
	value: unknown;
	title?: string;
}

export interface TableMessagePart extends BaseMessagePart {
	type: "table";
	columns: string[];
	rows: unknown[][];
	title?: string;
}

export interface TreeMessagePart extends BaseMessagePart {
	type: "tree";
	nodes: Array<{
		id: string;
		label: string;
		parentId?: string;
		kind?: "file" | "folder" | "task" | "item";
		meta?: Record<string, unknown>;
	}>;
	title?: string;
}

export interface SourcesMessagePart extends BaseMessagePart {
	type: "sources";
	sources: Array<{
		id: string;
		title?: string;
		url?: string;
		path?: string;
		snippet?: string;
		sourceType?: "web" | "file" | "mcp" | "memory" | "unknown";
	}>;
}

export interface ArtifactMessagePart extends BaseMessagePart {
	type: "artifact";
	artifactId: string;
	artifactType: "markdown" | "html" | "image" | "file" | "unknown";
	title?: string;
	preview?: string;
	ref?: string;
}

export interface StatusMessagePart extends BaseMessagePart {
	type: "status";
	label: string;
	detail?: string;
	progress?: number;
}

export interface PlanMessagePart extends BaseMessagePart {
	type: "plan";
	plan: PlanCard;
	decision?: PlanDecision;
	pendingDecision?: boolean;
	requiresDecision?: boolean;
	status?: "pending-decision" | `decision-${PlanDecisionAction}`;
}

/**
 * Phase 4 Multi-Agent Round 6: 子代理运行的父转录卡片。
 *
 * 由主 Agent 通过内置 `Task` 工具触发；渲染层默认折叠展示
 * `{profileId, taskGoal, status, tokenUsage?, summary, resultRef?}`。
 * 展开时 renderer 会渲染子代理自身的 timeline（Impl-17 决定 UI）。
 *
 * child tool timeline 不出现在父 Message[]：子代理内部产生的
 * tool_call / tool_result 事件通过 `subagentRunId` 归属，reducer 仅
 * 递增 `run.toolCallCount` 而不 push tool_use 消息。
 */
export interface SubagentMessagePart extends BaseMessagePart {
	type: "subagent";
	run: SubagentRunSummary;
	/** Rendered collapsed by default. */
	collapsed?: boolean;
}

export type MessagePart =
	| TextMessagePart
	| CodeBlockMessagePart
	| DiffMessagePart
	| ToolMessagePart
	| DataMessagePart
	| TableMessagePart
	| TreeMessagePart
	| SourcesMessagePart
	| ArtifactMessagePart
	| StatusMessagePart
	| PlanMessagePart
	| SubagentMessagePart;

export type AssistantPartEvent =
	| {
			type: "assistant.part_start";
			messageId: string;
			part: MessagePart;
			ts: number;
	  }
	| {
			type: "assistant.part_delta";
			messageId: string;
			partId: string;
			delta: unknown;
			ts: number;
	  }
	| {
			type: "assistant.part_update";
			messageId: string;
			partId: string;
			patch: Partial<MessagePart>;
			ts: number;
	  }
	| {
			type: "assistant.part_done";
			messageId: string;
			partId: string;
			patch?: Partial<MessagePart>;
			ts: number;
	  }
	| {
			type: "assistant.part_error";
			messageId: string;
			partId: string;
			error: { code?: string; messageKey?: string; details?: unknown };
			ts: number;
	  };

export interface Message {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: number;
	type?: MessageType;
	toolCall?: ToolCall;
	/** Structured assistant/user render parts. Old messages may only have content. */
	parts?: MessagePart[];
	metadata?: {
		model?: string;
		providerPreset?: string;
		providerName?: string;
		modelSource?:
			| "message"
			| "session"
			| "project"
			| "global"
			| "runtime-fallback"
			| "subagent";
		modelSourceLabel?: string;
		tokens?: number;
		inputTokens?: number;
		outputTokens?: number;
		/** Anthropic prompt-cache 读取的 token 数（已缓存命中部分） */
		cacheReadTokens?: number;
		/** Anthropic prompt-cache 本轮新建的 token 数 */
		cacheCreationTokens?: number;
		duration?: number;
		firstTokenMs?: number;
		tokensPerSecond?: number;
		source?: "local" | "remote";
		remoteSender?: { id: string; name: string };
		remotePlatform?: string;
		attachmentIds?: string[];
		planDecision?: PlanDecisionRecord;
		planExecute?: PlanExecuteTurnLink;
		agentSDKSessionId?: string;
		nativeSessionId?: string;
		totalCostUsd?: number;
		numTurns?: number;
		/**
		 * Structured LLM error context for messages with `type === "error"`.
		 * Populated by the renderer when a stream `type:'error'` event arrives
		 * carrying `errorContext`. Drives the ErrorCard rendering.
		 */
		errorContext?: LLMErrorContext;
		/**
		 * The user prompt that triggered the failed request, captured so the
		 * ErrorCard can surface "the query that caused this" without relying on
		 * positional walk-back at render time.
		 */
		errorQuery?: string;
		/**
		 * Single-line, human-readable error headline (the same enriched string
		 * shown in toasts pre-card). Kept for accessibility / non-card
		 * consumers (export, plain text view).
		 */
		errorSummary?: string;
	};
}
