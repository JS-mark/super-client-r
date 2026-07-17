import { describe, expect, it } from "vitest";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";
import type { AgentSDKStreamEvent } from "@super-client/shared-types/agent-sdk";
import type { Message } from "../../stores/chatMessageStore";
import {
	isAskUserQuestionToolName,
	mergeProjectRulesSnapshotSources,
	reduceAgentRuntimeStreamEvent,
	reduceAgentSDKStreamEvent,
	reduceAgentStreamEvent,
	type AgentEventReducerContext,
} from "../useAgentEventReducer";

function createContext(
	overrides: Partial<AgentEventReducerContext> = {},
): AgentEventReducerContext {
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

describe("agent event reducer helpers", () => {
	it("detects AskUserQuestion tool names with optional prefixes", () => {
		expect(isAskUserQuestionToolName("AskUserQuestion")).toBe(true);
		expect(isAskUserQuestionToolName("scp-agent-builtins__ask_user_question")).toBe(
			true,
		);
		expect(isAskUserQuestionToolName("Read")).toBe(false);
	});

	it("merges project rules snapshot into an existing context source", () => {
		const sources = mergeProjectRulesSnapshotSources(
			[
				{
					id: "project-rules",
					kind: "projectRules",
					label: "Project rules runtime check",
					detail: "AGENTS.md / CLAUDE.md",
					injected: false,
				},
			],
			{
				readAt: 1782100000000,
				files: [
					{
						filename: "AGENTS.md",
						byteLength: 20,
						sha256: "abcdef123456",
						truncated: false,
						injected: true,
					},
				],
			},
		);

		expect(sources).toEqual([
			{
				id: "project-rules",
				kind: "projectRules",
				label: "Project rules runtime check",
				detail: "AGENTS.md 20 B sha256:abcdef12",
				bytes: 20,
				injected: true,
			},
		]);
	});
});

describe("reduceAgentSDKStreamEvent", () => {
	it("maps init to session persistence, assistant metadata, and streaming", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "init",
			sessionId: "sdk_session_1",
			status: "ok",
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{
				type: "remember_session",
				sessionId: "sdk_session_1",
				target: "agent-sdk",
			},
			{
				type: "update_message_metadata",
				messageId: "assistant_1",
				metadata: { agentSDKSessionId: "sdk_session_1" },
			},
			{ type: "set_session_status", status: "streaming" },
		]);
	});

	it("maps a preparing chunk to streaming plus assistant append", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "chunk",
			content: "hello",
		};

		expect(
			reduceAgentSDKStreamEvent(
				event,
				createContext({ sessionStatus: "preparing" }),
			),
		).toEqual([
			{ type: "set_session_status", status: "streaming" },
			{ type: "append_assistant_chunk", content: "hello" },
		]);
	});

	it("maps assistant part events onto the last assistant message", () => {
		const assistantPart = {
			type: "assistant.part_delta",
			messageId: "sdk_message_1",
			partId: "part_1",
			delta: "partial",
			ts: 10,
		} as const;
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "assistant_part",
			assistantPart,
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{
				type: "apply_assistant_part",
				messageId: "assistant_1",
				event: assistantPart,
			},
		]);
	});

	it("maps assistant snapshots to content replacement and usage metadata", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "assistant",
			content: 'complete answer\n{"name":"execute_command","arguments":{"command":"pwd"}}\n<|eom|>',
			usage: {
				inputTokens: 5,
				outputTokens: 8,
				cacheReadInputTokens: 2,
				cacheCreationInputTokens: 1,
			},
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{ type: "clear_assistant_stream" },
			{ type: "update_last_message", content: "complete answer" },
			{
				type: "update_message_metadata",
				messageId: "assistant_1",
				metadata: {
					inputTokens: 5,
					outputTokens: 8,
					cacheReadTokens: 2,
					cacheCreationTokens: 1,
				},
			},
		]);
	});

	it("maps a tool call to stream finalization and tool upsert", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "tool_call",
			toolCall: {
				id: "call_1",
				name: "Read",
				input: { path: "README.md" },
				kind: "tool",
				displayName: "Read file",
			},
		};

		expect(
			reduceAgentSDKStreamEvent(
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
					approval: {
						kind: "tool",
						title: undefined,
						description: undefined,
						displayName: "Read file",
					},
				},
				content: "Read file",
			},
		]);
	});

	it("threads runtime subagentRunId onto live tool calls and result patches", () => {
		const callEvent = runtimeBase({
			type: "tool.call",
			callId: "call_sub_1",
			toolName: "Read",
			input: { path: "README.md" },
			subagentRunId: "sub-1",
		});
		const resultEvent = runtimeBase({
			type: "tool.result",
			callId: "call_sub_1",
			content: { kind: "text", text: "ok" },
			isError: false,
			subagentRunId: "sub-1",
		});

		expect(reduceAgentRuntimeStreamEvent(callEvent, createContext())).toContainEqual({
			type: "upsert_tool_message",
			toolUseId: "call_sub_1",
			toolCall: {
				name: "Read",
				input: { path: "README.md" },
				status: "pending",
				subagentRunId: "sub-1",
				approval: { kind: "tool" },
			},
			content: "Tool call: Read",
		});
		expect(reduceAgentRuntimeStreamEvent(resultEvent, createContext())).toContainEqual({
			type: "update_tool_call",
			messageId: "tool_call_sub_1",
			patch: {
				status: "success",
				result: "ok",
				error: undefined,
				duration: undefined,
				subagentRunId: "sub-1",
			},
		});
	});

	it("maps tool errors to an error tool message and streaming status", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "tool_error",
			toolError: {
				id: "call_1",
				name: "Bash",
				input: { command: "exit 1" },
				error: { message: "boom" },
				kind: "tool",
				displayName: "Run command",
			},
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{
				type: "upsert_tool_message",
				toolUseId: "call_1",
				toolCall: {
					name: "Bash",
					input: { command: "exit 1" },
					status: "error",
					result: { message: "boom" },
					error: JSON.stringify({ message: "boom" }),
					approval: {
						kind: "tool",
						title: undefined,
						description: undefined,
						displayName: "Run command",
					},
				},
				content: "Tool error: Run command",
			},
			{ type: "set_session_status", status: "streaming" },
		]);
	});

	it("maps permission requests to an awaiting approval tool patch", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "permission_request",
			permissionRequest: {
				toolUseId: "ask_1",
				toolName: "AskUserQuestion",
				toolInput: { questions: ["Proceed?"] },
				title: "Need input",
			},
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{ type: "clear_assistant_stream" },
			{ type: "set_session_status", status: "tool_calling" },
			{
				type: "upsert_tool_message",
				toolUseId: "ask_1",
				toolCall: {
					name: "AskUserQuestion",
					input: { questions: ["Proceed?"] },
					status: "awaiting_approval",
					approval: {
						kind: "ask-user-question",
						title: "Need input",
						description: undefined,
						displayName: undefined,
						suggestions: undefined,
						blockedPath: undefined,
						decisionReason: undefined,
						agentId: undefined,
					},
				},
				content: "Permission required: AskUserQuestion",
			},
			{ type: "pause_for_approval" },
		]);
	});

	it("maps permission denied to an error tool message", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "permission_denied",
			error: "Blocked by policy",
			toolCall: {
				id: "call_1",
				name: "Write",
				input: { path: "README.md" },
				kind: "permission",
				title: "Write file",
				displayName: "Write",
			},
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{
				type: "upsert_tool_message",
				toolUseId: "call_1",
				toolCall: {
					name: "Write",
					input: { path: "README.md" },
					status: "error",
					error: "Blocked by policy",
					approval: {
						kind: "permission",
						title: "Write file",
						description: undefined,
						displayName: "Write",
					},
				},
				content: "Permission denied: Write",
			},
		]);
	});

	it("maps tool use summaries to terminal tool updates and next assistant", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "tool_use_summary",
			toolSummary: "Read(README.md)",
			precedingToolUseIds: ["call_1"],
		};

		expect(
			reduceAgentSDKStreamEvent(
				event,
				createContext({ streamContent: "partial answer" }),
			),
		).toEqual([
			{ type: "finalize_assistant_stream" },
			{ type: "clear_assistant_stream" },
			{ type: "set_session_status", status: "tool_calling" },
			{
				type: "update_tool_call",
				messageId: "tool_call_1",
				patch: {
					status: "success",
					result: "Read(README.md)",
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
			{ type: "set_session_status", status: "streaming" },
		]);
	});

	it("finalizes stream content on result before terminal reset", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "result",
			result: {
				success: true,
				text: "ignored because stream content wins",
				durationMs: 250,
				numTurns: 2,
				totalCostUsd: 0.01,
				stopReason: "end_turn",
				usage: {
					inputTokens: 10,
					outputTokens: 20,
					cacheReadInputTokens: 3,
					cacheCreationInputTokens: 4,
				},
			},
		};

		expect(
			reduceAgentSDKStreamEvent(
				event,
				createContext({ streamContent: "streamed answer" }),
			),
		).toEqual([
			{ type: "finalize_assistant_stream" },
			{
				type: "update_message_metadata",
				messageId: "assistant_1",
				metadata: {
					duration: 250,
					totalCostUsd: 0.01,
					numTurns: 2,
					inputTokens: 10,
					outputTokens: 20,
					cacheReadTokens: 3,
					cacheCreationTokens: 4,
					tokens: 30,
				},
			},
			{ type: "persist_messages" },
			{ type: "set_session_status", status: "idle" },
			{ type: "clear_assistant_stream" },
			{ type: "complete_request", agentSDKRequest: true },
		]);
	});

	it("maps result metadata, persistence, and terminal reset", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "result",
			result: {
				success: true,
				text: "final answer<|eom|>",
				durationMs: 250,
				numTurns: 2,
				totalCostUsd: 0.01,
				stopReason: "end_turn",
				usage: {
					inputTokens: 10,
					outputTokens: 20,
					cacheReadInputTokens: 3,
					cacheCreationInputTokens: 4,
				},
			},
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{ type: "update_last_message", content: "final answer" },
			{
				type: "update_message_metadata",
				messageId: "assistant_1",
				metadata: {
					duration: 250,
					totalCostUsd: 0.01,
					numTurns: 2,
					inputTokens: 10,
					outputTokens: 20,
					cacheReadTokens: 3,
					cacheCreationTokens: 4,
					tokens: 30,
				},
			},
			{ type: "persist_messages" },
			{ type: "set_session_status", status: "idle" },
			{ type: "clear_assistant_stream" },
			{ type: "complete_request", agentSDKRequest: true },
		]);
	});

	it("maps errors through ErrorCard materialization and terminal reset", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "error",
			error: "provider failed",
			errorContext: {
				preset: "anthropic",
				apiFormat: undefined,
				baseUrl: undefined,
				model: "claude-test",
				statusCode: undefined,
				endpointUrl: undefined,
				responseBodySnippet: undefined,
				providerErrorCode: "bad_request",
				providerErrorMessage: undefined,
			},
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{
				type: "materialize_error",
				summary: "provider failed",
				errorContext: {
					preset: "anthropic",
					apiFormat: undefined,
					baseUrl: undefined,
					model: "claude-test",
					statusCode: undefined,
					endpointUrl: undefined,
					responseBodySnippet: undefined,
					providerErrorCode: "bad_request",
					providerErrorMessage: undefined,
				},
			},
			{ type: "set_session_status", status: "idle" },
			{ type: "clear_assistant_stream" },
			{ type: "complete_request", agentSDKRequest: true },
		]);
	});

	it("maps rate limits to warning actions", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "rate_limit",
			error: "retry later",
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{ type: "rate_limit", message: "Rate limited: retry later" },
		]);
	});

	it("maps status text to transient streaming content for empty assistants", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "status",
			status: "Thinking...",
		};

		expect(reduceAgentSDKStreamEvent(event, createContext())).toEqual([
			{ type: "set_streaming_content", content: "Thinking..." },
		]);
	});

	it("does not clobber an assistant error bubble on a late result", () => {
		const errorMessage: Message = {
			id: "assistant_error",
			role: "assistant",
			content: "failed",
			timestamp: 1,
			type: "error",
		};
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "result",
			result: {
				success: false,
				text: "late text",
				durationMs: 1,
				numTurns: 1,
				totalCostUsd: 0,
				stopReason: "error",
				usage: { inputTokens: 0, outputTokens: 0 },
			},
		};

		expect(
			reduceAgentSDKStreamEvent(
				event,
				createContext({ messages: [errorMessage] }),
			),
		).toEqual([
			{ type: "set_session_status", status: "idle" },
			{ type: "clear_assistant_stream" },
			{ type: "complete_request", agentSDKRequest: true },
		]);
	});

	it("does not repeat terminal cleanup for an already idle result", () => {
		const event: AgentSDKStreamEvent = {
			requestId: "req_1",
			type: "result",
			result: {
				success: true,
				text: "late duplicate",
				durationMs: 250,
				numTurns: 2,
				totalCostUsd: 0.01,
				stopReason: "end_turn",
				usage: {
					inputTokens: 10,
					outputTokens: 20,
				},
			},
		};

		const actions = reduceAgentSDKStreamEvent(
			event,
			createContext({
				sessionStatus: "idle",
				messages: [
					{
						id: "assistant_1",
						role: "assistant",
						content: "already final",
						timestamp: 1,
					},
				],
			}),
		);

		expect(
			actions.filter((action) =>
				["set_session_status", "clear_assistant_stream", "complete_request"].includes(
					action.type,
				),
			),
		).toEqual([]);
	});
});

