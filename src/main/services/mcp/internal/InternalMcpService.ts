/**
 * Internal MCP 服务管理器
 * 管理所有内置的 in-process MCP 服务器
 */

import type { McpServerConfig, McpTool } from "../../../ipc/types";
import { logger } from "../../../utils/logger";
import type { InternalMcpServer, InternalToolResult } from "./types";

const log = logger.withContext("InternalMCP");

export class InternalMcpService {
	private servers: Map<string, InternalMcpServer> = new Map();

	/**
	 * 注册一个 internal MCP 服务器
	 */
	register(server: InternalMcpServer): void {
		log.info("Registering internal server", {
			id: server.id,
			name: server.name,
			toolCount: server.tools.length,
		});
		this.servers.set(server.id, server);
	}

	/**
	 * 调用工具
	 */
	async callTool(
		serverId: string,
		toolName: string,
		args: Record<string, unknown>,
	): Promise<InternalToolResult> {
		const server = this.servers.get(serverId);
		if (!server) {
			return {
				content: [
					{ type: "text", text: `Internal server ${serverId} not found` },
				],
				isError: true,
			};
		}

		const handler = server.handlers.get(toolName);
		if (!handler) {
			return {
				content: [
					{
						type: "text",
						text: `Tool ${toolName} not found in server ${serverId}`,
					},
				],
				isError: true,
			};
		}

		log.debug("Calling internal tool", { serverId, toolName });

		try {
			return await handler(args);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error(
				"Internal tool call failed",
				error instanceof Error ? error : new Error(message),
				{
					serverId,
					toolName,
				},
			);
			return {
				content: [{ type: "text", text: `Error: ${message}` }],
				isError: true,
			};
		}
	}

	/**
	 * 获取指定服务器的工具列表（McpTool 格式）
	 */
	getTools(serverId: string): McpTool[] {
		const server = this.servers.get(serverId);
		if (!server) return [];

		return server.tools.map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
		}));
	}

	/**
	 * 获取所有 internal 服务器的 McpServerConfig 格式
	 */
	getAllServerConfigs(): McpServerConfig[] {
		return Array.from(this.servers.values()).map((server) => ({
			id: server.id,
			name: server.name,
			type: "internal" as const,
			transport: "internal" as const,
			description: server.description,
			version: server.version,
			enabled: true,
		}));
	}

	/**
	 * 获取所有 internal 服务器的工具（带 serverId）
	 */
	getAllTools(): Array<{ serverId: string; tool: McpTool }> {
		const tools: Array<{ serverId: string; tool: McpTool }> = [];
		for (const [serverId, server] of this.servers.entries()) {
			for (const t of server.tools) {
				tools.push({
					serverId,
					tool: {
						name: t.name,
						description: t.description,
						inputSchema: t.inputSchema,
					},
				});
			}
		}
		return tools;
	}

	/**
	 * 初始化所有内置服务器
	 */
	async initialize(): Promise<void> {
		log.info("Initializing internal MCP servers");

		// 延迟加载各服务器实现，避免循环依赖
		const { createFetchServer } = await import("./servers/fetchServer");
		const { createFileSystemServer } = await import(
			"./servers/fileSystemServer"
		);
		const { createPythonServer } = await import("./servers/pythonServer");
		const { createJavaScriptServer } = await import("./servers/jsServer");
		const { createBrowserServer } = await import("./servers/browserServer");
		const { createImageGenServer } = await import("./servers/imageGenServer");
		const { createNodejsServer } = await import("./servers/nodejsServer");
		const { createBashServer } = await import("./servers/bashServer");

		const servers = [
			createFetchServer(),
			createFileSystemServer(),
			createPythonServer(),
			createJavaScriptServer(),
			createNodejsServer(),
			createBashServer(),
			createBrowserServer(),
			createImageGenServer(),
		];

		for (const server of servers) {
			this.register(server);
			if (server.initialize) {
				try {
					await server.initialize();
					log.info("Internal server initialized", { id: server.id });
				} catch (error) {
					log.error(
						"Failed to initialize internal server",
						error instanceof Error ? error : new Error(String(error)),
						{ id: server.id },
					);
				}
			}
		}

		log.info("Internal MCP servers initialized", {
			count: this.servers.size,
			servers: Array.from(this.servers.keys()),
		});
	}

	/**
	 * 清理所有内置服务器
	 */
	async cleanup(): Promise<void> {
		log.info("Cleaning up internal MCP servers");
		for (const [id, server] of this.servers.entries()) {
			if (server.cleanup) {
				try {
					await server.cleanup();
					log.info("Internal server cleaned up", { id });
				} catch (error) {
					log.error(
						"Failed to cleanup internal server",
						error instanceof Error ? error : new Error(String(error)),
						{ id },
					);
				}
			}
		}
		this.servers.clear();
	}
}

export const internalMcpService = new InternalMcpService();
