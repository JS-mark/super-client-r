// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSSEStream } from "../sseClient";

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	let i = 0;
	return new ReadableStream({
		pull(ctrl) {
			if (i < chunks.length) ctrl.enqueue(enc.encode(chunks[i++]));
			else ctrl.close();
		},
	});
}

describe("parseSSEStream", () => {
	it("parses event:/data: frames separated by blank line", async () => {
		const s = toStream([
			'event: chunk\ndata: {"content":"Hi"}\n\n',
			'event: done\ndata: {"requestId":"r1"}\n\n',
		]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const frame of parseSSEStream(s)) out.push(frame);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ event: "chunk", data: { content: "Hi" } });
		expect(out[1]).toEqual({ event: "done", data: { requestId: "r1" } });
	});

	it("handles frames split mid-chunk across reader pulls", async () => {
		const s = toStream(["event: chunk\nda", 'ta: {"x":1}\n\n']);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([{ event: "chunk", data: { x: 1 } }]);
	});

	it("defaults event name to 'message' when missing", async () => {
		const s = toStream(['data: {"a":1}\n\n']);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out[0].event).toBe("message");
	});

	it("skips malformed JSON without throwing", async () => {
		const s = toStream(["event: chunk\ndata: not-json\n\n"]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([]);
	});

	it("handles multi-line data fields (concatenates)", async () => {
		const s = toStream(['event: chunk\ndata: {\ndata: "x":1}\n\n']);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([{ event: "chunk", data: { x: 1 } }]);
	});

	it("returns cleanly on empty stream", async () => {
		const s = toStream([]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([]);
	});

	it("ignores comment lines (starting with ':')", async () => {
		const s = toStream([
			': keepalive\n\n',
			'event: chunk\ndata: {"x":1}\n\n',
		]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([{ event: "chunk", data: { x: 1 } }]);
	});
});
