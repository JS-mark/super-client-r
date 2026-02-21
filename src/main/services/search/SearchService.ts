import type {
	SearchExecuteRequest,
	SearchExecuteResponse,
	SearchResult,
} from "../../ipc/types";
import { mcpService } from "../mcp/McpService";

class SearchService {
	async execute(request: SearchExecuteRequest): Promise<SearchExecuteResponse> {
		const startTime = Date.now();
		const maxResults = request.maxResults ?? 5;

		const results = await this.dispatchSearch(request, maxResults);

		return {
			results,
			provider: request.provider,
			query: request.query,
			searchTimeMs: Date.now() - startTime,
		};
	}

	private async dispatchSearch(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		// MCP-based providers: provider starts with "mcp:" or is exa_mcp
		if (request.provider.startsWith("mcp:")) {
			const serverId = request.provider.slice(4);
			return this.searchViaMcp(serverId, request, maxResults);
		}

		switch (request.provider) {
			case "tavily":
				return this.searchTavily(request, maxResults);
			case "exa":
				return this.searchExa(request, maxResults);
			case "exa_mcp":
				return this.searchExaMcp(request, maxResults);
			case "searxng":
				return this.searchSearxng(request, maxResults);
			case "google":
				return this.searchGoogle(request, maxResults);
			case "bing":
				return this.searchBing(request, maxResults);
			case "zhipu":
				return this.searchZhipu(request, maxResults);
			case "bocha":
				return this.searchBocha(request, maxResults);
			case "baidu":
			case "sogou":
				throw new Error(
					`${request.provider} does not provide a public REST search API. Please configure a supported provider (tavily, exa, searxng, google, bing, zhipu, bocha).`,
				);
			default:
				throw new Error(`Unsupported search provider: ${request.provider}`);
		}
	}

	// ============ Tavily ============

