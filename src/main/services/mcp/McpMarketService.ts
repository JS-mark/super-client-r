/**
 * MCP 市场服务
 * 从 npm 注册表获取 MCP 服务器包，支持搜索、排序和安装
 */

import { EventEmitter } from "events";
import type {
	McpMarketItem,
	McpMarketSearchParams,
	McpMarketSearchResult,
	McpServerConfig,
} from "../../ipc/types";

// npm 注册表搜索 API
const NPM_REGISTRY_URL = "https://registry.npmjs.org/-/v1/search";
const FETCH_TIMEOUT = 15_000;
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存

// ---------- npm API types ----------

interface NpmSearchObject {
	package: {
		name: string;
		scope: string;
		version: string;
		description: string;
		keywords?: string[];
		date: string;
		links: {
			npm: string;
			homepage?: string;
			repository?: string;
		};
		publisher?: { username: string };
	};
	score: {
		final: number;
		detail: { quality: number; popularity: number; maintenance: number };
	};
	searchScore: number;
}

interface NpmSearchResponse {
	objects: NpmSearchObject[];
	total: number;
}

// ---------- helpers ----------

/** 不需要出现在市场标签中的通用关键词 */
const EXCLUDED_TAGS = new Set([
	"javascript",
	"typescript",
	"nodejs",
	"node",
	"npm",
	"js",
	"ts",
	"server",
	"client",
	"tool",
	"tools",
	"ai",
	"llm",
]);

/**
 * 根据包名 / 关键词推断 emoji 图标
 */
function inferIcon(name: string, keywords: string[]): string {
	const text = `${name} ${keywords.join(" ")}`.toLowerCase();
	const rules: [string[], string][] = [
		[["filesystem", "file", "fs"], "📁"],
		[["github", "gitlab", "git"], "🐙"],
		[["sqlite", "database", "postgres", "mysql", "mongo", "supabase", "prisma"], "🗄️"],
		[["browser", "playwright", "puppeteer", "chrome", "selenium", "web-browse"], "🌐"],
		[["python", "pyodide", "pydantic"], "🐍"],
		[["memory", "knowledge", "graph"], "🧠"],
		[["search", "brave", "tavily", "exa", "serp", "google-search"], "🔍"],
		[["fetch", "http", "request", "curl", "scrape", "crawl"], "📡"],
		[["docker", "container", "kubernetes", "k8s"], "🐳"],
		[["aws", "cloud", "azure", "gcp", "s3"], "☁️"],
		[["slack", "discord", "telegram", "wechat", "messaging"], "💬"],
		[["notion", "obsidian", "document", "docs", "markdown"], "📝"],
		[["redis", "cache", "memcached"], "🔴"],
		[["think", "reason", "sequential"], "💭"],
		[["mail", "email", "smtp", "imap"], "📧"],
		[["image", "vision", "screenshot", "ocr", "dalle", "stable-diffusion"], "🖼️"],
		[["map", "geo", "location", "openstreetmap"], "🗺️"],
		[["weather", "climate"], "🌤️"],
		[["security", "auth", "encrypt", "vault"], "🔒"],
		[["test", "debug", "lint", "sentry"], "🧪"],
		[["api", "openapi", "graphql", "rest", "swagger"], "🔌"],
		[["time", "clock", "schedule", "cron"], "⏰"],
		[["math", "calculator", "compute"], "🔢"],
		[["stripe", "payment", "billing"], "💳"],
		[["pdf", "excel", "csv", "office"], "📊"],
	];
	for (const [kws, icon] of rules) {
		if (kws.some((k) => text.includes(k))) return icon;
	}
	return "⚡";
}

/**
 * 判断一个 npm 包是否为 MCP 服务器
 */
function isMcpPackage(obj: NpmSearchObject): boolean {
	const name = obj.package.name.toLowerCase();
	const desc = (obj.package.description || "").toLowerCase();
	const kws = (obj.package.keywords || []).map((k) => k.toLowerCase());

	if (name.includes("mcp") || name.includes("model-context-protocol")) return true;
	if (kws.some((k) => ["mcp", "mcp-server", "model-context-protocol", "mcp-tool"].includes(k)))
		return true;
	if (desc.includes("model context protocol") || desc.includes("mcp server")) return true;
	return false;
}

