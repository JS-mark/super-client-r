/**
 * Electron Preload 脚本
 * 通过 contextBridge 安全地暴露 IPC 功能到渲染进程
 */

import { contextBridge, ipcRenderer } from "electron";
import { createBridge } from "./bridge";

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
			options?: CreateConversationOptions,
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
		updateConversationMetadata: (
			id: string,
			updates: Partial<ConversationSummary>,
		) => Promise<IPCResponse>;
	};

	// Workspace Runtime API
	workspaceRuntime: {
		listConfigs: () => Promise<IPCResponse<WorkspaceConfig[]>>;
		getConfig: (id: string) => Promise<IPCResponse<WorkspaceConfig | null>>;
		saveConfig: (
			config: WorkspaceConfig,
		) => Promise<IPCResponse<WorkspaceConfig>>;
		deleteConfig: (id: string) => Promise<IPCResponse<boolean>>;
		getCurrentId: () => Promise<IPCResponse<string>>;
		setCurrentId: (id: string) => Promise<IPCResponse<string>>;
		getDefaultId: () => Promise<IPCResponse<string>>;
		setDefaultId: (id: string) => Promise<IPCResponse<string>>;
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

	// Agent SDK API
	agentSDK: {
		createQuery: (
			requestId: string,
			request: AgentSDKQueryRequest,
		) => Promise<IPCResponse<{ requestId: string }>>;
		interrupt: (requestId: string) => Promise<IPCResponse<boolean>>;
		close: (requestId: string) => Promise<IPCResponse<boolean>>;
		listSessions: (
			dir?: string,
		) => Promise<IPCResponse<AgentSDKSessionInfo[]>>;
		getSessionInfo: (
			sessionId: string,
		) => Promise<IPCResponse<AgentSDKSessionInfo | null>>;
		setModel: (
			requestId: string,
			model: string,
		) => Promise<IPCResponse<boolean>>;
		resolvePermission: (
			toolUseId: string,
			allowed: boolean,
			updatedInput?: Record<string, unknown>,
		) => Promise<IPCResponse<boolean>>;
		onStreamEvent: (
			callback: (event: AgentSDKStreamEvent) => void,
		) => () => void;
		// Session 操作
		forkSession: (
			sessionId: string,
			dir?: string,
		) => Promise<IPCResponse<{ sessionId: string } | null>>;
		renameSession: (
			sessionId: string,
			title: string,
			dir?: string,
		) => Promise<IPCResponse<boolean>>;
		tagSession: (
			sessionId: string,
			tag: string,
			dir?: string,
		) => Promise<IPCResponse<boolean>>;
		getSessionMessages: (
			sessionId: string,
			dir?: string,
		) => Promise<IPCResponse<AgentSDKSessionMessage[]>>;
		// 配置
		getConfig: () => Promise<IPCResponse<AgentSDKConfig>>;
		setConfig: (config: AgentSDKConfig) => Promise<IPCResponse<boolean>>;
		// Multi-Agent 角色和团队
		getProfiles: () => Promise<IPCResponse<AgentProfile[]>>;
		setProfiles: (profiles: AgentProfile[]) => Promise<IPCResponse<boolean>>;
		getTeams: () => Promise<IPCResponse<AgentTeam[]>>;
		setTeams: (teams: AgentTeam[]) => Promise<IPCResponse<boolean>>;
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

	// Network API（代理 + 请求日志）
	network: {
		getProxyConfig: () => Promise<IPCResponse<ProxyConfig | null>>;
		setProxyConfig: (config: ProxyConfig) => Promise<IPCResponse>;
		testProxy: (config: ProxyConfig) => Promise<
			IPCResponse<{ success: boolean; latencyMs: number; error?: string }>
		>;
		getLogEnabled: () => Promise<IPCResponse<boolean>>;
		setLogEnabled: (enabled: boolean) => Promise<IPCResponse>;
		getRequestLog: () => Promise<IPCResponse<RequestLogEntry[]>>;
		clearRequestLog: () => Promise<IPCResponse>;
		onRequestLogEntry: (
			callback: (entry: RequestLogEntry) => void,
		) => () => void;
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

// ============ Agent SDK 类型 ============

export type AgentSDKEffort = "low" | "medium" | "high" | "max";

export type AgentSDKThinkingConfig =
	| { type: "adaptive" }
	| { type: "enabled"; budgetTokens: number }
	| { type: "disabled" };

export type AgentSDKPermissionMode =
	| "default"
	| "acceptEdits"
	| "bypassPermissions"
	| "plan"
	| "dontAsk";

export interface AgentSDKAgentDefinition {
	description: string;
	prompt: string;
	tools?: string[];
	disallowedTools?: string[];
	model?: string;
	maxTurns?: number;
}

export interface AgentSDKQueryRequest {
	prompt: string;
	sessionId?: string;
	resumeSessionId?: string;
	cwd?: string;
	model?: string;
	effort?: AgentSDKEffort;
	thinking?: AgentSDKThinkingConfig;
	maxTurns?: number;
	maxBudgetUsd?: number;
	permissionMode?: AgentSDKPermissionMode;
	persistSession?: boolean;
	includePartialMessages?: boolean;
	mcpServerNames?: string[];
	agents?: Record<string, AgentSDKAgentDefinition>;
	systemPrompt?: string;
}

export interface AgentSDKUsage {
	inputTokens: number;
	outputTokens: number;
	cacheCreationInputTokens?: number;
	cacheReadInputTokens?: number;
}

export interface AgentSDKResultData {
	success: boolean;
	text: string;
	durationMs: number;
	numTurns: number;
	totalCostUsd: number;
	stopReason: string | null;
	usage: AgentSDKUsage;
}

export interface AgentSDKPermissionRequest {
	toolName: string;
	toolUseId: string;
	toolInput: Record<string, unknown>;
	title?: string;
	description?: string;
	displayName?: string;
}

export type AgentSDKStreamEventType =
	| "init"
	| "chunk"
	| "assistant"
	| "tool_use_summary"
	| "status"
	| "permission_request"
	| "rate_limit"
	| "result"
	| "error";

export interface AgentSDKStreamEvent {
	requestId: string;
	type: AgentSDKStreamEventType;
	sessionId?: string;
	content?: string;
	error?: string;
	toolSummary?: string;
	result?: AgentSDKResultData;
	permissionRequest?: AgentSDKPermissionRequest;
	status?: string;
	usage?: AgentSDKUsage;
}

export interface AgentSDKSessionInfo {
	sessionId: string;
	summary: string;
	lastModified: number;
	createdAt?: number;
	cwd?: string;
	tag?: string;
	customTitle?: string;
}

export interface AgentSDKSessionMessage {
	type: "user" | "assistant";
	uuid: string;
	sessionId: string;
	message: unknown;
}

export interface AgentSDKConfig {
	apiKeyOverride?: string;
	baseUrlOverride?: string;
	defaultModel?: string;
	smallFastModel?: string;
	defaultEffort?: AgentSDKEffort;
	defaultThinking?: AgentSDKThinkingConfig;
	defaultMaxTurns?: number;
	defaultMaxBudgetUsd?: number;
	defaultPermissionMode?: AgentSDKPermissionMode;
	customEnvVars?: Record<string, string>;
}

export interface AgentProfile {
	id: string;
	name: string;
	description: string;
	prompt: string;
	tools?: string[];
	disallowedTools?: string[];
	model?: string;
	maxTurns?: number;
	icon?: string;
	color?: string;
}

export interface AgentTeam {
	id: string;
	name: string;
	description: string;
	agents: string[];
	isBuiltin?: boolean;
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
	remote?: RemoteBinding;
	agentSDKSessionId?: string;
	chatMode?: "direct" | "agent";
	workspaceId?: string;
	session?: SessionMetadata;
}

export type SessionKind = "chat" | "agent" | "plan" | "remote" | "automation";

export interface CreateConversationOptions {
	workspaceId?: string;
	kind?: SessionKind;
	chatMode?: "direct" | "agent";
}

export type InteractionProfile = "claude-code" | "codex" | "hybrid";

export type PlanMode = "off" | "auto" | "plan";

export type ApprovalMode = "request" | "auto-safe" | "full-access";

export type SandboxMode = "read-only" | "workspace-write" | "system-access";

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

export interface WorkspaceRuntimePolicy {
	approvalMode: ApprovalMode;
	sandboxMode: SandboxMode;
	writableRoots: string[];
	networkAccess: "blocked" | "approval-required" | "allowed";
	externalAppAccess: "blocked" | "approval-required" | "allowed";
}

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

export interface EnabledCapability {
	id: string;
	type: "mcp" | "skill" | "hook" | "app-plugin" | "theme" | "capability-package";
	scope: "global" | "workspace" | "session";
	enabled: boolean;
}

export interface SessionApprovalGrant {
	id: string;
	operationType: string;
	scope: "once" | "session" | "workspace" | "global";
	target?: string;
	riskLevel?: "low" | "medium" | "high";
	grantedAt: number;
	expiresAt?: number;
}

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

// ============ Network 相关类型 ============

export interface ProxyConfig {
	enabled: boolean;
	protocols: ("http" | "https")[];
	host: string;
	port: number;
	auth?: boolean;
	username?: string;
	password?: string;
	bypassList?: string;
}

export interface RequestLogEntry {
	id: string;
	timestamp: number;
	method: string;
	url: string;
	requestHeaders?: Record<string, string>;
	requestBodyPreview?: string;
	responseStatus?: number;
	responseStatusText?: string;
	responseBodyPreview?: string;
	durationMs: number;
	error?: string;
	source: "fetch" | "axios";
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
	// ─── Auto-bridged namespaces ─────────────────
	// createBridge 根据方法名列表生成普通对象（contextBridge 不支持 Proxy）
	window: createBridge<ElectronAPI["window"]>("window", [
		"minimize", "maximize", "close", "isMaximized", "onMaximizeChange",
	]),
	agent: createBridge<ElectronAPI["agent"]>("agent", [
		"createSession", "sendMessage", "getStatus", "stopAgent",
		"listAgents", "getMessages", "clearMessages", "deleteSession",
		"onStreamEvent",
	]),
	skill: createBridge<ElectronAPI["skill"]>("skill", [
		"listSkills", "installSkill", "uninstallSkill", "getSkill",
		"executeSkill", "getAllTools", "enableSkill", "disableSkill",
		"getSystemPrompt", "getCommandPrompt", "validateSkill",
	]),
	chat: createBridge<ElectronAPI["chat"]>("chat", [
		"listConversations", "createConversation", "deleteConversation",
		"renameConversation", "getMessages", "saveMessages", "appendMessage",
		"updateMessage", "clearMessages", "getLastConversation",
		"setLastConversation", "getConversationDir", "getWorkspaceDir",
		"updateConversationMetadata",
	]),
	workspaceRuntime: createBridge<ElectronAPI["workspaceRuntime"]>(
		"workspaceRuntime",
		[
			"listConfigs", "getConfig", "saveConfig", "deleteConfig",
			"getCurrentId", "setCurrentId", "getDefaultId", "setDefaultId",
		],
	),
	theme: createBridge<ElectronAPI["theme"]>("theme", [
		"get", "set", "onChange",
	]),
	search: createBridge<ElectronAPI["search"]>("search", [
		"getConfigs", "saveConfig", "deleteConfig", "setDefault",
		"getDefault", "validateConfig", "execute",
	]),
	file: createBridge<ElectronAPI["file"]>("file", [
		"selectFiles", "readFile", "saveAttachment", "deleteAttachment",
		"listAttachments", "openAttachment", "getAttachmentPath", "copyFile",
	]),
	log: createBridge<ElectronAPI["log"]>("log", [
		"query", "getStats", "getModules", "rendererLog",
		"clearDb", "exportLogs", "openViewer",
	]),
	auth: createBridge<ElectronAPI["auth"]>("auth", [
		"login", "logout", "getUser",
	]),
	update: createBridge<ElectronAPI["update"]>("update", [
		"check", "download", "install",
		"onChecking", "onAvailable", "onNotAvailable",
		"onProgress", "onDownloaded", "onError",
	]),
	model: createBridge<ElectronAPI["model"]>("model", [
		"listProviders", "getProvider", "saveProvider", "deleteProvider",
		"testConnection", "fetchModels", "updateModelConfig",
		"getActiveModel", "setActiveModel",
	]),
	agentSDK: createBridge<ElectronAPI["agentSDK"]>("agentSDK", [
		"createQuery", "interrupt", "close", "listSessions",
		"getSessionInfo", "setModel", "resolvePermission", "onStreamEvent",
		"forkSession", "renameSession", "tagSession", "getSessionMessages",
		"getConfig", "setConfig", "getProfiles", "setProfiles",
		"getTeams", "setTeams",
	]),
	imbot: createBridge<ElectronAPI["imbot"]>("imbot", [
		"listBots", "startBot", "stopBot", "getBotStatus", "sendMessage",
	]),
	remoteChat: createBridge<ElectronAPI["remoteChat"]>("remoteChat", [
		"bind", "unbind", "getBinding", "checkBotOnline",
		"sendMessage", "getRemoteMessages", "onIMMessage",
	]),
	remoteDevice: createBridge<ElectronAPI["remoteDevice"]>("remoteDevice", [
		"listDevices", "registerDevice", "removeDevice", "getDevice",
		"executeCommand", "onCommandOutput", "killCommand",
		"tabComplete", "getCwd", "getRelayConfig", "setRelayConfig",
	]),
	remoteControl: createBridge<ElectronAPI["remoteControl"]>("remoteControl", [
		"getEvents", "clearEvents", "getConnectionInfo", "onNewEvent",
	]),
	network: createBridge<ElectronAPI["network"]>("network", [
		"getProxyConfig", "setProxyConfig", "testProxy",
		"getLogEnabled", "setLogEnabled", "getRequestLog",
		"clearRequestLog", "onRequestLogEntry",
	]),
	webhook: createBridge<ElectronAPI["webhook"]>("webhook", [
		"getConfigs", "saveConfig", "deleteConfig", "test",
	]),
	appConfig: createBridge<ElectronAPI["appConfig"]>("appConfig", [
		"getConfig", "refresh", "onConfigUpdated",
	]),
	system: createBridge<ElectronAPI["system"]>("system", [
		"getHomedir", "getEnvInfo", "getProcessMetrics",
	]),

	// ─── MCP（嵌套结构，需手动映射到不同 namespace）─────
	mcp: {
		connect: (id) => ipcRenderer.invoke("mcp:connect", id),
		disconnect: (id) => ipcRenderer.invoke("mcp:disconnect", id),
		listServers: () => ipcRenderer.invoke("mcp:list-servers"),
		getTools: (id) => ipcRenderer.invoke("mcp:get-tools", id),
		addServer: (config) => ipcRenderer.invoke("mcp:add-server", config),
		removeServer: (id) => ipcRenderer.invoke("mcp:remove-server", id),
		updateServer: (id, config) =>
			ipcRenderer.invoke("mcp:update-server", id, config),
		getAllStatus: () => ipcRenderer.invoke("mcp:get-all-status"),
		callTool: (serverId, toolName, args) =>
			ipcRenderer.invoke("mcp:call-tool", serverId, toolName, args),
		getAllTools: () => ipcRenderer.invoke("mcp:get-all-tools"),
		builtin: {
			getDefinitions: () =>
				ipcRenderer.invoke("mcp-builtin:get-definitions"),
			createConfig: (definitionId, config) =>
				ipcRenderer.invoke(
					"mcp-builtin:create-config",
					definitionId,
					config,
				),
			search: (params) =>
				ipcRenderer.invoke("mcp-builtin:search", params),
		},
		thirdParty: {
			add: (config) => ipcRenderer.invoke("mcp-thirdparty:add", config),
			proxy: (serverId, request) =>
				ipcRenderer.invoke(
					"mcp-thirdparty:proxy",
					serverId,
					request,
				),
		},
		market: {
			search: (params) =>
				ipcRenderer.invoke("mcp-market:search", params),
			getPopular: (limit) =>
				ipcRenderer.invoke("mcp-market:popular", limit),
			getTopRated: (limit) =>
				ipcRenderer.invoke("mcp-market:top-rated", limit),
			getNewest: (limit) =>
				ipcRenderer.invoke("mcp-market:newest", limit),
			getDetail: (id) =>
				ipcRenderer.invoke("mcp-market:get-detail", id),
			getTags: () => ipcRenderer.invoke("mcp-market:get-tags"),
			install: (marketItem, customConfig) =>
				ipcRenderer.invoke(
					"mcp-market:install",
					marketItem,
					customConfig,
				),
			getReadme: (marketItem) =>
				ipcRenderer.invoke("mcp-market:get-readme", marketItem),
			setApiUrl: (url) =>
				ipcRenderer.invoke("mcp-market:set-api-url", url),
		},
	},

	// ─── LLM（streaming，保留手动注册）────────────
	llm: {
		chatCompletion: (request) =>
			ipcRenderer.invoke("llm:chat-completion", request),
		stopStream: (requestId) =>
			ipcRenderer.invoke("llm:stop-stream", requestId),
		toolApprovalResponse: (toolCallId, approved) =>
			ipcRenderer.invoke(
				"llm:tool-approval-response",
				toolCallId,
				approved,
			),
		onStreamEvent: (callback: (event: ChatStreamEvent) => void) => {
			const listener = (_event: unknown, data: ChatStreamEvent) =>
				callback(data);
			ipcRenderer.on("llm:stream-event", listener);
			return () => ipcRenderer.off("llm:stream-event", listener);
		},
	},

	// ─── Skin（跨 namespace 映射到 plugin:* channels）──
	skin: {
		getActiveSkin: () =>
			ipcRenderer.invoke("plugin:get-active-skin"),
		setActiveSkin: (pluginId, themeId) =>
			ipcRenderer.invoke("plugin:set-active-skin", pluginId, themeId),
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

	// ─── Markdown Theme（跨 namespace 映射到 plugin:* channels）──
	markdownTheme: {
		getActive: () =>
			ipcRenderer.invoke("plugin:get-active-markdown-theme"),
		setActive: (pluginId, themeId) =>
			ipcRenderer.invoke(
				"plugin:set-active-markdown-theme",
				pluginId,
				themeId,
			),
		getCSS: () =>
			ipcRenderer.invoke("plugin:get-markdown-theme-css"),
		onCSSChanged: (callback: (css: string | null) => void) => {
			const listener = (_event: unknown, css: string | null) =>
				callback(css);
			ipcRenderer.on("markdown-theme:css-changed", listener);
			return () =>
				ipcRenderer.off("markdown-theme:css-changed", listener);
		},
	},

	// ─── Plugin（事件 channel 使用 camelCase，需手动映射）──
	plugin: {
		grantPermissions: (pluginId, permissions) =>
			ipcRenderer.invoke(
				"plugin:grant-permissions",
				pluginId,
				permissions,
			),
		getPermissions: (pluginId) =>
			ipcRenderer.invoke("plugin:get-permissions", pluginId),
		getUIContributions: () =>
			ipcRenderer.invoke("plugin:get-ui-contributions"),
		getPluginPageHTML: (pluginId, pagePath) =>
			ipcRenderer.invoke(
				"plugin:get-plugin-page-html",
				pluginId,
				pagePath,
			),
		installDev: (sourcePath) =>
			ipcRenderer.invoke("plugin:install-dev", sourcePath),
		reloadDev: (pluginId) =>
			ipcRenderer.invoke("plugin:reload-dev", pluginId),
		checkUpdates: () => ipcRenderer.invoke("plugin:check-updates"),
		updatePlugin: (pluginId) =>
			ipcRenderer.invoke("plugin:update-plugin", pluginId),
		onUIContributionsChanged: (
			callback: (contributions: unknown) => void,
		) => {
			const listener = (_event: unknown, contributions: unknown) =>
				callback(contributions);
			ipcRenderer.on("plugin:ui-contributions-changed", listener);
			return () =>
				ipcRenderer.off("plugin:ui-contributions-changed", listener);
		},
		onShowMessage: (callback) => {
			const listener = (_event: unknown, data: unknown) =>
				callback(data as any);
			ipcRenderer.on("plugin:showMessage", listener);
			return () => ipcRenderer.off("plugin:showMessage", listener);
		},
		onShowInputBox: (callback) => {
			const listener = (_event: unknown, data: unknown) =>
				callback(data as any);
			ipcRenderer.on("plugin:showInputBox", listener);
			return () => ipcRenderer.off("plugin:showInputBox", listener);
		},
		onShowQuickPick: (callback) => {
			const listener = (_event: unknown, data: unknown) =>
				callback(data as any);
			ipcRenderer.on("plugin:showQuickPick", listener);
			return () => ipcRenderer.off("plugin:showQuickPick", listener);
		},
	},

	// ─── 通用 IPC ──────────────────────────────
	ipc: {
		on: (channel, listener) =>
			ipcRenderer.on(channel, (event, ...args) =>
				listener(event, ...args),
			),
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
