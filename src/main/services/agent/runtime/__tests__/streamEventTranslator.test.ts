// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ChatToRuntimeTranslator } from "../streamEventTranslator";
import type { ChatStreamEvent } from "../../../../ipc/types";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

function collect(events: ChatStreamEvent[]): AgentRuntimeStreamEvent[] {
	const t = new ChatToRuntimeTranslator({
		requestId: "r1",
		conversationId: "c1",
	});
	const out: AgentRuntimeStreamEvent[] = [];
	for (const ev of events) out.push(...t.translate(ev));
	out.push(...t.finalize());
	return out;
}

type PartEvent = Extract<
	AgentRuntimeStreamEvent,
	{ type: "assistant.part" }
>["partEvent"];

/**
 * Fold the streaming assistant.part event sequence into the FINAL state of
 * each part (keyed by partId / start-order). part_start seeds the part,
 * part_delta appends content (string deltas onto code_block/text), part_update
 * shallow-merges its patch (this is how a streaming code_block gets
 * re-classified to table/tree/sources/artifact on fence close), part_done
 * sets state:"complete".
 */
function finalParts(events: AgentRuntimeStreamEvent[]): Record<string, unknown> {
	const parts: Record<string, unknown> = {};
	const order: string[] = [];
	for (const ev of events) {
		if (ev.type !== "assistant.part") continue;
		const pe = (ev as { partEvent: PartEvent }).partEvent;
		if (pe.type === "assistant.part_start" && pe.part) {
			parts[pe.part.id] = { ...pe.part };
			order.push(pe.part.id);
		} else if (pe.type === "assistant.part_delta") {
			const existing = parts[pe.partId] as { content?: string } | undefined;
			if (existing && typeof existing.content === "string" && typeof pe.delta === "string") {
				existing.content = existing.content + pe.delta;
			}
		} else if (pe.type === "assistant.part_update") {
			// parts[pe.partId] may be undefined if an update arrives without a
			// preceding start (defensive); the ?? {} is required for safety.
			// eslint-disable-next-line unicorn/no-useless-fallback-in-spread
			parts[pe.partId] = { ...(parts[pe.partId] ?? {}), ...pe.patch };
		} else if (pe.type === "assistant.part_done") {
			parts[pe.partId] = {
				// eslint-disable-next-line unicorn/no-useless-fallback-in-spread
				...(parts[pe.partId] ?? {}),
				// eslint-disable-next-line unicorn/no-useless-fallback-in-spread
				...(pe.patch ?? {}),
				state: "complete",
			};
		}
	}
	// Return in start-order as an array.
	return Object.fromEntries(order.map((id) => [id, parts[id]]));
}

/** Convenience: the final parts as an array (start-order). */
function finalPartsArray(events: AgentRuntimeStreamEvent[]): unknown[] {
	const map = finalParts(events) as Record<string, unknown>;
	return Object.values(map);
}

