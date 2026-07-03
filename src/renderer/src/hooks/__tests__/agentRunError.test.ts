import { describe, expect, it } from "vitest";
import type {
	LLMErrorContext,
	Message,
} from "@super-client/shared-types/chat";
import {
	buildMergedErrorContext,
	computeErrorRichness,
	materializeStreamErrorPatch,
} from "../agentRunError";

function mkMsg(
	partial: Partial<Message> & Pick<Message, "id" | "role">,
): Message {
	return {
		content: "",
		timestamp: 1,
		...partial,
	} as Message;
}

describe("computeErrorRichness", () => {
	it("scores 0 for undefined / empty context", () => {
		expect(computeErrorRichness(undefined)).toBe(0);
		expect(computeErrorRichness({})).toBe(0);
	});

	it("adds 1 point each for statusCode, responseBodySnippet, stack", () => {
		expect(computeErrorRichness({ statusCode: 500 })).toBe(1);
		expect(
			computeErrorRichness({ responseBodySnippet: "boom" }),
		).toBe(1);
		expect(computeErrorRichness({ stack: "at foo" })).toBe(1);
		expect(
			computeErrorRichness({
				statusCode: 400,
				responseBodySnippet: "b",
				stack: "s",
			}),
		).toBe(3);
	});

	it("statusCode: 0 still counts (undefined-vs-defined check)", () => {
		expect(computeErrorRichness({ statusCode: 0 })).toBe(1);
	});
});

describe("buildMergedErrorContext", () => {
	it("prefers incoming values, falls back to modelInfo", () => {
		const merged = buildMergedErrorContext(
			{
				preset: undefined,
				apiFormat: undefined,
				model: undefined,
			},
			{
				providerPreset: "dashscope",
				apiFormat: "chat-completions",
				model: "qwen-max",
			},
		);
		expect(merged.preset).toBe("dashscope");
		expect(merged.apiFormat).toBe("chat-completions");
		expect(merged.model).toBe("qwen-max");
	});

	it("propagates statusCode / providerErrorCode / stack from incoming", () => {
		const merged = buildMergedErrorContext(
			{
				statusCode: 401,
				providerErrorCode: "unauthorized",
				stack: "at foo",
			},
			undefined,
		);
		expect(merged.statusCode).toBe(401);
		expect(merged.providerErrorCode).toBe("unauthorized");
		expect(merged.stack).toBe("at foo");
	});

	it("omits stack when incoming has none (keeps LLMErrorContext optional)", () => {
		const merged = buildMergedErrorContext({}, {});
		expect("stack" in merged).toBe(false);
	});
});

describe("materializeStreamErrorPatch", () => {
	it("returns prestream reason when there is no assistant bubble", () => {
		const result = materializeStreamErrorPatch({
			messages: [mkMsg({ id: "u1", role: "user", content: "hi" })],
			summary: "boom",
		});
		expect(result.reason).toBe("prestream");
		expect(result.patch).toBeNull();
	});

	it("prestream / fallback path picks up modelInfo when incoming context is absent", () => {
		// Same fallback path exercised through the normal midstream flow —
		// when we DO have a bubble but no context, model info should flow into
		// mergedContext.
		const messages: Message[] = [
			mkMsg({ id: "u1", role: "user", content: "trigger" }),
			mkMsg({ id: "a1", role: "assistant", content: "" }),
		];
		const result = materializeStreamErrorPatch({
			messages,
			summary: "runtime unavailable",
			modelInfo: {
				providerPreset: "anthropic",
				model: "claude-3-5",
				apiFormat: "anthropic-messages",
			},
		});
		expect(result.reason).toBe("midstream");
		expect(result.patch).not.toBeNull();
		expect(result.patch?.messageId).toBe("a1");
		expect(result.patch?.patch.summary).toBe("runtime unavailable");
		expect(result.patch?.patch.errorContext).toMatchObject({
			preset: "anthropic",
			model: "claude-3-5",
			apiFormat: "anthropic-messages",
		});
		expect(result.patch?.patch.query).toBe("trigger");
	});

	it("propagates code and providerErrorCode into errorContext", () => {
		const messages: Message[] = [
			mkMsg({ id: "a1", role: "assistant", content: "" }),
		];
		const result = materializeStreamErrorPatch({
			messages,
			summary: "provider said no",
			errorContext: {
				providerErrorCode: "rate_limited",
				providerErrorMessage: "too many",
				statusCode: 429,
			},
		});
		expect(result.reason).toBe("midstream");
		expect(result.patch?.patch.errorContext.providerErrorCode).toBe(
			"rate_limited",
		);
		expect(result.patch?.patch.errorContext.providerErrorMessage).toBe(
			"too many",
		);
		expect(result.patch?.patch.errorContext.statusCode).toBe(429);
	});

	it("skips (postcomplete) when a weaker follow-up hits a richer prior error", () => {
		const richContext: LLMErrorContext = {
			preset: "anthropic",
			apiFormat: "anthropic-messages",
			baseUrl: "https://api",
			model: "claude",
			statusCode: 502,
			endpointUrl: "https://api/v1/messages",
			responseBodySnippet: "gateway error",
			providerErrorCode: "upstream_error",
			providerErrorMessage: "gateway error",
			stack: "at translator",
		};
		const messages: Message[] = [
			mkMsg({
				id: "a1",
				role: "assistant",
				content: "translator error",
				type: "error",
				metadata: { errorContext: richContext },
			}),
		];
		const result = materializeStreamErrorPatch({
			messages,
			summary: "Bad Request",
			errorContext: { providerErrorMessage: "Bad Request" },
		});
		expect(result.reason).toBe("postcomplete");
		expect(result.patch).toBeNull();
	});

	it("allows a richer follow-up to overwrite a leaner prior error", () => {
		const messages: Message[] = [
			mkMsg({
				id: "a1",
				role: "assistant",
				content: "lean",
				type: "error",
				metadata: {
					errorContext: {
						preset: undefined,
						apiFormat: undefined,
						baseUrl: undefined,
						model: undefined,
						statusCode: undefined,
						endpointUrl: undefined,
						responseBodySnippet: undefined,
						providerErrorCode: undefined,
						providerErrorMessage: "lean",
					},
				},
			}),
		];
		const result = materializeStreamErrorPatch({
			messages,
			summary: "detailed",
			errorContext: {
				statusCode: 500,
				responseBodySnippet: "boom",
				stack: "at t",
			},
		});
		expect(result.reason).toBe("midstream");
		expect(result.patch?.patch.errorContext.statusCode).toBe(500);
	});

	it("attaches triggering user query when present", () => {
		const messages: Message[] = [
			mkMsg({ id: "u1", role: "user", content: "who am i" }),
			mkMsg({ id: "a1", role: "assistant", content: "" }),
		];
		const result = materializeStreamErrorPatch({
			messages,
			summary: "boom",
		});
		expect(result.patch?.patch.query).toBe("who am i");
	});

	it("omits query when there is no preceding user message", () => {
		const messages: Message[] = [
			mkMsg({ id: "a1", role: "assistant", content: "" }),
		];
		const result = materializeStreamErrorPatch({
			messages,
			summary: "boom",
		});
		expect(result.patch?.patch.query).toBeUndefined();
	});
});
