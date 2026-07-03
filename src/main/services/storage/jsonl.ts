/**
 * Project / Session 重设计 A-4 — JSONL 事件序列化层。
 *
 * 把 `SessionEvent` 流写到 / 读自 `<sessionId>.jsonl`，并提供 reduce 函数
 * 把事件流变成 renderer 期望的 `Message[]` 形态。
 *
 * 设计原则：
 *  - **append-only**：写一行就是一行，崩溃时最多丢半行
 *  - **半行容错**：parseEvents 遇到非法 JSON 跳过 + warning，不抛错
 *  - **无 trailing newline 容错**：最后一行没 \n 也能 parse
 *  - **不持久化流式 chunk**：plan §10 #2，只 final assistant_message 落盘
 *  - **eventsToMessages 配对 tool_call + tool_result/tool_error**：renderer 端的
 *    `Message{type:'tool_use', toolCall:{...result, status}}` 形态
 */

import type {
	Message,
	MessagePart,
	PlanMessagePart,
	SubagentMessagePart,
	TextMessagePart,
	ToolCall,
	ToolCallApproval,
} from "@super-client/shared-types/chat";
import type {
	PlanDecision,
	PlanDecisionAction,
} from "@super-client/shared-types/plan-execute";
import type {
	SessionEvent,
	ToolCallEvent,
} from "@super-client/shared-types/project";
import type {
	SubagentRunSummary,
	SubagentTaskStatus,
} from "@super-client/shared-types/subagent";

// ─────────────────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────────────────

/**
 * 把单个事件序列化为一行（含 trailing `\n`）。直接 `appendFileSync` 落盘。
 */
export function serializeEvent(event: SessionEvent): string {
	return `${JSON.stringify(event)}\n`;
}

// ─────────────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────────────

/**
 * 把 jsonl 文件内容 parse 成事件数组。半行 / 损坏行跳过 + warning，永不抛错。
 * 空文件 / 仅空白返回 `[]`。
 */
export interface ParseEventsReport {
	events: SessionEvent[];
	malformedTrailingLine: boolean;
	malformedMiddleLines: number;
	droppedUnknownLines: number;
}

export function parseEvents(content: string): SessionEvent[] {
	return parseEventsWithReport(content).events;
}

export function parseEventsWithReport(content: string): ParseEventsReport {
	if (!content) {
		return {
			events: [],
			malformedTrailingLine: false,
			malformedMiddleLines: 0,
			droppedUnknownLines: 0,
		};
	}
	const lines = content.split("\n");
	const events: SessionEvent[] = [];
	let malformedTrailingLine = false;
	let malformedMiddleLines = 0;
	let droppedUnknownLines = 0;
	const hasTrailingNewline = content.endsWith("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (isSessionEvent(parsed)) {
				events.push(parsed);
			} else {
				droppedUnknownLines += 1;
				console.warn(
					"[jsonl] dropped event without recognised type field:",
					parsed,
				);
			}
		} catch (err) {
			const isTrailing =
				!hasTrailingNewline &&
				lines.slice(i + 1).every((next) => next.trim().length === 0);
			if (isTrailing) malformedTrailingLine = true;
			else malformedMiddleLines += 1;
			console.warn(
				isTrailing
					? "[jsonl] dropped malformed trailing line (likely a partial write):"
					: "[jsonl] dropped malformed middle line:",
				err instanceof Error ? err.message : String(err),
			);
		}
	}
	return {
		events,
		malformedTrailingLine,
		malformedMiddleLines,
		droppedUnknownLines,
	};
}

function isSessionEvent(v: unknown): v is SessionEvent {
	if (!v || typeof v !== "object") return false;
	const r = v as Record<string, unknown>;
	if (typeof r.type !== "string") return false;
	switch (r.type) {
		case "user_message":
		case "assistant_message":
		case "tool_call":
		case "tool_result":
		case "tool_error":
		case "assistant.part_start":
		case "assistant.part_delta":
		case "assistant.part_update":
		case "assistant.part_done":
		case "assistant.part_error":
		case "approval":
		case "file_artifact":
		case "session_marker":
			return typeof r.ts === "number";
		default:
			return false;
	}
}

// ─────────────────────────────────────────────────────────────────────
// Reduce events → Message[]
// ─────────────────────────────────────────────────────────────────────

/**
 * 把事件流 reduce 成 renderer `Message[]`。
 *
 * 映射规则：
 *  - `user_message` → `Message{role:'user', type:'text'}`（空 content 兼容）
 *  - `assistant_message` → `Message{role:'assistant', type:'text'}`，metadata 透传
 *  - `tool_call` → 新增 `Message{role:'tool', type:'tool_use', toolCall:{...,status:'pending'}}`
 *  - `tool_result` → 找最近未完成的同 toolCallId 的 tool_use Message，更新其 toolCall.result / status / duration
 *  - `tool_error` → 找最近未完成的同 toolCallId 的 tool_use Message，更新其 toolCall.error / status / duration
 *  - product `approval.requested` / `ask.requested` markers can replay into
 *    tool messages; unrelated `file_artifact` / `session_marker` stay audit-only
 *
 * 配对边界：
 *  - 没找到 tool_call 的 tool_result → warning + 丢弃（保护 reducer 不崩）
 *  - tool_call 后没 tool_result → toolCall.status 仍是 'pending'（流仍在进行中）
 *
 * Id-keyed upsert（plan §10 #2 流式落盘配套）：
 *  - 同 id 的 `user_message` / `assistant_message` 再次出现 → **就地替换**前一条，
 *    保留它的位置。让 renderer 可以先落一个空的 assistant placeholder，再在
 *    流式结束时用最终内容 + metadata 重发同 id 事件覆盖之。
 */
