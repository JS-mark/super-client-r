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
import type {
	AssistantPartEvent,
	CodeBlockMessagePart,
	DataMessagePart,
	DiffMessagePart,
	MessagePart,
	ProjectRulesSnapshotDto,
} from "@super-client/shared-types/chat";

const RUNTIME_ID = "llm-loop" as const;

export interface TranslatorContext {
	requestId: string;
	conversationId: string;
	getProjectRulesSnapshot?: () => ProjectRulesSnapshotDto | undefined;
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
			const projectRulesSnapshot = this.ctx.getProjectRulesSnapshot?.();
			out.push({
				...this.base(),
				type: "init",
				...(projectRulesSnapshot ? { projectRulesSnapshot } : {}),
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
				const finalizedAt = this.finalizedAt;
				out.push({
					...this.base(),
					type: "message.final",
					messageId: this.messageId,
					text: this.accumulatedText,
				});
				for (const partEvent of buildStructuredAssistantPartEvents(
					this.messageId,
					this.accumulatedText,
					finalizedAt,
				)) {
					out.push({
						...this.base(),
						type: "assistant.part",
						partEvent,
					});
				}
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
					// Forward the structured LLMErrorContext so it survives
					// the runtime → AgentSDK → renderer translation chain.
					...(ev.errorContext ? { errorContext: ev.errorContext } : {}),
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

function buildStructuredAssistantPartEvents(
	messageId: string,
	text: string,
	ts: number,
): AssistantPartEvent[] {
	const events: AssistantPartEvent[] = [];
	let index = 0;
	for (const block of extractFencedBlocks(text)) {
		const part = buildMessagePart(messageId, index, block, ts);
		if (!part) continue;
		events.push({
			type: "assistant.part_start",
			messageId,
			part,
			ts,
		});
		events.push({
			type: "assistant.part_done",
			messageId,
			partId: part.id,
			patch: { state: "complete" },
			ts,
		});
		index++;
	}
	return events;
}

interface FencedBlock {
	language?: string;
	content: string;
}

function extractFencedBlocks(text: string): FencedBlock[] {
	const blocks: FencedBlock[] = [];
	const re = /```([^\n`]*)\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text))) {
		const info = match[1]?.trim() ?? "";
		const language = info.split(/\s+/)[0]?.toLowerCase() || undefined;
		blocks.push({
			...(language ? { language } : {}),
			content: match[2] ?? "",
		});
	}
	return blocks;
}

function buildMessagePart(
	messageId: string,
	index: number,
	block: FencedBlock,
	ts: number,
): MessagePart | null {
	const base = {
		id: `${messageId}:structured:${index}`,
		state: "complete" as const,
		createdAt: ts,
		updatedAt: ts,
	};
	if (block.language === "json") {
		try {
			const value = JSON.parse(block.content);
			return {
				...base,
				type: "data",
				format: "json",
				title: "JSON",
				value,
			} satisfies DataMessagePart;
		} catch {
			// Invalid JSON still renders as a code block below.
		}
	}
	if (block.language === "diff" || looksLikeDiff(block.content)) {
		return {
			...base,
			type: "diff",
			files: parseDiffFiles(block.content),
			valid: true,
		} satisfies DiffMessagePart;
	}
	return {
		...base,
		type: "code_block",
		...(block.language ? { language: block.language } : {}),
		content: block.content,
		completeFence: true,
		lineCount: countLines(block.content),
	} satisfies CodeBlockMessagePart;
}

function looksLikeDiff(content: string): boolean {
	return (
		/^diff --git /m.test(content) ||
		/^@@\s/m.test(content) ||
		/^\+\+\+ [ab]\//m.test(content)
	);
}

function parseDiffFiles(content: string): DiffMessagePart["files"] {
	const path = extractDiffPath(content);
	return [
		{
			path,
			status: inferDiffStatus(content),
			hunks: [
				{
					lines: content.split(/\r?\n/).map((line) => {
						if (line.startsWith("+") && !line.startsWith("+++")) {
							return { type: "add" as const, content: line.slice(1) };
						}
						if (line.startsWith("-") && !line.startsWith("---")) {
							return { type: "remove" as const, content: line.slice(1) };
						}
						return {
							type: "context" as const,
							content: line.startsWith(" ") ? line.slice(1) : line,
						};
					}),
				},
			],
		},
	];
}

function extractDiffPath(content: string): string {
	const gitPath = content.match(/^diff --git a\/(.+?) b\/(.+)$/m);
	if (gitPath?.[2]) return gitPath[2];
	const plusPath = content.match(/^\+\+\+ (?:b\/)?(.+)$/m);
	if (plusPath?.[1] && plusPath[1] !== "/dev/null") return plusPath[1];
	const minusPath = content.match(/^--- (?:a\/)?(.+)$/m);
	if (minusPath?.[1] && minusPath[1] !== "/dev/null") return minusPath[1];
	return "diff";
}

function inferDiffStatus(content: string): DiffMessagePart["files"][number]["status"] {
	if (/^new file mode /m.test(content) || /^--- \/dev\/null/m.test(content)) {
		return "added";
	}
	if (/^deleted file mode /m.test(content) || /^\+\+\+ \/dev\/null/m.test(content)) {
		return "deleted";
	}
	if (/^rename from /m.test(content) && /^rename to /m.test(content)) {
		return "renamed";
	}
	return "modified";
}

function countLines(content: string): number {
	if (!content) return 0;
	return content.split(/\r?\n/).length;
}
