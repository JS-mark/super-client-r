/**
 * MCP 服务（渲染进程）
 * 封装与主进程的 MCP 通信
 */

import type {
	BuiltinMcpDefinition,
	McpMarketItem,
	McpServerConfig,
	McpServerStatus,
	McpTool,
} from "../../types/electron";

export class McpClient {
	// ========== 基础管理 ==========

	/**
	 * 连接到 MCP 服务器
	 */
	async connect(id: string): Promise<McpServerStatus> {
		const response = await window.electron.mcp.connect(id);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to connect to server");
		}
		return response.data;
	}

	/**
	 * 断开 MCP 服务器连接
	 */
	async disconnect(id: string): Promise<void> {
		const response = await window.electron.mcp.disconnect(id);
		if (!response.success) {
			throw new Error(response.error || "Failed to disconnect");
		}
	}

	/**
	 * 列出所有服务器
	 */
	async listServers(): Promise<McpServerConfig[]> {
		const response = await window.electron.mcp.listServers();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to list servers");
		}
		return response.data;
	}

	/**
	 * 获取服务器工具
	 */
	async getTools(id: string): Promise<McpTool[]> {
		const response = await window.electron.mcp.getTools(id);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get tools");
		}
		return response.data;
	}

	/**
	 * 添加服务器
	 */
	async addServer(config: McpServerConfig): Promise<void> {
		const response = await window.electron.mcp.addServer(config);
		if (!response.success) {
			throw new Error(response.error || "Failed to add server");
		}
	}

	/**
	 * 移除服务器
	 */
	async removeServer(id: string): Promise<void> {
		const response = await window.electron.mcp.removeServer(id);
		if (!response.success) {
			throw new Error(response.error || "Failed to remove server");
		}
	}

	/**
	 * 获取所有服务器状态
	 */
	async getAllStatus(): Promise<McpServerStatus[]> {
		const response = await window.electron.mcp.getAllStatus();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get server status");
		}
		return response.data;
	}

	/**
	 * 调用工具
	 */
	async callTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<unknown> {
		const response = await window.electron.mcp.callTool(
			serverId,
			toolName,
			args,
		);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to call tool");
		}
		return response.data;
	}

	/**
	 * 获取所有可用工具
	 */
	async getAllTools(): Promise<Array<{ serverId: string; tool: McpTool }>> {
		const response = await window.electron.mcp.getAllTools();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get tools");
		}
		return response.data;
	}

	// ========== 内置 MCP ==========

	/**
	 * 获取所有内置 MCP 定义
	 */
	async getBuiltinDefinitions(): Promise<BuiltinMcpDefinition[]> {
		const response = await window.electron.mcp.builtin.getDefinitions();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get builtin definitions");
		}
		return response.data;
	}

	/**
	 * 从内置定义创建服务器配置
	 */
	async createBuiltinConfig(
		definitionId: string,
		config?: Record<string, unknown>,
	): Promise<McpServerConfig> {
		const response = await window.electron.mcp.builtin.createConfig(
			definitionId,
			config,
		);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to create builtin config");
		}
		return response.data;
	}

	/**
	 * 搜索内置 MCP
	 */
	async searchBuiltin(params: {
		keyword?: string;
		tags?: string[];
	}): Promise<BuiltinMcpDefinition[]> {
		const response = await window.electron.mcp.builtin.search(params);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to search builtin");
		}
		return response.data;
	}

	// ========== 第三方 MCP ==========

	/**
	 * 添加第三方 MCP 服务器
	 */
	async addThirdPartyServer(config: McpServerConfig): Promise<void> {
		const response = await window.electron.mcp.thirdParty.add(config);
		if (!response.success) {
			throw new Error(response.error || "Failed to add third-party server");
		}
	}

	/**
	 * 代理请求到第三方 MCP
	 */
	async proxyThirdPartyRequest(
		serverId: string,
		request: {
			endpoint: string;
			method: "GET" | "POST" | "PUT" | "DELETE";
			body?: unknown;
			headers?: Record<string, string>;
		},
	): Promise<unknown> {
		const response = await window.electron.mcp.thirdParty.proxy(
			serverId,
			request,
		);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to proxy request");
		}
		return response.data;
	}

	// ========== MCP 市场 ==========

	/**
	 * 搜索市场 MCP
	 */
	async searchMarket(params: {
		query?: string;
		tags?: string[];
		sortBy?: "downloads" | "rating" | "newest";
		page?: number;
		limit?: number;
	}): Promise<{
		items: McpMarketItem[];
		total: number;
		page: number;
		limit: number;
	}> {
		const response = await window.electron.mcp.market.search(params);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to search market");
		}
		return response.data;
	}

	/**
	 * 获取热门 MCP
	 */
	async getPopularMarketItems(limit?: number): Promise<McpMarketItem[]> {
		const response = await window.electron.mcp.market.getPopular(limit);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get popular items");
		}
		return response.data;
	}

	/**
	 * 获取高评分 MCP
	 */
	async getTopRatedMarketItems(limit?: number): Promise<McpMarketItem[]> {
		const response = await window.electron.mcp.market.getTopRated(limit);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get top rated items");
		}
		return response.data;
	}

	/**
	 * 获取最新 MCP
	 */
	async getNewestMarketItems(limit?: number): Promise<McpMarketItem[]> {
		const response = await window.electron.mcp.market.getNewest(limit);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get newest items");
		}
		return response.data;
	}

	/**
	 * 获取 MCP 详情
	 */
	async getMarketItemDetail(id: string): Promise<McpMarketItem | null> {
		const response = await window.electron.mcp.market.getDetail(id);
		if (!response.success) {
			throw new Error(response.error || "Failed to get market item detail");
		}
		return response.data ?? null;
	}

	/**
	 * 获取所有标签
	 */
	async getMarketTags(): Promise<string[]> {
		const response = await window.electron.mcp.market.getTags();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get market tags");
		}
		return response.data;
	}

	/**
	 * 安装 MCP
	 */
	async installFromMarket(
		marketItem: McpMarketItem,
		customConfig?: {
			name?: string;
			env?: Record<string, string>;
			url?: string;
		},
	): Promise<McpServerConfig> {
		const response = await window.electron.mcp.market.install(
			marketItem,
			customConfig,
		);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to install from market");
		}
		return response.data;
	}

	/**
	 * 获取 README
	 */
	async getMarketReadme(marketItem: McpMarketItem): Promise<string> {
		const response = await window.electron.mcp.market.getReadme(marketItem);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get readme");
		}
		return response.data;
	}

	/**
	 * 设置市场 API URL
	 */
	async setMarketApiUrl(url: string): Promise<void> {
		const response = await window.electron.mcp.market.setApiUrl(url);
		if (!response.success) {
			throw new Error(response.error || "Failed to set market API URL");
		}
	}
}

// 单例实例
export const mcpClient = new McpClient();
