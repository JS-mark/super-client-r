/**
 * MCP Hook
 * 管理 MCP 服务器的连接、工具调用和市场
 */

import { useCallback, useEffect, useState } from "react";
import { mcpClient } from "../services/mcp/mcpService";
import { useMcpStore, type McpMarketItem } from "../stores/mcpStore";
import type {
	McpServerConfig,
	McpServerStatus,
	McpTool,
} from "../types/electron";

// Mock market data - in production this would come from an API
const MOCK_MARKET_ITEMS: McpMarketItem[] = [
	{
		id: "filesystem",
		name: "Filesystem",
		description: "File system operations including read, write, list, and search",
		version: "1.0.0",
		author: "Anthropic",
		tags: ["official", "filesystem", "utilities"],
		rating: 4.8,
		downloads: 50000,
		installUrl: "https://github.com/modelcontextprotocol/servers",
		readmeUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-filesystem"],
	},
	{
		id: "sqlite",
		name: "SQLite",
		description: "SQLite database operations with built-in analysis features",
		version: "1.0.0",
		author: "Anthropic",
		tags: ["official", "database", "sqlite"],
		rating: 4.5,
		downloads: 25000,
		installUrl: "https://github.com/modelcontextprotocol/servers",
		readmeUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-sqlite"],
	},
	{
		id: "github",
		name: "GitHub",
		description: "GitHub API integration for repository management",
		version: "1.0.0",
		author: "Anthropic",
		tags: ["official", "github", "git"],
		rating: 4.6,
		downloads: 30000,
		installUrl: "https://github.com/modelcontextprotocol/servers",
		readmeUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-github"],
	},
	{
		id: "brave-search",
		name: "Brave Search",
		description: "Web search capabilities using Brave Search API",
		version: "1.0.0",
		author: "Anthropic",
		tags: ["official", "search", "web"],
		rating: 4.3,
		downloads: 15000,
		installUrl: "https://github.com/modelcontextprotocol/servers",
		readmeUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-brave-search"],
		env: { BRAVE_API_KEY: "" },
	},
];

export function useMcp() {
	const [configList, setConfigList] = useState<McpServerConfig[]>([]);
	const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
	const [loading, setLoading] = useState(false);

	// Store integration
	const {
		servers: storeServers,
		marketItems,
		isLoadingMarket,
		marketError,
		addServer: addToStore,
		removeServer: removeFromStore,
		updateServer: updateInStore,
		enableServer,
		disableServer,
		setMarketItems,
		setMarketLoading,
		setMarketError,
	} = useMcpStore();

	// Load servers from main process
	const loadServers = useCallback(async () => {
		setLoading(true);
		try {
			const data = await mcpClient.listServers();
			setConfigList(data);
			// Sync with store
			for (const config of data) {
				if (!storeServers.find((s) => s.id === config.id)) {
					addToStore({
						...config,
						status: "disconnected",
						enabled: true,
					});
				}
			}
		} catch (error) {
			console.error("Failed to load servers:", error);
		} finally {
			setLoading(false);
		}
	}, [storeServers, addToStore]);

	// Load server statuses
	const loadStatuses = useCallback(async () => {
		try {
			const data = await mcpClient.getAllStatus();
			setStatuses(data);
			// Update store with status
			for (const status of data) {
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

	// Fetch market items
	const fetchMarketItems = useCallback(async () => {
		setMarketLoading(true);
		setMarketError(null);

		try {
			// In production, this would fetch from a real API
			await new Promise((resolve) => setTimeout(resolve, 500));
			setMarketItems(MOCK_MARKET_ITEMS);
		} catch (error: any) {
			setMarketError(error.message || "Failed to fetch market items");
		} finally {
			setMarketLoading(false);
		}
	}, [setMarketItems, setMarketLoading, setMarketError]);

	// Install from market
	const installFromMarket = useCallback(
		async (marketItem: McpMarketItem, customName?: string) => {
			const config: McpServerConfig = {
				id: `${marketItem.id}_${Date.now()}`,
				name: customName || marketItem.name,
				command: marketItem.command,
				args: marketItem.args,
				env: marketItem.env,
			};

			await mcpClient.addServer(config);
			setConfigList((prev) => [...prev, config]);

			addToStore({
				...config,
				status: "disconnected",
				enabled: true,
			});

			return config;
		},
		[addToStore]
	);

	// Add custom server
	const addServer = useCallback(
		async (config: McpServerConfig) => {
			setLoading(true);
			try {
				await mcpClient.addServer(config);
				setConfigList((prev) => [...prev, config]);
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
		[addToStore]
	);

	// Remove server
	const removeServer = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				await mcpClient.removeServer(id);
				setConfigList((prev) => prev.filter((s) => s.id !== id));
				setStatuses((prev) => prev.filter((s) => s.id !== id));
				removeFromStore(id);
			} catch (error: any) {
				throw new Error(error.message || "Failed to remove server");
			} finally {
				setLoading(false);
			}
		},
		[removeFromStore]
	);

	// Connect server
	const connect = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				const status = await mcpClient.connect(id);
				setStatuses((prev) => {
					const filtered = prev.filter((s) => s.id !== id);
					return [...filtered, status];
				});
				updateInStore(id, {
					status: status.status,
					tools: status.tools,
					error: status.error,
				});
			} catch (error: any) {
				throw new Error(error.message || "Failed to connect");
			} finally {
				setLoading(false);
			}
		},
		[updateInStore]
	);

	// Disconnect server
	const disconnect = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				await mcpClient.disconnect(id);
				setStatuses((prev) =>
					prev.map((s) =>
						s.id === id
							? { ...s, status: "disconnected" as const, tools: undefined }
							: s
					)
				);
				updateInStore(id, { status: "disconnected", tools: [] });
			} catch (error: any) {
				throw new Error(error.message || "Failed to disconnect");
			} finally {
				setLoading(false);
			}
		},
		[updateInStore]
	);

	// Toggle server enabled state
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
		[storeServers, enableServer, disableServer, disconnect]
	);

	// Get tools
	const getTools = useCallback(async (id: string): Promise<McpTool[]> => {
		try {
			return await mcpClient.getTools(id);
		} catch (error: any) {
			throw new Error(error.message || "Failed to get tools");
		}
	}, []);

	// Call tool
	const callTool = useCallback(
		async (serverId: string, toolName: string, args: Record<string, unknown>) => {
			try {
				return await mcpClient.callTool(serverId, toolName, args);
			} catch (error: any) {
				throw new Error(error.message || "Failed to call tool");
			}
		},
		[]
	);

	// Get all available tools
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

	// Get server status
	const getServerStatus = useCallback(
		(id: string): McpServerStatus | undefined => {
			return statuses.find((s) => s.id === id);
		},
		[statuses]
	);

	// Initialize
	useEffect(() => {
		loadServers();
		loadStatuses();
		if (marketItems.length === 0) {
			fetchMarketItems();
		}
	}, [loadServers, loadStatuses, fetchMarketItems, marketItems.length]);

	return {
		// Servers
		servers: storeServers,
		configList,
		statuses,
		loading,

		// Market
		marketItems,
		isLoadingMarket,
		marketError,

		// Actions
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
		getServerStatus,

		// Market actions
		fetchMarketItems,
		installFromMarket,
	};
}