/**
 * 将 npm 搜索结果转换为 McpMarketItem
 */
function npmToMarketItem(obj: NpmSearchObject): McpMarketItem {
	const pkg = obj.package;
	const keywords = (pkg.keywords || [])
		.filter((k) => k.length < 30 && !EXCLUDED_TAGS.has(k.toLowerCase()))
		.slice(0, 10);

	return {
		id: `npm:${pkg.name}`,
		name: pkg.name,
		description: pkg.description || "",
		version: pkg.version,
		author: pkg.publisher?.username || "unknown",
		icon: inferIcon(pkg.name, pkg.keywords || []),
		tags: keywords,
		rating: Math.round(obj.score.final * 50) / 10, // 映射到 0-5
		downloads: Math.round(obj.score.detail.popularity * 200_000),
		transport: "stdio",
		command: "npx",
		args: ["-y", pkg.name],
		readmeUrl: pkg.links.homepage || pkg.links.npm,
		repositoryUrl: pkg.links.repository,
		createdAt: pkg.date,
		updatedAt: pkg.date,
	};
}

// ---------- Service ----------

export class McpMarketService extends EventEmitter {
	private cache: McpMarketItem[] = [];
	private lastFetchTime: number = 0;
	private pendingFetch: Promise<McpMarketItem[]> | null = null;

