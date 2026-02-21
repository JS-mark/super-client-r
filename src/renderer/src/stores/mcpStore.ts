import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
	McpServer,
	McpMarketItem,
	BuiltinMcpDefinition,
} from "../types/mcp";

// 生成唯一 ID
const generateId = () =>
	`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface McpState {
	// 已安装的服务器
	servers: McpServer[];

	// 内置 MCP 定义
	builtinDefinitions: BuiltinMcpDefinition[];
	isLoadingBuiltin: boolean;

	// 市场
	marketItems: McpMarketItem[];
	isLoadingMarket: boolean;
	marketError: string | null;
	marketTotal: number;
	marketPage: number;
	marketLimit: number;

	// 标签
	marketTags: string[];

	// 加载状态（兼容页面使用）
	isLoading: boolean;

	// Actions - 服务器管理
	addServer: (server: McpServer) => void;
	removeServer: (id: string) => void;
	updateServer: (id: string, updates: Partial<McpServer>) => void;
	enableServer: (id: string) => void;
	disableServer: (id: string) => void;
	toggleServer: (id: string) => void;
	disconnectServer: (id: string) => Promise<void>;
	updateServerStatus: (
		id: string,
		status: McpServer["status"],
		error?: string,
	) => void;
	updateServerTools: (id: string, tools: McpServer["tools"]) => void;
	setServers: (servers: McpServer[]) => void;

	// Actions - 内置 MCP
	setBuiltinDefinitions: (definitions: BuiltinMcpDefinition[]) => void;
	setLoadingBuiltin: (loading: boolean) => void;

	// Actions - 市场
	setMarketItems: (items: McpMarketItem[]) => void;
	setMarketLoading: (loading: boolean) => void;
	setMarketError: (error: string | null) => void;
	setMarketPagination: (total: number, page: number, limit: number) => void;
	addMarketItem: (item: McpMarketItem) => void;
	fetchMarketItems: (
		page?: number,
		limit?: number,
		tag?: string,
		query?: string,
	) => Promise<void>;
	installMarketItem: (item: McpMarketItem) => void;

	// Actions - 标签
	setMarketTags: (tags: string[]) => void;

	// Actions - 测试连接
	testConnection: (id: string) => Promise<void>;

	// Getters
	getBuiltinServers: () => McpServer[];
	getThirdPartyServers: () => McpServer[];
	getMarketServers: () => McpServer[];
	getEnabledServers: () => McpServer[];
	getConnectedServers: () => McpServer[];
	getInternalServers: () => McpServer[];
}

export const useMcpStore = create<McpState>()(
	persist(
		(set, get) => ({
			// 初始状态
			servers: [],
			builtinDefinitions: [],
			isLoadingBuiltin: false,
			marketItems: [],
			isLoadingMarket: false,
			marketError: null,
			marketTotal: 0,
			marketPage: 1,
			marketLimit: 20,
			marketTags: [],
			isLoading: false,

			// 服务器管理
			addServer: (server) => {
				set((state) => ({ servers: [...state.servers, server] }));
				// 注册到主进程
				window.electron.mcp.addServer({
					id: server.id,
					name: server.name,
					type: server.type,
					transport: server.transport,
					command: server.command,
					args: server.args,
					env: server.env,
					url: server.url,
					headers: server.headers,
					description: server.description,
					version: server.version,
					enabled: server.enabled,
				});
			},

			removeServer: (id) => {
				const server = get().servers.find((s) => s.id === id);
				if (server?.type === "internal") return; // 内置服务器不可删除
				set((state) => ({ servers: state.servers.filter((s) => s.id !== id) }));
				// 从主进程移除
				window.electron.mcp.removeServer(id);
			},

			updateServer: (id, updates) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, ...updates } : s,
					),
				})),

			enableServer: (id) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, enabled: true } : s,
					),
				})),

			disableServer: (id) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, enabled: false } : s,
					),
				})),

			toggleServer: (id) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, enabled: !s.enabled } : s,
					),
				})),

			disconnectServer: async (id: string) => {
				try {
					await window.electron.mcp.disconnect(id);
					set((state) => ({
						servers: state.servers.map((s) =>
							s.id === id
								? {
										...s,
										status: "disconnected" as const,
										tools: undefined,
										error: undefined,
									}
								: s,
						),
					}));
				} catch (error) {
					const errorMsg =
						error instanceof Error ? error.message : "Disconnect failed";
					set((state) => ({
						servers: state.servers.map((s) =>
							s.id === id
								? { ...s, status: "error" as const, error: errorMsg }
								: s,
						),
					}));
				}
			},

			updateServerStatus: (id, status, error) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, status, error } : s,
					),
				})),

			updateServerTools: (id, tools) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, tools } : s,
					),
				})),

			setServers: (servers) => set({ servers }),

			// 内置 MCP
			setBuiltinDefinitions: (definitions) =>
				set({ builtinDefinitions: definitions }),
			setLoadingBuiltin: (loading) => set({ isLoadingBuiltin: loading }),

			// 市场
			setMarketItems: (items) => set({ marketItems: items }),
			setMarketLoading: (loading) =>
				set({ isLoadingMarket: loading, isLoading: loading }),
			setMarketError: (error) => set({ marketError: error }),
			setMarketPagination: (total, page, limit) =>
				set({ marketTotal: total, marketPage: page, marketLimit: limit }),
			addMarketItem: (item) =>
				set((state) => ({
					marketItems: [...state.marketItems, item],
				})),

			fetchMarketItems: async (
				page = 1,
				limit = 12,
				tag?: string,
				query?: string,
			) => {
				set({ isLoadingMarket: true, isLoading: true, marketError: null });
				try {
					const response = await window.electron.mcp.market.search({
						query: query || undefined,
						tags: tag ? [tag] : undefined,
						sortBy: "downloads",
						page,
						limit,
					});

					if (!response.success || !response.data) {
						throw new Error(response.error || "Failed to fetch market data");
					}

					const { items, total } = response.data;

					set({
						marketItems: items,
						marketTotal: total,
						marketPage: page,
						marketLimit: limit,
						isLoadingMarket: false,
						isLoading: false,
					});
				} catch (error) {
					set({
						marketError:
							error instanceof Error ? error.message : "Unknown error",
						isLoadingMarket: false,
						isLoading: false,
					});
				}
			},

			installMarketItem: (item) => {
				const newServer: McpServer = {
					id: generateId(),
					name: item.name,
					type: "market",
					transport: item.transport,
					status: "disconnected",
					enabled: true,
					description: item.description,
					version: item.version,
					// stdio 类型
					...(item.transport === "stdio" && {
						command: item.command,
						args: item.args,
					}),
					// http/sse 类型
					...(item.transport !== "stdio" && {
						url: item.url,
						headers: item.headers,
					}),
				};

				set((state) => ({
					servers: [...state.servers, newServer],
				}));

				// 注册到主进程（持久化 + 运行时注册）
				window.electron.mcp.addServer({
					id: newServer.id,
					name: newServer.name,
					type: newServer.type,
					transport: newServer.transport,
					command: newServer.command,
					args: newServer.args,
					env: newServer.env,
					url: newServer.url,
					headers: newServer.headers,
					description: newServer.description,
					version: newServer.version,
					enabled: true,
				});
			},

			// 标签
			setMarketTags: (tags) => set({ marketTags: tags }),

			// 测试连接
			testConnection: async (id: string) => {
				const server = get().servers.find((s) => s.id === id);
				if (!server) throw new Error("Server not found");

				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id
							? { ...s, status: "connecting" as const, error: undefined }
							: s,
					),
				}));

				try {
					const response = await window.electron.mcp.connect(id);
					if (response.success) {
						set((state) => ({
							servers: state.servers.map((s) =>
								s.id === id ? { ...s, status: "connected" as const } : s,
							),
						}));
					} else {
						throw new Error(response.error || "Connection failed");
					}
				} catch (error) {
					const errorMsg =
						error instanceof Error ? error.message : "Connection failed";
					set((state) => ({
						servers: state.servers.map((s) =>
							s.id === id
								? { ...s, status: "error" as const, error: errorMsg }
								: s,
						),
					}));
					throw error;
				}
			},

			// Getters
			getBuiltinServers: () => {
				return get().servers.filter((s) => s.type === "builtin");
			},

			getThirdPartyServers: () => {
				return get().servers.filter((s) => s.type === "third-party");
			},

			getMarketServers: () => {
				return get().servers.filter((s) => s.type === "market");
			},

			getEnabledServers: () => {
				return get().servers.filter((s) => s.enabled !== false);
			},

			getConnectedServers: () => {
				return get().servers.filter((s) => s.status === "connected");
			},

			getInternalServers: () => {
				return get().servers.filter((s) => s.type === "internal");
			},
		}),
		{
			name: "mcp-storage",
			partialize: (state) => ({
				// 不持久化 internal 服务器（由主进程动态注册）和市场数据
				servers: state.servers.filter((s) => s.type !== "internal"),
			}),
		},
	),
);