export function eventsToMessages(events: SessionEvent[]): Message[] {
	const messages: Message[] = [];
	// 索引：toolCallId → 它在 messages[] 里的下标。tool_result 进来时 O(1) 查到。
	const toolCallIndex = new Map<string, number>();
	// id-keyed index for user_message / assistant_message upserts.
	const messageIndex = new Map<string, number>();
	const assistantPartIndex = new Map<string, number>();
	let latestAssistantMessageId: string | undefined;

	for (const e of events) {
		switch (e.type) {
			case "user_message": {
				const next: Message = {
					id: e.id,
					role: "user",
					content: e.content,
					timestamp: e.ts,
					type: "text",
					...(e.attachmentIds && e.attachmentIds.length > 0
						? { metadata: { attachmentIds: e.attachmentIds } }
						: {}),
				};
				const existing = messageIndex.get(e.id);
				if (existing !== undefined) {
					messages[existing] = next;
				} else {
					messageIndex.set(e.id, messages.length);
					messages.push(next);
				}
				break;
			}

			case "assistant_message": {
				// Restore Message.type from the persisted `messageType` field
				// when present (currently only `"error"` is meaningful).
				// Fallback inference for jsonl records written before
				// messageType existed: a metadata.errorContext or
				// metadata.errorSummary implies the bubble was an error
				// bubble, so reading it back as `type:'error'` keeps the
				// ErrorCard rendering across upgrades.
				const restoredType: Message["type"] =
					e.messageType === "error" ||
					e.metadata?.errorContext ||
					e.metadata?.errorSummary
						? "error"
						: "text";
				const next: Message = {
					id: e.id,
					role: "assistant",
					content: e.content,
					timestamp: e.ts,
					type: restoredType,
					...(e.metadata ? { metadata: e.metadata } : {}),
				};
				const existing = messageIndex.get(e.id);
				if (existing !== undefined) {
					messages[existing] = {
						...next,
						...(messages[existing]?.parts
							? { parts: messages[existing].parts }
							: {}),
					};
				} else {
					messageIndex.set(e.id, messages.length);
					messages.push(next);
				}
				latestAssistantMessageId = e.id;
				break;
			}

			case "assistant.part_start": {
				const idx = ensureAssistantPartMessage(
					messages,
					messageIndex,
					assistantPartIndex,
					e.messageId,
					e.ts,
				);
				latestAssistantMessageId = e.messageId;
				const target = messages[idx];
				const existingParts = target.parts ?? [];
				const partIdx = existingParts.findIndex((part) => part.id === e.part.id);
				const parts =
					partIdx >= 0
						? existingParts.map((part, i) =>
								i === partIdx ? { ...part, ...e.part } : part,
							)
						: [...existingParts, e.part];
				messages[idx] = withAssistantParts(target, parts);
				break;
			}

			case "assistant.part_delta": {
				const idx = assistantPartIndex.get(e.messageId);
				if (idx === undefined) {
					console.warn(
						"[jsonl] assistant.part_delta without preceding part_start:",
						e.messageId,
						e.partId,
					);
					break;
				}
				const target = messages[idx];
				const parts = (target.parts ?? []).map((part) =>
					part.id === e.partId ? applyPartDelta(part, e.delta, e.ts) : part,
				);
				messages[idx] = withAssistantParts(target, parts);
				break;
			}

			case "assistant.part_update":
			case "assistant.part_done": {
				const idx = assistantPartIndex.get(e.messageId);
				if (idx === undefined) {
					console.warn(
						"[jsonl] assistant part patch without preceding part_start:",
						e.messageId,
						e.partId,
					);
					break;
				}
				const patch =
					e.type === "assistant.part_done"
						? ({ state: "complete", ...e.patch } as Partial<MessagePart>)
						: e.patch;
				const target = messages[idx];
				const parts = (target.parts ?? []).map((part) =>
					part.id === e.partId
						? ({ ...part, ...patch, updatedAt: e.ts } as MessagePart)
						: part,
				);
				messages[idx] = withAssistantParts(target, parts);
				break;
			}

			case "assistant.part_error": {
				const idx = assistantPartIndex.get(e.messageId);
				if (idx === undefined) {
					console.warn(
						"[jsonl] assistant.part_error without preceding part_start:",
						e.messageId,
						e.partId,
					);
					break;
				}
				const target = messages[idx];
				const parts = (target.parts ?? []).map((part) =>
					part.id === e.partId
						? ({
								...part,
								state: "error",
								error: e.error,
								updatedAt: e.ts,
							} as MessagePart)
						: part,
				);
				messages[idx] = withAssistantParts(target, parts);
				break;
			}

			case "tool_call": {
				// Multi-Agent Round 6: if this tool_call belongs to a subagent and
				// the parent transcript already has a SubagentMessagePart, absorb it
				// into that part's `toolCallCount` instead of pushing a top-level
				// tool message. Out-of-order (no matching part yet) falls back to
				// the normal top-level tool behavior below for BC.
				if (e.subagentRunId) {
					const located = findSubagentPart(messages, e.subagentRunId);
					if (located) {
						const { messageIdx, partIdx } = located;
						const target = messages[messageIdx];
						const parts = (target.parts ?? []).map((part, i) => {
							if (i !== partIdx || part.type !== "subagent") return part;
							const currentCount = part.run.toolCallCount ?? 0;
							return {
								...part,
								run: { ...part.run, toolCallCount: currentCount + 1 },
								updatedAt: e.ts,
							};
						});
						messages[messageIdx] = withAssistantParts(target, parts);
						break;
					}
				}
				const toolCall: ToolCall = {
					id: e.id,
					name: e.name,
					input: e.input,
					status: "pending",
				};
				const msg: Message = {
					id: messageIdForTool(e),
					role: "tool",
					content: "",
					timestamp: e.ts,
					type: "tool_use",
					toolCall,
				};
				toolCallIndex.set(e.id, messages.length);
				messages.push(msg);
				break;
			}

			case "tool_result": {
				// Multi-Agent Round 6: subagent-owned tool_result. If we can locate
				// the SubagentMessagePart, treat this as an internal event that
				// doesn't produce/mutate a top-level tool message.
				if (e.subagentRunId && findSubagentPart(messages, e.subagentRunId)) {
					break;
				}
				const idx = toolCallIndex.get(e.toolCallId);
				if (idx === undefined) {
					console.warn(
						"[jsonl] tool_result without preceding tool_call:",
						e.toolCallId,
					);
					break;
				}
				const target = messages[idx];
				if (!target.toolCall) break;
				const updated: ToolCall = {
					...target.toolCall,
					result: e.output,
					status: e.isError ? "error" : "success",
					...(e.isError && typeof e.output === "string"
						? { error: e.output }
						: {}),
					...(typeof e.duration === "number" ? { duration: e.duration } : {}),
				};
				messages[idx] = { ...target, toolCall: updated };
				break;
			}

			case "tool_error": {
				// Multi-Agent Round 6: subagent-owned tool_error. Same treatment as
				// tool_result — belongs to the child transcript, not the parent's
				// top-level tool list.
				if (e.subagentRunId && findSubagentPart(messages, e.subagentRunId)) {
					break;
				}
				const idx = toolCallIndex.get(e.toolCallId);
				if (idx === undefined) {
					console.warn(
						"[jsonl] tool_error without preceding tool_call:",
						e.toolCallId,
					);
					break;
				}
				const target = messages[idx];
				if (!target.toolCall) break;
				const errorText =
					typeof e.error === "string" ? e.error : JSON.stringify(e.error);
				const updated: ToolCall = {
					...target.toolCall,
					result: e.error,
					status: "error",
					error: errorText,
					...(typeof e.duration === "number" ? { duration: e.duration } : {}),
				};
				messages[idx] = { ...target, toolCall: updated };
				break;
			}

			case "approval": {
				upsertToolApprovalResolution(messages, toolCallIndex, {
					toolCallId: e.toolCallId,
					ts: e.ts,
					approved: e.decision !== "deny",
					reason: e.reason,
					decision: e.decision,
				});
				break;
			}
			case "file_artifact":
				// 不进 messages；上层（audit log / artifact store）单独消费。
				break;
			case "session_marker": {
				if (e.key === "approval.requested") {
					const marker = readToolRequestMarker(e.value, "approvalId");
					if (!marker) break;
					upsertToolRequestMessage(messages, toolCallIndex, {
						toolCallId: marker.id,
						ts: e.ts,
						name: marker.toolName,
						input: marker.input,
						status: "awaiting_approval",
						approval: {
							kind: "permission",
							displayName: marker.toolName,
						},
						content: `Permission required: ${marker.toolName}`,
					});
					break;
				}
				if (e.key === "ask.requested") {
					const marker = readToolRequestMarker(e.value, "askId");
					if (!marker) break;
					upsertToolRequestMessage(messages, toolCallIndex, {
						toolCallId: marker.id,
						ts: e.ts,
						name: marker.toolName,
						input: marker.input,
						status: "awaiting_approval",
						approval: {
							kind: "ask-user-question",
							displayName: marker.toolName,
						},
						content: `Question required: ${marker.toolName}`,
					});
					break;
				}
				if (e.key === "ask.answered") {
					const marker = readAskAnsweredMarker(e.value);
					if (!marker) break;
					upsertToolApprovalResolution(messages, toolCallIndex, {
						toolCallId: marker.askId,
						ts: e.ts,
						approved: marker.decision !== "deny",
						reason: marker.reason,
						decision: marker.decision,
						result: marker.payload,
						approval: {
							kind: "ask-user-question",
							userAnswers: extractAnswerMap(marker.payload),
						},
					});
					break;
				}
				if (isRunTerminalMarkerKey(e.key)) {
					upsertRunTerminalStatusPart(
						messages,
						messageIndex,
						assistantPartIndex,
						e,
						latestAssistantMessageId,
					);
					break;
				}
				if (e.key === "plan.decision") {
					applyPlanDecisionMarker(messages, e);
					break;
				}
				if (e.key === "execute.turn.created") {
					upsertExecuteTurnLinkStatus(
						messages,
						messageIndex,
						assistantPartIndex,
						e,
					);
					break;
				}
				if (e.key === "subagent.spawned") {
					applySubagentSpawnedMarker(
						messages,
						messageIndex,
						assistantPartIndex,
						e,
						latestAssistantMessageId,
					);
					break;
				}
				if (e.key === "subagent.updated") {
					applySubagentUpdatedMarker(messages, e);
					break;
				}
				if (e.key === "subagent.completed") {
					applySubagentCompletedMarker(messages, e);
					break;
				}
				if (e.key === "subagent.failed") {
					applySubagentFailedMarker(messages, e);
					break;
				}
				break;
			}
		}
	}

	return messages;
}

