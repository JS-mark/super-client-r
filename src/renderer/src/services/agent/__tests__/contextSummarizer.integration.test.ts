/**
 * Integration coverage for `createContextSummarizer`.
 *
 * Unlike `contextSummarizer.test.ts`, which stubs `sseStream` directly, this
 * file exercises the REAL `sseStream` parser end-to-end. We intercept only at
 * the genuine I/O seams:
 *  - `apiService` (the Electron-IPC seam that `httpFetch` uses to resolve the
 *    local server port and Bearer key) — stubbed so `httpFetch` can build its
 *    request without a real main process.
 *  - global `fetch` — the only network seam. We return a synthetic `Response`
 *    whose `.body` is a `ReadableStream` of real SSE-formatted bytes (exactly
 *    what the production `writeEvent` emits; see localApiClient.ts:180-200).
 *
 * Because `httpFetch`, `sseStream`, `parseSseFrame`, the `\n\n` frame splitter,
 * and the `TextDecoder({stream:true})` reassembly all run unmodified, a
 * regression in the SSE parser will fail this test instead of being silently
 * swallowed by a stub.
 *
 * (Note on design: the kickoff hint suggested mocking only the `httpFetch`
 * export, but `sseStream` calls `httpFetch` via a same-module closure binding,
 * so a `vi.mock` factory on the export does not intercept the internal call in
 * this Vitest version. Mocking global `fetch` is the next-deeper seam and
 * yields strictly more real-code coverage — `httpFetch` runs for real too.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apiService", () => ({
	apiService: {
		getStatus: vi.fn(async () => ({ status: "running", port: 12345 })),
		getApiKey: vi.fn(async () => "test-api-key"),
	},
}));

const { createContextSummarizer } = await import("../contextSummarizer");

function sseResponse(text: string): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(text));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
}

describe("createContextSummarizer integration via real SSE parser", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("parses real SSE frames from fetch and joins chunk content", async () => {
		// Exactly the frame format `writeEvent` produces server-side: blank-line
		// separated `data:` lines whose payloads are `{type, content}` JSON.
		const sseText = [
			'data: {"type":"chunk","content":"First "}',
			"",
			'data: {"type":"chunk","content":"part"}',
			"",
			'data: {"type":"done"}',
			"",
			"",
		].join("\n");
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(sseResponse(sseText));

		const summarize = createContextSummarizer({
			provider: {
				baseUrl: "https://provider.test/v1",
				apiKey: "sk-test",
				preset: "openai",
				apiFormat: "chat-completions",
			},
			model: { id: "gpt-test" },
			conversationId: "session-1",
			requestId: "req-1",
		});

		await expect(
			summarize?.({
				text: "user: hello\nassistant: world",
				originalCount: 2,
				strategy: "summarized",
			}),
		).resolves.toBe("First part");

		// Proves the real `sseStream` (not a stub) drove the call: it should have
		// invoked global fetch with the SSE path/body/signature the summarizer
		// built, including the `text/event-stream` Accept header.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toContain("/v1/llm/chat/completions");
		expect(init).toMatchObject({
			method: "POST",
			headers: expect.objectContaining({
				Accept: "text/event-stream",
				Authorization: "Bearer test-api-key",
			}),
		});
		const body = JSON.parse((init as RequestInit).body as string) as Record<
			string,
			unknown
		>;
		expect(body).toMatchObject({
			requestId: "req-1_context_summary",
			conversationId: "session-1",
			model: "gpt-test",
			apiFormat: "chat-completions",
		});
	});

	it("throws empty-text error when SSE stream yields no chunk frames", async () => {
		// A valid SSE stream that closes without any chunk content — the parser
		// must still run without crashing, and the summarizer must surface the
		// empty-result guard from contextSummarizer.ts.
		const sseText = 'data: {"type":"done"}\n\n';
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(sseResponse(sseText));

		const summarize = createContextSummarizer({
			provider: { baseUrl: "https://provider.test/v1" },
			model: { id: "gpt-test" },
			conversationId: "session-1",
			requestId: "req-2",
		});

		await expect(
			summarize?.({
				text: "history",
				originalCount: 1,
				strategy: "compact",
			}),
		).rejects.toThrow("Context summarization returned empty text");
	});

	// Self-review guard: if the SSE frame separator were ever changed (e.g. to a
	// single `\n`), the parser would never yield a frame and this test would
	// fail. This keeps the integration honest — it cannot pass via a stub.
	it("relies on blank-line frame separation (regression guard for the parser)", async () => {
		// Malformed: no blank lines between data: entries → the parser must
		// treat them as a single unparseable frame and yield nothing, which the
		// summarizer surfaces as the empty-text error. If the parser were
		// stubbed, this would wrongly succeed.
		const malformed = [
			'data: {"type":"chunk","content":"First "}',
			'data: {"type":"chunk","content":"part"}',
			'data: {"type":"done"}',
		].join("\n");
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(sseResponse(malformed));

		const summarize = createContextSummarizer({
			provider: { baseUrl: "https://provider.test/v1" },
			model: { id: "gpt-test" },
			conversationId: "session-1",
			requestId: "req-3",
		});

		await expect(
			summarize?.({
				text: "history",
				originalCount: 1,
				strategy: "compact",
			}),
		).rejects.toThrow("Context summarization returned empty text");

		// Sanity: restoring the blank lines makes the same payload succeed.
		const wellFormed = [
			'data: {"type":"chunk","content":"First "}',
			"",
			'data: {"type":"chunk","content":"part"}',
			"",
			'data: {"type":"done"}',
			"",
			"",
		].join("\n");
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(sseResponse(wellFormed));
		await expect(
			summarize?.({
				text: "history",
				originalCount: 1,
				strategy: "compact",
			}),
		).resolves.toBe("First part");

		// Restore fetch hygiene for any subsequent test file in the same worker.
		globalThis.fetch = originalFetch;
	});
});
