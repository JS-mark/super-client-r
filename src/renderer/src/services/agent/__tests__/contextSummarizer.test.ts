import { describe, expect, it, vi } from "vitest";
import { createContextSummarizer } from "../contextSummarizer";
import { sseStream } from "../../localApiClient";

vi.mock("../../localApiClient", () => ({
	sseStream: vi.fn(),
}));

const mockedSseStream = vi.mocked(sseStream);

async function* events(items: unknown[]): AsyncGenerator<unknown> {
	for (const item of items) yield item;
}

describe("createContextSummarizer", () => {
	it("returns undefined when provider/model cannot call local LLM HTTP", () => {
		expect(
			createContextSummarizer({
				provider: { baseUrl: "" },
				model: { id: "claude" },
				conversationId: "session-1",
				requestId: "req-1",
			}),
		).toBeUndefined();
		expect(
			createContextSummarizer({
				provider: { baseUrl: "https://provider.test" },
				model: { id: "" },
				conversationId: "session-1",
				requestId: "req-1",
			}),
		).toBeUndefined();
	});

	it("streams a concise summary through the local LLM HTTP endpoint", async () => {
		mockedSseStream.mockReturnValueOnce(
			events([
				{ type: "chunk", content: "Short " },
				{ type: "chunk", content: "summary" },
				{ type: "done" },
			]) as ReturnType<typeof sseStream>,
		);
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
		).resolves.toBe("Short summary");

		expect(mockedSseStream).toHaveBeenCalledWith(
			"/v1/llm/chat/completions",
			expect.objectContaining({
				requestId: "req-1_context_summary",
				conversationId: "session-1",
				baseUrl: "https://provider.test/v1",
				apiKey: "sk-test",
				model: "gpt-test",
				providerPreset: "openai",
				apiFormat: "chat-completions",
				maxTokens: 2000,
				temperature: 0.2,
				toolPermission: { mode: "none" },
				messages: [
					expect.objectContaining({ role: "system" }),
					expect.objectContaining({
						role: "user",
						content: expect.stringContaining(
							"user: hello\nassistant: world",
						),
					}),
				],
			}),
			expect.any(AbortSignal),
		);
	});

	it("throws when the local LLM endpoint emits an error", async () => {
		mockedSseStream.mockReturnValueOnce(
			events([{ type: "error", error: "provider failed" }]) as ReturnType<
				typeof sseStream
			>,
		);
		const summarize = createContextSummarizer({
			provider: { baseUrl: "https://provider.test/v1" },
			model: { id: "gpt-test" },
			conversationId: "session-1",
			requestId: "req-1",
		});

		await expect(
			summarize?.({
				text: "history",
				originalCount: 1,
				strategy: "compact",
			}),
		).rejects.toThrow("provider failed");
	});
});
