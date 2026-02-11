import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { McpServer, McpMarketItem, BuiltinMcpDefinition } from "../types/mcp";

// 生成唯一 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
	updateServerStatus: (id: string, status: McpServer["status"], error?: string) => void;
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
	fetchMarketItems: (page?: number, limit?: number, tag?: string, query?: string) => Promise<void>;
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
}

// 模拟市场数据
const MOCK_MARKET_ITEMS: McpMarketItem[] = [
	{
		id: "market-filesystem",
		name: "Filesystem Pro",
		description: "增强版文件系统操作，支持远程文件系统和云存储",
		version: "2.0.0",
		author: "MCP Community",
		icon: "📁",
		tags: ["filesystem", "cloud", "utilities"],
		rating: 4.9,
		downloads: 150000,
		installCount: 50000,
		transport: "stdio",
		command: "npx",
		args: ["-y", "@mcp-community/server-filesystem-pro"],
		readmeUrl: "https://github.com/mcp-community/filesystem-pro#readme",
		repositoryUrl: "https://github.com/mcp-community/filesystem-pro",
		license: "MIT",
		createdAt: "2024-01-15T00:00:00Z",
		updatedAt: "2024-06-01T00:00:00Z",
	},
	{
		id: "market-postgres",
		name: "PostgreSQL",
		description: "PostgreSQL 数据库操作和查询优化",
		version: "1.2.0",
		author: "Database Tools Inc",
		icon: "🐘",
		tags: ["database", "postgresql", "sql"],
		rating: 4.7,
		downloads: 80000,
		installCount: 25000,
		transport: "stdio",
		command: "npx",
		args: ["-y", "@dbtools/mcp-server-postgres"],
		readmeUrl: "https://github.com/dbtools/postgres-mcp#readme",
		repositoryUrl: "https://github.com/dbtools/postgres-mcp",
		license: "Apache-2.0",
		createdAt: "2024-02-01T00:00:00Z",
		updatedAt: "2024-05-15T00:00:00Z",
	},
	{
		id: "market-redis",
		name: "Redis",
		description: "Redis 缓存和队列操作",
		version: "1.0.5",
		author: "Cache Masters",
		icon: "🔴",
		tags: ["database", "redis", "cache"],
		rating: 4.5,
		downloads: 45000,
		installCount: 12000,
		transport: "stdio",
		command: "npx",
		args: ["-y", "@cachemasters/mcp-redis"],
		readmeUrl: "https://github.com/cachemasters/redis-mcp#readme",
		repositoryUrl: "https://github.com/cachemasters/redis-mcp",
		license: "MIT",
		createdAt: "2024-03-01T00:00:00Z",
		updatedAt: "2024-04-20T00:00:00Z",
	},
	{
		id: "market-slack",
		name: "Slack Integration",
		description: "Slack 工作区管理和消息发送",
		version: "1.1.0",
		author: "Team Connect",
		icon: "💬",
		tags: ["slack", "messaging", "team"],
		rating: 4.6,
		downloads: 60000,
		installCount: 18000,
		transport: "http",
		url: "https://slack-mcp.example.com",
		headers: {
			"X-API-Version": "v1",
		},
		readmeUrl: "https://github.com/teamconnect/slack-mcp#readme",
		repositoryUrl: "https://github.com/teamconnect/slack-mcp",
		license: "MIT",
		createdAt: "2024-01-20T00:00:00Z",
		updatedAt: "2024-05-01T00:00:00Z",
	},
	{
		id: "market-notion",
		name: "Notion",
		description: "Notion 工作空间管理和页面操作",
		version: "2.1.0",
		author: "Notion Tools",
		icon: "📝",
		tags: ["notion", "documentation", "productivity"],
		rating: 4.8,
		downloads: 95000,
		installCount: 35000,
		transport: "http",
		url: "https://notion-mcp.example.com",
		readmeUrl: "https://github.com/notiontools/notion-mcp#readme",
		repositoryUrl: "https://github.com/notiontools/notion-mcp",
		license: "MIT",
		createdAt: "2024-02-15T00:00:00Z",
		updatedAt: "2024-06-10T00:00:00Z",
	},
	{
		id: "market-aws",
		name: "AWS Services",
		description: "AWS 云服务操作，支持 S3、EC2、Lambda 等",
		version: "3.0.0",
		author: "Cloud Native Tools",
		icon: "☁️",
		tags: ["aws", "cloud", "devops"],
		rating: 4.4,
		downloads: 70000,
		installCount: 22000,
		transport: "stdio",
		command: "npx",
		args: ["-y", "@cloudnative/mcp-aws"],
		readmeUrl: "https://github.com/cloudnative/aws-mcp#readme",
		repositoryUrl: "https://github.com/cloudnative/aws-mcp",
		license: "Apache-2.0",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-05-20T00:00:00Z",
	},
	{
		id: "market-docker",
		name: "Docker",
		description: "Docker 容器和镜像管理",
		version: "1.3.0",
		author: "Container Masters",
		icon: "🐳",
		tags: ["docker", "containers", "devops"],
		rating: 4.7,
		downloads: 55000,
		installCount: 16000,
		transport: "stdio",
		command: "npx",
		args: ["-y", "@containermasters/mcp-docker"],
		readmeUrl: "https://github.com/containermasters/docker-mcp#readme",
		repositoryUrl: "https://github.com/containermasters/docker-mcp",
		license: "MIT",
		createdAt: "2024-02-20T00:00:00Z",
		updatedAt: "2024-04-30T00:00:00Z",
	},
	{
		id: "market-jira",
		name: "Jira",
		description: "Jira 项目管理和问题跟踪",
		version: "1.0.8",
		author: "Agile Tools",
		icon: "📋",
		tags: ["jira", "project-management", "agile"],
		rating: 4.3,
		downloads: 35000,
		installCount: 10000,
		transport: "http",
		url: "https://jira-mcp.example.com",
		readmeUrl: "https://github.com/agiletools/jira-mcp#readme",
		repositoryUrl: "https://github.com/agiletools/jira-mcp",
		license: "MIT",
		createdAt: "2024-03-15T00:00:00Z",
		updatedAt: "2024-05-05T00:00:00Z",
	},
];

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
			addServer: (server) =>
				set((state) => ({ servers: [...state.servers, server] })),

			removeServer: (id) =>
				set((state) => ({ servers: state.servers.filter((s) => s.id !== id) })),

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
			setMarketLoading: (loading) => set({ isLoadingMarket: loading, isLoading: loading }),
			setMarketError: (error) => set({ marketError: error }),
			setMarketPagination: (total, page, limit) =>
				set({ marketTotal: total, marketPage: page, marketLimit: limit }),
			addMarketItem: (item) =>
				set((state) => ({
					marketItems: [...state.marketItems, item],
				})),

			fetchMarketItems: async (page = 1, limit = 12, tag?: string, query?: string) => {
				set({ isLoadingMarket: true, isLoading: true });
				try {
					// 模拟 API 调用延迟
					await new Promise((resolve) => setTimeout(resolve, 300));

					let items = [...MOCK_MARKET_ITEMS];

					// 过滤标签
					if (tag) {
						items = items.filter((item) => item.tags.includes(tag));
					}

					// 搜索
					if (query) {
						const lowerQuery = query.toLowerCase();
						items = items.filter(
							(item) =>
								item.name.toLowerCase().includes(lowerQuery) ||
								item.description.toLowerCase().includes(lowerQuery) ||
								item.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
						);
					}

					const total = items.length;
					const start = (page - 1) * limit;
					const paginatedItems = items.slice(start, start + limit);

					set({
						marketItems: paginatedItems,
						marketTotal: total,
						marketPage: page,
						marketLimit: limit,
						isLoadingMarket: false,
						isLoading: false,
					});
				} catch (error) {
					set({
						marketError: error instanceof Error ? error.message : "Unknown error",
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
			},

			// 标签
			setMarketTags: (tags) => set({ marketTags: tags }),

			// 测试连接（模拟）
			testConnection: async (id: string) => {
				const server = get().servers.find((s) => s.id === id);
				if (!server) throw new Error("Server not found");

				// 模拟测试延迟
				await new Promise((resolve) => setTimeout(resolve, 1000));

				// 随机成功或失败
				const success = Math.random() > 0.3;
				if (success) {
					set((state) => ({
						servers: state.servers.map((s) =>
							s.id === id ? { ...s, status: "connected" as const } : s,
						),
					}));
				} else {
					set((state) => ({
						servers: state.servers.map((s) =>
							s.id === id
								? { ...s, status: "error" as const, error: "Connection failed" }
								: s,
						),
					}));
					throw new Error("Connection failed");
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
		}),
		{
			name: "mcp-storage",
			partialize: (state) => ({
				servers: state.servers,
				// 不持久化市场数据和内置定义
			}),
		},
	),
);
