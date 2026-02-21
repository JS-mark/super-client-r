import type { SearchProviderType } from "../../types/search";

export interface SearchProvider {
	id: SearchProviderType;
	name: string;
	description: string;
	icon: string;
	requiresApiKey: boolean;
	requiresApiUrl: boolean;
	apiKeyLabel: string;
	apiUrlLabel?: string;
	apiKeyPlaceholder: string;
	apiUrlPlaceholder?: string;
	helpUrl?: string;
	isApiSearch: boolean;
}

export const SEARCH_PROVIDERS: SearchProvider[] = [
	{
		id: "zhipu",
		name: "智谱 AI",
		description: "智谱 AI 搜索 API",
		icon: "🧠",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入智谱 AI API Key",
		helpUrl: "https://open.bigmodel.cn/",
		isApiSearch: true,
	},
	{
		id: "tavily",
		name: "Tavily",
		description: "Tavily AI 搜索引擎",
		icon: "🔍",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Tavily API Key",
		helpUrl: "https://tavily.com/",
		isApiSearch: true,
	},
	{
		id: "searxng",
		name: "SearXNG",
		description: "自建 SearXNG 搜索服务",
		icon: "🌐",
		requiresApiKey: false,
		requiresApiUrl: true,
		apiKeyLabel: "API Key (可选)",
		apiKeyPlaceholder: "如有访问限制，请输入 API Key",
		apiUrlLabel: "API 地址",
		apiUrlPlaceholder: "http://localhost:8080",
		helpUrl: "https://docs.searxng.org/",
		isApiSearch: true,
	},
	{
		id: "exa",
		name: "Exa",
		description: "Exa AI 搜索引擎",
		icon: "⚡",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Exa API Key",
		helpUrl: "https://exa.ai/",
		isApiSearch: true,
	},
	{
		id: "exa_mcp",
		name: "Exa MCP",
		description: "Exa MCP Server",
		icon: "🔗",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Exa API Key",
		helpUrl: "https://exa.ai/",
		isApiSearch: true,
	},
	{
		id: "bocha",
		name: "博查",
		description: "博查 AI 搜索引擎",
		icon: "🔎",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入博查 API Key",
		isApiSearch: true,
	},
	{
		id: "sogou",
		name: "搜狗",
		description: "搜狗搜索 API",
		icon: "🐕",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入搜狗 API Key",
		isApiSearch: true,
	},
	{
		id: "google",
		name: "Google",
		description: "Google 搜索 (通过 API)",
		icon: "G",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key / CX ID",
		apiKeyPlaceholder: "请输入 Google API Key 或 CX ID",
		helpUrl: "https://developers.google.com/custom-search",
		isApiSearch: false,
	},
	{
		id: "bing",
		name: "Bing",
		description: "必应搜索 (通过 API)",
		icon: "B",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入 Bing API Key",
		helpUrl: "https://www.microsoft.com/en-us/bing/apis/bing-web-search-api",
		isApiSearch: false,
	},
	{
		id: "baidu",
		name: "百度",
		description: "百度搜索 (通过 API)",
		icon: "du",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		apiKeyPlaceholder: "请输入百度 API Key",
		helpUrl: "https://apis.baidu.com/",
		isApiSearch: false,
	},
];

export const getProviderInfo = (
	id: SearchProviderType,
): SearchProvider | undefined => {
	return SEARCH_PROVIDERS.find((p) => p.id === id);
};
