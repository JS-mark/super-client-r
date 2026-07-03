/**
 * planModeToolGuard — shared classification of runtime tool names against
 * plan-mode policies.
 *
 * Rationale (R3 / Phase 0c): plan-mode enforcement was previously all-or-
 * nothing at the LLMService layer (planModeGate stripped every tool when
 * planMode === "plan-only"). The runtime-first path (AgentRuntime.createQuery
 * + Agent SDK canUseTool) also needs to reject destructive tools while
 * `plan-then-ask` sessions are gathering user confirmation, and it needs the
 * SAME classification the LLM-path gate uses so both entry points agree.
 *
 * We prefer a small allow-list of read-oriented tool names over a giant
 * destructive blacklist — anything unknown is treated as destructive because
 * unknown tools (user MCP tools, future builtins) can have arbitrary side
 * effects.
 *
 * Naming convention: the runtime exposes builtin tools twice — as bare
 * names ("Read", "Write", …) and as MCP-prefixed names
 * ("scp-agent-builtins__Read", …). `isDestructiveTool` accepts either form.
 */
import type { PlanMode } from "@super-client/shared-types/chat";

/**
 * Bare-name tools considered read-only for plan-mode purposes.
 * Keep this list intentionally short — err on the side of "destructive"
 * when in doubt.
 *   Read/Grep/Glob — pure filesystem inspection
 *   WebFetch       — remote GET, no local write
 *   AskUserQuestion — surfaces a prompt to the user; no side effect on files
 */
export const READ_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set([
	"Read",
	"Grep",
	"Glob",
	"WebFetch",
	"AskUserQuestion",
]);

const BUILTIN_MCP_PREFIX = "scp-agent-builtins__";

/**
 * Normalize `scp-agent-builtins__Read` → `Read`. Non-prefixed names pass
 * through unchanged.
 */
export function stripBuiltinPrefix(name: string): string {
	if (name.startsWith(BUILTIN_MCP_PREFIX)) {
		return name.slice(BUILTIN_MCP_PREFIX.length);
	}
	return name;
}

/**
 * Return true when the tool should be denied under plan-mode policy.
 *
 * A tool is destructive unless its bare name is in the READ_ONLY_TOOL_NAMES
 * allow-list. Unknown / user MCP tools are treated as destructive because
 * we cannot statically prove they have no side effects.
 */
export function isDestructiveTool(name: string): boolean {
	return !READ_ONLY_TOOL_NAMES.has(stripBuiltinPrefix(name));
}

/**
 * Policy resolution: given a session's PlanMode, decide what the tool gate
 * should do.
 *   "deny-all"        — plan-only: strip / reject every tool call
 *   "deny-write-only" — plan-then-ask: allow read-oriented tools, deny the rest
 *   "allow"           — chat / auto-execute-safe / full-agent: no gating
 */
export type PlanModeToolPolicy = "deny-all" | "deny-write-only" | "allow";

export function planModeToPolicy(mode: PlanMode): PlanModeToolPolicy {
	switch (mode) {
		case "plan-only":
			return "deny-all";
		case "plan-then-ask":
			return "deny-write-only";
		default:
			return "allow";
	}
}

/**
 * Given a policy and a tool name, return either `null` (allowed) or the
 * structured deny reason string used by both the LLM-path gate and the
 * runtime canUseTool guard.
 *
 * The reason is intentionally shaped `planMode:<mode>: <tool> ...` so
 * downstream audit sinks / tests can regex-match a stable prefix.
 */
export function evaluateToolAgainstPlanMode(
	mode: PlanMode,
	toolName: string,
): { approved: true } | { approved: false; reason: string } {
	const policy = planModeToPolicy(mode);
	if (policy === "allow") return { approved: true };
	if (policy === "deny-all") {
		return {
			approved: false,
			reason: `planMode:${mode}: ${toolName} is not permitted during planning`,
		};
	}
	// deny-write-only
	if (isDestructiveTool(toolName)) {
		return {
			approved: false,
			reason: `planMode:${mode}: ${toolName} is not permitted during planning`,
		};
	}
	return { approved: true };
}
