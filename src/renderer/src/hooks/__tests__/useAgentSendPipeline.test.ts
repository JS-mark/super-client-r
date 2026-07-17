import { describe, expect, it, vi } from "vitest";
import {
	buildContextMetadataForRuntime,
	getPinnedContextSources,
	loadRuntimeToolsForRequest,
	persistContextCompactedEventForRuntime,
	prepareHistoryForRuntime,
	prepareHistoryForRuntimeWithSummary,
	resolveModelForRequest,
	runtimeCreateFailureHandler,
} from "../useAgentSendPipeline";
import type { Message } from "../../stores/chatMessageStore";
import type { EffectiveProviderModelResolution } from "../useMessageModelResolution";

function makeResolution(
	overrides?: Partial<EffectiveProviderModelResolution>,
): EffectiveProviderModelResolution {
	return {
		provider: {
			id: "p1",
			name: "Anthropic",
			preset: "anthropic",
			baseUrl: "",
			apiKey: "",
			enabled: true,
			tested: false,
			createdAt: 1,
			updatedAt: 1,
			models: [],
		},
		model: {
			id: "claude-3",
			name: "Claude 3",
			enabled: true,
			capabilities: [],
			category: "chat",
			supportsStreaming: true,
		},
		source: "global",
		sourceLabel: "全局默认",
		...overrides,
	} as EffectiveProviderModelResolution;
}

describe("resolveModelForRequest", () => {
	it("maps a full resolution to a modelInfo snapshot", async () => {
		const resolution = makeResolution();
		const { effective, modelInfo } = await resolveModelForRequest(
			async () => resolution,
		);
		expect(effective).toBe(resolution);
		expect(modelInfo).toEqual({
			model: "claude-3",
			providerPreset: "anthropic",
			providerName: "Anthropic",
			modelSource: "global",
			modelSourceLabel: "全局默认",
		});
	});

	it("falls back to default sentinel values when nothing resolves", async () => {
		const { effective, modelInfo } = await resolveModelForRequest(
			async () => undefined,
		);
		expect(effective).toBeUndefined();
		expect(modelInfo).toEqual({
			model: "agent",
			providerPreset: "anthropic",
			providerName: "Agent runtime",
			modelSource: undefined,
			modelSourceLabel: undefined,
		});
	});
});

describe("loadRuntimeToolsForRequest", () => {
	it("loads MCP tools and skips skill tools when no activeSkillId", async () => {
		const mcpLoader = vi.fn(async () => [
			{
				serverId: "srv1",
				tool: { name: "read_file", description: "d", inputSchema: {} },
			},
		]);
		const skillLoader = vi.fn(async () => []);
		const bindings = await loadRuntimeToolsForRequest({
			requestId: "req1",
			connectedMcpServerIds: ["srv1"],
			mcpToolsLoader: mcpLoader,
			skillToolsLoader: skillLoader,
		});
		expect(mcpLoader).toHaveBeenCalledOnce();
		expect(skillLoader).not.toHaveBeenCalled();
		expect(bindings).toHaveLength(1);
		expect(bindings[0].name).toBe("srv1__read_file");
	});

	it("includes skill tools when activeSkillId is provided", async () => {
		const bindings = await loadRuntimeToolsForRequest({
			requestId: "req1",
			activeSkillId: "sk-1",
			connectedMcpServerIds: [],
			mcpToolsLoader: async () => [],
			skillToolsLoader: async () => [
				{
					skillId: "sk-1",
					tool: { name: "hello", description: "d", inputSchema: {} },
				},
			],
		});
		expect(bindings).toHaveLength(1);
		expect(bindings[0].name).toBe("skill-sk-1__hello");
	});

	it("degrades gracefully to [] when the MCP loader throws", async () => {
		const warn = vi.fn();
		const bindings = await loadRuntimeToolsForRequest({
			requestId: "req1",
			connectedMcpServerIds: ["srv1"],
			mcpToolsLoader: async () => {
				throw new Error("mcp offline");
			},
			skillToolsLoader: async () => [],
			log: { warn },
		});
		expect(bindings).toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			"Agent runtime MCP tools unavailable",
			expect.objectContaining({ requestId: "req1", error: "mcp offline" }),
		);
	});

	it("filters MCP tools by connectedMcpServerIds", async () => {
		const bindings = await loadRuntimeToolsForRequest({
			requestId: "req1",
			connectedMcpServerIds: ["srv1"],
			mcpToolsLoader: async () => [
				{
					serverId: "srv1",
					tool: { name: "a", description: "d", inputSchema: {} },
				},
				{
					serverId: "srv-offline",
					tool: { name: "b", description: "d", inputSchema: {} },
				},
			],
			skillToolsLoader: async () => [],
		});
		expect(bindings.map((b) => b.name)).toEqual(["srv1__a"]);
	});
});

