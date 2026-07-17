import { useCallback } from "react";
import type {
	AgentRuntimeStreamEvent,
	ToolResultContent,
} from "@super-client/shared-types/agent-runtime";
import type { AgentSDKStreamEvent } from "@super-client/shared-types/agent-sdk";
import type {
	AssistantPartEvent,
	ChatSessionStatus,
	MessageContextSource,
	ProjectRulesSnapshotDto,
} from "@super-client/shared-types/chat";
import type { Message, ToolCall } from "../stores/chatMessageStore";
import { sanitizeAssistantContent } from "../lib/assistantContent";

export interface AgentEventModelInfo {
	model: string;
	providerPreset: string;
	providerName: string;
}

export interface AgentEventReducerContext {
	messages: Message[];
	sessionStatus: ChatSessionStatus;
	streamContent: string;
	modelInfo?: AgentEventModelInfo | null;
	now: () => number;
	makeId: (prefix: "assistant" | "agent_tool") => string;
}

export type AgentEventReducerAction =
	| { type: "set_session_status"; status: ChatSessionStatus }
	| { type: "append_assistant_chunk"; content: string }
	| { type: "finalize_assistant_stream" }
	| { type: "clear_assistant_stream" }
	| { type: "set_streaming_content"; content: string }
	| { type: "add_message"; message: Message }
	| {
			type: "upsert_tool_message";
			toolUseId: string;
			toolCall: Partial<ToolCall> & Pick<ToolCall, "name" | "input">;
			content?: string;
	  }
	| {
			type: "update_tool_call";
			messageId: string;
			patch: Partial<ToolCall>;
	  }
	| {
			type: "update_message_metadata";
			messageId: string;
			metadata: Partial<NonNullable<Message["metadata"]>>;
	  }
	| {
			type: "apply_assistant_part";
			messageId: string;
			event: AssistantPartEvent;
	  }
	| { type: "update_last_message"; content: string }
	| { type: "materialize_error"; summary: string; errorContext?: unknown }
	| { type: "pause_for_approval" }
	| { type: "remember_session"; sessionId: string; target: "agent-sdk" | "runtime" }
	| { type: "persist_messages" }
	| { type: "complete_request"; agentSDKRequest?: boolean }
	| { type: "rate_limit"; message: string };

export type AgentEventReducerResult = AgentEventReducerAction[];

export function getToolMessageId(toolUseId: string): string {
	return `tool_${toolUseId}`;
}

export function isAskUserQuestionToolName(toolName: string): boolean {
	const bareName = toolName.toLowerCase().split("__").pop() ?? toolName;
	return bareName === "askuserquestion" || bareName === "ask_user_question";
}

export function coerceToolInput(input: unknown): Record<string, unknown> {
	if (input && typeof input === "object" && !Array.isArray(input)) {
		return input as Record<string, unknown>;
	}
	return input === undefined ? {} : { value: input };
}

export function buildAssistantMessage(
	context: AgentEventReducerContext,
): Message {
	const modelInfo = context.modelInfo ?? undefined;
	return {
		id: context.makeId("assistant"),
		role: "assistant",
		content: "",
		timestamp: context.now(),
		metadata: modelInfo
			? {
					model: modelInfo.model,
					providerPreset: modelInfo.providerPreset,
					providerName: modelInfo.providerName,
				}
			: undefined,
	};
}

function lastAssistantMessage(messages: Message[]): Message | undefined {
	return [...messages].reverse().find((msg) => msg.role === "assistant");
}

function lastMessage(messages: Message[]): Message | undefined {
	return messages[messages.length - 1];
}

function projectRulesSnapshotDetail(snapshot: ProjectRulesSnapshotDto): string {
	return snapshot.files
		.map((file) => {
			const hash = file.sha256 ? ` sha256:${file.sha256.slice(0, 8)}` : "";
			const truncated = file.truncated ? " truncated" : "";
			return `${file.filename} ${file.byteLength} B${truncated}${hash}`;
		})
		.join(" · ");
}

