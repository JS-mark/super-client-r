/**
 * IPC 通信类型定义
 */

// ============ Agent 相关类型 ============

export interface AgentSession {
	id: string;
	name: string;
	model: string;
	createdAt: number;
	status: "idle" | "running" | "stopped" | "error";
}

export interface AgentMessage {
	id: string;
	sessionId: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	toolUse?: ToolUse[];
}

export interface ToolUse {
	id: string;
	name: string;
	input: Record<string, unknown>;
	result?: unknown;
	status: "pending" | "success" | "error";
}

export interface AgentStreamEvent {
	type: "text" | "tool_use" | "tool_result" | "error" | "done";
	sessionId: string;
	data: unknown;
}

// ============ Skill 相关类型 ============

export interface SkillManifest {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	category?: string;
	icon?: string;
	permissions?: string[];
	tools?: SkillTool[];
}

export interface SkillTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface SkillExecutionResult {
	success: boolean;
	output?: unknown;
	error?: string;
}

// ============ MCP 相关类型 ============

export type McpServerType = "builtin" | "third-party" | "market";

export type McpTransportType = "stdio" | "sse" | "http";

export interface McpServerConfig {
	id: string;
	name: string;
	type: McpServerType;
	transport: McpTransportType;
	// stdio transport
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	// sse/http transport (for third-party)
	url?: string;
	headers?: Record<string, string>;
	// metadata
	description?: string;
	version?: string;
	author?: string;
	icon?: string;
	enabled?: boolean;
}

export interface McpServerStatus {
	id: string;
	status: "connected" | "disconnected" | "connecting" | "error";
	type?: McpServerType;
	transport?: McpTransportType;
	tools?: McpTool[];
	error?: string;
}

export interface McpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface McpToolCallRequest {
	serverId: string;
	toolName: string;
	args: Record<string, unknown>;
}

export interface McpToolCallResponse {
	success: boolean;
	data?: unknown;
	error?: string;
}

// MCP Market types
export interface McpMarketItem {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	icon?: string;
	tags: string[];
	rating: number;
	downloads: number;
	installCount?: number;
	transport: McpTransportType;
	// For stdio servers
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	// For remote servers
	url?: string;
	headers?: Record<string, string>;
	readmeUrl?: string;
	repositoryUrl?: string;
	license?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface McpMarketSearchParams {
	query?: string;
	tags?: string[];
	sortBy?: "downloads" | "rating" | "newest";
	page?: number;
	limit?: number;
}

export interface McpMarketSearchResult {
	items: McpMarketItem[];
	total: number;
	page: number;
	limit: number;
}

// Third-party MCP proxy types
export interface ThirdPartyMcpRequest {
	endpoint: string;
	method: "GET" | "POST" | "PUT" | "DELETE";
	body?: unknown;
	headers?: Record<string, string>;
}

export interface ThirdPartyMcpResponse {
	success: boolean;
	data?: unknown;
	error?: string;
	statusCode?: number;
}

// Built-in MCP server definitions
export interface BuiltinMcpDefinition {
	id: string;
	name: string;
	description: string;
	version: string;
	icon?: string;
	tags: string[];
	transport: McpTransportType;
	command: string;
	args: string[];
	env?: Record<string, string>;
	configSchema?: Record<string, unknown>;
}

// ============ Chat 相关类型 ============

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	model?: string;
}

export interface ChatHistory {
	sessionId: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
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
	messages: { role: "user" | "assistant" | "system"; content: string }[];
	maxTokens?: number;
	temperature?: number;
}

export interface ChatStreamEvent {
	requestId: string;
	type: "chunk" | "done" | "error";
	content?: string;
	error?: string;
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

// ============ IPC 请求/响应类型 ============

export interface IPCRequest<T = unknown> {
	id?: string;
	payload?: T;
}

export interface IPCResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface IPCStreamData<T = unknown> {
	type: string;
	data: T;
}
