// @vitest-environment node

import { describe, expect, it } from "vitest";
import { AgentSDKService } from "../AgentSDKService";

describe("AgentSDKService.convertSDKMessage", () => {
	it("converts assistant tool_use blocks into tool_call events", () => {
		const service = new AgentSDKService();
		const events = service.convertSDKMessage("req-1", {
			type: "assistant",
			session_id: "sdk-1",
			parent_tool_use_id: null,
			uuid: "m1",
			message: {
				content: [
					{ type: "text", text: "I need one decision." },
					{
						type: "tool_use",
						id: "tool-ask",
						name: "AskUserQuestion",
						input: {
							questions: [
								{
									header: "Mode",
									question: "Which mode?",
									multiSelect: false,
									options: [
										{ label: "Fast", description: "Move quickly" },
										{ label: "Safe", description: "Check first" },
									],
								},
							],
						},
					},
				],
				usage: { input_tokens: 1, output_tokens: 2 },
			},
		} as any);

		expect(Array.isArray(events)).toBe(true);
		const list = events as any[];
		expect(list[0]).toMatchObject({
			type: "assistant",
			content: "I need one decision.",
		});
		expect(list[1]).toMatchObject({
			type: "tool_call",
			toolCall: {
				id: "tool-ask",
				name: "AskUserQuestion",
				kind: "ask-user-question",
			},
		});
	});

	it("passes through tool_use_summary ids", () => {
		const service = new AgentSDKService();
		const event = service.convertSDKMessage("req-1", {
			type: "tool_use_summary",
			session_id: "sdk-1",
			uuid: "m2",
			summary: "Read file",
			preceding_tool_use_ids: ["tool-1"],
		} as any) as any;

		expect(event).toMatchObject({
			type: "tool_use_summary",
			toolSummary: "Read file",
			precedingToolUseIds: ["tool-1"],
		});
	});
});

describe("AgentSDKService.resolvePermission", () => {
	it("resolves allow with updated input and permissions", () => {
		const service = new AgentSDKService();
		let resolved: unknown;
		(service as any).pendingPermissions.set("tool-1", {
			resolve: (result: unknown) => {
				resolved = result;
			},
		});

		const updatedInput = { answers: { "Which mode?": "Safe" } };
		const updatedPermissions = [
			{
				type: "addRules",
				rules: [{ toolName: "Bash", ruleContent: "git status" }],
				behavior: "allow",
				destination: "session",
			},
		];

		expect(
			service.resolvePermission(
				"tool-1",
				true,
				updatedInput,
				updatedPermissions,
			),
		).toBe(true);
		expect(resolved).toEqual({
			behavior: "allow",
			updatedInput,
			updatedPermissions,
		});
	});

	it("resolves deny", () => {
		const service = new AgentSDKService();
		let resolved: unknown;
		(service as any).pendingPermissions.set("tool-2", {
			resolve: (result: unknown) => {
				resolved = result;
			},
		});

		expect(service.resolvePermission("tool-2", false)).toBe(true);
		expect(resolved).toEqual({ behavior: "deny", message: "User denied" });
	});
});
