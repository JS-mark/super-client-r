/**
 * 第三方 MCP 服务器服务
 * 通过 apiServer 中转第三方 MCP 调用，统一接口协议和输出参数
 */

import { EventEmitter } from "events";
import type {
	McpServerConfig,
	McpServerStatus,
	McpTool,
	ThirdPartyMcpRequest,
	ThirdPartyMcpResponse,
} from "../../ipc/types";

interface ThirdPartyConnection {
	config: McpServerConfig;
	tools: McpTool[];
	lastUsed: number;
}

// 统一的工具调用响应格式
export interface UnifiedToolResponse {
	success: boolean;
	data?: {
		content?: Array<{
			type: "text" | "image" | "resource";
			text?: string;
			data?: string;
			mimeType?: string;
			resource?: {
				uri: string;
				mimeType?: string;
				text?: string;
				blob?: string;
			};
		}>;
		isError?: boolean;
	};
	error?: {
		code: string;
		message: string;
		details?: unknown;
	};
	metadata?: {
		serverId: string;
		toolName: string;
		timestamp: number;
		duration: number;
	};
}

export class ThirdPartyMcpService extends EventEmitter {
	private connections: Map<string, ThirdPartyConnection> = new Map();
	private serverStatus: Map<string, McpServerStatus> = new Map();
	private requestTimeout = 30000; // 30秒超时

	/**
	 * 添加第三方 MCP 服务器配置
	 */
	addServer(config: McpServerConfig): void {
		this.serverStatus.set(config.id, {
			id: config.id,
			status: "disconnected",
			type: "third-party",
			transport: config.transport,
		});
		this.emit("server-added", config);
	}

