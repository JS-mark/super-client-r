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
			createConfig: (definitionId: string, config?: Record<string, unknown>) => Promise<IPCResponse<McpServerConfig>>;
			search: (params: { keyword?: string; tags?: string[] }) => Promise<IPCResponse<BuiltinMcpDefinition[]>>;
		};
		// 第三方 MCP
		thirdParty: {
			add: (config: McpServerConfig) => Promise<IPCResponse>;
			proxy: (serverId: string, request: { endpoint: string; method: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; headers?: Record<string, string> }) => Promise<IPCResponse>;
		};
		// MCP 市场
		market: {
			search: (params: { query?: string; tags?: string[]; sortBy?: "downloads" | "rating" | "newest"; page?: number; limit?: number }) => Promise<IPCResponse<{ items: McpMarketItem[]; total: number; page: number; limit: number }>>;
			getPopular: (limit?: number) => Promise<IPCResponse<McpMarketItem[]>>;
			getTopRated: (limit?: number) => Promise<IPCResponse<McpMarketItem[]>>;
			getNewest: (limit?: number) => Promise<IPCResponse<McpMarketItem[]>>;
			getDetail: (id: string) => Promise<IPCResponse<McpMarketItem | null>>;
			getTags: () => Promise<IPCResponse<string[]>>;
			install: (marketItem: McpMarketItem, customConfig?: { name?: string; env?: Record<string, string>; url?: string }) => Promise<IPCResponse<McpServerConfig>>;
			getReadme: (marketItem: McpMarketItem) => Promise<IPCResponse<string>>;
			setApiUrl: (url: string) => Promise<IPCResponse>;
		};
	};

	// 主题 API
	theme: {
		get: () => Promise<IPCResponse<string>>;
		set: (mode: string) => Promise<IPCResponse<boolean>>;
		onChange: (callback: (mode: string) => void) => () => void;
	};

	// 搜索配置 API
	search: {
		getConfigs: () => Promise<IPCResponse<{ configs: SearchConfig[]; defaultProvider?: SearchProviderType }>>;
		saveConfig: (config: SearchConfig) => Promise<IPCResponse>;
		deleteConfig: (id: string) => Promise<IPCResponse>;
		setDefault: (provider: SearchProviderType | null) => Promise<IPCResponse>;
		getDefault: () => Promise<IPCResponse<SearchProviderType | undefined>>;
		validateConfig: (config: SearchConfig) => Promise<IPCResponse<{ valid: boolean; error?: string }>>;
	};

	// 文件附件 API
	file: {
		selectFiles: (options?: { multiple?: boolean; filters?: { name: string; extensions: string[] }[] }) => Promise<IPCResponse<{ path: string; name: string; size: number; mimeType: string }[]>>;
		readFile: (filePath: string, options?: { encoding?: BufferEncoding; maxSize?: number }) => Promise<IPCResponse<{ content: string; size: number }>>;
		saveAttachment: (data: { sourcePath: string; conversationId?: string; messageId?: string; customName?: string }) => Promise<IPCResponse<AttachmentInfo>>;
		deleteAttachment: (attachmentPath: string) => Promise<IPCResponse>;
		listAttachments: (filter?: { conversationId?: string; messageId?: string; type?: string }) => Promise<IPCResponse<{ attachments: AttachmentInfo[] }>>;
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
		exportLogs: (params: LogQueryParams) => Promise<{ success: boolean; count?: number; filePath?: string }>;
		openViewer: () => Promise<{ success: boolean }>;
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

export interface IPCResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
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
		listSkills: () => ipcRenderer.invoke("skill:list-skills"),
		installSkill: (source) => ipcRenderer.invoke("skill:install-skill", source),
		uninstallSkill: (id) => ipcRenderer.invoke("skill:uninstall-skill", id),
		getSkill: (id) => ipcRenderer.invoke("skill:get-skill", id),
		executeSkill: (skillId, toolName, input) =>
			ipcRenderer.invoke("skill:execute-skill", skillId, toolName, input),
		getAllTools: () => ipcRenderer.invoke("skill:get-all-tools"),
		enableSkill: (id) => ipcRenderer.invoke("skill:enable", id),
		disableSkill: (id) => ipcRenderer.invoke("skill:disable", id),
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
		getAllStatus: () => ipcRenderer.invoke("mcp:get-all-status"),
		callTool: (serverId, toolName, args) =>
			ipcRenderer.invoke("mcp:call-tool", serverId, toolName, args),
		getAllTools: () => ipcRenderer.invoke("mcp:get-all-tools"),
		// 内置 MCP
		builtin: {
			getDefinitions: () => ipcRenderer.invoke("mcp:builtin:get-definitions"),
			createConfig: (definitionId, config) => ipcRenderer.invoke("mcp:builtin:create-config", { definitionId, config }),
			search: (params) => ipcRenderer.invoke("mcp:builtin:search", params),
		},
		// 第三方 MCP
		thirdParty: {
			add: (config) => ipcRenderer.invoke("mcp:thirdparty:add", config),
			proxy: (serverId, request) => ipcRenderer.invoke("mcp:thirdparty:proxy", { serverId, request }),
		},
		// MCP 市场
		market: {
			search: (params) => ipcRenderer.invoke("mcp:market:search", params),
			getPopular: (limit) => ipcRenderer.invoke("mcp:market:popular", limit),
			getTopRated: (limit) => ipcRenderer.invoke("mcp:market:top-rated", limit),
			getNewest: (limit) => ipcRenderer.invoke("mcp:market:newest", limit),
			getDetail: (id) => ipcRenderer.invoke("mcp:market:get-detail", id),
			getTags: () => ipcRenderer.invoke("mcp:market:get-tags"),
			install: (marketItem, customConfig) => ipcRenderer.invoke("mcp:market:install", { marketItem, customConfig }),
			getReadme: (marketItem) => ipcRenderer.invoke("mcp:market:get-readme", marketItem),
			setApiUrl: (url) => ipcRenderer.invoke("mcp:market:set-api-url", url),
		},
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
		saveConfig: (config: SearchConfig) => ipcRenderer.invoke("search:save-config", config),
		deleteConfig: (id: string) => ipcRenderer.invoke("search:delete-config", id),
		setDefault: (provider: SearchProviderType | null) => ipcRenderer.invoke("search:set-default", provider),
		getDefault: () => ipcRenderer.invoke("search:get-default"),
		validateConfig: (config: SearchConfig) => ipcRenderer.invoke("search:validate-config", config),
	},

	// 文件附件 API
	file: {
		selectFiles: (options) => ipcRenderer.invoke("file:select-files", options),
		readFile: (filePath, options) => ipcRenderer.invoke("file:read-file", filePath, options),
		saveAttachment: (data) => ipcRenderer.invoke("file:save-attachment", data),
		deleteAttachment: (attachmentPath) => ipcRenderer.invoke("file:delete-attachment", attachmentPath),
		listAttachments: (filter) => ipcRenderer.invoke("file:list-attachments", filter),
		openAttachment: (attachmentPath) => ipcRenderer.invoke("file:open-attachment", attachmentPath),
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
