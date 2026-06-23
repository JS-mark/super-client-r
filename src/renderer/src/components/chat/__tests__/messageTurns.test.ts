import { describe, expect, it } from "vitest";
import type { Message } from "@super-client/shared-types/chat";
import { buildMessageTurns } from "../messageTurns";

describe("buildMessageTurns", () => {
	it("groups assistant and tool messages into one assistant turn", () => {
		const messages: Message[] = [
			{ id: "u1", role: "user", content: "hi", timestamp: 1 },
			{ id: "a1", role: "assistant", content: "thinking", timestamp: 2 },
			{
				id: "t1",
				role: "tool",
				content: "",
				timestamp: 3,
				toolCall: {
					id: "tool-1",
					name: "read_file",
					input: { path: "README.md" },
					status: "success",
					result: "ok",
				},
			},
			{ id: "a2", role: "assistant", content: "done", timestamp: 4 },
		];

		const turns = buildMessageTurns(messages);

		expect(turns).toHaveLength(2);
		expect(turns[0]).toMatchObject({ id: "u1", type: "user" });
		expect(turns[1]).toMatchObject({ id: "a1", type: "ai" });
		if (turns[1].type !== "ai") throw new Error("expected ai turn");
		expect(turns[1].messages.map((message) => message.id)).toEqual([
			"a1",
			"t1",
			"a2",
		]);
		expect(turns[1].parts.map((part) => part.type)).toEqual([
			"text",
			"tool",
			"text",
		]);
	});

	it("marks approval tool turns as pending interactions", () => {
		const turns = buildMessageTurns([
			{
				id: "t1",
				role: "tool",
				content: "",
				timestamp: 1,
				toolCall: {
					id: "tool-1",
					name: "execute_command",
					input: { command: "pwd" },
					status: "awaiting_approval",
					approval: { kind: "permission" },
				},
			},
		]);

		expect(turns).toHaveLength(1);
		expect(turns[0].hasPendingInteraction).toBe(true);
	});
});