	/**
	 * 移除第三方 MCP 服务器
	 */
	async removeServer(id: string): Promise<void> {
		await this.disconnect(id);
		this.connections.delete(id);
		this.serverStatus.delete(id);
		this.emit("server-removed", id);
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
	 * 连接到第三方 MCP 服务器
	 */
	async connect(id: string): Promise<McpServerStatus> {
		const status = this.serverStatus.get(id);
		if (!status) {
			throw new Error(`Server ${id} not found`);
		}

		const connection = this.connections.get(id);
		if (!connection) {
			throw new Error(`Server ${id} configuration not found`);
		}

		status.status = "connecting";
		this.serverStatus.set(id, status);
		this.emit("status-changed", { id, status: "connecting" });

		try {
			// 获取工具列表
			const tools = await this.fetchTools(connection.config);
			connection.tools = tools;
			connection.lastUsed = Date.now();

			status.status = "connected";
			status.tools = tools;
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
	 * 断开第三方 MCP 服务器连接
	 */
	async disconnect(id: string): Promise<void> {
		const connection = this.connections.get(id);
		if (connection) {
			connection.tools = [];
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
	 * 获取服务器工具列表
	 */
	getServerTools(serverId: string): McpTool[] {
		return this.connections.get(serverId)?.tools || [];
	}

	/**
	 * 调用第三方 MCP 工具（通过中转）
	 */
	async callTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<UnifiedToolResponse> {
		const startTime = Date.now();
		const connection = this.connections.get(serverId);

		if (!connection) {
			return {
				success: false,
				error: {
					code: "SERVER_NOT_FOUND",
					message: `Server ${serverId} not found`,
				},
				metadata: {
					serverId,
					toolName,
					timestamp: startTime,
					duration: 0,
				},
			};
		}

		const status = this.serverStatus.get(serverId);
		if (status?.status !== "connected") {
			return {
				success: false,
				error: {
					code: "SERVER_NOT_CONNECTED",
					message: `Server ${serverId} is not connected`,
				},
				metadata: {
					serverId,
					toolName,
					timestamp: startTime,
					duration: 0,
				},
			};
		}

		try {
			// 调用第三方 MCP 工具
			const result = await this.executeToolCall(connection.config, toolName, args);

			connection.lastUsed = Date.now();
			this.emit("tool-called", { serverId, toolName, args });

			// 统一输出格式
			return this.unifyResponse(result, {
				serverId,
				toolName,
				timestamp: startTime,
				duration: Date.now() - startTime,
			});
		} catch (error) {
			this.emit("error", { serverId, toolName, error });

			return {
				success: false,
				error: {
					code: "TOOL_CALL_FAILED",
					message: error instanceof Error ? error.message : "Unknown error",
					details: error,
				},
				metadata: {
					serverId,
					toolName,
					timestamp: startTime,
					duration: Date.now() - startTime,
				},
			};
		}
	}

	/**
	 * 获取所有可用工具
	 */
	getAllAvailableTools(): Array<{ serverId: string; tool: McpTool }> {
		const tools: Array<{ serverId: string; tool: McpTool }> = [];

		for (const [id, connection] of this.connections.entries()) {
			const status = this.serverStatus.get(id);
			if (status?.status === "connected" && connection.tools) {
				for (const tool of connection.tools) {
					tools.push({ serverId: id, tool });
				}
			}
		}

		return tools;
	}

	/**
	 * 从远程服务器获取工具列表
	 */
	private async fetchTools(config: McpServerConfig): Promise<McpTool[]> {
		if (!config.url) {
			throw new Error("URL is required for third-party MCP server");
		}

		// 根据传输类型选择获取方式
		switch (config.transport) {
			case "sse":
				return this.fetchToolsViaSSE(config);
			case "http":
				return this.fetchToolsViaHTTP(config);
			default:
				throw new Error(`Unsupported transport type: ${config.transport}`);
		}
	}

	/**
	 * 通过 SSE 获取工具列表
	 */
	private async fetchToolsViaSSE(config: McpServerConfig): Promise<McpTool[]> {
		// SSE 实现 - 建立连接并获取工具列表
		const response = await fetch(`${config.url}/tools`, {
			method: "GET",
			headers: {
				Accept: "text/event-stream",
				...config.headers,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch tools: ${response.statusText}`);
		}

		const data = (await response.json()) as { tools?: McpTool[] };
		return data.tools || [];
	}

	/**
	 * 通过 HTTP 获取工具列表
	 */
	private async fetchToolsViaHTTP(config: McpServerConfig): Promise<McpTool[]> {
		const response = await fetch(`${config.url}/tools`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				...config.headers,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch tools: ${response.statusText}`);
		}

		const data = (await response.json()) as { tools?: McpTool[] };
		return data.tools || [];
	}

	/**
	 * 执行工具调用
	 */
	private async executeToolCall(
		config: McpServerConfig,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<unknown> {
		if (!config.url) {
			throw new Error("URL is required for third-party MCP server");
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

		try {
			const response = await fetch(`${config.url}/tools/call`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...config.headers,
				},
				body: JSON.stringify({
					name: toolName,
					arguments: args,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Tool call failed: ${response.status} - ${errorText}`);
			}

			return await response.json();
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	/**
	 * 统一响应格式
	 */
	private unifyResponse(
		result: unknown,
		metadata: UnifiedToolResponse["metadata"],
	): UnifiedToolResponse {
		// 如果结果已经是统一格式，直接返回
		if (
			result &&
			typeof result === "object" &&
			"success" in result &&
			typeof (result as UnifiedToolResponse).success === "boolean"
		) {
			return { ...(result as UnifiedToolResponse), metadata };
		}

		// 转换第三方 MCP 响应为标准格式
		const content: Array<{
			type: "text" | "image" | "resource";
			text?: string;
			data?: string;
			mimeType?: string;
			resource?: {
				uri: string;
				mimeType?: string;
				text?: string;
				blob?: string;
			};
		}> = [];

		if (typeof result === "string") {
			content.push({ type: "text", text: result });
		} else if (result && typeof result === "object") {
			// 处理 MCP 标准响应格式
			const mcpResult = result as {
				content?: Array<{ type: string; text?: string; data?: string }>;
				text?: string;
				data?: unknown;
			};

			if (mcpResult.content && Array.isArray(mcpResult.content)) {
				for (const item of mcpResult.content) {
					if (item.type === "text" && item.text) {
						content.push({ type: "text", text: item.text });
					} else if (item.type === "image" && item.data) {
						content.push({ type: "image", data: item.data });
					}
				}
			} else if (mcpResult.text) {
				content.push({ type: "text", text: mcpResult.text });
			} else {
				// 将对象序列化为文本
				content.push({
					type: "text",
					text: JSON.stringify(result, null, 2),
				});
			}
		}

		return {
			success: true,
			data: { content },
			metadata,
		};
	}

	/**
	 * 代理请求到第三方 MCP 服务器
	 */
	async proxyRequest(
		serverId: string,
		request: ThirdPartyMcpRequest,
	): Promise<ThirdPartyMcpResponse> {
		const connection = this.connections.get(serverId);
		if (!connection) {
			return {
				success: false,
				error: `Server ${serverId} not found`,
				statusCode: 404,
			};
		}

		const { config } = connection;
		if (!config.url) {
			return {
				success: false,
				error: "Server URL not configured",
				statusCode: 500,
			};
		}

		try {
			const url = `${config.url}${request.endpoint}`;
			const response = await fetch(url, {
				method: request.method,
				headers: {
					"Content-Type": "application/json",
					...config.headers,
					...request.headers,
				},
				body: request.body ? JSON.stringify(request.body) : undefined,
			});

			const data = await response.json().catch(() => null);

			return {
				success: response.ok,
				data,
				statusCode: response.status,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Request failed",
				statusCode: 500,
			};
		}
	}

	/**
	 * 注册服务器配置（用于初始化时）
	 */
	registerServer(config: McpServerConfig): void {
		if (!this.connections.has(config.id)) {
			this.connections.set(config.id, {
				config,
				tools: [],
				lastUsed: 0,
			});
		}

		if (!this.serverStatus.has(config.id)) {
			this.serverStatus.set(config.id, {
				id: config.id,
				status: "disconnected",
				type: "third-party",
				transport: config.transport,
			});
		}
	}
}

// 单例实例
export const thirdPartyMcpService = new ThirdPartyMcpService();
