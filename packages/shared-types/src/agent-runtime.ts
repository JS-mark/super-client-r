/**
 * AgentRuntime 适配层 —— 共享类型定义
 *
 * 详见 `docs/superpowers/specs/2026-06-21-agent-runtime-adapter-design.md`。
 *
 * 设计要点：
 * - 所有 AI agent 后端（Claude Agent SDK / 手写 LLM 循环 / Codex / …）实现
 *   `AgentRuntime` 接口；上层（renderer / IPC broker / store）只面向该接口。
 * - 跨 IPC 的事件类型 `AgentStreamEvent` 是统一最小公倍集，adapter 必须将各自
 *   原生事件归一到此 union。
 * - Adapter 与 IPC 边界由 `AgentRuntimeIpcBroker` 管理；adapter 不直接接触
 *   `event.sender` / `BrowserWindow`。
 * - 工具执行一律走 `ToolDispatcher`，不允许 adapter 内部派发（即便 SDK 自带
 *   MCP）。
 *
 * @packageDocumentation
 */

import type {
	EffectiveSessionRuntime,
	LLMErrorContext,
	SessionApprovalGrant,
} from "./chat";

// ─────────────────────────────────────────────────────────────────────
// Runtime 标识 / Capabilities
// ─────────────────────────────────────────────────────────────────────

/**
 * 内置 runtime id 集合。第三方注册的自定义 runtime 用 `CustomAgentRuntimeId`，
 * 与内置 union 隔离避免 `as` 推断坑。
 */
export type AgentRuntimeId =
	| "claude-sdk"
	| "llm-loop"
	| "codex"
	| "openai-agents";

/** 第三方注册的自定义 id。 */
export type CustomAgentRuntimeId = string;

/** Adapter 自描述。 */
export interface AgentRuntimeDescriptor {
	id: AgentRuntimeId | CustomAgentRuntimeId;
	displayName: string;
	capabilities: AgentRuntimeCapabilities;
	/** 事件 schema 版本；与 `AgentEventBase.v` 对齐 */
	schemaVersion: 1;
}

/** Plan-mode 实现策略。 */
export type AgentPlanModeStrategy =
	/** SDK 原生支持（如 Claude Agent SDK） */
	| "native"
	/** Host 在 plan 模式下不下发 tools */
	| "host-strip"
	/** 不支持 */
	| "unsupported";

/** Adapter 沙箱强度（仅描述；决策由上层做）。 */
export type AgentSandboxLevel = "none" | "workspace-write" | "os-level";

/** Adapter 接受的工具 schema 形态。 */
export type AgentToolSchema = "json-schema" | "xml-blocks";

/** Adapter 支持的输入模态。 */
export type AgentInputModality = "text" | "image" | "file";

export interface AgentRuntimeCapabilities {
	/** 是否流式 */
	streaming: boolean;
	/** 是否输出 reasoning（thinking / chain-of-thought delta） */
	reasoning: boolean;
	/** Plan-mode 实现方式 */
	planMode: AgentPlanModeStrategy;
	/** 自带 session 持久化 */
	nativeSession: boolean;
	/** 沙箱强度 */
	sandbox: AgentSandboxLevel;
	/** 工具 schema */
	toolSchema: AgentToolSchema;
	/** 多模态输入 */
	multimodalInput: AgentInputModality[];
}

// ─────────────────────────────────────────────────────────────────────
// 请求 / Prompt
// ─────────────────────────────────────────────────────────────────────

/** IPC 边界传递的请求；renderer 不传 signal。 */
export type AgentQueryRequestPayload = Omit<AgentQueryRequest, "signal">;

/**
 * Agent 查询请求。`signal` 由 `AgentRuntimeIpcBroker` 自建 `AbortController`
 * 后注入；adapter 必须监听并在 abort 时清理资源。
 */
