// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AgentQueryRequest,
	AgentRuntimeStreamEvent,
} from "@super-client/shared-types/agent-runtime";
import type { ChatStreamEvent } from "../../../../ipc/types";

// Module-level mocks must be hoisted so vi.mock factories can capture them.
const {
	subscribers,
	chatCompletionMock,
	resolveToolApprovalMock,
	stopStreamMock,
} = vi.hoisted(() => ({
	subscribers: new Map<string, Array<(e: unknown) => void>>(),
	chatCompletionMock: vi.fn(),
	resolveToolApprovalMock: vi.fn(),
	stopStreamMock: vi.fn(),
}));

vi.mock("../../../llm/LLMService", () => ({
	llmService: {
		subscribeRequestEvents(
			requestId: string,
			cb: (e: ChatStreamEvent) => void,
		) {
			if (!subscribers.has(requestId)) subscribers.set(requestId, []);
			subscribers.get(requestId)!.push(cb as (e: unknown) => void);
			return () => subscribers.delete(requestId);
		},
		chatCompletion: chatCompletionMock,
		resolveToolApproval: resolveToolApprovalMock,
		stopStream: stopStreamMock,
	},
}));

vi.mock("../../../../store/StoreManager", () => ({
	storeManager: {
		getModelProviders: () => [
			{
				id: "prov-1",
				name: "DashScope",
				preset: "dashscope",
				baseUrl: "https://x.test/v1",
				apiKey: "sk-yyy",
				enabled: true,
				tested: true,
				apiFormat: "chat-completions",
				models: [{ id: "qwen-flash", enabled: true }],
				createdAt: 0,
				updatedAt: 0,
			},
		],
	},
}));

import { ClaudeCodeAgentRuntime } from "../ClaudeCodeAgentRuntime";

function pushEventsAndDone(reqId: string, events: ChatStreamEvent[]) {
	const subs = subscribers.get(reqId) ?? [];
	for (const ev of events) for (const cb of subs) cb(ev);
}

function makeReq(overrides: Partial<AgentQueryRequest> = {}): AgentQueryRequest {
	return {
		requestId: "r1",
		conversationId: "c1",
		prompt: { kind: "text", text: "hello" },
		history: [],
		runtime: {
			model: { providerId: "prov-1", modelId: "qwen-flash" },
		} as never,
		tools: [],
		cwd: "/tmp",
		signal: new AbortController().signal,
		...overrides,
	} as AgentQueryRequest;
}

describe("ClaudeCodeAgentRuntime", () => {
	beforeEach(() => {
		subscribers.clear();
		chatCompletionMock.mockReset();
		resolveToolApprovalMock.mockReset();
		stopStreamMock.mockReset();
	});

	it("createQuery yields init + text.delta + message.final + result", async () => {
		chatCompletionMock.mockImplementationOnce(async (req) => {
			pushEventsAndDone(req.requestId, [
				{ requestId: req.requestId, type: "chunk", content: "Hi" },
				{ requestId: req.requestId, type: "chunk", content: "!" },
				{
					requestId: req.requestId,
					type: "done",
					usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
				},
			]);
		});

		const runtime = new ClaudeCodeAgentRuntime();
		const out: AgentRuntimeStreamEvent[] = [];
		for await (const ev of runtime.createQuery(makeReq())) out.push(ev);
		const types = out.map((e) => e.type);
		expect(types[0]).toBe("init");
		expect(types).toContain("text.delta");
		expect(types).toContain("message.final");
		expect(types).toContain("result");
	});

	it("threads provider config (baseUrl/apiKey/model/preset/apiFormat) into LLMService request", async () => {
		chatCompletionMock.mockImplementationOnce(async (req) => {
			pushEventsAndDone(req.requestId, [
				{ requestId: req.requestId, type: "done" },
			]);
		});

		const runtime = new ClaudeCodeAgentRuntime();
		const out: AgentRuntimeStreamEvent[] = [];
		for await (const ev of runtime.createQuery(makeReq())) out.push(ev);

		expect(chatCompletionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				baseUrl: "https://x.test/v1",
				apiKey: "sk-yyy",
				model: "qwen-flash",
				providerPreset: "dashscope",
				apiFormat: "chat-completions",
			}),
			expect.any(Function),
		);
	});

	it("adds 8 builtin tools to the chat request tools[] array", async () => {
		chatCompletionMock.mockImplementationOnce(async (req) => {
			pushEventsAndDone(req.requestId, [
				{ requestId: req.requestId, type: "done" },
			]);
		});

		const runtime = new ClaudeCodeAgentRuntime();
		const out: AgentRuntimeStreamEvent[] = [];
		for await (const ev of runtime.createQuery(makeReq())) out.push(ev);

		const call = chatCompletionMock.mock.calls[0][0] as {
			tools: Array<{ function: { name: string } }>;
		};
		const names = call.tools.map((t) => t.function.name);
		for (const n of [
			"Read",
			"Write",
			"Edit",
			"Bash",
			"Grep",
			"Glob",
			"WebFetch",
			"Task",
		]) {
			expect(names).toContain(n);
		}
	});

	it("resolvePermission forwards to llmService.resolveToolApproval", async () => {
		const runtime = new ClaudeCodeAgentRuntime();
		await runtime.resolvePermission("tc1", {
			approved: true,
			source: "user",
		} as never);
		expect(resolveToolApprovalMock).toHaveBeenCalledWith("tc1", true);
	});

	it("interrupt forwards to llmService.stopStream", async () => {
		const runtime = new ClaudeCodeAgentRuntime();
		await runtime.interrupt("r1");
		expect(stopStreamMock).toHaveBeenCalledWith("r1");
	});

	it("descriptor exposes llm-loop runtime id and v1 schema", () => {
		const runtime = new ClaudeCodeAgentRuntime();
		expect(runtime.descriptor.id).toBe("llm-loop");
		expect(runtime.descriptor.schemaVersion).toBe(1);
		expect(runtime.descriptor.capabilities.streaming).toBe(true);
	});
});
