// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWriteTool } from "../tools/write";

const TMP = join(tmpdir(), `write-tool-${Date.now()}`);

describe("Write tool", () => {
	it("creates file with parent dirs if needed", async () => {
		rmSync(TMP, { recursive: true, force: true });
		mkdirSync(TMP, { recursive: true });
		const tool = createWriteTool({
			cwd: TMP,
			signal: new AbortController().signal,
		});
		const result = await tool.execute({
			path: "sub/dir/hello.txt",
			content: "hi\n",
		});
		expect(result).toMatch(/Wrote/);
		expect(existsSync(join(TMP, "sub/dir/hello.txt"))).toBe(true);
		expect(readFileSync(join(TMP, "sub/dir/hello.txt"), "utf-8")).toBe("hi\n");
	});

	it("overwrites existing file", async () => {
		rmSync(TMP, { recursive: true, force: true });
		mkdirSync(TMP, { recursive: true });
		const tool = createWriteTool({
			cwd: TMP,
			signal: new AbortController().signal,
		});
		await tool.execute({ path: "a.txt", content: "v1" });
		await tool.execute({ path: "a.txt", content: "v2" });
		expect(readFileSync(join(TMP, "a.txt"), "utf-8")).toBe("v2");
	});
});
