/**
 * Claude Agent SDK 相关共享类型定义
 */

import type { AssistantPartEvent } from "./chat";

/** Agent SDK 查询请求配置 */
export interface AgentSDKQueryRequest {
	/** 用户消息 */
	prompt: string;
	/** 会话 ID（可选，用于关联） */
	sessionId?: string;
	/** 恢复已有 Agent SDK session */
	resumeSessionId?: string;
	/** 工作目录 */
	cwd?: string;
	/** 模型覆盖（不传则由 AutoConfig 推断） */
	model?: string;
	/**
	 * 会话/项目级选定的 provider id。传入后 `resolveAnthropicEnv` 优先用该
	 * provider 的 `baseUrl + apiKey` 作为 Anthropic 第三方网关，确保
	 * `(model, baseUrl)` 配对一致——避免出现"选了阿里云的 deepseek-r1，但 SDK
	 * 仍走 Anthropic provider 的 baseUrl 找不到模型"的 bug。
	 */
	providerId?: string;
	/** 努力程度覆盖 */
	effort?: AgentSDKEffort;
	/** 思考模式覆盖 */
	thinking?: AgentSDKThinkingConfig;
	/** 最大轮次 */
	maxTurns?: number;
	/** 最大预算（美元） */
	maxBudgetUsd?: number;
	/** 权限模式 */
	permissionMode?: AgentSDKPermissionMode;
	/** 是否持久化 session */
	persistSession?: boolean;
	/** 是否包含流式部分消息 */
	includePartialMessages?: boolean;
	/** MCP 服务器名称列表（从已连接的 MCP 中注入） */
	mcpServerNames?: string[];
	/** 子代理定义 */
	agents?: Record<string, AgentSDKAgentDefinition>;
	/** 系统提示词（额外注入） */
	systemPrompt?: string;
}

/** Agent SDK 努力程度 */
export type AgentSDKEffort = "low" | "medium" | "high" | "max";

/** Agent SDK 思考配置 */
export type AgentSDKThinkingConfig =
	| { type: "adaptive" }
	| { type: "enabled"; budgetTokens: number }
	| { type: "disabled" };

/** Agent SDK 权限模式 */
export type AgentSDKPermissionMode =
	| "default"
	| "acceptEdits"
	| "bypassPermissions"
	| "plan"
	| "dontAsk";

/** 子代理定义 */
export interface AgentSDKAgentDefinition {
	description: string;
	prompt: string;
	tools?: string[];
	disallowedTools?: string[];
	model?: string;
	maxTurns?: number;
}

/** Agent SDK 流式事件（从 Main → Renderer） */
export interface AgentSDKStreamEvent {
	/** 请求 ID */
	requestId: string;
	/** 事件类型 */
	type: AgentSDKStreamEventType;
	/** session ID（Agent SDK 分配的） */
	sessionId?: string;
	/** 文本内容（chunk / result） */
	content?: string;
	/** 错误信息 */
	error?: string;
	/**
	 * 结构化错误上下文（LLM provider 失败时携带）。Renderer 据此渲染 ErrorCard：
	 * preset / apiFormat / baseUrl / model / HTTP status / 业务错误码 + 原始响应。
	 */
	errorContext?: import("./chat").LLMErrorContext;
	/** 工具使用摘要 */
	toolSummary?: string;
	/** 工具使用摘要对应的 tool_use ids */
	precedingToolUseIds?: string[];
	/** 工具调用 */
	toolCall?: AgentSDKToolCallEventData;
	/** 工具错误 */
	toolError?: AgentSDKToolErrorEventData;
	/** 结果数据 */
	result?: AgentSDKResultData;
	/** 权限请求 */
	permissionRequest?: AgentSDKPermissionRequest;
	/** 结构化 assistant part 事件 */
	assistantPart?: AssistantPartEvent;
	/** 状态信息 */
	status?: string;
	/** 用量 */
	usage?: AgentSDKUsage;
}

export type AgentSDKStreamEventType =
	| "init" // session 初始化完成
	| "chunk" // 流式文本块
	| "assistant" // 完整 assistant 消息
	| "assistant_part" // 结构化 assistant part 事件
	| "tool_call" // 工具调用
	| "tool_error" // 工具失败
	| "tool_use_summary" // 工具使用摘要
	| "status" // 状态更新
	| "permission_request" // 权限请求
	| "permission_denied" // 权限被自动拒绝
	| "rate_limit" // 速率限制
	| "result" // 最终结果
	| "error"; // 错误

export type AgentSDKToolCallKind = "ask-user-question" | "permission" | "tool";

export interface AgentSDKPermissionUpdate {
	type: string;
	[key: string]: unknown;
}

