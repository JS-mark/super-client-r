// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadTool } from "../tools/read";

const TMP = join(tmpdir(), `read-tool-${Date.now()}`);

function setup() {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
	writeFileSync(join(TMP, "small.txt"), "line 1\nline 2\nline 3\n");
	writeFileSync(
		join(TMP, "big.txt"),
		Array.from({ length: 100 }, (_, i) => `L${i + 1}`).join("\n"),
	);
	return TMP;
}

describe("Read tool", () => {
	it("reads small file with line numbers", async () => {
		const dir = setup();
		const tool = createReadTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		const result = await tool.execute({ path: "small.txt" });
		expect(result).toContain("1\tline 1");
		expect(result).toContain("3\tline 3");
	});

	it("honours offset + limit (1-indexed offset, count limit)", async () => {
		const dir = setup();
		const tool = createReadTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		const result = await tool.execute({
			path: "big.txt",
			offset: 50,
			limit: 3,
		});
		expect(result).toMatch(/50\tL50/);
		expect(result).toMatch(/52\tL52/);
		expect(result).not.toMatch(/53\tL53/);
	});

	it("resolves relative paths against cwd", async () => {
		const dir = setup();
		const tool = createReadTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		await expect(tool.execute({ path: "small.txt" })).resolves.toBeDefined();
	});

	it("errors clearly on missing file", async () => {
		const dir = setup();
		const tool = createReadTool({
			cwd: dir,
			signal: new AbortController().signal,
		});
		await expect(
			tool.execute({ path: "missing.txt" }),
		).rejects.toThrow(/(ENOENT|Failed to read|failed to read|no such file)/i);
	});
});
