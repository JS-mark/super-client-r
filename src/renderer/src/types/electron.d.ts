/**
 * Electron API 类型声明
 * 与 preload/index.ts 中的类型保持一致
 */

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

	// 通用 IPC
	ipc: {
		on: (channel: string, listener: (...args: unknown[]) => void) => void;
		off: (channel: string, listener: (...args: unknown[]) => void) => void;
		send: (channel: string, ...args: unknown[]) => void;
		invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
	};
}

declare global {
	interface Window {
		electron: ElectronAPI;
	}
}
