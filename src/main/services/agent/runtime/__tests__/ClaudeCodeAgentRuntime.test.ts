// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AgentQueryRequest,
	AgentRuntimeStreamEvent,
} from "@super-client/shared-types/agent-runtime";

const { localServerMock, getOrCreateApiKeyMock } = vi.hoisted(() => ({
	localServerMock: { getPort: vi.fn(() => 31337) },
	getOrCreateApiKeyMock: vi.fn(() => "sk-self"),
}));

vi.mock("../../../../server", () => ({
	localServer: localServerMock,
}));
vi.mock("../../../../server/config", () => ({
	getOrCreateApiKey: getOrCreateApiKeyMock,
}));

vi.mock("../../../../store/StoreManager", () => ({
	storeManager: {
		getModelProviders: () => [
			{
				id: "prov-1",
				name: "Test Provider",
				preset: "openai",
				baseUrl: "https://prov.test/v1",
				apiKey: "sk-prov",
				apiFormat: "chat-completions",
				enabled: true,
				tested: true,
				models: [{ id: "test-model", name: "test-model", enabled: true }],
				createdAt: 0,
				updatedAt: 0,
			},
		],
	},
}));

import { ClaudeCodeAgentRuntime } from "../ClaudeCodeAgentRuntime";

function sseBody(
	events: Array<{ event: string; data: unknown }>,
): ReadableStream<Uint8Array> {
	const text = events
		.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
		.join("");
	const enc = new TextEncoder();
	return new ReadableStream({
		start(ctrl) {
			ctrl.enqueue(enc.encode(text));
			ctrl.close();
		},
	});
}

function makeReq(
	overrides: Partial<AgentQueryRequest> = {},
): AgentQueryRequest {
	return {
		requestId: "r1",
		conversationId: "c1",
		prompt: { kind: "text", text: "hello" },
		history: [],
		runtime: {
			model: { providerId: "prov-1", modelId: "test-model" },
		} as never,
		tools: [],
		cwd: "/tmp",
		signal: new AbortController().signal,
		...overrides,
	} as AgentQueryRequest;
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
let lastFetchUrl = "";
let lastFetchInit: RequestInit | undefined;
let respondWith: () => Response = () =>
	new Response(sseBody([{ event: "done", data: {} }]), {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});

beforeEach(() => {
	lastFetchUrl = "";
	lastFetchInit = undefined;
	respondWith = () =>
		new Response(sseBody([{ event: "done", data: {} }]), {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});
	fetchSpy = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async (input, init) => {
			lastFetchUrl = String(input);
			lastFetchInit = init;
			return respondWith();
		});
});

afterEach(() => {
	fetchSpy.mockRestore();
});

describe("ClaudeCodeAgentRuntime", () => {
	it("createQuery fetches localhost /v1/llm/chat/completions with Bearer auth", async () => {
		respondWith = () =>
			new Response(
				sseBody([
					{ event: "chunk", data: { content: "Hi" } },
					{ event: "done", data: {} },
				]),
				{ status: 200, headers: { "content-type": "text/event-stream" } },
			);

		const runtime = new ClaudeCodeAgentRuntime();
		const events: AgentRuntimeStreamEvent[] = [];
		for await (const ev of runtime.createQuery(makeReq())) events.push(ev);

		expect(lastFetchUrl).toBe(
			"http://127.0.0.1:31337/v1/llm/chat/completions",
		);
		expect(lastFetchInit?.method).toBe("POST");
		const headers = lastFetchInit?.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer sk-self");
		expect(headers["Content-Type"]).toBe("application/json");

		const types = events.map((e) => e.type);
		expect(types[0]).toBe("init");
		expect(types).toContain("text.delta");
		expect(types).toContain("result");
	});

	it("buildChatRequest emits scp-agent-builtins__X tool names + toolMapping", async () => {
		const runtime = new ClaudeCodeAgentRuntime();
		for await (const _ev of runtime.createQuery(makeReq())) {
			/* drain */
		}
		const body = JSON.parse(String(lastFetchInit?.body));
		const names = body.tools.map(
			(t: { function: { name: string } }) => t.function.name,
		);
		expect(names).toContain("scp-agent-builtins__Read");
		expect(names).toContain("scp-agent-builtins__Task");
		expect(body.toolMapping["scp-agent-builtins__Read"]).toEqual({
			serverId: "@scp/agent-builtins",
			toolName: "Read",
		});
		expect(body.toolMapping["scp-agent-builtins__Task"]).toEqual({
			serverId: "@scp/agent-builtins",
			toolName: "Task",
		});
	});

	it("threads provider config (baseUrl/apiKey/model/preset/apiFormat) into request body", async () => {
		const runtime = new ClaudeCodeAgentRuntime();
		for await (const _ev of runtime.createQuery(makeReq())) {
			/* drain */
		}
		const body = JSON.parse(String(lastFetchInit?.body));
		expect(body.baseUrl).toBe("https://prov.test/v1");
		expect(body.apiKey).toBe("sk-prov");
		expect(body.model).toBe("test-model");
		expect(body.providerPreset).toBe("openai");
		expect(body.apiFormat).toBe("chat-completions");
	});

	it("emits error event when HTTP returns non-2xx", async () => {
		respondWith = () =>
			new Response("server boom", {
				status: 500,
				headers: { "content-type": "text/plain" },
			});

		const runtime = new ClaudeCodeAgentRuntime();
		const events: AgentRuntimeStreamEvent[] = [];
		for await (const ev of runtime.createQuery(makeReq())) events.push(ev);

		const err = events.find((e) => e.type === "error") as {
			message?: string;
		};
		expect(err).toBeDefined();
		expect(err?.message).toMatch(/HTTP 500/);
	});

	it("resolvePermission POSTs /v1/llm/tool-approval with body", async () => {
		const runtime = new ClaudeCodeAgentRuntime();
		await runtime.resolvePermission("tc1", { approved: true } as never);
		const approvalCalls = fetchSpy.mock.calls.filter((c: unknown[]) =>
			String(c[0]).endsWith("/v1/llm/tool-approval"),
		);
		expect(approvalCalls.length).toBe(1);
		const init = approvalCalls[0][1] as RequestInit | undefined;
		const body = JSON.parse(String(init?.body));
		expect(body).toEqual({ toolCallId: "tc1", approved: true });
	});

	it("interrupt POSTs /v1/llm/stop with requestId", async () => {
		const runtime = new ClaudeCodeAgentRuntime();
		await runtime.interrupt("r1");
		const stopCalls = fetchSpy.mock.calls.filter((c: unknown[]) =>
			String(c[0]).endsWith("/v1/llm/stop"),
		);
		expect(stopCalls.length).toBe(1);
		const init = stopCalls[0][1] as RequestInit | undefined;
		const body = JSON.parse(String(init?.body));
		expect(body).toEqual({ requestId: "r1" });
	});

	it("descriptor still exposes llm-loop runtime id", () => {
		const runtime = new ClaudeCodeAgentRuntime();
		expect(runtime.descriptor.id).toBe("llm-loop");
		expect(runtime.descriptor.schemaVersion).toBe(1);
	});
});