function ensureAssistantPartMessage(
	messages: Message[],
	messageIndex: Map<string, number>,
	assistantPartIndex: Map<string, number>,
	messageId: string,
	ts: number,
): number {
	const existing = messageIndex.get(messageId);
	if (existing !== undefined) {
		assistantPartIndex.set(messageId, existing);
		return existing;
	}
	const idx = messages.length;
	messageIndex.set(messageId, idx);
	assistantPartIndex.set(messageId, idx);
	messages.push({
		id: messageId,
		role: "assistant",
		content: "",
		timestamp: ts,
		type: "text",
		parts: [],
	});
	return idx;
}

function withAssistantParts(message: Message, parts: MessagePart[]): Message {
	return {
		...message,
		parts,
		content: partsToTextContent(parts) || message.content,
	};
}

function partsToTextContent(parts: MessagePart[]): string {
	return parts
		.filter((part): part is TextMessagePart => part.type === "text")
		.map((part) => part.content)
		.join("");
}

function applyPartDelta(
	part: MessagePart,
	delta: unknown,
	ts: number,
): MessagePart {
	const textDelta = extractTextDelta(delta);
	if (
		textDelta !== null &&
		(part.type === "text" || part.type === "code_block")
	) {
		return {
			...part,
			content: `${part.content}${textDelta}`,
			state: "streaming",
			updatedAt: ts,
		} as MessagePart;
	}
	if (delta && typeof delta === "object") {
		return {
			...part,
			...(delta as Partial<MessagePart>),
			updatedAt: ts,
		} as MessagePart;
	}
	return { ...part, updatedAt: ts };
}