	/**
	 * 从 npm 注册表搜索 MCP 相关包
	 */
	private async fetchNpmSearch(query: string, size = 100): Promise<NpmSearchObject[]> {
		const url = `${NPM_REGISTRY_URL}?text=${encodeURIComponent(query)}&size=${size}`;
		const response = await fetch(url, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
		});
		if (!response.ok) {
			throw new Error(`npm search failed: ${response.status} ${response.statusText}`);
		}
		const data = (await response.json()) as NpmSearchResponse;
		return data.objects;
	}

	/**
	 * 执行多个搜索查询，合并去重
	 */
	private async fetchAllMcpPackages(): Promise<McpMarketItem[]> {
		const queries = [
			"keywords:mcp-server",
			"keywords:model-context-protocol",
			"@modelcontextprotocol",
			"mcp server",
		];

		const seen = new Map<string, McpMarketItem>();

		const results = await Promise.allSettled(queries.map((q) => this.fetchNpmSearch(q)));

		for (const result of results) {
			if (result.status !== "fulfilled") continue;
			for (const obj of result.value) {
				if (!isMcpPackage(obj)) continue;
				const item = npmToMarketItem(obj);
				if (!seen.has(item.id)) {
					seen.set(item.id, item);
				}
			}
		}

		return Array.from(seen.values());
	}

	/**
	 * 获取缓存的市场数据，过期时自动刷新
	 */
	private async getCachedItems(): Promise<McpMarketItem[]> {
		if (this.cache.length > 0 && Date.now() - this.lastFetchTime < CACHE_TTL) {
			return this.cache;
		}

		// 合并并发请求
		if (this.pendingFetch) {
			return this.pendingFetch;
		}

		this.pendingFetch = this.fetchAllMcpPackages()
			.then((items) => {
				if (items.length > 0) {
					this.cache = items;
					this.lastFetchTime = Date.now();
				}
				return this.cache;
			})
			.finally(() => {
				this.pendingFetch = null;
			});

		return this.pendingFetch;
	}

	/**
	 * 搜索市场 MCP
	 */
	async search(params: McpMarketSearchParams = {}): Promise<McpMarketSearchResult> {
		const { query, tags, sortBy = "downloads", page = 1, limit = 20 } = params;

		try {
			let items: McpMarketItem[];

			if (query) {
				// 有搜索词时：从 npm 搜索 + 本地缓存合并
				const [npmItems, cached] = await Promise.all([
					this.fetchNpmSearch(`${query} mcp`, 50)
						.then((objs) => objs.filter(isMcpPackage).map(npmToMarketItem))
						.catch(() => [] as McpMarketItem[]),
					this.getCachedItems(),
				]);

				const merged = new Map<string, McpMarketItem>();
				for (const item of [...npmItems, ...cached]) {
					if (!merged.has(item.id)) merged.set(item.id, item);
				}

				const lowerQuery = query.toLowerCase();
				items = Array.from(merged.values()).filter(
					(item) =>
						item.name.toLowerCase().includes(lowerQuery) ||
						item.description.toLowerCase().includes(lowerQuery) ||
						item.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
				);
			} else {
				items = await this.getCachedItems();
			}

			// 标签过滤
			if (tags && tags.length > 0) {
				items = items.filter((item) =>
					tags.some((tag) => item.tags.includes(tag)),
				);
			}

			// 排序
			items = this.sortItems([...items], sortBy);

			// 分页
			const total = items.length;
			const start = (page - 1) * limit;
			const paginatedItems = items.slice(start, start + limit);

			return { items: paginatedItems, total, page, limit };
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
	}

	/**
	 * 获取热门 MCP
	 */
	async getPopular(limit = 10): Promise<McpMarketItem[]> {
		const result = await this.search({ sortBy: "downloads", limit });
		return result.items;
	}

	/**
	 * 获取高评分 MCP
	 */
	async getTopRated(limit = 10): Promise<McpMarketItem[]> {
		const result = await this.search({ sortBy: "rating", limit });
		return result.items;
	}

	/**
	 * 获取最新 MCP
	 */
	async getNewest(limit = 10): Promise<McpMarketItem[]> {
		const result = await this.search({ sortBy: "newest", limit });
		return result.items;
	}

	/**
	 * 获取 MCP 详情
	 */
	async getDetail(id: string): Promise<McpMarketItem | null> {
		const items = await this.getCachedItems();
		return items.find((i) => i.id === id) || null;
	}

	/**
	 * 获取所有标签
	 */
	async getTags(): Promise<string[]> {
		try {
			const items = await this.getCachedItems();
			const tagCount = new Map<string, number>();
			for (const item of items) {
				for (const tag of item.tags) {
					tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
				}
			}
			// 按出现次数排序，过滤只出现 1 次的标签
			return Array.from(tagCount.entries())
				.filter(([, count]) => count > 1)
				.sort((a, b) => b[1] - a[1])
				.map(([tag]) => tag);
		} catch (error) {
			this.emit("error", error);
			return [];
		}
	}

	/**
	 * 安装 MCP（生成服务器配置）
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
		// 尝试从 GitHub 获取原始 README
		if (marketItem.repositoryUrl) {
			try {
				const repoUrl = marketItem.repositoryUrl.replace(/\.git$/, "");
				const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
				if (match) {
					const rawUrl = `https://raw.githubusercontent.com/${match[1]}/main/README.md`;
					const response = await fetch(rawUrl, {
						signal: AbortSignal.timeout(10_000),
					});
					if (response.ok) {
						return await response.text();
					}
					// 尝试 master 分支
					const masterUrl = `https://raw.githubusercontent.com/${match[1]}/master/README.md`;
					const response2 = await fetch(masterUrl, {
						signal: AbortSignal.timeout(10_000),
					});
					if (response2.ok) {
						return await response2.text();
					}
				}
			} catch {
				// fallthrough
			}
		}

		// 尝试 npm 包的 readme
		const pkgName = marketItem.id.startsWith("npm:") ? marketItem.id.slice(4) : marketItem.name;
		try {
			const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`, {
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(10_000),
			});
			if (response.ok) {
				const data = (await response.json()) as { readme?: string };
				if (data.readme && data.readme.length > 10) {
					return data.readme;
				}
			}
		} catch {
			// fallthrough
		}

		return `# ${marketItem.name}\n\n${marketItem.description}\n\n- **Version**: ${marketItem.version}\n- **Author**: ${marketItem.author}\n- **Install**: \`npx -y ${pkgName}\``;
	}

	/**
	 * 排序
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
						new Date(b.updatedAt || b.createdAt || 0).getTime() -
						new Date(a.updatedAt || a.createdAt || 0).getTime(),
				);
			default:
				return items;
		}
	}
}

// 单例实例
export const mcpMarketService = new McpMarketService();
