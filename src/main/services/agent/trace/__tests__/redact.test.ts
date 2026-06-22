// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
	AgentRuntimeStreamEvent,
	AgentToolCallEvent,
} from "@super-client/shared-types/agent-runtime";
import type { AgentTraceRecord } from "@super-client/shared-types/agent-trace";

import { maskApiKeysDeep, redactRecord, truncate } from "../redact";

function makeEventRecord(ev: AgentRuntimeStreamEvent): AgentTraceRecord {
	return {
		ts: 0,
		kind: "event",
		payload: { kind: "event", event: ev },
	};
}

const baseEvent = {
	v: 1 as const,
	requestId: "req-1",
	conversationId: "conv-1",
	seq: 0,
	runtime: "claude-sdk" as const,
	timestamp: 0,
};

describe("redact", () => {
	it("loose mode masks API keys but keeps prompt", () => {
		const ev: AgentRuntimeStreamEvent = {
			...baseEvent,
			type: "message.final",
			messageId: "m1",
			text: "hello sk-proj-AAAABBBBCCCCDDDDEEEEFFFFGGGG world",
		};
		const out = redactRecord(makeEventRecord(ev), "loose");
		expect(out.payload.kind).toBe("event");
		if (out.payload.kind !== "event") return;
		const final = out.payload.event;
		if (final.type !== "message.final") {
			throw new Error("expected message.final");
		}
		expect(final.text).not.toContain("sk-proj-");
		expect(final.text).toContain("***");
		expect(final.text.length).toBeGreaterThan(10); // not truncated
	});

	it("strict mode truncates message.final text", () => {
		const ev: AgentRuntimeStreamEvent = {
			...baseEvent,
			type: "message.final",
			messageId: "m1",
			text: "x".repeat(500),
		};
		const out = redactRecord(makeEventRecord(ev), "strict");
		if (out.payload.kind !== "event") throw new Error("unexpected");
		const final = out.payload.event;
		if (final.type !== "message.final") throw new Error("unexpected");
		expect(final.text).toMatch(/^x{200}…\(\d+ more\)$/);
	});

	it("off mode passes through", () => {
		const ev: AgentToolCallEvent = {
			...baseEvent,
			type: "tool.call",
			callId: "c1",
			toolName: "fs__read",
			input: { authorization: "Bearer abc-very-secret-token-1234567890" },
		};
		const out = redactRecord(makeEventRecord(ev), "off");
		if (out.payload.kind !== "event") throw new Error("unexpected");
		const c = out.payload.event;
		if (c.type !== "tool.call") throw new Error("unexpected");
		expect((c.input as { authorization: string }).authorization).toContain(
			"Bearer abc-",
		);
	});

	it("masks sensitive keys deep in objects", () => {
		const masked = maskApiKeysDeep({
			outer: {
				api_key: "sk-proj-real-thing-AAAABBBBCCCCDDDDEEEE",
				nested: [{ AUTHORIZATION: "leak-me" }],
				keep: "ok",
			},
		}) as {
			outer: {
				api_key: string;
				nested: Array<{ AUTHORIZATION: string }>;
				keep: string;
			};
		};
		expect(masked.outer.api_key).toBe("***");
		expect(masked.outer.nested[0].AUTHORIZATION).toBe("***");
		expect(masked.outer.keep).toBe("ok");
	});

	it("truncate appends count of dropped chars", () => {
		expect(truncate("abc", 10)).toBe("abc");
		expect(truncate("abcdef", 3)).toBe("abc…(3 more)");
	});
});
