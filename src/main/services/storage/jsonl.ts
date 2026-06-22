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

import type { Message, ToolCall } from "@super-client/shared-types/chat";
import type {
	SessionEvent,
	ToolCallEvent,
} from "@super-client/shared-types/project";

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
 *  - `approval / file_artifact / session_marker` → **不进 messages**（它们是审计 / 文件追踪流，由别处消费）
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
				const next: Message = {
					id: e.id,
					role: "assistant",
					content: e.content,
					timestamp: e.ts,
					type: "text",
					...(e.metadata ? { metadata: e.metadata } : {}),
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

			case "tool_call": {
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

			case "approval":
			case "file_artifact":
			case "session_marker":
				// 不进 messages；上层（audit log / artifact store）单独消费。
				break;
		}
	}

	return messages;
}

/**
 * tool_call 事件本身没有"消息 id"概念，但 renderer 的 Message 需要 id。
 * 用一个稳定派生：`tool_msg_<toolCallId>`，保证同一个 tool_call 在重 reduce
 * 时产出的 Message id 不变（idempotent）。
 */
function messageIdForTool(e: ToolCallEvent): string {
	return `tool_msg_${e.id}`;
}
