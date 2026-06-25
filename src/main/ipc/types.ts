/**
 * IPC 通信类型定义
 *
 * 共享类型从 @super-client/shared-types 重新导出
 */

// ============ 重新导出共享类型 ============

export type {
	// Agent
	AgentConfig,
	AgentSession,
	AgentMessage,
	ToolUse,
	AgentStreamEvent,
} from "@super-client/shared-types/agent";

export type {
	// Agent SDK
	AgentSDKQueryRequest,
	AgentSDKEffort,
	AgentSDKThinkingConfig,
	AgentSDKPermissionMode,
	AgentSDKAgentDefinition,
	AgentSDKStreamEvent,
	AgentSDKStreamEventType,
	AgentSDKResultData,
	AgentSDKUsage,
	AgentSDKPermissionRequest,
	AgentSDKSessionInfo,
	AgentSDKListSessionsOptions,
	AgentSDKTaskType,
	AgentSDKSessionMessage,
	AgentSDKConfig,
	// Multi-Agent
	AgentProfile,
	AgentTeam,
} from "@super-client/shared-types/agent-sdk";

export type {
	// Skill
	SkillCommand,
	SkillManifest,
	SkillTool,
	SkillExecutionResult,
	ValidationIssue,
	SkillValidationResult,
	SkillType,
	ValidationSeverity,
	ValidationCategory,
} from "@super-client/shared-types/skill";

export type {
	// MCP
	McpServerType,
	McpTransportType,
	McpServerConfig,
	McpServerStatus,
	McpTool,
	McpToolCallRequest,
	McpToolCallResponse,
	McpMarketItem,
	McpMarketSearchParams,
	McpMarketSearchResult,
	ThirdPartyMcpRequest,
	ThirdPartyMcpResponse,
	BuiltinMcpDefinition,
} from "@super-client/shared-types/mcp";

export type {
	// Chat
	ChatMessage,
	ChatHistory,
	ChatMessagePersist,
	RemoteBinding,
	BindRemoteRequest,
	RemoteIMMessage,
	RemoteChatMessage,
	SendRemoteMessageRequest,
	ConversationSummary,
	ConversationData,
	IMPlatform,
	CreateConversationOptions,
	SessionKind,
	InteractionProfile,
	PlanMode,
	ApprovalMode,
	SandboxMode,
	ModelSelection,
	WorkspaceRuntimePolicy,
	WorkspaceContextPolicy,
	WorkspaceConfig,
	EnabledCapability,
	SessionApprovalGrant,
	SessionMetadata,
	SessionMessageOverride,
	ResolveSessionRuntimeInput,
	ResolvedAttachmentContext,
	EffectiveSessionRuntime,
	ConversationSummaryUpdate,
	LLMErrorContext,
} from "@super-client/shared-types/chat";

export type {
	// IPC
	IPCRequest,
	IPCResponse,
	IPCStreamData,
} from "@super-client/shared-types/ipc";

export type {
	// Remote Protocol
	RemoteDeviceMode,
	RelayConfig,
	DevicePlatform,
	DeviceStatus,
	RemoteDevice,
	CommandRequest,
	CommandResult,
	WSMessageType,
	WSMessage,
	WSRegisterMessage,
	WSRegisterAckMessage,
	WSHeartbeatMessage,
	WSExecuteCommandMessage,
	WSCommandOutputChunkMessage,
	WSCommandResultMessage,
	WSTabCompleteMessage,
	WSTabCompleteResultMessage,
	WSGetCwdResultMessage,
	RemoteControlEventType,
	RemoteControlEventDirection,
	RemoteControlEventSourceKind,
	RemoteControlEvent,
	DeviceConnectionInfo,
	TabCompleteResult,
	CommandOutputChunk,
} from "@super-client/shared-types/remote-protocol";

export type {
	// Extension descriptors
	ExtensionDescriptor,
	ExtensionType,
	ExtensionSource,
	ExtensionScope,
	ExtensionHealth,
	ExtensionBackingRef,
} from "@super-client/shared-types/extensions";

