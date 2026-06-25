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
import { logger } from "../../utils/logger";

const log = logger.withContext("LLMProviders");

export type ApiFormat = "anthropic-messages" | "chat-completions" | "responses";

// Bailian / DashScope hostnames — used by `coerceBaseUrlForAnthropic` to
// recognise an Alibaba Cloud Model Studio endpoint even when the user saved
// it without a matching preset. Sources:
//   - docs/aliyun-bailian/Anthropic-Messages.md (regional base_url table)
//   - docs/aliyun-bailian/OpenAI-Chat.md
const BAILIAN_HOST_SUFFIXES = [
	".cn-beijing.maas.aliyuncs.com",
	".ap-southeast-1.maas.aliyuncs.com",
	".eu-central-1.maas.aliyuncs.com",
	".ap-northeast-1.maas.aliyuncs.com",
] as const;
const BAILIAN_HOSTS = new Set([
	"dashscope.aliyuncs.com",
	"dashscope-intl.aliyuncs.com",
	"dashscope-us.aliyuncs.com",
]);

function isBailianHost(hostname: string): boolean {
	if (BAILIAN_HOSTS.has(hostname)) return true;
	return BAILIAN_HOST_SUFFIXES.some((s) => hostname.endsWith(s));
}

/**
 * Bailian (Alibaba Cloud Model Studio / DashScope) exposes Anthropic Messages
 * under a **different path** than its OpenAI-compatible mode:
 *
 *   OpenAI Chat / Responses:    {host}/compatible-mode/v1
 *   Anthropic Messages (HTTP):  POST {host}/apps/anthropic/v1/messages
 *
 * Path convention quirk:
 *   - Anthropic's *official* SDK auto-appends `/v1/messages` → the Bailian
 *     docs say `baseURL = ".../apps/anthropic"` (no `/v1`).
 *   - `@ai-sdk/anthropic` (Vercel AI SDK) only appends `/messages`; its
 *     default baseURL is `https://api.anthropic.com/v1` (with `/v1`).
 *     See node_modules/@ai-sdk/anthropic .../index.js line 5077.
 *
 * So when our backend (Vercel SDK) targets Bailian, the correct baseURL is
 * `.../apps/anthropic/v1` so the final request hits `.../apps/anthropic/v1/messages`.
 *
 * Most users hit this 404 by configuring a Qwen / MiniMax / DeepSeek / Kimi
 * / GLM model through Bailian's OpenAI-compat baseUrl
 * (`.../compatible-mode/v1`) and then flipping the apiFormat to
 * anthropic-messages without re-pasting the URL. We detect the situation (by
 * preset OR hostname) and rewrite the path to `/apps/anthropic/v1`.
 * Idempotent — already-correct URLs pass through.
 *
 * Reference: docs/aliyun-bailian/Anthropic-Messages.md
 */
export function coerceBaseUrlForAnthropic(
	baseUrl: string,
	preset: ModelProviderPreset | undefined,
): string {
	if (!baseUrl) return baseUrl;
	let url: URL;
	try {
		url = new URL(baseUrl);
	} catch {
		return baseUrl;
	}
	const looksLikeBailian =
		preset === "dashscope" || isBailianHost(url.hostname);
	if (!looksLikeBailian) return baseUrl;
	// Always normalise: even when path is already correct, strip trailing
	// slash so the SDK appends `/messages` cleanly (no double slash).
	url.pathname = "/apps/anthropic/v1";
	url.search = "";
	url.hash = "";
	return url.toString().replace(/\/+$/, "");
}

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
			const effectiveBaseUrl = coerceBaseUrlForAnthropic(baseUrl, preset);
			if (effectiveBaseUrl !== baseUrl) {
				log.warn("Coerced baseUrl for Anthropic Messages mode", {
					from: baseUrl,
					to: effectiveBaseUrl,
					preset,
				});
			}
			const provider = createAnthropic({
				apiKey: apiKey || "",
				baseURL: effectiveBaseUrl || undefined,
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
