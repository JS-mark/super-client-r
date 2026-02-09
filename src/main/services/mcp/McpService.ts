/**
 * MCP (Model Context Protocol) 服务
 * 管理 MCP 服务器的连接和工具调用
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EventEmitter } from "events";
import type {
	McpServerConfig,
	McpServerStatus,
	McpTool,
} from "../../ipc/types";

interface McpConnection {
	client: Client;
	transport: StdioClientTransport;
}

export class McpService extends EventEmitter {
	private servers: Map<string, McpServerConfig> = new Map();
	private serverStatus: Map<string, McpServerStatus> = new Map();
	private connections: Map<string, McpConnection> = new Map();

	/**
	 * 添加 MCP 服务器配置
	 */
	addServer(config: McpServerConfig): void {
		this.servers.set(config.id, config);
		this.serverStatus.set(config.id, {
			id: config.id,
			status: "disconnected",
		});
		this.emit("server-added", config);
	}

	/**
	 * 移除 MCP 服务器
	 */
	async removeServer(id: string): Promise<void> {
		await this.disconnect(id);
		this.servers.delete(id);
		this.serverStatus.delete(id);
		this.emit("server-removed", id);
	}

	/**
	 * 获取所有服务器配置
	 */
	listServers(): McpServerConfig[] {
		return Array.from(this.servers.values());
	}

	/**
	 * 获取服务器状态
	 */
	getServerStatus(id: string): McpServerStatus | undefined {
		return this.serverStatus.get(id);
	}

	/**
	 * 获取所有服务器状态
	 */
	getAllServerStatus(): McpServerStatus[] {
		return Array.from(this.serverStatus.values());
	}

	/**
	 * 连接到 MCP 服务器
	 */
	async connect(id: string): Promise<McpServerStatus> {
		const config = this.servers.get(id);
		if (!config) {
			throw new Error(`Server ${id} not found`);
		}

		const status = this.serverStatus.get(id)!;
		status.status = "connecting";
		this.serverStatus.set(id, status);

		try {
			// 创建 MCP 客户端
			const client = new Client(
				{
					name: "super-client-r",
					version: "0.0.1",
				},
				{
					capabilities: {},
				},
			);

			// 创建传输层
			const transport = new StdioClientTransport({
				command: config.command,
				args: config.args || [],
				env: config.env,
			});

			// 连接
			await client.connect(transport);

			// 存储连接
			this.connections.set(id, { client, transport });

			// 获取可用工具
			const toolsResponse = await client.listTools();
			status.tools = toolsResponse.tools.map((tool) => ({
				name: tool.name,
				description: tool.description || "",
				inputSchema: tool.inputSchema as any,
			}));

			status.status = "connected";
			this.serverStatus.set(id, status);
			this.emit("connected", status);

			return status;
		} catch (error) {
			status.status = "error";
			status.error = error instanceof Error ? error.message : "Unknown error";
			this.serverStatus.set(id, status);
			this.emit("error", { id, error });
			throw error;
		}
	}

	/**
	 * 断开 MCP 服务器连接
	 */
	async disconnect(id: string): Promise<void> {
		const connection = this.connections.get(id);
		if (connection) {
			try {
				await connection.client.close();
				await connection.transport.close();
			} catch (error) {
				console.error(`Error disconnecting MCP server ${id}:`, error);
			}
			this.connections.delete(id);
		}

		const status = this.serverStatus.get(id);
		if (status) {
			status.status = "disconnected";
			status.tools = undefined;
			status.error = undefined;
			this.serverStatus.set(id, status);
			this.emit("disconnected", id);
		}
	}

	/**
	 * 调用 MCP 工具
	 */
	async callTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<unknown> {
		const connection = this.connections.get(serverId);
		if (!connection) {
			throw new Error(`Server ${serverId} is not connected`);
		}

		try {
			const result = await connection.client.callTool({
				name: toolName,
				arguments: args,
			});

			this.emit("tool-called", { serverId, toolName, args });

			return result;
		} catch (error) {
			this.emit("error", { serverId, toolName, error });
			throw error;
		}
	}

	/**
	 * 获取服务器的所有工具
	 */
	getServerTools(serverId: string): McpTool[] {
		return this.serverStatus.get(serverId)?.tools || [];
	}

	/**
	 * 获取所有可用工具（来自所有已连接的服务器）
	 */
	getAllAvailableTools(): Array<{ serverId: string; tool: McpTool }> {
		const tools: Array<{ serverId: string; tool: McpTool }> = [];

		for (const [id, status] of this.serverStatus.entries()) {
			if (status.status === "connected" && status.tools) {
				for (const tool of status.tools) {
					tools.push({ serverId: id, tool });
				}
			}
		}

		return tools;
	}
}

// 单例实例
export const mcpService = new McpService();
