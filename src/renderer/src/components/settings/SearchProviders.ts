import i18n from "i18next";
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

function t(key: string, fallback: string): string {
	return i18n.t(key, { ns: "settings", defaultValue: fallback });
}

function providerT(id: string, field: string, fallback: string): string {
	return t(`searchProviders.${id}.${field}`, fallback);
}

export const SEARCH_PROVIDERS: SearchProvider[] = [
	{
		id: "zhipu",
		get name() {
			return providerT("zhipu", "name", "智谱 AI");
		},
		get description() {
			return providerT("zhipu", "description", "智谱 AI 搜索 API");
		},
		icon: "🧠",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		get apiKeyPlaceholder() {
			return providerT("zhipu", "apiKeyPlaceholder", "请输入智谱 AI API Key");
		},
		helpUrl: "https://open.bigmodel.cn/",
		isApiSearch: true,
	},
	{
		id: "tavily",
		name: "Tavily",
		get description() {
			return providerT("tavily", "description", "Tavily AI 搜索引擎");
		},
		icon: "🔍",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		get apiKeyPlaceholder() {
			return providerT(
				"tavily",
				"apiKeyPlaceholder",
				"请输入 Tavily API Key",
			);
		},
		helpUrl: "https://tavily.com/",
		isApiSearch: true,
	},
	{
		id: "searxng",
		name: "SearXNG",
		get description() {
			return providerT("searxng", "description", "自建 SearXNG 搜索服务");
		},
		icon: "🌐",
		requiresApiKey: false,
		requiresApiUrl: true,
		get apiKeyLabel() {
			return providerT("searxng", "apiKeyLabel", "API Key (可选)");
		},
		get apiKeyPlaceholder() {
			return providerT(
				"searxng",
				"apiKeyPlaceholder",
				"如有访问限制，请输入 API Key",
			);
		},
		get apiUrlLabel() {
			return providerT("searxng", "apiUrlLabel", "API 地址");
		},
		apiUrlPlaceholder: "http://localhost:8080",
		helpUrl: "https://docs.searxng.org/",
		isApiSearch: true,
	},
	{
		id: "exa",
		name: "Exa",
		get description() {
			return providerT("exa", "description", "Exa AI 搜索引擎");
		},
		icon: "⚡",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		get apiKeyPlaceholder() {
			return providerT("exa", "apiKeyPlaceholder", "请输入 Exa API Key");
		},
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
		get apiKeyPlaceholder() {
			return providerT("exa_mcp", "apiKeyPlaceholder", "请输入 Exa API Key");
		},
		helpUrl: "https://exa.ai/",
		isApiSearch: true,
	},
	{
		id: "bocha",
		get name() {
			return providerT("bocha", "name", "博查");
		},
		get description() {
			return providerT("bocha", "description", "博查 AI 搜索引擎");
		},
		icon: "🔎",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		get apiKeyPlaceholder() {
			return providerT("bocha", "apiKeyPlaceholder", "请输入博查 API Key");
		},
		isApiSearch: true,
	},
	{
		id: "sogou",
		get name() {
			return providerT("sogou", "name", "搜狗");
		},
		get description() {
			return providerT("sogou", "description", "搜狗搜索 API");
		},
		icon: "🐕",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		get apiKeyPlaceholder() {
			return providerT("sogou", "apiKeyPlaceholder", "请输入搜狗 API Key");
		},
		isApiSearch: true,
	},
	{
		id: "google",
		name: "Google",
		get description() {
			return providerT("google", "description", "Google 搜索 (通过 API)");
		},
		icon: "G",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key / CX ID",
		get apiKeyPlaceholder() {
			return providerT(
				"google",
				"apiKeyPlaceholder",
				"请输入 Google API Key 或 CX ID",
			);
		},
		helpUrl: "https://developers.google.com/custom-search",
		isApiSearch: false,
	},
	{
		id: "bing",
		name: "Bing",
		get description() {
			return providerT("bing", "description", "必应搜索 (通过 API)");
		},
		icon: "B",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		get apiKeyPlaceholder() {
			return providerT("bing", "apiKeyPlaceholder", "请输入 Bing API Key");
		},
		helpUrl:
			"https://www.microsoft.com/en-us/bing/apis/bing-web-search-api",
		isApiSearch: false,
	},
	{
		id: "baidu",
		get name() {
			return providerT("baidu", "name", "百度");
		},
		get description() {
			return providerT("baidu", "description", "百度搜索 (通过 API)");
		},
		icon: "du",
		requiresApiKey: true,
		requiresApiUrl: false,
		apiKeyLabel: "API Key",
		get apiKeyPlaceholder() {
			return providerT("baidu", "apiKeyPlaceholder", "请输入百度 API Key");
		},
		helpUrl: "https://apis.baidu.com/",
		isApiSearch: false,
	},
];

export const getProviderInfo = (
	id: SearchProviderType,
): SearchProvider | undefined => {
	return SEARCH_PROVIDERS.find((p) => p.id === id);
};
