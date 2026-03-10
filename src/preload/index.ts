/**
 * Electron Preload 脚本
 * 通过 contextBridge 安全地暴露 IPC 功能到渲染进程
 */

import { contextBridge, ipcRenderer } from "electron";

// ============ 类型定义 ============

export interface ElectronAPI {
	// 窗口控制
	window: {
		minimize: () => Promise<IPCResponse>;
		maximize: () => Promise<IPCResponse>;
		close: () => Promise<IPCResponse>;
		isMaximized: () => Promise<IPCResponse<boolean>>;
		onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
	};

	// Agent 相关
	agent: {
		createSession: (config: AgentConfig) => Promise<IPCResponse<AgentSession>>;
		sendMessage: (sessionId: string, content: string) => Promise<IPCResponse>;
		getStatus: (sessionId: string) => Promise<IPCResponse<AgentSession>>;
		stopAgent: (sessionId: string) => Promise<IPCResponse>;
		listAgents: () => Promise<IPCResponse<AgentSession[]>>;
		getMessages: (sessionId: string) => Promise<IPCResponse<AgentMessage[]>>;
		clearMessages: (sessionId: string) => Promise<IPCResponse>;
		deleteSession: (sessionId: string) => Promise<IPCResponse>;
		onStreamEvent: (callback: (event: AgentStreamEvent) => void) => () => void;
	};

	// Skill 相关
	skill: {
		listSkills: () => Promise<IPCResponse<SkillManifest[]>>;
		installSkill: (source: string) => Promise<IPCResponse<SkillManifest>>;
		uninstallSkill: (id: string) => Promise<IPCResponse>;
		getSkill: (id: string) => Promise<IPCResponse<SkillManifest>>;
		executeSkill: (
			skillId: string,
			toolName: string,
			input: Record<string, unknown>,
		) => Promise<IPCResponse<SkillExecutionResult>>;
		getAllTools: () => Promise<
			IPCResponse<Array<{ skillId: string; tool: SkillTool }>>
		>;
		enableSkill: (id: string) => Promise<IPCResponse>;
		disableSkill: (id: string) => Promise<IPCResponse>;
		getSystemPrompt: (id: string) => Promise<IPCResponse<string | null>>;
		getCommandPrompt: (
			skillId: string,
			commandName: string,
		) => Promise<IPCResponse<string | null>>;
		validateSkill: (
			source: string,
		) => Promise<IPCResponse<SkillValidationResult>>;
	};

	// MCP 相关
	mcp: {
		// 基础管理
		connect: (id: string) => Promise<IPCResponse<McpServerStatus>>;
		disconnect: (id: string) => Promise<IPCResponse>;
		listServers: () => Promise<IPCResponse<McpServerConfig[]>>;
		getTools: (id: string) => Promise<IPCResponse<McpTool[]>>;
		addServer: (config: McpServerConfig) => Promise<IPCResponse>;
		removeServer: (id: string) => Promise<IPCResponse>;
		updateServer: (
			id: string,
			config: Partial<McpServerConfig>,
		) => Promise<IPCResponse>;
		getAllStatus: () => Promise<IPCResponse<McpServerStatus[]>>;
		callTool: (
			serverId: string,
			toolName: string,
			args: Record<string, unknown>,
		) => Promise<IPCResponse>;
		getAllTools: () => Promise<
			IPCResponse<Array<{ serverId: string; tool: McpTool }>>
		>;
		// 内置 MCP
		builtin: {
			getDefinitions: () => Promise<IPCResponse<BuiltinMcpDefinition[]>>;
			createConfig: (
				definitionId: string,
				config?: Record<string, unknown>,
			) => Promise<IPCResponse<McpServerConfig>>;
			search: (params: {
				keyword?: string;
				tags?: string[];
			}) => Promise<IPCResponse<BuiltinMcpDefinition[]>>;
		};
		// 第三方 MCP
		thirdParty: {
			add: (config: McpServerConfig) => Promise<IPCResponse>;
			proxy: (
				serverId: string,
				request: {
					endpoint: string;
					method: "GET" | "POST" | "PUT" | "DELETE";
					body?: unknown;
					headers?: Record<string, string>;
				},
			) => Promise<IPCResponse>;
		};
		// MCP 市场
		market: {
			search: (params: {
				query?: string;
				tags?: string[];
				sortBy?: "downloads" | "rating" | "newest";
				page?: number;
				limit?: number;
			}) => Promise<
				IPCResponse<{
					items: McpMarketItem[];
					total: number;
					page: number;
					limit: number;
				}>
			>;
			getPopular: (limit?: number) => Promise<IPCResponse<McpMarketItem[]>>;
			getTopRated: (limit?: number) => Promise<IPCResponse<McpMarketItem[]>>;
			getNewest: (limit?: number) => Promise<IPCResponse<McpMarketItem[]>>;
			getDetail: (id: string) => Promise<IPCResponse<McpMarketItem | null>>;
			getTags: () => Promise<IPCResponse<string[]>>;
			install: (
				marketItem: McpMarketItem,
				customConfig?: {
					name?: string;
					env?: Record<string, string>;
					url?: string;
				},
			) => Promise<IPCResponse<McpServerConfig>>;
			getReadme: (marketItem: McpMarketItem) => Promise<IPCResponse<string>>;
			setApiUrl: (url: string) => Promise<IPCResponse>;
		};
	};

