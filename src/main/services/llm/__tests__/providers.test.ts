// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	presetToApiFormat,
	providerOptionsKey,
	resolveProvider,
} from "../providers";

describe("presetToApiFormat", () => {
	it("routes anthropic to /v1/messages", () => {
		expect(presetToApiFormat("anthropic")).toBe("anthropic-messages");
	});

	it("routes everything else to /chat/completions", () => {
		for (const preset of [
			"openai",
			"deepseek",
			"dashscope",
			"moonshot",
			"gemini",
			"grok",
			"openrouter",
			"ollama",
			"lmstudio",
			"custom",
			undefined,
		] as const) {
			expect(presetToApiFormat(preset)).toBe("chat-completions");
		}
	});
});

describe("resolveProvider — dispatch by apiFormat", () => {
	it("apiFormat='anthropic-messages' uses createAnthropic", () => {
		const m = resolveProvider({
			preset: "anthropic",
			apiFormat: "anthropic-messages",
			baseUrl: "https://api.anthropic.com",
			apiKey: "k",
			model: "claude-x",
		});
		expect(m.specificationVersion).toBe("v3");
		expect(m.provider).toMatch(/^anthropic\./);
	});

	it("apiFormat='chat-completions' uses createOpenAI().chat()", () => {
		const m = resolveProvider({
			preset: "deepseek",
			apiFormat: "chat-completions",
			baseUrl: "https://api.deepseek.com/v1",
			apiKey: "k",
			model: "deepseek-chat",
		});
		expect(m.specificationVersion).toBe("v3");
		expect(m.provider.endsWith(".chat")).toBe(true);
	});

	it("apiFormat='responses' uses createOpenAI().responses()", () => {
		const m = resolveProvider({
			preset: "openai",
			apiFormat: "responses",
			baseUrl: "https://api.openai.com/v1",
			apiKey: "k",
			model: "gpt-5",
		});
		expect(m.specificationVersion).toBe("v3");
		expect(m.provider.endsWith(".responses")).toBe(true);
	});
});

describe("resolveProvider — apiFormat omitted falls back to preset", () => {
	it("preset='anthropic' (no apiFormat) → anthropic wire", () => {
		const m = resolveProvider({
			preset: "anthropic",
			baseUrl: "https://api.anthropic.com",
			apiKey: "k",
			model: "claude-x",
		});
		expect(m.provider).toMatch(/^anthropic\./);
	});

	it("preset='deepseek' (no apiFormat) → chat-completions wire", () => {
		const m = resolveProvider({
			preset: "deepseek",
			baseUrl: "https://api.deepseek.com/v1",
			apiKey: "k",
			model: "deepseek-chat",
		});
		expect(m.provider.endsWith(".chat")).toBe(true);
	});

	it("preset undefined + no apiFormat → chat-completions wire", () => {
		const m = resolveProvider({
			preset: undefined,
			baseUrl: "https://example.test/v1",
			apiKey: "k",
			model: "m",
		});
		expect(m.provider.endsWith(".chat")).toBe(true);
	});
});

describe("providerOptionsKey", () => {
	it("anthropic wire → 'anthropic'", () => {
		expect(providerOptionsKey("anthropic")).toBe("anthropic");
		expect(providerOptionsKey(undefined, "anthropic-messages")).toBe(
			"anthropic",
		);
	});

	it("chat-completions / responses wire → 'openai'", () => {
		expect(providerOptionsKey("openai")).toBe("openai");
		expect(providerOptionsKey("deepseek")).toBe("openai");
		expect(providerOptionsKey("dashscope")).toBe("openai");
		expect(providerOptionsKey(undefined, "responses")).toBe("openai");
		expect(providerOptionsKey(undefined, "chat-completions")).toBe("openai");
	});

	it("explicit apiFormat overrides preset", () => {
		// Even when preset 'anthropic' is set, if apiFormat is chat-completions
		// (e.g. user picked the wrong combo deliberately), respect apiFormat.
		expect(providerOptionsKey("anthropic", "chat-completions")).toBe("openai");
	});
});
