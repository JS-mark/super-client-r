/**
 * MCP (Model Context Protocol) 服务
 * 管理 MCP 服务器的连接和工具调用，支持内置、第三方和市场 MCP
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EventEmitter } from "events";
import type {
	McpServerConfig,
	McpServerStatus,
	McpTool,
	McpServerType,
} from "../../ipc/types";
import { builtinMcpService } from "./BuiltinMcpService";
import {
	thirdPartyMcpService,
	UnifiedToolResponse,
} from "./ThirdPartyMcpService";
import { mcpMarketService } from "./McpMarketService";

interface McpConnection {
	client: Client;
	transport: StdioClientTransport;
	config: McpServerConfig;
}

// 统一的工具调用结果
export interface UnifiedToolCallResult {
	success: boolean;
	data?: unknown;
	error?: string;
	serverType: McpServerType;
	timestamp: number;
	duration: number;
}

export class McpService extends EventEmitter {
	private servers: Map<string, McpServerConfig> = new Map();
	private serverStatus: Map<string, McpServerStatus> = new Map();
	private stdioConnections: Map<string, McpConnection> = new Map();

	constructor() {
		super();
		this.setupEventForwarding();
	}

	/**
	 * 设置事件转发
	 */
	private setupEventForwarding(): void {
		// 转发第三方 MCP 服务的事件
		thirdPartyMcpService.on("connected", (status) => {
			this.emit("server-connected", status);
		});
		thirdPartyMcpService.on("disconnected", (id) => {
			this.emit("server-disconnected", id);
		});
		thirdPartyMcpService.on("error", ({ id, error }) => {
			this.emit("server-error", { id, error });
		});
		thirdPartyMcpService.on("tool-called", (data) => {
			this.emit("tool-called", data);
		});
	}

	/**
	 * 添加 MCP 服务器配置
	 */
	addServer(config: McpServerConfig): void {
		this.servers.set(config.id, config);

		// 根据类型初始化
		switch (config.type) {
			case "builtin":
			case "market":
				// stdio 类型服务器
				this.serverStatus.set(config.id, {
					id: config.id,
					status: "disconnected",
					type: config.type,
					transport: config.transport,
				});
				break;
			case "third-party":
				// 第三方服务器
				thirdPartyMcpService.addServer(config);
				thirdPartyMcpService.registerServer(config);
				break;
		}

		this.emit("server-added", config);
	}

	/**
	 * 移除 MCP 服务器
	 */
	async removeServer(id: string): Promise<void> {
		const config = this.servers.get(id);
		if (!config) return;

		await this.disconnect(id);

		// 根据类型清理
		switch (config.type) {
			case "builtin":
			case "market":
				this.stdioConnections.delete(id);
				this.serverStatus.delete(id);
				break;
			case "third-party":
				await thirdPartyMcpService.removeServer(id);
				break;
		}

		this.servers.delete(id);
		this.emit("server-removed", id);
	}

	/**
	 * 获取所有服务器配置
	 */
	listServers(): McpServerConfig[] {
		return Array.from(this.servers.values());
	}

	/**
	 * 获取服务器配置
	 */
	getServer(id: string): McpServerConfig | undefined {
		return this.servers.get(id);
	}

	/**
	 * 获取服务器状态
	 */
	getServerStatus(id: string): McpServerStatus | undefined {
		const config = this.servers.get(id);
		if (!config) return undefined;

		switch (config.type) {
			case "builtin":
			case "market":
				return this.serverStatus.get(id);
			case "third-party":
				return thirdPartyMcpService.getServerStatus(id);
			default:
				return this.serverStatus.get(id);
		}
	}

	/**
	 * 获取所有服务器状态
	 */
	getAllServerStatus(): McpServerStatus[] {
		const statuses: McpServerStatus[] = [];

		for (const [id, config] of this.servers.entries()) {
			const status = this.getServerStatus(id);
			if (status) {
				statuses.push(status);
			}
		}

		return statuses;
	}

	/**
	 * 连接到 MCP 服务器
	 */
	async connect(id: string): Promise<McpServerStatus> {
		const config = this.servers.get(id);
		if (!config) {
			throw new Error(`Server ${id} not found`);
		}

		// 根据类型选择连接方式
		switch (config.type) {
			case "builtin":
			case "market":
				return this.connectStdio(id, config);
			case "third-party":
				return thirdPartyMcpService.connect(id);
			default:
				throw new Error(`Unknown server type: ${config.type}`);
		}
	}

	/**
	 * 断开 MCP 服务器连接
	 */
	async disconnect(id: string): Promise<void> {
		const config = this.servers.get(id);
		if (!config) return;

		switch (config.type) {
			case "builtin":
			case "market":
				await this.disconnectStdio(id);
				break;
			case "third-party":
				await thirdPartyMcpService.disconnect(id);
				break;
		}
	}

	/**
	 * 调用 MCP 工具（统一接口）
	 */
	async callTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<UnifiedToolCallResult> {
		const startTime = Date.now();
		const config = this.servers.get(serverId);

		if (!config) {
			return {
				success: false,
				error: `Server ${serverId} not found`,
				serverType: "builtin",
				timestamp: startTime,
				duration: 0,
			};
		}

		try {
			let result: unknown;

			switch (config.type) {
				case "builtin":
				case "market":
					result = await this.callStdioTool(serverId, toolName, args);
					break;
				case "third-party":
					const unifiedResult = await thirdPartyMcpService.callTool(
						serverId,
						toolName,
						args,
					);
					return {
						success: unifiedResult.success,
						data: unifiedResult.data,
						error: unifiedResult.error?.message,
						serverType: "third-party",
						timestamp: startTime,
						duration: unifiedResult.metadata?.duration || Date.now() - startTime,
					};
				default:
					throw new Error(`Unknown server type: ${config.type}`);
			}

			const duration = Date.now() - startTime;
			this.emit("tool-called", { serverId, toolName, args, duration });

			return {
				success: true,
				data: result,
				serverType: config.type,
				timestamp: startTime,
				duration,
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			this.emit("tool-error", { serverId, toolName, error, duration });

			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
				serverType: config.type,
				timestamp: startTime,
				duration,
			};
		}
	}

	/**
	 * 获取服务器的所有工具
	 */
	getServerTools(serverId: string): McpTool[] {
		const config = this.servers.get(serverId);
		if (!config) return [];

		switch (config.type) {
			case "builtin":
			case "market":
				return this.serverStatus.get(serverId)?.tools || [];
			case "third-party":
				return thirdPartyMcpService.getServerTools(serverId);
			default:
				return [];
		}
	}

	/**
	 * 获取所有可用工具（来自所有已连接的服务器）
	 */
	getAllAvailableTools(): Array<{ serverId: string; tool: McpTool }> {
		const tools: Array<{ serverId: string; tool: McpTool }> = [];

		// stdio 服务器
		for (const [id, status] of this.serverStatus.entries()) {
			if (status.status === "connected" && status.tools) {
				for (const tool of status.tools) {
					tools.push({ serverId: id, tool });
				}
			}
		}

		// 第三方服务器
		const thirdPartyTools = thirdPartyMcpService.getAllAvailableTools();
		tools.push(...thirdPartyTools);

		return tools;
	}

	/**
	 * 获取内置 MCP 服务
	 */
	getBuiltinService() {
		return builtinMcpService;
	}

	/**
	 * 获取第三方 MCP 服务
	 */
	getThirdPartyService() {
		return thirdPartyMcpService;
	}

	/**
	 * 获取 MCP 市场服务
	 */
	getMarketService() {
		return mcpMarketService;
	}

	/**
	 * 批量调用工具（用于 Agent）
	 */
	async callToolsBatch(
		requests: Array<{ serverId: string; toolName: string; args: Record<string, unknown> }>,
	): Promise<UnifiedToolCallResult[]> {
		return Promise.all(
			requests.map((req) => this.callTool(req.serverId, req.toolName, req.args)),
		);
	}

	/**
	 * 连接到 stdio MCP 服务器
	 */
	private async connectStdio(
		id: string,
		config: McpServerConfig,
	): Promise<McpServerStatus> {
		const status = this.serverStatus.get(id)!;
		status.status = "connecting";
		this.serverStatus.set(id, status);
		this.emit("server-connecting", { id });

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
				command: config.command!,
				args: config.args || [],
				env: config.env,
			});

			// 连接
			await client.connect(transport);

			// 存储连接
			this.stdioConnections.set(id, { client, transport, config });

			// 获取可用工具
			const toolsResponse = await client.listTools();
			status.tools = toolsResponse.tools.map((tool) => ({
				name: tool.name,
				description: tool.description || "",
				inputSchema: tool.inputSchema as any,
			}));

			status.status = "connected";
			this.serverStatus.set(id, status);
			this.emit("server-connected", status);

			return status;
		} catch (error) {
			status.status = "error";
			status.error = error instanceof Error ? error.message : "Unknown error";
			this.serverStatus.set(id, status);
			this.emit("server-error", { id, error });
			throw error;
		}
	}

	/**
	 * 断开 stdio MCP 服务器连接
	 */
	private async disconnectStdio(id: string): Promise<void> {
		const connection = this.stdioConnections.get(id);
		if (connection) {
			try {
				await connection.client.close();
				await connection.transport.close();
			} catch (error) {
				console.error(`Error disconnecting MCP server ${id}:`, error);
			}
			this.stdioConnections.delete(id);
		}

		const status = this.serverStatus.get(id);
		if (status) {
			status.status = "disconnected";
			status.tools = undefined;
			status.error = undefined;
			this.serverStatus.set(id, status);
			this.emit("server-disconnected", id);
		}
	}

	/**
	 * 调用 stdio MCP 工具
	 */
	private async callStdioTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<unknown> {
		const connection = this.stdioConnections.get(serverId);
		if (!connection) {
			throw new Error(`Server ${serverId} is not connected`);
		}

		const result = await connection.client.callTool({
			name: toolName,
			arguments: args,
		});

		return result;
	}
}

// 单例实例
export const mcpService = new McpService();
