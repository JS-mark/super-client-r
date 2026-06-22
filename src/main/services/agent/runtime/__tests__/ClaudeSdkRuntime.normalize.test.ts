// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
	AgentRuntimeStreamEvent,
	AgentInitEvent,
	AgentTextDeltaEvent,
	AgentMessageFinalEvent,
	AgentToolCallEvent,
	AgentStatusEvent,
	AgentPermissionRequestEvent,
	AgentPermissionResolvedEvent,
	AgentRateLimitEvent,
	AgentResultEvent,
	AgentUsageEvent,
	AgentErrorEvent,
} from "@super-client/shared-types/agent-runtime";
import type { AgentSDKStreamEvent } from "@super-client/shared-types/agent-sdk";

import { normalize } from "../ClaudeSdkRuntime";

// 简单 base 工厂
function makeBase(): unknown {
	let seq = 0;
	return (partial: Record<string, unknown>) =>
		({
			v: 1,
			requestId: "req-1",
			conversationId: "conv-1",
			seq: seq++,
			runtime: "claude-sdk",
			timestamp: 0,
			...partial,
		}) as AgentRuntimeStreamEvent;
}

const make = makeBase() as (
	p: { type: AgentRuntimeStreamEvent["type"] } & Record<string, unknown>,
) => AgentRuntimeStreamEvent;

function sdk<T extends AgentSDKStreamEvent["type"]>(
	type: T,
	rest: Partial<AgentSDKStreamEvent> = {},
): AgentSDKStreamEvent {
	return { requestId: "req-1", type, ...rest } as AgentSDKStreamEvent;
}

