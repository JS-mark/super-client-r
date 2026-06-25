// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildLLMErrorContext,
	formatLLMErrorMessage,
	parseProviderErrorBody,
} from "../errorContext";

// Mimic the shape of `APICallError` thrown by @ai-sdk/anthropic so we don't
// need to import the SDK in tests.
function fakeApiError(opts: {
	message: string;
	statusCode?: number;
	url?: string;
	responseBody?: string;
}): Error & Record<string, unknown> {
	const err = new Error(opts.message) as Error & Record<string, unknown>;
	if (opts.statusCode !== undefined) err.statusCode = opts.statusCode;
	if (opts.url !== undefined) err.url = opts.url;
	if (opts.responseBody !== undefined) err.responseBody = opts.responseBody;
	return err;
}

const baseRequest = {
	providerPreset: "dashscope" as const,
	apiFormat: "anthropic-messages" as const,
	baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
	model: "MiniMax/MiniMax-M2.7",
};

describe("buildLLMErrorContext", () => {
	it("extracts statusCode, url and bodySnippet from AI-SDK-shaped errors", () => {
		const err = fakeApiError({
			message: "Not Found",
			statusCode: 404,
			url: "https://dashscope.aliyuncs.com/compatible-mode/v1/messages",
			responseBody: "",
		});
		const ctx = buildLLMErrorContext(err, baseRequest);
		expect(ctx.statusCode).toBe(404);
		expect(ctx.endpointUrl).toBe(
			"https://dashscope.aliyuncs.com/compatible-mode/v1/messages",
		);
		expect(ctx.preset).toBe("dashscope");
		expect(ctx.apiFormat).toBe("anthropic-messages");
		expect(ctx.model).toBe("MiniMax/MiniMax-M2.7");
		// Empty body → undefined (not "")
		expect(ctx.responseBodySnippet).toBeUndefined();
	});

	it("truncates long response bodies (max 300 + ellipsis)", () => {
		const body = "x".repeat(500);
		const err = fakeApiError({
			message: "Bad",
			statusCode: 400,
			responseBody: body,
		});
		const ctx = buildLLMErrorContext(err, baseRequest);
		expect(ctx.responseBodySnippet?.length).toBeLessThanOrEqual(301);
		expect(ctx.responseBodySnippet?.endsWith("…")).toBe(true);
	});

	it("works with plain Error (no AI SDK fields)", () => {
		const err = new Error("boom");
		const ctx = buildLLMErrorContext(err, baseRequest);
		expect(ctx.statusCode).toBeUndefined();
		expect(ctx.endpointUrl).toBeUndefined();
		expect(ctx.preset).toBe("dashscope");
	});
});

describe("formatLLMErrorMessage", () => {
	it("renders the canonical 404 case with all context", () => {
		const err = fakeApiError({
			message: "Not Found",
			statusCode: 404,
			url: "https://dashscope.aliyuncs.com/compatible-mode/v1/messages",
		});
		const msg = formatLLMErrorMessage(err, baseRequest);
		// shape: "Not Found — HTTP 404, endpoint=..., model=..., apiFormat=..., preset=..."
		expect(msg.startsWith("Not Found —")).toBe(true);
		expect(msg).toContain("HTTP 404");
		expect(msg).toContain("endpoint=https://dashscope.aliyuncs.com");
		expect(msg).toContain("model=MiniMax/MiniMax-M2.7");
		expect(msg).toContain("apiFormat=anthropic-messages");
		expect(msg).toContain("preset=dashscope");
	});

	it("falls back to bare message when there's no context to add", () => {
		const err = new Error("connect ECONNREFUSED");
		const msg = formatLLMErrorMessage(err, {
			providerPreset: undefined,
			apiFormat: undefined,
			baseUrl: "",
			model: "",
		});
		expect(msg).toBe("connect ECONNREFUSED");
	});

	it("accepts non-Error values without throwing", () => {
		expect(formatLLMErrorMessage("oops", baseRequest)).toContain("oops");
		expect(formatLLMErrorMessage(null, baseRequest)).toContain("Stream failed");
	});

	it("surfaces parsed provider error message ahead of SDK message (Bailian SSE)", () => {
		// Real shape from a Bailian 400 when the model isn't activated.
		const body =
			'event:error\ndata:{"code":"InvalidParameter","message":"The product is not activated, please confirm that you have activated products and try again after activation.","request_id":"abc"}\n\n';
		const err = fakeApiError({
			message: "Bad Request",
			statusCode: 400,
			url: "https://dashscope.aliyuncs.com/apps/anthropic/v1/messages",
			responseBody: body,
		});
		const msg = formatLLMErrorMessage(err, baseRequest);
		// Headline now comes from the *provider*, not "Bad Request".
		expect(msg.startsWith("The product is not activated")).toBe(true);
		expect(msg).toContain("code=InvalidParameter");
		expect(msg).toContain("HTTP 400");
		expect(msg).toContain("model=MiniMax/MiniMax-M2.7");
		// Raw body is suppressed when we have a structured error.
		expect(msg).not.toContain("body=");
	});

	it("falls back to raw body when no provider error JSON can be parsed", () => {
		const err = fakeApiError({
			message: "Bad Request",
			statusCode: 400,
			responseBody: "<html>500 Internal Server Error</html>",
		});
		const msg = formatLLMErrorMessage(err, baseRequest);
		expect(msg.startsWith("Bad Request")).toBe(true);
		expect(msg).toContain("body=");
	});
});

describe("parseProviderErrorBody", () => {
	it("parses Bailian SSE error frame", () => {
		const out = parseProviderErrorBody(
			'event:error\ndata:{"code":"InvalidParameter","message":"foo"}\n\n',
		);
		expect(out).toEqual({ code: "InvalidParameter", message: "foo" });
	});

	it("parses an OpenAI-style nested error envelope", () => {
		const out = parseProviderErrorBody(
			'{"error":{"code":"model_not_found","message":"no such model","type":"invalid_request_error"}}',
		);
		expect(out).toEqual({ code: "model_not_found", message: "no such model" });
	});

	it("parses a flat JSON error", () => {
		const out = parseProviderErrorBody(
			'{"code":"rate_limited","message":"slow down"}',
		);
		expect(out).toEqual({ code: "rate_limited", message: "slow down" });
	});

	it("returns null for HTML / plaintext / empty bodies", () => {
		expect(parseProviderErrorBody(undefined)).toBeNull();
		expect(parseProviderErrorBody("")).toBeNull();
		expect(parseProviderErrorBody("<html>oops</html>")).toBeNull();
		expect(parseProviderErrorBody("just text")).toBeNull();
	});

	it("falls back to `type` field when `code` is absent", () => {
		const out = parseProviderErrorBody(
			'{"error":{"type":"authentication_error","message":"bad key"}}',
		);
		expect(out).toEqual({
			code: "authentication_error",
			message: "bad key",
		});
	});
});
