// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";
import {
	adaptRuntimeEventToSdk,
	adaptSdkRequestToRuntime,
	createSdkAdapterState,
} from "../agentSdkLegacyAdapter";

describe("adaptSdkRequestToRuntime", () => {
	it("maps prompt + sessionId + cwd + model/providerId", () => {
		const signal = new AbortController().signal;
		const out = adaptSdkRequestToRuntime(
			"req-1",
			{
				prompt: "hi",
				sessionId: "conv-1",
				cwd: "/proj",
				model: "qwen-flash",
				providerId: "prov-1",
				systemPrompt: "",
				persistSession: true,
				includePartialMessages: true,
				permissionMode: "default",
			} as never,
			signal,
		);
		expect(out.requestId).toBe("req-1");
		expect(out.conversationId).toBe("conv-1");
		expect(out.prompt).toEqual({ kind: "text", text: "hi" });
		expect(out.cwd).toBe("/proj");
		expect(out.signal).toBe(signal);
		const rt = out.runtime as { model: { providerId: string; modelId: string } };
		expect(rt.model.providerId).toBe("prov-1");
		expect(rt.model.modelId).toBe("qwen-flash");
	});

	it("falls back conversationId to requestId when sessionId missing", () => {
		const out = adaptSdkRequestToRuntime(
			"req-2",
			{ prompt: "x" } as never,
			new AbortController().signal,
		);
		expect(out.conversationId).toBe("req-2");
	});
});

function base(type: AgentRuntimeStreamEvent["type"], extras: object = {}) {
	return {
		v: 1 as const,
		requestId: "r1",
		conversationId: "c1",
		seq: 0,
		runtime: "llm-loop" as const,
		timestamp: 0,
		type,
		...extras,
	} as AgentRuntimeStreamEvent;
}

describe("adaptRuntimeEventToSdk", () => {
	it("init → SDK init event with status:ok", () => {
		const out = adaptRuntimeEventToSdk(base("init"));
		expect(out).toMatchObject({ type: "init", status: "ok", sessionId: "c1" });
	});

	it("text.delta → chunk { content }", () => {
		const out = adaptRuntimeEventToSdk(base("text.delta", { delta: "Hi" }));
		expect(out).toMatchObject({ type: "chunk", content: "Hi" });
	});

	it("tool.call → tool_call with input passthrough", () => {
		const out = adaptRuntimeEventToSdk(
			base("tool.call", {
				callId: "tc1",
				toolName: "Read",
				input: { path: "x.ts" },
			}),
		);
		expect(out).toMatchObject({
			type: "tool_call",
			toolCall: { id: "tc1", name: "Read", kind: "tool" },
		});
	});

	it("tool.result success → tool_use_summary", () => {
		const out = adaptRuntimeEventToSdk(
			base("tool.result", {
				callId: "tc1",
				content: { kind: "text", text: "file content" },
				isError: false,
			}),
		);
		expect(out).toMatchObject({
			type: "tool_use_summary",
			precedingToolUseIds: ["tc1"],
			toolSummary: "file content",
		});
	});

	it("tool.result error → tool_error", () => {
		const out = adaptRuntimeEventToSdk(
			base("tool.result", {
				callId: "tc2",
				content: { kind: "error", message: "boom" },
				isError: true,
			}),
		);
		expect(out).toMatchObject({
			type: "tool_error",
			toolError: { id: "tc2", error: "boom", kind: "tool" },
		});
	});

	it("permission.request → permission_request", () => {
		const out = adaptRuntimeEventToSdk(
			base("permission.request", {
				approvalId: "tc3",
				toolName: "Bash",
				input: { command: "rm -rf /tmp/x" },
			}),
		);
		expect(out).toMatchObject({
			type: "permission_request",
			permissionRequest: { toolUseId: "tc3", toolName: "Bash" },
		});
	});

	it("result → result with success boolean", () => {
		const out = adaptRuntimeEventToSdk(
			base("result", { reason: "completed" }),
		);
		expect(out).toMatchObject({ type: "result" });
		expect(((out as { result: { success: boolean } }).result).success).toBe(true);
	});

	it("error → error event", () => {
		const out = adaptRuntimeEventToSdk(
			base("error", { fatal: true, code: "x", message: "kaput" }),
		);
		expect(out).toMatchObject({ type: "error", error: "kaput" });
	});

	it("usage / permission.resolved are silently dropped (null)", () => {
		expect(
			adaptRuntimeEventToSdk(
				base("usage", { inputTokens: 1, outputTokens: 1 }),
			),
		).toBeNull();
		expect(
			adaptRuntimeEventToSdk(
				base("permission.resolved", {
					approvalId: "tc1",
					approved: true,
					source: "user",
				}),
			),
		).toBeNull();
	});

	it("usage event populates SdkAdapterState.usage; subsequent result carries it", () => {
		const state = createSdkAdapterState();
		// usage arrives first (translator emits message.final → usage → result)
		expect(
			adaptRuntimeEventToSdk(
				base("usage", { inputTokens: 123, outputTokens: 45 }),
				state,
			),
		).toBeNull();
		expect(state.usage).toEqual({ inputTokens: 123, outputTokens: 45 });

		const out = adaptRuntimeEventToSdk(
			base("result", { reason: "completed" }),
			state,
		) as { result: { usage: { inputTokens: number; outputTokens: number }; durationMs: number } };
		expect(out.result.usage).toEqual({ inputTokens: 123, outputTokens: 45 });
		// durationMs is Date.now() - state.startedAt; both stamped just now,
		// so it lands somewhere in [0, a few ms]. Assert it's a real number
		// rather than the legacy hard-coded zero — the renderer reads this
		// to render "回答耗时 X.X s".
		expect(Number.isFinite(out.result.durationMs)).toBe(true);
		expect(out.result.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("result without state falls back to zero usage / duration (legacy default)", () => {
		const out = adaptRuntimeEventToSdk(
			base("result", { reason: "completed" }),
		) as { result: { usage: { inputTokens: number; outputTokens: number }; durationMs: number } };
		expect(out.result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
		expect(out.result.durationMs).toBe(0);
	});
});