	// Chat History API
	chat: {
		listConversations: () => Promise<IPCResponse<ConversationSummary[]>>;
		createConversation: (
			name: string,
		) => Promise<IPCResponse<ConversationSummary>>;
		deleteConversation: (id: string) => Promise<IPCResponse>;
		renameConversation: (
			conversationId: string,
			name: string,
		) => Promise<IPCResponse>;
		getMessages: (
			conversationId: string,
		) => Promise<IPCResponse<ChatMessagePersist[]>>;
		saveMessages: (
			conversationId: string,
			messages: ChatMessagePersist[],
		) => Promise<IPCResponse>;
		appendMessage: (
			conversationId: string,
			message: ChatMessagePersist,
		) => Promise<IPCResponse>;
		updateMessage: (
			conversationId: string,
			messageId: string,
			updates: Partial<ChatMessagePersist>,
		) => Promise<IPCResponse>;
		clearMessages: (conversationId: string) => Promise<IPCResponse>;
		getLastConversation: () => Promise<IPCResponse<string | undefined>>;
		setLastConversation: (id: string) => Promise<IPCResponse>;
		getConversationDir: (id: string) => Promise<IPCResponse<string>>;
		getWorkspaceDir: (id: string) => Promise<IPCResponse<string>>;
	};

	// 主题 API
	theme: {
		get: () => Promise<IPCResponse<string>>;
		set: (mode: string) => Promise<IPCResponse<boolean>>;
		onChange: (callback: (mode: string) => void) => () => void;
	};

	// 搜索配置 API
	search: {
		getConfigs: () => Promise<
			IPCResponse<{
				configs: SearchConfig[];
				defaultProvider?: SearchProviderType;
			}>
		>;
		saveConfig: (config: SearchConfig) => Promise<IPCResponse>;
		deleteConfig: (id: string) => Promise<IPCResponse>;
		setDefault: (provider: SearchProviderType | null) => Promise<IPCResponse>;
		getDefault: () => Promise<IPCResponse<SearchProviderType | undefined>>;
		validateConfig: (
			config: SearchConfig,
		) => Promise<IPCResponse<{ valid: boolean; error?: string }>>;
		execute: (
			request: SearchExecuteRequest,
		) => Promise<IPCResponse<SearchExecuteResponse>>;
	};

	// 文件附件 API
	file: {
		selectFiles: (options?: {
			multiple?: boolean;
			filters?: { name: string; extensions: string[] }[];
		}) => Promise<
			IPCResponse<
				{ path: string; name: string; size: number; mimeType: string }[]
			>
		>;
		readFile: (
			filePath: string,
			options?: { encoding?: BufferEncoding; maxSize?: number },
		) => Promise<IPCResponse<{ content: string; size: number }>>;
		saveAttachment: (data: {
			sourcePath: string;
			conversationId?: string;
			messageId?: string;
			customName?: string;
		}) => Promise<IPCResponse<AttachmentInfo>>;
		deleteAttachment: (attachmentPath: string) => Promise<IPCResponse>;
		listAttachments: (filter?: {
			conversationId?: string;
			messageId?: string;
			type?: string;
		}) => Promise<IPCResponse<{ attachments: AttachmentInfo[] }>>;
		openAttachment: (attachmentPath: string) => Promise<IPCResponse>;
		getAttachmentPath: () => Promise<IPCResponse<string>>;
		copyFile: (filePath: string) => Promise<IPCResponse>;
	};

	// 日志系统 API
	log: {
		query: (params: LogQueryParams) => Promise<LogQueryResult>;
		getStats: () => Promise<LogStats>;
		getModules: () => Promise<string[]>;
		rendererLog: (entry: RendererLogEntry) => Promise<{ success: boolean }>;
		clearDb: () => Promise<{ success: boolean }>;
		exportLogs: (
			params: LogQueryParams,
		) => Promise<{ success: boolean; count?: number; filePath?: string }>;
		openViewer: () => Promise<{ success: boolean }>;
	};

	// Auth API
	auth: {
		login: (provider: "google" | "github") => Promise<IPCResponse<AuthUser>>;
		logout: () => Promise<IPCResponse>;
		getUser: () => Promise<IPCResponse<AuthUser | null>>;
	};

	// Update API
	update: {
		check: () => Promise<{
			updateAvailable: boolean;
			version?: string;
			message: string;
		}>;
		download: () => Promise<IPCResponse>;
		install: () => Promise<void>;
		onChecking: (callback: () => void) => () => void;
		onAvailable: (callback: (info: unknown) => void) => () => void;
		onNotAvailable: (callback: (info: unknown) => void) => () => void;
		onProgress: (
			callback: (progress: {
				percent: number;
				bytesPerSecond: number;
				transferred: number;
				total: number;
			}) => void,
		) => () => void;
		onDownloaded: (callback: (info: unknown) => void) => () => void;
		onError: (callback: (error: string) => void) => () => void;
	};

	// Model Provider API
	model: {
		listProviders: () => Promise<IPCResponse<ModelProvider[]>>;
		getProvider: (id: string) => Promise<IPCResponse<ModelProvider>>;
		saveProvider: (provider: ModelProvider) => Promise<IPCResponse>;
		deleteProvider: (id: string) => Promise<IPCResponse>;
		testConnection: (
			baseUrl: string,
			apiKey: string,
		) => Promise<IPCResponse<TestConnectionResponse>>;
		fetchModels: (
			baseUrl: string,
			apiKey: string,
			preset?: ModelProviderPreset,
		) => Promise<IPCResponse<FetchModelsResponse>>;
		updateModelConfig: (
			providerId: string,
			modelId: string,
			config: Partial<ProviderModel>,
		) => Promise<IPCResponse>;
		getActiveModel: () => Promise<
			IPCResponse<ActiveModelSelection | undefined>
		>;
		setActiveModel: (
			selection: ActiveModelSelection | null,
		) => Promise<IPCResponse>;
	};

	// LLM API
	llm: {
		chatCompletion: (request: {
			requestId: string;
			baseUrl: string;
			apiKey: string;
			model: string;
			messages: Array<
				| { role: "user" | "assistant" | "system"; content: string }
				| {
						role: "assistant";
						content: null;
						tool_calls: Array<{
							id: string;
							type: "function";
							function: { name: string; arguments: string };
						}>;
				  }
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
			toolPermission?: {
				mode: "none" | "auto" | "approve_always" | "approve_except_authorized";
				authorizedTools?: string[];
			};
			providerPreset?: string;
			extraParams?: Record<string, unknown>;
			conversationId?: string;
			toolTimeout?: number;
		}) => Promise<IPCResponse>;
		stopStream: (requestId: string) => Promise<IPCResponse>;
		toolApprovalResponse: (
			toolCallId: string,
			approved: boolean,
		) => Promise<IPCResponse>;
		onStreamEvent: (callback: (event: ChatStreamEvent) => void) => () => void;
	};

