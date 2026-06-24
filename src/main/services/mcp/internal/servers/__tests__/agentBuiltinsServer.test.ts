// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AGENT_BUILTIN_TOOL_NAMES,
	createAgentBuiltinsServer,
} from "../agentBuiltinsServer";

const TMP = mkdtempSync(join(tmpdir(), "agent-builtins-test-"));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

function textOf(result: { content: Array<{ text?: string }> }): string {
	return result.content.map((c) => c.text ?? "").join("");
}

describe("agentBuiltinsServer skeleton", () => {
	it("exposes 8 tools with canonical names", () => {
		const server = createAgentBuiltinsServer();
		expect(server.id).toBe("@scp/agent-builtins");
		expect(server.name).toBe("Agent Built-ins");
		expect(server.tools.map((t) => t.name).sort()).toEqual(
			[
				"Bash",
				"Edit",
				"Glob",
				"Grep",
				"Read",
				"Task",
				"WebFetch",
				"Write",
			].sort(),
		);
	});

	it("AGENT_BUILTIN_TOOL_NAMES matches tools[]", () => {
		const server = createAgentBuiltinsServer();
		expect(AGENT_BUILTIN_TOOL_NAMES).toEqual(server.tools.map((t) => t.name));
	});

	it("each tool has description + inputSchema + matching handler", () => {
		const server = createAgentBuiltinsServer();
		for (const tool of server.tools) {
			expect(typeof tool.description).toBe("string");
			expect(tool.description.length).toBeGreaterThan(20);
			expect(typeof tool.inputSchema).toBe("object");
			expect(server.handlers.has(tool.name)).toBe(true);
		}
	});

	it("placeholder handlers (Bash/Grep/Glob/WebFetch/Task) return isError until implemented", async () => {
		const server = createAgentBuiltinsServer();
		for (const name of ["Bash", "Grep", "Glob", "WebFetch", "Task"]) {
			const result = await server.handlers.get(name)!({});
			expect(result.isError).toBe(true);
		}
	});
});

describe("Read handler", () => {
	it("reads relative path resolved against _cwd, formats with cat -n", async () => {
		writeFileSync(join(TMP, "small.txt"), "alpha\nbeta\ngamma\n");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Read")!({
			path: "small.txt",
			_cwd: TMP,
		});
		expect(result.isError).toBeFalsy();
		const text = textOf(result);
		expect(text).toMatch(/1\talpha/);
		expect(text).toMatch(/3\tgamma/);
	});

	it("honors offset + limit (1-indexed)", async () => {
		writeFileSync(
			join(TMP, "big.txt"),
			Array.from({ length: 100 }, (_, i) => `L${i + 1}`).join("\n"),
		);
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Read")!({
			path: "big.txt",
			_cwd: TMP,
			offset: 50,
			limit: 3,
		});
		const text = textOf(result);
		expect(text).toMatch(/50\tL50/);
		expect(text).toMatch(/52\tL52/);
		expect(text).not.toMatch(/53\tL53/);
	});

	it("returns isError on missing file", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Read")!({
			path: "nope.txt",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
	});
});

describe("Write handler", () => {
	it("creates file with parent dirs", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Write")!({
			path: "sub/dir/hello.txt",
			content: "hi\n",
			_cwd: TMP,
		});
		expect(result.isError).toBeFalsy();
		expect(readFileSync(join(TMP, "sub/dir/hello.txt"), "utf-8")).toBe("hi\n");
	});

	it("overwrites existing file", async () => {
		const server = createAgentBuiltinsServer();
		await server.handlers.get("Write")!({
			path: "ow.txt",
			content: "v1",
			_cwd: TMP,
		});
		await server.handlers.get("Write")!({
			path: "ow.txt",
			content: "v2",
			_cwd: TMP,
		});
		expect(readFileSync(join(TMP, "ow.txt"), "utf-8")).toBe("v2");
	});
});

describe("Edit handler", () => {
	it("replaces unique anchor exactly once", async () => {
		writeFileSync(join(TMP, "e1.txt"), "alpha\nbeta\ngamma\n");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e1.txt",
			old_string: "beta",
			new_string: "BETA",
			_cwd: TMP,
		});
		expect(result.isError).toBeFalsy();
		expect(readFileSync(join(TMP, "e1.txt"), "utf-8")).toBe(
			"alpha\nBETA\ngamma\n",
		);
	});

	it("isError on ambiguous anchor", async () => {
		writeFileSync(join(TMP, "e2.txt"), "dup\ndup\ndup\n");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e2.txt",
			old_string: "dup",
			new_string: "X",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/3 times|ambiguous/i);
	});

	it("replace_all permits multi-replace", async () => {
		writeFileSync(join(TMP, "e3.txt"), "dup\ndup\ndup\n");
		const server = createAgentBuiltinsServer();
		await server.handlers.get("Edit")!({
			path: "e3.txt",
			old_string: "dup",
			new_string: "X",
			replace_all: true,
			_cwd: TMP,
		});
		expect(readFileSync(join(TMP, "e3.txt"), "utf-8")).toBe("X\nX\nX\n");
	});

	it("isError on anchor not found", async () => {
		writeFileSync(join(TMP, "e4.txt"), "abc");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e4.txt",
			old_string: "xyz",
			new_string: "Y",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/not found/i);
	});

	it("isError when old_string === new_string", async () => {
		writeFileSync(join(TMP, "e5.txt"), "abc");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e5.txt",
			old_string: "abc",
			new_string: "abc",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/identical|no-op/i);
	});
});
