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
 * Per-request accumulator threaded through `adaptRuntimeEventToSdk` so that
 * the terminal `result` legacy event can carry real usage + duration. The
 * runtime emits `usage` and `result` as separate events (translator's `done`
 * case pushes message.final → usage → result), and the legacy `agent-sdk`
 * SDK shape collapses them all into `result.usage` / `result.durationMs`.
 *
 * Without this, the renderer reads zeros for both and shows "0 tokens, 0.0s".
 */
export interface SdkAdapterState {
	/** Pump start time (ms epoch). Used to fill in `result.durationMs`. */
	startedAt: number;
	/** Latest seen `usage` event payload, folded into the next `result`. */
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
}

export function createSdkAdapterState(): SdkAdapterState {
	return { startedAt: Date.now() };
}

/**
 * Convert one new-protocol event into 0..N legacy `agent-sdk:stream-event`
 * shaped events (with `requestId` + `type` + variant fields).
 *
 * The legacy event shape is loose (a discriminated union via `type`);
 * we return them as `Record<string, unknown>` to avoid importing the
 * full union here.
 *
 * `state` is optional for backward compatibility with existing unit tests;
 * production callers MUST pass one (see `createSdkAdapterState()`), otherwise
 * the resulting `result` event carries zero usage + zero duration.
 */
export function adaptRuntimeEventToSdk(
	ev: AgentRuntimeStreamEvent,
	state?: SdkAdapterState,
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
			// The `result` case reads from `state.usage` to populate the
			// terminal SDK `result.usage` field that the renderer consumes
			// to render token counts in the message footer.
			if (state) {
				state.usage = {
					inputTokens: ev.inputTokens,
					outputTokens: ev.outputTokens,
				};
			}
			return null;

		case "status":
			return { ...base, type: "status", status: ev.status };

		case "rate_limit":
			return { ...base, type: "rate_limit", error: ev.message };

		case "result": {
			const usage = state?.usage ?? { inputTokens: 0, outputTokens: 0 };
			const durationMs = state ? Date.now() - state.startedAt : 0;
			return {
				...base,
				type: "result",
				result: {
					success: ev.reason === "completed",
					text: "",
					durationMs,
					numTurns: 1,
					totalCostUsd: 0,
					stopReason: ev.reason,
					usage,
				},
			};
		}

		case "error":
			return {
				...base,
				type: "error",
				error: ev.message,
				// Forward structured error context to the renderer so the
				// ErrorCard can render model/preset/endpoint/HTTP/etc.
				...(ev.errorContext ? { errorContext: ev.errorContext } : {}),
			};

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
