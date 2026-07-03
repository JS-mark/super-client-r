// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyPlanModeGate } from "../planModeGate";
import type { ChatCompletionRequest } from "../../../ipc/types";
import type { PlanMode } from "@super-client/shared-types/chat";

const { resolveMock, recordMock } = vi.hoisted(() => ({
	resolveMock: vi.fn(),
	recordMock: vi.fn(),
}));

vi.mock("../../runtime/SessionRuntimeResolver", () => ({
	getSessionRuntimeResolver: () => ({ resolve: resolveMock }),
}));
vi.mock("../../runtime/RuntimePolicyService", () => ({
	getRuntimePolicyService: () => ({ record: recordMock }),
}));

function setPlanMode(mode: PlanMode) {
	resolveMock.mockReturnValue({ planMode: mode, workspaceId: "ws-1" });
}

function toolDef(name: string) {
	return {
		type: "function" as const,
		function: { name, description: "", parameters: {} },
	};
}

function buildReq(
	tools?: ChatCompletionRequest["tools"],
	toolMapping?: ChatCompletionRequest["toolMapping"],
): ChatCompletionRequest {
	return {
		requestId: "r1",
		conversationId: "c1",
		baseUrl: "x",
		apiKey: "x",
		model: "m",
		messages: [{ role: "system", content: "base" }],
		tools,
		toolMapping,
	} as unknown as ChatCompletionRequest;
}

beforeEach(() => {
	resolveMock.mockReset();
	recordMock.mockReset();
});

describe("applyPlanModeGate — plan-only", () => {
	it("strips ALL tools and prepends a plan-only system note", () => {
		setPlanMode("plan-only");
		const req = buildReq([toolDef("scp-agent-builtins__Read"), toolDef("scp-agent-builtins__Write")]);
		const out = applyPlanModeGate(req, async () => "x");

		expect(out.toolExecutor).toBeUndefined();
		expect(out.request.tools).toBeUndefined();
		expect(out.request.toolMapping).toBeUndefined();
		expect(
			(out.request.messages[0] as { content: string }).content,
		).toMatch(/PLAN ONLY mode/);
		expect(
			(out.request.messages[0] as { content: string }).content,
		).toMatch(/base$/);
	});

	it("audits with plan-mode:plan-only reason", () => {
		setPlanMode("plan-only");
		applyPlanModeGate(buildReq([toolDef("scp-agent-builtins__Read")]), undefined);
		expect(recordMock).toHaveBeenCalledTimes(1);
		const [ctx, decision, reason] = recordMock.mock.calls[0];
		expect(decision).toBe("denied");
		expect(reason).toBe("plan-mode:plan-only");
		expect(ctx.operation).toBe("plan-mode:strip-tools");
	});
});