export function mergeProjectRulesSnapshotSources(
	sources: readonly MessageContextSource[] | undefined,
	snapshot: ProjectRulesSnapshotDto,
): MessageContextSource[] {
	const base = sources ? [...sources] : [];
	if (snapshot.files.length === 0) return base;
	const bytes = snapshot.files.reduce((sum, file) => sum + file.byteLength, 0);
	const projectRulesSource: MessageContextSource = {
		id: "project-rules",
		kind: "projectRules",
		label: "Project rules",
		detail: projectRulesSnapshotDetail(snapshot),
		bytes,
		injected: snapshot.files.some((file) => file.injected),
	};
	const existingIndex = base.findIndex(
		(source) =>
			source.id === projectRulesSource.id || source.kind === "projectRules",
	);
	if (existingIndex === -1) return [...base, projectRulesSource];
	return base.map((source, index) =>
		index === existingIndex
			? {
					...source,
					detail: projectRulesSource.detail,
					bytes: projectRulesSource.bytes,
					injected: projectRulesSource.injected,
				}
			: source,
	);
}

function terminalActions(
	context: AgentEventReducerContext,
	agentSDKRequest?: boolean,
): AgentEventReducerAction[] {
	if (context.sessionStatus === "idle") return [];
	return [
		{ type: "set_session_status", status: "idle" },
		{ type: "clear_assistant_stream" },
		{ type: "complete_request", agentSDKRequest },
	];
}

function actionsBeforeToolPatch(
	context: AgentEventReducerContext,
): AgentEventReducerAction[] {
	return [
		...(context.streamContent ? [{ type: "finalize_assistant_stream" } as const] : []),
		{ type: "clear_assistant_stream" },
		{ type: "set_session_status", status: "tool_calling" },
	];
}

function toolResultText(content: ToolResultContent): unknown {
	switch (content.kind) {
		case "text":
			return content.text;
		case "error":
			return content.message;
		case "structured":
			return content.data;
		default:
			return content;
	}
}

function finalAssistantContent(content: string): string {
	return sanitizeAssistantContent(content).trim();
}

function updateToolResultActions(
	context: AgentEventReducerContext,
	args: {
		toolUseId: string;
		result: unknown;
		isError?: boolean;
		duration?: number;
		subagentRunId?: string;
	},
): AgentEventReducerAction[] {
	return [
		{ type: "set_session_status", status: "streaming" },
		{
			type: "update_tool_call",
			messageId: getToolMessageId(args.toolUseId),
			patch: {
				status: args.isError ? "error" : "success",
				result: args.result,
				error: args.isError ? String(args.result) : undefined,
				duration: args.duration,
				...(args.subagentRunId
					? { subagentRunId: args.subagentRunId }
					: {}),
			},
		},
		{ type: "add_message", message: buildAssistantMessage(context) },
	];
}

