/**
 * MCP Hook
 * 管理 MCP 服务器的连接和工具调用
 */

import { useCallback, useEffect, useState } from "react";
import { mcpClient } from "../services/mcp/mcpService";
import type {
	McpServerConfig,
	McpServerStatus,
	McpTool,
} from "../types/electron";

export function useMcp() {
	const [servers, setServers] = useState<McpServerConfig[]>([]);
	const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
	const [loading, setLoading] = useState(false);

	// 加载服务器列表
	const loadServers = useCallback(async () => {
		setLoading(true);
		try {
			const data = await mcpClient.listServers();
			setServers(data);
		} catch (error) {
			console.error("Failed to load servers:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	// 加载服务器状态
	const loadStatuses = useCallback(async () => {
		try {
			const data = await mcpClient.getAllStatus();
			setStatuses(data);
		} catch (error) {
			console.error("Failed to load statuses:", error);
		}
	}, []);

	// 添加服务器
	const addServer = useCallback(async (config: McpServerConfig) => {
		setLoading(true);
		try {
			await mcpClient.addServer(config);
			setServers((prev) => [...prev, config]);
		} catch (error: any) {
			throw new Error(error.message || "Failed to add server");
		} finally {
			setLoading(false);
		}
	}, []);

	// 移除服务器
	const removeServer = useCallback(async (id: string) => {
		setLoading(true);
		try {
			await mcpClient.removeServer(id);
			setServers((prev) => prev.filter((s) => s.id !== id));
			setStatuses((prev) => prev.filter((s) => s.id !== id));
		} catch (error: any) {
			throw new Error(error.message || "Failed to remove server");
		} finally {
			setLoading(false);
		}
	}, []);

	// 连接服务器
	const connect = useCallback(async (id: string) => {
		setLoading(true);
		try {
			const status = await mcpClient.connect(id);
			setStatuses((prev) => {
				const filtered = prev.filter((s) => s.id !== id);
				return [...filtered, status];
			});
		} catch (error: any) {
			throw new Error(error.message || "Failed to connect");
		} finally {
			setLoading(false);
		}
	}, []);

	// 断开连接
	const disconnect = useCallback(async (id: string) => {
		setLoading(true);
		try {
			await mcpClient.disconnect(id);
			setStatuses((prev) =>
				prev.map((s) =>
					s.id === id
						? { ...s, status: "disconnected" as const, tools: undefined }
						: s,
				),
			);
		} catch (error: any) {
			throw new Error(error.message || "Failed to disconnect");
		} finally {
			setLoading(false);
		}
	}, []);

	// 获取服务器工具
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

	// 获取服务器状态
	const getServerStatus = useCallback(
		(id: string): McpServerStatus | undefined => {
			return statuses.find((s) => s.id === id);
		},
		[statuses],
	);

	// 初始化时加载
	useEffect(() => {
		loadServers();
		loadStatuses();
	}, [loadServers, loadStatuses]);

	return {
		servers,
		statuses,
		loading,
		loadServers,
		loadStatuses,
		addServer,
		removeServer,
		connect,
		disconnect,
		getTools,
		callTool,
		getAllTools,
		getServerStatus,
	};
}