describe("applyPlanModeGate — plan-then-ask", () => {
	it("keeps read-oriented builtin tools and drops write/edit/bash/task", () => {
		setPlanMode("plan-then-ask");
		const tools = [
			toolDef("scp-agent-builtins__Read"),
			toolDef("scp-agent-builtins__Grep"),
			toolDef("scp-agent-builtins__Glob"),
			toolDef("scp-agent-builtins__WebFetch"),
			toolDef("scp-agent-builtins__AskUserQuestion"),
			toolDef("scp-agent-builtins__Write"),
			toolDef("scp-agent-builtins__Edit"),
			toolDef("scp-agent-builtins__Bash"),
			toolDef("scp-agent-builtins__Task"),
		];
		const mapping: NonNullable<ChatCompletionRequest["toolMapping"]> = {};
		for (const t of tools) {
			mapping[t.function.name] = {
				serverId: "@scp/agent-builtins",
				toolName: t.function.name.replace(/^scp-agent-builtins__/, ""),
			};
		}
		const out = applyPlanModeGate(buildReq(tools, mapping), async () => "x");
		const names = (out.request.tools ?? []).map((t) => t.function.name);
		expect(names).toContain("scp-agent-builtins__Read");
		expect(names).toContain("scp-agent-builtins__Grep");
		expect(names).toContain("scp-agent-builtins__Glob");
		expect(names).toContain("scp-agent-builtins__WebFetch");
		expect(names).toContain("scp-agent-builtins__AskUserQuestion");
		expect(names).not.toContain("scp-agent-builtins__Write");
		expect(names).not.toContain("scp-agent-builtins__Edit");
		expect(names).not.toContain("scp-agent-builtins__Bash");
		expect(names).not.toContain("scp-agent-builtins__Task");
		// mapping filtered in lockstep
		const mappingKeys = Object.keys(out.request.toolMapping ?? {});
		expect(mappingKeys).toContain("scp-agent-builtins__Read");
		expect(mappingKeys).not.toContain("scp-agent-builtins__Write");
	});

	it("keeps toolExecutor wired (runtime canUseTool is second-line defense)", () => {
		setPlanMode("plan-then-ask");
		const exec = vi.fn();
		const out = applyPlanModeGate(
			buildReq([toolDef("scp-agent-builtins__Read")]),
			exec as never,
		);
		expect(out.toolExecutor).toBe(exec);
	});

	it("prepends a plan-then-ask system note (not plan-only note)", () => {
		setPlanMode("plan-then-ask");
		const out = applyPlanModeGate(
			buildReq([toolDef("scp-agent-builtins__Read")]),
			undefined,
		);
		const content = (out.request.messages[0] as { content: string }).content;
		expect(content).toMatch(/PLAN THEN ASK mode/);
		expect(content).not.toMatch(/PLAN ONLY mode/);
	});

	it("audits with plan-mode:plan-then-ask reason and strip-destructive operation", () => {
		setPlanMode("plan-then-ask");
		applyPlanModeGate(
			buildReq([toolDef("scp-agent-builtins__Write")]),
			undefined,
		);
		expect(recordMock).toHaveBeenCalledTimes(1);
		const [ctx, decision, reason] = recordMock.mock.calls[0];
		expect(decision).toBe("denied");
		expect(reason).toBe("plan-mode:plan-then-ask");
		expect(ctx.operation).toBe("plan-mode:strip-destructive-tools");
	});

	it("drops unknown/user MCP tools (destructive by default)", () => {
		setPlanMode("plan-then-ask");
		const out = applyPlanModeGate(
			buildReq([
				toolDef("scp-agent-builtins__Read"),
				toolDef("github__create_issue"),
			]),
			undefined,
		);
		const names = (out.request.tools ?? []).map((t) => t.function.name);
		expect(names).toContain("scp-agent-builtins__Read");
		expect(names).not.toContain("github__create_issue");
	});
});

describe("applyPlanModeGate — non-plan modes", () => {
	for (const mode of ["chat", "auto-execute-safe", "full-agent"] as const) {
		it(`passes through unchanged for planMode=${mode}`, () => {
			setPlanMode(mode);
			const exec = vi.fn();
			const originalTools = [
				toolDef("scp-agent-builtins__Read"),
				toolDef("scp-agent-builtins__Write"),
			];
			const req = buildReq(originalTools);
			const out = applyPlanModeGate(req, exec as never);
			expect(out.request.tools).toBe(originalTools);
			expect(out.toolExecutor).toBe(exec);
			expect(recordMock).not.toHaveBeenCalled();
			expect(
				(out.request.messages[0] as { content: string }).content,
			).toBe("base");
		});
	}
});

describe("applyPlanModeGate — resolver failure", () => {
	it("treats resolver throw as chat mode (no gating, no audit)", () => {
		resolveMock.mockImplementation(() => {
			throw new Error("nope");
		});
		const originalTools = [toolDef("scp-agent-builtins__Write")];
		const out = applyPlanModeGate(buildReq(originalTools), async () => "x");
		expect(out.request.tools).toBe(originalTools);
		expect(recordMock).not.toHaveBeenCalled();
	});
});
