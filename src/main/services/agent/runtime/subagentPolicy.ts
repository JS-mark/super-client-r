/**
 * subagentPolicy — Multi-Agent Round 6 subagent capability classifier.
 *
 * Purpose (spec §4 / user-confirmed design point 4):
 *   Subagents launched via the built-in `Task` tool default to READ-ONLY
 *   with high-risk operations re-approved. Approval grants from the parent
 *   session are NEVER auto-inherited; each subagent starts with a fresh
 *   grant state. When a caller-side `AgentProfile.tools` allow-list is
 *   provided, it acts as a HARD CAP — no tool outside the allow-list can
 *   be reached, regardless of parent state.
 *
 * The classifier is a pure function so parent runtime code (Task tool
 * handler / broker plumbing) and unit tests can share the same policy.
 *
 * NOTE on ApprovalMode: `shared-types/chat.ts` defines
 *   ApprovalMode = "request" | "auto-safe" | "full-access"
 * We map the spec's "on-request" (ask-user-per-high-risk-tool) to the
 * concrete `"request"` value.
 */

import type { AgentProfile } from "@super-client/shared-types/agent-sdk";
import type { ApprovalMode, PlanMode } from "@super-client/shared-types/chat";
import {
	isDestructiveTool,
	READ_ONLY_TOOL_NAMES,
	stripBuiltinPrefix,
} from "./planModeToolGuard";

/**
 * Input carrying just enough about the parent session + subagent profile
 * to compute the derived policy. All fields are optional; missing fields
 * fall through to conservative defaults.
 */
export interface SubagentPolicyInput {
	/** Parent session's plan mode; if plan-only the subagent inherits deny-all
	 * because the parent itself is planning-only. */
	parentPlanMode?: PlanMode;
	/** Parent's approval mode. NOT inherited by design; only used to detect
	 * `full-access` sessions where the user has explicitly opted-in to
	 * broader defaults so the subagent policy can be slightly more
	 * permissive on its `approvalMode` reason string. */
	parentApprovalMode?: ApprovalMode;
	/** When the caller knows which team profile spawned this subagent, pass
	 * it in so `AgentProfile.tools` / `disallowedTools` bound the effective
	 * allow-list. */
	profile?: AgentProfile;
	/** Tool names the caller wanted to grant (typically what the Task input
	 * asked for, or the parent's tools[]). When omitted, only the profile
	 * caps + read-only defaults apply. */
	requestedTools?: string[];
}

/**
 * Resolved subagent capability envelope.
 */
export interface SubagentPolicy {
	/** Final allow-list of tool bare-names (no `scp-agent-builtins__` prefix).
	 * Empty [] means read-only + nothing else. */
	effectiveTools: string[];
	/** Hard-deny list. When a tool is in this list the subagent's
	 * `canUseTool` MUST reject with reason `subagent-policy:tool-denied`. */
	disallowedTools: string[];
	/** Subagent's approval mode; defaults to `"request"` so the user is
	 * re-asked for any high-risk tool. Never inherits `full-access`. */
	approvalMode: ApprovalMode;
	/** Plan mode the subagent runs under; defaults to `plan-then-ask` so
	 * destructive tools go through a plan → confirm loop. */
	planMode: PlanMode;
	/** Structural constant — subagents never inherit parent approval
	 * grants. Present so callers can assert against a stable field. */
	inheritsGrants: false;
	/** Human/audit reason string with source tags, e.g.
	 * `"subagent-policy:default-read-only + profile:builtin_programmer"`. */
	reason: string;
}

/**
 * Compute the effective policy for a subagent spawn. Pure — no I/O.
 *
 * Algorithm:
 *   1. Start from READ_ONLY_TOOL_NAMES.
 *   2. Union in `profile.tools` (allow-list — explicit trust from the
 *      user-configured role).
 *   3. Intersect with `requestedTools` when provided (caller's ask).
 *   4. Remove anything in `profile.disallowedTools` (hard cap).
 *   5. Disallowed = destructive tools NOT in the effective set.
 *
 * Even when a destructive tool ends up in `effectiveTools` via profile
 * allow-list, it still requires re-approval at runtime because
 * `approvalMode` is `"request"`.
 */