describe("reduceAgentRuntimeStreamEvent", () => {
	it("maps runtime text deltas through the unified dispatcher", () => {
		const event = runtimeBase({
			type: "text.delta",
			messageId: "runtime_msg_1",
			delta: "hello",
		});

		expect(
			reduceAgentStreamEvent(
				event,
				createContext({ sessionStatus: "preparing" }),
			),
		).toEqual([
			{ type: "set_session_status", status: "streaming" },
			{ type: "append_assistant_chunk", content: "hello" },
		]);
	});

	it("maps runtime assistant part events onto the last assistant message", () => {
		const partEvent = {
			type: "assistant.part_start",
			messageId: "runtime_msg_1",
			part: {
				id: "part_1",
				type: "code_block",
				state: "complete",
				content: "const value = 1;",
				createdAt: 10,
				updatedAt: 10,
			},
			ts: 10,
		} as const;
		const event = runtimeBase({
			type: "assistant.part",
			partEvent,
		});

		expect(reduceAgentRuntimeStreamEvent(event, createContext())).toEqual([
			{
				type: "apply_assistant_part",
				messageId: "assistant_1",
				event: partEvent,
			},
		]);
	});

	it("maps runtime init to native session persistence and assistant metadata", () => {
		const event = runtimeBase({
			type: "init",
			nativeSessionId: "native_session_1",
			projectRulesSnapshot: {
				readAt: 1782100000000,
				files: [
					{
						filename: "AGENTS.md",
						byteLength: 24,
						sha256: "hashagents",
						truncated: false,
						injected: true,
					},
				],
			},
		});

		const actions = reduceAgentRuntimeStreamEvent(
			event,
			createContext({
				messages: [
					{
						id: "assistant_1",
						role: "assistant",
						content: "",
						timestamp: 1,
						metadata: {
							contextSources: [
								{
									id: "project-rules",
									kind: "projectRules",
									label: "Project rules runtime check",
									injected: false,
								},
							],
						},
					},
				],
			}),
		);

		expect(actions).toEqual([
			{
				type: "remember_session",
				sessionId: "native_session_1",
				target: "runtime",
			},
			{
				type: "update_message_metadata",
				messageId: "assistant_1",
				metadata: {
					nativeSessionId: "native_session_1",
					projectRulesSnapshot: {
						readAt: 1782100000000,
						files: [
							{
								filename: "AGENTS.md",
								byteLength: 24,
								sha256: "hashagents",
								truncated: false,
								injected: true,
							},
						],
					},
					contextSources: [
						{
							id: "project-rules",
							kind: "projectRules",
							label: "Project rules runtime check",
							detail: "AGENTS.md 24 B sha256:hashagen",
							bytes: 24,
							injected: true,
						},
					],
				},
			},
			{ type: "set_session_status", status: "streaming" },
		]);
		expect(JSON.stringify(actions)).not.toContain("/repo");
		expect(JSON.stringify(actions)).not.toContain("Always run focused tests");
	});

	it("maps runtime permission requests to awaiting approval", () => {
		const event = runtimeBase({
			type: "permission.request",
			approvalId: "approval_1",
			toolName: "scp-agent-builtins__ask_user_question",
			input: { question: "Proceed?" },
		});

		expect(reduceAgentRuntimeStreamEvent(event, createContext())).toEqual([
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

	it("maps runtime tool result content and creates the next assistant bubble", () => {
		const event = runtimeBase({
			type: "tool.result",
			callId: "call_1",
			content: { kind: "text", text: "file contents" },
			isError: false,
		});

		expect(reduceAgentRuntimeStreamEvent(event, createContext())).toEqual([
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

	it("maps runtime usage to assistant metadata", () => {
		const event = runtimeBase({
			type: "usage",
			inputTokens: 7,
			outputTokens: 11,
			cacheReadTokens: 2,
			cacheWriteTokens: 3,
		});

		expect(reduceAgentRuntimeStreamEvent(event, createContext())).toEqual([
			{
				type: "update_message_metadata",
				messageId: "assistant_1",
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

	it("does not repeat terminal cleanup for an already idle runtime result", () => {
		const event = runtimeBase({
			type: "result",
		});

		expect(
			reduceAgentRuntimeStreamEvent(
				event,
				createContext({ sessionStatus: "idle" }),
			),
		).toEqual([{ type: "persist_messages" }]);
	});

	it("does not repeat terminal cleanup for an already idle runtime error", () => {
		const event = runtimeBase({
			type: "error",
			message: "late duplicate failure",
		});

		expect(
			reduceAgentRuntimeStreamEvent(
				event,
				createContext({ sessionStatus: "idle" }),
			),
		).toEqual([
			{
				type: "materialize_error",
				summary: "late duplicate failure",
				errorContext: undefined,
			},
		]);
	});
});
