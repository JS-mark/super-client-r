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
				usage: {
					inputTokens: 1,
					outputTokens: chunks.length,
					totalTokens: 1 + chunks.length,
				},
			};
		})(),
		text: Promise.resolve(text),
	};
}

describe("LLMService unified path", () => {
	beforeEach(() => {
		streamTextMock.mockReset();
	});

	it("streams text deltas and emits done when the flag is on", async () => {
		streamTextMock.mockReturnValueOnce(fakeResult(["Hel", "lo"]));
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		service.setUnifiedPath(true);
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

	it("routes prompt-mode requests to the legacy path even when the flag is on", async () => {
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		service.setUnifiedPath(true);
		const legacySpy = vi.spyOn(
			service as unknown as {
				chatCompletionLegacy: (...a: unknown[]) => Promise<void>;
			},
			"chatCompletionLegacy" as never,
		);
		await service.chatCompletion({
			requestId: "rP",
			baseUrl: "x",
			apiKey: "x",
			model: "fake",
			messages: [{ role: "user", content: "hi" }],
			providerPreset: "openai",
			toolCallMode: "prompt",
		});
		expect(streamTextMock).not.toHaveBeenCalled();
		expect(legacySpy).toHaveBeenCalled();
	});

	it("does not touch streamText when the flag is off (legacy stays in charge)", async () => {
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		// flag intentionally NOT set
		const legacySpy = vi.spyOn(
			service as unknown as {
				chatCompletionLegacy: (...a: unknown[]) => Promise<void>;
			},
			"chatCompletionLegacy" as never,
		);
		await service.chatCompletion({
			requestId: "rO",
			baseUrl: "x",
			apiKey: "x",
			model: "fake",
			messages: [{ role: "user", content: "hi" }],
			providerPreset: "openai",
		});
		expect(streamTextMock).not.toHaveBeenCalled();
		expect(legacySpy).toHaveBeenCalled();
	});
});
