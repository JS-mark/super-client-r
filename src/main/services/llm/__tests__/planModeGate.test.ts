// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { applyPlanModeGate } from "../planModeGate";
import type { ChatCompletionRequest } from "../../../ipc/types";

vi.mock("../../runtime/SessionRuntimeResolver", () => ({
	getSessionRuntimeResolver: () => ({
		resolve: () => ({ planMode: "plan-only", workspaceId: "ws-1" }),
	}),
}));
vi.mock("../../runtime/RuntimePolicyService", () => ({
	getRuntimePolicyService: () => ({ record: vi.fn() }),
}));

describe("applyPlanModeGate", () => {
	it("strips tools and prepends a plan-only system note when planMode=plan-only", () => {
		const req = {
			requestId: "r1",
			conversationId: "c1",
			baseUrl: "x",
			apiKey: "x",
			model: "m",
			messages: [{ role: "system", content: "base" }],
			tools: [
				{
					type: "function",
					function: { name: "t", description: "", parameters: {} },
				},
			],
		} as unknown as ChatCompletionRequest;

		const out = applyPlanModeGate(req, async () => "x");
		expect(out.toolExecutor).toBeUndefined();
		expect(out.request.tools).toBeUndefined();
		expect((out.request.messages[0] as { content: string }).content).toMatch(
			/PLAN ONLY mode/,
		);
		expect((out.request.messages[0] as { content: string }).content).toMatch(
			/base$/,
		);
	});
});
