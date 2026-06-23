/**
 * Edit tool — anchor-based string replace with uniqueness check.
 *
 * Mirrors Claude Code's Edit. The model must supply `old_string` with
 * enough surrounding context that it appears exactly once in the file
 * (or set `replace_all: true`). This forces the model to Read first
 * and reason about what it's changing, instead of guessing fuzzy patches.
 */

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createEditTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Edit",
		description:
			"Replace `old_string` with `new_string` inside a file. `old_string` must appear exactly once unless `replace_all: true`. If the anchor is ambiguous, narrow it by adding more surrounding context. Prefer Edit over Write for partial changes.",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Absolute or relative-to-cwd file path",
				},
				old_string: {
					type: "string",
					description: "Exact substring to match",
				},
				new_string: { type: "string", description: "Replacement text" },
				replace_all: {
					type: "boolean",
					description: "Default false; when true replace every occurrence",
				},
			},
			required: ["path", "old_string", "new_string"],
		},
		async execute(input) {
			const path = String(input.path ?? "");
			const oldStr = String(input.old_string ?? "");
			const newStr = String(input.new_string ?? "");
			const replaceAll = Boolean(input.replace_all);
			if (!path) throw new Error("Edit: `path` is required");
			if (!oldStr) throw new Error("Edit: `old_string` must be non-empty");
			if (oldStr === newStr) {
				throw new Error(
					"Edit: `old_string` and `new_string` are identical — no-op",
				);
			}
			const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			let content: string;
			try {
				content = await readFile(abs, "utf-8");
			} catch (err) {
				throw new Error(
					`Edit: failed to read ${abs}: ${(err as Error).message}`,
				);
			}
			// Count occurrences without regex (oldStr can contain regex metacharacters).
			let count = 0;
			let idx = -1;
			while ((idx = content.indexOf(oldStr, idx + 1)) !== -1) count++;
			if (count === 0) {
				throw new Error(
					`Edit: anchor not found in ${abs}. Read the file and pick a substring that appears verbatim.`,
				);
			}
			if (count > 1 && !replaceAll) {
				throw new Error(
					`Edit: anchor matches ${count} times in ${abs}; pass replace_all:true OR include more surrounding context to make old_string unique.`,
				);
			}
			const next = replaceAll
				? content.split(oldStr).join(newStr)
				: content.replace(oldStr, newStr);
			await writeFile(abs, next, "utf-8");
			const replaced = replaceAll ? count : 1;
			return `Edited ${abs}: ${replaced} replacement${replaced === 1 ? "" : "s"}`;
		},
	};
}
