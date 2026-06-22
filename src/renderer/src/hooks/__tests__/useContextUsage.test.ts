// @vitest-environment node
//
// 纯函数 computeContextUsage 单测。
// hook 本体依赖 zustand/electron，留给 e2e 验。

import { describe, expect, it } from "vitest";
import type { Message } from "../../stores/chatMessageStore";
import {
	buildMessagesText,
	computeContextUsage,
	inferContextWindowFromModelId,
} from "../useContextUsage";

function mkAssistant(opts: {
	id: string;
	content?: string;
	inputTokens?: number;
	cacheReadTokens?: number;
	cacheCreationTokens?: number;
}): Message {
	return {
		id: opts.id,
		role: "assistant",
		content: opts.content ?? "",
		timestamp: Date.now(),
		metadata: {
			inputTokens: opts.inputTokens,
			cacheReadTokens: opts.cacheReadTokens,
			cacheCreationTokens: opts.cacheCreationTokens,
		},
	} as Message;
}

function mkUser(id: string, content: string): Message {
	return {
		id,
		role: "user",
		content,
		timestamp: Date.now(),
	} as Message;
}

// 注入一个固定的 estimateFn 让分类拆解可预测：每字符 = 1 token
const estimateByLength = (s: string) => s.length;

describe("inferContextWindowFromModelId", () => {
	it("infers Claude family → 200k", () => {
		expect(inferContextWindowFromModelId("claude-opus-4-7")).toBe(200_000);
		expect(inferContextWindowFromModelId("claude-3-5-sonnet")).toBe(200_000);
	});

	it("infers GPT-4 family → 128k", () => {
		expect(inferContextWindowFromModelId("gpt-4o")).toBe(128_000);
		expect(inferContextWindowFromModelId("gpt-4-turbo")).toBe(128_000);
	});

	it("infers Gemini 1.5 → 2M, Gemini 2 → 1M", () => {
		expect(inferContextWindowFromModelId("gemini-1.5-pro")).toBe(2_000_000);
		expect(inferContextWindowFromModelId("gemini-2.0-flash")).toBe(1_000_000);
	});

	it("returns null for unknown model", () => {
		expect(inferContextWindowFromModelId("unknown-model-x")).toBeNull();
		expect(inferContextWindowFromModelId(undefined)).toBeNull();
	});
});

describe("buildMessagesText", () => {
	it("joins user + assistant content and tool input/result", () => {
		const msgs: Message[] = [
			mkUser("u1", "hello"),
			mkAssistant({ id: "a1", content: "world" }),
			{
				id: "t1",
				role: "tool",
				content: "",
				timestamp: 0,
				toolCall: {
					id: "tc1",
					name: "ls",
					input: { path: "/" },
					result: "file.txt",
					status: "success",
				},
			} as Message,
		];
		const text = buildMessagesText(msgs);
		expect(text).toContain("hello");
		expect(text).toContain("world");
		expect(text).toContain('"path":"/"');
		expect(text).toContain("file.txt");
	});
});

