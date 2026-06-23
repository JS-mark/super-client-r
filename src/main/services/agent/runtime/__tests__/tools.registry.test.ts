// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BUILTIN_TOOL_NAMES, getBuiltinTools } from "../tools";

describe("builtin tool registry", () => {
	it("exposes the 8 canonical Claude Code tool names", () => {
		expect(BUILTIN_TOOL_NAMES).toEqual([
			"Read",
			"Write",
			"Edit",
			"Bash",
			"Grep",
			"Glob",
			"WebFetch",
			"Task",
		]);
	});

	it("getBuiltinTools(ctx) returns 8 tool definitions with inputSchema", () => {
		const tools = getBuiltinTools({
			cwd: "/tmp",
			signal: new AbortController().signal,
		});
		expect(tools).toHaveLength(8);
		for (const t of tools) {
			expect(typeof t.name).toBe("string");
			expect(typeof t.description).toBe("string");
			expect(typeof t.inputSchema).toBe("object");
			expect(typeof t.execute).toBe("function");
		}
	});
});
