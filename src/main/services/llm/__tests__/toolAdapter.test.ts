// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildToolSet } from "../toolAdapter";
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

describe("buildToolSet", () => {
	it("returns undefined when there are no tools or no executor", () => {
		expect(
			buildToolSet({
				request: { ...makeReq(), tools: [] },
				toolExecutor: undefined,
				broadcast: vi.fn(),
				checkPermission: async () => true,
				evaluateRuntimePolicy: () => ({ allowed: true }),
			}),
		).toBeUndefined();
		expect(
			buildToolSet({
				request: makeReq(),
				toolExecutor: undefined,
				broadcast: vi.fn(),
				checkPermission: async () => true,
				evaluateRuntimePolicy: () => ({ allowed: true }),
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
			checkPermission: async () => true,
			evaluateRuntimePolicy: () => ({ allowed: true }),
		});
		const result = await set!["echo"].execute!(
			{ msg: "hi" },
			{ toolCallId: "tc1", messages: [] as never },
		);
		expect(executor).toHaveBeenCalledWith("echo", { msg: "hi" });
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
			checkPermission: async () => false,
			evaluateRuntimePolicy: () => ({ allowed: true }),
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

	it("blocks execution and emits tool_error when runtime policy denies", async () => {
		const events: ChatStreamEvent[] = [];
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: vi.fn(),
			broadcast: (e) => events.push(e),
			checkPermission: async () => true,
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

	it("turns executor exceptions into tool_error events and rethrows so SDK can feed back to model", async () => {
		const events: ChatStreamEvent[] = [];
		const set = buildToolSet({
			request: makeReq(),
			toolExecutor: async () => {
				throw new Error("boom");
			},
			broadcast: (e) => events.push(e),
			checkPermission: async () => true,
			evaluateRuntimePolicy: () => ({ allowed: true }),
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
