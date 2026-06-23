/**
 * Grep tool — search file contents using regex.
 *
 * Wraps @scp/grep::grep. Translates Claude-Code-style fields (glob,
 * filesOnly, contextLines) to the MCP server's signature.
 */

import { isAbsolute, resolve } from "node:path";
import { mcpService } from "../../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createGrepTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Grep",
		description:
			"Search file contents using regex. Returns matching lines with file path and line number. Pass `glob` to filter included files (e.g. `*.ts`). Pass `filesOnly:true` to return only file paths.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: {
					type: "string",
					description: "Regex pattern (ripgrep syntax)",
				},
				path: { type: "string", description: "Search root (default cwd)" },
				glob: {
					type: "string",
					description: "Optional glob filter, e.g. `*.ts`",
				},
				filesOnly: {
					type: "boolean",
					description: "List only matching file paths",
				},
				ignoreCase: { type: "boolean" },
				contextLines: {
					type: "number",
					description: "0-5; default 0",
				},
				maxResults: {
					type: "number",
					description: "Default 200; max 1000",
				},
			},
			required: ["pattern"],
		},
		async execute(input) {
			const pattern = String(input.pattern ?? "");
			if (!pattern) throw new Error("Grep: `pattern` is required");
			const path = String(input.path ?? ctx.cwd);
			const searchPath = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			const args: Record<string, unknown> = {
				pattern,
				path: searchPath,
				ignoreCase: Boolean(input.ignoreCase),
				filesOnly: Boolean(input.filesOnly),
			};
			if (typeof input.glob === "string") args.include = input.glob;
			if (typeof input.contextLines === "number") {
				args.contextLines = Math.max(0, Math.min(5, input.contextLines));
			}
			if (typeof input.maxResults === "number") {
				args.maxResults = Math.max(1, Math.min(1000, input.maxResults));
			}
			const result = await mcpService.callTool("@scp/grep", "grep", args, {});
			if (!result.success) throw new Error(`Grep: ${result.error}`);
			const data = result.data as
				| { content?: Array<{ text?: string }> }
				| undefined;
			return data?.content?.map((c) => c.text ?? "").join("") ?? "";
		},
	};
}