describe("prepareHistoryForRuntime", () => {
	function message(id: string, role: Message["role"], content: string): Message {
		return { id, role, content, timestamp: Number(id.slice(1)) || 1 };
	}

	it("excludes the current user turn and assistant placeholder", () => {
		const result = prepareHistoryForRuntime({
			messages: [
				message("m1", "user", "first"),
				message("m2", "assistant", "second"),
				message("m3", "user", "current"),
				message("m4", "assistant", ""),
			],
			contextCount: -1,
			contextMode: "full",
			contextWindow: null,
			systemPromptText: "",
			runtimeTools: [],
		});
		expect(result.history).toEqual([
			{ role: "user", content: [{ type: "text", text: "first" }] },
			{ role: "assistant", content: [{ type: "text", text: "second" }] },
		]);
	});

	it("honors contextCount as a hard sliding window", () => {
		const result = prepareHistoryForRuntime({
			messages: [
				message("m1", "user", "one"),
				message("m2", "assistant", "two"),
				message("m3", "user", "three"),
				message("m4", "assistant", "four"),
				message("m5", "user", "current"),
				message("m6", "assistant", ""),
			],
			contextCount: 2,
			contextMode: "full",
			contextWindow: null,
			systemPromptText: "",
			runtimeTools: [],
		});
		expect(result.metadata.strategy).toBe("sliding");
		expect(result.metadata.historyCount).toBe(2);
		expect(result.history.map((item) => item.content[0])).toEqual([
			{ type: "text", text: "three" },
			{ type: "text", text: "four" },
		]);
	});

	it("returns contextCompacted marker when compact mode summarizes history", () => {
		const result = prepareHistoryForRuntime({
			messages: [
				message("m1", "user", "one"),
				message("m2", "assistant", "two"),
				message("m3", "user", "three"),
				message("m4", "assistant", "four"),
				message("m5", "user", "current"),
				message("m6", "assistant", ""),
			],
			contextCount: -1,
			contextMode: "compact",
			contextWindow: null,
			systemPromptText: "",
			runtimeTools: [],
		});
		expect(result.metadata.strategy).toBe("compact");
		expect(result.metadata.compacted).toBe(true);
		expect(result.contextCompacted?.compacted).toBe(true);
		expect(result.contextCompacted?.originalCount).toBe(2);
		expect(result.contextCompactedEvent).toMatchObject({
			summaryMessageId: expect.stringContaining("context_summary_"),
			originalCount: 2,
			summarySource: "fallback",
			strategy: {
				strategy: "compact",
				compacted: true,
			},
		});
	});

	it("uses injected LLM summarizer when compacting context", async () => {
		const summarizeContext = vi.fn(async () => "LLM summary of prior context");
		const result = await prepareHistoryForRuntimeWithSummary({
			messages: [
				message("m1", "user", "one"),
				message("m2", "assistant", "two"),
				message("m3", "user", "three"),
				message("m4", "assistant", "four"),
				message("m5", "user", "current"),
				message("m6", "assistant", ""),
			],
			contextCount: -1,
			contextMode: "compact",
			contextWindow: null,
			systemPromptText: "",
			runtimeTools: [],
			summarizeContext,
		});

		expect(summarizeContext).toHaveBeenCalledWith({
			text: expect.stringContaining("user: one"),
			originalCount: 2,
			strategy: "compact",
		});
		expect(result.contextCompacted?.summary).toBe(
			"LLM summary of prior context",
		);
		expect(result.contextCompactedEvent).toMatchObject({
			summary: "LLM summary of prior context",
			summarySource: "llm",
		});
		expect(result.history[0].content[0]).toEqual({
			type: "text",
			text: "LLM summary of prior context",
		});
	});
});

