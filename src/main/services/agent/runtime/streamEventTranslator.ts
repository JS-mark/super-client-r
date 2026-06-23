/**
 * Translate `ChatStreamEvent` (from LLMService.subscribeRequestEvents)
 * into `AgentRuntimeStreamEvent` (what AgentRuntimeIpcBroker forwards
 * to the renderer).
 *
 * Owns:
 *   - sequence counter (`seq` monotone from 0 per AgentEventBase contract)
 *   - assistant messageId (stable for the duration of one assistant turn)
 *   - accumulated text (so message.final can carry the final assembled string)
 *   - finalization (emits message.final + usage + result once on `done`)
 *
 * Translation table:
 *   ChatStreamEvent                  → AgentRuntimeStreamEvent
 *   ───────────────────────────────────────────────────────────────
 *   (first event)                    → "init"
 *   chunk { content }                → "text.delta" { messageId, delta }
 *   tool_call { id, name, args }     → "tool.call"  { callId, toolName, input }
 *   tool_result { id, name, result } → "tool.result" { callId, content: text, isError:false }
 *   tool_error { id, name, error }   → "tool.result" { callId, content: error, isError:true }
 *   tool_approval_request {...}      → "permission.request" { approvalId, toolName, input }
 *   tool_rejected                    → (no event; already covered by tool_error)
 *   done { usage }                   → "message.final" + "usage" + "result"
 *   error { msg }                    → "error" { fatal, code, message }
 */

import type { ChatStreamEvent } from "../../../ipc/types";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

const RUNTIME_ID = "llm-loop" as const;

export interface TranslatorContext {
	requestId: string;
	conversationId: string;
}

export class ChatToRuntimeTranslator {
	private readonly ctx: TranslatorContext;
	private seq = 0;
	private initSent = false;
	private readonly messageId: string;
	private accumulatedText = "";
	private finalUsage:
		| { inputTokens?: number; outputTokens?: number; totalTokens?: number }
		| undefined;
	private finalizedAt: number | undefined;

	constructor(ctx: TranslatorContext) {
		this.ctx = ctx;
		this.messageId = `msg_${ctx.requestId}`;
	}

	translate(ev: ChatStreamEvent): AgentRuntimeStreamEvent[] {
		const out: AgentRuntimeStreamEvent[] = [];
		if (!this.initSent) {
			this.initSent = true;
			out.push({
				...this.base(),
				type: "init",
			});
		}

		switch (ev.type) {
			case "chunk": {
				if (ev.content) {
					this.accumulatedText += ev.content;
					out.push({
						...this.base(),
						type: "text.delta",
						messageId: this.messageId,
						delta: ev.content,
					});
				}
				break;
			}

			case "tool_call": {
				if (ev.toolCall) {
					let input: unknown = {};
					try {
						input = ev.toolCall.arguments ? JSON.parse(ev.toolCall.arguments) : {};
					} catch {
						input = {};
					}
					out.push({
						...this.base(),
						type: "tool.call",
						callId: ev.toolCall.id,
						toolName: ev.toolCall.name,
						input,
					});
				}
				break;
			}

			case "tool_result": {
				if (ev.toolResult) {
					out.push({
						...this.base(),
						type: "tool.result",
						callId: ev.toolResult.toolCallId,
						content: { kind: "text", text: stringify(ev.toolResult.result) },
						isError: false,
					});
				}
				break;
			}

			case "tool_error": {
				if (ev.toolError) {
					out.push({
						...this.base(),
						type: "tool.result",
						callId: ev.toolError.toolCallId,
						content: { kind: "error", message: stringify(ev.toolError.error) },
						isError: true,
					});
				}
				break;
			}

			case "tool_approval_request": {
				if (ev.toolApproval) {
					let input: unknown = {};
					try {
						input = ev.toolApproval.arguments
							? JSON.parse(ev.toolApproval.arguments)
							: {};
					} catch {
						input = {};
					}
					out.push({
						...this.base(),
						type: "permission.request",
						approvalId: ev.toolApproval.toolCallId,
						toolName: ev.toolApproval.name,
						input,
					});
				}
				break;
			}

			case "tool_rejected":
				// Covered by the preceding tool_error event; no extra event.
				break;

			case "done": {
				this.finalUsage = ev.usage;
				this.finalizedAt = Date.now();
				out.push({
					...this.base(),
					type: "message.final",
					messageId: this.messageId,
					text: this.accumulatedText,
				});
				if (this.finalUsage) {
					out.push({
						...this.base(),
						type: "usage",
						inputTokens: this.finalUsage.inputTokens ?? 0,
						outputTokens: this.finalUsage.outputTokens ?? 0,
					});
				}
				out.push({
					...this.base(),
					type: "result",
					reason: "completed",
					finalMessageId: this.messageId,
				});
				break;
			}

			case "error": {
				out.push({
					...this.base(),
					type: "error",
					fatal: true,
					code: "model_error",
					message: ev.error ?? "unknown error",
				});
				break;
			}
		}
		return out;
	}

	/**
	 * Called when the underlying stream ends without a `done` (e.g. abort
	 * or unexpected EOF). Emits a synthetic terminal `result` so consumers
	 * always see a clean stream end.
	 */
	finalize(): AgentRuntimeStreamEvent[] {
		if (this.finalizedAt) return [];
		return [
			{
				...this.base(),
				type: "result",
				reason: "cancelled",
			},
		];
	}

	private base() {
		return {
			v: 1 as const,
			requestId: this.ctx.requestId,
			conversationId: this.ctx.conversationId,
			seq: this.seq++,
			runtime: RUNTIME_ID,
			timestamp: Date.now(),
		};
	}
}

function stringify(v: unknown): string {
	if (typeof v === "string") return v;
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}
