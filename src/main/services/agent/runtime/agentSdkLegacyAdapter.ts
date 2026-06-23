/**
 * Legacy `agent-sdk:*` IPC compatibility adapter.
 *
 * Lets the existing renderer (which calls `window.electron.agentSDK.*`)
 * keep working while internally routing through the new `llm-loop`
 * runtime. This is the bridge between two protocols:
 *
 *   AgentSDKQueryRequest  ──→ AgentQueryRequest
 *   AgentRuntimeStreamEvent ──→ AgentSDKStreamEvent
 *
 * Phase D will delete this once useChat.ts switches to `agent-runtime:*`.
 */

import { randomUUID } from "node:crypto";
import type {
	AgentQueryRequest,
	AgentRuntimeStreamEvent,
} from "@super-client/shared-types/agent-runtime";
import type { AgentSDKQueryRequest } from "../../../ipc/types";

/**
 * Adapt a renderer-supplied `AgentSDKQueryRequest` into the new
 * `AgentQueryRequest` shape consumed by `AgentRuntime.createQuery`.
 */
export function adaptSdkRequestToRuntime(
	requestId: string,
	request: AgentSDKQueryRequest,
	signal: AbortSignal,
): AgentQueryRequest {
	return {
		requestId,
		conversationId: request.sessionId ?? requestId,
		prompt: { kind: "text", text: request.prompt },
		history: [],
		runtime: {
			workspaceId: request.sessionId ?? "",
			sessionId: request.sessionId ?? requestId,
			model: {
				providerId: request.providerId ?? "",
				modelId: request.model ?? "",
			},
		} as unknown as AgentQueryRequest["runtime"],
		tools: [],
		cwd: request.cwd,
		signal,
	};
}

/**
 * Convert one new-protocol event into 0..N legacy `agent-sdk:stream-event`
 * shaped events (with `requestId` + `type` + variant fields).
 *
 * The legacy event shape is loose (a discriminated union via `type`);
 * we return them as `Record<string, unknown>` to avoid importing the
 * full union here.
 */
export function adaptRuntimeEventToSdk(
	ev: AgentRuntimeStreamEvent,
): Record<string, unknown> | null {
	const base = {
		requestId: ev.requestId,
		sessionId: ev.conversationId,
	};

	switch (ev.type) {
		case "init":
			return { ...base, type: "init", status: "ok" };

		case "text.delta":
			return { ...base, type: "chunk", content: ev.delta };

		case "message.final":
			return {
				...base,
				type: "assistant",
				content: ev.text,
				usage: { inputTokens: 0, outputTokens: 0 },
			};

		case "tool.call":
			return {
				...base,
				type: "tool_call",
				toolCall: {
					id: ev.callId,
					name: ev.toolName,
					input: ev.input ?? {},
					kind: "tool",
				},
			};

		case "tool.result": {
			if (ev.isError) {
				return {
					...base,
					type: "tool_error",
					toolError: {
						id: ev.callId,
						name: "",
						error:
							ev.content.kind === "error"
								? ev.content.message
								: stringifyContent(ev.content),
						kind: "tool",
					},
				};
			}
			// Success: emit tool_use_summary so the renderer flips the tool
			// message status to "success" and shows the result.
			return {
				...base,
				type: "tool_use_summary",
				precedingToolUseIds: [ev.callId],
				toolSummary: stringifyContent(ev.content),
			};
		}

		case "permission.request":
			return {
				...base,
				type: "permission_request",
				permissionRequest: {
					toolUseId: ev.approvalId,
					toolName: ev.toolName,
					toolInput: ev.input ?? {},
				},
			};

		case "permission.resolved":
			// No legacy event maps to this; renderer infers from subsequent
			// tool_call / tool_error.
			return null;

		case "usage":
			// Folded into `result.usage` below; no direct legacy event.
			return null;

		case "status":
			return { ...base, type: "status", status: ev.status };

		case "rate_limit":
			return { ...base, type: "rate_limit", error: ev.message };

		case "result":
			return {
				...base,
				type: "result",
				result: {
					success: ev.reason === "completed",
					text: "",
					durationMs: 0,
					numTurns: 1,
					totalCostUsd: 0,
					stopReason: ev.reason,
					usage: { inputTokens: 0, outputTokens: 0 },
				},
			};

		case "error":
			return { ...base, type: "error", error: ev.message };

		default:
			return null;
	}
}

function stringifyContent(content: {
	kind: string;
	text?: string;
	message?: string;
}): string {
	if (typeof content.text === "string") return content.text;
	if (typeof content.message === "string") return content.message;
	try {
		return JSON.stringify(content);
	} catch {
		return String(content);
	}
}

/** UUID generator for synthetic conversation ids in tests / fallback. */
export function syntheticConversationId(): string {
	return randomUUID();
}
