import { describe, expect, it } from "vitest";
import type { Message } from "../../stores/chatMessageStore";
import {
	applyContextStrategy,
	computeContextBudget,
	createSummaryMessage,
	messageToAgentHistory,
	messagesToAgentHistory,
	summarizeMessagesText,
} from "../contextManager";

function msg(id: string, role: Message["role"], content: string): Message {
	return {
		id,
		role,
		content,
		timestamp: Number(id.replace(/\D/g, "")) || 1,
	};
}

describe("computeContextBudget", () => {
	it("subtracts overhead and reserve from the context window", () => {
		expect(
			computeContextBudget({
				contextWindow: 10_000,
				systemPromptTokens: 1_000,
				toolsTokens: 500,
				reserveRatio: 0.1,
			}),
		).toEqual({
			contextWindow: 10_000,
			reserveTokens: 1_000,
			overheadTokens: 1_500,
			availableForMessages: 7_500,
		});
	});

	it("returns unknown capacity when contextWindow is null", () => {
		expect(
			computeContextBudget({
				contextWindow: null,
				systemPromptTokens: 50,
			}).availableForMessages,
		).toBeNull();
	});

	it("clamps available tokens at zero", () => {
		expect(
			computeContextBudget({
				contextWindow: 100,
				systemPromptTokens: 200,
			}).availableForMessages,
		).toBe(0);
	});
});

describe("message history conversion", () => {
	it("formats messages for summarization and truncates long text", () => {
		const text = summarizeMessagesText(
			[msg("m1", "user", "hello"), msg("m2", "assistant", "world")],
			{ maxChars: 12 },
		);
		expect(text).toContain("[truncated]");
		expect(text.length).toBeLessThan(30);
	});

	it("converts user and assistant messages to PromptPart history", () => {
		expect(messageToAgentHistory(msg("m1", "user", "hello"))).toEqual({
			role: "user",
			content: [{ type: "text", text: "hello" }],
		});
		expect(messagesToAgentHistory([msg("m1", "system", "skip")])).toEqual([]);
	});

	it("skips tool and empty messages", () => {
		expect(
			messagesToAgentHistory([
				msg("m1", "tool", "tool output"),
				msg("m2", "assistant", "   "),
			]),
		).toEqual([]);
	});

	it("creates a summary message with contextCompacted metadata", () => {
		const summary = createSummaryMessage(
			"short summary",
			3,
			[msg("m1", "user", "a")],
			() => 123,
		);
		expect(summary.role).toBe("assistant");
		expect(summary.metadata?.contextCompacted).toEqual({
			compacted: true,
			summary: "short summary",
			originalCount: 3,
			compactedAt: 123,
		});
	});
});

describe("applyContextStrategy", () => {
	const messages = [
		msg("m1", "user", "one"),
		msg("m2", "assistant", "two"),
		msg("m3", "user", "three"),
		msg("m4", "assistant", "four"),
	];

	it("keeps all messages in full mode", () => {
		const result = applyContextStrategy({
			messages,
			contextCount: -1,
			contextMode: "full",
			estimateTokens: () => 1,
		});
		expect(result.strategy).toBe("full");
		expect(result.history).toHaveLength(4);
	});

	it("applies contextCount as a hard sliding window", () => {
		const result = applyContextStrategy({
			messages,
			contextCount: 2,
			contextMode: "full",
			estimateTokens: () => 1,
		});
		expect(result.strategy).toBe("sliding");
		expect(result.history.map((item) => item.content[0])).toEqual([
			{ type: "text", text: "three" },
			{ type: "text", text: "four" },
		]);
	});

	it("auto-compacts old messages when estimated tokens exceed budget", () => {
		const result = applyContextStrategy({
			messages,
			contextCount: -1,
			contextMode: "auto",
			budget: { contextWindow: 10, reserveRatio: 0, systemPromptTokens: 0 },
			estimateTokens: (text) => text.length,
			now: () => 99,
		});
		expect(result.strategy).toBe("summarized");
		expect(result.needsSummarization).toBe(true);
		expect(result.summaryMessage?.metadata?.contextCompacted?.originalCount).toBe(
			2,
		);
		expect(result.summaryInput).toContain("user: one");
		expect(result.summaryInput).toContain("assistant: two");
		expect(result.history[0].content[0]).toEqual(
			expect.objectContaining({
				type: "text",
				text: expect.stringContaining("Summary of 2"),
			}),
		);
	});

	it("compact mode summarizes the older half even without a budget", () => {
		const result = applyContextStrategy({
			messages,
			contextCount: -1,
			contextMode: "compact",
			estimateTokens: () => 1,
			now: () => 100,
		});
		expect(result.strategy).toBe("compact");
		expect(result.history).toHaveLength(3);
		expect(result.omittedCount).toBe(2);
	});
});
