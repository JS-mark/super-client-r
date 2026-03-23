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
	AppendMessageRequest,
	UpdateMessageRequest,
	SaveMessagesRequest,
	RenameConversationRequest,
	IMPlatform,
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
	enabled: boolean;
	tested: boolean;
	models: ProviderModel[];
	createdAt: number;
	updatedAt: number;
	claudeCodeEnabled?: boolean;
	claudeCodeModel?: string;
}

export interface ActiveModelSelection {
	providerId: string;
	modelId: string;
}

export interface TestConnectionRequest {
	baseUrl: string;
	apiKey: string;
}

export interface TestConnectionResponse {
	success: boolean;
	latencyMs: number;
	error?: string;
}

export interface FetchModelsRequest {
	baseUrl: string;
	apiKey: string;
	preset?: ModelProviderPreset;
}

export interface FetchModelsResponse {
	models: ProviderModel[];
}

export interface UpdateModelConfigRequest {
	providerId: string;
	modelId: string;
	config: Partial<Omit<ProviderModel, "id">>;
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
		| "tool_approval_request"
		| "tool_rejected";
	content?: string;
	error?: string;
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
	toolApproval?: {
		toolCallId: string;
		name: string;
		arguments: string;
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

export interface StartBotRequest {
	config: IMBotConfig;
}

export interface SendMessageRequest {
	botId: string;
	chatId: string;
	content: string;
}

// ============ Remote Device 相关类型 ============

export interface RegisterDeviceRequest {
	name: string;
	platform: "linux" | "windows" | "macos";
	tags?: string[];
	description?: string;
}

export interface ExecuteCommandRequest {
	deviceId: string;
	command: string;
	timeout?: number;
}

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
	requestBodyPreview?: string; // 截取前 1KB
	responseStatus?: number;
	responseStatusText?: string;
	durationMs: number;
	error?: string;
	source: "fetch" | "axios";
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

