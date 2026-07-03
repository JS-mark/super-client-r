import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuntimeClient } from "../agentRuntimeClient";

describe("agentRuntimeClient", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		window.electron = {
			agentRuntime: {
				resolvePermission: vi.fn().mockResolvedValue({ success: true }),
			},
		} as unknown as typeof window.electron;
	});

	it("adapts legacy approval calls to runtime PermissionDecision", async () => {
		await agentRuntimeClient.resolveToolApproval(
			"approval_1",
			true,
			{ answer: "yes" },
			[{ scope: "session" }],
		);

		expect(window.electron.agentRuntime.resolvePermission).toHaveBeenCalledWith({
			id: "approval_1",
			decision: {
				approved: true,
				scope: "session",
				payload: { answer: "yes" },
			},
		});
	});

	it("defaults runtime approval scope to once and carries rejection reason", async () => {
		await agentRuntimeClient.resolveToolApproval("approval_2", false);

		expect(window.electron.agentRuntime.resolvePermission).toHaveBeenCalledWith({
			id: "approval_2",
			decision: {
				approved: false,
				scope: "once",
				reason: "Tool call rejected by user",
			},
		});
	});
});