export function reduceAgentSDKStreamEvent(
	event: AgentSDKStreamEvent,
	context: AgentEventReducerContext,
): AgentEventReducerResult {
	switch (event.type) {
		case "init": {
			const actions: AgentEventReducerAction[] = [];
			if (event.sessionId) {
				actions.push({
					type: "remember_session",
					sessionId: event.sessionId,
					target: "agent-sdk",
				});
				const lastAssistant = lastMessage(context.messages);
				if (lastAssistant?.role === "assistant") {
					actions.push({
						type: "update_message_metadata",
						messageId: lastAssistant.id,
						metadata: { agentSDKSessionId: event.sessionId },
					});
				}
			}
			actions.push({ type: "set_session_status", status: "streaming" });
			return actions;
		}

		case "chunk":
			if (!event.content) return [];
			return [
				...(context.sessionStatus === "preparing"
					? [{ type: "set_session_status", status: "streaming" } as const]
					: []),
				{ type: "append_assistant_chunk", content: event.content },
			];

		case "assistant_part": {
			if (!event.assistantPart) return [];
			const assistant = lastAssistantMessage(context.messages);
			if (!assistant) return [];
			return [
				{
					type: "apply_assistant_part",
					messageId: assistant.id,
					event: event.assistantPart,
				},
			];
		}

		case "assistant": {
			const actions: AgentEventReducerAction[] = [];
			if (event.content) {
				actions.push(
					{ type: "clear_assistant_stream" },
					{
						type: "update_last_message",
						content: finalAssistantContent(event.content),
					},
				);
			}
			if (event.usage) {
				const assistant = lastMessage(context.messages);
				if (assistant?.role === "assistant") {
					actions.push({
						type: "update_message_metadata",
						messageId: assistant.id,
						metadata: {
							inputTokens: event.usage.inputTokens,
							outputTokens: event.usage.outputTokens,
							cacheReadTokens: event.usage.cacheReadInputTokens,
							cacheCreationTokens: event.usage.cacheCreationInputTokens,
						},
					});
				}
			}
			return actions;
		}

		case "tool_call":
			if (!event.toolCall) return [];
			return [
				...actionsBeforeToolPatch(context),
				{
					type: "upsert_tool_message",
					toolUseId: event.toolCall.id,
					toolCall: {
						name: event.toolCall.name,
						input: event.toolCall.input || {},
						status: "pending",
						...(event.subagentRunId
							? { subagentRunId: event.subagentRunId }
							: {}),
						approval: {
							kind: event.toolCall.kind,
							title: event.toolCall.title,
							description: event.toolCall.description,
							displayName: event.toolCall.displayName,
						},
					},
					content:
						event.toolCall.displayName ||
						event.toolCall.title ||
						`Tool call: ${event.toolCall.name}`,
				},
			];

		case "tool_use_summary": {
			const actions: AgentEventReducerAction[] = [
				...actionsBeforeToolPatch(context),
			];
			if (event.precedingToolUseIds?.length) {
				for (const toolUseId of event.precedingToolUseIds) {
					actions.push({
						type: "update_tool_call",
						messageId: getToolMessageId(toolUseId),
						patch: {
							status: "success",
							result: event.toolSummary || "Tool execution",
						},
					});
				}
			} else {
				const toolUseId = context.makeId("agent_tool");
				const toolName = event.toolSummary?.split("(")[0]?.trim() || "tool";
				actions.push({
					type: "upsert_tool_message",
					toolUseId,
					toolCall: {
						name: toolName,
						input: {},
						status: "success",
						result: event.toolSummary || "Tool execution",
					},
					content: event.toolSummary || "Tool execution",
				});
			}
			actions.push(
				{ type: "add_message", message: buildAssistantMessage(context) },
				{ type: "set_session_status", status: "streaming" },
			);
			return actions;
		}

		case "tool_error":
			if (!event.toolError) return [];
			return [
				{
					type: "upsert_tool_message",
					toolUseId: event.toolError.id,
					toolCall: {
						name: event.toolError.name,
						input: event.toolError.input || {},
						status: "error",
						...(event.subagentRunId
							? { subagentRunId: event.subagentRunId }
							: {}),
						result: event.toolError.error,
						error:
							typeof event.toolError.error === "string"
								? event.toolError.error
								: JSON.stringify(event.toolError.error),
						approval: {
							kind: event.toolError.kind,
							title: event.toolError.title,
							description: event.toolError.description,
							displayName: event.toolError.displayName,
						},
					},
					content: `Tool error: ${event.toolError.displayName || event.toolError.name}`,
				},
				{ type: "set_session_status", status: "streaming" },
			];

		case "permission_request":
			if (!event.permissionRequest) return [];
			return [
				...actionsBeforeToolPatch(context),
				{
					type: "upsert_tool_message",
					toolUseId: event.permissionRequest.toolUseId,
					toolCall: {
						name: event.permissionRequest.toolName,
						input: event.permissionRequest.toolInput || {},
						status: "awaiting_approval",
						...(event.subagentRunId
							? { subagentRunId: event.subagentRunId }
							: {}),
						approval: {
							kind: isAskUserQuestionToolName(event.permissionRequest.toolName)
								? "ask-user-question"
								: "permission",
							title: event.permissionRequest.title,
							description: event.permissionRequest.description,
							displayName: event.permissionRequest.displayName,
							suggestions: event.permissionRequest.suggestions,
							blockedPath: event.permissionRequest.blockedPath,
							decisionReason: event.permissionRequest.decisionReason,
							agentId: event.permissionRequest.agentId,
						},
					},
					content: `Permission required: ${
						event.permissionRequest.displayName ||
						event.permissionRequest.toolName
					}`,
				},
				{ type: "pause_for_approval" },
			];

		case "permission_denied":
			if (!event.toolCall) return [];
			return [
				{
					type: "upsert_tool_message",
					toolUseId: event.toolCall.id,
					toolCall: {
						name: event.toolCall.name,
						input: event.toolCall.input || {},
						status: "error",
						...(event.subagentRunId
							? { subagentRunId: event.subagentRunId }
							: {}),
						error: event.error || "Permission denied",
						approval: {
							kind: "permission",
							title: event.toolCall.title,
							description: event.toolCall.description,
							displayName: event.toolCall.displayName,
						},
					},
					content: `Permission denied: ${
						event.toolCall.displayName || event.toolCall.name
					}`,
				},
			];

		case "result": {
			const assistant = lastAssistantMessage(context.messages);
			if (assistant?.type === "error") {
				return terminalActions(context, true);
			}
			const actions: AgentEventReducerAction[] = [];
			if (context.streamContent) {
				actions.push({ type: "finalize_assistant_stream" });
			} else if (
				event.result?.text &&
				assistant &&
				!assistant.content.trim()
			) {
				actions.push({
					type: "update_last_message",
					content: finalAssistantContent(event.result.text),
				});
			}
			if (event.result && assistant) {
				actions.push({
					type: "update_message_metadata",
					messageId: assistant.id,
					metadata: {
						duration: event.result.durationMs,
						totalCostUsd: event.result.totalCostUsd,
						numTurns: event.result.numTurns,
						inputTokens: event.result.usage?.inputTokens,
						outputTokens: event.result.usage?.outputTokens,
						cacheReadTokens: event.result.usage?.cacheReadInputTokens,
						cacheCreationTokens:
							event.result.usage?.cacheCreationInputTokens,
						tokens:
							(event.result.usage?.inputTokens || 0) +
							(event.result.usage?.outputTokens || 0),
					},
				});
			}
			return [
				...actions,
				{ type: "persist_messages" },
				...terminalActions(context, true),
			];
		}

		case "error":
			return [
				{
					type: "materialize_error",
					summary: event.error || "Agent execution failed",
					errorContext: event.errorContext,
				},
				...terminalActions(context, true),
			];

		case "rate_limit":
			return [
				{
					type: "rate_limit",
					message: `Rate limited: ${event.error || "Please wait..."}`,
				},
			];

		case "status": {
			const assistant = lastAssistantMessage(context.messages);
			if (
				event.status &&
				!context.streamContent &&
				assistant?.content.trim() === ""
			) {
				return [{ type: "set_streaming_content", content: event.status }];
			}
			return [];
		}
	}
}

