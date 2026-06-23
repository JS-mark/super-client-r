// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatStreamEvent } from "../../../ipc/types";

// Don't broadcast through electron.
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));

// ── Controllable OpenAI mock ──────────────────────────────────────────────
const openaiStreams: Array<AsyncIterable<unknown>> = [];
vi.mock("openai", () => {
	return {
		default: class {
			chat = {
				completions: {
					create: vi.fn(async () => openaiStreams.shift() ?? emptyStream()),
				},
			};
			models = { list: vi.fn(async () => []) };
		},
	};
});

// ── Controllable Anthropic mock ───────────────────────────────────────────
const anthropicStreams: Array<AsyncIterable<unknown>> = [];
vi.mock("@anthropic-ai/sdk", () => {
	return {
		default: class {
			messages = {
				stream: vi.fn(() => anthropicStreams.shift() ?? emptyStream()),
			};
		},
	};
});

async function* emptyStream() {
	yield {
		choices: [{ delta: { content: "" }, finish_reason: "stop", index: 0 }],
	};
}

async function* openAiTextStream() {
	yield { choices: [{ delta: { content: "Hel" }, index: 0 }] };
	yield { choices: [{ delta: { content: "lo" }, index: 0 }] };
	yield {
		choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
		usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
	};
}

async function* openAiToolCallStream() {
	yield {
		choices: [
			{
				delta: {
					tool_calls: [
						{
							index: 0,
							id: "call_a",
							function: { name: "echo", arguments: '{"m":"hi"}' },
						},
					],
				},
				index: 0,
			},
		],
	};
	yield {
		choices: [{ delta: {}, index: 0, finish_reason: "tool_calls" }],
		usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
	};
}

async function* anthropicTextStream() {
	yield {
		type: "message_start",
		message: { usage: { input_tokens: 3, output_tokens: 0 } },
	};
	yield {
		type: "content_block_delta",
		delta: { type: "text_delta", text: "Hi" },
	};
	yield {
		type: "message_delta",
		delta: { stop_reason: "end_turn" },
		usage: { output_tokens: 1 },
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe("LLMService legacy path snapshot (flag off)", () => {
	beforeEach(() => {
		openaiStreams.length = 0;
		anthropicStreams.length = 0;
	});

	it("OpenAI: streams text chunks then done with usage", async () => {
		openaiStreams.push(openAiTextStream());
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		const events: ChatStreamEvent[] = [];
		const unsub = service.subscribeRequestEvents("r1", (e) => events.push(e));
		await service.chatCompletion({
			requestId: "r1",
			baseUrl: "x",
			apiKey: "x",
			model: "gpt-x",
			messages: [{ role: "user", content: "say hi" }],
			providerPreset: "openai",
		});
		unsub();
		expect(
			events.filter((e) => e.type === "chunk").map((e) => e.content),
		).toEqual(["Hel", "lo"]);
		const done = events.find((e) => e.type === "done");
		expect(done?.usage?.totalTokens).toBe(7);
	});

	it("OpenAI: emits tool_call → tool_result with duration", async () => {
		openaiStreams.push(openAiToolCallStream());
		openaiStreams.push(openAiTextStream()); // continuation after tool result
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		const events: ChatStreamEvent[] = [];
		const unsub = service.subscribeRequestEvents("r2", (e) => events.push(e));
		await service.chatCompletion(
			{
				requestId: "r2",
				baseUrl: "x",
				apiKey: "x",
				model: "gpt-x",
				messages: [{ role: "user", content: "use a tool" }],
				providerPreset: "openai",
				tools: [
					{
						type: "function",
						function: {
							name: "echo",
							description: "echo",
							parameters: { type: "object" },
						},
					},
				],
			},
			async (_n, args) => ({ ok: true, args }),
		);
		unsub();
		const toolCall = events.find((e) => e.type === "tool_call");
		const toolResult = events.find((e) => e.type === "tool_result");
		expect(toolCall?.toolCall?.name).toBe("echo");
		expect(toolResult?.toolResult?.result).toEqual({
			ok: true,
			args: { m: "hi" },
		});
		expect(typeof toolResult?.toolResult?.duration).toBe("number");
	});

	it("Anthropic: streams text chunks then done with usage", async () => {
		anthropicStreams.push(anthropicTextStream());
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		const events: ChatStreamEvent[] = [];
		const unsub = service.subscribeRequestEvents("r3", (e) => events.push(e));
		await service.chatCompletion({
			requestId: "r3",
			baseUrl: "x",
			apiKey: "x",
			model: "claude-x",
			messages: [{ role: "user", content: "say hi" }],
			providerPreset: "anthropic",
		});
		unsub();
		expect(events.find((e) => e.type === "chunk")?.content).toBe("Hi");
		expect(events.find((e) => e.type === "done")?.usage?.inputTokens).toBe(3);
	});

	it("abort mid-stream halts silently without done or error", async () => {
		// Generator yields a couple of slow chunks. We abort between the first
		// and second; the legacy `for await` body's `if (signal.aborted) break`
		// check fires on the second iteration, which is exactly what we want
		// to assert. Real SDKs also throw AbortError on abort but we don't rely
		// on that here — the legacy path's defensive break is what matters.
		async function* slow() {
			yield { choices: [{ delta: { content: "a" }, index: 0 }] };
			await new Promise((r) => setTimeout(r, 50));
			yield { choices: [{ delta: { content: "b" }, index: 0 }] };
			await new Promise((r) => setTimeout(r, 50));
			yield {
				choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
				usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
			};
		}
		openaiStreams.push(slow());
		const { LLMService } = await import("../LLMService");
		const service = new LLMService();
		const events: ChatStreamEvent[] = [];
		const unsub = service.subscribeRequestEvents("r4", (e) => events.push(e));
		const p = service.chatCompletion({
			requestId: "r4",
			baseUrl: "x",
			apiKey: "x",
			model: "gpt-x",
			messages: [{ role: "user", content: "go" }],
			providerPreset: "openai",
		});
		// Wait until the first chunk has been observed, then abort.
		await new Promise((r) => setTimeout(r, 20));
		service.stopStream("r4");
		await p;
		unsub();
		// We should have received the first chunk before abort took effect.
		expect(events.find((e) => e.type === "chunk")?.content).toBe("a");
		// But no done and no error event after abort.
		expect(events.find((e) => e.type === "done")).toBeUndefined();
		expect(events.find((e) => e.type === "error")).toBeUndefined();
	});
});
