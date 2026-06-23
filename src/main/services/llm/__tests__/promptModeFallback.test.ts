// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildToolPrompt,
	hasToolBlocks,
	parseToolCallsFromText,
} from "../promptModeFallback";

describe("promptModeFallback", () => {
	it("returns empty when no tools", () => {
		expect(buildToolPrompt(undefined)).toBe("");
		expect(buildToolPrompt([])).toBe("");
	});

	it("renders a tool prompt section that lists each tool", () => {
		const out = buildToolPrompt([
			{
				type: "function",
				function: {
					name: "read_file",
					description: "reads",
					parameters: { type: "object" },
				},
			},
		]);
		expect(out).toMatch(/Available Tools/);
		expect(out).toMatch(/read_file/);
	});

	it("detects tool blocks in text", () => {
		expect(hasToolBlocks("hello")).toBe(false);
		expect(
			hasToolBlocks(`<tool_call>{"name":"x","arguments":{}}</tool_call>`),
		).toBe(true);
	});

	it("parses tool_call and tool_use blocks, accepts arguments/parameters/input", () => {
		const { cleanText, toolCalls } = parseToolCallsFromText(
			`before <tool_call>{"name":"a","arguments":{"k":1}}</tool_call> mid ` +
				`<tool_use>{"name":"b","parameters":{"k":2}}</tool_use> end`,
		);
		expect(cleanText).toBe("before  mid  end");
		expect(toolCalls).toHaveLength(2);
		expect(toolCalls[0].name).toBe("a");
		expect(toolCalls[0].arguments).toEqual({ k: 1 });
		expect(toolCalls[1].name).toBe("b");
		expect(toolCalls[1].arguments).toEqual({ k: 2 });
	});
});
