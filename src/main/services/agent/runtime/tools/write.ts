/**
 * Write tool — create or overwrite a file (UTF-8). Creates parent dirs.
 *
 * Mirrors Claude Code's Write. For partial edits prefer Edit.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createWriteTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Write",
		description:
			"Write text to a file (UTF-8). Creates parent directories if they don't exist. Overwrites existing files. For partial edits prefer Edit.",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Absolute or relative-to-cwd file path",
				},
				content: { type: "string", description: "Full file content to write" },
			},
			required: ["path", "content"],
		},
		async execute(input) {
			const path = String(input.path ?? "");
			const content = String(input.content ?? "");
			if (!path) throw new Error("Write: `path` is required");
			const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			await mkdir(dirname(abs), { recursive: true });
			await writeFile(abs, content, "utf-8");
			return `Wrote ${content.length} bytes to ${abs}`;
		},
	};
}