describe("buildContextMetadataForRuntime", () => {
	it("builds source chips and strategy metadata from the send context", () => {
		const metadata = buildContextMetadataForRuntime({
			promptContext: {
				cwd: "/repo",
				mcpServerNames: ["filesystem"],
				customSystemPrompt: "system",
				prompt: "prompt",
				attachmentCount: 2,
				searchResultCount: 3,
				warnings: [],
			},
			historyMetadata: {
				mode: "auto",
				strategy: "summarized",
				historyCount: 4,
				omittedCount: 2,
				estimatedTokens: 900,
				availableForMessages: 800,
				compacted: true,
			},
			runtimeToolCount: 1,
		});
		expect(metadata.contextSources.map((source) => source.kind)).toEqual([
			"systemPrompt",
			"projectRules",
			"attachment",
			"search",
			"history",
			"other",
		]);
		expect(metadata.contextStrategy).toEqual({
			mode: "auto",
			strategy: "summarized",
			historyCount: 4,
			omittedCount: 2,
			estimatedTokens: 900,
			availableForMessages: 800,
			compacted: true,
		});
	});

	it("preserves pinned source state across regenerated metadata", () => {
		const metadata = buildContextMetadataForRuntime({
			promptContext: {
				cwd: "/repo",
				mcpServerNames: [],
				customSystemPrompt: "",
				prompt: "prompt",
				attachmentCount: 0,
				searchResultCount: 0,
				warnings: [],
			},
			historyMetadata: {
				mode: "auto",
				strategy: "full",
				historyCount: 0,
				omittedCount: 0,
				estimatedTokens: 100,
				availableForMessages: 1000,
				compacted: false,
			},
			runtimeToolCount: 0,
			pinnedSources: [
				{
					id: "project-rules",
					kind: "projectRules",
					label: "Project rules",
					pinned: true,
					injected: false,
				},
				{
					id: "search-results",
					kind: "search",
					label: "Previous search",
					pinned: true,
					injected: true,
				},
			],
		});
		expect(
			metadata.contextSources.find((source) => source.id === "project-rules")
				?.pinned,
		).toBe(true);
		expect(
			metadata.contextSources.some((source) => source.id === "search-results"),
		).toBe(false);
	});
});

describe("getPinnedContextSources", () => {
	it("returns pinned sources from the latest context metadata message", () => {
		const messages: Message[] = [
			{
				id: "a1",
				role: "assistant",
				content: "old",
				timestamp: 1,
				metadata: {
					contextSources: [
						{
							id: "system-prompt",
							kind: "systemPrompt",
							label: "System prompt",
							pinned: true,
						},
					],
				},
			} as Message,
			{
				id: "a2",
				role: "assistant",
				content: "new",
				timestamp: 2,
				metadata: {
					contextSources: [
						{
							id: "project-rules",
							kind: "projectRules",
							label: "Project rules",
							pinned: true,
						},
						{
							id: "conversation-history",
							kind: "history",
							label: "1 history message",
						},
					],
				},
			} as Message,
		];
		expect(getPinnedContextSources(messages)).toEqual([
			{
				id: "project-rules",
				kind: "projectRules",
				label: "Project rules",
				pinned: true,
			},
		]);
	});
});

