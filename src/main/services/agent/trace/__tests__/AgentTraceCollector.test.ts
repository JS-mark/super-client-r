// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

import { AgentTraceCollector } from "../AgentTraceCollector";

const baseEvent = {
	v: 1 as const,
	requestId: "req-1",
	conversationId: "conv-1",
	seq: 0,
	runtime: "claude-sdk" as const,
	timestamp: 0,
};

function ev(
	overrides: Partial<AgentRuntimeStreamEvent> & {
		type: AgentRuntimeStreamEvent["type"];
	},
): AgentRuntimeStreamEvent {
	// 类型上偷个懒；测试里我们不关心字段完整性
	return { ...baseEvent, ...overrides } as AgentRuntimeStreamEvent;
}

describe("AgentTraceCollector", () => {
	it("collects events through lifecycle and lists summary", () => {
		const c = new AgentTraceCollector();
		c.begin({
			requestId: "req-1",
			conversationId: "conv-1",
			runtimeId: "claude-sdk",
			prompt: { kind: "text", text: "hello" },
			startedAt: 1000,
		});
		c.record("req-1", {
			kind: "event",
			payload: { kind: "event", event: ev({ type: "init", model: "m" }) },
		});
		c.record("req-1", {
			kind: "event",
			payload: {
				kind: "event",
				event: ev({ type: "text.delta", messageId: "m1", delta: "hi" }),
			},
		});
		c.record("req-1", {
			kind: "event",
			payload: {
				kind: "event",
				event: ev({
					type: "tool.call",
					callId: "t1",
					toolName: "fs__read",
					input: {},
				}),
			},
		});
		c.finish("req-1", "completed");

		const list = c.list();
		expect(list).toHaveLength(1);
		expect(list[0].status).toBe("completed");
		expect(list[0].totals.events).toBe(3);
		expect(list[0].totals.textDeltas).toBe(1);
		expect(list[0].totals.toolCalls).toBe(1);
		expect(list[0].promptPreview).toBe("hello");
		expect(list[0].model).toBe("m");
	});

	it("ring buffer evicts oldest when overflowing", () => {
		const c = new AgentTraceCollector({ config: { ringBufferSize: 2 } });
		for (let i = 0; i < 4; i++) {
			c.begin({
				requestId: `r-${i}`,
				conversationId: `conv-${i}`,
				runtimeId: "claude-sdk",
				prompt: { kind: "text", text: `t${i}` },
				startedAt: 1000 + i,
			});
			c.finish(`r-${i}`, "completed");
		}
		const ids = c.list().map((s) => s.requestId);
		expect(ids).toEqual(["r-3", "r-2"]); // sorted desc by startedAt
	});

	it("filters by conversationId, status, and q", () => {
		const c = new AgentTraceCollector();
		c.begin({
			requestId: "a",
			conversationId: "conv-A",
			runtimeId: "claude-sdk",
			prompt: { kind: "text", text: "alpha" },
			startedAt: 100,
		});
		c.finish("a", "completed");
		c.begin({
			requestId: "b",
			conversationId: "conv-B",
			runtimeId: "llm-loop",
			prompt: { kind: "text", text: "beta" },
			startedAt: 200,
		});
		c.record("b", {
			kind: "event",
			payload: {
				kind: "event",
				event: ev({
					type: "error",
					fatal: false,
					code: "X",
					message: "BoOm",
				}),
			},
		});
		c.finish("b", "errored");

		expect(
			c.list({ conversationId: "conv-A" }).map((s) => s.requestId),
		).toEqual(["a"]);
		expect(c.list({ status: "errored" }).map((s) => s.requestId)).toEqual([
			"b",
		]);
		expect(c.list({ q: "boom" }).map((s) => s.requestId)).toEqual(["b"]);
		expect(c.list({ q: "alpha" }).map((s) => s.requestId)).toEqual(["a"]);
	});

	it("subscribe receives summary updates", () => {
		const c = new AgentTraceCollector();
		const seen: string[] = [];
		const off = c.subscribe((s) => seen.push(`${s.requestId}:${s.status}`));
		c.begin({
			requestId: "x",
			conversationId: "conv",
			runtimeId: "claude-sdk",
			prompt: { kind: "text", text: "" },
		});
		c.finish("x", "completed");
		off();
		c.begin({
			requestId: "y",
			conversationId: "conv",
			runtimeId: "claude-sdk",
			prompt: { kind: "text", text: "" },
		});
		c.finish("y", "completed");

		expect(seen).toContain("x:running");
		expect(seen).toContain("x:completed");
		expect(seen.find((s) => s.startsWith("y:"))).toBeUndefined();
	});

	it("get returns active before ring", () => {
		const c = new AgentTraceCollector();
		c.begin({
			requestId: "p",
			conversationId: "conv",
			runtimeId: "claude-sdk",
			prompt: { kind: "text", text: "" },
		});
		expect(c.get("p")?.status).toBe("running");
		c.finish("p", "completed");
		expect(c.get("p")?.status).toBe("completed");
	});

	it("respects maxEventsPerTrace by accumulating totals only", () => {
		const c = new AgentTraceCollector({ config: { maxEventsPerTrace: 2 } });
		c.begin({
			requestId: "z",
			conversationId: "conv",
			runtimeId: "claude-sdk",
			prompt: { kind: "text", text: "" },
		});
		for (let i = 0; i < 5; i++) {
			c.record("z", {
				kind: "event",
				payload: {
					kind: "event",
					event: ev({
						type: "text.delta",
						messageId: "m",
						delta: `d${i}`,
					}),
				},
			});
		}
		const got = c.get("z");
		expect(got?.events).toHaveLength(2);
		expect(got?.totals.events).toBe(5);
		expect(got?.totals.textDeltas).toBe(5);
	});
});