// Re-imported here (the block above already re-exports it) so the type can
// be referenced as a type annotation in interfaces declared in this same
// module — `export type {…} from "…"` does not create a local binding in
// TypeScript.
import type { LLMErrorContext } from "@super-client/shared-types/chat";

// ============ Main 进程独有的类型 ============

// ============ Tool Permission 相关类型 ============

export type ToolPermissionMode =
	| "none"
	| "auto"
	| "approve_always"
	| "approve_except_authorized";

export interface ToolPermissionConfig {
	mode: ToolPermissionMode;
	authorizedTools?: string[];
}

// ============ Log 相关类型 ============

export interface LogRecord {
	id: number;
	timestamp: string;
	timestamp_ms: number;
	level: string;
	module: string;
	process: string;
	message: string;
	meta: string | null;
	error_message: string | null;
	error_stack: string | null;
	session_id: string | null;
}

export interface LogQueryParams {
	page?: number;
	pageSize?: number;
	level?: string[];
	module?: string[];
	process?: string[];
	keyword?: string;
	startTime?: number;
	endTime?: number;
	sortOrder?: "asc" | "desc";
}

export interface LogQueryResult {
	records: LogRecord[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface LogStats {
	totalCount: number;
	countByLevel: Record<string, number>;
	countByModule: Record<string, number>;
	countByProcess: Record<string, number>;
	recentErrorCount: number;
	timeHistogram: { hour: string; count: number }[];
}

export interface RendererLogEntry {
	level: string;
	message: string;
	module?: string;
	meta?: unknown;
	error_message?: string;
	error_stack?: string;
}

// ============ Auth 相关类型 ============

export type AuthProvider = "google" | "github";

export interface AuthLoginRequest {
	provider: AuthProvider;
}

export interface AuthUser {
	id: string;
	name: string;
	email?: string;
	avatar?: string;
	provider: AuthProvider;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
}

// ============ Model Provider 相关类型 ============

export type ModelProviderPreset =
	| "dashscope"
	| "deepseek"
	| "openai"
	| "anthropic"
	| "gemini"
	| "cherryin"
	| "siliconflow"
	| "aihubmix"
	| "ocoolai"
	| "zhipu-ai"
	| "302ai"
	| "moonshot"
	| "baichuan"
	| "volcengine"
	| "minimax"
	| "hunyuan"
	| "grok"
	| "github-models"
	| "huggingface"
	| "openrouter"
	| "ollama"
	| "lmstudio"
	| "newapi"
	| "custom";

export type ModelCapability =
	| "vision"
	| "web_search"
	| "reasoning"
	| "tool_use"
	| "embedding"
	| "reranking";

export type ModelCategory =
	| "chat"
	| "embedding"
	| "reranking"
	| "vision"
	| "code"
	| "image_generation"
	| "audio"
	| "custom";

export type PricingCurrency = "USD" | "CNY" | "EUR";

export interface ModelPricing {
	currency: PricingCurrency;
	inputPricePerMillion: number;
	outputPricePerMillion: number;
}

export interface ProviderModel {
	id: string;
	name: string;
	group?: string;
	enabled: boolean;
	capabilities: ModelCapability[];
	category: ModelCategory;
	supportsStreaming: boolean;
	pricing?: ModelPricing;
	systemPrompt?: string;
	maxTokens?: number;
	contextWindow?: number;
}

export interface ModelProvider {
	id: string;
	name: string;
	preset: ModelProviderPreset;
	baseUrl: string;
	apiKey: string;
	/**
	 * Wire-format of the provider's HTTP API. Drives backend routing in
	 * `providers.resolveProvider`. Optional for backwards compatibility —
	 * when absent, backend infers from `preset` via `presetToApiFormat`.
	 */
	apiFormat?: "anthropic-messages" | "chat-completions" | "responses";
	enabled: boolean;
	tested: boolean;
	models: ProviderModel[];
	createdAt: number;
	updatedAt: number;
}

export interface ActiveModelSelection {
	providerId: string;
	modelId: string;
}

export interface TestConnectionResponse {
	success: boolean;
	latencyMs: number;
	error?: string;
}

export interface FetchModelsResponse {
	models: ProviderModel[];
}

export interface ChatCompletionRequest {
	requestId: string;
	baseUrl: string;
	apiKey: string;
	model: string;
	messages: Array<
		| { role: "user" | "assistant" | "system"; content: string }
		| { role: "assistant"; content: null; tool_calls: OpenAIToolCall[] }
		| { role: "tool"; tool_call_id: string; content: string }
	>;
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	stream?: boolean;
	tools?: Array<{
		type: "function";
		function: {
			name: string;
			description: string;
			parameters: Record<string, unknown>;
		};
	}>;
	toolMapping?: Record<string, { serverId: string; toolName: string }>;
	toolPermission?: ToolPermissionConfig;
	/** "function" = native function calling API; "prompt" = inject tools into system prompt and parse from text */
	toolCallMode?: "function" | "prompt";
	/**
	 * Wire-format of the provider's HTTP API. Drives which AI SDK provider
	 * factory we instantiate in providers.ts:
	 *   - "anthropic-messages"  → POST /v1/messages           (Anthropic, Bedrock Claude, Vertex Claude)
	 *   - "chat-completions"    → POST /chat/completions      (OpenAI, DeepSeek, Qwen, Grok, OpenRouter, Ollama, …)
	 *   - "responses"           → POST /responses             (OpenAI new API)
	 * If omitted, providers.ts falls back to inferring from `providerPreset`
	 * for backwards compatibility with existing renderer/HTTP callers.
	 */
	apiFormat?: "anthropic-messages" | "chat-completions" | "responses";
	providerPreset?: ModelProviderPreset;
	extraParams?: Record<string, unknown>;
	/** Conversation ID for resolving workspace directory in tool calls */
	conversationId?: string;
	/** Tool execution timeout in seconds (default 180) */
	toolTimeout?: number;
}

export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface ChatStreamEvent {
	requestId: string;
	type:
		| "chunk"
		| "done"
		| "error"
		| "tool_call"
		| "tool_result"
		| "tool_error"
		| "tool_approval_request"
		| "tool_rejected";
	content?: string;
	error?: string;
	/**
	 * Structured request/response context for `type:'error'` events. Built by
	 * `buildLLMErrorContext` in the main process — preset/apiFormat/baseUrl/
	 * model + HTTP status + parsed provider error code/message + raw body
	 * snippet. Drives the renderer's ErrorCard.
	 */
	errorContext?: LLMErrorContext;
	toolCall?: {
		id: string;
		name: string;
		arguments: string;
	};
	toolResult?: {
		toolCallId: string;
		name: string;
		result: unknown;
		isError?: boolean;
		duration?: number;
	};
	toolError?: {
		toolCallId: string;
		name: string;
		error: unknown;
		code?: string;
		duration?: number;
	};
	toolApproval?: {
		toolCallId: string;
		name: string;
		arguments: string;
		/**
		 * Origin of the approval request. `tool-permission` (default) is the
		 * legacy `ToolPermissionConfig.mode !== "auto"` prompt;
		 * `runtime-policy` means the workspace runtime policy returned
		 * `needs-approval` (e.g. `command-exec` with non-system-access
		 * sandbox). Renderer can use this to tailor the prompt copy.
		 */
		source?: "tool-permission" | "runtime-policy";
		/** Machine-readable policy code, e.g. `runtime.needsApproval`. */
		code?: string;
		/** Human-readable reason, e.g. `workspace-policy:command-approval-required`. */
		reason?: string;
	};
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
	timing?: {
		firstTokenMs?: number;
		totalMs?: number;
	};
}

// ============ Search 相关类型 ============

export interface SearchExecuteRequest {
	provider: string;
	query: string;
	apiKey: string;
	apiUrl?: string;
	maxResults?: number;
	config?: Record<string, unknown>;
}

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface SearchExecuteResponse {
	results: SearchResult[];
	provider: string;
	query: string;
	searchTimeMs: number;
}

// ============ Webhook 相关类型 ============

export type WebhookType =
	| "dingtalk"
	| "feishu"
	| "telegram"
	| "twitter"
	| "facebook"
	| "custom";

export interface WebhookConfig {
	id: string;
	name: string;
	type: WebhookType;
	url: string;
	secret?: string;
	headers?: Record<string, string>;
	method?: "GET" | "POST";
	enabled: boolean;
	createdAt: number;

	// Telegram 特定字段
	telegramBotToken?: string; // Bot API Token
	telegramChatId?: string; // 目标 Chat ID
	telegramParseMode?: "Markdown" | "HTML" | "MarkdownV2"; // 消息格式

	// Twitter 特定字段
	twitterApiKey?: string; // API Key
	"twitterApi*"?: string; // API *
	twitterAccessToken?: string; // Access Token
	"twitterAccess*"?: string; // Access Token *
	twitterUserId?: string; // 目标用户 ID（DM 用）

	// Facebook 特定字段
	facebookPageToken?: string; // Page Access Token
	facebookPageId?: string; // 页面 ID
	"facebookApp*"?: string; // App *（用于签名验证）
}

export interface WebhookTestResult {
	success: boolean;
	statusCode?: number;
	message: string;
}

// ============ IM Bot 相关类型 ============

import type { IMBotConfig, BotStatus } from "../services/imbot/types";

export type { IMBotConfig, BotStatus };

// ============ Network 相关类型（代理 + 请求日志）============

export interface ProxyConfig {
	enabled: boolean;
	protocols: ("http" | "https")[]; // 多选：覆盖哪些流量类型
	host: string;
	port: number;
	auth?: boolean;
	username?: string;
	password?: string;
	bypassList?: string; // 逗号分隔: "localhost,127.0.0.1,*.internal.com"
}

export interface RequestLogEntry {
	id: string;
	timestamp: number;
	method: string;
	url: string;
	requestHeaders?: Record<string, string>;
	requestBodyPreview?: string; // 截取前 N KB
	responseStatus?: number;
	responseStatusText?: string;
	responseHeaders?: Record<string, string>;
	responseBodyPreview?: string;
	/**
	 * Whether the request is still receiving data. The entry is pushed to the
	 * UI as soon as response headers arrive; for streaming responses (SSE /
	 * chunked transfer) the body is appended progressively via
	 * `network:request-log-update` events. UI should reflect "streaming…"
	 * state until `state === 'complete'` or `error` is set.
	 */
	state?: "pending" | "streaming" | "complete" | "error";
	/** Detected `content-type` of the response, normalised lower-case. */
	contentType?: string;
	/** True when content-type is text/event-stream or response is chunked. */
	isStreaming?: boolean;
	durationMs: number;
	error?: string;
	source: "fetch" | "axios";
}

/**
 * Incremental update for an entry already broadcast via
 * `network:request-log-entry`. Renderer matches by `id` and merges fields.
 *
 *  - For streaming responses, `appendBody` carries new chunk text (raw, may
 *    include SSE `data:` framing). Renderer appends to its accumulated body.
 *  - For completion, `state: 'complete' | 'error'` plus final `durationMs`,
 *    `responseStatus`, etc. are sent.
 */
export interface RequestLogEntryUpdate {
	id: string;
	appendBody?: string;
	state?: "pending" | "streaming" | "complete" | "error";
	responseStatus?: number;
	responseStatusText?: string;
	responseHeaders?: Record<string, string>;
	contentType?: string;
	isStreaming?: boolean;
	durationMs?: number;
	error?: string;
}

// ============ App Config 相关类型 ============

export interface AppInitConfig {
	version: string;
	updatedAt: number;
	forceUpdate?: {
		fields: string[];
		reason?: string;
	};
	oauth: {
		google: { clientId: string };
		github: { clientId: string; tokenExchangeUrl: string };
	};
	featureFlags: Record<string, boolean>;
	announcements: Array<{
		id: string;
		type: string;
		title: string;
		titleZh: string;
		content: string;
		contentZh: string;
		dismissible: boolean;
		startAt: number;
		endAt: number;
		priority: number;
	}>;
	meta: {
		links: Record<string, string>;
		endpoints: Record<string, string>;
	};
}
