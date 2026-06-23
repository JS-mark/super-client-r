// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapExtraParams } from "../extraParamsMapper";

describe("mapExtraParams", () => {
	it("returns empty top + providerOptions when extraParams is missing", () => {
		expect(mapExtraParams("openai", undefined)).toEqual({
			top: {},
			providerOptions: {},
		});
		expect(mapExtraParams("openai", {})).toEqual({
			top: {},
			providerOptions: {},
		});
	});

	it("maps OpenAI-style snake_case top-level fields to AI SDK camelCase", () => {
		const out = mapExtraParams("openai", {
			frequency_penalty: 0.5,
			presence_penalty: -0.2,
			seed: 42,
			stop: ["END"],
			response_format: { type: "json_object" },
		});
		expect(out.top).toEqual({
			frequencyPenalty: 0.5,
			presencePenalty: -0.2,
			seed: 42,
			stopSequences: ["END"],
			responseFormat: { type: "json_object" },
		});
		expect(out.providerOptions).toEqual({});
	});

	it("routes unknown keys into providerOptions under the provider's key", () => {
		const out = mapExtraParams("openai", { logprobs: true, top_logprobs: 3 });
		expect(out.top).toEqual({});
		expect(out.providerOptions).toEqual({
			openai: { logprobs: true, top_logprobs: 3 },
		});
	});

	it("routes anthropic-specific keys to providerOptions.anthropic", () => {
		const out = mapExtraParams("anthropic", {
			top_k: 50,
			thinking: { type: "enabled" },
		});
		expect(out.top).toEqual({});
		expect(out.providerOptions).toEqual({
			anthropic: { top_k: 50, thinking: { type: "enabled" } },
		});
	});

	it("treats `stop` as alias for stopSequences regardless of preset", () => {
		expect(mapExtraParams("anthropic", { stop: ["X"] }).top).toEqual({
			stopSequences: ["X"],
		});
	});
});
