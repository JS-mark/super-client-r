/**
 * Project / Session 重设计 — Message → SessionEvent[] 转换。
 *
 * 同时给 main（迁移老 ChatMessagePersist）和 renderer（live Message → 写新 jsonl）
 * 共用。无 fs / 无 IPC 依赖，纯函数。
 *
 * 接受 `MessageLike` 这个结构子集，让 `Message`（renderer，全字段 metadata）和
 * `ChatMessagePersist`（旧持久化形态，metadata 子集）都能传进来。
 */

import type { Message, ToolCall } from "./chat";
import type { SessionEvent } from "./project";

/**
 * 转换器接受的最小结构。`Message` 和 `ChatMessagePersist` 都满足。
 */
export interface MessageLike {
	id: string;
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	timestamp: number;
	type?: "text" | "tool_use" | "tool_result" | "error";
	toolCall?: ToolCall;
	parts?: Message["parts"];
	metadata?: Message["metadata"];
}

function isTextPart(
	part: NonNullable<Message["parts"]>[number],
): part is Extract<NonNullable<Message["parts"]>[number], { type: "text" }> {
	return part.type === "text";
}

function textFromPersistentParts(parts: NonNullable<Message["parts"]>): string {
	return parts
		.filter((part) => !part.transient)
		.filter(isTextPart)
		.map((part) => part.content)
		.join("");
}

/** 单条 → 0..N 个 event。 */
export function messageToEvents(msg: MessageLike): SessionEvent[] {
	const ts = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();

	if (msg.type === "tool_use" && msg.toolCall) {
		const events: SessionEvent[] = [
			{
				type: "tool_call",
				id: msg.toolCall.id,
				ts,
				name: msg.toolCall.name,
				input: msg.toolCall.input ?? {},
			},
		];
		if (msg.toolCall.status === "success" || msg.toolCall.status === "error") {
			if (msg.toolCall.status === "error") {
				events.push({
					type: "tool_error",
					toolCallId: msg.toolCall.id,
					ts,
					error:
						msg.toolCall.error ??
						(msg.toolCall.result !== undefined ? msg.toolCall.result : ""),
					...(typeof msg.toolCall.duration === "number"
						? { duration: msg.toolCall.duration }
						: {}),
				});
			} else {
				events.push({
					type: "tool_result",
					toolCallId: msg.toolCall.id,
					ts,
					output: msg.toolCall.result ?? "",
					...(typeof msg.toolCall.duration === "number"
						? { duration: msg.toolCall.duration }
						: {}),
				});
			}
		}
		return events;
	}

	if (msg.type === "tool_result") {
		if (!msg.toolCall?.id) {
			console.warn(
				"[messageConverter] tool_result without toolCall.id, skipping:",
				msg.id,
			);
			return [];
		}
		if (msg.toolCall.status === "error") {
			return [
				{
					type: "tool_error",
					toolCallId: msg.toolCall.id,
					ts,
					error: msg.toolCall.error ?? msg.toolCall.result ?? msg.content,
				},
			];
		}
		return [
			{
				type: "tool_result",
				toolCallId: msg.toolCall.id,
				ts,
				output: msg.content,
			},
		];
	}

	if (msg.type === "error") {
		return [
			{
				type: "session_marker",
				ts,
				key: "error",
				value: { id: msg.id, content: msg.content },
			},
		];
	}

	if (msg.role === "user") {
		return [
			{
				type: "user_message",
				id: msg.id,
				ts,
				content: msg.content,
				...(msg.metadata?.attachmentIds && msg.metadata.attachmentIds.length > 0
					? { attachmentIds: msg.metadata.attachmentIds }
					: {}),
			},
		];
	}

	if (msg.role === "assistant") {
		const persistentParts = (msg.parts ?? []).filter((part) => !part.transient);
		const content =
			persistentParts.length > 0
				? textFromPersistentParts(persistentParts) || msg.content
				: msg.content;
		const events: SessionEvent[] = [
			{
				type: "assistant_message",
				id: msg.id,
				ts,
				content,
				...(msg.metadata ? { metadata: msg.metadata } : {}),
			},
		];
		for (const part of persistentParts) {
			events.push({
				type: "assistant.part_start",
				messageId: msg.id,
				part,
				ts: part.createdAt || ts,
			});
			if (part.state !== "streaming") {
				events.push({
					type: "assistant.part_done",
					messageId: msg.id,
					partId: part.id,
					patch: { state: part.state, updatedAt: part.updatedAt || ts },
					ts: part.updatedAt || ts,
				});
			}
		}
		return events;
	}

	console.warn(
		"[messageConverter] dropping unconvertable message:",
		`id=${msg.id} role=${msg.role} type=${msg.type}`,
	);
	return [];
}

/** 批量；保持顺序。 */
export function messagesToEvents(msgs: MessageLike[]): SessionEvent[] {
	const out: SessionEvent[] = [];
	for (const m of msgs) out.push(...messageToEvents(m));
	return out;
}