/** 工具调用事件数据 */
export interface AgentSDKToolCallEventData {
	id: string;
	name: string;
	input: Record<string, unknown>;
	title?: string;
	description?: string;
	displayName?: string;
	kind: AgentSDKToolCallKind;
}

/** 工具错误事件数据 */
export interface AgentSDKToolErrorEventData {
	id: string;
	name: string;
	input?: Record<string, unknown>;
	error: unknown;
	code?: string;
	title?: string;
	description?: string;
	displayName?: string;
	kind: AgentSDKToolCallKind;
}

/** 最终结果数据 */
export interface AgentSDKResultData {
	success: boolean;
	text: string;
	durationMs: number;
	numTurns: number;
	totalCostUsd: number;
	stopReason: string | null;
	usage: AgentSDKUsage;
}

/** 用量统计 */
export interface AgentSDKUsage {
	inputTokens: number;
	outputTokens: number;
	cacheCreationInputTokens?: number;
	cacheReadInputTokens?: number;
}

/** 权限请求（发给 Renderer 让用户审批） */
export interface AgentSDKPermissionRequest {
	toolName: string;
	toolUseId: string;
	toolInput: Record<string, unknown>;
	title?: string;
	description?: string;
	displayName?: string;
	suggestions?: AgentSDKPermissionUpdate[];
	blockedPath?: string;
	decisionReason?: string;
	agentId?: string;
}

/** Agent SDK session 信息（映射自 SDK 的 SDKSessionInfo） */
export interface AgentSDKSessionInfo {
	sessionId: string;
	summary: string;
	lastModified: number;
	createdAt?: number;
	cwd?: string;
	tag?: string;
	customTitle?: string;
}

/** Agent SDK session 列表查询选项 */
export interface AgentSDKListSessionsOptions {
	dir?: string;
}

/** Session 消息（getSessionMessages 返回） */
export interface AgentSDKSessionMessage {
	type: "user" | "assistant";
	uuid: string;
	sessionId: string;
	message: unknown;
}

/** Agent SDK 全局设置（持久化到 AppConfig） */
export interface AgentSDKConfig {
	/** Anthropic API Key 覆盖（优先于服务商配置） */
	apiKeyOverride?: string;
	/** Anthropic Base URL 覆盖（代理/企业端点） */
	baseUrlOverride?: string;
	/** 默认主模型（不填则使用 claude-sonnet-4-5） */
	defaultModel?: string;
	/** 小/快模型（用于 ANTHROPIC_SMALL_FAST_MODEL） */
	smallFastModel?: string;
	/** 默认 effort */
	defaultEffort?: AgentSDKEffort;
	/** 默认 thinking 模式 */
	defaultThinking?: AgentSDKThinkingConfig;
	/** 默认最大轮次 */
	defaultMaxTurns?: number;
	/** 默认最大预算（美元） */
	defaultMaxBudgetUsd?: number;
	/** 默认权限模式 */
	defaultPermissionMode?: AgentSDKPermissionMode;
	/** 自定义环境变量（注入到 SDK 子进程） */
	customEnvVars?: Record<string, string>;
}

/** 自动配置预设类型 */
export type AgentSDKTaskType =
	| "coding"
	| "analysis"
	| "chat"
	| "creative"
	| "tool-heavy";

// ============ Multi-Agent 协作类型 ============

/** Agent 角色定义（用户配置的持久化模板） */
export interface AgentProfile {
	id: string;
	/** 角色名称，如 "代码审查员" */
	name: string;
	/** 角色描述 */
	description: string;
	/** System prompt */
	prompt: string;
	/** 允许的工具列表 */
	tools?: string[];
	/** 禁止的工具列表 */
	disallowedTools?: string[];
	/** 覆盖模型 */
	model?: string;
	/** 最大轮次 */
	maxTurns?: number;
	/** 图标（antd icon name） */
	icon?: string;
	/** 标识色 */
	color?: string;
}

/** Agent 团队（一组 AgentProfile 的编排） */
export interface AgentTeam {
	id: string;
	/** 团队名称，如 "全栈开发团队" */
	name: string;
	/** 团队描述 */
	description: string;
	/** AgentProfile IDs（有序） */
	agents: string[];
	/** 是否内置预设 */
	isBuiltin?: boolean;
}

// ============ AskUserQuestion 工具类型 ============

/** AskUserQuestion 工具的 input 结构 */
export interface AskUserQuestionInput {
	questions: AskUserQuestionItem[];
}

/** 单个问题项 */
export interface AskUserQuestionItem {
	question: string;
	header: string;
	options: AskUserQuestionOption[];
	multiSelect: boolean;
}

/** 问题选项 */
export interface AskUserQuestionOption {
	label: string;
	description: string;
	preview?: string;
}