	// 皮肤 API
	skin: {
		getActiveSkin: () => Promise<
			IPCResponse<{ pluginId: string; themeId: string } | null>
		>;
		setActiveSkin: (
			pluginId: string | null,
			themeId?: string,
		) => Promise<IPCResponse>;
		onTokensChanged: (
			callback: (tokens: Record<string, unknown> | null) => void,
		) => () => void;
	};

	// Markdown 主题 API
	markdownTheme: {
		getActive: () => Promise<
			IPCResponse<{ pluginId: string; themeId: string } | null>
		>;
		setActive: (
			pluginId: string | null,
			themeId?: string,
		) => Promise<IPCResponse>;
		getCSS: () => Promise<IPCResponse<string | null>>;
		onCSSChanged: (callback: (css: string | null) => void) => () => void;
	};

	// 插件扩展 API
	plugin: {
		grantPermissions: (
			pluginId: string,
			permissions: string[],
		) => Promise<IPCResponse>;
		getPermissions: (pluginId: string) => Promise<IPCResponse<string[]>>;
		getUIContributions: () => Promise<IPCResponse<unknown>>;
		getPluginPageHTML: (
			pluginId: string,
			pagePath: string,
		) => Promise<IPCResponse<{ html: string; title?: string }>>;
		installDev: (sourcePath: string) => Promise<IPCResponse>;
		reloadDev: (pluginId: string) => Promise<IPCResponse>;
		checkUpdates: () => Promise<
			IPCResponse<
				Array<{
					pluginId: string;
					currentVersion: string;
					newVersion: string;
				}>
			>
		>;
		updatePlugin: (pluginId: string) => Promise<IPCResponse>;
		onUIContributionsChanged: (
			callback: (contributions: unknown) => void,
		) => () => void;
		onShowMessage: (
			callback: (data: {
				type: string;
				message: string;
				items: string[];
				pluginId: string;
				responseChannel: string;
			}) => void,
		) => () => void;
		onShowInputBox: (
			callback: (data: {
				options: unknown;
				pluginId: string;
				responseChannel: string;
			}) => void,
		) => () => void;
		onShowQuickPick: (
			callback: (data: {
				items: unknown[];
				options: unknown;
				pluginId: string;
				responseChannel: string;
			}) => void,
		) => () => void;
	};

	// IM Bot API
	imbot: {
		listBots: () => Promise<IPCResponse<BotStatus[]>>;
		startBot: (config: IMBotConfig) => Promise<IPCResponse<void>>;
		stopBot: (botId: string) => Promise<IPCResponse<void>>;
		getBotStatus: (botId: string) => Promise<IPCResponse<BotStatus | null>>;
		sendMessage: (
			botId: string,
			chatId: string,
			content: string,
		) => Promise<IPCResponse<void>>;
	};

	// Remote Device API
	remoteDevice: {
		listDevices: () => Promise<IPCResponse<RemoteDevice[]>>;
		registerDevice: (req: {
			name: string;
			platform: "linux" | "windows" | "macos";
			tags?: string[];
			description?: string;
		}) => Promise<IPCResponse<RemoteDevice>>;
		removeDevice: (deviceId: string) => Promise<IPCResponse<boolean>>;
		getDevice: (deviceId: string) => Promise<IPCResponse<RemoteDevice | null>>;
		executeCommand: (
			deviceId: string,
			command: string,
			timeout?: number,
		) => Promise<IPCResponse<CommandResult>>;
		onCommandOutput: (
			callback: (data: {
				requestId: string;
				deviceId: string;
				stream: "stdout" | "stderr";
				data: string;
			}) => void,
		) => () => void;
		killCommand: (
			deviceId: string,
			requestId: string,
		) => Promise<IPCResponse>;
		tabComplete: (
			deviceId: string,
			line: string,
			cursorPos: number,
		) => Promise<IPCResponse<{ matches: string[]; wordStart: number }>>;
		getCwd: (deviceId: string) => Promise<IPCResponse<string>>;
		getRelayConfig: () => Promise<IPCResponse<RelayConfig | null>>;
		setRelayConfig: (config: RelayConfig) => Promise<IPCResponse>;
	};

	// Remote Control Events API
	remoteControl: {
		getEvents: () => Promise<IPCResponse<RemoteControlEvent[]>>;
		clearEvents: () => Promise<IPCResponse<void>>;
		getConnectionInfo: () => Promise<IPCResponse<DeviceConnectionInfo>>;
		onNewEvent: (callback: (event: RemoteControlEvent) => void) => () => void;
	};

	// Remote Chat Bridge API
	remoteChat: {
		bind: (
			conversationId: string,
			botId: string,
			chatId: string,
		) => Promise<IPCResponse<RemoteBinding>>;
		unbind: (conversationId: string) => Promise<IPCResponse<void>>;
		getBinding: (
			conversationId: string,
		) => Promise<IPCResponse<RemoteBinding | null>>;
		checkBotOnline: (botId: string) => Promise<IPCResponse<boolean>>;
		sendMessage: (
			conversationId: string,
			content: string,
		) => Promise<IPCResponse<void>>;
		getRemoteMessages: (
			conversationId: string,
		) => Promise<IPCResponse<RemoteChatMessage[]>>;
		onIMMessage: (callback: (message: RemoteIMMessage) => void) => () => void;
	};

	// Webhook API
	webhook: {
		getConfigs: () => Promise<IPCResponse<WebhookConfig[]>>;
		saveConfig: (config: WebhookConfig) => Promise<IPCResponse>;
		deleteConfig: (id: string) => Promise<IPCResponse>;
		test: (configId: string) => Promise<IPCResponse<WebhookTestResult>>;
	};

