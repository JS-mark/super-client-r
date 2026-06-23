// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditTool } from "../tools/edit";

const TMP = join(tmpdir(), `edit-tool-${Date.now()}`);

function setup(content: string, name = "f.txt") {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
	writeFileSync(join(TMP, name), content);
	return TMP;
}

describe("Edit tool", () => {
	it("replaces unique anchor exactly once", async () => {
		const dir = setup("alpha\nbeta\ngamma\n");
		const tool = createEditTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		const result = await tool.execute({
			path: "f.txt",
			old_string: "beta",
			new_string: "BETA",
		});
		expect(result).toMatch(/Edited/);
		expect(readFileSync(join(dir, "f.txt"), "utf-8")).toBe(
			"alpha\nBETA\ngamma\n",
		);
	});

	it("errors when anchor not found", async () => {
		const dir = setup("alpha\nbeta\n");
		const tool = createEditTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		await expect(
			tool.execute({ path: "f.txt", old_string: "delta", new_string: "X" }),
		).rejects.toThrow(/not found/i);
	});

	it("errors when anchor is ambiguous (multiple matches)", async () => {
		const dir = setup("dup\ndup\ndup\n");
		const tool = createEditTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		await expect(
			tool.execute({ path: "f.txt", old_string: "dup", new_string: "X" }),
		).rejects.toThrow(/3 (times|matches)/i);
	});

	it("`replace_all: true` allows multi-replace", async () => {
		const dir = setup("dup\ndup\ndup\n");
		const tool = createEditTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		await tool.execute({
			path: "f.txt",
			old_string: "dup",
			new_string: "X",
			replace_all: true,
		});
		expect(readFileSync(join(dir, "f.txt"), "utf-8")).toBe("X\nX\nX\n");
	});

	it("errors when old_string === new_string", async () => {
		const dir = setup("abc");
		const tool = createEditTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		await expect(
			tool.execute({ path: "f.txt", old_string: "abc", new_string: "abc" }),
		).rejects.toThrow(/identical|same/i);
	});

	it("handles regex metacharacters in old_string verbatim", async () => {
		const dir = setup("foo (bar) baz\n");
		const tool = createEditTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		await tool.execute({
			path: "f.txt",
			old_string: "(bar)",
			new_string: "<BAR>",
		});
		expect(readFileSync(join(dir, "f.txt"), "utf-8")).toBe("foo <BAR> baz\n");
	});
});
