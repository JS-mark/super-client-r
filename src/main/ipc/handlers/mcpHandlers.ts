/**
 * MCP IPC 处理器
 * 处理来自渲染进程的 MCP 相关请求
 */

import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import { mcpService } from "../../services/mcp/McpService";
import { builtinMcpService } from "../../services/mcp/BuiltinMcpService";
import { thirdPartyMcpService } from "../../services/mcp/ThirdPartyMcpService";
import { mcpMarketService } from "../../services/mcp/McpMarketService";
import { MCP_CHANNELS } from "../channels";
import type {
	McpServerConfig,
	McpMarketSearchParams,
	McpMarketItem,
} from "../types";

/**
 * 注册 MCP IPC 处理器
 */
export function registerMcpHandlers(): void {
	// ========== 基础服务器管理 ==========

	// 连接服务器
	ipcMain.handle(
		MCP_CHANNELS.CONNECT,
		async (_event: IpcMainInvokeEvent, id: string) => {
			try {
				const status = await mcpService.connect(id);
				return { success: true, data: status };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 断开连接
	ipcMain.handle(
		MCP_CHANNELS.DISCONNECT,
		async (_event: IpcMainInvokeEvent, id: string) => {
			try {
				await mcpService.disconnect(id);
				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 列出服务器
	ipcMain.handle(MCP_CHANNELS.LIST_SERVERS, () => {
		const servers = mcpService.listServers();
		return { success: true, data: servers };
	});

	// 获取服务器工具
	ipcMain.handle(
		MCP_CHANNELS.GET_TOOLS,
		(_event: IpcMainInvokeEvent, id: string) => {
			const tools = mcpService.getServerTools(id);
			return { success: true, data: tools };
		},
	);

	// ========== 服务器配置管理 ==========

	// 添加服务器
	ipcMain.handle(
		"mcp:add-server",
		(_event: IpcMainInvokeEvent, config: McpServerConfig) => {
			try {
				mcpService.addServer(config);
				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 移除服务器
	ipcMain.handle(
		"mcp:remove-server",
		async (_event: IpcMainInvokeEvent, id: string) => {
			try {
				await mcpService.removeServer(id);
				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 获取所有服务器状态
	ipcMain.handle("mcp:get-all-status", () => {
		const statuses = mcpService.getAllServerStatus();
		return { success: true, data: statuses };
	});

	// 调用工具
	ipcMain.handle(
		"mcp:call-tool",
		async (
			_event: IpcMainInvokeEvent,
			serverId: string,
			toolName: string,
			args: Record<string, unknown>,
		) => {
			try {
				const result = await mcpService.callTool(serverId, toolName, args);
				return { success: true, data: result };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 获取所有可用工具
	ipcMain.handle("mcp:get-all-tools", () => {
		const tools = mcpService.getAllAvailableTools();
		return { success: true, data: tools };
	});

	// ========== 内置 MCP 管理 ==========

	// 获取所有内置 MCP 定义
	ipcMain.handle("mcp:builtin:get-definitions", () => {
		const definitions = builtinMcpService.getAllDefinitions();
		return { success: true, data: definitions };
	});

	// 从内置定义创建服务器配置
	ipcMain.handle(
		"mcp:builtin:create-config",
		(
			_event: IpcMainInvokeEvent,
			{ definitionId, config }: { definitionId: string; config?: Record<string, unknown> },
		) => {
			try {
				const serverConfig = builtinMcpService.createServerConfig(definitionId, config);
				if (!serverConfig) {
					return { success: false, error: "Definition not found" };
				}
				return { success: true, data: serverConfig };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 搜索内置 MCP
	ipcMain.handle(
		"mcp:builtin:search",
		(
			_event: IpcMainInvokeEvent,
			{ keyword, tags }: { keyword?: string; tags?: string[] },
		) => {
			let results;
			if (keyword) {
				results = builtinMcpService.searchByKeyword(keyword);
			} else if (tags) {
				results = builtinMcpService.searchByTags(tags);
			} else {
				results = builtinMcpService.getAllDefinitions();
			}
			return { success: true, data: results };
		},
	);

	// ========== 第三方 MCP 管理 ==========

	// 添加第三方 MCP 服务器
	ipcMain.handle(
		"mcp:thirdparty:add",
		(_event: IpcMainInvokeEvent, config: McpServerConfig) => {
			try {
				// 确保类型为第三方
				const thirdPartyConfig = { ...config, type: "third-party" as const };
				mcpService.addServer(thirdPartyConfig);
				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 代理请求到第三方 MCP
	ipcMain.handle(
		"mcp:thirdparty:proxy",
		async (
			_event: IpcMainInvokeEvent,
			{
				serverId,
				request,
			}: {
				serverId: string;
				request: {
					endpoint: string;
					method: "GET" | "POST" | "PUT" | "DELETE";
					body?: unknown;
					headers?: Record<string, string>;
				};
			},
		) => {
			try {
				const result = await thirdPartyMcpService.proxyRequest(serverId, request);
				return { success: true, data: result };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// ========== MCP 市场管理 ==========

	// 搜索市场 MCP
	ipcMain.handle(
		"mcp:market:search",
		async (_event: IpcMainInvokeEvent, params: McpMarketSearchParams) => {
			try {
				const result = await mcpMarketService.search(params);
				return { success: true, data: result };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 获取热门 MCP
	ipcMain.handle("mcp:market:popular", async (_event: IpcMainInvokeEvent, limit?: number) => {
		try {
			const items = await mcpMarketService.getPopular(limit);
			return { success: true, data: items };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});

	// 获取高评分 MCP
	ipcMain.handle("mcp:market:top-rated", async (_event: IpcMainInvokeEvent, limit?: number) => {
		try {
			const items = await mcpMarketService.getTopRated(limit);
			return { success: true, data: items };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});

	// 获取最新 MCP
	ipcMain.handle("mcp:market:newest", async (_event: IpcMainInvokeEvent, limit?: number) => {
		try {
			const items = await mcpMarketService.getNewest(limit);
			return { success: true, data: items };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});

	// 获取 MCP 详情
	ipcMain.handle("mcp:market:get-detail", async (_event: IpcMainInvokeEvent, id: string) => {
		try {
			const item = await mcpMarketService.getDetail(id);
			return { success: true, data: item };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});

	// 获取所有标签
	ipcMain.handle("mcp:market:get-tags", async () => {
		try {
			const tags = await mcpMarketService.getTags();
			return { success: true, data: tags };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});

	// 安装 MCP
	ipcMain.handle(
		"mcp:market:install",
		async (
			_event: IpcMainInvokeEvent,
			{
				marketItem,
				customConfig,
			}: {
				marketItem: McpMarketItem;
				customConfig?: { name?: string; env?: Record<string, string>; url?: string };
			},
		) => {
			try {
				const config = await mcpMarketService.install(marketItem, customConfig);
				// 添加到 MCP 服务
				mcpService.addServer(config);
				return { success: true, data: config };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		},
	);

	// 获取 README
	ipcMain.handle("mcp:market:get-readme", async (_event: IpcMainInvokeEvent, marketItem: McpMarketItem) => {
		try {
			const readme = await mcpMarketService.getReadme(marketItem);
			return { success: true, data: readme };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});

	// 设置市场 API URL
	ipcMain.handle("mcp:market:set-api-url", (_event: IpcMainInvokeEvent, url: string) => {
		try {
			mcpMarketService.setApiUrl(url);
			return { success: true };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	});
}
