// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	evaluateToolAgainstPlanMode,
	isDestructiveTool,
	planModeToPolicy,
	stripBuiltinPrefix,
	READ_ONLY_TOOL_NAMES,
} from "../planModeToolGuard";

describe("planModeToolGuard.stripBuiltinPrefix", () => {
	it("strips scp-agent-builtins__ prefix", () => {
		expect(stripBuiltinPrefix("scp-agent-builtins__Read")).toBe("Read");
	});
	it("passes bare names through", () => {
		expect(stripBuiltinPrefix("Read")).toBe("Read");
		expect(stripBuiltinPrefix("github__create_issue")).toBe(
			"github__create_issue",
		);
	});
});

describe("planModeToolGuard.isDestructiveTool", () => {
	it("read-oriented builtins are non-destructive (bare + prefixed)", () => {
		for (const name of ["Read", "Grep", "Glob", "WebFetch", "AskUserQuestion"]) {
			expect(isDestructiveTool(name)).toBe(false);
			expect(isDestructiveTool(`scp-agent-builtins__${name}`)).toBe(false);
		}
	});
	it("write/edit/exec builtins are destructive", () => {
		for (const name of ["Write", "Edit", "Bash", "Task"]) {
			expect(isDestructiveTool(name)).toBe(true);
			expect(isDestructiveTool(`scp-agent-builtins__${name}`)).toBe(true);
		}
	});
	it("unknown / user MCP tools are destructive by default", () => {
		expect(isDestructiveTool("github__create_issue")).toBe(true);
		expect(isDestructiveTool("random_thing")).toBe(true);
	});
	it("READ_ONLY_TOOL_NAMES is the source of truth", () => {
		for (const name of READ_ONLY_TOOL_NAMES) {
			expect(isDestructiveTool(name)).toBe(false);
		}
	});
});

describe("planModeToolGuard.planModeToPolicy", () => {
	it("plan-only → deny-all", () => {
		expect(planModeToPolicy("plan-only")).toBe("deny-all");
	});
	it("plan-then-ask → deny-write-only", () => {
		expect(planModeToPolicy("plan-then-ask")).toBe("deny-write-only");
	});
	it("chat / auto-execute-safe / full-agent → allow", () => {
		expect(planModeToPolicy("chat")).toBe("allow");
		expect(planModeToPolicy("auto-execute-safe")).toBe("allow");
		expect(planModeToPolicy("full-agent")).toBe("allow");
	});
});

describe("planModeToolGuard.evaluateToolAgainstPlanMode", () => {
	it("plan-only denies every tool with structured reason", () => {
		const result = evaluateToolAgainstPlanMode("plan-only", "Read");
		expect(result).toEqual({
			approved: false,
			reason: "planMode:plan-only: Read is not permitted during planning",
		});
	});

	it("plan-then-ask denies write_file / edit_file / delete-ish tools", () => {
		for (const name of ["Write", "Edit", "Bash", "Task", "github__create_issue"]) {
			const result = evaluateToolAgainstPlanMode("plan-then-ask", name);
			expect(result.approved).toBe(false);
			if (!result.approved) {
				expect(result.reason).toContain("planMode:plan-then-ask");
				expect(result.reason).toContain(name);
			}
		}
	});

	it("plan-then-ask allows Read / Grep / Glob / WebFetch / AskUserQuestion", () => {
		for (const name of ["Read", "Grep", "Glob", "WebFetch", "AskUserQuestion"]) {
			expect(evaluateToolAgainstPlanMode("plan-then-ask", name)).toEqual({
				approved: true,
			});
			expect(
				evaluateToolAgainstPlanMode(
					"plan-then-ask",
					`scp-agent-builtins__${name}`,
				),
			).toEqual({ approved: true });
		}
	});

	it("chat / auto-execute-safe / full-agent approve every tool", () => {
		for (const mode of ["chat", "auto-execute-safe", "full-agent"] as const) {
			for (const name of ["Read", "Write", "Bash"]) {
				expect(evaluateToolAgainstPlanMode(mode, name)).toEqual({
					approved: true,
				});
			}
		}
	});
});
