import { describe, expect, it } from "vitest";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";
import type { Message } from "@super-client/shared-types/chat";
import {
	adaptAgentRuntimeStreamEventToReducerActions,
	buildAgentRuntimePromptText,
	buildAgentRuntimeToolBindings,
	type AgentRuntimeEventAdapterContext,
} from "../agentRuntimeStreamAdapter";

function createContext(
	overrides: Partial<AgentRuntimeEventAdapterContext> = {},
): AgentRuntimeEventAdapterContext {
	return {
		messages: [
			{
				id: "assistant_1",
				role: "assistant",
				content: "",
				timestamp: 1,
			},
		],
		sessionStatus: "streaming",
		streamContent: "",
		modelInfo: {
			model: "claude-test",
			providerPreset: "anthropic",
			providerName: "Anthropic",
		},
		now: () => 100,
		makeId: (prefix) => `${prefix}_next`,
		...overrides,
	};
}

function runtimeBase(
	patch: Partial<AgentRuntimeStreamEvent>,
): AgentRuntimeStreamEvent {
	return {
		v: 1,
		requestId: "req_1",
		conversationId: "conv_1",
		seq: 1,
		runtime: "llm-loop",
		timestamp: 10,
		...patch,
	} as AgentRuntimeStreamEvent;
}

describe("adaptAgentRuntimeStreamEventToReducerActions", () => {
	it("maps init to runtime session memory and streaming status", () => {
		const event = runtimeBase({
			type: "init",
			nativeSessionId: "native_1",
		});

		expect(adaptAgentRuntimeStreamEventToReducerActions(event, createContext()))
			.toEqual([
				{
					type: "remember_session",
					sessionId: "native_1",
					target: "runtime",
				},
				{
					type: "update_message_metadata",
					messageId: "assistant_1",
					metadata: { nativeSessionId: "native_1" },
				},
				{ type: "set_session_status", status: "streaming" },
			]);
	});

	it("maps text deltas to streaming status and assistant chunk append", () => {
		const event = runtimeBase({
			type: "text.delta",
			messageId: "runtime_msg_1",
			delta: "hello",
		});

		expect(
			adaptAgentRuntimeStreamEventToReducerActions(
				event,
				createContext({ sessionStatus: "preparing" }),
			),
		).toEqual([
			{ type: "set_session_status", status: "streaming" },
			{ type: "append_assistant_chunk", content: "hello" },
		]);
	});

	it("maps final messages to the last assistant message", () => {
		const event = runtimeBase({
			type: "message.final",
			messageId: "runtime_msg_1",
			text: "complete answer",
		});

		expect(adaptAgentRuntimeStreamEventToReducerActions(event, createContext()))
			.toEqual([
				{ type: "clear_assistant_stream" },
				{ type: "update_last_message", content: "complete answer" },
			]);
	});

	it("maps tool calls to a pending tool message", () => {
		const event = runtimeBase({
			type: "tool.call",
			callId: "call_1",
			toolName: "Read",
			input: { path: "README.md" },
		});

		expect(
			adaptAgentRuntimeStreamEventToReducerActions(
				event,
				createContext({ streamContent: "partial answer" }),
			),
		).toEqual([
			{ type: "finalize_assistant_stream" },
			{ type: "clear_assistant_stream" },
			{ type: "set_session_status", status: "tool_calling" },
			{
				type: "upsert_tool_message",
				toolUseId: "call_1",
				toolCall: {
					name: "Read",
					input: { path: "README.md" },
					status: "pending",
					approval: { kind: "tool" },
				},
				content: "Tool call: Read",
			},
		]);
	});

	it("maps tool results to a tool patch and next assistant bubble", () => {
		const event = runtimeBase({
			type: "tool.result",
			callId: "call_1",
			content: { kind: "text", text: "file contents" },
			isError: false,
		});

		expect(adaptAgentRuntimeStreamEventToReducerActions(event, createContext()))
			.toEqual([
				{ type: "set_session_status", status: "streaming" },
				{
					type: "update_tool_call",
					messageId: "tool_call_1",
					patch: {
						status: "success",
						result: "file contents",
						error: undefined,
						duration: undefined,
					},
				},
				{
					type: "add_message",
					message: {
						id: "assistant_next",
						role: "assistant",
						content: "",
						timestamp: 100,
						metadata: {
							model: "claude-test",
							providerPreset: "anthropic",
							providerName: "Anthropic",
						},
					},
				},
			]);
	});

	it("maps permission requests to an awaiting approval tool message", () => {
		const event = runtimeBase({
			type: "permission.request",
			approvalId: "approval_1",
			toolName: "scp-agent-builtins__ask_user_question",
			input: { question: "Proceed?" },
		});

		expect(adaptAgentRuntimeStreamEventToReducerActions(event, createContext()))
			.toEqual([
				{ type: "clear_assistant_stream" },
				{ type: "set_session_status", status: "tool_calling" },
				{
					type: "upsert_tool_message",
					toolUseId: "approval_1",
					toolCall: {
						name: "scp-agent-builtins__ask_user_question",
						input: { question: "Proceed?" },
						status: "awaiting_approval",
						approval: { kind: "ask-user-question" },
					},
					content: "Permission required: scp-agent-builtins__ask_user_question",
				},
				{ type: "pause_for_approval" },
			]);
	});

	it("maps permission resolutions to pending or rejected tool patches", () => {
		const approved = runtimeBase({
			type: "permission.resolved",
			approvalId: "approval_1",
			source: "user",
			decision: {
				approved: true,
				scope: "once",
				payload: { answer: "yes" },
			},
		});
		const rejected = runtimeBase({
			type: "permission.resolved",
			approvalId: "approval_2",
			source: "user",
			decision: {
				approved: false,
				scope: "once",
				reason: "No",
			},
		});

		expect(
			adaptAgentRuntimeStreamEventToReducerActions(approved, createContext()),
		).toEqual([
			{
				type: "update_tool_call",
				messageId: "tool_approval_1",
				patch: {
					status: "pending",
					result: { answer: "yes" },
				},
			},
		]);
		expect(
			adaptAgentRuntimeStreamEventToReducerActions(rejected, createContext()),
		).toEqual([
			{
				type: "update_tool_call",
				messageId: "tool_approval_2",
				patch: {
					status: "error",
					error: "No",
				},
			},
		]);
	});

	it("maps result to persistence and terminal actions", () => {
		const event = runtimeBase({
			type: "result",
			reason: "completed",
			finalMessageId: "runtime_msg_1",
		});

		expect(
			adaptAgentRuntimeStreamEventToReducerActions(
				event,
				createContext({ streamContent: "partial answer" }),
			),
		).toEqual([
			{ type: "finalize_assistant_stream" },
			{ type: "persist_messages" },
			{ type: "set_session_status", status: "idle" },
			{ type: "clear_assistant_stream" },
			{ type: "complete_request", agentSDKRequest: false },
		]);
	});

	it("maps errors to materialized errors and terminal actions", () => {
		const errorContext = {
			preset: "claude-code",
			apiFormat: "anthropic",
			baseUrl: "https://api.anthropic.com",
			model: "claude-test",
			statusCode: 500,
			endpointUrl: "https://api.anthropic.com/v1/messages",
			responseBodySnippet: "Runtime failed",
			providerErrorCode: "Internal",
			providerErrorMessage: "Runtime failed",
		};
		const event = runtimeBase({
			type: "error",
			fatal: true,
			code: "Internal",
			message: "Runtime failed",
			errorContext,
		});

		expect(adaptAgentRuntimeStreamEventToReducerActions(event, createContext()))
			.toEqual([
				{
					type: "materialize_error",
					summary: "Runtime failed",
					errorContext,
				},
				{ type: "set_session_status", status: "idle" },
				{ type: "clear_assistant_stream" },
				{ type: "complete_request", agentSDKRequest: false },
			]);
	});

	it("maps usage to the last assistant message metadata", () => {
		const messages: Message[] = [
			{ id: "user_1", role: "user", content: "hi", timestamp: 1 },
			{ id: "assistant_2", role: "assistant", content: "", timestamp: 2 },
		];
		const event = runtimeBase({
			type: "usage",
			inputTokens: 7,
			outputTokens: 11,
			cacheReadTokens: 2,
			cacheWriteTokens: 3,
		});

		expect(
			adaptAgentRuntimeStreamEventToReducerActions(
				event,
				createContext({ messages }),
			),
		).toEqual([
			{
				type: "update_message_metadata",
				messageId: "assistant_2",
				metadata: {
					inputTokens: 7,
					outputTokens: 11,
					cacheReadTokens: 2,
					cacheCreationTokens: 3,
					tokens: 18,
				},
			},
		]);
	});

	it("maps rate limits to a user-facing rate limit action", () => {
		const event = runtimeBase({
			type: "rate_limit",
			retryAfterMs: 1000,
			message: "Slow down",
		});

		expect(adaptAgentRuntimeStreamEventToReducerActions(event, createContext()))
			.toEqual([{ type: "rate_limit", message: "Slow down" }]);
	});
});

