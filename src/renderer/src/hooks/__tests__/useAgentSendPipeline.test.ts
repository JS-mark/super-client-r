import { describe, expect, it, vi } from "vitest";
import {
	loadRuntimeToolsForRequest,
	resolveModelForRequest,
	runtimeCreateFailureHandler,
} from "../useAgentSendPipeline";
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