	// App Config API
	appConfig: {
		getConfig: () => Promise<IPCResponse<AppInitConfig | null>>;
		refresh: () => Promise<IPCResponse<AppInitConfig | null>>;
		onConfigUpdated: (callback: (config: AppInitConfig) => void) => () => void;
	};

	// 系统信息 API
	system: {
		getHomedir: () => Promise<IPCResponse<string>>;
		getEnvInfo: () => Promise<
			IPCResponse<{
				os: string;
				platform: string;
				arch: string;
				nodeVersion: string;
				electronVersion: string;
				v8Version: string;
				homedir: string;
				cwd: string;
				appVersion: string;
				locale: string;
			}>
		>;
		getProcessMetrics: () => Promise<
			IPCResponse<{
				heapUsed: number;
				heapTotal: number;
				rss: number;
				systemTotal: number;
				systemFree: number;
				cpuCores: number;
				cpuModel: string;
				cpuUser: number;
				cpuSystem: number;
				uptime: number;
				pid: number;
			}>
		>;
	};

	// 通用 IPC
	ipc: {
		on: (channel: string, listener: (...args: unknown[]) => void) => void;
		off: (channel: string, listener: (...args: unknown[]) => void) => void;
		send: (channel: string, ...args: unknown[]) => void;
		invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
	};
}

// ============ 类型导入（从主进程共享） ============

export interface AgentConfig {
	apiKey: string;
	model: string;
	maxTokens?: number;
	systemPrompt?: string;
	tools?: any[];
}

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
	systemPrompt?: string;
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

export type ValidationSeverity = "error" | "warning";
export type ValidationCategory =
	| "structural"
	| "content"
	| "compatibility"
	| "security";

export interface ValidationIssue {
	code: string;
	severity: ValidationSeverity;
	category: ValidationCategory;
	messageKey: string;
	messageParams?: Record<string, string | number>;
	fallbackMessage: string;
}

export interface SkillValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
	errorCount: number;
	warningCount: number;
	manifest: SkillManifest | null;
}

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
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
	readmeUrl?: string;
	repositoryUrl?: string;
	license?: string;
	createdAt?: string;
	updatedAt?: string;
}

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

export type SearchProviderType =
	| "zhipu"
	| "tavily"
	| "searxng"
	| "exa"
	| "exa_mcp"
	| "bocha"
	| "sogou"
	| "google"
	| "bing"
	| "baidu";

export interface SearchConfig {
	id: string;
	provider: SearchProviderType;
	name: string;
	apiKey: string;
	apiUrl?: string;
	enabled: boolean;
	isDefault?: boolean;
	config?: Record<string, unknown>;
}

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

export interface AuthUser {
	id: string;
	name: string;
	email?: string;
	avatar?: string;
	provider: "google" | "github";
}

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

export interface TestConnectionResponse {
	success: boolean;
	latencyMs: number;
	error?: string;
}

export interface FetchModelsResponse {
	models: ProviderModel[];
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

export interface IPCResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

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
		status: "pending" | "success" | "error";
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
	};
}

export interface ConversationSummary {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	preview: string;
}

export interface AttachmentInfo {
	id: string;
	name: string;
	originalName: string;
	path: string;
	size: number;
	mimeType: string;
	type: "image" | "document" | "code" | "audio" | "video" | "archive" | "other";
	createdAt: string;
	conversationId?: string;
	messageId?: string;
	thumbnailPath?: string;
}

// ============ IM Bot 相关类型 ============

export interface IMBotConfig {
	id: string;
	type: "dingtalk" | "lark" | "telegram";
	name: string;
	enabled: boolean;
	telegram?: {
		botToken: string;
		chatId?: string;
	};
	allowedUsers?: string[];
	allowedGroups?: string[];
	adminUsers?: string[];
}

export interface BotStatus {
	id: string;
	name: string;
	type: "dingtalk" | "lark" | "telegram";
	status: "running" | "stopped" | "error";
	lastError?: string;
	startedAt?: number;
}

// ============ Remote Device 相关类型 ============

export interface RemoteDevice {
	id: string;
	name: string;
	platform: "linux" | "windows" | "macos";
	ipAddress?: string;
	authentication: {
		token: string;
	};
	status: "online" | "offline" | "error";
	lastSeen?: number;
	tags?: string[];
	description?: string;
	createdAt: number;
}

export interface CommandResult {
	requestId: string;
	deviceId: string;
	stdout: string;
	stderr: string;
	exitCode: number;
	duration: number;
}

// ============ Remote Control Event 类型 ============

export type RemoteControlEventType =
	| "im_message_received"
	| "im_message_sent"
	| "device_command_sent"
	| "device_command_result"
	| "device_online"
	| "device_offline";

export type RemoteControlEventDirection = "incoming" | "outgoing" | "system";

export type RemoteControlEventSourceKind = "bot" | "device";

export interface RemoteControlEvent {
	id: string;
	type: RemoteControlEventType;
	direction: RemoteControlEventDirection;
	source: {
		kind: RemoteControlEventSourceKind;
		id: string;
		name: string;
	};
	content: string;
	timestamp: number;
}

export interface DeviceConnectionInfo {
	wsPort: number;
	localIPs: string[];
}

export type RemoteDeviceMode = "local" | "relay";

export interface RelayConfig {
	mode: RemoteDeviceMode;
	relayUrl?: string;
	relayKey?: string;
}

// ============ Remote Chat Bridge 类型 ============

export type IMPlatform = "dingtalk" | "lark" | "telegram";

export interface RemoteBinding {
	botId: string;
	chatId: string;
	botName: string;
	platform: IMPlatform;
	boundAt: number;
}

export interface RemoteIMMessage {
	conversationId: string;
	content: string;
	sender: { id: string; name: string };
	platform: IMPlatform;
	chatId: string;
	timestamp: number;
}

export interface RemoteChatMessage {
	id: string;
	direction: "incoming" | "outgoing";
	content: string;
	sender: { id: string; name: string };
	platform: IMPlatform;
	timestamp: number;
}

