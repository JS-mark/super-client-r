import { describe, expect, it } from "vitest";
import {
	BUILTIN_TOOL_NAMES,
	listBuiltinTools,
} from "../tools/BuiltinToolRegistry";

describe("BuiltinToolRegistry.listBuiltinTools", () => {
	it("returns metadata for all 8 facade tools", () => {
		const tools = listBuiltinTools();
		expect(tools).toHaveLength(BUILTIN_TOOL_NAMES.length);
		expect(tools.map((t) => t.name)).toEqual([...BUILTIN_TOOL_NAMES]);
	});

	it("every entry has non-empty description and inputSchema", () => {
		for (const t of listBuiltinTools()) {
			expect(typeof t.description).toBe("string");
			expect(t.description.length).toBeGreaterThan(0);
			expect(t.inputSchema).toBeTypeOf("object");
			expect(t.inputSchema).not.toBeNull();
		}
	});

	it("is cached — calling twice returns the same array reference", () => {
		const a = listBuiltinTools();
		const b = listBuiltinTools();
		expect(a).toBe(b);
	});
});