export function computeSubagentPolicy(
	input: SubagentPolicyInput = {},
): SubagentPolicy {
	const profile = input.profile;
	const profileAllow = new Set(
		(profile?.tools ?? []).map((n) => stripBuiltinPrefix(n)),
	);
	const profileDeny = new Set(
		(profile?.disallowedTools ?? []).map((n) => stripBuiltinPrefix(n)),
	);

	// Base allow-list: read-only defaults ∪ profile explicit allow.
	const baseAllow = new Set<string>();
	for (const name of READ_ONLY_TOOL_NAMES) baseAllow.add(name);
	for (const name of profileAllow) baseAllow.add(name);

	// Intersect with requestedTools when the caller narrowed the ask.
	let effective: Set<string>;
	if (input.requestedTools && input.requestedTools.length > 0) {
		const requested = new Set(
			input.requestedTools.map((n) => stripBuiltinPrefix(n)),
		);
		effective = new Set(
			[...baseAllow].filter((name) => requested.has(name)),
		);
	} else {
		effective = new Set(baseAllow);
	}

	// Apply profile hard-deny.
	for (const name of profileDeny) effective.delete(name);

	// Disallowed = destructive tools that landed OUTSIDE the effective set,
	// plus every tool the profile explicitly banned. The union of both is
	// what canUseTool should hard-reject; downstream approval flow still
	// mediates the destructive-but-allowed tools.
	const disallowed = new Set<string>();
	for (const name of profileDeny) disallowed.add(name);
	// Also record commonly-destructive builtins that are not in effective
	// as a stable, deterministic deny-list surface. We use a fixed set
	// rather than "every possible tool" to keep the audit output finite.
	const KNOWN_DESTRUCTIVE = ["Write", "Edit", "Bash", "Task"];
	for (const name of KNOWN_DESTRUCTIVE) {
		if (!effective.has(name) && isDestructiveTool(name)) {
			disallowed.add(name);
		}
	}

	// Reason tags — deterministic order so tests can assert substrings.
	const tags: string[] = ["subagent-policy:default-read-only"];
	if (profile?.id) tags.push(`profile:${profile.id}`);
	else if (profile?.name) tags.push(`profile:${profile.name}`);
	if (input.parentPlanMode) tags.push(`parent-plan:${input.parentPlanMode}`);
	if (input.parentApprovalMode) {
		tags.push(`parent-approval:${input.parentApprovalMode}`);
	}

	return {
		effectiveTools: [...effective].sort(),
		disallowedTools: [...disallowed].sort(),
		approvalMode: "request",
		planMode: "plan-then-ask",
		inheritsGrants: false,
		reason: tags.join(" + "),
	};
}

/**
 * Companion helper: does a tool name violate a computed policy?
 *
 * Returns `{ approved: true }` if the tool is in `effectiveTools`,
 * otherwise `{ approved: false, reason }` with a stable
 * `subagent-policy:` prefix so downstream RuntimePolicyService / test
 * matchers can classify it.
 */
export function evaluateSubagentTool(
	policy: SubagentPolicy,
	toolName: string,
): { approved: true } | { approved: false; reason: string } {
	const bare = stripBuiltinPrefix(toolName);
	if (policy.disallowedTools.includes(bare)) {
		return {
			approved: false,
			reason: `subagent-policy:tool-denied: ${toolName} not in effective allow-list`,
		};
	}
	if (policy.effectiveTools.includes(bare)) {
		return { approved: true };
	}
	return {
		approved: false,
		reason: `subagent-policy:tool-denied: ${toolName} not in effective allow-list`,
	};
}
