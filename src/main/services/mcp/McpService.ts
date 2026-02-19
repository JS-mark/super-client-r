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
import { storeManager } from "../../store/StoreManager";
import { logger } from "../../utils/logger";
import { builtinMcpService } from "./BuiltinMcpService";
import {
	thirdPartyMcpService,
} from "./ThirdPartyMcpService";
import { mcpMarketService } from "./McpMarketService";
import { internalMcpService } from "./internal";

const log = logger.withContext("MCP");

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
			log.info("Third-party server connected", { serverId: status.id });
			this.emit("server-connected", status);
		});
		thirdPartyMcpService.on("disconnected", (id) => {
			log.info("Third-party server disconnected", { serverId: id });
			this.emit("server-disconnected", id);
		});
		thirdPartyMcpService.on("error", ({ id, error }) => {
			log.error("Third-party server error", error instanceof Error ? error : new Error(String(error)), { serverId: id });
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
		log.info("Adding server", {
			id: config.id,
			name: config.name,
			type: config.type,
			transport: config.transport,
			command: config.command,
			args: config.args,
		});

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
			case "internal":
				// 内置 in-process 服务器，始终连接
				this.serverStatus.set(config.id, {
					id: config.id,
					status: "connected",
					type: "internal",
					transport: "internal",
					tools: internalMcpService.getTools(config.id),
				});
				break;
		}

		// 持久化到 electron-store（internal 类型不持久化）
		if (config.type !== "internal") {
			storeManager.saveMcpServer(config);
		}

		this.emit("server-added", config);
	}

	/**
	 * 移除 MCP 服务器
	 */
	async removeServer(id: string): Promise<void> {
		const config = this.servers.get(id);
		if (!config) {
			log.warn("Remove server: not found", { id });
			return;
		}

		// 内置服务器不可删除
		if (config.type === "internal") {
			log.warn("Cannot remove internal server", { id, name: config.name });
			return;
		}

		log.info("Removing server", { id, name: config.name, type: config.type });

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

		// 从持久化存储中删除
		storeManager.deleteMcpServer(id);

		log.info("Server removed", { id, name: config.name });
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
	 * 更新 MCP 服务器配置
	 */
	updateServer(id: string, updates: Partial<McpServerConfig>): void {
		const existing = this.servers.get(id);
		if (!existing) {
			log.warn("Update server: not found", { id });
			return;
		}

		log.info("Updating server config", { id, name: existing.name, updates });

		const updated = { ...existing, ...updates, id };
		this.servers.set(id, updated);
		storeManager.saveMcpServer(updated);
		this.emit("server-updated", updated);
	}

	/**
	 * 从持久化存储加载已保存的服务器配置到内存
	 * 只注册，不自动连接
	 */
	loadPersistedServers(): void {
		const persisted = storeManager.getMcpServers();
		log.info("Loading persisted servers", { count: persisted.length });

		let loaded = 0;
		for (const config of persisted) {
			if (this.servers.has(config.id)) {
				log.debug("Skipping already registered server", { id: config.id, name: config.name });
				continue;
			}

			this.servers.set(config.id, config);

			switch (config.type) {
				case "builtin":
				case "market":
					this.serverStatus.set(config.id, {
						id: config.id,
						status: "disconnected",
						type: config.type,
						transport: config.transport,
					});
					break;
				case "third-party":
					thirdPartyMcpService.addServer(config);
					thirdPartyMcpService.registerServer(config);
					break;
				case "internal":
					// Internal 服务器不从持久化加载（由 registerInternalServers 注册）
					continue;
			}

			loaded++;
			log.debug("Loaded persisted server", {
				id: config.id,
				name: config.name,
				type: config.type,
				transport: config.transport,
				command: config.command,
			});
		}

		log.info("Persisted servers loaded", { loaded, total: persisted.length });
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
			case "internal":
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

		for (const id of this.servers.keys()) {
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
			log.error("Connect failed: server not found", undefined, { id });
			throw new Error(`Server ${id} not found`);
		}

		log.info("Connecting to server", { id, name: config.name, type: config.type, transport: config.transport });

		// 根据类型选择连接方式
		switch (config.type) {
			case "builtin":
			case "market":
				return this.connectStdio(id, config);
			case "third-party":
				return thirdPartyMcpService.connect(id);
			case "internal": {
				// Internal 服务器始终已连接
				const status = this.serverStatus.get(id)!;
				return status;
			}
			default:
				log.error("Connect failed: unknown server type", undefined, { id, type: config.type });
				throw new Error(`Unknown server type: ${config.type}`);
		}
	}

	/**
	 * 断开 MCP 服务器连接
	 */
	async disconnect(id: string): Promise<void> {
		const config = this.servers.get(id);
		if (!config) return;

		log.info("Disconnecting server", { id, name: config.name, type: config.type });

		switch (config.type) {
			case "builtin":
			case "market":
				await this.disconnectStdio(id);
				break;
			case "third-party":
				await thirdPartyMcpService.disconnect(id);
				break;
			case "internal":
				// Internal 服务器不可断开
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
			log.warn("Tool call failed: server not found", { serverId, toolName });
			return {
				success: false,
				error: `Server ${serverId} not found`,
				serverType: "builtin",
				timestamp: startTime,
				duration: 0,
			};
		}

		log.debug("Calling tool", { serverId, serverName: config.name, toolName });

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
				case "internal": {
					const internalResult = await internalMcpService.callTool(
						serverId,
						toolName,
						args,
					);
					const duration = Date.now() - startTime;
					this.emit("tool-called", { serverId, toolName, args, duration });
					return {
						success: !internalResult.isError,
						data: internalResult,
						serverType: "internal" as McpServerType,
						timestamp: startTime,
						duration,
					};
				}
				default:
					throw new Error(`Unknown server type: ${config.type}`);
			}

			const duration = Date.now() - startTime;
			log.debug("Tool call completed", { serverId, toolName, durationMs: duration });
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
			log.error("Tool call failed", error instanceof Error ? error : new Error(String(error)), { serverId, toolName, durationMs: duration });
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
			case "internal":
				return internalMcpService.getTools(serverId);
			default:
				return [];
		}
	}

	/**
	 * 获取所有可用工具（来自所有已连接的服务器）
	 */
	getAllAvailableTools(): Array<{ serverId: string; tool: McpTool }> {
		const tools: Array<{ serverId: string; tool: McpTool }> = [];

		// stdio 服务器（排除 internal，避免重复）
		for (const [id, status] of this.serverStatus.entries()) {
			if (status.status === "connected" && status.tools) {
				const config = this.servers.get(id);
				if (config?.type === "internal") continue;
				for (const tool of status.tools) {
					tools.push({ serverId: id, tool });
				}
			}
		}

		// 第三方服务器
		const thirdPartyTools = thirdPartyMcpService.getAllAvailableTools();
		tools.push(...thirdPartyTools);

		// Internal 服务器
		const internalTools = internalMcpService.getAllTools();
		tools.push(...internalTools);

		return tools;
	}

	/**
	 * 批量注册 internal 服务器配置
	 */
	registerInternalServers(configs: McpServerConfig[]): void {
		log.info("Registering internal servers", { count: configs.length });
		for (const config of configs) {
			this.addServer(config);
		}
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

		log.info("Connecting stdio server", {
			id,
			name: config.name,
			command: config.command,
			args: config.args,
			env: config.env ? Object.keys(config.env) : undefined,
		});

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
			log.info("Stdio transport connected", { id, name: config.name });

			// 存储连接
			this.stdioConnections.set(id, { client, transport, config });

			// 获取可用工具
			const toolsResponse = await client.listTools();
			status.tools = toolsResponse.tools.map((tool) => ({
				name: tool.name,
				description: tool.description || "",
				inputSchema: tool.inputSchema as any,
			}));

			log.info("Server connected successfully", {
				id,
				name: config.name,
				toolCount: status.tools.length,
				tools: status.tools.map((t) => t.name),
			});

			status.status = "connected";
			this.serverStatus.set(id, status);
			this.emit("server-connected", status);

			return status;
		} catch (error) {
			status.status = "error";
			status.error = error instanceof Error ? error.message : "Unknown error";
			this.serverStatus.set(id, status);

			log.error("Stdio connection failed", error instanceof Error ? error : new Error(String(error)), {
				id,
				name: config.name,
				command: config.command,
				args: config.args,
			});

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
				log.info("Stdio server disconnected", { id, name: connection.config.name });
			} catch (error) {
				log.error("Error during stdio disconnect", error instanceof Error ? error : new Error(String(error)), { id });
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
			log.warn("Stdio tool call failed: not connected", { serverId, toolName });
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
