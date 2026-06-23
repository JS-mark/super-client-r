/**
 * useContextUsage —— 计算当前会话的上下文容量占用与缓存命中率。
 *
 * 设计要点（详见 plan §G-3）：
 *   - 分母 contextWindow 由当前 effective model 提供（缺省走 modelFamilyFallback）
 *   - 分子 usedTokens 取最近一条 assistant 的 input + cacheRead + cacheCreation
 *     （即 SDK 本轮真实发出的全 context 大小）；缺该数据时退到纯估算
 *   - 分类百分比用 js-tiktoken 估算各组件相对占比，再乘 usedTokens
 *   - 平均缓存命中率 = sum(cacheRead) / sum(input + cacheRead + cacheCreation)
 *     跨本会话所有 assistant 消息
 */

import { useEffect, useMemo, useState } from "react";
import type { Message } from "../stores/chatMessageStore";
import { useChatMessageStore } from "../stores/chatMessageStore";
import {
	estimateTokensSync,
	whenTokenizerReady,
} from "../lib/tokenizer";
import { useModelStore } from "../stores/modelStore";
import { useChatStore } from "../stores/chatStore";
import { useMcpStore } from "../stores/mcpStore";

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

const CATEGORY_ORDER: ContextUsageCategory[] = [
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

function safeStringify(v: unknown): string {
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
export function computeContextUsage(
	input: ComputeUsageInput,
): ContextUsage {
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

/**
 * 主 hook。所有计算同步完成；tokenizer 还没就绪时走启发式，就绪后通过
 * `tokenizerReadyTick` state 触发一次重算。
 */
export function useContextUsage(): ContextUsage {
	const messages = useChatMessageStore((s) => s.messages);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);

	// model 信息
	const providers = useModelStore((s) => s.providers);
	const activeSelection = useModelStore((s) => s.activeSelection);
	const sessionModelOverride = currentConversation?.session?.modelOverride;
	const effectiveModel = useMemo(() => {
		const sel = sessionModelOverride ?? activeSelection;
		if (!sel) return null;
		const provider = providers.find((p) => p.id === sel.providerId);
		if (!provider) return null;
		const model = provider.models.find((m) => m.id === sel.modelId);
		if (!model) return null;
		return { provider, model };
	}, [providers, activeSelection, sessionModelOverride]);

	const contextWindow = useMemo(() => {
		if (effectiveModel?.model.contextWindow) {
			return effectiveModel.model.contextWindow;
		}
		return inferContextWindowFromModelId(effectiveModel?.model.id);
	}, [effectiveModel]);

	// MCP tools —— 系统工具段
	const mcpServers = useMcpStore((s) => s.servers);
	const systemToolsText = useMemo(() => {
		// 取所有 connected server 的 tools schema
		const pieces: string[] = [];
		for (const srv of mcpServers) {
			if (srv.status !== "connected") continue;
			if (!srv.tools) continue;
			pieces.push(safeStringify(srv.tools));
		}
		return pieces.join("\n");
	}, [mcpServers]);

	// 系统提示词段 —— renderer 无法直接拿到刚才发出去的 systemPrompt 字符串
	// （sessionSettings 是 useChat 内部 state，没暴露到 store）。
	// 这里用 model.systemPrompt + 启发式头部长度。该误差最终被 usedTokens
	// 真值锚定，不影响总量。
	const baseSystemPromptText = useMemo(() => {
		const modelSysPrompt = effectiveModel?.model.systemPrompt ?? "";
		// 加一段固定头部估算（DEFAULT_SYSTEM_PROMPT + env block + project scope），
		// 长度量级 ~600 字符。直接取个保守常量值，避免引入 prompt module 循环依赖。
		const SYSTEM_HEADER_ESTIMATE_CHARS = 600;
		return `${" ".repeat(SYSTEM_HEADER_ESTIMATE_CHARS)}${modelSysPrompt}`;
	}, [effectiveModel]);

	// Skill 提示词 —— 没有直接的 store 暴露，先按"未启用 skill"算 0。
	// 如果启用了 skill，会经 sendSkillMessage 拼到 system prompt 里、不会
	// 单独计为 skill 段（这是当前实现的合理近似）。
	const skillText = "";

	// 强制 tokenizer 就绪后重算
	const [tokenizerReadyTick, setTokenizerReadyTick] = useState(0);
	useEffect(() => {
		let cancelled = false;
		whenTokenizerReady()
			.then(() => {
				if (!cancelled) setTokenizerReadyTick((t) => t + 1);
			})
			.catch(() => {
				/* fallback 永远可用，不再 retry */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return useMemo<ContextUsage>(() => {
		void tokenizerReadyTick; // tokenizer ready 后触发重算
		void currentConversationId; // 切会话时让 messages 引用变更，已足够触发
		return computeContextUsage({
			messages,
			systemPromptText: baseSystemPromptText,
			systemToolsText,
			skillText,
			contextWindow,
		});
	}, [
		messages,
		baseSystemPromptText,
		systemToolsText,
		skillText,
		contextWindow,
		tokenizerReadyTick,
		currentConversationId,
	]);
}