export interface AgentQueryRequest {
	/** Renderer 生成；用于 IPC 过滤、interrupt 定位 */
	requestId: string;
	/** Super Client R 的 session id（不是 SDK 原生 session） */
	conversationId: string;
	/** 当前轮输入 */
	prompt: AgentPromptInput;
	/**
	 * 历史消息：
	 * - `capabilities.nativeSession=true` 且 `resume.nativeSessionId` 存在：adapter 必须忽略
	 * - 否则：必须传完整 history（缺失 adapter 应抛 `ConfigurationError`）
	 */
	history?: ReadonlyArray<AgentHistoryMessage>;
	/** 已解析的运行时配置 */
	runtime: EffectiveSessionRuntime;
	/** Host 已聚合的工具清单（前缀已加） */
	tools: ReadonlyArray<AgentToolBinding>;
	/** 工作目录（用于 builtin 工具路径解析） */
	cwd?: string;
	/** 恢复目标（仅 `nativeSession=true` 的 adapter 解释） */
	resume?: { nativeSessionId?: string };
	/** 取消信号；由 broker 注入 */
	signal: AbortSignal;
}

export type AgentPromptInput =
	| { kind: "text"; text: string; attachments?: AttachmentRef[] }
	| { kind: "parts"; parts: PromptPart[] };

export interface AttachmentRef {
	id: string;
	mime: string;
	/** `file://` 或 `internal://` 协议 URI */
	uri: string;
}

export type PromptPart =
	| { type: "text"; text: string }
	| { type: "image"; source: AttachmentRef }
	| { type: "tool_result"; callId: string; content: ToolResultContent };

export interface AgentHistoryMessage {
	role: "user" | "assistant" | "tool";
	content: PromptPart[];
	toolCallId?: string;
}

/** Host 派发给 adapter 的工具绑定。 */
export interface AgentToolBinding {
	/** 给 LLM 看的工具名（已加前缀，如 `scp-fetch__read_file`、`skill-foo__bar`） */
	name: string;
	description: string;
	/** JSON Schema；adapter 自行翻译为后端格式 */
	inputSchema: Record<string, unknown>;
	/** Host 路由信息：adapter 收到 tool 调用必须回送 host 而非自执行 */
	origin: AgentToolOrigin;
}

export interface AgentToolOrigin {
	kind: "mcp" | "skill" | "builtin";
	serverId: string;
	realName: string;
}

// ─────────────────────────────────────────────────────────────────────
// 工具结果（v2 类型化 union）
// ─────────────────────────────────────────────────────────────────────

/** Adapter 必须将工具结果归一到此 union；UI 据此正确渲染。 */
export type ToolResultContent =
	| TextResult
	| ImageResult
	| StructuredResult
	| ErrorResult
	| MixedResult;

export interface TextResult {
	kind: "text";
	text: string;
}

export interface ImageResult {
	kind: "image";
	/** base64 或 file:// URI */
	source: string;
	mime: string;
}

export interface StructuredResult {
	kind: "structured";
	/** 任意 JSON；UI 用 JSON viewer 展示 */
	data: unknown;
	/** 抽取出的 file artifact */
	artifacts?: Array<{ kind: string; data: unknown }>;
}

export interface ErrorResult {
	kind: "error";
	message: string;
	/** 原始错误（已脱敏） */
	raw?: unknown;
}

export interface MixedResult {
	kind: "mixed";
	parts: Array<TextResult | ImageResult | StructuredResult>;
}

// ─────────────────────────────────────────────────────────────────────
// Stream Events（统一）
// ─────────────────────────────────────────────────────────────────────

/**
 * AgentRuntime 适配层统一事件流。
 *
 * 命名注：用 `AgentRuntimeStreamEvent` 而非 `AgentStreamEvent` 以避免与 legacy
 * `AgentService`（`./agent.ts`）的同名简单类型冲突——后者将在 Phase 3 退役。
 */
export type AgentRuntimeStreamEvent =
	| AgentInitEvent
	| AgentTextDeltaEvent
	| AgentReasoningDeltaEvent
	| AgentMessageFinalEvent
	| AgentToolCallEvent
	| AgentToolResultEvent
	| AgentPermissionRequestEvent
	| AgentPermissionResolvedEvent
	| AgentStatusEvent
	| AgentUsageEvent
	| AgentRateLimitEvent
	| AgentResultEvent
	| AgentErrorEvent;

