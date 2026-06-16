/**
 * Chat 相关类型定义
 */

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
	};
	metadata?: {
		model?: string;
		tokens?: number;
		inputTokens?: number;
		outputTokens?: number;
		duration?: number;
		firstTokenMs?: number;
		tokensPerSecond?: number;
		attachmentIds?: string[];
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
export type PlanMode = "off" | "auto" | "plan";

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
	type: "mcp" | "skill" | "hook" | "app-plugin" | "theme" | "capability-package";
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
	approvalGrants: SessionApprovalGrant[];
	createdAt: number;
	updatedAt: number;
}

/** 主进程可读的工作区配置 */
export interface WorkspaceConfig {
	id: string;
	name: string;
	path?: string;
	interactionProfile: InteractionProfile;
	defaultModel?: ModelSelection;
	runtimePolicy: WorkspaceRuntimePolicy;
	enabledCapabilities: EnabledCapability[];
	contextPolicy: WorkspaceContextPolicy;
	createdAt: number;
	updatedAt: number;
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

/** 对话数据 */
export interface ConversationData extends ConversationSummary {
	messages: ChatMessagePersist[];
}

/** IM 平台 */
export type IMPlatform = "dingtalk" | "lark" | "telegram";
