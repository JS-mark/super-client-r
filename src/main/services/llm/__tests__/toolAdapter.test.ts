// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildToolSet } from "../toolAdapter";
import { RuntimeApprovalRequiredError } from "../LLMService";
import type { ChatCompletionRequest, ChatStreamEvent } from "../../../ipc/types";

function makeReq(
	overrides?: Partial<ChatCompletionRequest>,
): ChatCompletionRequest {
	return {
		requestId: "r1",
		baseUrl: "x",
		apiKey: "x",
		model: "m",
		messages: [],
		tools: [
			{
				type: "function",
				function: {
					name: "echo",
					description: "echo",
					parameters: {
						type: "object",
						properties: { msg: { type: "string" } },
						required: ["msg"],
					},
				},
			},
		],
		conversationId: "c1",
		...overrides,
	};
}

/** Defaults that satisfy `BuildToolSetArgs` without exercising any branches. */
const defaultGates = {
	checkPermission: async () => true,
	evaluateRuntimePolicy: () => ({ allowed: true } as const),
	awaitRuntimeApproval: async () => false,
	// AskUserQuestion interception is not exercised by these tests; the
	// default never resolves (the special-case path only fires when the
	// tool name matches `AskUserQuestion`, which is never the case in
	// the fixtures below).
	awaitUserQuestionAnswer: async () => null,
};

