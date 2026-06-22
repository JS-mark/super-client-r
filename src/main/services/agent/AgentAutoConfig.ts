/**
 * Agent SDK 自动最优配置引擎
 *
 * 根据任务类型、用户设置、工作区配置自动推断最佳 query() 参数
 */

import type {
	AgentSDKConfig,
	AgentSDKEffort,
	AgentSDKQueryRequest,
	AgentSDKTaskType,
	AgentSDKThinkingConfig,
} from "../../ipc/types";

/** 任务配置预设 */
interface TaskProfile {
	model: string;
	effort: AgentSDKEffort;
	thinking: AgentSDKThinkingConfig;
	maxTurns: number;
}

/** 各任务类型的默认配置 */
const TASK_PROFILES: Record<AgentSDKTaskType, TaskProfile> = {
	coding: {
		model: "claude-sonnet-4-5",
		effort: "high",
		thinking: { type: "adaptive" },
		maxTurns: 25,
	},
	analysis: {
		model: "claude-sonnet-4-5",
		effort: "high",
		thinking: { type: "adaptive" },
		maxTurns: 15,
	},
	chat: {
		model: "claude-sonnet-4-5",
		effort: "medium",
		thinking: { type: "disabled" },
		maxTurns: 10,
	},
	creative: {
		model: "claude-sonnet-4-5",
		effort: "high",
		thinking: { type: "adaptive" },
		maxTurns: 15,
	},
	"tool-heavy": {
		model: "claude-sonnet-4-5",
		effort: "high",
		thinking: { type: "adaptive" },
		maxTurns: 30,
	},
};

/** 默认配置（fallback） */
const DEFAULT_PROFILE = TASK_PROFILES.chat;

/**
 * Agent SDK runs the Claude Code tool protocol. Non-Claude chat models can
 * answer text through compatible gateways, but they usually do not emit
 * tool_use blocks, so treating them as Agent models silently disables tools.
 */
export function isAgentToolCompatibleModel(modelId?: string): boolean {
	if (!modelId) return false;
	const id = modelId.toLowerCase();
	return (
		id.includes("claude") ||
		id.includes("anthropic/") ||
		id.includes("sonnet") ||
		id.includes("opus") ||
		id.includes("haiku")
	);
}

export function firstAgentCompatibleModel(
	...candidates: Array<string | undefined>
): string | undefined {
	return candidates.find(isAgentToolCompatibleModel);
}

/** 代码相关关键词 */
const CODING_KEYWORDS =
	/\b(debug|fix|implement|refactor|code|function|class|component|test|bug|error|compile|build|deploy|api|endpoint|migration|schema)\b/i;

/** 分析相关关键词 */
const ANALYSIS_KEYWORDS =
	/\b(analyze|compare|explain|review|evaluate|assess|summarize|investigate|diagnose|audit|research)\b/i;

/** 创作相关关键词 */
const CREATIVE_KEYWORDS =
	/\b(write|create|design|generate|draft|compose|brainstorm|plan|propose|architect)\b/i;

/**
 * 从 prompt 内容推断任务类型
 */
export function inferTaskType(
	prompt: string,
	mcpToolCount = 0,
): AgentSDKTaskType {
	// MCP 工具数量多 → tool-heavy
	if (mcpToolCount > 5) {
		return "tool-heavy";
	}

	// 短对话 → chat
	if (prompt.length < 50 && !CODING_KEYWORDS.test(prompt)) {
		return "chat";
	}

	// 关键词匹配
	if (CODING_KEYWORDS.test(prompt)) return "coding";
	if (ANALYSIS_KEYWORDS.test(prompt)) return "analysis";
	if (CREATIVE_KEYWORDS.test(prompt)) return "creative";

	// 默认 chat
	return "chat";
}

/**
 * 解析最优配置
 *
 * 优先级：请求显式值 > Settings 页面配置 > 任务推断默认值
 */
export function resolveOptimalConfig(
	request: AgentSDKQueryRequest,
	userConfig?: AgentSDKConfig,
	providerModel?: string,
): {
	model: string;
	effort: AgentSDKEffort;
	thinking: AgentSDKThinkingConfig;
	maxTurns: number;
	maxBudgetUsd?: number;
	persistSession: boolean;
	includePartialMessages: boolean;
} {
	const taskType = inferTaskType(
		request.prompt,
		request.mcpServerNames?.length,
	);
	const profile = TASK_PROFILES[taskType] || DEFAULT_PROFILE;

	return {
		// 优先级: request 显式兼容值 > Provider Agent 模型 > Agent Settings 覆盖 > 硬编码 fallback
		// 但 Agent SDK 必须使用 Claude Code tool protocol 兼容模型；否则会退化为
		// 纯文本回答或被 Claude Code CLI 直接拒绝，工具/审批事件不会出现。
		model:
			firstAgentCompatibleModel(
				request.model,
				providerModel,
				userConfig?.defaultModel,
				profile.model,
			) || profile.model,
		effort: request.effort || userConfig?.defaultEffort || profile.effort,
		thinking:
			request.thinking || userConfig?.defaultThinking || profile.thinking,
		maxTurns:
			request.maxTurns ?? userConfig?.defaultMaxTurns ?? profile.maxTurns,
		maxBudgetUsd: request.maxBudgetUsd ?? userConfig?.defaultMaxBudgetUsd,
		persistSession: request.persistSession ?? true,
		includePartialMessages: request.includePartialMessages ?? true,
	};
}
