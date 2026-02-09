/**
 * MCP 服务（渲染进程）
 * 封装与主进程的 MCP 通信
 */

import type {
	McpServerConfig,
	McpServerStatus,
	McpTool,
} from "../../types/electron";

export class McpClient {
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
}

// 单例实例
export const mcpClient = new McpClient();