	private async searchTavily(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		const resp = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: request.apiKey,
				query: request.query,
				max_results: maxResults,
				include_answer: false,
			}),
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Tavily API error ${resp.status}: ${text}`);
		}
		const data: any = await resp.json();
		return (data.results ?? []).map(
			(r: { title?: string; url?: string; content?: string }) => ({
				title: r.title ?? "",
				url: r.url ?? "",
				snippet: r.content ?? "",
			}),
		);
	}

	// ============ Exa ============

	private async searchExa(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		const resp = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${request.apiKey}`,
			},
			body: JSON.stringify({
				query: request.query,
				num_results: maxResults,
				contents: { text: { max_characters: 500 } },
			}),
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Exa API error ${resp.status}: ${text}`);
		}
		const data: any = await resp.json();
		return (data.results ?? []).map(
			(r: { title?: string; url?: string; text?: string }) => ({
				title: r.title ?? "",
				url: r.url ?? "",
				snippet: r.text ?? "",
			}),
		);
	}

	// ============ SearXNG ============

	private async searchSearxng(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		if (!request.apiUrl) {
			throw new Error("SearXNG requires an API URL to be configured.");
		}
		const baseUrl = request.apiUrl.replace(/\/+$/, "");
		const url = new URL(`${baseUrl}/search`);
		url.searchParams.set("q", request.query);
		url.searchParams.set("format", "json");
		url.searchParams.set("pageno", "1");

		const headers: Record<string, string> = {};
		if (request.apiKey) {
			headers.Authorization = `Bearer ${request.apiKey}`;
		}

		const resp = await fetch(url.toString(), { headers });
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`SearXNG API error ${resp.status}: ${text}`);
		}
		const data: any = await resp.json();
		return (data.results ?? [])
			.slice(0, maxResults)
			.map((r: { title?: string; url?: string; content?: string }) => ({
				title: r.title ?? "",
				url: r.url ?? "",
				snippet: r.content ?? "",
			}));
	}

	// ============ Google Custom Search ============

	private async searchGoogle(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		// apiKey format: "API_KEY:CX_ID" or config.cx provided separately
		let apiKey = request.apiKey;
		let cx = (request.config?.cx as string) ?? "";
		if (!cx && apiKey.includes(":")) {
			const parts = apiKey.split(":");
			apiKey = parts[0];
			cx = parts.slice(1).join(":");
		}
		if (!cx) {
			throw new Error(
				"Google Custom Search requires a CX (Search Engine ID). Configure as 'API_KEY:CX_ID' or set cx in config.",
			);
		}

		const url = new URL("https://www.googleapis.com/customsearch/v1");
		url.searchParams.set("key", apiKey);
		url.searchParams.set("cx", cx);
		url.searchParams.set("q", request.query);
		url.searchParams.set("num", String(Math.min(maxResults, 10)));

		const resp = await fetch(url.toString());
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Google API error ${resp.status}: ${text}`);
		}
		const data: any = await resp.json();
		return (data.items ?? []).map(
			(r: { title?: string; link?: string; snippet?: string }) => ({
				title: r.title ?? "",
				url: r.link ?? "",
				snippet: r.snippet ?? "",
			}),
		);
	}

	// ============ Bing Web Search ============

	private async searchBing(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		const url = new URL("https://api.bing.microsoft.com/v7.0/search");
		url.searchParams.set("q", request.query);
		url.searchParams.set("count", String(Math.min(maxResults, 50)));

		const resp = await fetch(url.toString(), {
			headers: {
				"Ocp-Apim-Subscription-Key": request.apiKey,
			},
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Bing API error ${resp.status}: ${text}`);
		}
		const data: any = await resp.json();
		return (data.webPages?.value ?? []).map(
			(r: { name?: string; url?: string; snippet?: string }) => ({
				title: r.name ?? "",
				url: r.url ?? "",
				snippet: r.snippet ?? "",
			}),
		);
	}

	// ============ 智谱 AI (ZhiPu) ============

	private async searchZhipu(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		const resp = await fetch("https://open.bigmodel.cn/api/paas/v4/tools", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${request.apiKey}`,
			},
			body: JSON.stringify({
				tool: "web-search-pro",
				messages: [{ role: "user", content: request.query }],
				stream: false,
			}),
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`ZhiPu API error ${resp.status}: ${text}`);
		}
		const data: any = await resp.json();
		const results: SearchResult[] = [];
		const choices = data.choices ?? [];
		for (const choice of choices) {
			const message = choice.message;
			if (!message?.tool_calls) continue;
			for (const tc of message.tool_calls) {
				if (tc.type === "search_result") {
					const searchResults = tc.search_result ?? [];
					for (const sr of searchResults) {
						results.push({
							title: sr.title ?? "",
							url: sr.link ?? "",
							snippet: sr.content ?? "",
						});
					}
				}
			}
		}
		return results.slice(0, maxResults);
	}

	// ============ 博查 (Bocha) ============

	private async searchBocha(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		const resp = await fetch("https://api.bochaai.com/v1/web-search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${request.apiKey}`,
			},
			body: JSON.stringify({
				query: request.query,
				count: maxResults,
			}),
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Bocha API error ${resp.status}: ${text}`);
		}
		const data: any = await resp.json();
		const webPages = data.data?.webPages?.value ?? data.webPages?.value ?? [];
		return webPages.map(
			(r: { name?: string; url?: string; snippet?: string }) => ({
				title: r.name ?? "",
				url: r.url ?? "",
				snippet: r.snippet ?? "",
			}),
		);
	}
	// ============ Exa via MCP ============

	private async searchExaMcp(
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		// Find a connected MCP server whose name/id contains "exa"
		const serverId =
			(request.config?.mcpServerId as string) ||
			this.findMcpServerByKeyword("exa");
		if (!serverId) {
			// Fallback to direct Exa REST API if no MCP server found
			console.warn(
				"[SearchService] No MCP server found for Exa, falling back to REST API",
			);
			return this.searchExa(request, maxResults);
		}
		return this.searchViaMcp(serverId, request, maxResults);
	}

	// ============ Generic MCP Search ============

	private async searchViaMcp(
		serverId: string,
		request: SearchExecuteRequest,
		maxResults: number,
	): Promise<SearchResult[]> {
		const status = mcpService.getServerStatus(serverId);
		if (!status || status.status !== "connected") {
			throw new Error(
				`MCP server "${serverId}" is not connected. Please connect it first.`,
			);
		}

		// Find a search-capable tool on this server
		const tools = mcpService.getServerTools(serverId);
		const searchTool = tools.find(
			(t) =>
				t.name.includes("search") ||
				t.name.includes("query") ||
				t.name.includes("find"),
		);

		if (!searchTool) {
			throw new Error(
				`MCP server "${serverId}" has no search-related tool. Available tools: ${tools.map((t) => t.name).join(", ")}`,
			);
		}

		console.log(
			`[SearchService] Calling MCP tool: server=${serverId}, tool=${searchTool.name}`,
		);

		// Build args based on the tool's input schema
		const args = this.buildMcpSearchArgs(searchTool, request.query, maxResults);

		const result = await mcpService.callTool(serverId, searchTool.name, args);
		if (!result.success) {
			throw new Error(`MCP tool call failed: ${result.error}`);
		}

		return this.parseMcpSearchResults(result.data, maxResults);
	}

	/**
	 * Build search args based on tool's input schema properties
	 */
	private buildMcpSearchArgs(
		tool: { name: string; inputSchema: Record<string, unknown> },
		query: string,
		maxResults: number,
	): Record<string, unknown> {
		const schema = tool.inputSchema;
		const properties = (schema.properties ?? {}) as Record<
			string,
			{ type?: string }
		>;
		const args: Record<string, unknown> = {};

		// Map query to the appropriate parameter name
		const queryParamNames = [
			"query",
			"q",
			"search_query",
			"text",
			"keywords",
			"input",
		];
		for (const name of queryParamNames) {
			if (name in properties) {
				args[name] = query;
				break;
			}
		}
		// Fallback: if no known query param, use the first string property
		if (Object.keys(args).length === 0) {
			const firstStringProp = Object.entries(properties).find(
				([, v]) => v.type === "string",
			);
			if (firstStringProp) {
				args[firstStringProp[0]] = query;
			}
		}

		// Map maxResults
		const countParamNames = [
			"num_results",
			"count",
			"limit",
			"max_results",
			"maxResults",
			"top_k",
		];
		for (const name of countParamNames) {
			if (name in properties) {
				args[name] = maxResults;
				break;
			}
		}

		return args;
	}

	/**
	 * Parse MCP tool result into SearchResult array
	 */
	private parseMcpSearchResults(
		data: unknown,
		maxResults: number,
	): SearchResult[] {
		if (!data) return [];

		// Handle array of content blocks (standard MCP format)
		if (Array.isArray(data)) {
			return this.extractResultsFromArray(data, maxResults);
		}

		// Handle object with results/items array
		const obj = data as Record<string, unknown>;
		const resultArray =
			obj.results ?? obj.items ?? obj.webPages ?? obj.data ?? obj.content;

		if (Array.isArray(resultArray)) {
			return this.extractResultsFromArray(resultArray, maxResults);
		}

		// If data is an object with text content, try to parse it
		if (typeof obj.text === "string" || typeof obj.content === "string") {
			const text = (obj.text ?? obj.content) as string;
			try {
				const parsed = JSON.parse(text);
				if (Array.isArray(parsed)) {
					return this.extractResultsFromArray(parsed, maxResults);
				}
			} catch {
				// Not JSON, return as a single result
				return [{ title: "", url: "", snippet: text.slice(0, 500) }];
			}
		}

		// Last resort: stringify the result
		return [
			{
				title: "MCP Result",
				url: "",
				snippet: JSON.stringify(data).slice(0, 500),
			},
		];
	}

	private extractResultsFromArray(
		arr: unknown[],
		maxResults: number,
	): SearchResult[] {
		return arr
			.slice(0, maxResults)
			.map((item: any) => {
				// MCP content block with type: "text"
				if (item.type === "text" && typeof item.text === "string") {
					try {
						const parsed = JSON.parse(item.text);
						if (Array.isArray(parsed)) {
							return parsed.map((r: any) => ({
								title: r.title ?? r.name ?? "",
								url: r.url ?? r.link ?? r.href ?? "",
								snippet:
									r.snippet ?? r.content ?? r.text ?? r.description ?? "",
							}));
						}
						return {
							title: parsed.title ?? parsed.name ?? "",
							url: parsed.url ?? parsed.link ?? "",
							snippet: parsed.snippet ?? parsed.content ?? parsed.text ?? "",
						};
					} catch {
						return { title: "", url: "", snippet: item.text.slice(0, 500) };
					}
				}
				// Direct result object
				return {
					title: item.title ?? item.name ?? "",
					url: item.url ?? item.link ?? item.href ?? "",
					snippet:
						item.snippet ?? item.content ?? item.text ?? item.description ?? "",
				};
			})
			.flat()
			.slice(0, maxResults);
	}

	/**
	 * Find a connected MCP server whose name or id contains the keyword
	 */
	private findMcpServerByKeyword(keyword: string): string | null {
		const lower = keyword.toLowerCase();
		const servers = mcpService.listServers();
		for (const server of servers) {
			const status = mcpService.getServerStatus(server.id);
			if (status?.status !== "connected") continue;

			if (
				server.id.toLowerCase().includes(lower) ||
				server.name.toLowerCase().includes(lower) ||
				(server.description ?? "").toLowerCase().includes(lower)
			) {
				return server.id;
			}
		}
		return null;
	}
}

export const searchService = new SearchService();
