/**
 * MCP 市场服务
 * 管理 MCP 市场的数据获取、搜索和安装
 */

import { EventEmitter } from "events";
import type {
	McpMarketItem,
	McpMarketSearchParams,
	McpMarketSearchResult,
	McpServerConfig,
} from "../../ipc/types";

// 默认市场 API 地址
const DEFAULT_MARKET_API_URL = "https://mcp-market.example.com/api/v1";

// 模拟市场数据（用于开发测试）
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

export class McpMarketService extends EventEmitter {
	private apiUrl: string = DEFAULT_MARKET_API_URL;
	private cache: Map<string, McpMarketItem> = new Map();
	private cacheExpiry: number = 5 * 60 * 1000; // 5分钟缓存
	private lastFetch: number = 0;
	private useMockData: boolean = true; // 开发阶段使用模拟数据

	/**
	 * 设置市场 API URL
	 */
	setApiUrl(url: string): void {
		this.apiUrl = url;
		this.useMockData = false;
	}

	/**
	 * 搜索市场 MCP
	 */
	async search(params: McpMarketSearchParams = {}): Promise<McpMarketSearchResult> {
		const { query, tags, sortBy = "downloads", page = 1, limit = 20 } = params;

		try {
			let items: McpMarketItem[];

			if (this.useMockData) {
				items = await this.fetchMockData();
			} else {
				items = await this.fetchFromApi(params);
			}

			// 过滤
			if (query) {
				const lowerQuery = query.toLowerCase();
				items = items.filter(
					(item) =>
						item.name.toLowerCase().includes(lowerQuery) ||
						item.description.toLowerCase().includes(lowerQuery) ||
						item.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery)),
				);
			}

			if (tags && tags.length > 0) {
				items = items.filter((item) =>
					tags.some((tag: string) => (item.tags as string[]).includes(tag)),
				);
			}

			// 排序
			items = this.sortItems(items, sortBy);

			// 分页
			const total = items.length;
			const start = (page - 1) * limit;
			const paginatedItems = items.slice(start, start + limit);