describe("ChatToRuntimeTranslator", () => {
	it("emits init first then text.delta + message.final + result on chunk→done", () => {
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "Hi" },
			{ requestId: "r1", type: "chunk", content: " there" },
			{
				requestId: "r1",
				type: "done",
				usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
			},
		]);
		const types = out.map((e) => e.type);
		expect(types[0]).toBe("init");
		expect(types).toContain("text.delta");
		expect(types).toContain("message.final");
		expect(types).toContain("usage");
		expect(types).toContain("result");
		const finalEv = out.find((e) => e.type === "message.final") as {
			text: string;
		};
		expect(finalEv.text).toBe("Hi there");
	});

	it("seq is monotone from 0", () => {
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "a" },
			{ requestId: "r1", type: "chunk", content: "b" },
			{ requestId: "r1", type: "done" },
		]);
		out.forEach((e, i) => expect((e as { seq: number }).seq).toBe(i));
	});

	it("emits structured assistant parts for fenced code, json, and diff blocks", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				content: [
					"Here are artifacts.",
					"```ts",
					"const value = 1;",
					"```",
					"```json",
					"{\"ok\":true}",
					"```",
					"```diff",
					"diff --git a/a.txt b/a.txt",
					"--- a/a.txt",
					"+++ b/a.txt",
					"@@ -1 +1 @@",
					"-old",
					"+new",
					"```",
				].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);

		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: { type: string };
		}>;
		// Each fence emits a part_start on open + a part_update (re-classify or
		// finalize-as-code_block) + a part_done on close. Deltas appear only
		// when content crossed a line boundary before the close.
		const starts = partEvents.filter((e) => e.partEvent.type === "assistant.part_start");
		expect(starts).toHaveLength(3);
		expect(partEvents.some((e) => e.partEvent.type === "assistant.part_done")).toBe(true);
		// Final parts (after folding start + update + done) carry the
		// structured type, not the streaming code_block placeholder.
		const finals = finalPartsArray(out) as Array<{
			type: string;
			language?: string;
			value?: unknown;
			files?: unknown[];
		}>;
		expect(finals).toHaveLength(3);
		expect(finals[0]).toMatchObject({ type: "code_block", language: "ts" });
		expect(finals[1]).toMatchObject({ type: "data", value: { ok: true } });
		expect(finals[2]).toMatchObject({ type: "diff" });
		expect(finals[2]?.files).toHaveLength(1);
	});

	it("emits a table part from a markdown-table fence", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				content: [
					"```table",
					"| name | age |",
					"| --- | --- |",
					"| Ada | 36 |",
					"| Bob | 24 |",
					"```",
				].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);
		const part = finalPartsArray(out)[0] as {
			type: string;
			columns?: string[];
			rows?: unknown[][];
		};
		expect(part).toMatchObject({ type: "table" });
		expect(part.columns).toEqual(["name", "age"]);
		expect(part.rows).toEqual([
			["Ada", "36"],
			["Bob", "24"],
		]);
	});

	it("emits a tree part from an indented fence", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				content: [
					"```tree",
					"src/",
					"  index.ts",
					"  lib/",
					"    utils.ts",
					"```",
				].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);
		const part = finalPartsArray(out)[0] as {
			type: string;
			nodes?: Array<{ id: string; label: string; parentId?: string }>;
		};
		expect(part).toMatchObject({ type: "tree" });
		expect(part.nodes).toHaveLength(4);
		expect(part.nodes?.[0]).toMatchObject({ id: "node-0", label: "src/" });
		expect(part.nodes?.[0]?.parentId).toBeUndefined();
		// index.ts + lib/ are children of src/ (node-0)
		expect(part.nodes?.[1]).toMatchObject({ id: "node-1", parentId: "node-0" });
		expect(part.nodes?.[2]).toMatchObject({ id: "node-2", parentId: "node-0" });
		// utils.ts is child of lib/ (node-2)
		expect(part.nodes?.[3]).toMatchObject({ id: "node-3", parentId: "node-2" });
	});

	it("emits a sources part from a markdown-list fence", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				content: [
					"```sources",
					"- [Google](https://google.com)",
					"- /etc/hosts",
					"- Plain note",
					"```",
				].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);
		const part = finalPartsArray(out)[0] as {
			type: string;
			sources?: Array<{ id: string; title?: string; url?: string; path?: string; sourceType?: string }>;
		};
		expect(part).toMatchObject({ type: "sources" });
		expect(part.sources).toHaveLength(3);
		expect(part.sources?.[0]).toMatchObject({
			title: "Google",
			url: "https://google.com",
			sourceType: "web",
		});
		expect(part.sources?.[1]).toMatchObject({
			path: "/etc/hosts",
			sourceType: "file",
		});
		expect(part.sources?.[2]).toMatchObject({
			title: "Plain note",
			sourceType: "unknown",
		});
	});

	it("emits an artifact part from a JSON fence", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				content: [
					"```artifact",
					JSON.stringify({
						artifactId: "art-1",
						type: "markdown",
						title: "Notes",
						preview: "# hi",
					}),
					"```",
				].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);
		const part = finalPartsArray(out)[0] as {
			type: string;
			artifactId?: string;
			artifactType?: string;
			title?: string;
			preview?: string;
		};
		expect(part).toMatchObject({
			type: "artifact",
			artifactId: "art-1",
			artifactType: "markdown",
			title: "Notes",
			preview: "# hi",
		});
	});

	it("falls back to code_block when a table fence body is malformed", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				// Missing the |---| separator row → parseTable returns null.
				content: ["```table", "| name | age |", "| Ada | 36 |", "```"].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);
		const part = finalPartsArray(out)[0] as { type: string; language?: string };
		expect(part.type).toBe("code_block");
		expect(part.language).toBe("table");
	});

	it("falls back to code_block when an artifact JSON is invalid", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				content: ["```artifact", "{not valid json", "```"].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);
		const part = finalPartsArray(out)[0] as { type: string; language?: string };
		expect(part.type).toBe("code_block");
		expect(part.language).toBe("artifact");
	});

	it("tool_call → tool.call with parsed input", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "tool_call",
				toolCall: { id: "tc1", name: "Read", arguments: '{"path":"x.ts"}' },
			},
			{
				requestId: "r1",
				type: "tool_result",
				toolResult: {
					toolCallId: "tc1",
					name: "Read",
					result: "file content",
					duration: 5,
				},
			},
			{ requestId: "r1", type: "done" },
		]);
		const call = out.find((e) => e.type === "tool.call") as {
			callId: string;
			toolName: string;
			input: { path: string };
		};
		expect(call.toolName).toBe("Read");
		expect(call.input.path).toBe("x.ts");
		const result = out.find((e) => e.type === "tool.result") as {
			callId: string;
			isError: boolean;
			content: { kind: string; text: string };
		};
		expect(result.callId).toBe("tc1");
		expect(result.isError).toBe(false);
		expect(result.content.kind).toBe("text");
		expect(result.content.text).toBe("file content");
	});

	it("tool_error → tool.result with isError:true and ErrorResult content", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "tool_error",
				toolError: { toolCallId: "tc2", name: "Bash", error: "boom" },
			},
			{ requestId: "r1", type: "done" },
		]);
		const result = out.find((e) => e.type === "tool.result") as {
			isError: boolean;
			content: { kind: string; message: string };
		};
		expect(result.isError).toBe(true);
		expect(result.content.kind).toBe("error");
		expect(result.content.message).toBe("boom");
	});

	it("tool_approval_request → permission.request", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "tool_approval_request",
				toolApproval: {
					toolCallId: "tc3",
					name: "Bash",
					arguments: '{"command":"rm -rf /tmp/x"}',
				},
			},
			{ requestId: "r1", type: "done" },
		]);
		const perm = out.find((e) => e.type === "permission.request") as {
			approvalId: string;
			toolName: string;
		};
		expect(perm).toBeDefined();
		expect(perm.approvalId).toBe("tc3");
		expect(perm.toolName).toBe("Bash");
	});

	it("error → error event with fatal:true", () => {
		const out = collect([
			{ requestId: "r1", type: "error", error: "model crashed" },
		]);
		const err = out.find((e) => e.type === "error") as {
			fatal: boolean;
			message: string;
		};
		expect(err).toBeDefined();
		expect(err.fatal).toBe(true);
		expect(err.message).toBe("model crashed");
	});

	it("stream without `done` emits synthetic cancelled result on finalize", () => {
		const out = collect([{ requestId: "r1", type: "chunk", content: "Hi" }]);
		const result = out.find((e) => e.type === "result") as { reason: string };
		expect(result).toBeDefined();
		expect(result.reason).toBe("cancelled");
	});

	it("tool_rejected is silently swallowed (precedng tool_error covers it)", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "tool_rejected",
				toolResult: {
					toolCallId: "tc4",
					name: "Bash",
					result: "rejected",
				},
			},
			{ requestId: "r1", type: "done" },
		]);
		// No tool.result event from this branch alone
		const toolResults = out.filter((e) => e.type === "tool.result");
		expect(toolResults).toHaveLength(0);
	});

	it("every event carries v:1, requestId, conversationId, runtime, timestamp", () => {
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "x" },
			{ requestId: "r1", type: "done" },
		]);
		for (const ev of out) {
			expect((ev as { v: number }).v).toBe(1);
			expect((ev as { requestId: string }).requestId).toBe("r1");
			expect((ev as { conversationId: string }).conversationId).toBe("c1");
			expect((ev as { runtime: string }).runtime).toBe("llm-loop");
			expect(typeof (ev as { timestamp: number }).timestamp).toBe("number");
		}
	});

	// ── Streaming fence state machine (plan task E1) ────────────────────
	// These cover the new streaming behavior: fences emit part_start on
	// open, throttled part_delta as content arrives across chunk boundaries,
	// and a re-classifying part_update + part_done on close.

	it("streams a fence across multiple chunks: start → delta → update → done", () => {
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "```table\n" },
			{ requestId: "r1", type: "chunk", content: "| a | b |\n" },
			{ requestId: "r1", type: "chunk", content: "| --- | --- |\n" },
			{ requestId: "r1", type: "chunk", content: "| 1 | 2 |\n" },
			{ requestId: "r1", type: "chunk", content: "```" },
			{ requestId: "r1", type: "done" },
		]);
		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: { type: string; part?: { type: string }; delta?: unknown };
		}>;
		const seq = partEvents.map((e) => e.partEvent.type);
		// Opens with part_start (as code_block), emits one or more part_delta
		// as content crosses line boundaries, then re-classifies via
		// part_update and closes with part_done.
		expect(seq[0]).toBe("assistant.part_start");
		expect(seq.filter((t) => t === "assistant.part_delta").length).toBeGreaterThan(0);
		expect(seq).toContain("assistant.part_update");
		expect(seq[seq.length - 1]).toBe("assistant.part_done");
		// part_start carries the code_block placeholder (streaming state).
		expect(partEvents[0]?.partEvent.part?.type).toBe("code_block");
		// After folding, the final part is re-classified to table.
		const final = finalPartsArray(out)[0] as { type: string; columns?: string[] };
		expect(final.type).toBe("table");
		expect(final.columns).toEqual(["a", "b"]);
	});

	it("throttles part_delta by line boundary, not per chunk", () => {
		// Feed many small chunks (simulating per-token arrival) within a single
		// line — no newline until the end. The producer should NOT emit a delta
		// per chunk; it flushes only when a line boundary is crossed.
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "```ts\n" },
			...["const ", "x ", "= ", "1;"].map((c) => ({
				requestId: "r1",
				type: "chunk" as const,
				content: c,
			})),
			{ requestId: "r1", type: "chunk", content: "\n" },
			{ requestId: "r1", type: "chunk", content: "```" },
			{ requestId: "r1", type: "done" },
		]);
		const deltas = out.filter(
			(e) =>
				e.type === "assistant.part" &&
				(e as { partEvent: { type: string } }).partEvent.type === "assistant.part_delta",
		);
		// Exactly one delta for the single line — not one per token chunk.
		expect(deltas).toHaveLength(1);
		const delta = (deltas[0] as { partEvent: { delta: string } }).partEvent.delta;
		expect(delta).toBe("const x = 1;\n");
	});

	it("part_start carries code_block during streaming; close re-classifies to table", () => {
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "```table\n| a |\n| --- |\n| 1 |\n```" },
			{ requestId: "r1", type: "done" },
		]);
		const start = out.find(
			(e) =>
				e.type === "assistant.part" &&
				(e as { partEvent: { type: string } }).partEvent.type === "assistant.part_start",
		) as { partEvent: { part: { type: string; state: string } } } | undefined;
		expect(start?.partEvent.part.type).toBe("code_block");
		expect(start?.partEvent.part.state).toBe("streaming");
		// Final folded state is the structured table.
		expect((finalPartsArray(out)[0] as { type: string }).type).toBe("table");
	});

	it("finalizes an unterminated fence at done (stream ended mid-fence)", () => {
		// Fence opens but never closes before `done`. The producer should
		// still finalize it: flush content, attempt re-classify, emit done.
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "```ts\nconst x = 1;\n" },
			{ requestId: "r1", type: "done" },
		]);
		const finals = finalPartsArray(out) as Array<{ type: string; completeFence?: boolean }>;
		expect(finals).toHaveLength(1);
		expect(finals[0].type).toBe("code_block");
		// Unterminated → completeFence stays false (the ``` never arrived).
		expect(finals[0].completeFence).toBe(false);
	});

	it("resumes outside-fence scanning after a fence closes (two consecutive fences)", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "chunk",
				content: ["```ts", "a", "```", "```json", "{\"ok\":true}", "```"].join("\n"),
			},
			{ requestId: "r1", type: "done" },
		]);
		const starts = out.filter(
			(e) =>
				e.type === "assistant.part" &&
				(e as { partEvent: { type: string } }).partEvent.type === "assistant.part_start",
		);
		expect(starts).toHaveLength(2);
		const finals = finalPartsArray(out) as Array<{ type: string }>;
		expect(finals.map((p) => p.type)).toEqual(["code_block", "data"]);
	});
});
