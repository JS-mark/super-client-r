// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentProfile } from "@super-client/shared-types/agent-sdk";

import {
	computeSubagentPolicy,
	evaluateSubagentTool,
} from "../subagentPolicy";

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
	return {
		id: "builtin_test",
		name: "Test Profile",
		description: "for tests",
		prompt: "you are a test",
		...overrides,
	};
}

describe("subagentPolicy.computeSubagentPolicy", () => {
	it("default input → read-only tools + plan-then-ask + inheritsGrants:false", () => {
		const policy = computeSubagentPolicy();
		// Read-only builtins survive
		for (const name of ["Read", "Grep", "Glob", "WebFetch", "AskUserQuestion"]) {
			expect(policy.effectiveTools).toContain(name);
		}
		// Destructive builtins land in disallowedTools
		for (const name of ["Write", "Edit", "Bash", "Task"]) {
			expect(policy.disallowedTools).toContain(name);
			expect(policy.effectiveTools).not.toContain(name);
		}
		expect(policy.planMode).toBe("plan-then-ask");
		expect(policy.approvalMode).toBe("request");
		expect(policy.inheritsGrants).toBe(false);
		expect(policy.reason).toContain("subagent-policy:default-read-only");
	});

	it("profile.tools grants Write but keeps re-approval required", () => {
		const policy = computeSubagentPolicy({
			profile: profile({ id: "builtin_programmer", tools: ["Write"] }),
		});
		expect(policy.effectiveTools).toContain("Write");
		expect(policy.disallowedTools).not.toContain("Write");
		// approval still "request" — no auto-grant
		expect(policy.approvalMode).toBe("request");
		expect(policy.reason).toContain("profile:builtin_programmer");
	});

	it("profile.disallowedTools always denies even if requested", () => {
		const policy = computeSubagentPolicy({
			profile: profile({
				id: "builtin_reviewer",
				tools: ["Read", "Bash"],
				disallowedTools: ["Bash"],
			}),
			requestedTools: ["Read", "Bash", "Grep"],
		});
		expect(policy.effectiveTools).toContain("Read");
		expect(policy.effectiveTools).toContain("Grep");
		expect(policy.effectiveTools).not.toContain("Bash");
		expect(policy.disallowedTools).toContain("Bash");
	});

	it("requestedTools narrows the allow-list to their intersection", () => {
		const policy = computeSubagentPolicy({
			requestedTools: ["Read", "Grep"],
		});
		expect(policy.effectiveTools).toEqual(["Grep", "Read"]);
		// WebFetch was read-only but not requested → excluded.
		expect(policy.effectiveTools).not.toContain("WebFetch");
	});

	it("reason string carries all source labels deterministically", () => {
		const policy = computeSubagentPolicy({
			profile: profile({ id: "builtin_programmer" }),
			parentPlanMode: "plan-then-ask",
			parentApprovalMode: "request",
		});
		expect(policy.reason).toBe(
			"subagent-policy:default-read-only + profile:builtin_programmer + parent-plan:plan-then-ask + parent-approval:request",
		);
	});

	it("strips scp-agent-builtins__ prefix from requested tools + profile tools", () => {
		const policy = computeSubagentPolicy({
			profile: profile({ tools: ["scp-agent-builtins__Write"] }),
			requestedTools: ["scp-agent-builtins__Read", "scp-agent-builtins__Write"],
		});
		expect(policy.effectiveTools).toContain("Read");
		expect(policy.effectiveTools).toContain("Write");
	});
});

describe("subagentPolicy.evaluateSubagentTool", () => {
	it("allows tools in effectiveTools", () => {
		const policy = computeSubagentPolicy();
		expect(evaluateSubagentTool(policy, "Read")).toEqual({ approved: true });
		expect(evaluateSubagentTool(policy, "scp-agent-builtins__Read")).toEqual({
			approved: true,
		});
	});

	it("denies tools outside effective set with stable prefix", () => {
		const policy = computeSubagentPolicy();
		const result = evaluateSubagentTool(policy, "Write");
		expect(result.approved).toBe(false);
		if (!result.approved) {
			expect(result.reason).toMatch(/^subagent-policy:tool-denied/);
			expect(result.reason).toContain("Write");
		}
	});

	it("denies explicit disallowed tools even if bare unknown", () => {
		const policy = computeSubagentPolicy({
			profile: profile({ disallowedTools: ["github__create_issue"] }),
		});
		const result = evaluateSubagentTool(policy, "github__create_issue");
		expect(result.approved).toBe(false);
	});
});
