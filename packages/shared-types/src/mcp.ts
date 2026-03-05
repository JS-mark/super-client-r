/**
 * MCP (Model Context Protocol) 相关类型定义
 */

/** MCP 服务器类型 */
export type McpServerType = "builtin" | "third-party" | "market" | "internal";

/** MCP 传输类型 */
export type McpTransportType = "stdio" | "sse" | "http" | "internal";

/** MCP 服务器配置 */
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

/** MCP 服务器状态 */
export interface McpServerStatus {
	id: string;
	status: "connected" | "disconnected" | "connecting" | "error";
	type?: McpServerType;
	transport?: McpTransportType;
	tools?: McpTool[];
	error?: string;
}

/** MCP 工具 */
export interface McpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/** MCP 工具调用请求 */
export interface McpToolCallRequest {
	serverId: string;
	toolName: string;
	args: Record<string, unknown>;
}

/** MCP 工具调用响应 */
export interface McpToolCallResponse {
	success: boolean;
	data?: unknown;
	error?: string;
}

/** MCP 市场项目 */
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

/** MCP 市场搜索参数 */
export interface McpMarketSearchParams {
	query?: string;
	tags?: string[];
	sortBy?: "downloads" | "rating" | "newest";
	page?: number;
	limit?: number;
}

/** MCP 市场搜索结果 */
export interface McpMarketSearchResult {
	items: McpMarketItem[];
	total: number;
	page: number;
	limit: number;
}

/** 第三方 MCP 请求 */
export interface ThirdPartyMcpRequest {
	endpoint: string;
	method: "GET" | "POST" | "PUT" | "DELETE";
	body?: unknown;
	headers?: Record<string, string>;
}

/** 第三方 MCP 响应 */
export interface ThirdPartyMcpResponse {
	success: boolean;
	data?: unknown;
	error?: string;
	statusCode?: number;
}

/** 内置 MCP 定义 */
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