export interface AgentEventBase {
	/** Schema 版本，便于跨进程协商 */
	v: 1;
	requestId: string;
	conversationId: string;
	/** 同一 requestId 内单调递增；adapter 维护 counter，从 0 起 */
	seq: number;
	runtime: AgentRuntimeId | CustomAgentRuntimeId;
	timestamp: number;
	/** Adapter 自留扩展（仅 trace 显示，业务逻辑不依赖） */
	extra?: Record<string, unknown>;
}

export interface AgentInitEvent extends AgentEventBase {
	type: "init";
	/** Adapter 拿到的原生 session id；renderer 应回写到 `SessionMeta.nativeSessionId` */
	nativeSessionId?: string;
	model?: string;
}

export interface AgentTextDeltaEvent extends AgentEventBase {
	type: "text.delta";
	/** 同一消息内稳定；reasoning 与 text 共享 messageId */
	messageId: string;
	delta: string;
}

export interface AgentReasoningDeltaEvent extends AgentEventBase {
	type: "reasoning.delta";
	/** 与 text.delta 共享 messageId；UI 按到达顺序渲染（一般 reasoning 在前） */
	messageId: string;
	delta: string;
}

export interface AgentMessageFinalEvent extends AgentEventBase {
	type: "message.final";
	messageId: string;
	text: string;
	reasoning?: string;
}

export interface AgentToolCallEvent extends AgentEventBase {
	type: "tool.call";
	callId: string;
	/** Host 前缀名（与 `AgentToolBinding.name` 一致） */
	toolName: string;
	input: unknown;
}

export interface AgentToolResultEvent extends AgentEventBase {
	type: "tool.result";
	callId: string;
	content: ToolResultContent;
	/** 是否错误（`content.kind === 'error'` 时必为 true） */
	isError: boolean;
}

export interface AgentPermissionRequestEvent extends AgentEventBase {
	type: "permission.request";
	approvalId: string;
	toolName: string;
	input: unknown;
}

/** 审批裁决来源；UI 据此区分显示 "用户" vs "已自动允许"。 */
export type AgentPermissionSource = "user" | "auto-grant" | "auto-policy";

export interface AgentPermissionResolvedEvent extends AgentEventBase {
	type: "permission.resolved";
	approvalId: string;
	decision: PermissionDecision;
	source: AgentPermissionSource;
}

export interface AgentStatusEvent extends AgentEventBase {
	type: "status";
	status: "preparing" | "streaming" | "tool_calling" | "idle";
}

export interface AgentUsageEvent extends AgentEventBase {
	type: "usage";
	/** 只发 token，价格在 host UsageService 一处算 */
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
}

export interface AgentRateLimitEvent extends AgentEventBase {
	type: "rate_limit";
	retryAfterMs?: number;
	message?: string;
}

export interface AgentResultEvent extends AgentEventBase {
	type: "result";
	reason: "completed" | "cancelled" | "error" | "max_turns";
	finalMessageId?: string;
}

export interface AgentErrorEvent extends AgentEventBase {
	type: "error";
	fatal: boolean;
	code: string;
	message: string;
	/**
	 * Structured request/response context built by `buildLLMErrorContext`
	 * in LLMService. Carried through the runtime adapter chain so the
	 * renderer can surface a rich ErrorCard (model / preset / endpoint /
	 * HTTP status / provider business-error / response body).
	 */
	errorContext?: LLMErrorContext;
}

// ─────────────────────────────────────────────────────────────────────
// 审批裁决
// ─────────────────────────────────────────────────────────────────────

/** 沿用 `SessionApprovalGrant.scope`，避免出现两套枚举。 */
export type ToolCallApprovalScope = SessionApprovalGrant["scope"];