function extractTextDelta(delta: unknown): string | null {
	if (typeof delta === "string") return delta;
	if (!delta || typeof delta !== "object") return null;
	const record = delta as Record<string, unknown>;
	if (typeof record.text === "string") return record.text;
	if (typeof record.content === "string") return record.content;
	return null;
}

/**
 * tool_call 事件本身没有"消息 id"概念，但 renderer 的 Message 需要 id。
 * 用一个稳定派生：`tool_msg_<toolCallId>`，保证同一个 tool_call 在重 reduce
 * 时产出的 Message id 不变（idempotent）。
 */
function messageIdForTool(e: ToolCallEvent): string {
	return `tool_msg_${e.id}`;
}

interface ToolRequestMarker {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
}

interface AskAnsweredMarker {
	askId: string;
	decision: "allow_once" | "allow_session" | "deny";
	reason?: string;
	payload?: unknown;
}

interface ToolRequestMessageInput {
	toolCallId: string;
	ts: number;
	name: string;
	input: Record<string, unknown>;
	status: ToolCall["status"];
	approval?: ToolCallApproval;
	content: string;
}

interface ToolApprovalResolutionInput {
	toolCallId: string;
	ts: number;
	approved: boolean;
	decision: "allow_once" | "allow_session" | "deny";
	reason?: string;
	result?: unknown;
	approval?: ToolCallApproval;
}

function upsertToolRequestMessage(
	messages: Message[],
	toolCallIndex: Map<string, number>,
	input: ToolRequestMessageInput,
): void {
	const existing = toolCallIndex.get(input.toolCallId);
	const patch: ToolCall = {
		id: input.toolCallId,
		name: input.name,
		input: input.input,
		status: input.status,
		...(input.approval ? { approval: input.approval } : {}),
	};
	if (existing !== undefined) {
		const target = messages[existing];
		messages[existing] = {
			...target,
			content: target.content || input.content,
			toolCall: {
				...patch,
				...target.toolCall,
				status: input.status,
				approval: mergeApproval(target.toolCall?.approval, input.approval),
			},
		};
		return;
	}
	toolCallIndex.set(input.toolCallId, messages.length);
	messages.push({
		id: messageIdForToolId(input.toolCallId),
		role: "tool",
		content: input.content,
		timestamp: input.ts,
		type: "tool_use",
		toolCall: patch,
	});
}

