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

// Boundary cases for Task 10 — these fill gaps not already covered above:
// empty list, single-message list, sliding-window ORDER preservation on a
// larger tail, and the exact position of the summary message in the returned
// array (summary FIRST, then retained recent messages in chronological order).
describe("applyContextStrategy boundary cases", () => {
	it("handles an empty message list without compaction or summarization", () => {
		const result = applyContextStrategy({
			messages: [],
			contextCount: -1,
			contextMode: "full",
			estimateTokens: () => 1,
		});
		expect(result.history).toEqual([]);
		expect(result.messages).toEqual([]);
		expect(result.omittedCount).toBe(0);
		expect(result.needsSummarization).toBe(false);
		expect(result.summaryMessage).toBeUndefined();
	});

	it("leaves a single-message list untouched in compact mode", () => {
		const single = [msg("m1", "user", "only one")];
		const result = applyContextStrategy({
			messages: single,
			contextCount: -1,
			contextMode: "compact",
			estimateTokens: () => 1,
			now: () => 50,
		});
		// compactMessages short-circuits when length <= 2: no summary produced
		expect(result.needsSummarization).toBe(false);
		expect(result.summaryMessage).toBeUndefined();
		expect(result.omittedCount).toBe(0);
		expect(result.history).toEqual([
			{ role: "user", content: [{ type: "text", text: "only one" }] },
		]);
	});

	it("preserves chronological order of the sliding-window tail (not reversed)", () => {
		const five = [
			msg("m1", "user", "alpha"),
			msg("m2", "assistant", "beta"),
			msg("m3", "user", "gamma"),
			msg("m4", "assistant", "delta"),
			msg("m5", "user", "epsilon"),
		];
		const result = applyContextStrategy({
			messages: five,
			contextCount: 3,
			contextMode: "full",
			estimateTokens: () => 1,
		});
		expect(result.strategy).toBe("sliding");
		// tail must be m3, m4, m5 in original order — guards against a
		// `.slice(-n).reverse()` or `.slice(0, n)` regression the 2-element
		// sliding test above cannot catch.
		expect(result.history.map((item) => item.content[0])).toEqual([
			{ type: "text", text: "gamma" },
			{ type: "text", text: "delta" },
			{ type: "text", text: "epsilon" },
		]);
		expect(result.omittedCount).toBe(2);
	});

	it("places the summary message FIRST, followed by retained recent messages in order", () => {
		// 6 messages → compactMessages keeps ceil(6/2)=3 recent, summarizes 3.
		// The synthetic summary must be index 0; retained recent tail must
		// follow in original chronological order. This guards against a
		// regression that appends or reverses the summary relative to the tail.
		const result = applyContextStrategy({
			messages: [
				msg("m1", "user", "old1"),
				msg("m2", "assistant", "old2"),
				msg("m3", "user", "old3"),
				msg("m4", "assistant", "recent1"),
				msg("m5", "user", "recent2"),
				msg("m6", "assistant", "recent3"),
			],
			contextCount: -1,
			contextMode: "compact",
			estimateTokens: () => 1,
			now: () => 777,
		});
		expect(result.strategy).toBe("compact");
		expect(result.history).toHaveLength(4);
		expect(result.omittedCount).toBe(3);
		// First element must be the synthetic summary.
		expect(result.history[0].content[0]).toEqual(
			expect.objectContaining({
				type: "text",
				text: expect.stringContaining("Summary of 3"),
			}),
		);
		// Remaining elements must be the retained tail in original order.
		expect(result.history.slice(1).map((item) => item.content[0])).toEqual([
			{ type: "text", text: "recent1" },
			{ type: "text", text: "recent2" },
			{ type: "text", text: "recent3" },
		]);
		expect(result.summaryMessage?.id).toContain("context_summary_777");
	});
});
