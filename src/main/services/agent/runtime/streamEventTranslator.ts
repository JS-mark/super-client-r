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
	ArtifactMessagePart,
	CodeBlockMessagePart,
	DataMessagePart,
	DiffMessagePart,
	MessagePart,
	ProjectRulesSnapshotDto,
	SourcesMessagePart,
	TableMessagePart,
	TreeMessagePart,
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
	/**
	 * Streaming fence state machine (plan task E1). When undefined, the
	 * translator is "between fences" (plain text). When set, we're inside an
	 * open fence: a part_start with type:"code_block" has already been
	 * emitted, content is being accumulated + flushed as throttled part_delta
	 * events, and the fence is waiting for its closing ``` to re-classify.
	 */
	private pendingFence: {
		partId: string;
		language?: string;
		content: string;
		/** Length of content already emitted via part_delta. */
		flushedLength: number;
	} | undefined;
	private structuredPartIndex = 0;
	/**
	 * Buffer of text received while outside a fence that hasn't yet been
	 * scanned for a fence-opening ``` (the opening marker can span chunk
	 * boundaries). Re-scanned from this point on each chunk.
	 */
	private outsideScanBuffer = "";

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
					// Drive the streaming fence state machine (plan task E1).
					// Emits assistant.part events for fences as they open/close,
					// throttled by line boundaries to avoid one event per token.
					this.processChunkForFences(ev.content, out);
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
				// If a fence is still open at finalize (stream ended mid-fence),
				// close it: flush any unflushed content and emit part_done. The
				// body is re-classified from code_block to its structured type
				// if it parses (same path as a normal close, just without a
				// closing ```).
				this.closePendingFence(out, finalizedAt, /* unterminated */ true);
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

	/**
	 * Streaming fence scanner (plan task E1). Called per chunk with the new
	 * delta. Maintains a small state machine:
	 *   - outside a fence: look for an opening ``` in the buffer; on open,
	 *     emit part_start (as code_block), capture the info-string language.
	 *   - inside a fence: accumulate content; flush part_delta on line
	 *     boundaries (throttle — avoids one event per token). On a closing
	 *     ```, finalize: emit any pending delta, then re-classify the part to
	 *     its structured type via part_update if the body parses.
	 *
	 * Fence markers can span chunk boundaries (the ``` may be split), so the
	 * outside-buffer is retained and re-scanned, and the inside-content is
	 * scanned for the closing marker incrementally.
	 */
	private processChunkForFences(
		delta: string,
		out: AgentRuntimeStreamEvent[],
	): void {
		if (this.pendingFence) {
			this.processInsideFence(delta, out);
		} else {
			this.processOutsideFence(delta, out);
		}
	}

	private processOutsideFence(
		delta: string,
		out: AgentRuntimeStreamEvent[],
	): void {
		this.outsideScanBuffer += delta;
		// Look for an opening fence marker ```. Keep a 2-char overlap to catch
		// a marker split across chunk boundaries (max marker run is 3 chars).
		const openIdx = this.outsideScanBuffer.indexOf("```");
		if (openIdx === -1) {
			// No opener yet; retain a tail slice in case ``` is mid-arrival.
			if (this.outsideScanBuffer.length > 2) {
				this.outsideScanBuffer = this.outsideScanBuffer.slice(-2);
			}
			return;
		}
		const afterMarker = this.outsideScanBuffer.slice(openIdx + 3);
		// The info string runs to end of line; language is its first token.
		const newlineIdx = afterMarker.indexOf("\n");
		let language: string | undefined;
		let remainder: string;
		if (newlineIdx === -1) {
			// Info string not yet terminated (opener split across chunks); keep
			// the buffer for next chunk.
			this.outsideScanBuffer = `\`\`\`${afterMarker}`;
			return;
		}
		const info = afterMarker.slice(0, newlineIdx).trim();
		language = info.split(/\s+/)[0]?.toLowerCase() || undefined;
		remainder = afterMarker.slice(newlineIdx + 1);
		this.outsideScanBuffer = "";
		// Open the fence.
		const partId = `${this.messageId}:structured:${this.structuredPartIndex++}`;
		this.pendingFence = { partId, language, content: "", flushedLength: 0 };
		out.push({
			...this.base(),
			type: "assistant.part",
			partEvent: {
				type: "assistant.part_start",
				messageId: this.messageId,
				part: {
					id: partId,
					type: "code_block",
					state: "streaming",
					...(language ? { language } : {}),
					content: "",
					completeFence: false,
					lineCount: 0,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
				ts: Date.now(),
			},
		});
		// remainder is the first slice of in-fence content; feed it through the
		// inside-fence path (which will also catch an immediate ``` close).
		if (remainder.length > 0) {
			this.processInsideFence(remainder, out);
		}
	}

	private processInsideFence(
		delta: string,
		out: AgentRuntimeStreamEvent[],
	): void {
		if (!this.pendingFence) return;
		this.pendingFence.content += delta;
		// Detect a closing ``` (preceded by a newline or at content start).
		const content = this.pendingFence.content;
		const closeMatch = content.match(/\n```/);
		if (closeMatch && closeMatch.index !== undefined) {
			const closeIdx = closeMatch.index;
			// Trim the closing marker + everything after from the body.
			const body = content.slice(0, closeIdx);
			this.pendingFence.content = body;
			// Flush any unflushed body content as a final delta.
			this.flushPendingDelta(out);
			this.closePendingFence(out, Date.now(), /* unterminated */ false);
			// Anything after the closing ``` is outside-fence text; re-feed it.
			const after = content.slice(closeIdx + 4);
			this.pendingFence = undefined;
			if (after.length > 0) {
				this.processOutsideFence(after, out);
			}
			return;
		}
		// No close yet — throttle: flush when we have at least one complete
		// line beyond what's already flushed.
		const unflushed = content.slice(this.pendingFence.flushedLength);
		const lastNewline = unflushed.lastIndexOf("\n");
		if (lastNewline >= 0) {
			const flushUpTo = this.pendingFence.flushedLength + lastNewline + 1;
			const chunk = content.slice(this.pendingFence.flushedLength, flushUpTo);
			this.pendingFence.flushedLength = flushUpTo;
			out.push({
				...this.base(),
				type: "assistant.part",
				partEvent: {
					type: "assistant.part_delta",
					messageId: this.messageId,
					partId: this.pendingFence.partId,
					delta: chunk,
					ts: Date.now(),
				},
			});
		}
	}

	private flushPendingDelta(out: AgentRuntimeStreamEvent[]): void {
		if (!this.pendingFence) return;
		const { content, flushedLength, partId } = this.pendingFence;
		if (content.length > flushedLength) {
			const chunk = content.slice(flushedLength);
			this.pendingFence.flushedLength = content.length;
			out.push({
				...this.base(),
				type: "assistant.part",
				partEvent: {
					type: "assistant.part_delta",
					messageId: this.messageId,
					partId,
					delta: chunk,
					ts: Date.now(),
				},
			});
		}
	}

	/**
	 * Finalize the pending fence: re-classify the accumulated body to its
	 * structured type (table/tree/sources/artifact/json/diff) if it parses,
	 * otherwise leave it as code_block; then emit part_done. If `unterminated`
	 * is true the closing ``` was never seen (stream ended mid-fence).
	 */
	private closePendingFence(
		out: AgentRuntimeStreamEvent[],
		ts: number,
		unterminated: boolean,
	): void {
		if (!this.pendingFence) return;
		const { partId, language, content } = this.pendingFence;
		// Re-classify: reuse the existing buildMessagePart logic by synthesizing
		// a FencedBlock and, if it yields a non-code_block type, emit a
		// part_update replacing the part with the fully-parsed structured part.
		const block: FencedBlock = {
			...(language ? { language } : {}),
			content,
		};
		const structured = buildMessagePart(this.messageId, 0, block, ts);
		if (structured && structured.type !== "code_block") {
			// Replace the streaming code_block with the final structured part.
			// Carry over the same partId so the renderer updates in place.
			out.push({
				...this.base(),
				type: "assistant.part",
				partEvent: {
					type: "assistant.part_update",
					messageId: this.messageId,
					partId,
					patch: { ...structured, id: partId, state: "complete" },
					ts,
				},
			});
		} else {
			// Stays code_block: just mark complete + set final content/lineCount
			// via part_done patch (the streamed content is already in place).
			out.push({
				...this.base(),
				type: "assistant.part",
				partEvent: {
					type: "assistant.part_update",
					messageId: this.messageId,
					partId,
					patch: {
						content,
						completeFence: !unterminated,
						lineCount: countLines(content),
						updatedAt: ts,
					},
					ts,
				},
			});
		}
		out.push({
			...this.base(),
			type: "assistant.part",
			partEvent: {
				type: "assistant.part_done",
				messageId: this.messageId,
				partId,
				patch: { state: "complete" },
				ts,
			},
		});
		this.pendingFence = undefined;
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

interface FencedBlock {
	language?: string;
	content: string;
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
	if (block.language === "table") {
		const parsed = parseTable(block.content);
		if (parsed) {
			return { ...base, type: "table", ...parsed } satisfies TableMessagePart;
		}
	}
	if (block.language === "tree") {
		const nodes = parseTree(block.content);
		if (nodes.length > 0) {
			return { ...base, type: "tree", nodes } satisfies TreeMessagePart;
		}
	}
	if (block.language === "sources") {
		const sources = parseSources(block.content);
		if (sources.length > 0) {
			return { ...base, type: "sources", sources } satisfies SourcesMessagePart;
		}
	}
	if (block.language === "artifact") {
		const parsed = parseArtifact(block.content);
		if (parsed) {
			return { ...base, type: "artifact", ...parsed } satisfies ArtifactMessagePart;
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

// ── Structured-body parsers for table / tree / sources / artifact ─────
// All four follow the json-producer contract: return null/[] on malformed
// input so buildMessagePart falls through to the default code_block branch
// (LLM-written fences that don't parse degrade gracefully, never crash).

/**
 * Parse a GFM-style markdown table fence body into columns + rows.
 * Requires a header row followed by a `|---|---|` separator row. Cells are
 * kept as strings (no type coercion) for predictability.
 */
function parseTable(content: string): {
	columns: string[];
	rows: unknown[][];
	title?: string;
} | null {
	const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
	if (lines.length < 2) return null;
	const splitRow = (line: string): string[] =>
		line
			.replace(/^\s*\|/, "")
			.replace(/\|\s*$/, "")
			.split("|")
			.map((c) => c.trim());
	const header = splitRow(lines[0]);
	if (header.length === 0) return null;
	// Row 1 must be the separator: only dashes, colons, pipes, whitespace,
	// and must contain at least one dash (GFM `|---|` / `|:--:|` shapes).
	const sep = lines[1].trim();
	if (!/^[|\s:-]+$/.test(sep) || !sep.includes("-")) return null;
	const rows: unknown[][] = [];
	for (let i = 2; i < lines.length; i++) {
		const cells = splitRow(lines[i]);
		// Pad/truncate to header width so columns stay aligned.
		const padded: unknown[] = header.map((_, idx) => cells[idx] ?? "");
		rows.push(padded);
	}
	return { columns: header, rows };
}

/**
 * Parse an indented tree fence body (tree-command style) into flat nodes
 * with parentId inferred from indentation level. Accepts 2-space or tab
 * indentation; optional `kind:file` / `kind:folder` prefix per line.
 */
function parseTree(content: string): TreeMessagePart["nodes"] {
	const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
	if (lines.length === 0) return [];
	const nodes: TreeMessagePart["nodes"] = [];
	// stack of [level, nodeId] for ancestor tracking.
	const stack: Array<{ level: number; id: string }> = [];
	lines.forEach((line, idx) => {
		const indentMatch = line.match(/^[\t ]*/);
		const indent = indentMatch ? indentMatch[0] : "";
		// Normalize: tabs count as one level each; 2 spaces = one level.
		const level = indent.replace(/\t/g, "  ").length / 2;
		let rest = line.slice(indent.length);
		let kind: TreeMessagePart["nodes"][number]["kind"];
		const kindMatch = rest.match(/^kind:(file|folder|task|item)\s+/);
		if (kindMatch) {
			kind = kindMatch[1] as NonNullable<typeof kind>;
			rest = rest.slice(kindMatch[0].length);
		}
		const label = rest.replace(/^[-•*]\s*/, "").trim();
		if (!label) return;
		const id = `node-${idx}`;
		// Pop stack until top is shallower than this node.
		while (stack.length > 0 && stack[stack.length - 1].level >= level) {
			stack.pop();
		}
		const parentId = stack.length > 0 ? stack[stack.length - 1].id : undefined;
		const node: TreeMessagePart["nodes"][number] = { id, label };
		if (parentId !== undefined) node.parentId = parentId;
		if (kind !== undefined) node.kind = kind;
		nodes.push(node);
		stack.push({ level, id });
	});
	return nodes;
}

/**
 * Parse a markdown-list fence body into sources. Each `- ...` line becomes a
 * source; `[title](url)` sets title+url+sourceType:web, a bare path-like
 * string sets path+sourceType:file, otherwise title only.
 */
function parseSources(content: string): SourcesMessagePart["sources"] {
	const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
	const sources: SourcesMessagePart["sources"] = [];
	lines.forEach((line, idx) => {
		const trimmed = line.replace(/^\s*[-*]\s+/, "").trim();
		if (!trimmed) return;
		const link = trimmed.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
		if (link) {
			sources.push({
				id: `src-${idx}`,
				title: link[1] || undefined,
				url: link[2],
				sourceType: "web",
			});
			return;
		}
		// Bare path: looks like a filesystem path (contains / or \ and no spaces-only).
		if (/^[^\s]*[/\\][^\s]*$/.test(trimmed)) {
			sources.push({
				id: `src-${idx}`,
				path: trimmed,
				sourceType: "file",
			});
			return;
		}
		sources.push({ id: `src-${idx}`, title: trimmed, sourceType: "unknown" });
	});
	return sources;
}

/**
 * Parse an artifact JSON fence body. Requires at least `artifactId`; unknown
 * `type` values normalize to "unknown". Returns null on invalid JSON or
 * missing artifactId so buildMessagePart falls back to code_block.
 */
function parseArtifact(content: string): {
	artifactId: string;
	artifactType: ArtifactMessagePart["artifactType"];
	title?: string;
	preview?: string;
} | null {
	let value: {
		artifactId?: unknown;
		type?: unknown;
		title?: unknown;
		preview?: unknown;
	};
	try {
		value = JSON.parse(content);
	} catch {
		return null;
	}
	if (typeof value.artifactId !== "string" || !value.artifactId) return null;
	const artifactType: ArtifactMessagePart["artifactType"] = (() => {
		if (
			value.type === "markdown" ||
			value.type === "html" ||
			value.type === "image" ||
			value.type === "file"
		) {
			return value.type;
		}
		return "unknown";
	})();
	const result: {
		artifactId: string;
		artifactType: ArtifactMessagePart["artifactType"];
		title?: string;
		preview?: string;
	} = { artifactId: value.artifactId, artifactType };
	if (typeof value.title === "string") result.title = value.title;
	if (typeof value.preview === "string") result.preview = value.preview;
	return result;
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
