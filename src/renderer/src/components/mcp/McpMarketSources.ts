/**
 * Third-party MCP marketplace source definitions
 */

export interface McpMarketSource {
	id: string;
	name: string;
	nameZh: string;
	description: string;
	descriptionZh: string;
	url: string;
	/** If true, this is a special "official" entry */
	official?: boolean;
}

/**
 * MCP official SVG logo path data (viewBox 0 0 180 180, 3 stroke paths)
 */
export const MCP_LOGO_PATHS = [
	"M23.5996 85.2532L86.2021 22.6507C94.8457 14.0071 108.86 14.0071 117.503 22.6507C126.147 31.2942 126.147 45.3083 117.503 53.9519L70.2254 101.23",
	"M70.8789 100.578L117.504 53.952C126.148 45.3083 140.163 45.3083 148.806 53.952L149.132 54.278C157.776 62.9216 157.776 76.9357 149.132 85.5792L92.5139 142.198C89.6327 145.079 89.6327 149.75 92.5139 152.631L104.14 164.257",
	"M101.853 38.3013L55.553 84.6011C46.9094 93.2447 46.9094 107.258 55.553 115.902C64.1966 124.546 78.2106 124.546 86.8543 115.902L133.154 69.6025",
];

export const MCP_MARKET_SOURCES: McpMarketSource[] = [
	{
		id: "official",
		name: "MCP Official",
		nameZh: "MCP 官方",
		description: "Official MCP server registry by Anthropic",
		descriptionZh: "Anthropic 官方 MCP 服务注册中心",
		url: "https://github.com/modelcontextprotocol/servers",
		official: true,
	},
	{
		id: "bailian",
		name: "Alibaba Cloud Bailian",
		nameZh: "阿里云百炼",
		description: "Alibaba Cloud Bailian MCP marketplace",
		descriptionZh: "阿里云百炼 MCP 服务市场",
		url: "https://bailian.console.aliyun.com/",
	},
	{
		id: "modelscope",
		name: "ModelScope",
		nameZh: "魔搭社区",
		description: "ModelScope MCP server marketplace",
		descriptionZh: "魔搭社区 MCP 服务市场",
		url: "https://modelscope.cn/",
	},
	{
		id: "tokenflux",
		name: "TokenFlux",
		nameZh: "TokenFlux",
		description: "TokenFlux MCP marketplace",
		descriptionZh: "TokenFlux MCP 市场",
		url: "https://tokenflux.ai/",
	},
	{
		id: "302ai",
		name: "302.AI",
		nameZh: "302.AI",
		description: "302.AI MCP marketplace",
		descriptionZh: "302.AI MCP 市场",
		url: "https://302.ai/",
	},
	{
		id: "mcprouter",
		name: "MCP Router",
		nameZh: "MCP Router",
		description: "MCP Router - aggregate MCP servers",
		descriptionZh: "MCP Router - 聚合 MCP 服务",
		url: "https://mcprouter.ai/",
	},
];
