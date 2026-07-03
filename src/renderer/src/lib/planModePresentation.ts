import type { PlanMode } from "@super-client/shared-types/chat";

export type AgentComposerMode = "plan" | "execute";

export const AGENT_COMPOSER_MODE_LABEL: Record<AgentComposerMode, string> = {
	plan: "Plan",
	execute: "Execute",
};

export const AGENT_COMPOSER_MODE_DESCRIPTION: Record<
	AgentComposerMode,
	string
> = {
	plan: "先生成结构化计划，确认后再进入执行轮次。",
	execute: "直接进入 Agent 执行流程，仍受沙箱和审批策略约束。",
};

export function toAgentComposerMode(planMode: PlanMode): AgentComposerMode {
	switch (planMode) {
		case "plan-only":
		case "plan-then-ask":
			return "plan";
		case "chat":
		case "auto-execute-safe":
		case "full-agent":
			return "execute";
	}
}

export function toPlanModeFromAgentComposerMode(
	mode: AgentComposerMode,
): PlanMode {
	return mode === "plan" ? "plan-then-ask" : "chat";
}
