/**
 * Glob tool — list files matching a glob pattern.
 *
 * Wraps @scp/file-system::search_files. Defaults search root to ctx.cwd.
 */

import { isAbsolute, resolve } from "node:path";
import { mcpService } from "../../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createGlobTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Glob",
		description:
			"List files matching a glob pattern. Examples: `**/*.ts`, `src/**/index.{ts,tsx}`, `*.md`. Default search root is cwd. Returns newline-separated absolute paths (capped at 1000).",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "Glob pattern" },
				path: { type: "string", description: "Search root (default cwd)" },
			},
			required: ["pattern"],
		},
		async execute(input) {
			const pattern = String(input.pattern ?? "");
			if (!pattern) throw new Error("Glob: `pattern` is required");
			const path = String(input.path ?? ctx.cwd);
			const searchPath = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			const result = await mcpService.callTool(
				"@scp/file-system",
				"search_files",
				{ pattern, path: searchPath },
				{},
			);
			if (!result.success) throw new Error(`Glob: ${result.error}`);
			const data = result.data as
				| { content?: Array<{ text?: string }> }
				| undefined;
			return data?.content?.map((c) => c.text ?? "").join("") ?? "";
		},
	};
}
