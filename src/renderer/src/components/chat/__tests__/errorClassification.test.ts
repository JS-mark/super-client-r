import { describe, expect, it } from "vitest";
import type { LLMErrorContext } from "@super-client/shared-types/chat";
import {
	classifyLLMError,
	type LLMErrorCategory,
} from "../errorClassification";

function ctx(partial: Partial<LLMErrorContext>): LLMErrorContext {
	return {
		preset: "dashscope",
		apiFormat: "anthropic-messages",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		model: "MiniMax/MiniMax-M3",
		statusCode: undefined,
		endpointUrl: undefined,
		responseBodySnippet: undefined,
		providerErrorCode: undefined,
		providerErrorMessage: undefined,
		...partial,
	};
}

function expectCategory(
	c: ReturnType<typeof classifyLLMError>,
	category: LLMErrorCategory,
	guidance: boolean,
) {
	expect(c.category).toBe(category);
	expect(c.showModelsGuidance).toBe(guidance);
	expect(c.headlineKey.startsWith("errorCard.friendly.")).toBe(true);
	expect(c.headlineFallback.length).toBeGreaterThan(0);
}

describe("classifyLLMError", () => {
	it("classifies the canonical 百炼 'product not activated' case (SUP-24)", () => {
		const c = classifyLLMError(
			ctx({
				statusCode: 400,
				providerErrorCode: "InvalidParameter",
				providerErrorMessage:
					"The product is not activated, please confirm that you have activated products and try again after activation.",
			}),
		);
		expectCategory(c, "not_activated", true);
	});

	it("classifies Chinese '未开通' message", () => {
		const c = classifyLLMError(
			ctx({ providerErrorMessage: "该模型未开通，请先开通" }),
		);
		expectCategory(c, "not_activated", true);
	});

	it("classifies auth failures by HTTP 401", () => {
		const c = classifyLLMError(ctx({ statusCode: 401 }));
		expectCategory(c, "auth", true);
	});

	it("classifies auth failures by HTTP 403", () => {
		const c = classifyLLMError(ctx({ statusCode: 403 }));
		expectCategory(c, "auth", true);
	});

	it("classifies auth failures by message (invalid api key)", () => {
		const c = classifyLLMError(
			ctx({ providerErrorMessage: "Invalid API key provided" }),
		);
		expectCategory(c, "auth", true);
	});

	it("classifies quota / rate limit by HTTP 429", () => {
		const c = classifyLLMError(ctx({ statusCode: 429 }));
		expectCategory(c, "quota", true);
	});

	it("classifies quota exhausted by message", () => {
		const c = classifyLLMError(
			ctx({ providerErrorMessage: "The free quota has been exhausted" }),
		);
		expectCategory(c, "quota", true);
	});

	it("classifies model not found by HTTP 404", () => {
		const c = classifyLLMError(ctx({ statusCode: 404 }));
		expectCategory(c, "model_not_found", true);
	});

	it("classifies model not found by OpenAI-style code", () => {
		const c = classifyLLMError(
			ctx({
				providerErrorCode: "model_not_found",
				providerErrorMessage: "no such model",
			}),
		);
		expectCategory(c, "model_not_found", true);
	});

	it("falls back to unknown (no guidance) for unrecognised errors", () => {
		const c = classifyLLMError(
			ctx({ providerErrorMessage: "connect ECONNREFUSED" }),
		);
		expectCategory(c, "unknown", false);
	});

	it("handles a missing context gracefully", () => {
		const c = classifyLLMError(undefined, "");
		expectCategory(c, "unknown", false);
	});

	it("reads the summary string when no structured ctx is present", () => {
		const c = classifyLLMError(
			undefined,
			"The product is not activated — HTTP 400, model=MiniMax/MiniMax-M3",
		);
		expectCategory(c, "not_activated", true);
	});

	it("prioritises not_activated over auth when both could match", () => {
		// A 403 that is really an activation problem should still read as
		// not_activated (the more specific, more actionable category).
		const c = classifyLLMError(
			ctx({
				statusCode: 403,
				providerErrorMessage: "The product is not activated",
			}),
		);
		expectCategory(c, "not_activated", true);
	});
});
