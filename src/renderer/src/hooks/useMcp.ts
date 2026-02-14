/**
 * MCP Hook
 * 管理 MCP 服务器的连接、工具调用和市场
 */

import { useCallback, useEffect, useState } from "react";
import { mcpClient } from "../services/mcp/mcpService";
import { useMcpStore } from "../stores/mcpStore";
import type {
	McpMarketItem,
	McpServerConfig,
	McpTool,
} from "../types/electron";

export function useMcp() {
	const [loading, setLoading] = useState(false);

	// Store integration
	const {
		servers: storeServers,
		builtinDefinitions,
		isLoadingBuiltin,
		marketItems,
		isLoadingMarket,
		marketError,
		marketTotal,
		marketPage,
		marketLimit,
		marketTags,
		addServer: addToStore,
		removeServer: removeFromStore,
		updateServer: updateInStore,
		enableServer,
		disableServer,
		setServers,
		setBuiltinDefinitions,
		setLoadingBuiltin,
		setMarketItems,
		setMarketLoading,
		setMarketError,
		setMarketPagination,
		setMarketTags,
		getBuiltinServers,
		getThirdPartyServers,
		getMarketServers,
		getEnabledServers,
		getConnectedServers,
	} = useMcpStore();

	// ========== 服务器管理 ==========

	// 加载服务器列表
	const loadServers = useCallback(async () => {
		setLoading(true);
		try {
			const servers = await mcpClient.listServers();
			// 同步到 store
			const serversWithStatus = servers.map((config) => {
				const existing = storeServers.find((s) => s.id === config.id);
				return {
					...config,
					status: existing?.status || "disconnected",
					enabled: existing?.enabled ?? true,
				};
			});
			setServers(serversWithStatus);
		} catch (error) {
			console.error("Failed to load servers:", error);
		} finally {
			setLoading(false);
		}
	}, [storeServers, setServers]);

	// 加载服务器状态
	const loadStatuses = useCallback(async () => {
		try {
			const statuses = await mcpClient.getAllStatus();
			for (const status of statuses) {
				updateInStore(status.id, {
					status: status.status,
					tools: status.tools,
					error: status.error,
				});
			}
		} catch (error) {
			console.error("Failed to load statuses:", error);
		}
	}, [updateInStore]);

	// 添加服务器
	const addServer = useCallback(
		async (config: McpServerConfig) => {
			setLoading(true);
			try {
				await mcpClient.addServer(config);
				addToStore({
					...config,
					status: "disconnected",
					enabled: true,
				});
			} catch (error: any) {
				throw new Error(error.message || "Failed to add server");
			} finally {
				setLoading(false);
			}
		},
		[addToStore],
	);

	// 移除服务器
	const removeServer = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				await mcpClient.removeServer(id);
				removeFromStore(id);
			} catch (error: any) {
				throw new Error(error.message || "Failed to remove server");
			} finally {
				setLoading(false);
			}
		},
		[removeFromStore],
	);

	// 连接服务器
	const connect = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				const status = await mcpClient.connect(id);
				updateInStore(id, {
					status: status.status,
					tools: status.tools,
					error: status.error,
				});
				return status;
			} catch (error: any) {
				updateInStore(id, { status: "error", error: error.message });
				throw new Error(error.message || "Failed to connect");
			} finally {
				setLoading(false);
			}
		},
		[updateInStore],
	);

	// 断开服务器
	const disconnect = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				await mcpClient.disconnect(id);
				updateInStore(id, { status: "disconnected", tools: [] });
			} catch (error: any) {
				throw new Error(error.message || "Failed to disconnect");
			} finally {
				setLoading(false);
			}
		},
		[updateInStore],
	);

	// 切换服务器启用状态
	const toggleServer = useCallback(
		async (id: string) => {
			const server = storeServers.find((s) => s.id === id);
			if (!server) return;

			if (server.enabled) {
				disableServer(id);
				if (server.status === "connected") {
					await disconnect(id);
				}
			} else {
				enableServer(id);
			}
		},
		[storeServers, enableServer, disableServer, disconnect],
	);

	// 获取工具
	const getTools = useCallback(async (id: string): Promise<McpTool[]> => {
		try {
			return await mcpClient.getTools(id);
		} catch (error: any) {
			throw new Error(error.message || "Failed to get tools");
		}
	}, []);

	// 调用工具
	const callTool = useCallback(
		async (
			serverId: string,
			toolName: string,
			args: Record<string, unknown>,
		) => {
			try {
				return await mcpClient.callTool(serverId, toolName, args);
			} catch (error: any) {
				throw new Error(error.message || "Failed to call tool");
			}
		},
		[],
	);

	// 获取所有可用工具
	const getAllTools = useCallback(async (): Promise<
		Array<{ serverId: string; tool: McpTool }>
	> => {
		try {
			return await mcpClient.getAllTools();
		} catch (error) {
			console.error("Failed to get all tools:", error);
			return [];
		}
	}, []);

	// ========== 内置 MCP ==========

	// 加载内置 MCP 定义
	const loadBuiltinDefinitions = useCallback(async () => {
		setLoadingBuiltin(true);
		try {
			const definitions = await mcpClient.getBuiltinDefinitions();
			setBuiltinDefinitions(definitions);
		} catch (error) {
			console.error("Failed to load builtin definitions:", error);
		} finally {
			setLoadingBuiltin(false);
		}
	}, [setBuiltinDefinitions, setLoadingBuiltin]);

	// 从内置定义创建服务器
	const createBuiltinServer = useCallback(
		async (definitionId: string, config?: Record<string, unknown>) => {
			setLoading(true);
			try {
				const serverConfig = await mcpClient.createBuiltinConfig(
					definitionId,
					config,
				);
				await mcpClient.addServer(serverConfig);
				addToStore({
					...serverConfig,
					status: "disconnected",
					enabled: true,
				});
				return serverConfig;
			} catch (error: any) {
				throw new Error(error.message || "Failed to create builtin server");
			} finally {
				setLoading(false);
			}
		},
		[addToStore],
	);

	// 搜索内置 MCP
	const searchBuiltin = useCallback(
		async (params: { keyword?: string; tags?: string[] }) => {
			try {
				return await mcpClient.searchBuiltin(params);
			} catch (error) {
				console.error("Failed to search builtin:", error);
				return [];
			}
		},
		[],
	);

	// ========== 第三方 MCP ==========

	// 添加第三方服务器
	const addThirdPartyServer = useCallback(
		async (config: McpServerConfig) => {
			setLoading(true);
			try {
				await mcpClient.addThirdPartyServer(config);
				addToStore({
					...config,
					type: "third-party",
					status: "disconnected",
					enabled: true,
				});
			} catch (error: any) {
				throw new Error(error.message || "Failed to add third-party server");
			} finally {
				setLoading(false);
			}
		},
		[addToStore],
	);

	// ========== MCP 市场 ==========

	// 搜索市场
	const searchMarket = useCallback(
		async (params: {
			query?: string;
			tags?: string[];
			sortBy?: "downloads" | "rating" | "newest";
			page?: number;
			limit?: number;
		}) => {
			setMarketLoading(true);
			setMarketError(null);
			try {
				const result = await mcpClient.searchMarket(params);
				setMarketItems(result.items);
				setMarketPagination(result.total, result.page, result.limit);
				return result;
			} catch (error: any) {
				setMarketError(error.message || "Failed to search market");
				throw error;
			} finally {
				setMarketLoading(false);
			}
		},
		[setMarketItems, setMarketLoading, setMarketError, setMarketPagination],
	);

	// 加载热门 MCP
	const loadPopularMarketItems = useCallback(
		async (limit?: number) => {
			setMarketLoading(true);
			try {
				const items = await mcpClient.getPopularMarketItems(limit);
				setMarketItems(items);
				return items;
			} catch (error) {
				console.error("Failed to load popular items:", error);
				return [];
			} finally {
				setMarketLoading(false);
			}
		},
		[setMarketItems, setMarketLoading],
	);

	// 加载高评分 MCP
	const loadTopRatedMarketItems = useCallback(
		async (limit?: number) => {
			setMarketLoading(true);
			try {
				const items = await mcpClient.getTopRatedMarketItems(limit);
				return items;
			} catch (error) {
				console.error("Failed to load top rated items:", error);
				return [];
			} finally {
				setMarketLoading(false);
			}
		},
		[setMarketLoading],
	);

	// 加载最新 MCP
	const loadNewestMarketItems = useCallback(
		async (limit?: number) => {
			setMarketLoading(true);
			try {
				const items = await mcpClient.getNewestMarketItems(limit);
				return items;
			} catch (error) {
				console.error("Failed to load newest items:", error);
				return [];
			} finally {
				setMarketLoading(false);
			}
		},
		[setMarketLoading],
	);

	// 加载市场标签
	const loadMarketTags = useCallback(async () => {
		try {
			const tags = await mcpClient.getMarketTags();
			setMarketTags(tags);
			return tags;
		} catch (error) {
			console.error("Failed to load market tags:", error);
			return [];
		}
	}, [setMarketTags]);

	// 从市场安装 MCP
	const installFromMarket = useCallback(
		async (
			marketItem: McpMarketItem,
			customConfig?: {
				name?: string;
				env?: Record<string, string>;
				url?: string;
			},
		) => {
			setLoading(true);
			try {
				const config = await mcpClient.installFromMarket(
					marketItem,
					customConfig,
				);
				addToStore({
					...config,
					status: "disconnected",
					enabled: true,
				});
				return config;
			} catch (error: any) {
				throw new Error(error.message || "Failed to install from market");
			} finally {
				setLoading(false);
			}
		},
		[addToStore],
	);

	// 获取 README
	const getMarketReadme = useCallback(async (marketItem: McpMarketItem) => {
		try {
			return await mcpClient.getMarketReadme(marketItem);
		} catch (error) {
			console.error("Failed to get readme:", error);
			return "";
		}
	}, []);

	// 初始化
	useEffect(() => {
		loadServers();
		loadBuiltinDefinitions();
	}, [loadServers, loadBuiltinDefinitions]);

	return {
		// 服务器列表
		servers: storeServers,
		builtinServers: getBuiltinServers(),
		thirdPartyServers: getThirdPartyServers(),
		marketServers: getMarketServers(),
		enabledServers: getEnabledServers(),
		connectedServers: getConnectedServers(),
		loading,

		// 内置 MCP
		builtinDefinitions,
		isLoadingBuiltin,

		// 市场
		marketItems,
		isLoadingMarket,
		marketError,
		marketTotal,
		marketPage,
		marketLimit,
		marketTags,

		// 服务器管理
		loadServers,
		loadStatuses,
		addServer,
		removeServer,
		connect,
		disconnect,
		toggleServer,
		getTools,
		callTool,
		getAllTools,

		// 内置 MCP
		loadBuiltinDefinitions,
		createBuiltinServer,
		searchBuiltin,

		// 第三方 MCP
		addThirdPartyServer,

		// 市场
		searchMarket,
		loadPopularMarketItems,
		loadTopRatedMarketItems,
		loadNewestMarketItems,
		loadMarketTags,
		installFromMarket,
		getMarketReadme,
	};
}