export function reduceAgentRuntimeStreamEvent(
	event: AgentRuntimeStreamEvent,
	context: AgentEventReducerContext,
): AgentEventReducerResult {
	switch (event.type) {
		case "init": {
			const actions: AgentEventReducerAction[] = [];
			const lastAssistant = lastMessage(context.messages);
			const metadata: Partial<NonNullable<Message["metadata"]>> = {};
			if (event.nativeSessionId) {
				actions.push({
					type: "remember_session",
					sessionId: event.nativeSessionId,
					target: "runtime",
				});
				metadata.nativeSessionId = event.nativeSessionId;
			}
			if (event.projectRulesSnapshot) {
				metadata.projectRulesSnapshot = event.projectRulesSnapshot;
				metadata.contextSources = mergeProjectRulesSnapshotSources(
					lastAssistant?.metadata?.contextSources,
					event.projectRulesSnapshot,
				);
			}
			if (
				lastAssistant?.role === "assistant" &&
				Object.keys(metadata).length > 0
			) {
				actions.push({
					type: "update_message_metadata",
					messageId: lastAssistant.id,
					metadata,
				});
			}
			actions.push({ type: "set_session_status", status: "streaming" });
			return actions;
		}

		case "text.delta":
		case "reasoning.delta":
			return [
				...(context.sessionStatus === "preparing"
					? [{ type: "set_session_status", status: "streaming" } as const]
					: []),
				{ type: "append_assistant_chunk", content: event.delta },
			];

		case "message.final":
			return [
				{ type: "clear_assistant_stream" },
				{ type: "update_last_message", content: event.text },
			];

		case "assistant.part": {
			const assistant = lastAssistantMessage(context.messages);
			if (!assistant) return [];
			return [
				{
					type: "apply_assistant_part",
					messageId: assistant.id,
					event: event.partEvent,
				},
			];
		}

		case "tool.call":
			return [
				...actionsBeforeToolPatch(context),
				{
					type: "upsert_tool_message",
					toolUseId: event.callId,
					toolCall: {
						name: event.toolName,
						input: coerceToolInput(event.input),
						status: "pending",
						...(event.subagentRunId
							? { subagentRunId: event.subagentRunId }
							: {}),
						approval: {
							kind: isAskUserQuestionToolName(event.toolName)
								? "ask-user-question"
								: "tool",
						},
					},
					content: `Tool call: ${event.toolName}`,
				},
			];

		case "tool.result":
			return updateToolResultActions(context, {
				toolUseId: event.callId,
				result: toolResultText(event.content),
				isError: event.isError,
				subagentRunId: event.subagentRunId,
			});

		case "permission.request":
			return [
				...actionsBeforeToolPatch(context),
				{
					type: "upsert_tool_message",
					toolUseId: event.approvalId,
					toolCall: {
						name: event.toolName,
						input: coerceToolInput(event.input),
						status: "awaiting_approval",
						...(event.subagentRunId
							? { subagentRunId: event.subagentRunId }
							: {}),
						approval: {
							kind: isAskUserQuestionToolName(event.toolName)
								? "ask-user-question"
								: "permission",
						},
					},
					content: `Permission required: ${event.toolName}`,
				},
				{ type: "pause_for_approval" },
			];

		case "permission.resolved":
			return [
				{
					type: "update_tool_call",
					messageId: getToolMessageId(event.approvalId),
					patch: event.decision.approved
						? {
								status: "pending",
								...(event.decision.payload
									? { result: event.decision.payload }
									: {}),
							}
						: {
								status: "error",
								error: event.decision.reason || "Tool call rejected by user",
							},
				},
			];

		case "status":
			return [{ type: "set_session_status", status: event.status }];

		case "usage": {
			const assistant = lastAssistantMessage(context.messages);
			if (!assistant) return [];
			return [
				{
					type: "update_message_metadata",
					messageId: assistant.id,
					metadata: {
						inputTokens: event.inputTokens,
						outputTokens: event.outputTokens,
						cacheReadTokens: event.cacheReadTokens,
						cacheCreationTokens: event.cacheWriteTokens,
						tokens: event.inputTokens + event.outputTokens,
					},
				},
			];
		}

		case "result":
			return [
				...(context.streamContent
					? [{ type: "finalize_assistant_stream" } as const]
					: []),
				{ type: "persist_messages" },
				...terminalActions(context, false),
			];

		case "error":
			return [
				{
					type: "materialize_error",
					summary: event.message,
					errorContext: event.errorContext,
				},
				...terminalActions(context, false),
			];

		case "rate_limit":
			return [
				{
					type: "rate_limit",
					message: event.message || "Rate limited: Please wait...",
				},
			];
	}
}

export function reduceAgentStreamEvent(
	event: AgentSDKStreamEvent | AgentRuntimeStreamEvent,
	context: AgentEventReducerContext,
): AgentEventReducerResult {
	if ("v" in event) {
		return reduceAgentRuntimeStreamEvent(
			event as AgentRuntimeStreamEvent,
			context,
		);
	}
	return reduceAgentSDKStreamEvent(event as AgentSDKStreamEvent, context);
}

export function useAgentEventReducer(context: AgentEventReducerContext) {
	return useCallback(
		(event: AgentSDKStreamEvent | AgentRuntimeStreamEvent) =>
			reduceAgentStreamEvent(event, context),
		[context],
	);
}
