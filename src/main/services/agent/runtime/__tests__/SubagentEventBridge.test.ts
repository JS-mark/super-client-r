// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AgentProductEvent } from "@super-client/shared-types/agent-product-events";

import { SubagentEventBridge } from "../SubagentEventBridge";

interface Emitted {
	event: AgentProductEvent;
	ctx: { sessionId: string; projectId?: string | null; parentAssistantMessageId?: string };
}

function harness(startTs = 1_000) {
	const emitted: Emitted[] = [];
	let now = startTs;
	const bridge = new SubagentEventBridge({
		emitSubagentEvent: (event, ctx) => {
			emitted.push({ event, ctx });
		},
		now: () => now,
	});
	return {
		bridge,
		emitted,
		tick(ms = 10) {
			now += ms;
		},
	};
}

describe("SubagentEventBridge", () => {
	it("spawn() emits a well-formed subagent.spawned event", () => {
		const h = harness(500);
		h.bridge.spawn({
			parentRunId: "parent-req-1",
			subagentRunId: "sub-1",
			sessionId: "conv-1",
			projectId: "proj-1",
			parentAssistantMessageId: "msg-parent-1",
			profile: { id: "builtin_programmer", name: "Programmer" },
			taskGoal: "find callers of foo",
		});

		expect(h.emitted).toHaveLength(1);
		const [{ event, ctx }] = h.emitted;
		expect(event.type).toBe("subagent.spawned");
		expect(event.subagentRunId).toBe("sub-1");
		expect(event.parentRunId).toBe("parent-req-1");
		expect(event.sessionId).toBe("conv-1");
		expect(event.projectId).toBe("proj-1");
		expect(event.persist).toBe(true);
		if (event.type === "subagent.spawned") {
			expect(event.payload.run).toMatchObject({
				subagentRunId: "sub-1",
				parentRunId: "parent-req-1",
				parentAssistantMessageId: "msg-parent-1",
				profileId: "builtin_programmer",
				profileName: "Programmer",
				taskGoal: "find callers of foo",
				status: "spawned",
				startedAt: 500,
			});
		}
		expect(ctx.parentAssistantMessageId).toBe("msg-parent-1");
	});

	it("update() emits subagent.updated with patch payload and unique eventIds per call", () => {
		const h = harness();
		h.bridge.spawn({
			parentRunId: "p",
			subagentRunId: "sub-1",
			sessionId: "conv-1",
			taskGoal: "goal",
		});
		h.tick();
		h.bridge.update("sub-1", { status: "running", toolCallCount: 1 });
		h.tick();
		h.bridge.update("sub-1", { toolCallCount: 2 });

		const updates = h.emitted.filter((e) => e.event.type === "subagent.updated");
		expect(updates).toHaveLength(2);
		if (updates[0].event.type === "subagent.updated") {
			expect(updates[0].event.payload.subagentRunId).toBe("sub-1");
			expect(updates[0].event.payload.patch).toEqual({
				status: "running",
				toolCallCount: 1,
			});
		}
		// Different eventIds so the JSONL log doesn't dedupe repeated updates.
		expect(updates[0].event.eventId).not.toBe(updates[1].event.eventId);
	});

	it("complete() emits subagent.completed with summary + tokenUsage and drops registration", () => {
		const h = harness();
		h.bridge.spawn({
			parentRunId: "p",
			subagentRunId: "sub-1",
			sessionId: "conv-1",
			taskGoal: "goal",
		});
		h.tick(50);
		h.bridge.complete("sub-1", {
			summary: "found 3 callers",
			tokenUsage: { input: 100, output: 42 },
			toolCallCount: 7,
			resultRef: "content-ref-abc",
		});

		const completed = h.emitted.find((e) => e.event.type === "subagent.completed");
		expect(completed).toBeDefined();
		if (completed && completed.event.type === "subagent.completed") {
			expect(completed.event.payload.subagentRunId).toBe("sub-1");
			expect(completed.event.payload.summary).toBe("found 3 callers");
			expect(completed.event.payload.tokenUsage).toEqual({ input: 100, output: 42 });
			expect(completed.event.payload.toolCallCount).toBe(7);
			expect(completed.event.payload.resultRef).toBe("content-ref-abc");
			expect(completed.event.payload.endedAt).toBe(1050);
			expect(completed.event.status).toBe("completed");
		}
		expect(h.bridge.has("sub-1")).toBe(false);
	});

	it("fail() emits subagent.failed with errorMessage + endedAt", () => {
		const h = harness();
		h.bridge.spawn({
			parentRunId: "p",
			subagentRunId: "sub-1",
			sessionId: "conv-1",
			taskGoal: "goal",
		});
		h.tick(30);
		h.bridge.fail("sub-1", "boom: subagent HTTP 500");

		const failed = h.emitted.find((e) => e.event.type === "subagent.failed");
		expect(failed).toBeDefined();
		if (failed && failed.event.type === "subagent.failed") {
			expect(failed.event.payload.subagentRunId).toBe("sub-1");
			expect(failed.event.payload.errorMessage).toBe("boom: subagent HTTP 500");
			expect(failed.event.payload.endedAt).toBe(1030);
			expect(failed.event.status).toBe("error");
		}
		expect(h.bridge.has("sub-1")).toBe(false);
	});

	it("eventIds are deterministic based on subagentRunId + phase", () => {
		const h1 = harness();
		const h2 = harness();
		h1.bridge.spawn({
			parentRunId: "p",
			subagentRunId: "sub-XYZ",
			sessionId: "conv-1",
			taskGoal: "goal",
		});
		h2.bridge.spawn({
			parentRunId: "p",
			subagentRunId: "sub-XYZ",
			sessionId: "conv-1",
			taskGoal: "goal",
		});
		expect(h1.emitted[0].event.eventId).toBe(h2.emitted[0].event.eventId);
		// completed/failed share the same deterministic recipe
		h1.bridge.complete("sub-XYZ");
		h2.bridge.fail("sub-XYZ", "err");
		const c = h1.emitted.find((e) => e.event.type === "subagent.completed");
		const f = h2.emitted.find((e) => e.event.type === "subagent.failed");
		expect(c?.event.eventId).toMatch(/^subagent:completed:sub-XYZ/);
		expect(f?.event.eventId).toMatch(/^subagent:failed:sub-XYZ/);
	});

	it("spawn() is idempotent per subagentRunId", () => {
		const h = harness();
		const spawnArgs = {
			parentRunId: "p",
			subagentRunId: "sub-1",
			sessionId: "conv-1",
			taskGoal: "goal",
		};
		h.bridge.spawn(spawnArgs);
		h.bridge.spawn(spawnArgs);
		expect(h.emitted.filter((e) => e.event.type === "subagent.spawned")).toHaveLength(1);
	});

	it("update()/complete()/fail() on unknown subagentRunId is a no-op", () => {
		const emit = vi.fn();
		const bridge = new SubagentEventBridge({ emitSubagentEvent: emit });
		bridge.update("ghost", { status: "running" });
		bridge.complete("ghost");
		bridge.fail("ghost", "err");
		expect(emit).not.toHaveBeenCalled();
	});
});
