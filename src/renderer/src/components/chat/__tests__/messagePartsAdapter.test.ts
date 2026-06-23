import { describe, expect, it } from "vitest";
import type { Message } from "@super-client/shared-types/chat";
import { messageToParts, stripRawProtocolText } from "../messagePartsAdapter";

describe("messagePartsAdapter", () => {
	it("strips raw protocol text before rendering text parts", () => {
		expect(
			stripRawProtocolText('hello\n tool_call> {"name":"x"}\n<|eom|>'),
		).toBe("hello");
	});

	it("converts legacy assistant content into a text part", () => {
		const message: Message = {
			id: "m1",
			role: "assistant",
			content: "hello",
			timestamp: 1000,
		};

		expect(messageToParts(message)).toEqual([
			{
				id: "m1:text:0",
				type: "text",
				state: "complete",
				createdAt: 1000,
				updatedAt: 1000,
				content: "hello",
			},
		]);
	});

	it("converts legacy tool calls into tool parts", () => {
		const message: Message = {
			id: "tool-message",
			role: "tool",
			content: "",
			timestamp: 2000,
			toolCall: {
				id: "tool-1",
				name: "list_directory",
				input: { path: "/tmp" },
				status: "awaiting_approval",
				approval: { kind: "permission", title: "List files" },
			},
		};

		expect(messageToParts(message)).toEqual([
			{
				id: "tool-message:tool:tool-1",
				type: "tool",
				state: "requires-approval",
				createdAt: 2000,
				updatedAt: 2000,
				toolUseId: "tool-1",
				name: "list_directory",
				input: { path: "/tmp" },
				output: undefined,
				duration: undefined,
				approval: { kind: "permission", title: "List files" },
			},
		]);
	});

	it("prefers structured message.parts over legacy content adaptation", () => {
		const parts = messageToParts({
			id: "a1",
			role: "assistant",
			content: "legacy text",
			timestamp: 1,
			parts: [
				{
					id: "p1",
					type: "text",
					state: "complete",
					createdAt: 1,
					updatedAt: 1,
					content: "structured text",
				},
			],
		});

		expect(parts).toHaveLength(1);
		expect(parts[0]).toMatchObject({
			id: "p1",
			type: "text",
			content: "structured text",
		});
	});

	it("splits fenced code blocks into structured code parts", () => {
		const parts = messageToParts({
			id: "m-code",
			role: "assistant",
			content: [
				"Use this:",
				"```ts",
				"const value = 1;",
				"```",
				"Done.",
			].join("\n"),
			timestamp: 10,
		});

		expect(parts).toHaveLength(3);
		expect(parts[0]).toMatchObject({
			id: "m-code:text:0",
			type: "text",
			content: "Use this:",
		});
		expect(parts[1]).toMatchObject({
			id: "m-code:code:1",
			type: "code_block",
			language: "ts",
			content: "const value = 1;\n",
			lineCount: 2,
		});
		expect(parts[2]).toMatchObject({
			id: "m-code:text:2",
			type: "text",
			content: "Done.",
		});
	});

	it("maps diff fences to structured diff parts", () => {
		const parts = messageToParts({
			id: "m-diff",
			role: "assistant",
			content: ["```diff", "-old", "+new", "```"].join("\n"),
			timestamp: 11,
		});

		expect(parts).toHaveLength(1);
		expect(parts[0]).toMatchObject({
			id: "m-diff:diff:0",
			type: "diff",
			files: [
				{
					path: "changes.diff",
					hunks: [
						{
							lines: [
								{ type: "remove", content: "old" },
								{ type: "add", content: "new" },
								{ type: "context", content: "" },
							],
						},
					],
				},
			],
		});
	});
});
