/**
 * 搜索配置类型定义
 * 渲染进程使用，与主进程保持同步
 */

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

export interface SearchConfigsResponse {
	configs: SearchConfig[];
	defaultProvider?: SearchProviderType;
}

export interface ValidateConfigResponse {
	valid: boolean;
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

export interface IPCResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}