describe("agent runtime send adapter helpers", () => {
	it("prefixes custom system prompt into runtime prompt text", () => {
		expect(
			buildAgentRuntimePromptText("Read the repo", "Be concise."),
		).toBe("Be concise.\n\n--- User Request ---\nRead the repo");
		expect(buildAgentRuntimePromptText("Read the repo", "   ")).toBe(
			"Read the repo",
		);
	});

	it("builds runtime tool bindings for connected MCP servers and active skill", () => {
		expect(
			buildAgentRuntimeToolBindings({
				connectedMcpServerIds: ["@scp/fetch"],
				mcpTools: [
					{
						serverId: "@scp/fetch",
						tool: {
							name: "read_url",
							description: "Read URL",
							inputSchema: { type: "object" },
						},
					},
					{
						serverId: "offline",
						tool: {
							name: "ignored",
							description: "Ignored",
							inputSchema: { type: "object" },
						},
					},
				],
				activeSkillId: "writer",
				skillTools: [
					{
						skillId: "writer",
						tool: {
							name: "draft",
							description: "Draft text",
							inputSchema: { type: "object", properties: {} },
						},
					},
					{
						skillId: "other",
						tool: {
							name: "ignored",
							description: "Ignored",
							inputSchema: { type: "object" },
						},
					},
				],
			}),
		).toEqual([
			{
				name: "scp-fetch__read_url",
				description: "Read URL",
				inputSchema: { type: "object" },
				origin: {
					kind: "mcp",
					serverId: "@scp/fetch",
					realName: "read_url",
				},
			},
			{
				name: "skill-writer__draft",
				description: "Draft text",
				inputSchema: { type: "object", properties: {} },
				origin: {
					kind: "skill",
					serverId: "writer",
					realName: "draft",
				},
			},
		]);
	});
});
