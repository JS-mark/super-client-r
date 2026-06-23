// @vitest-environment node
import { describe, expect, it } from "vitest";
import { drainFullStream } from "../streamEventBridge";
import type { ChatStreamEvent } from "../../../ipc/types";

async function* textStream() {
	yield { type: "text-delta", delta: "Hel" } as const;
	yield { type: "text-delta", delta: "lo" } as const;
	yield {
		type: "finish",
		finishReason: "stop",
		usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
	} as const;
}

describe("drainFullStream", () => {
	it("emits chunk events for text-delta and a final done with usage and timing", async () => {
		const events: ChatStreamEvent[] = [];
		await drainFullStream(textStream() as never, {
			requestId: "r1",
			broadcast: (e) => events.push(e),
			startTime: Date.now() - 100,
		});
		expect(
			events.filter((e) => e.type === "chunk").map((e) => e.content),
		).toEqual(["Hel", "lo"]);
		const done = events.find((e) => e.type === "done");
		expect(done?.usage?.totalTokens).toBe(10);
		expect(done?.timing?.firstTokenMs).toBeGreaterThanOrEqual(0);
	});

	it("emits an error event on stream errors", async () => {
		const events: ChatStreamEvent[] = [];
		async function* bad() {
			yield { type: "error", error: new Error("upstream") } as const;
		}
		await drainFullStream(bad() as never, {
			requestId: "r1",
			broadcast: (e) => events.push(e),
			startTime: Date.now(),
		});
		expect(events.find((e) => e.type === "error")?.error).toMatch(/upstream/);
	});

	it("silently halts (no done, no error) when abortSignal is aborted mid-stream", async () => {
		const events: ChatStreamEvent[] = [];
		const ac = new AbortController();
		async function* abortable() {
			yield { type: "text-delta", delta: "a" } as const;
			ac.abort();
			yield { type: "error", error: new Error("AbortError") } as const;
		}
		await drainFullStream(abortable() as never, {
			requestId: "r1",
			broadcast: (e) => events.push(e),
			startTime: Date.now(),
			abortSignal: ac.signal,
		});
		expect(events.find((e) => e.type === "chunk")?.content).toBe("a");
		expect(events.find((e) => e.type === "done")).toBeUndefined();
		expect(events.find((e) => e.type === "error")).toBeUndefined();
	});
});
