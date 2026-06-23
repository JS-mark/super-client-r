/**
 * Map the legacy `extraParams` shape (OpenAI snake_case top-level fields
 * spread onto `chat.completions.create({...})`) into the AI SDK split:
 *   - top-level options on `streamText({...})`
 *   - per-provider nested `providerOptions: { [provider]: {...} }`
 *
 * Known cross-provider top-level aliases (frequency_penalty, presence_penalty,
 * seed, stop / stop_sequences, response_format) are mapped to AI SDK
 * camelCase. Everything else falls through to `providerOptions.{provider}`
 * keyed by the preset's provider name (see `providerOptionsKey`).
 */

import { providerOptionsKey, type ApiFormat } from "./providers";
import type { ModelProviderPreset } from "../../ipc/types";

export interface MappedTopLevel {
	frequencyPenalty?: number;
	presencePenalty?: number;
	seed?: number;
	stopSequences?: string[];
	responseFormat?: unknown;
}

export interface MappedExtraParams {
	top: MappedTopLevel;
	providerOptions: Record<string, Record<string, unknown>>;
}

/**
 * Known top-level field aliases (snake_case → AI SDK camelCase). Everything
 * not in this list falls through to provider-specific `providerOptions`.
 */
const TOP_LEVEL_ALIASES: Record<string, keyof MappedTopLevel> = {
	frequency_penalty: "frequencyPenalty",
	frequencyPenalty: "frequencyPenalty",
	presence_penalty: "presencePenalty",
	presencePenalty: "presencePenalty",
	seed: "seed",
	stop: "stopSequences",
	stop_sequences: "stopSequences",
	stopSequences: "stopSequences",
	response_format: "responseFormat",
	responseFormat: "responseFormat",
};

export function mapExtraParams(
	preset: ModelProviderPreset | undefined,
	extraParams: Record<string, unknown> | undefined,
	apiFormat?: ApiFormat,
): MappedExtraParams {
	const result: MappedExtraParams = { top: {}, providerOptions: {} };
	if (!extraParams) return result;

	const provider = providerOptionsKey(preset, apiFormat);
	for (const [k, v] of Object.entries(extraParams)) {
		if (v === undefined) continue;
		const aliased = TOP_LEVEL_ALIASES[k];
		if (aliased) {
			if (aliased === "stopSequences") {
				// accept either string or string[]
				(result.top as Record<string, unknown>)[aliased] = Array.isArray(v)
					? v
					: [String(v)];
			} else {
				(result.top as Record<string, unknown>)[aliased] = v;
			}
			continue;
		}
		if (!result.providerOptions[provider]) {
			result.providerOptions[provider] = {};
		}
		result.providerOptions[provider][k] = v;
	}
	return result;
}
