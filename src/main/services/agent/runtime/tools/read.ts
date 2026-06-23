/**
 * Read tool — read a file with line numbers (`cat -n` format).
 *
 * Direct Node fs read; honours `offset` (1-indexed) and `limit`. Paths can
 * be absolute or relative to ctx.cwd. Mirrors Claude Code's Read tool.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createReadTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Read",
		description:
			"Read the contents of a file. Returns content with line numbers in `cat -n` format. Supports `offset` (1-indexed start line) and `limit` (count). Use Glob/Grep first to discover files.",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Absolute or relative-to-cwd file path",
				},
				offset: {
					type: "number",
					description: "1-indexed starting line (default 1)",
				},
				limit: {
					type: "number",
					description: "Max lines to return (default all)",
				},
			},
			required: ["path"],
		},
		async execute(input) {
			const path = String(input.path ?? "");
			if (!path) throw new Error("Read: `path` is required");
			const offset = Math.max(1, Number(input.offset ?? 1) | 0);
			const limit = Number(input.limit ?? 0) | 0;
			const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			let content: string;
			try {
				content = await readFile(abs, "utf-8");
			} catch (err) {
				throw new Error(
					`Read: failed to read ${abs}: ${(err as Error).message}`,
				);
			}
			const lines = content.split("\n");
			const sliceStart = offset - 1;
			const sliceEnd = limit > 0 ? sliceStart + limit : lines.length;
			const view = lines.slice(sliceStart, sliceEnd);
			return view
				.map((l, i) => `${(sliceStart + i + 1).toString().padStart(4)}\t${l}`)
				.join("\n");
		},
	};
}