describe("buildToolSet", () => {
	it("returns undefined when there are no tools or no executor", () => {
		expect(
			buildToolSet({
				request: { ...makeReq(), tools: [] },
				toolExecutor: undefined,
				broadcast: vi.fn(),
				...defaultGates,
			}),
		).toBeUndefined();
		expect(
			buildToolSet({
				request: makeReq(),
				toolExecutor: undefined,
				broadcast: vi.fn(),
				...defaultGates,
			}),
		).toBeUndefined();
	});

	it("executes tool and broadcasts tool_call + tool_result with duration", async () => {
		const events: ChatStreamEvent[] = [];
		const executor = vi.fn(
			async (_n: string, args: Record<string, unknown>) => ({ ok: true, args }),
		);
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: executor,
			broadcast: (e) => events.push(e),
			...defaultGates,
		});
		const result = await set!["echo"].execute!(
			{ msg: "hi" },
			{ toolCallId: "tc1", messages: [] as never },
		);
		// Executor is called with the third options arg now — it gets `{ approvalGranted: false }`
		// for the happy path (no runtime-policy prompt).
		expect(executor).toHaveBeenCalledWith(
			"echo",
			{ msg: "hi" },
			{ approvalGranted: false },
		);
		expect(result).toEqual({ ok: true, args: { msg: "hi" } });
		expect(events.find((e) => e.type === "tool_call")).toMatchObject({
			type: "tool_call",
			toolCall: { id: "tc1", name: "echo" },
		});
		const r = events.find((e) => e.type === "tool_result");
		expect(r?.toolResult?.toolCallId).toBe("tc1");
		expect(typeof r?.toolResult?.duration).toBe("number");
	});

	it("blocks execution and emits tool_error when permission denies", async () => {
		const events: ChatStreamEvent[] = [];
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: vi.fn(),
			broadcast: (e) => events.push(e),
			...defaultGates,
			checkPermission: async () => false,
		});
		await expect(
			set!["echo"].execute!(
				{ msg: "hi" },
				{ toolCallId: "tc1", messages: [] as never },
			),
		).rejects.toThrow(/rejected/i);
		expect(events.find((e) => e.type === "tool_error")?.toolError?.code).toBe(
			"TOOL_REJECTED",
		);
	});

	it("blocks execution and emits tool_error when runtime policy denies (non-approval code)", async () => {
		const events: ChatStreamEvent[] = [];
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: vi.fn(),
			broadcast: (e) => events.push(e),
			...defaultGates,
			evaluateRuntimePolicy: () => ({
				allowed: false,
				code: "X",
				message: "nope",
			}),
		});
		await expect(
			set!["echo"].execute!(
				{ msg: "hi" },
				{ toolCallId: "tc2", messages: [] as never },
			),
		).rejects.toThrow(/nope/);
		expect(events.find((e) => e.type === "tool_error")?.toolError?.code).toBe(
			"X",
		);
	});

	it("prompts user when runtime policy says needs-approval and proceeds on approve", async () => {
		const events: ChatStreamEvent[] = [];
		const executor = vi.fn(async () => "ok");
		const awaitRuntimeApproval = vi.fn(async () => true);
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: executor,
			broadcast: (e) => events.push(e),
			...defaultGates,
			evaluateRuntimePolicy: () => ({
				allowed: false,
				code: "runtime.needsApproval",
				message: "workspace-policy:command-approval-required",
			}),
			awaitRuntimeApproval,
		});
		const result = await set!["echo"].execute!(
			{ msg: "hi" },
			{ toolCallId: "tc-need", messages: [] as never },
		);
		expect(result).toBe("ok");
		expect(awaitRuntimeApproval).toHaveBeenCalledWith({
			toolCallId: "tc-need",
			toolName: "echo",
			toolArgs: JSON.stringify({ msg: "hi" }),
			code: "runtime.needsApproval",
			message: "workspace-policy:command-approval-required",
		});
		expect(executor).toHaveBeenCalledWith(
			"echo",
			{ msg: "hi" },
			{ approvalGranted: true },
		);
		expect(events.find((e) => e.type === "tool_result")).toBeDefined();
		// No tool_error before the result.
		expect(events.findIndex((e) => e.type === "tool_error")).toBe(-1);
	});

	it("emits tool_error when the user declines the runtime-policy prompt", async () => {
		const events: ChatStreamEvent[] = [];
		const executor = vi.fn();
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: executor,
			broadcast: (e) => events.push(e),
			...defaultGates,
			evaluateRuntimePolicy: () => ({
				allowed: false,
				code: "runtime.needsApproval",
				message: "workspace-policy:command-approval-required",
			}),
			awaitRuntimeApproval: async () => false,
		});
		await expect(
			set!["echo"].execute!(
				{ msg: "hi" },
				{ toolCallId: "tc-decline", messages: [] as never },
			),
		).rejects.toThrow(/declined/i);
		expect(executor).not.toHaveBeenCalled();
		const err = events.find((e) => e.type === "tool_error");
		expect(err?.toolError?.code).toBe("runtime.needsApproval");
	});

	it("retries with approval when the McpService gate raises RuntimeApprovalRequiredError mid-execute", async () => {
		const events: ChatStreamEvent[] = [];
		let attempt = 0;
		const executor = vi.fn(
			async (
				_n: string,
				_a: Record<string, unknown>,
				opts?: { approvalGranted?: boolean },
			) => {
				attempt += 1;
				if (attempt === 1) {
					throw new RuntimeApprovalRequiredError(
						"workspace-policy:command-approval-required",
						"runtime.needsApproval",
					);
				}
				if (!opts?.approvalGranted) {
					throw new Error("expected approvalGranted on retry");
				}
				return "ok-after-retry";
			},
		);
		const awaitRuntimeApproval = vi.fn(async () => true);
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: executor,
			broadcast: (e) => events.push(e),
			...defaultGates,
			awaitRuntimeApproval,
		});
		const result = await set!["echo"].execute!(
			{ msg: "hi" },
			{ toolCallId: "tc-retry", messages: [] as never },
		);
		expect(result).toBe("ok-after-retry");
		expect(awaitRuntimeApproval).toHaveBeenCalledTimes(1);
		expect(executor).toHaveBeenCalledTimes(2);
		// Final result event present, no preceding tool_error broadcast leaked.
		expect(events.find((e) => e.type === "tool_result")).toBeDefined();
		expect(events.findIndex((e) => e.type === "tool_error")).toBe(-1);
	});

	it("turns executor exceptions into tool_error events and rethrows so SDK can feed back to model", async () => {
		const events: ChatStreamEvent[] = [];
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: async () => {
				throw new Error("boom");
			},
			broadcast: (e) => events.push(e),
			...defaultGates,
		});
		await expect(
			set!["echo"].execute!(
				{ msg: "hi" },
				{ toolCallId: "tc3", messages: [] as never },
			),
		).rejects.toThrow(/boom/);
		const err = events.find((e) => e.type === "tool_error");
		expect(err?.toolError?.error).toBe("boom");
		expect(typeof err?.toolError?.duration).toBe("number");
	});
});