function upsertToolApprovalResolution(
	messages: Message[],
	toolCallIndex: Map<string, number>,
	input: ToolApprovalResolutionInput,
): void {
	const existing = toolCallIndex.get(input.toolCallId);
	if (existing === undefined) {
		upsertToolRequestMessage(messages, toolCallIndex, {
			toolCallId: input.toolCallId,
			ts: input.ts,
			name:
				input.approval?.kind === "ask-user-question"
					? "AskUserQuestion"
					: "approval",
			input: {},
			status: input.approved ? "success" : "error",
			approval: input.approval,
			content: input.approved ? "Approval resolved" : "Approval denied",
		});
	}
	const idx = toolCallIndex.get(input.toolCallId);
	if (idx === undefined) return;
	const target = messages[idx];
	if (!target.toolCall) return;
	const decisionResult =
		input.result ?? {
			decision: input.decision,
			...(input.reason ? { reason: input.reason } : {}),
		};
	const nextApproval = mergeApproval(target.toolCall.approval, {
		...input.approval,
		decisionReason: input.reason,
	});
	messages[idx] = {
		...target,
		toolCall: {
			...target.toolCall,
			status: input.approved ? "success" : "error",
			result: input.approved ? decisionResult : target.toolCall.result,
			error: input.approved
				? undefined
				: input.reason || "Tool call rejected by user",
			approval: nextApproval,
		},
	};
}

function mergeApproval(
	current: ToolCallApproval | undefined,
	next: ToolCallApproval | undefined,
): ToolCallApproval | undefined {
	if (!current) return next;
	if (!next) return current;
	return {
		...current,
		...next,
		userAnswers: next.userAnswers ?? current.userAnswers,
	};
}

function readToolRequestMarker(
	value: unknown,
	idKey: "approvalId" | "askId",
): ToolRequestMarker | null {
	const record = asRecord(value);
	if (!record) return null;
	const id = record[idKey];
	const toolName = record.toolName;
	if (typeof id !== "string" || typeof toolName !== "string") return null;
	return {
		id,
		toolName,
		input: coerceRecord(record.input),
	};
}

function readAskAnsweredMarker(value: unknown): AskAnsweredMarker | null {
	const record = asRecord(value);
	if (!record) return null;
	const askId = record.askId;
	const decision = record.decision;
	if (
		typeof askId !== "string" ||
		(decision !== "allow_once" &&
			decision !== "allow_session" &&
			decision !== "deny")
	) {
		return null;
	}
	const reason = typeof record.reason === "string" ? record.reason : undefined;
	return { askId, decision, reason, payload: record.payload };
}