describe("computeContextUsage", () => {
	it("LLM path (no cache): cacheHitRate is null, uses inputTokens as truth", () => {
		const messages: Message[] = [
			mkUser("u1", "hi"),
			mkAssistant({ id: "a1", content: "ok", inputTokens: 1000 }),
		];
		const usage = computeContextUsage({
			messages,
			systemPromptText: "sys-prompt",
			systemToolsText: "tools-schema",
			skillText: "",
			contextWindow: 200_000,
			estimateFn: estimateByLength,
		});
		expect(usage.usedTokens).toBe(1000);
		expect(usage.isEstimated).toBe(false);
		expect(usage.contextWindow).toBe(200_000);
		expect(usage.percent).toBeCloseTo(0.005, 4);
		expect(usage.cacheHitRate).toBeNull();
	});

	it("Agent SDK single turn: cacheHitRate computed from one assistant", () => {
		const messages: Message[] = [
			mkUser("u1", "hi"),
			mkAssistant({
				id: "a1",
				inputTokens: 100,
				cacheReadTokens: 900,
				cacheCreationTokens: 0,
			}),
		];
		const usage = computeContextUsage({
			messages,
			systemPromptText: "",
			systemToolsText: "",
			skillText: "",
			contextWindow: 200_000,
			estimateFn: estimateByLength,
		});
		expect(usage.usedTokens).toBe(1000); // 100 + 900 + 0
		expect(usage.cacheHitRate).toBeCloseTo(0.9, 4);
	});

	it("Agent SDK multi-turn: hit rate accumulates across all assistant messages", () => {
		const messages: Message[] = [
			mkAssistant({
				id: "a1",
				inputTokens: 1000,
				cacheReadTokens: 0,
				cacheCreationTokens: 1000,
			}), // base=2000, hit=0
			mkAssistant({
				id: "a2",
				inputTokens: 100,
				cacheReadTokens: 1800,
				cacheCreationTokens: 100,
			}), // base=2000, hit=1800
			mkAssistant({
				id: "a3",
				inputTokens: 200,
				cacheReadTokens: 1700,
				cacheCreationTokens: 100,
			}), // base=2000, hit=1700
		];
		const usage = computeContextUsage({
			messages,
			systemPromptText: "",
			systemToolsText: "",
			skillText: "",
			contextWindow: 200_000,
			estimateFn: estimateByLength,
		});
		// 累计 hit = (0 + 1800 + 1700) / (2000 + 2000 + 2000) = 3500/6000 ≈ 0.5833
		expect(usage.cacheHitRate).toBeCloseTo(3500 / 6000, 4);
		// usedTokens 取最近一轮：200 + 1700 + 100 = 2000
		expect(usage.usedTokens).toBe(2000);
	});

	it("No usage data yet: falls back to pure estimate, isEstimated=true", () => {
		const messages: Message[] = [mkUser("u1", "hello world")];
		const usage = computeContextUsage({
			messages,
			systemPromptText: "abc",
			systemToolsText: "de",
			skillText: "",
			contextWindow: 1000,
			estimateFn: estimateByLength,
		});
		// 估算 subtotal = 11 ("hello world") + 3 + 2 + 0 = 16；other ≈ 1
		// usedTokens = 17
		expect(usage.isEstimated).toBe(true);
		expect(usage.usedTokens).toBeGreaterThan(0);
		expect(usage.percent).toBe(usage.usedTokens / 1000);
	});

	it("Unknown contextWindow: percent is null but breakdown still computes", () => {
		const messages: Message[] = [
			mkAssistant({ id: "a1", inputTokens: 500 }),
		];
		const usage = computeContextUsage({
			messages,
			systemPromptText: "sys",
			systemToolsText: "",
			skillText: "",
			contextWindow: null,
			estimateFn: estimateByLength,
		});
		expect(usage.percent).toBeNull();
		expect(usage.contextWindow).toBeNull();
		expect(usage.usedTokens).toBe(500);
	});

	it("breakdown ratios sum to ~1 and tokens sum approximates usedTokens", () => {
		const messages: Message[] = [
			mkUser("u1", "hello"),
			mkAssistant({ id: "a1", content: "world", inputTokens: 1000 }),
		];
		const usage = computeContextUsage({
			messages,
			systemPromptText: "system",
			systemToolsText: "tools",
			skillText: "skill",
			contextWindow: 200_000,
			estimateFn: estimateByLength,
		});
		const ratioSum = usage.breakdown.reduce((s, b) => s + b.ratio, 0);
		expect(ratioSum).toBeCloseTo(1, 5);
		const tokenSum = usage.breakdown.reduce((s, b) => s + b.tokens, 0);
		// 四舍五入误差容差 ±5
		expect(Math.abs(tokenSum - usage.usedTokens)).toBeLessThanOrEqual(5);
	});
});
