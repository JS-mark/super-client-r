// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	coerceBaseUrlForAnthropic,
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

describe("coerceBaseUrlForAnthropic — Bailian / DashScope URL rewriter", () => {
	// Vercel AI SDK appends only `/messages`, so the rewritten baseUrl must
	// end in `/apps/anthropic/v1` (NOT `/apps/anthropic`) — otherwise the
	// final request is `/apps/anthropic/messages` (404).
	it("rewrites /compatible-mode/v1 → /apps/anthropic/v1 on dashscope.aliyuncs.com", () => {
		expect(
			coerceBaseUrlForAnthropic(
				"https://dashscope.aliyuncs.com/compatible-mode/v1",
				"dashscope",
			),
		).toBe("https://dashscope.aliyuncs.com/apps/anthropic/v1");
	});

	it("rewrites bare host (no path) → /apps/anthropic/v1", () => {
		expect(
			coerceBaseUrlForAnthropic(
				"https://dashscope.aliyuncs.com",
				"dashscope",
			),
		).toBe("https://dashscope.aliyuncs.com/apps/anthropic/v1");
	});

	it("passes through already-correct /apps/anthropic/v1 baseUrl", () => {
		const url = "https://dashscope.aliyuncs.com/apps/anthropic/v1";
		expect(coerceBaseUrlForAnthropic(url, "dashscope")).toBe(url);
		// Trailing slash also treated as correct (and stripped).
		expect(
			coerceBaseUrlForAnthropic(
				"https://dashscope.aliyuncs.com/apps/anthropic/v1/",
				"dashscope",
			),
		).toBe(url);
	});

	it("upgrades older /apps/anthropic (no /v1) to /apps/anthropic/v1", () => {
		// Some users may have read the Bailian doc literally and saved the URL
		// without `/v1`. Vercel SDK won't add it; we must.
		expect(
			coerceBaseUrlForAnthropic(
				"https://dashscope.aliyuncs.com/apps/anthropic",
				"dashscope",
			),
		).toBe("https://dashscope.aliyuncs.com/apps/anthropic/v1");
	});

	it("recognises Singapore / Tokyo / Frankfurt / Beijing maas hosts via suffix", () => {
		expect(
			coerceBaseUrlForAnthropic(
				"https://ws-abc.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
				undefined,
			),
		).toBe("https://ws-abc.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1");
		expect(
			coerceBaseUrlForAnthropic(
				"https://ws-xyz.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
				undefined,
			),
		).toBe("https://ws-xyz.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1");
		expect(
			coerceBaseUrlForAnthropic(
				"https://ws-abc.eu-central-1.maas.aliyuncs.com/compatible-mode/v1",
				undefined,
			),
		).toBe("https://ws-abc.eu-central-1.maas.aliyuncs.com/apps/anthropic/v1");
		expect(
			coerceBaseUrlForAnthropic(
				"https://ws-abc.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1",
				undefined,
			),
		).toBe("https://ws-abc.ap-northeast-1.maas.aliyuncs.com/apps/anthropic/v1");
	});

	it("coerces by preset even when hostname is a custom proxy", () => {
		// User runs their own gateway at proxy.example.com, but the preset is
		// dashscope and apiFormat will be anthropic-messages — we still rewrite.
		expect(
			coerceBaseUrlForAnthropic(
				"https://proxy.example.com/compatible-mode/v1",
				"dashscope",
			),
		).toBe("https://proxy.example.com/apps/anthropic/v1");
	});

	it("leaves non-Bailian, non-dashscope-preset URLs untouched", () => {
		expect(
			coerceBaseUrlForAnthropic("https://api.anthropic.com", "anthropic"),
		).toBe("https://api.anthropic.com");
		expect(
			coerceBaseUrlForAnthropic("https://api.deepseek.com/v1", "deepseek"),
		).toBe("https://api.deepseek.com/v1");
		expect(
			coerceBaseUrlForAnthropic("https://example.test/v1", undefined),
		).toBe("https://example.test/v1");
	});

	it("returns empty / invalid input unchanged", () => {
		expect(coerceBaseUrlForAnthropic("", "dashscope")).toBe("");
		expect(coerceBaseUrlForAnthropic("not a url", "dashscope")).toBe("not a url");
	});
});

describe("resolveProvider — Bailian Anthropic Messages baseUrl coercion", () => {
	it("rewrites the wrong /compatible-mode/v1 URL before constructing the SDK", () => {
		// Smoke-test that resolveProvider runs through the coercion path without
		// throwing. We can't directly inspect the URL the SDK will use, but the
		// pure helper above covers correctness; this guards regressions in wiring.
		const m = resolveProvider({
			preset: "dashscope",
			apiFormat: "anthropic-messages",
			baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
			apiKey: "k",
			model: "MiniMax-M2.5",
		});
		expect(m.provider).toMatch(/^anthropic\./);
	});
});