function extractAnswerMap(payload: unknown): Record<string, string> | undefined {
	const record = asRecord(payload);
	const candidate = asRecord(record?.answers ?? record?.user_answers);
	if (!candidate) return undefined;
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(candidate)) {
		if (typeof value === "string") out[key] = value;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

type RunTerminalMarkerKey =
	| "run.completed"
	| "run.stopped"
	| "run.error"
	| "run.rate_limit";

interface RunTerminalMarker {
	partId: string;
	messageId: string;
	label: string;
	detail?: string;
	state: "complete" | "error";
}

function isRunTerminalMarkerKey(key: string): key is RunTerminalMarkerKey {
	return (
		key === "run.completed" ||
		key === "run.stopped" ||
		key === "run.error" ||
		key === "run.rate_limit"
	);
}

function upsertRunTerminalStatusPart(
	messages: Message[],
	messageIndex: Map<string, number>,
	assistantPartIndex: Map<string, number>,
	event: Extract<SessionEvent, { type: "session_marker" }>,
	latestAssistantMessageId: string | undefined,
): void {
	const marker = readRunTerminalMarker(event, latestAssistantMessageId);
	if (!marker) return;
	const idx = ensureAssistantPartMessage(
		messages,
		messageIndex,
		assistantPartIndex,
		marker.messageId,
		event.ts,
	);
	const target = messages[idx];
	const statusPart: MessagePart = {
		id: marker.partId,
		type: "status",
		state: marker.state,
		createdAt: event.ts,
		updatedAt: event.ts,
		label: marker.label,
		...(marker.detail ? { detail: marker.detail } : {}),
	};
	const existingParts = target.parts ?? [];
	const existingPartIndex = existingParts.findIndex(
		(part) => part.id === statusPart.id,
	);
	const parts =
		existingPartIndex >= 0
			? existingParts.map((part, index) =>
					index === existingPartIndex ? statusPart : part,
				)
			: [...existingParts, statusPart];
	messages[idx] = withAssistantParts(target, parts);
}

function readRunTerminalMarker(
	event: Extract<SessionEvent, { type: "session_marker" }>,
	latestAssistantMessageId: string | undefined,
): RunTerminalMarker | null {
	if (!isRunTerminalMarkerKey(event.key)) return null;
	const value = asRecord(event.value);
	const payload = asRecord(value?.payload);
	const finalMessageId =
		typeof payload?.finalMessageId === "string"
			? payload.finalMessageId
			: undefined;
	const messageId =
		finalMessageId ??
		latestAssistantMessageId ??
		`run_status_${stableRunMarkerId(event)}`;
	const partId = `run_status_part_${stableRunMarkerId(event)}`;
	const rateLimitDetail =
		event.key === "run.rate_limit"
			? buildRateLimitDetail(payload, value)
			: undefined;
	const detail =
		rateLimitDetail ??
		buildRunTerminalDetail(
			[
				stringFromUnknown(payload?.message),
				stringFromUnknown(payload?.code),
				stringFromUnknown(payload?.reason),
				stringFromUnknown(value?.runtime),
				stringFromUnknown(value?.requestId),
			],
			event.key,
		);

	switch (event.key) {
		case "run.completed":
			return {
				partId,
				messageId,
				label: "Run completed",
				detail,
				state: "complete",
			};
		case "run.stopped":
			return {
				partId,
				messageId,
				label: "Run stopped",
				detail,
				state: "complete",
			};
		case "run.error":
			return {
				partId,
				messageId,
				label: "Run failed",
				detail,
				state: "error",
			};
		case "run.rate_limit":
			return {
				partId,
				messageId,
				label: "Rate limited",
				detail,
				state: "error",
			};
	}
	return null;
}

function buildRateLimitDetail(
	payload: Record<string, unknown> | null | undefined,
	value: Record<string, unknown> | null | undefined,
): string | undefined {
	const parts: string[] = [];
	const message = stringFromUnknown(payload?.message);
	if (message) parts.push(message);
	const retryAfter =
		typeof payload?.retryAfterMs === "number"
			? Math.max(0, Math.round(payload.retryAfterMs / 1000))
			: undefined;
	if (retryAfter !== undefined) {
		parts.push(`retry in ${retryAfter}s`);
	}
	const runtime = stringFromUnknown(value?.runtime);
	if (runtime) parts.push(runtime);
	return parts.length > 0 ? parts.join(" · ") : "Rate limited";
}

function stableRunMarkerId(
	event: Extract<SessionEvent, { type: "session_marker" }>,
): string {
	const value = asRecord(event.value);
	return (
		event.eventId ??
		stringFromUnknown(value?.requestId) ??
		stringFromUnknown(value?.runId) ??
		`${event.key}_${event.ts}`
	).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildRunTerminalDetail(
	parts: Array<string | undefined>,
	key: RunTerminalMarkerKey,
): string | undefined {
	const filtered = parts.filter((part): part is string => Boolean(part));
	if (filtered.length > 0) return filtered.join(" · ");
	if (key === "run.completed") return "Completed";
	if (key === "run.stopped") return "Stopped";
	return undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function coerceRecord(value: unknown): Record<string, unknown> {
	return asRecord(value) ?? (value === undefined ? {} : { value });
}

/**
 * Apply a `plan.decision` session marker to the plan part on the source turn.
 *
 * The plan part itself is emitted via `assistant.part_update` and is already
 * replayed; this marker acts as a *fallback* so that even if the part update
 * failed to persist (e.g. cancel path that only writes the marker), the
 * PlanMessagePart still ends up with the correct `decision`, `pendingDecision`
 * and `status` state after replay.
 */
function applyPlanDecisionMarker(
	messages: Message[],
	event: Extract<SessionEvent, { type: "session_marker" }>,
): void {
	const value = asRecord(event.value);
	if (!value) return;
	const sourcePlanId = stringFromUnknown(value.sourcePlanId);
	const decision = value.decision as PlanDecision | undefined;
	const action = (value.action as PlanDecisionAction | undefined) ?? decision?.action;
	if (!sourcePlanId || !decision || !action) return;

	for (let i = messages.length - 1; i >= 0; i--) {
		const target = messages[i];
		if (target.role !== "assistant") continue;
		const parts = target.parts;
		if (!parts || parts.length === 0) continue;
		let touched = false;
		const nextParts = parts.map((part) => {
			if (part.type !== "plan") return part;
			if (part.plan.id !== sourcePlanId) return part;
			touched = true;
			const nextPart: PlanMessagePart = {
				...part,
				decision,
				pendingDecision: false,
				status: `decision-${action}`,
				updatedAt: event.ts,
			};
			return nextPart;
		});
		if (touched) {
			messages[i] = withAssistantParts(target, nextParts);
			return;
		}
	}
}

/**
 * Apply an `execute.turn.created` marker by attaching a light status part on
 * the linked assistant message (or user message when no assistant exists yet)
 * so the transcript can visually connect the plan to its follow-up execute
 * turn even when replayed marker-only.
 */
function upsertExecuteTurnLinkStatus(
	messages: Message[],
	messageIndex: Map<string, number>,
	assistantPartIndex: Map<string, number>,
	event: Extract<SessionEvent, { type: "session_marker" }>,
): void {
	const value = asRecord(event.value);
	if (!value) return;
	const link = asRecord(value.link);
	const assistantMessageId =
		stringFromUnknown(value.assistantMessageId) ??
		stringFromUnknown(link?.assistantMessageId);
	const userMessageId =
		stringFromUnknown(value.userMessageId) ??
		stringFromUnknown(link?.userMessageId);
	const sourcePlanId =
		stringFromUnknown(value.sourcePlanId) ??
		stringFromUnknown(link?.sourcePlanId);
	if (!sourcePlanId) return;

	const targetMessageId = assistantMessageId ?? userMessageId;
	if (!targetMessageId) return;

	const idx = ensureAssistantPartMessage(
		messages,
		messageIndex,
		assistantPartIndex,
		targetMessageId,
		event.ts,
	);
	const target = messages[idx];
	const partId = `plan_exec_link_${sourcePlanId}`;
	const versionRaw = value.sourcePlanVersion ?? link?.sourcePlanVersion;
	const version =
		typeof versionRaw === "number"
			? versionRaw
			: typeof versionRaw === "string"
				? Number.parseInt(versionRaw, 10)
				: undefined;
	const label = "Plan executed";
	const detailParts: string[] = [];
	detailParts.push(`plan ${sourcePlanId}${version != null ? `#${version}` : ""}`);
	if (userMessageId) detailParts.push(`turn ${userMessageId}`);
	const statusPart: MessagePart = {
		id: partId,
		type: "status",
		state: "complete",
		createdAt: event.ts,
		updatedAt: event.ts,
		label,
		detail: detailParts.join(" · "),
	};
	const existingParts = target.parts ?? [];
	const existingIdx = existingParts.findIndex((p) => p.id === partId);
	const parts =
		existingIdx >= 0
			? existingParts.map((p, i) => (i === existingIdx ? statusPart : p))
			: [...existingParts, statusPart];
	messages[idx] = withAssistantParts(target, parts);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function messageIdForToolId(id: string): string {
	return `tool_msg_${id}`;
}

// ─────────────────────────────────────────────────────────────────────
// Multi-Agent Round 6 — SubagentMessagePart helpers.
//
// SubagentMessagePart is upserted onto the parent transcript's assistant
// message. Subsequent updated/completed/failed markers locate the part by
// stable id (`subagent_part_<subagentRunId>`) and mutate its `run` snapshot.
// Child tool_call events with `subagentRunId` are absorbed into the part's
// `run.toolCallCount` rather than pushed as top-level tool messages.
// ─────────────────────────────────────────────────────────────────────

function subagentPartIdForRun(subagentRunId: string): string {
	return `subagent_part_${subagentRunId}`;
}

interface LocatedPart {
	messageIdx: number;
	partIdx: number;
}

function findSubagentPart(
	messages: Message[],
	subagentRunId: string,
): LocatedPart | undefined {
	const targetId = subagentPartIdForRun(subagentRunId);
	for (let mi = 0; mi < messages.length; mi++) {
		const parts = messages[mi].parts;
		if (!parts || parts.length === 0) continue;
		for (let pi = 0; pi < parts.length; pi++) {
			const p = parts[pi];
			if (p.type === "subagent" && p.id === targetId) {
				return { messageIdx: mi, partIdx: pi };
			}
		}
	}
	return undefined;
}

function coerceSubagentRun(value: unknown): SubagentRunSummary | null {
	const record = asRecord(value);
	if (!record) return null;
	const subagentRunId = record.subagentRunId;
	const parentRunId = record.parentRunId;
	const taskGoal = record.taskGoal;
	const status = record.status;
	const startedAt = record.startedAt;
	if (typeof subagentRunId !== "string" || typeof parentRunId !== "string") {
		return null;
	}
	if (typeof taskGoal !== "string" || typeof status !== "string") return null;
	if (typeof startedAt !== "number") return null;
	return record as unknown as SubagentRunSummary;
}

function subagentRunStateFromStatus(
	status: SubagentTaskStatus,
): SubagentMessagePart["state"] {
	switch (status) {
		case "spawned":
		case "running":
			return "streaming";
		case "failed":
			return "error";
		case "completed":
		case "cancelled":
			return "complete";
	}
}

function applySubagentSpawnedMarker(
	messages: Message[],
	messageIndex: Map<string, number>,
	assistantPartIndex: Map<string, number>,
	event: Extract<SessionEvent, { type: "session_marker" }>,
	latestAssistantMessageId: string | undefined,
): void {
	const value = asRecord(event.value);
	if (!value) return;
	const run = coerceSubagentRun(value.run);
	if (!run) return;
	const parentAssistantMessageIdRaw =
		stringFromUnknown(value.parentAssistantMessageId) ??
		stringFromUnknown(run.parentAssistantMessageId);
	const targetMessageId =
		parentAssistantMessageIdRaw ?? latestAssistantMessageId;
	if (!targetMessageId) return;
	const idx = ensureAssistantPartMessage(
		messages,
		messageIndex,
		assistantPartIndex,
		targetMessageId,
		event.ts,
	);
	const target = messages[idx];
	const partId = subagentPartIdForRun(run.subagentRunId);
	const existingParts = target.parts ?? [];
	const existingIdx = existingParts.findIndex((p) => p.id === partId);
	const newPart: SubagentMessagePart = {
		id: partId,
		type: "subagent",
		state: subagentRunStateFromStatus(run.status),
		createdAt:
			existingIdx >= 0
				? (existingParts[existingIdx].createdAt ?? event.ts)
				: event.ts,
		updatedAt: event.ts,
		collapsed: true,
		run,
	};
	const parts =
		existingIdx >= 0
			? existingParts.map((p, i) =>
					i === existingIdx
						? ({
								...p,
								...newPart,
								run: {
									...(p as SubagentMessagePart).run,
									...run,
								},
							} as SubagentMessagePart)
						: p,
				)
			: [...existingParts, newPart];
	messages[idx] = withAssistantParts(target, parts);
}

function applySubagentUpdatedMarker(
	messages: Message[],
	event: Extract<SessionEvent, { type: "session_marker" }>,
): void {
	const value = asRecord(event.value);
	if (!value) return;
	const subagentRunId = stringFromUnknown(value.subagentRunId);
	if (!subagentRunId) return;
	const patch = asRecord(value.patch) as Partial<SubagentRunSummary> | null;
	if (!patch) return;
	const located = findSubagentPart(messages, subagentRunId);
	if (!located) return;
	const { messageIdx, partIdx } = located;
	const target = messages[messageIdx];
	const parts = (target.parts ?? []).map((part, i) => {
		if (i !== partIdx || part.type !== "subagent") return part;
		const nextRun: SubagentRunSummary = {
			...part.run,
			...patch,
			subagentRunId: part.run.subagentRunId,
		};
		return {
			...part,
			run: nextRun,
			...(patch.status
				? { state: subagentRunStateFromStatus(patch.status) }
				: {}),
			updatedAt: event.ts,
		} satisfies SubagentMessagePart;
	});
	messages[messageIdx] = withAssistantParts(target, parts);
}

function applySubagentCompletedMarker(
	messages: Message[],
	event: Extract<SessionEvent, { type: "session_marker" }>,
): void {
	const value = asRecord(event.value);
	if (!value) return;
	const subagentRunId = stringFromUnknown(value.subagentRunId);
	if (!subagentRunId) return;
	const located = findSubagentPart(messages, subagentRunId);
	if (!located) return;
	const { messageIdx, partIdx } = located;
	const target = messages[messageIdx];
	const parts = (target.parts ?? []).map((part, i) => {
		if (i !== partIdx || part.type !== "subagent") return part;
		const summary = stringFromUnknown(value.summary);
		const resultRef = stringFromUnknown(value.resultRef);
		const tokenUsage = asRecord(value.tokenUsage) as
			| SubagentRunSummary["tokenUsage"]
			| null;
		const endedAt =
			typeof value.endedAt === "number" ? value.endedAt : event.ts;
		const toolCallCount =
			typeof value.toolCallCount === "number"
				? value.toolCallCount
				: part.run.toolCallCount;
		const nextRun: SubagentRunSummary = {
			...part.run,
			status: "completed",
			endedAt,
			...(summary !== undefined ? { summary } : {}),
			...(resultRef !== undefined ? { resultRef } : {}),
			...(tokenUsage ? { tokenUsage } : {}),
			...(toolCallCount !== undefined ? { toolCallCount } : {}),
		};
		return {
			...part,
			run: nextRun,
			state: "complete",
			updatedAt: event.ts,
		} satisfies SubagentMessagePart;
	});
	messages[messageIdx] = withAssistantParts(target, parts);
}

function applySubagentFailedMarker(
	messages: Message[],
	event: Extract<SessionEvent, { type: "session_marker" }>,
): void {
	const value = asRecord(event.value);
	if (!value) return;
	const subagentRunId = stringFromUnknown(value.subagentRunId);
	if (!subagentRunId) return;
	const located = findSubagentPart(messages, subagentRunId);
	if (!located) return;
	const { messageIdx, partIdx } = located;
	const target = messages[messageIdx];
	const parts = (target.parts ?? []).map((part, i) => {
		if (i !== partIdx || part.type !== "subagent") return part;
		const errorMessage =
			stringFromUnknown(value.errorMessage) ?? "Subagent failed";
		const endedAt =
			typeof value.endedAt === "number" ? value.endedAt : event.ts;
		const nextRun: SubagentRunSummary = {
			...part.run,
			status: "failed",
			errorMessage,
			endedAt,
		};
		return {
			...part,
			run: nextRun,
			state: "error",
			updatedAt: event.ts,
		} satisfies SubagentMessagePart;
	});
	messages[messageIdx] = withAssistantParts(target, parts);
}
