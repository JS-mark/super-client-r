/**
 * Provider factory — dispatches by **wire format**, not by vendor.
 *
 * Every chat-capable LLM provider in the wild speaks one of three HTTP APIs:
 *
 *   1. anthropic-messages  → POST /v1/messages
 *      Anthropic Claude, AWS Bedrock Claude, Vertex Claude.
 *   2. chat-completions    → POST /chat/completions
 *      OpenAI legacy + every OpenAI-compatible third party
 *      (DeepSeek, Qwen/DashScope, Moonshot, Grok, OpenRouter, Zhipu/GLM,
 *      MiniMax, Volcengine/Doubao, Groq, Together, Fireworks, Cerebras,
 *      Perplexity, SiliconFlow, aggregators, Ollama, LM Studio, …).
 *   3. responses           → POST /responses
 *      OpenAI's new Responses API (stateful conversation + built-in
 *      file_search / code_interpreter / web_search tools).
 *
 * `resolveProvider` accepts either an explicit `apiFormat` (preferred — set
 * by the renderer's "API 格式" picker) or falls back to inferring the
 * format from the legacy `providerPreset` field so existing callers don't
 * need a migration.
 *
 * Anything provider-specific that goes beyond the wire format (Gemini
 * grounding, xAI live-search, Qwen thinking mode, OpenRouter cost reporting,
 * Anthropic prompt caching, …) flows through `request.extraParams` →
 * `providerOptions[wire-format-key]` via extraParamsMapper.ts.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ModelProviderPreset } from "../../ipc/types";

export type ApiFormat = "anthropic-messages" | "chat-completions" | "responses";

export interface ResolveProviderArgs {
	preset: ModelProviderPreset | undefined;
	apiFormat?: ApiFormat;
	baseUrl: string;
	apiKey: string;
	model: string;
	/** Extra HTTP headers (e.g. OpenRouter identification). */
	headers?: Record<string, string>;
}

/**
 * Map a legacy `ModelProviderPreset` to its wire format. Used when a request
 * arrives without an explicit `apiFormat`.
 */
export function presetToApiFormat(
	preset: ModelProviderPreset | undefined,
): ApiFormat {
	switch (preset) {
		case "anthropic":
			return "anthropic-messages";
		// Everything else is OpenAI-compatible chat completions. Gemini and
		// Vertex are reachable via Google's OpenAI-compatible endpoint
		// (/v1beta/openai/), so we route them through the same wire too —
		// callers wanting native Gemini features should use the renderer's
		// extraParams plumbing.
		default:
			return "chat-completions";
	}
}

export function resolveProvider(args: ResolveProviderArgs): LanguageModelV3 {
	const { preset, baseUrl, apiKey, model } = args;
	const apiFormat = args.apiFormat ?? presetToApiFormat(preset);

	switch (apiFormat) {
		case "anthropic-messages": {
			const provider = createAnthropic({
				apiKey: apiKey || "",
				baseURL: baseUrl || undefined,
				headers: args.headers,
			});
			return provider(model);
		}
		case "responses": {
			const provider = createOpenAI({
				apiKey: apiKey || "sk-placeholder",
				baseURL: baseUrl || undefined,
				headers: mergeHeaders(args.headers, preset),
				name: providerNameFromPreset(preset),
			});
			return provider.responses(model);
		}
		case "chat-completions":
		default: {
			const provider = createOpenAI({
				apiKey: apiKey || "sk-placeholder",
				baseURL: baseUrl || undefined,
				headers: mergeHeaders(args.headers, preset),
				name: providerNameFromPreset(preset),
			});
			return provider.chat(model);
		}
	}
}

/**
 * OpenRouter is the only OpenAI-compatible provider that asks for
 * additional identifying headers. Apply them automatically when the preset
 * says we're talking to OpenRouter; users can still override or extend
 * via `args.headers`.
 */
function mergeHeaders(
	userHeaders: Record<string, string> | undefined,
	preset: ModelProviderPreset | undefined,
): Record<string, string> | undefined {
	if (preset === "openrouter") {
		return {
			"HTTP-Referer": "https://superclient.app",
			"X-Title": "Super Client",
			...userHeaders,
		};
	}
	return userHeaders;
}

function providerNameFromPreset(
	preset: ModelProviderPreset | undefined,
): string {
	// Used for telemetry only — appears in m.provider as `${name}.chat` etc.
	if (preset && preset !== "openai") return preset;
	return "openai";
}

/**
 * Map a wire format / preset to the key used inside AI SDK `providerOptions`.
 * Used by `extraParamsMapper.ts`. Anything not on the anthropic wire is keyed
 * under "openai", matching how createOpenAI accepts provider-specific knobs.
 */
export function providerOptionsKey(
	preset: ModelProviderPreset | undefined,
	apiFormat?: ApiFormat,
): string {
	const fmt = apiFormat ?? presetToApiFormat(preset);
	if (fmt === "anthropic-messages") return "anthropic";
	return "openai";
}
