/**
 * WebFetch tool — fetch a URL and return its text content.
 *
 * Wraps @scp/fetch::fetch_html (HTML tags already stripped server-side).
 */

import { mcpService } from "../../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createWebFetchTool(_ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "WebFetch",
		description:
			"Fetch a URL and return its text content (HTML tags stripped). Use for online docs, package READMEs, blog posts. For raw JSON APIs prefer crafting a Bash + curl call.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "HTTPS URL to fetch" },
			},
			required: ["url"],
		},
		async execute(input) {
			const url = String(input.url ?? "");
			if (!url) throw new Error("WebFetch: `url` is required");
			const result = await mcpService.callTool(
				"@scp/fetch",
				"fetch_html",
				{ url },
				{},
			);
			if (!result.success) throw new Error(`WebFetch: ${result.error}`);
			const data = result.data as
				| { content?: Array<{ text?: string }> }
				| undefined;
			return data?.content?.map((c) => c.text ?? "").join("") ?? "";
		},
	};
}