// ============ Webhook 相关类型 ============

export type WebhookType = "dingtalk" | "feishu" | "custom";

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
}

export interface WebhookTestResult {
	success: boolean;
	statusCode?: number;
	message: string;
}

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

// ============ 实现 ============

const electronAPI: ElectronAPI = {
	// Window API
	window: {
		minimize: () => ipcRenderer.invoke("window:minimize"),
		maximize: () => ipcRenderer.invoke("window:maximize"),
		close: () => ipcRenderer.invoke("window:close"),
		isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
		onMaximizeChange: (callback) => {
			const listener = (_event: unknown, isMaximized: boolean) =>
				callback(isMaximized);
			ipcRenderer.on("window:on-maximize-change", listener);
			return () => ipcRenderer.off("window:on-maximize-change", listener);
		},
	},

	// Agent API
	agent: {
		createSession: (config) =>
			ipcRenderer.invoke("agent:create-session", config),
		sendMessage: (sessionId, content) =>
			ipcRenderer.invoke("agent:send-message", sessionId, content),
		getStatus: (sessionId) => ipcRenderer.invoke("agent:get-status", sessionId),
		stopAgent: (sessionId) => ipcRenderer.invoke("agent:stop-agent", sessionId),
		listAgents: () => ipcRenderer.invoke("agent:list-agents"),
		getMessages: (sessionId) =>
			ipcRenderer.invoke("agent:get-messages", sessionId),
		clearMessages: (sessionId) =>
			ipcRenderer.invoke("agent:clear-messages", sessionId),
		deleteSession: (sessionId) =>
			ipcRenderer.invoke("agent:delete-session", sessionId),
		onStreamEvent: (callback) => {
			const listener = (_event: unknown, data: AgentStreamEvent) =>
				callback(data);
			ipcRenderer.on("agent:stream-event", listener);
			return () => ipcRenderer.off("agent:stream-event", listener);
		},
	},

	// Skill API
	skill: {
		listSkills: () => ipcRenderer.invoke("skill:list"),
		installSkill: (source) => ipcRenderer.invoke("skill:install", source),
		uninstallSkill: (id) => ipcRenderer.invoke("skill:uninstall", id),
		getSkill: (id) => ipcRenderer.invoke("skill:get", id),
		executeSkill: (skillId, toolName, input) =>
			ipcRenderer.invoke("skill:execute", skillId, toolName, input),
		getAllTools: () => ipcRenderer.invoke("skill:get-all-tools"),
		enableSkill: (id) => ipcRenderer.invoke("skill:enable", id),
		disableSkill: (id) => ipcRenderer.invoke("skill:disable", id),
		getSystemPrompt: (id) => ipcRenderer.invoke("skill:get-system-prompt", id),
		getCommandPrompt: (skillId, commandName) =>
			ipcRenderer.invoke("skill:get-command-prompt", skillId, commandName),
		validateSkill: (source) =>
			ipcRenderer.invoke("skill:validate-skill", source),
	},

	// MCP API
	mcp: {
		// 基础管理
		connect: (id) => ipcRenderer.invoke("mcp:connect", id),
		disconnect: (id) => ipcRenderer.invoke("mcp:disconnect", id),
		listServers: () => ipcRenderer.invoke("mcp:list-servers"),
		getTools: (id) => ipcRenderer.invoke("mcp:get-tools", id),
		addServer: (config) => ipcRenderer.invoke("mcp:add-server", config),
		removeServer: (id) => ipcRenderer.invoke("mcp:remove-server", id),
		updateServer: (id, config) =>
			ipcRenderer.invoke("mcp:update-server", { id, config }),
		getAllStatus: () => ipcRenderer.invoke("mcp:get-all-status"),
		callTool: (serverId, toolName, args) =>
			ipcRenderer.invoke("mcp:call-tool", serverId, toolName, args),
		getAllTools: () => ipcRenderer.invoke("mcp:get-all-tools"),
		// 内置 MCP
		builtin: {
			getDefinitions: () => ipcRenderer.invoke("mcp:builtin:get-definitions"),
			createConfig: (definitionId, config) =>
				ipcRenderer.invoke("mcp:builtin:create-config", {
					definitionId,
					config,
				}),
			search: (params) => ipcRenderer.invoke("mcp:builtin:search", params),
		},
		// 第三方 MCP
		thirdParty: {
			add: (config) => ipcRenderer.invoke("mcp:thirdparty:add", config),
			proxy: (serverId, request) =>
				ipcRenderer.invoke("mcp:thirdparty:proxy", { serverId, request }),
		},
		// MCP 市场
		market: {
			search: (params) => ipcRenderer.invoke("mcp:market:search", params),
			getPopular: (limit) => ipcRenderer.invoke("mcp:market:popular", limit),
			getTopRated: (limit) => ipcRenderer.invoke("mcp:market:top-rated", limit),
			getNewest: (limit) => ipcRenderer.invoke("mcp:market:newest", limit),
			getDetail: (id) => ipcRenderer.invoke("mcp:market:get-detail", id),
			getTags: () => ipcRenderer.invoke("mcp:market:get-tags"),
			install: (marketItem, customConfig) =>
				ipcRenderer.invoke("mcp:market:install", { marketItem, customConfig }),
			getReadme: (marketItem) =>
				ipcRenderer.invoke("mcp:market:get-readme", marketItem),
			setApiUrl: (url) => ipcRenderer.invoke("mcp:market:set-api-url", url),
		},
	},

	// Chat History API
	chat: {
		listConversations: () => ipcRenderer.invoke("chat:list-conversations"),
		createConversation: (name: string) =>
			ipcRenderer.invoke("chat:create-conversation", name),
		deleteConversation: (id: string) =>
			ipcRenderer.invoke("chat:delete-conversation", id),
		renameConversation: (conversationId: string, name: string) =>
			ipcRenderer.invoke("chat:rename-conversation", { conversationId, name }),
		getMessages: (conversationId: string) =>
			ipcRenderer.invoke("chat:get-messages", conversationId),
		saveMessages: (conversationId: string, messages: ChatMessagePersist[]) =>
			ipcRenderer.invoke("chat:save-messages", { conversationId, messages }),
		appendMessage: (conversationId: string, message: ChatMessagePersist) =>
			ipcRenderer.invoke("chat:append-message", { conversationId, message }),
		updateMessage: (
			conversationId: string,
			messageId: string,
			updates: Partial<ChatMessagePersist>,
		) =>
			ipcRenderer.invoke("chat:update-message", {
				conversationId,
				messageId,
				updates,
			}),
		clearMessages: (conversationId: string) =>
			ipcRenderer.invoke("chat:clear-messages", conversationId),
		getLastConversation: () => ipcRenderer.invoke("chat:get-last-conversation"),
		setLastConversation: (id: string) =>
			ipcRenderer.invoke("chat:set-last-conversation", id),
		getConversationDir: (id: string) =>
			ipcRenderer.invoke("chat:get-conversation-dir", id),
		getWorkspaceDir: (id: string) =>
			ipcRenderer.invoke("chat:get-workspace-dir", id),
	},

	// 主题 API
	theme: {
		get: () => ipcRenderer.invoke("theme:get"),
		set: (mode: string) => ipcRenderer.invoke("theme:set", mode),
		onChange: (callback: (mode: string) => void) => {
			const listener = (_event: unknown, mode: string) => callback(mode);
			ipcRenderer.on("theme:on-change", listener);
			return () => ipcRenderer.off("theme:on-change", listener);
		},
	},

	// 搜索配置 API
	search: {
		getConfigs: () => ipcRenderer.invoke("search:get-configs"),
		saveConfig: (config: SearchConfig) =>
			ipcRenderer.invoke("search:save-config", config),
		deleteConfig: (id: string) =>
			ipcRenderer.invoke("search:delete-config", id),
		setDefault: (provider: SearchProviderType | null) =>
			ipcRenderer.invoke("search:set-default", provider),
		getDefault: () => ipcRenderer.invoke("search:get-default"),
		validateConfig: (config: SearchConfig) =>
			ipcRenderer.invoke("search:validate-config", config),
		execute: (request: SearchExecuteRequest) =>
			ipcRenderer.invoke("search:execute", request),
	},

	// 文件附件 API
	file: {
		selectFiles: (options) => ipcRenderer.invoke("file:select-files", options),
		readFile: (filePath, options) =>
			ipcRenderer.invoke("file:read-file", filePath, options),
		saveAttachment: (data) => ipcRenderer.invoke("file:save-attachment", data),
		deleteAttachment: (attachmentPath) =>
			ipcRenderer.invoke("file:delete-attachment", attachmentPath),
		listAttachments: (filter) =>
			ipcRenderer.invoke("file:list-attachments", filter),
		openAttachment: (attachmentPath) =>
			ipcRenderer.invoke("file:open-attachment", attachmentPath),
		getAttachmentPath: () => ipcRenderer.invoke("file:get-attachment-path"),
		copyFile: (filePath) => ipcRenderer.invoke("file:copy-file", filePath),
	},

	// 日志系统 API
	log: {
		query: (params) => ipcRenderer.invoke("log:query", params),
		getStats: () => ipcRenderer.invoke("log:get-stats"),
		getModules: () => ipcRenderer.invoke("log:get-modules"),
		rendererLog: (entry) => ipcRenderer.invoke("log:renderer-log", entry),
		clearDb: () => ipcRenderer.invoke("log:clear-db"),
		exportLogs: (params) => ipcRenderer.invoke("log:export", params),
		openViewer: () => ipcRenderer.invoke("log:open-viewer"),
	},

	// Auth API
	auth: {
		login: (provider: "google" | "github") =>
			ipcRenderer.invoke("auth:login", provider),
		logout: () => ipcRenderer.invoke("auth:logout"),
		getUser: () => ipcRenderer.invoke("auth:get-user"),
	},

	// Update API
	update: {
		check: () => ipcRenderer.invoke("app:check-update"),
		download: () => ipcRenderer.invoke("update:download"),
		install: () => ipcRenderer.invoke("update:install"),
		onChecking: (callback: () => void) => {
			const listener = () => callback();
			ipcRenderer.on("update:checking", listener);
			return () => ipcRenderer.off("update:checking", listener);
		},
		onAvailable: (callback: (info: unknown) => void) => {
			const listener = (_event: unknown, info: unknown) => callback(info);
			ipcRenderer.on("update:available", listener);
			return () => ipcRenderer.off("update:available", listener);
		},
		onNotAvailable: (callback: (info: unknown) => void) => {
			const listener = (_event: unknown, info: unknown) => callback(info);
			ipcRenderer.on("update:not-available", listener);
			return () => ipcRenderer.off("update:not-available", listener);
		},
		onProgress: (
			callback: (progress: {
				percent: number;
				bytesPerSecond: number;
				transferred: number;
				total: number;
			}) => void,
		) => {
			const listener = (
				_event: unknown,
				progress: {
					percent: number;
					bytesPerSecond: number;
					transferred: number;
					total: number;
				},
			) => callback(progress);
			ipcRenderer.on("update:progress", listener);
			return () => ipcRenderer.off("update:progress", listener);
		},
		onDownloaded: (callback: (info: unknown) => void) => {
			const listener = (_event: unknown, info: unknown) => callback(info);
			ipcRenderer.on("update:downloaded", listener);
			return () => ipcRenderer.off("update:downloaded", listener);
		},
		onError: (callback: (error: string) => void) => {
			const listener = (_event: unknown, error: string) => callback(error);
			ipcRenderer.on("update:error", listener);
			return () => ipcRenderer.off("update:error", listener);
		},
	},

	// Model Provider API
	model: {
		listProviders: () => ipcRenderer.invoke("model:list-providers"),
		getProvider: (id: string) => ipcRenderer.invoke("model:get-provider", id),
		saveProvider: (provider: ModelProvider) =>
			ipcRenderer.invoke("model:save-provider", provider),
		deleteProvider: (id: string) =>
			ipcRenderer.invoke("model:delete-provider", id),
		testConnection: (baseUrl: string, apiKey: string) =>
			ipcRenderer.invoke("model:test-connection", { baseUrl, apiKey }),
		fetchModels: (
			baseUrl: string,
			apiKey: string,
			preset?: ModelProviderPreset,
		) => ipcRenderer.invoke("model:fetch-models", { baseUrl, apiKey, preset }),
		updateModelConfig: (
			providerId: string,
			modelId: string,
			config: Partial<ProviderModel>,
		) =>
			ipcRenderer.invoke("model:update-model-config", {
				providerId,
				modelId,
				config,
			}),
		getActiveModel: () => ipcRenderer.invoke("model:get-active-model"),
		setActiveModel: (selection: ActiveModelSelection | null) =>
			ipcRenderer.invoke("model:set-active-model", selection),
	},

	// LLM API
	llm: {
		chatCompletion: (request) =>
			ipcRenderer.invoke("llm:chat-completion", request),
		stopStream: (requestId: string) =>
			ipcRenderer.invoke("llm:stop-stream", requestId),
		toolApprovalResponse: (toolCallId: string, approved: boolean) =>
			ipcRenderer.invoke("llm:tool-approval-response", toolCallId, approved),
		onStreamEvent: (callback: (event: ChatStreamEvent) => void) => {
			const listener = (_event: unknown, data: ChatStreamEvent) =>
				callback(data);
			ipcRenderer.on("llm:stream-event", listener);
			return () => ipcRenderer.off("llm:stream-event", listener);
		},
	},

	// 皮肤 API
	skin: {
		getActiveSkin: () => ipcRenderer.invoke("plugin:getActiveSkin"),
		setActiveSkin: (pluginId: string | null, themeId?: string) =>
			ipcRenderer.invoke("plugin:setActiveSkin", { pluginId, themeId }),
		onTokensChanged: (
			callback: (tokens: Record<string, unknown> | null) => void,
		) => {
			const listener = (
				_event: unknown,
				tokens: Record<string, unknown> | null,
			) => callback(tokens);
			ipcRenderer.on("skin:tokens-changed", listener);
			return () => ipcRenderer.off("skin:tokens-changed", listener);
		},
	},

	// Markdown 主题 API
	markdownTheme: {
		getActive: () => ipcRenderer.invoke("plugin:getActiveMarkdownTheme"),
		setActive: (pluginId: string | null, themeId?: string) =>
			ipcRenderer.invoke("plugin:setActiveMarkdownTheme", {
				pluginId,
				themeId,
			}),
		getCSS: () => ipcRenderer.invoke("plugin:getMarkdownThemeCSS"),
		onCSSChanged: (callback: (css: string | null) => void) => {
			const listener = (_event: unknown, css: string | null) => callback(css);
			ipcRenderer.on("markdown-theme:css-changed", listener);
			return () => ipcRenderer.off("markdown-theme:css-changed", listener);
		},
	},

	// 插件扩展 API
	plugin: {
		grantPermissions: (pluginId: string, permissions: string[]) =>
			ipcRenderer.invoke("plugin:grantPermissions", {
				pluginId,
				permissions,
			}),
		getPermissions: (pluginId: string) =>
			ipcRenderer.invoke("plugin:getPermissions", { pluginId }),
		getUIContributions: () => ipcRenderer.invoke("plugin:getUIContributions"),
		getPluginPageHTML: (pluginId: string, pagePath: string) =>
			ipcRenderer.invoke("plugin:getPluginPageHTML", {
				pluginId,
				pagePath,
			}),
		installDev: (sourcePath: string) =>
			ipcRenderer.invoke("plugin:installDev", { sourcePath }),
		reloadDev: (pluginId: string) =>
			ipcRenderer.invoke("plugin:reloadDev", { pluginId }),
		checkUpdates: () => ipcRenderer.invoke("plugin:checkUpdates"),
		updatePlugin: (pluginId: string) =>
			ipcRenderer.invoke("plugin:updatePlugin", { pluginId }),
		onUIContributionsChanged: (callback: (contributions: unknown) => void) => {
			const listener = (_event: unknown, contributions: unknown) =>
				callback(contributions);
			ipcRenderer.on("plugin:ui-contributions-changed", listener);
			return () => ipcRenderer.off("plugin:ui-contributions-changed", listener);
		},
		onShowMessage: (
			callback: (data: {
				type: string;
				message: string;
				items: string[];
				pluginId: string;
				responseChannel: string;
			}) => void,
		) => {
			const listener = (
				_event: unknown,
				data: {
					type: string;
					message: string;
					items: string[];
					pluginId: string;
					responseChannel: string;
				},
			) => callback(data);
			ipcRenderer.on("plugin:showMessage", listener);
			return () => ipcRenderer.off("plugin:showMessage", listener);
		},
		onShowInputBox: (
			callback: (data: {
				options: unknown;
				pluginId: string;
				responseChannel: string;
			}) => void,
		) => {
			const listener = (
				_event: unknown,
				data: {
					options: unknown;
					pluginId: string;
					responseChannel: string;
				},
			) => callback(data);
			ipcRenderer.on("plugin:showInputBox", listener);
			return () => ipcRenderer.off("plugin:showInputBox", listener);
		},
		onShowQuickPick: (
			callback: (data: {
				items: unknown[];
				options: unknown;
				pluginId: string;
				responseChannel: string;
			}) => void,
		) => {
			const listener = (
				_event: unknown,
				data: {
					items: unknown[];
					options: unknown;
					pluginId: string;
					responseChannel: string;
				},
			) => callback(data);
			ipcRenderer.on("plugin:showQuickPick", listener);
			return () => ipcRenderer.off("plugin:showQuickPick", listener);
		},
	},

	// IM Bot API
	imbot: {
		listBots: () => ipcRenderer.invoke("imbot:list"),
		startBot: (config) =>
			ipcRenderer.invoke("imbot:start", { payload: { config } }),
		stopBot: (botId) =>
			ipcRenderer.invoke("imbot:stop", { payload: { botId } }),
		getBotStatus: (botId) =>
			ipcRenderer.invoke("imbot:get-status", { payload: { botId } }),
		sendMessage: (botId, chatId, content) =>
			ipcRenderer.invoke("imbot:send-message", {
				payload: { botId, chatId, content },
			}),
	},

	// Remote Device API
	remoteDevice: {
		listDevices: () => ipcRenderer.invoke("remote-device:list"),
		registerDevice: (req) =>
			ipcRenderer.invoke("remote-device:register", { payload: req }),
		removeDevice: (deviceId) =>
			ipcRenderer.invoke("remote-device:remove", { payload: { deviceId } }),
		getDevice: (deviceId) =>
			ipcRenderer.invoke("remote-device:get", { payload: { deviceId } }),
		executeCommand: (deviceId, command, timeout) =>
			ipcRenderer.invoke("remote-device:execute-command", {
				payload: { deviceId, command, timeout },
			}),
		onCommandOutput: (
			callback: (data: {
				requestId: string;
				deviceId: string;
				stream: "stdout" | "stderr";
				data: string;
			}) => void,
		) => {
			const listener = (
				_event: unknown,
				data: {
					requestId: string;
					deviceId: string;
					stream: "stdout" | "stderr";
					data: string;
				},
			) => callback(data);
			ipcRenderer.on("remote-device:command-output", listener);
			return () =>
				ipcRenderer.off("remote-device:command-output", listener);
		},
		killCommand: (deviceId: string, requestId: string) =>
			ipcRenderer.invoke("remote-device:kill-command", {
				payload: { deviceId, requestId },
			}),
		tabComplete: (deviceId: string, line: string, cursorPos: number) =>
			ipcRenderer.invoke("remote-device:tab-complete", {
				payload: { deviceId, line, cursorPos },
			}),
		getCwd: (deviceId: string) =>
			ipcRenderer.invoke("remote-device:get-cwd", {
				payload: { deviceId },
			}),
		getRelayConfig: () =>
			ipcRenderer.invoke("remote-device:get-relay-config"),
		setRelayConfig: (config: RelayConfig) =>
			ipcRenderer.invoke("remote-device:set-relay-config", {
				payload: config,
			}),
	},

	// Remote Control Events API
	remoteControl: {
		getEvents: () => ipcRenderer.invoke("remote-control:get-events"),
		clearEvents: () => ipcRenderer.invoke("remote-control:clear-events"),
		getConnectionInfo: () =>
			ipcRenderer.invoke("remote-control:get-connection-info"),
		onNewEvent: (callback: (event: RemoteControlEvent) => void) => {
			const listener = (_event: unknown, data: RemoteControlEvent) =>
				callback(data);
			ipcRenderer.on("remote-control:new-event", listener);
			return () => ipcRenderer.off("remote-control:new-event", listener);
		},
	},

	// Remote Chat Bridge API
	remoteChat: {
		bind: (conversationId: string, botId: string, chatId: string) =>
			ipcRenderer.invoke("remote-chat:bind", {
				payload: { conversationId, botId, chatId },
			}),
		unbind: (conversationId: string) =>
			ipcRenderer.invoke("remote-chat:unbind", {
				payload: { conversationId },
			}),
		getBinding: (conversationId: string) =>
			ipcRenderer.invoke("remote-chat:get-binding", {
				payload: { conversationId },
			}),
		checkBotOnline: (botId: string) =>
			ipcRenderer.invoke("remote-chat:check-bot-online", {
				payload: { botId },
			}),
		sendMessage: (conversationId: string, content: string) =>
			ipcRenderer.invoke("remote-chat:send-message", {
				payload: { conversationId, content },
			}),
		getRemoteMessages: (conversationId: string) =>
			ipcRenderer.invoke("remote-chat:get-remote-messages", {
				payload: { conversationId },
			}),
		onIMMessage: (callback: (message: RemoteIMMessage) => void) => {
			const listener = (_event: unknown, data: RemoteIMMessage) =>
				callback(data);
			ipcRenderer.on("remote-chat:im-message", listener);
			return () => ipcRenderer.off("remote-chat:im-message", listener);
		},
	},

	// Webhook API
	webhook: {
		getConfigs: () => ipcRenderer.invoke("webhook:get-configs"),
		saveConfig: (config: WebhookConfig) =>
			ipcRenderer.invoke("webhook:save-config", config),
		deleteConfig: (id: string) =>
			ipcRenderer.invoke("webhook:delete-config", id),
		test: (configId: string) => ipcRenderer.invoke("webhook:test", configId),
	},

	// App Config API
	appConfig: {
		getConfig: () => ipcRenderer.invoke("app-config:get-config"),
		refresh: () => ipcRenderer.invoke("app-config:refresh"),
		onConfigUpdated: (callback) => {
			const listener = (_event: unknown, config: AppInitConfig) =>
				callback(config);
			ipcRenderer.on("app-config:config-updated", listener);
			return () => ipcRenderer.off("app-config:config-updated", listener);
		},
	},

	// 系统信息 API
	system: {
		getHomedir: () => ipcRenderer.invoke("system:get-homedir"),
		getEnvInfo: () => ipcRenderer.invoke("system:get-env-info"),
		getProcessMetrics: () => ipcRenderer.invoke("system:get-process-metrics"),
	},

	// 通用 IPC
	ipc: {
		on: (channel, listener) =>
			ipcRenderer.on(channel, (event, ...args) => listener(event, ...args)),
		off: (channel, listener) => ipcRenderer.off(channel, listener),
		send: (channel, ...args) => ipcRenderer.send(channel, ...args),
		invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
	},
};

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld("electron", electronAPI);

// 类型声明
declare global {
	interface Window {
		electron: ElectronAPI;
	}
}
