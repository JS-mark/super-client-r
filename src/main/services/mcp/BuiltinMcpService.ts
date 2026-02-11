/**
 * 内置 MCP 服务器服务
 * 管理内置的 MCP 服务器定义和配置
 */

import { EventEmitter } from "events";
import type { BuiltinMcpDefinition, McpServerConfig } from "../../ipc/types";

// 内置 MCP 服务器定义
const BUILTIN_MCP_DEFINITIONS: BuiltinMcpDefinition[] = [
	{
		id: "builtin-filesystem",
		name: "文件系统",
		description: "文件系统操作，包括读取、写入、列出目录和搜索文件",
		version: "1.0.0",
		icon: "📁",
		tags: ["official", "filesystem", "utilities"],
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-filesystem"],
		configSchema: {
			type: "object",
			properties: {
				allowedPaths: {
					type: "array",
					items: { type: "string" },
					description: "允许访问的文件路径列表",
				},
			},
			required: ["allowedPaths"],
		},
	},
	{
		id: "builtin-sqlite",
		name: "SQLite 数据库",
		description: "SQLite 数据库操作，支持查询和分析",
		version: "1.0.0",
		icon: "🗄️",
		tags: ["official", "database", "sqlite"],
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-sqlite"],
		configSchema: {
			type: "object",
			properties: {
				dbPath: {
					type: "string",
					description: "SQLite 数据库文件路径",
				},
			},
			required: ["dbPath"],
		},
	},
	{
		id: "builtin-github",
		name: "GitHub",
		description: "GitHub API 集成，支持仓库管理和代码搜索",
		version: "1.0.0",
		icon: "🐙",
		tags: ["official", "github", "git"],
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-github"],
		env: {
			GITHUB_PERSONAL_ACCESS_TOKEN: "",
		},
		configSchema: {
			type: "object",
			properties: {
				GITHUB_PERSONAL_ACCESS_TOKEN: {
					type: "string",
					description: "GitHub Personal Access Token",
				},
			},
			required: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
		},
	},
	{
		id: "builtin-brave-search",
		name: "Brave 搜索",
		description: "使用 Brave Search API 进行网络搜索",
		version: "1.0.0",
		icon: "🔍",
		tags: ["official", "search", "web"],
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-brave-search"],
		env: {
			BRAVE_API_KEY: "",
		},
		configSchema: {
			type: "object",
			properties: {
				BRAVE_API_KEY: {
					type: "string",
					description: "Brave Search API Key",
				},
			},
			required: ["BRAVE_API_KEY"],
		},
	},
	{
		id: "builtin-puppeteer",
		name: "Puppeteer 浏览器",
		description: "浏览器自动化和网页抓取",
		version: "1.0.0",
		icon: "🌐",
		tags: ["official", "browser", "automation"],
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-puppeteer"],
	},
	{
		id: "builtin-fetch",
		name: "HTTP 请求",
		description: "发送 HTTP 请求获取网页内容",
		version: "1.0.0",
		icon: "📡",
		tags: ["official", "http", "fetch"],
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-fetch"],
	},
];

export class BuiltinMcpService extends EventEmitter {
	private definitions: Map<string, BuiltinMcpDefinition> = new Map();
	private userConfigs: Map<string, Record<string, unknown>> = new Map();

	constructor() {
		super();
		this.loadDefinitions();
	}

	/**
	 * 加载内置 MCP 定义
	 */
	private loadDefinitions(): void {
		for (const def of BUILTIN_MCP_DEFINITIONS) {
			this.definitions.set(def.id, def);
		}
	}

	/**
	 * 获取所有内置 MCP 定义
	 */
	getAllDefinitions(): BuiltinMcpDefinition[] {
		return Array.from(this.definitions.values());
	}

	/**
	 * 获取单个内置 MCP 定义
	 */
	getDefinition(id: string): BuiltinMcpDefinition | undefined {
		return this.definitions.get(id);
	}

	/**
	 * 检查是否为内置 MCP
	 */
	isBuiltin(id: string): boolean {
		return this.definitions.has(id);
	}

	/**
	 * 创建内置 MCP 服务器配置
	 */
	createServerConfig(
		definitionId: string,
		customConfig?: Record<string, unknown>,
	): McpServerConfig | null {
		const def = this.definitions.get(definitionId);
		if (!def) return null;

		// 合并环境变量配置
		const env: Record<string, string> = { ...def.env };
		if (customConfig) {
			for (const [key, value] of Object.entries(customConfig)) {
				if (typeof value === "string") {
					env[key] = value;
				}
			}
		}

		// 处理特殊参数（如 filesystem 的路径）
		let args = [...def.args];
		if (definitionId === "builtin-filesystem" && customConfig?.allowedPaths) {
			const paths = customConfig.allowedPaths as string[];
			args = [...def.args, ...paths];
		}
		if (definitionId === "builtin-sqlite" && customConfig?.dbPath) {
			args = [...def.args, customConfig.dbPath as string];
		}

		return {
			id: `${definitionId}_${Date.now()}`,
			name: def.name,
			type: "builtin",
			transport: def.transport,
			command: def.command,
			args,
			env,
			description: def.description,
			version: def.version,
			icon: def.icon,
			enabled: true,
		};
	}

	/**
	 * 保存用户配置
	 */
	setUserConfig(definitionId: string, config: Record<string, unknown>): void {
		this.userConfigs.set(definitionId, config);
		this.emit("config-updated", { definitionId, config });
	}

	/**
	 * 获取用户配置
	 */
	getUserConfig(definitionId: string): Record<string, unknown> | undefined {
		return this.userConfigs.get(definitionId);
	}

	/**
	 * 按标签搜索内置 MCP
	 */
	searchByTags(tags: string[]): BuiltinMcpDefinition[] {
		return this.getAllDefinitions().filter((def) =>
			tags.some((tag: string) => def.tags.includes(tag)),
		);
	}

	/**
	 * 按关键词搜索内置 MCP
	 */
	searchByKeyword(keyword: string): BuiltinMcpDefinition[] {
		const lowerKeyword = keyword.toLowerCase();
		return this.getAllDefinitions().filter(
			(def) =>
				def.name.toLowerCase().includes(lowerKeyword) ||
				def.description.toLowerCase().includes(lowerKeyword) ||
				def.tags.some((tag) => tag.toLowerCase().includes(lowerKeyword)),
		);
	}
}

// 单例实例
export const builtinMcpService = new BuiltinMcpService();
