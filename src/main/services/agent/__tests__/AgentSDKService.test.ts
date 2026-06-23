// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getRuntimePolicyService } from "../../runtime/RuntimePolicyService";
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

	it("converts text stream events into assistant_part events while keeping chunk compatibility", () => {
		const service = new AgentSDKService();
		const start = service.convertSDKMessage("req-1", {
			type: "stream_event",
			session_id: "sdk-1",
			uuid: "m-stream",
			event: {
				type: "content_block_start",
				index: 0,
				content_block: { type: "text", text: "" },
			},
		} as any) as any;
		expect(start).toMatchObject({
			type: "assistant_part",
			assistantPart: {
				type: "assistant.part_start",
				messageId: "m-stream",
				part: {
					id: "sdk_part_0",
					type: "text",
					state: "streaming",
					content: "",
				},
			},
		});

		const delta = service.convertSDKMessage("req-1", {
			type: "stream_event",
			session_id: "sdk-1",
			uuid: "m-stream",
			event: {
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: "hello" },
			},
		} as any) as any[];
		expect(delta).toHaveLength(2);
		expect(delta[0]).toMatchObject({
			type: "assistant_part",
			assistantPart: {
				type: "assistant.part_delta",
				messageId: "m-stream",
				partId: "sdk_part_0",
				delta: "hello",
			},
		});
		expect(delta[1]).toMatchObject({
			type: "chunk",
			content: "hello",
		});

		const stop = service.convertSDKMessage("req-1", {
			type: "stream_event",
			session_id: "sdk-1",
			uuid: "m-stream",
			event: { type: "content_block_stop", index: 0 },
		} as any) as any;
		expect(stop).toMatchObject({
			type: "assistant_part",
			assistantPart: {
				type: "assistant.part_done",
				messageId: "m-stream",
				partId: "sdk_part_0",
			},
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

describe("AgentSDKService runtime policy gate", () => {
	it("allows Agent SDK tool permission without a session but records audit-only", () => {
		const runtimePolicy = getRuntimePolicyService();
		runtimePolicy.clearAuditLog();

		const service = new AgentSDKService();
		const result = (
			service as unknown as {
				evaluateAgentToolRuntimePolicy: (
					conversationId: string | undefined,
					toolName: string,
					input: Record<string, unknown>,
				) => { allowed: boolean };
			}
		).evaluateAgentToolRuntimePolicy(undefined, "execute_command", {
			command: "pwd",
		});

		expect(result.allowed).toBe(true);
		expect(runtimePolicy.getAuditLog().at(-1)).toMatchObject({
			source: "agent-sdk",
			operation: "execute_command",
			kind: "command-exec",
			target: "pwd",
			decision: "audit-only",
			reason: "no-session",
		});
	});
});
