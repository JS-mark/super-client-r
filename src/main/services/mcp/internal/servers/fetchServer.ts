/**
 * @scp/fetch — 内置 HTTP 请求工具
 * 使用 Node.js 原生 fetch
 */

import type { InternalMcpServer, InternalToolHandler } from "../types";

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_TIMEOUT = 30_000; // 30s

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

const fetchHandler: InternalToolHandler = async (args) => {
	const url = args.url as string;
	const method = (args.method as string) || "GET";
	const headers = (args.headers as Record<string, string>) || {};
	const body = args.body as string | undefined;
	const timeout = Math.min((args.timeout as number) || DEFAULT_TIMEOUT, 60_000);

	if (!url || typeof url !== "string") {
		return textResult("Error: url is required", true);
	}

	if (url.startsWith("file://")) {
		return textResult("Error: file:// protocol is not allowed", true);
	}

	if (body && body.length > MAX_BODY_SIZE) {
		return textResult(`Error: body exceeds ${MAX_BODY_SIZE} bytes limit`, true);
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(url, {
			method,
			headers,
			body: method !== "GET" && method !== "HEAD" ? body : undefined,
			signal: controller.signal,
		});

		clearTimeout(timer);

		const responseHeaders: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value;
		});

		const contentType = response.headers.get("content-type") || "";
		let responseBody: string;

		if (contentType.includes("application/json")) {
			const json = await response.json();
			responseBody = JSON.stringify(json, null, 2);
		} else {
			responseBody = await response.text();
			if (responseBody.length > MAX_BODY_SIZE) {
				responseBody =
					responseBody.slice(0, MAX_BODY_SIZE) + "\n...(truncated)";
			}
		}

		const result = [
			`Status: ${response.status} ${response.statusText}`,
			`Headers: ${JSON.stringify(responseHeaders, null, 2)}`,
			"",
			responseBody,
		].join("\n");

		return textResult(result);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Fetch error: ${msg}`, true);
	}
};

const fetchHtmlHandler: InternalToolHandler = async (args) => {
	const url = args.url as string;
	const timeout = Math.min((args.timeout as number) || DEFAULT_TIMEOUT, 60_000);

	if (!url || typeof url !== "string") {
		return textResult("Error: url is required", true);
	}

	if (url.startsWith("file://")) {
		return textResult("Error: file:// protocol is not allowed", true);
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; ScpFetch/1.0)",
				Accept: "text/html,application/xhtml+xml",
			},
			signal: controller.signal,
		});

		clearTimeout(timer);

		const html = await response.text();

		// 简单提取文本内容：移除 script/style 标签后去除 HTML 标签
		const text = html
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<style[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim();

		const truncated =
			text.length > 100_000
				? text.slice(0, 100_000) + "\n...(truncated)"
				: text;

		return textResult(
			`URL: ${url}\nStatus: ${response.status}\n\n${truncated}`,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Fetch HTML error: ${msg}`, true);
	}
};

const fetchJsonHandler: InternalToolHandler = async (args) => {
	const url = args.url as string;
	const method = (args.method as string) || "GET";
	const headers = (args.headers as Record<string, string>) || {};
	const body = args.body as string | undefined;

	if (!url || typeof url !== "string") {
		return textResult("Error: url is required", true);
	}

	if (url.startsWith("file://")) {
		return textResult("Error: file:// protocol is not allowed", true);
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

		const response = await fetch(url, {
			method,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				...headers,
			},
			body: method !== "GET" && method !== "HEAD" ? body : undefined,
			signal: controller.signal,
		});

		clearTimeout(timer);

		const json = await response.json();
		return textResult(JSON.stringify(json, null, 2));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Fetch JSON error: ${msg}`, true);
	}
};

export function createFetchServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("fetch", fetchHandler);
	handlers.set("fetch_html", fetchHtmlHandler);
	handlers.set("fetch_json", fetchJsonHandler);

	return {
		id: "@scp/fetch",
		name: "@scp/fetch",
		description:
			"HTTP request tools for fetching web content, JSON APIs, and HTML pages",
		version: "1.0.0",
		tools: [
			{
				name: "fetch",
				description:
					"Make an HTTP request to any URL. Supports all HTTP methods, custom headers, and request body.",
				inputSchema: {
					type: "object",
					properties: {
						url: { type: "string", description: "The URL to fetch" },
						method: {
							type: "string",
							description: "HTTP method (default: GET)",
							enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
						},
						headers: {
							type: "object",
							description: "Custom request headers",
							additionalProperties: { type: "string" },
						},
						body: {
							type: "string",
							description: "Request body (for POST/PUT/PATCH)",
						},
						timeout: {
							type: "number",
							description:
								"Timeout in milliseconds (default: 30000, max: 60000)",
						},
					},
					required: ["url"],
				},
			},
			{
				name: "fetch_html",
				description:
					"Fetch a web page and extract its text content (HTML tags stripped).",
				inputSchema: {
					type: "object",
					properties: {
						url: { type: "string", description: "The URL to fetch" },
						timeout: {
							type: "number",
							description:
								"Timeout in milliseconds (default: 30000, max: 60000)",
						},
					},
					required: ["url"],
				},
			},
			{
				name: "fetch_json",
				description: "Fetch JSON data from an API endpoint.",
				inputSchema: {
					type: "object",
					properties: {
						url: { type: "string", description: "The API URL" },
						method: {
							type: "string",
							description: "HTTP method (default: GET)",
							enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
						},
						headers: {
							type: "object",
							description: "Custom request headers",
							additionalProperties: { type: "string" },
						},
						body: {
							type: "string",
							description: "Request body as JSON string",
						},
					},
					required: ["url"],
				},
			},
		],
		handlers,
	};
}
