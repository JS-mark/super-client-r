// @vitest-environment node
/**
 * Unit tests for the LLM HTTP route controller (src/main/server/routes/llm.ts).
 *
 * These tests exercise the controller methods directly with a minimal mock
 * `ctx`, rather than booting a real LocalServer. The SSE chat-completion
 * endpoint's real-HTTP recursion is already covered end-to-end by
 * agentBuiltinsServer.e2e.test.ts; here we cover the request-validation and
 * error-translation branches of the simpler endpoints (fetchModels,
 * testConnection) that have no direct unit coverage.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchModelsMock, testConnectionMock } = vi.hoisted(() => ({
	fetchModelsMock: vi.fn(),
	testConnectionMock: vi.fn(),
}));

vi.mock("../../../services/llm", () => ({
	llmService: {
		fetchModels: fetchModelsMock,
		testConnection: testConnectionMock,
	},
}));

// buildToolExecutorFromRequest is imported by llm.ts at module top; stub it
// so module load doesn't pull heavier deps. Only chatCompletion uses it,
// which these tests don't exercise.
vi.mock("../../../services/llm/toolExecutorFactory", () => ({
	buildToolExecutorFromRequest: vi.fn(),
}));

import { LLMController } from "../llm";
import type Koa from "koa";

interface MockCtx {
	status: number;
	body: unknown;
	request: { body: unknown };
}

function makeCtx(body: unknown): MockCtx {
	return { status: 0, body: undefined, request: { body } };
}

describe("LLMController.fetchModels", () => {
	beforeEach(() => {
		fetchModelsMock.mockReset();
	});

	it("returns 400 when baseUrl is missing", async () => {
		const ctx = makeCtx({ apiKey: "sk-x" }) as unknown as Koa.Context;
		await new LLMController().fetchModels(ctx);
		expect((ctx as unknown as MockCtx).status).toBe(400);
		expect((ctx as unknown as MockCtx).body).toMatchObject({
			code: 400,
			message: "baseUrl is required",
		});
		expect(fetchModelsMock).not.toHaveBeenCalled();
	});

	it("returns 200 with models on success", async () => {
		fetchModelsMock.mockResolvedValue([
			{ id: "gpt-4", name: "GPT-4" },
		]);
		const ctx = makeCtx({
			baseUrl: "https://prov.test/v1",
			apiKey: "sk-x",
		}) as unknown as Koa.Context;
		await new LLMController().fetchModels(ctx);
		expect((ctx as unknown as MockCtx).status).toBe(200);
		expect((ctx as unknown as MockCtx).body).toMatchObject({
			code: 200,
			message: "Success",
			data: { models: [{ id: "gpt-4", name: "GPT-4" }] },
		});
		expect(fetchModelsMock).toHaveBeenCalledWith(
			"https://prov.test/v1",
			"sk-x",
			undefined,
		);
	});

	it("returns 500 with the error message when llmService throws", async () => {
		fetchModelsMock.mockRejectedValue(new Error("upstream 503"));
		const ctx = makeCtx({
			baseUrl: "https://prov.test/v1",
			apiKey: "sk-x",
		}) as unknown as Koa.Context;
		await new LLMController().fetchModels(ctx);
		expect((ctx as unknown as MockCtx).status).toBe(500);
		expect((ctx as unknown as MockCtx).body).toMatchObject({
			code: 500,
			message: "upstream 503",
		});
	});

	it("passes an empty-string apiKey when none is provided", async () => {
		fetchModelsMock.mockResolvedValue([]);
		const ctx = makeCtx({ baseUrl: "https://prov.test/v1" }) as unknown as Koa.Context;
		await new LLMController().fetchModels(ctx);
		expect(fetchModelsMock).toHaveBeenCalledWith(
			"https://prov.test/v1",
			"",
			undefined,
		);
	});
});

describe("LLMController.testConnection", () => {
	beforeEach(() => {
		testConnectionMock.mockReset();
	});

	it("returns 400 when baseUrl is missing", async () => {
		const ctx = makeCtx({ apiKey: "sk-x" }) as unknown as Koa.Context;
		await new LLMController().testConnection(ctx);
		expect((ctx as unknown as MockCtx).status).toBe(400);
		expect((ctx as unknown as MockCtx).body).toMatchObject({
			code: 400,
			message: "baseUrl is required",
		});
		expect(testConnectionMock).not.toHaveBeenCalled();
	});

	it("returns 200 with the connectivity result on success", async () => {
		testConnectionMock.mockResolvedValue({ ok: true, latencyMs: 42 });
		const ctx = makeCtx({
			baseUrl: "https://prov.test/v1",
			apiKey: "sk-x",
		}) as unknown as Koa.Context;
		await new LLMController().testConnection(ctx);
		expect((ctx as unknown as MockCtx).status).toBe(200);
		expect((ctx as unknown as MockCtx).body).toMatchObject({
			code: 200,
			data: { ok: true, latencyMs: 42 },
		});
	});

	it("returns 500 with error message when llmService throws", async () => {
		testConnectionMock.mockRejectedValue(new Error("timeout"));
		const ctx = makeCtx({
			baseUrl: "https://prov.test/v1",
			apiKey: "sk-x",
		}) as unknown as Koa.Context;
		await new LLMController().testConnection(ctx);
		expect((ctx as unknown as MockCtx).status).toBe(500);
		expect((ctx as unknown as MockCtx).body).toMatchObject({
			code: 500,
			message: "timeout",
		});
	});
});
