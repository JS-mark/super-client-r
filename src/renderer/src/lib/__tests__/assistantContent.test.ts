import { describe, expect, it } from "vitest";
import { sanitizeAssistantContent } from "../assistantContent";

describe("sanitizeAssistantContent", () => {
	it("removes assistant sentinel tokens from generated content", () => {
		expect(sanitizeAssistantContent("hello<|eom|>")).toBe("hello");
		expect(sanitizeAssistantContent("a<|im_end|>b<|endoftext|>")).toBe("ab");
	});

	it("leaves normal text unchanged", () => {
		expect(sanitizeAssistantContent("normal assistant content")).toBe(
			"normal assistant content",
		);
	});

	it("hides a dangling sentinel prefix at the end of a partial stream", () => {
		expect(sanitizeAssistantContent("hello<|eo")).toBe("hello");
		expect(sanitizeAssistantContent("hello<|im_")).toBe("hello");
	});

	it("hides prompt-tool call blocks from assistant text", () => {
		expect(
			sanitizeAssistantContent(
				'before <tool_call>{"name":"execute_command","arguments":{"command":"pwd"}}</tool_call> after',
			),
		).toBe("before  after");
		expect(
			sanitizeAssistantContent(
				'before tool_call> {"name":"execute_command","arguments":{"command":"pwd"}}',
			),
		).toBe("before ");
		expect(sanitizeAssistantContent("before <tool_call")).toBe("before ");
	});

	it("strips naked single-line tool-call JSON envelopes", () => {
		const input = [
			"要查看桌面上都有什么文件，我可以使用 list_directory 工具来列出 /Users/mark/Desktop 目录中的内容。请稍等。",
			"",
			'{"name": "list_directory", "arguments": {"path": "/Users/mark/Desktop"}}',
			"",
			"系统会执行这个操作并返回结果。",
			"",
			'{"name": "list_directory", "arguments": {"path": "/Users/mark/Desktop"}}',
		].join("\n");
		const out = sanitizeAssistantContent(input);
		// The JSON envelopes are gone, but the prose mentioning the tool name stays.
		expect(out).not.toContain('"arguments"');
		expect(out).not.toContain('{"name"');
		expect(out).toContain("我可以使用");
		expect(out).toContain("系统会执行");
	});

	it("recognises alternate envelope key pairs (tool_name/parameters, function/args)", () => {
		expect(
			sanitizeAssistantContent(
				'\n{"tool_name": "list_directory", "parameters": {"path": "/x"}}\n',
			).trim(),
		).toBe("");
		expect(
			sanitizeAssistantContent(
				'\n{"function": "list_directory", "args": {"path": "/x"}}\n',
			).trim(),
		).toBe("");
	});

	it("strips multi-line pretty-printed tool-call JSON envelopes", () => {
		const input = [
			"I'll list the desktop.",
			"{",
			'  "name": "list_directory",',
			'  "arguments": {',
			'    "path": "/Users/mark/Desktop"',
			"  }",
			"}",
			"Then I'll summarise.",
		].join("\n");
		const out = sanitizeAssistantContent(input);
		expect(out).not.toContain("list_directory");
		expect(out).toContain("I'll list the desktop.");
		expect(out).toContain("Then I'll summarise.");
	});

	it("leaves tool-call JSON inside fenced code blocks alone (likely documentation)", () => {
		const input = [
			"Here is the schema:",
			"```json",
			'{"name": "list_directory", "arguments": {"path": "/x"}}',
			"```",
			"That's the format.",
		].join("\n");
		const out = sanitizeAssistantContent(input);
		expect(out).toContain("list_directory");
		expect(out).toContain("```");
	});

	it("does not strip unrelated JSON the model is discussing", () => {
		const input =
			'The config is {"theme":"dark","fontSize":14} which has no tool envelope.';
		expect(sanitizeAssistantContent(input)).toBe(input);
	});

	it("ignores JSON objects with name but no arguments key", () => {
		// Real user data like { "name": "Alice", "age": 30 } must survive.
		const input = '{"name": "Alice", "age": 30}';
		expect(sanitizeAssistantContent(input)).toBe(input);
	});
});