describe("ClaudeSdkRuntime.normalize", () => {
	it("init → AgentInitEvent with nativeSessionId", () => {
		const out = normalize(sdk("init", { sessionId: "sess-X" }), make);
		expect(out).toHaveLength(1);
		const ev = out[0] as AgentInitEvent;
		expect(ev.type).toBe("init");
		expect(ev.nativeSessionId).toBe("sess-X");
	});

	it("chunk with content → text.delta", () => {
		const out = normalize(sdk("chunk", { content: "hello" }), make);
		const ev = out[0] as AgentTextDeltaEvent;
		expect(ev.type).toBe("text.delta");
		expect(ev.delta).toBe("hello");
		expect(ev.messageId).toBe("main");
	});

	it("chunk without content → []", () => {
		expect(normalize(sdk("chunk"), make)).toEqual([]);
		expect(normalize(sdk("chunk", { content: "" }), make)).toEqual([]);
	});

	it("assistant → message.final", () => {
		const out = normalize(sdk("assistant", { content: "done" }), make);
		const ev = out[0] as AgentMessageFinalEvent;
		expect(ev.type).toBe("message.final");
		expect(ev.text).toBe("done");
	});

	it("tool_call → tool.call carrying id/name/input", () => {
		const out = normalize(
			sdk("tool_call", {
				toolCall: {
					id: "t1",
					name: "fs__read",
					input: { path: "/x" },
					kind: "tool",
				},
			}),
			make,
		);
		const ev = out[0] as AgentToolCallEvent;
		expect(ev.type).toBe("tool.call");
		expect(ev.callId).toBe("t1");
		expect(ev.toolName).toBe("fs__read");
		expect(ev.input).toEqual({ path: "/x" });
	});

	it("tool_use_summary → status(tool_calling) with summary in extra", () => {
		const out = normalize(
			sdk("tool_use_summary", { toolSummary: "Read file" }),
			make,
		);
		const ev = out[0] as AgentStatusEvent;
		expect(ev.type).toBe("status");
		expect(ev.status).toBe("tool_calling");
		expect(ev.extra).toEqual({ toolSummary: "Read file" });
	});

	it("tool_use_summary without text → []", () => {
		expect(normalize(sdk("tool_use_summary"), make)).toEqual([]);
	});

	it("status maps phrases", () => {
		const cases: Array<[string, string]> = [
			["preparing", "preparing"],
			["calling tool foo", "tool_calling"],
			["idle", "idle"],
			["streaming text", "streaming"],
			["", "streaming"],
		];
		for (const [raw, expected] of cases) {
			const out = normalize(sdk("status", { status: raw }), make);
			const ev = out[0] as AgentStatusEvent;
			expect(ev.status).toBe(expected);
		}
	});

	it("permission_request → permission.request", () => {
		const out = normalize(
			sdk("permission_request", {
				permissionRequest: {
					toolUseId: "appr-1",
					toolName: "fs__write",
					toolInput: { path: "/x" },
				},
			}),
			make,
		);
		const ev = out[0] as AgentPermissionRequestEvent;
		expect(ev.type).toBe("permission.request");
		expect(ev.approvalId).toBe("appr-1");
		expect(ev.toolName).toBe("fs__write");
	});

	it("permission_denied → permission.resolved (denied, auto-policy)", () => {
		const out = normalize(
			sdk("permission_denied", {
				permissionRequest: {
					toolUseId: "appr-1",
					toolName: "x",
					toolInput: {},
				},
				error: "blocked",
			}),
			make,
		);
		const ev = out[0] as AgentPermissionResolvedEvent;
		expect(ev.type).toBe("permission.resolved");
		expect(ev.decision.approved).toBe(false);
		expect(ev.source).toBe("auto-policy");
		expect(ev.decision.reason).toBe("blocked");
	});

	it("rate_limit → rate_limit", () => {
		const out = normalize(sdk("rate_limit", { error: "slow down" }), make);
		const ev = out[0] as AgentRateLimitEvent;
		expect(ev.type).toBe("rate_limit");
		expect(ev.message).toBe("slow down");
	});

	it("result without usage → only result(completed)", () => {
		// 模拟 SDK 返回不带 usage 的 result（实际 schema 上 usage 必填，此处用 cast 故意触发分支）
		const out = normalize(
			sdk("result", {
				result: {
					success: true,
					text: "",
					durationMs: 0,
					numTurns: 0,
					totalCostUsd: 0,
					stopReason: null,
				} as unknown as AgentSDKStreamEvent["result"],
			}),
			make,
		);
		expect(out).toHaveLength(1);
		expect((out[0] as AgentResultEvent).type).toBe("result");
		expect((out[0] as AgentResultEvent).reason).toBe("completed");
	});

	it("result with usage → usage + result", () => {
		const out = normalize(
			sdk("result", {
				result: {
					success: true,
					text: "",
					durationMs: 0,
					numTurns: 0,
					totalCostUsd: 0,
					stopReason: null,
					usage: {
						inputTokens: 10,
						outputTokens: 20,
						cacheReadInputTokens: 5,
						cacheCreationInputTokens: 3,
					},
				},
			}),
			make,
		);
		expect(out).toHaveLength(2);
		const usage = out[0] as AgentUsageEvent;
		expect(usage.type).toBe("usage");
		expect(usage.inputTokens).toBe(10);
		expect(usage.outputTokens).toBe(20);
		expect(usage.cacheReadTokens).toBe(5);
		expect(usage.cacheWriteTokens).toBe(3);
		expect((out[1] as AgentResultEvent).type).toBe("result");
	});

	it("result with success=false → reason=error", () => {
		const out = normalize(
			sdk("result", {
				result: {
					success: false,
					text: "",
					durationMs: 0,
					numTurns: 0,
					totalCostUsd: 0,
					stopReason: null,
					usage: {
						inputTokens: 0,
						outputTokens: 0,
					},
				},
			}),
			make,
		);
		const last = out[out.length - 1] as AgentResultEvent;
		expect(last.reason).toBe("error");
	});

	it("error → fatal AgentErrorEvent", () => {
		const out = normalize(sdk("error", { error: "boom" }), make);
		const ev = out[0] as AgentErrorEvent;
		expect(ev.type).toBe("error");
		expect(ev.fatal).toBe(true);
		expect(ev.message).toBe("boom");
	});

	it("seq monotonically increasing across normalize calls", () => {
		const localMake = makeBase() as (
			p: { type: AgentRuntimeStreamEvent["type"] } & Record<string, unknown>,
		) => AgentRuntimeStreamEvent;
		const a = normalize(sdk("init"), localMake);
		const b = normalize(sdk("chunk", { content: "x" }), localMake);
		const c = normalize(sdk("chunk", { content: "y" }), localMake);
		expect(a[0].seq).toBe(0);
		expect(b[0].seq).toBe(1);
		expect(c[0].seq).toBe(2);
	});
});
