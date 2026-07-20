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
			partEvent: {
				type: string;
				part?: { type: string; language?: string; value?: unknown; files?: unknown[] };
				partId?: string;
			};
		}>;
		expect(partEvents.map((e) => e.partEvent.type)).toEqual([
			"assistant.part_start",
			"assistant.part_done",
			"assistant.part_start",
			"assistant.part_done",
			"assistant.part_start",
			"assistant.part_done",
		]);
		const started = partEvents
			.map((e) => e.partEvent.part)
			.filter(Boolean) as Array<{
			type: string;
			language?: string;
			value?: unknown;
			files?: unknown[];
		}>;
		expect(started[0]).toMatchObject({ type: "code_block", language: "ts" });
		expect(started[1]).toMatchObject({ type: "data", value: { ok: true } });
		expect(started[2]).toMatchObject({ type: "diff" });
		expect(started[2]?.files).toHaveLength(1);
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
		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: { type: string; part?: { type: string; columns?: string[]; rows?: unknown[][] } };
		}>;
		expect(partEvents.map((e) => e.partEvent.type)).toEqual([
			"assistant.part_start",
			"assistant.part_done",
		]);
		const part = partEvents[0]?.partEvent.part;
		expect(part).toMatchObject({ type: "table" });
		expect(part?.columns).toEqual(["name", "age"]);
		expect(part?.rows).toEqual([
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
		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: {
				type: string;
				part?: { type: string; nodes?: Array<{ id: string; label: string; parentId?: string }> };
			};
		}>;
		const part = partEvents[0]?.partEvent.part;
		expect(part).toMatchObject({ type: "tree" });
		expect(part?.nodes).toHaveLength(4);
		expect(part?.nodes?.[0]).toMatchObject({ id: "node-0", label: "src/" });
		expect(part?.nodes?.[0]?.parentId).toBeUndefined();
		// index.ts + lib/ are children of src/ (node-0)
		expect(part?.nodes?.[1]).toMatchObject({ id: "node-1", parentId: "node-0" });
		expect(part?.nodes?.[2]).toMatchObject({ id: "node-2", parentId: "node-0" });
		// utils.ts is child of lib/ (node-2)
		expect(part?.nodes?.[3]).toMatchObject({ id: "node-3", parentId: "node-2" });
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
		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: {
				type: string;
				part?: {
					type: string;
					sources?: Array<{ id: string; title?: string; url?: string; path?: string; sourceType?: string }>;
				};
			};
		}>;
		const part = partEvents[0]?.partEvent.part;
		expect(part).toMatchObject({ type: "sources" });
		expect(part?.sources).toHaveLength(3);
		expect(part?.sources?.[0]).toMatchObject({
			title: "Google",
			url: "https://google.com",
			sourceType: "web",
		});
		expect(part?.sources?.[1]).toMatchObject({
			path: "/etc/hosts",
			sourceType: "file",
		});
		expect(part?.sources?.[2]).toMatchObject({
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
		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: {
				type: string;
				part?: {
					type: string;
					artifactId?: string;
					artifactType?: string;
					title?: string;
					preview?: string;
				};
			};
		}>;
		const part = partEvents[0]?.partEvent.part;
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
		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: { part?: { type: string; language?: string } };
		}>;
		expect(partEvents[0]?.partEvent.part?.type).toBe("code_block");
		expect(partEvents[0]?.partEvent.part?.language).toBe("table");
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
		const partEvents = out.filter((e) => e.type === "assistant.part") as Array<{
			type: "assistant.part";
			partEvent: { part?: { type: string; language?: string } };
		}>;
		expect(partEvents[0]?.partEvent.part?.type).toBe("code_block");
		expect(partEvents[0]?.partEvent.part?.language).toBe("artifact");
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
});
