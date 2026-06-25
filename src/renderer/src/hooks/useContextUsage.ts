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
 *
 * 纯函数版（buildMessagesText / computeContextUsage / inferContextWindowFromModelId
 * 等）已抽到 sibling 文件 `./contextUsageMath`，便于在 node vitest 环境下
 * 直接测试。这里仅保留 hook 本体 + 类型 re-export 以维持现有 import 路径。
 */

import { useEffect, useMemo, useState } from "react";
import { useChatMessageStore } from "../stores/chatMessageStore";
import { whenTokenizerReady } from "../lib/tokenizer";
import { useModelStore } from "../stores/modelStore";
import { useChatStore } from "../stores/chatStore";
import { useMcpStore } from "../stores/mcpStore";
import {
	computeContextUsage,
	inferContextWindowFromModelId,
	safeStringify,
	type ContextUsage,
} from "./contextUsageMath";

export type {
	ContextUsage,
	ContextUsageCategory,
	ContextUsageBreakdownItem,
	ComputeUsageInput,
} from "./contextUsageMath";
export {
	computeContextUsage,
	inferContextWindowFromModelId,
	buildMessagesText,
} from "./contextUsageMath";

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