			return {
				items: paginatedItems,
				total,
				page,
				limit,
			};
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
	}

	/**
	 * 获取热门 MCP
	 */
	async getPopular(limit: number = 10): Promise<McpMarketItem[]> {
		const result = await this.search({
			sortBy: "downloads",
			limit,
		});
		return result.items;
	}

	/**
	 * 获取高评分 MCP
	 */
	async getTopRated(limit: number = 10): Promise<McpMarketItem[]> {
		const result = await this.search({
			sortBy: "rating",
			limit,
		});
		return result.items;
	}

	/**
	 * 获取最新 MCP
	 */
	async getNewest(limit: number = 10): Promise<McpMarketItem[]> {
		const result = await this.search({
			sortBy: "newest",
			limit,
		});
		return result.items;
	}

	/**
	 * 获取 MCP 详情
	 */
	async getDetail(id: string): Promise<McpMarketItem | null> {
		// 先查缓存
		if (this.cache.has(id)) {
			return this.cache.get(id)!;
		}

		try {
			if (this.useMockData) {
				const items = await this.fetchMockData();
				const item = items.find((i) => i.id === id);
				return item || null;
			}

			const response = await fetch(`${this.apiUrl}/items/${id}`);
			if (!response.ok) {
				return null;
			}

			const item = (await response.json()) as McpMarketItem;
			this.cache.set(id, item);
			return item;
		} catch (error) {
			this.emit("error", error);
			return null;
		}
	}

	/**
	 * 获取所有标签
	 */
	async getTags(): Promise<string[]> {
		try {
			if (this.useMockData) {
				const items = await this.fetchMockData();
				const tagSet = new Set<string>();
				for (const item of items) {
					for (const tag of item.tags) {
						tagSet.add(tag);
					}
				}
				return Array.from(tagSet).sort();
			}

			const response = await fetch(`${this.apiUrl}/tags`);
			if (!response.ok) {
				return [];
			}

			return (await response.json()) as string[];
		} catch (error) {
			this.emit("error", error);
			return [];
		}
	}

	/**
	 * 安装 MCP
	 */
	async install(
		marketItem: McpMarketItem,
		customConfig?: {
			name?: string;
			env?: Record<string, string>;
			url?: string;
		},
	): Promise<McpServerConfig> {
		this.emit("install-start", marketItem);

		try {
			const config: McpServerConfig = {
				id: `market-${marketItem.id}-${Date.now()}`,
				name: customConfig?.name || marketItem.name,
				type: "market",
				transport: marketItem.transport,
				description: marketItem.description,
				version: marketItem.version,
				author: marketItem.author,
				icon: marketItem.icon,
				enabled: true,
			};

			// 根据传输类型设置配置
			if (marketItem.transport === "stdio") {
				config.command = marketItem.command;
				config.args = marketItem.args;
				config.env = {
					...marketItem.env,
					...customConfig?.env,
				};
			} else if (marketItem.transport === "http" || marketItem.transport === "sse") {
				config.url = customConfig?.url || marketItem.url;
				config.headers = marketItem.headers;
			}

			this.emit("install-complete", { marketItem, config });
			return config;
		} catch (error) {
			this.emit("install-error", { marketItem, error });
			throw error;
		}
	}

	/**
	 * 获取 README 内容
	 */
	async getReadme(marketItem: McpMarketItem): Promise<string> {
		try {
			if (!marketItem.readmeUrl) {
				return "# No README available";
			}

			const response = await fetch(marketItem.readmeUrl);
			if (!response.ok) {
				return "# Failed to load README";
			}

			return await response.text();
		} catch (error) {
			return "# Error loading README";
		}
	}

	/**
	 * 从 API 获取数据
	 */
	private async fetchFromApi(params: McpMarketSearchParams): Promise<McpMarketItem[]> {
		const searchParams = new URLSearchParams();
		if (params.query) searchParams.set("q", params.query);
		if (params.tags) searchParams.set("tags", params.tags.join(","));
		if (params.sortBy) searchParams.set("sort", params.sortBy);
		if (params.page) searchParams.set("page", params.page.toString());
		if (params.limit) searchParams.set("limit", params.limit.toString());

		const response = await fetch(`${this.apiUrl}/search?${searchParams}`);
		if (!response.ok) {
			throw new Error(`Failed to fetch market data: ${response.statusText}`);
		}

		const result = (await response.json()) as McpMarketSearchResult;
		return result.items;
	}

	/**
	 * 获取模拟数据
	 */
	private async fetchMockData(): Promise<McpMarketItem[]> {
		// 模拟网络延迟
		await new Promise((resolve) => setTimeout(resolve, 300));

		// 检查缓存
		if (Date.now() - this.lastFetch < this.cacheExpiry && this.cache.size > 0) {
			return Array.from(this.cache.values());
		}

		// 更新缓存
		this.cache.clear();
		for (const item of MOCK_MARKET_ITEMS) {
			this.cache.set(item.id, item);
		}
		this.lastFetch = Date.now();

		return MOCK_MARKET_ITEMS;
	}

	/**
	 * 排序 MCP 列表
	 */
	private sortItems(
		items: McpMarketItem[],
		sortBy: McpMarketSearchParams["sortBy"],
	): McpMarketItem[] {
		switch (sortBy) {
			case "downloads":
				return items.sort((a, b) => b.downloads - a.downloads);
			case "rating":
				return items.sort((a, b) => b.rating - a.rating);
			case "newest":
				return items.sort(
					(a, b) =>
						new Date(b.createdAt || 0).getTime() -
						new Date(a.createdAt || 0).getTime(),
				);
			default:
				return items;
		}
	}
}

// 单例实例
export const mcpMarketService = new McpMarketService();
