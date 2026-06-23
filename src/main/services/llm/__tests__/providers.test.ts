// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveProvider } from "../providers";

describe("resolveProvider", () => {
	it("returns a LanguageModel for each known preset", () => {
		const presets = [
			"openai",
			"anthropic",
			"gemini",
			"grok",
			"openrouter",
		] as const;
		for (const preset of presets) {
			const m = resolveProvider({
				preset,
				baseUrl: "https://example.test/v1",
				apiKey: "k",
				model: "m1",
			});
			// AI SDK v6 ships LanguageModelV3.
			expect(m.specificationVersion).toBe("v3");
			expect(m.modelId).toBe("m1");
		}
	});

	it("falls back to OpenAI-compatible for unknown / custom presets", () => {
		const presets = [
			"custom",
			"deepseek",
			"moonshot",
			"ollama",
			"lmstudio",
			"newapi",
		] as const;
		for (const preset of presets) {
			const m = resolveProvider({
				preset,
				baseUrl: "https://example.test/v1",
				apiKey: "k",
				model: "anything",
			});
			expect(m.specificationVersion).toBe("v3");
			expect(m.modelId).toBe("anything");
		}
	});

	it("openai-compatible third parties get the chat-completions provider, not responses", () => {
		// Plain OpenAI may use responses, but third parties (deepseek, moonshot,
		// ollama, custom, …) only implement chat-completions. We route every
		// OpenAI-compatible preset through `.chat(...)` so the API call shape
		// matches what those providers actually serve. We also rename the
		// provider for telemetry, so the assertion is on the suffix only.
		const m = resolveProvider({
			preset: "deepseek",
			baseUrl: "https://api.deepseek.com/v1",
			apiKey: "k",
			model: "deepseek-reasoner",
		});
		expect(m.provider.endsWith(".chat")).toBe(true);
		expect(m.provider).not.toMatch(/\.responses$/);
	});
});