export interface PermissionDecision {
	approved: boolean;
	scope: ToolCallApprovalScope;
	reason?: string;
	/**
	 * 用户在授权卡片里提供的结构化数据（例如 `AskUserQuestion` 的
	 * `{questions, answers}`）。AgentRuntime 实现应将其透传到下游
	 * 的 `LLMService.resolveToolApproval` 的 `payload` 形参，以便挂在
	 * `pendingApprovals` 上的拦截器（如 `awaitUserQuestionAnswer`）能
	 * 拿到用户答案并回填给模型。
	 */
	payload?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────
// AgentRuntime 接口
// ─────────────────────────────────────────────────────────────────────

export interface AgentRuntime {
	readonly descriptor: AgentRuntimeDescriptor;

	/**
	 * 启动一次查询。
	 *
	 * - Adapter 必须监听 `req.signal` 并在中止时正确清理
	 * - Adapter 必须为 seq 维护单调 counter
	 * - 工具执行通过构造期注入的 `ToolDispatcher` 完成（见 §4）
	 * - Adapter 内部抛错应转 `AgentErrorEvent` 通过 yield 抛出，而非以异常向外
	 *   抛——broker 会兜底，但 adapter 应主动给信息
	 */
	createQuery(req: AgentQueryRequest): AsyncIterable<AgentRuntimeStreamEvent>;

	/** 用户裁决审批 */
	resolvePermission(
		approvalId: string,
		decision: PermissionDecision,
	): Promise<void>;

	/** 终止某次请求；幂等 */
	interrupt(requestId: string): Promise<void>;

	/** Optional：仅 `capabilities.nativeSession=true` 时实现 */
	listNativeSessions?(): Promise<NativeSessionInfo[]>;
	forkNativeSession?(sessionId: string, atMessageId?: string): Promise<string>;
	renameNativeSession?(sessionId: string, name: string): Promise<void>;
	deleteNativeSession?(sessionId: string): Promise<void>;

	/** App quit 时调用 */
	dispose?(): Promise<void>;
}

export interface NativeSessionInfo {
	id: string;
	title?: string;
	updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────
// ToolDispatcher（工具执行接缝）
// ─────────────────────────────────────────────────────────────────────

/** 工具调用上下文；adapter 构造，dispatcher 消费。 */
export interface ToolCallContext {
	conversationId: string;
	requestId: string;
	callId: string;
	/** Host 前缀名 */
	toolName: string;
	input: unknown;
	origin: AgentToolOrigin;
	runtime: EffectiveSessionRuntime;
	/** 用于路径解析 / `_storageDir` 注入 */
	cwd?: string;
}

/** Dispatcher 审批检查结果。 */
export type ApprovalCheckResult =
	| { kind: "allow"; source: "auto-grant" | "auto-policy" }
	| { kind: "deny"; reason: string; source: "auto-policy" }
	| { kind: "ask"; approvalId: string };

/** Dispatcher 工具执行结果。 */
export interface ToolExecutionResult {
	content: ToolResultContent;
	isError: boolean;
	durationMs: number;
}

export interface ToolDispatcher {
	/** 检查审批：可能立即放行 / 拒绝 / 转人工 */
	checkApproval(call: ToolCallContext): Promise<ApprovalCheckResult>;
	/** 执行工具（已通过审批） */
	execute(call: ToolCallContext): Promise<ToolExecutionResult>;
}

// ─────────────────────────────────────────────────────────────────────
// 错误码
// ─────────────────────────────────────────────────────────────────────

/** Adapter / dispatcher / broker 可使用的标准错误码。 */
export type AgentRuntimeErrorCode =
	| "RuntimeNotRegistered"
	| "ConfigurationError"
	| "InvalidRequest"
	| "PermissionDenied"
	| "ToolExecutionFailed"
	| "ModelUnavailable"
	| "Cancelled"
	| "RateLimited"
	| "Internal";

export class AgentRuntimeError extends Error {
	readonly code: AgentRuntimeErrorCode;
	readonly fatal: boolean;
	readonly cause?: unknown;

	constructor(
		code: AgentRuntimeErrorCode,
		message: string,
		opts?: { fatal?: boolean; cause?: unknown },
	) {
		super(message);
		this.name = "AgentRuntimeError";
		this.code = code;
		this.fatal = opts?.fatal ?? false;
		this.cause = opts?.cause;
	}
}