describe("persistContextCompactedEventForRuntime", () => {
	it("appends a replayable compact summary session event", async () => {
		const appendSessionEvent = vi.fn(async () => undefined);
		await persistContextCompactedEventForRuntime(
			{
				conversationId: "session-1",
				requestId: "req-1",
				runtimeId: "run-1",
				model: "claude-3",
				contextCompactedEvent: {
					summaryMessageId: "context-summary-1",
					summary: "Summary of earlier context",
					originalCount: 3,
					compactedAt: 1782100001000,
					estimatedTokens: 512,
					summarySource: "fallback",
					strategy: {
						mode: "compact",
						strategy: "compact",
						historyCount: 4,
						omittedCount: 3,
						estimatedTokens: 512,
						availableForMessages: null,
						compacted: true,
					},
				},
			},
			{ appendSessionEvent },
		);

		expect(appendSessionEvent).toHaveBeenCalledWith(
			"session-1",
			expect.objectContaining({
				type: "assistant_message",
				id: "context-summary-1",
				content: "Summary of earlier context",
				eventId:
					"context-req-1:context.compacted:context-summary-1:1782100001000:3",
				metadata: expect.objectContaining({
					contextCompacted: expect.objectContaining({
						compacted: true,
						originalCount: 3,
					}),
					contextStrategy: expect.objectContaining({
						strategy: "compact",
					}),
				}),
			}),
		);
	});

	it("swallows append failures and logs a warning", async () => {
		const warn = vi.fn();
		await persistContextCompactedEventForRuntime(
			{
				conversationId: "session-1",
				requestId: "req-1",
				runtimeId: "run-1",
				contextCompactedEvent: {
					summaryMessageId: "context-summary-1",
					summary: "Summary",
					originalCount: 1,
					compactedAt: 1782100001000,
					summarySource: "fallback",
					strategy: {
						mode: "compact",
						strategy: "compact",
						historyCount: 2,
						omittedCount: 1,
						estimatedTokens: 128,
						availableForMessages: null,
						compacted: true,
					},
				},
			},
			{
				appendSessionEvent: async () => {
					throw new Error("disk full");
				},
				log: { warn },
			},
		);

		expect(warn).toHaveBeenCalledWith(
			"Context compacted event persistence failed",
			expect.objectContaining({
				requestId: "req-1",
				conversationId: "session-1",
				error: "disk full",
			}),
		);
	});
});

describe("runtimeCreateFailureHandler", () => {
	function makeDeps() {
		return {
			materializeError: vi.fn(),
			setSessionStatus: vi.fn(),
			clearAssistantStream: vi.fn(),
			clearCurrentRequest: vi.fn(),
			clearWatchdog: vi.fn(),
		};
	}

	it('classifies as "agent_runtime_create_failed" when requestType is "runtime"', () => {
		const deps = makeDeps();
		runtimeCreateFailureHandler(
			new Error("boom"),
			{
				requestType: "runtime",
				modelInfo: {
					model: "claude-3",
					providerPreset: "anthropic",
					providerName: "Anthropic",
				},
			},
			deps,
		);
		expect(deps.materializeError).toHaveBeenCalledWith(
			"boom",
			expect.objectContaining({
				providerErrorCode: "agent_runtime_create_failed",
				providerErrorMessage: "boom",
				preset: "anthropic",
				model: "claude-3",
			}),
		);
		expect(deps.setSessionStatus).toHaveBeenCalledWith("idle");
		expect(deps.clearAssistantStream).toHaveBeenCalledOnce();
		expect(deps.clearCurrentRequest).toHaveBeenCalledOnce();
		expect(deps.clearWatchdog).toHaveBeenCalledOnce();
	});

	it('classifies as "agent_create_query_ipc_failed" when requestType is null (pre-runtime failure)', () => {
		const deps = makeDeps();
		runtimeCreateFailureHandler(
			new Error("pre-runtime"),
			{ requestType: null, modelInfo: null },
			deps,
		);
		expect(deps.materializeError).toHaveBeenCalledWith(
			"pre-runtime",
			expect.objectContaining({
				providerErrorCode: "agent_create_query_ipc_failed",
				providerErrorMessage: "pre-runtime",
			}),
		);
	});

	it("coerces non-Error thrown values to strings", () => {
		const deps = makeDeps();
		runtimeCreateFailureHandler(
			"raw string",
			{ requestType: null, modelInfo: null },
			deps,
		);
		expect(deps.materializeError).toHaveBeenCalledWith(
			"raw string",
			expect.objectContaining({ providerErrorMessage: "raw string" }),
		);
	});
});
