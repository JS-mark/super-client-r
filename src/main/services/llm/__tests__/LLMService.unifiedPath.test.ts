// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatStreamEvent } from "../../../ipc/types";

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../providers", () => ({
	resolveProvider: () => ({
		specificationVersion: "v3",
		modelId: "fake",
		provider: "fake.chat",
	}),
	providerOptionsKey: () => "openai",
}));

const streamTextMock = vi.fn();
vi.mock("ai", async () => {
	const actual = await vi.importActual<typeof import("ai")>("ai");
	return {
		...actual,
		streamText: (...args: unknown[]) => streamTextMock(...args),
	};
});

function fakeResult(chunks: string[]) {
	const text = chunks.join("");
	return {
		fullStream: (async function* () {
			for (const c of chunks) yield { type: "text-delta", delta: c };
			yield {
				type: "finish",
				totalUsage: {
					inputTokens: 1,
					outputTokens: chunks.length,
					totalTokens: 1 + chunks.length,
				},
			};
		})(),
		text: Promise.resolve(text),
	};
}

describe("LLMService unified path (cutover)", () => {
	beforeEach(() => {
		streamTextMock.mockReset();
	});

	it("streams text deltas and emits done", async () => {
		streamTextMock.mockReturnValueOnce(fakeResult(["Hel", "lo"]));
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		const events: ChatStreamEvent[] = [];
		const unsub = service.subscribeRequestEvents("rU", (e) => events.push(e));
		await service.chatCompletion({
			requestId: "rU",
			baseUrl: "x",
			apiKey: "x",
			model: "fake",
			messages: [{ role: "user", content: "hi" }],
			providerPreset: "openai",
		});
		unsub();
		expect(
			events.filter((e) => e.type === "chunk").map((e) => e.content),
		).toEqual(["Hel", "lo"]);
		expect(events.find((e) => e.type === "done")?.usage?.totalTokens).toBe(3);
	});

	it("rejects toolCallMode='prompt' with an explicit error (post-cutover)", async () => {
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		await expect(
			service.chatCompletion({
				requestId: "rP",
				baseUrl: "x",
				apiKey: "x",
				model: "fake",
				messages: [{ role: "user", content: "hi" }],
				providerPreset: "openai",
				toolCallMode: "prompt",
			}),
		).rejects.toThrow(/prompt.*no longer supported/i);
		expect(streamTextMock).not.toHaveBeenCalled();
	});
});
