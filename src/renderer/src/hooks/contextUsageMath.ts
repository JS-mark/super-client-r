/**
 * contextUsageMath — pure helpers backing `useContextUsage`.
 *
 * Lives in a sibling file so unit tests can import it under a `node`
 * vitest environment without dragging the renderer stores (zustand +
 * apiService — which reads `window.electron.ipc` at module load) through
 * the import graph.
 *
 * The hook (`useContextUsage.ts`) re-exports everything declared here, so
 * existing consumers keep their import paths.
 */

import type { Message } from "../stores/chatMessageStore";
import { estimateTokensSync } from "../lib/tokenizer";

export type ContextUsageCategory =
	| "messages"
	| "systemPrompt"
	| "skill"
	| "systemTools"
	| "other";

export interface ContextUsageBreakdownItem {
	category: ContextUsageCategory;
	tokens: number;
	/** 0..1 */
	ratio: number;
}

export interface ContextUsage {
	/** 当前消耗 token；可能来自 API 真值或纯估算 */
	usedTokens: number;
	/** 模型上下文窗口；未知时为 null */
	contextWindow: number | null;
	/** usedTokens / contextWindow；contextWindow 为 null 时为 null */
	percent: number | null;
	/** 拆解项；ratio 之和 ≈ 1 */
	breakdown: ContextUsageBreakdownItem[];
	/** 缓存命中率，0..1；本会话无 cache 数据时为 null */
	cacheHitRate: number | null;
	/** usedTokens 是从 API 真值得出还是纯估算 */
	isEstimated: boolean;
}

// Display order in the breakdown panel — must match the order the hook
// previously emitted (messages → systemTools → other → skill → systemPrompt).
export const CATEGORY_ORDER: ContextUsageCategory[] = [
	"messages",
	"systemTools",
	"other",
	"skill",
	"systemPrompt",
];

/** 模型族 → 缺省 contextWindow。命中即推断；未命中返回 null。导出便于单测。 */
export function inferContextWindowFromModelId(
	modelId?: string,
): number | null {
	if (!modelId) return null;
	const id = modelId.toLowerCase();
	// Claude
	if (id.includes("claude")) {
		if (id.includes("opus-4") || id.includes("sonnet-4")) return 200_000;
		if (id.includes("opus") || id.includes("sonnet") || id.includes("haiku"))
			return 200_000;
	}
	// GPT-4 / GPT-4o
	if (id.includes("gpt-4o") || id.includes("gpt-4.1")) return 128_000;
	if (id.includes("gpt-4")) return 128_000;
	if (id.includes("gpt-3.5")) return 16_385;
	// Gemini
	if (id.includes("gemini-1.5") || id.includes("gemini-pro-1.5"))
		return 2_000_000;
	if (id.includes("gemini-2") || id.includes("gemini-pro-2")) return 1_000_000;
	if (id.includes("gemini")) return 1_000_000;
	// DeepSeek / Qwen / 通用兜底
	if (id.includes("deepseek-r1") || id.includes("deepseek-v3")) return 64_000;
	if (id.includes("qwen")) return 128_000;
	return null;
}

/**
 * 拼出"消息"段的代表文本（用户消息 + assistant content + tool input/result）。
 * 用 JSON.stringify 而非纯 content，确保 tool input/result 的 schema 也计入。
 * 导出便于单测。
 */
export function buildMessagesText(messages: Message[]): string {
	const pieces: string[] = [];
	for (const m of messages) {
		if (m.role === "user" || m.role === "assistant") {
			if (m.content) pieces.push(m.content);
		} else if (m.role === "tool" && m.toolCall) {
			// tool call input + result 都算入"消息"段
			try {
				pieces.push(JSON.stringify(m.toolCall.input ?? {}));
			} catch {
				/* ignore */
			}
			if (m.toolCall.result !== undefined) {
				const r = m.toolCall.result;
				pieces.push(typeof r === "string" ? r : safeStringify(r));
			}
		}
	}
	return pieces.join("\n");
}

export function safeStringify(v: unknown): string {
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

export interface ComputeUsageInput {
	messages: Message[];
	/** 系统提示词代表文本（启发式头部 + model.systemPrompt） */
	systemPromptText: string;
	/** MCP / 系统工具的 JSON-stringified schemas */
	systemToolsText: string;
	/** Skill prompt 代表文本（无 skill 时空串） */
	skillText: string;
	/** 已知 contextWindow；未知传 null */
	contextWindow: number | null;
	/** 字符串 → token 估算函数；测试时可注入固定实现 */
	estimateFn?: (s: string) => number;
}

/**
 * 纯函数版的上下文容量计算。给单测和 hook 共用。
 * 不读 zustand，所有输入显式传进来。
 */
export function computeContextUsage(input: ComputeUsageInput): ContextUsage {
	const {
		messages,
		systemPromptText,
		systemToolsText,
		skillText,
		contextWindow,
		estimateFn = estimateTokensSync,
	} = input;

	// 1) 真值 usedTokens + 累计 cache 命中率
	let sumCacheRead = 0;
	let sumCacheBase = 0;
	let anyCacheSeen = false;
	let latestAssistantUsed: number | null = null;

	for (const m of messages) {
		if (m.role !== "assistant" || !m.metadata) continue;
		const inputT = m.metadata.inputTokens ?? 0;
		const cr = m.metadata.cacheReadTokens ?? 0;
		const cc = m.metadata.cacheCreationTokens ?? 0;
		// 只要 provider 显式回了 cache 字段（哪怕值为 0），就认为该路径支持
		// prompt cache，应当展示命中率（0.0% 也是有效信息）。
		// 仅当两个字段都是 undefined 时——典型是 OpenAI/Gemini 等不返回该字段
		// 的 provider——才视为"无 cache 数据"。
		if (
			m.metadata.cacheReadTokens !== undefined ||
			m.metadata.cacheCreationTokens !== undefined
		) {
			anyCacheSeen = true;
		}
		sumCacheRead += cr;
		sumCacheBase += inputT + cr + cc;
		const totalThisTurn = inputT + cr + cc;
		if (totalThisTurn > 0) latestAssistantUsed = totalThisTurn;
	}

	// 2) 各分类估算
	const estMessages = estimateFn(buildMessagesText(messages));
	const estSystemPrompt = estimateFn(systemPromptText);
	const estSystemTools = estimateFn(systemToolsText);
	const estSkill = estimateFn(skillText);

	const subtotal = estMessages + estSystemPrompt + estSystemTools + estSkill;
	const estOther = Math.max(0, Math.round(subtotal * 0.05));
	const totalEst = subtotal + estOther;

	const usedTokens = latestAssistantUsed ?? totalEst;
	const isEstimated = latestAssistantUsed == null;

	const rawByCategory: Record<ContextUsageCategory, number> = {
		messages: estMessages,
		systemPrompt: estSystemPrompt,
		systemTools: estSystemTools,
		skill: estSkill,
		other: estOther,
	};
	const breakdown: ContextUsageBreakdownItem[] = CATEGORY_ORDER.map(
		(category) => {
			const raw = rawByCategory[category];
			const ratio = totalEst > 0 ? raw / totalEst : 0;
			return {
				category,
				tokens: Math.round(usedTokens * ratio),
				ratio,
			};
		},
	);

	const cacheHitRate =
		anyCacheSeen && sumCacheBase > 0 ? sumCacheRead / sumCacheBase : null;
	const percent =
		contextWindow && contextWindow > 0 ? usedTokens / contextWindow : null;

	return {
		usedTokens,
		contextWindow,
		percent,
		breakdown,
		cacheHitRate,
		isEstimated,
	};
}
