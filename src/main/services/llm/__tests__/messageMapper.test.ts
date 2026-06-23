// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toModelMessages } from "../messageMapper";
import type { ChatCompletionRequest } from "../../../ipc/types";

describe("toModelMessages", () => {
	it("converts plain user/assistant/system messages", () => {
		const out = toModelMessages([
			{ role: "system", content: "sys" },
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
		] satisfies ChatCompletionRequest["messages"]);
		expect(out).toEqual([
			{ role: "system", content: "sys" },
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
		]);
	});

	it("converts assistant.tool_calls into tool-call content parts", () => {
		const out = toModelMessages([
			{
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: { name: "read_file", arguments: '{"path":"a.txt"}' },
					},
				],
			},
		]);
		const m = out[0] as { role: string; content: Array<{ type: string }> };
		expect(m.role).toBe("assistant");
		expect(m.content[0]).toMatchObject({
			type: "tool-call",
			toolCallId: "call_1",
			toolName: "read_file",
			input: { path: "a.txt" },
		});
	});

	it("converts role=tool into tool-result content parts and coalesces consecutive ones", () => {
		const out = toModelMessages([
			{ role: "tool", tool_call_id: "a", content: "1" },
			{ role: "tool", tool_call_id: "b", content: "2" },
		]);
		expect(out).toHaveLength(1);
		const m = out[0] as { role: string; content: unknown[] };
		expect(m.role).toBe("tool");
		expect(m.content).toHaveLength(2);
	});

	it("tolerates malformed tool-call argument JSON", () => {
		const out = toModelMessages([
			{
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "x",
						type: "function",
						function: { name: "t", arguments: "not json" },
					},
				],
			},
		]);
		const m = out[0] as { content: Array<{ input: unknown }> };
		expect(m.content[0].input).toEqual({});
	});
});
