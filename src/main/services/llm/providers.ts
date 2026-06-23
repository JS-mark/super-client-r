/**
 * Provider factory — maps `ModelProviderPreset` to a configured AI SDK
 * `LanguageModelV3`.
 *
 * One branch per first-party provider; everything else (deepseek, moonshot,
 * dashscope, siliconflow, ollama, lmstudio, newapi, volcengine, custom, …)
 * falls through `createOpenAI` with `compatibility: "compatible"` and
 * `.chat(...)`. The chat-completions interface is the lowest common
 * denominator for OpenAI-compatible third parties; the Responses API
 * (`provider(model)` default) is not supported by most of them.
 *
 * OpenRouter additionally injects the `HTTP-Referer` / `X-Title` headers
 * that the legacy `chatCompletion` path was sending.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ModelProviderPreset } from "../../ipc/types";

export interface ResolveProviderArgs {
	preset: ModelProviderPreset | undefined;
	baseUrl: string;
	apiKey: string;
	model: string;
	/** Extra HTTP headers (e.g. OpenRouter identification). */
	headers?: Record<string, string>;
}

export function resolveProvider(args: ResolveProviderArgs): LanguageModelV3 {
	const { preset, baseUrl, apiKey, model } = args;
	switch (preset) {
		case "anthropic": {
			const provider = createAnthropic({
				apiKey: apiKey || "",
				baseURL: baseUrl || undefined,
			});
			return provider(model);
		}
		case "gemini": {
			const provider = createGoogleGenerativeAI({
				apiKey: apiKey || "",
				baseURL: baseUrl || undefined,
			});
			return provider(model);
		}
		case "grok": {
			const provider = createXai({
				apiKey: apiKey || "",
				baseURL: baseUrl || undefined,
			});
			return provider(model);
		}
		case "openrouter": {
			const provider = createOpenRouter({
				apiKey: apiKey || "",
				baseURL: baseUrl || undefined,
				headers: {
					"HTTP-Referer": "https://superclient.app",
					"X-Title": "Super Client",
					...args.headers,
				},
			});
			return provider(model);
		}
		case "openai":
		default: {
			// All OpenAI-compatible providers including the canonical openai.
			// We deliberately use `.chat()` (not the default Responses API) so
			// third-party endpoints like deepseek / moonshot / ollama / custom
			// work out of the box. Use `name` for telemetry so requests from
			// non-openai providers are still distinguishable in logs.
			const provider = createOpenAI({
				apiKey: apiKey || "sk-placeholder",
				baseURL: baseUrl || undefined,
				headers: args.headers,
				name: preset && preset !== "openai" ? preset : "openai",
			});
			return provider.chat(model);
		}
	}
}

/**
 * Map a `ModelProviderPreset` to the key used inside AI SDK
 * `providerOptions`. Used by `extraParamsMapper.ts` (Task 7).
 */
export function providerOptionsKey(
	preset: ModelProviderPreset | undefined,
): string {
	switch (preset) {
		case "anthropic":
			return "anthropic";
		case "gemini":
			return "google";
		case "grok":
			return "xai";
		case "openrouter":
			return "openrouter";
		default:
			return "openai";
	}
}
