/**
 * MCP API 路由
 * 提供 MCP 相关的 HTTP API 接口，包括第三方 MCP 中转
 */

import { SwaggerRouter } from "koa-swagger-decorator";
import {
	body,
	path,
	query,
	request,
	summary,
	tags,
} from "koa-swagger-decorator";
import { Context } from "koa";
import { mcpService } from "../../services/mcp/McpService";
import { thirdPartyMcpService } from "../../services/mcp/ThirdPartyMcpService";
import { mcpMarketService } from "../../services/mcp/McpMarketService";
import type {
	McpServerConfig,
	McpMarketSearchParams,
	McpToolCallRequest,
} from "../../ipc/types";

const tag = tags(["MCP"]);

// 统一的 API 响应格式
interface ApiResponse<T = unknown> {
	code: number;
	message: string;
	data?: T;
	timestamp: number;
}

function createResponse<T>(
	ctx: Context,
	code: number,
	message: string,
	data?: T,
): ApiResponse<T> {
	ctx.status = code;
	return {
		code,
		message,
		data,
		timestamp: Date.now(),
	};
}

export class McpController {
	// ========== 服务器管理 ==========

	@request("get", "/api/mcp/servers")
	@summary("获取所有 MCP 服务器")
	@tag
	async listServers(ctx: Context) {
		try {
			const servers = mcpService.listServers();
			ctx.body = createResponse(ctx, 200, "Success", servers);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to list servers",
			);
		}
	}

	@request("get", "/api/mcp/servers/:id")
	@summary("获取 MCP 服务器详情")
	@tag
	@path({
		id: { type: "string", required: true, description: "服务器 ID" },
	})
	async getServer(ctx: Context) {
		try {
			const { id } = ctx.params;
			const server = mcpService.getServer(id);
			const status = mcpService.getServerStatus(id);

			if (!server) {
				ctx.body = createResponse(ctx, 404, "Server not found");
				return;
			}

			ctx.body = createResponse(ctx, 200, "Success", { ...server, ...status });
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get server",
			);
		}
	}

	@request("post", "/api/mcp/servers")
	@summary("添加 MCP 服务器")
	@tag
	@body({
		id: {
			type: "string",
			required: false,
			description: "服务器 ID（可选，自动生成）",
		},
		name: { type: "string", required: true, description: "服务器名称" },
		type: {
			type: "string",
			required: true,
			enum: ["builtin", "third-party", "market"],
			description: "服务器类型",
		},
		transport: {
			type: "string",
			required: true,
			enum: ["stdio", "sse", "http"],
			description: "传输类型",
		},
		command: {
			type: "string",
			required: false,
			description: "命令（stdio 类型需要）",
		},
		args: {
			type: "array",
			required: false,
			description: "参数（stdio 类型需要）",
		},
		env: { type: "object", required: false, description: "环境变量" },
		url: {
			type: "string",
			required: false,
			description: "URL（sse/http 类型需要）",
		},
		headers: {
			type: "object",
			required: false,
			description: "请求头（sse/http 类型需要）",
		},
	})
	async addServer(ctx: Context) {
		try {
			const config = ctx.request.body as McpServerConfig;

			// 自动生成 ID
			if (!config.id) {
				config.id = `${config.type}-${Date.now()}`;
			}

			mcpService.addServer(config);
			ctx.body = createResponse(ctx, 201, "Server added successfully", config);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to add server",
			);
		}
	}

	@request("delete", "/api/mcp/servers/:id")
	@summary("删除 MCP 服务器")
	@tag
	@path({
		id: { type: "string", required: true, description: "服务器 ID" },
	})
	async removeServer(ctx: Context) {
		try {
			const { id } = ctx.params;
			await mcpService.removeServer(id);
			ctx.body = createResponse(ctx, 200, "Server removed successfully");
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to remove server",
			);
		}
	}

	@request("post", "/api/mcp/servers/:id/connect")
	@summary("连接 MCP 服务器")
	@tag
	@path({
		id: { type: "string", required: true, description: "服务器 ID" },
	})
	async connectServer(ctx: Context) {
		try {
			const { id } = ctx.params;
			const status = await mcpService.connect(id);
			ctx.body = createResponse(ctx, 200, "Connected successfully", status);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to connect server",
			);
		}
	}

	@request("post", "/api/mcp/servers/:id/disconnect")
	@summary("断开 MCP 服务器连接")
	@tag
	@path({
		id: { type: "string", required: true, description: "服务器 ID" },
	})
	async disconnectServer(ctx: Context) {
		try {
			const { id } = ctx.params;
			await mcpService.disconnect(id);
			ctx.body = createResponse(ctx, 200, "Disconnected successfully");
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to disconnect server",
			);
		}
	}

	// ========== 工具调用 ==========

	@request("get", "/api/mcp/servers/:id/tools")
	@summary("获取服务器工具列表")
	@tag
	@path({
		id: { type: "string", required: true, description: "服务器 ID" },
	})
	async getServerTools(ctx: Context) {
		try {
			const { id } = ctx.params;
			const tools = mcpService.getServerTools(id);
			ctx.body = createResponse(ctx, 200, "Success", tools);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get tools",
			);
		}
	}

	@request("get", "/api/mcp/tools")
	@summary("获取所有可用工具")
	@tag
	async getAllTools(ctx: Context) {
		try {
			const tools = mcpService.getAllAvailableTools();
			ctx.body = createResponse(ctx, 200, "Success", tools);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get all tools",
			);
		}
	}

	@request("post", "/api/mcp/tools/call")
	@summary("调用 MCP 工具（统一接口）")
	@tag
	@body({
		serverId: { type: "string", required: true, description: "服务器 ID" },
		toolName: { type: "string", required: true, description: "工具名称" },
		args: { type: "object", required: true, description: "工具参数" },
	})
	async callTool(ctx: Context) {
		try {
			const { serverId, toolName, args } = ctx.request
				.body as McpToolCallRequest;
			const result = await mcpService.callTool(serverId, toolName, args);

			if (result.success) {
				ctx.body = createResponse(ctx, 200, "Tool called successfully", result);
			} else {
				ctx.body = createResponse(
					ctx,
					400,
					result.error || "Tool call failed",
					result,
				);
			}
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to call tool",
			);
		}
	}

	@request("post", "/api/mcp/tools/call-batch")
	@summary("批量调用 MCP 工具")
	@tag
	@body({
		requests: {
			type: "array",
			required: true,
			description: "工具调用请求列表",
			items: {
				type: "object",
				properties: {
					serverId: { type: "string", required: true },
					toolName: { type: "string", required: true },
					args: { type: "object", required: true },
				},
			},
		},
	})
	async callToolsBatch(ctx: Context) {
		try {
			const { requests } = ctx.request.body as {
				requests: Array<{
					serverId: string;
					toolName: string;
					args: Record<string, unknown>;
				}>;
			};
			const results = await mcpService.callToolsBatch(requests);
			ctx.body = createResponse(ctx, 200, "Batch call completed", results);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to call tools batch",
			);
		}
	}

	// ========== 第三方 MCP 中转 ==========

	@request("post", "/api/mcp/proxy/:serverId/:path*")
	@summary("代理请求到第三方 MCP 服务器")
	@tag
	@path({
		serverId: {
			type: "string",
			required: true,
			description: "第三方服务器 ID",
		},
		path: { type: "string", required: true, description: "目标路径" },
	})
	async proxyRequest(ctx: Context) {
		try {
			const { serverId, path } = ctx.params;
			const method = ctx.method as "GET" | "POST" | "PUT" | "DELETE";

			// 将 path 数组或字符串拼接成完整路径
			const fullPath = Array.isArray(path) ? path.join("/") : path || "";

			const result = await thirdPartyMcpService.proxyRequest(serverId, {
				endpoint: fullPath ? `/${fullPath}` : "/",
				method,
				body: ctx.request.body,
				headers: ctx.headers as Record<string, string>,
			});

			if (result.success) {
				ctx.body = createResponse(
					ctx,
					200,
					"Proxy request successful",
					result.data,
				);
			} else {
				ctx.body = createResponse(
					ctx,
					result.statusCode || 500,
					result.error || "Proxy request failed",
					result,
				);
			}
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Proxy request failed",
			);
		}
	}

	// ========== MCP 市场 ==========

	@request("get", "/api/mcp/market/search")
	@summary("搜索 MCP 市场")
	@tag
	@query({
		q: { type: "string", required: false, description: "搜索关键词" },
		tags: { type: "string", required: false, description: "标签（逗号分隔）" },
		sortBy: {
			type: "string",
			required: false,
			enum: ["downloads", "rating", "newest"],
			description: "排序方式",
		},
		page: { type: "number", required: false, description: "页码" },
		limit: { type: "number", required: false, description: "每页数量" },
	})
	async searchMarket(ctx: Context) {
		try {
			const { q, tags, sortBy, page, limit } = ctx.query;

			const params: McpMarketSearchParams = {
				query: q as string,
				tags: tags ? (tags as string).split(",") : undefined,
				sortBy: sortBy as "downloads" | "rating" | "newest",
				page: page ? parseInt(page as string, 10) : 1,
				limit: limit ? parseInt(limit as string, 10) : 20,
			};

			const result = await mcpMarketService.search(params);
			ctx.body = createResponse(ctx, 200, "Success", result);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to search market",
			);
		}
	}

	@request("get", "/api/mcp/market/popular")
	@summary("获取热门 MCP")
	@tag
	@query({
		limit: { type: "number", required: false, description: "数量限制" },
	})
	async getPopular(ctx: Context) {
		try {
			const limit = ctx.query.limit
				? parseInt(ctx.query.limit as string, 10)
				: 10;
			const items = await mcpMarketService.getPopular(limit);
			ctx.body = createResponse(ctx, 200, "Success", items);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get popular items",
			);
		}
	}

	@request("get", "/api/mcp/market/top-rated")
	@summary("获取高评分 MCP")
	@tag
	@query({
		limit: { type: "number", required: false, description: "数量限制" },
	})
	async getTopRated(ctx: Context) {
		try {
			const limit = ctx.query.limit
				? parseInt(ctx.query.limit as string, 10)
				: 10;
			const items = await mcpMarketService.getTopRated(limit);
			ctx.body = createResponse(ctx, 200, "Success", items);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error
					? error.message
					: "Failed to get top rated items",
			);
		}
	}

	@request("get", "/api/mcp/market/newest")
	@summary("获取最新 MCP")
	@tag
	@query({
		limit: { type: "number", required: false, description: "数量限制" },
	})
	async getNewest(ctx: Context) {
		try {
			const limit = ctx.query.limit
				? parseInt(ctx.query.limit as string, 10)
				: 10;
			const items = await mcpMarketService.getNewest(limit);
			ctx.body = createResponse(ctx, 200, "Success", items);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get newest items",
			);
		}
	}

	@request("get", "/api/mcp/market/items/:id")
	@summary("获取 MCP 详情")
	@tag
	@path({
		id: { type: "string", required: true, description: "MCP ID" },
	})
	async getMarketItem(ctx: Context) {
		try {
			const { id } = ctx.params;
			const item = await mcpMarketService.getDetail(id);

			if (!item) {
				ctx.body = createResponse(ctx, 404, "Item not found");
				return;
			}

			ctx.body = createResponse(ctx, 200, "Success", item);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get item detail",
			);
		}
	}

	@request("get", "/api/mcp/market/tags")
	@summary("获取所有标签")
	@tag
	async getTags(ctx: Context) {
		try {
			const tags = await mcpMarketService.getTags();
			ctx.body = createResponse(ctx, 200, "Success", tags);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get tags",
			);
		}
	}

	@request("post", "/api/mcp/market/install")
	@summary("安装 MCP")
	@tag
	@body({
		marketItem: { type: "object", required: true, description: "市场项目" },
		customConfig: {
			type: "object",
			required: false,
			description: "自定义配置",
		},
	})
	async installMcp(ctx: Context) {
		try {
			const { marketItem, customConfig } = ctx.request.body as {
				marketItem: Parameters<typeof mcpMarketService.install>[0];
				customConfig?: Parameters<typeof mcpMarketService.install>[1];
			};

			const config = await mcpMarketService.install(marketItem, customConfig);
			mcpService.addServer(config);

			ctx.body = createResponse(ctx, 201, "MCP installed successfully", config);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to install MCP",
			);
		}
	}

	@request("get", "/api/mcp/market/items/:id/readme")
	@summary("获取 MCP README")
	@tag
	@path({
		id: { type: "string", required: true, description: "MCP ID" },
	})
	async getReadme(ctx: Context) {
		try {
			const { id } = ctx.params;
			const item = await mcpMarketService.getDetail(id);

			if (!item) {
				ctx.body = createResponse(ctx, 404, "Item not found");
				return;
			}

			const readme = await mcpMarketService.getReadme(item);
			ctx.body = createResponse(ctx, 200, "Success", { readme });
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get readme",
			);
		}
	}

	// ========== 状态和健康检查 ==========

	@request("get", "/api/mcp/status")
	@summary("获取 MCP 服务状态")
	@tag
	async getStatus(ctx: Context) {
		try {
			const servers = mcpService.listServers();
			const statuses = mcpService.getAllServerStatus();

			const connected = statuses.filter((s) => s.status === "connected").length;
			const disconnected = statuses.filter(
				(s) => s.status === "disconnected",
			).length;
			const error = statuses.filter((s) => s.status === "error").length;

			ctx.body = createResponse(ctx, 200, "Success", {
				total: servers.length,
				connected,
				disconnected,
				error,
				servers: statuses,
			});
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to get status",
			);
		}
	}
}

export const mcpRouter = new SwaggerRouter();
mcpRouter.map(McpController, {});
