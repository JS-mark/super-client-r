/**
 * useSubagentsInspectorData — read-only aggregator for the "Subagents"
 * section of the right-side environment inspector (Phase 4 Round 7).
 *
 * Aggregates over the current conversation's messages, extracting each
 * `SubagentMessagePart.run` snapshot from assistant messages, and maps
 * them to a compact display model. Sorted by `startedAt` desc so the
 * most recent runs appear first.
 *
 * MVP scope (Round 7):
 *   - Pure store read; no new IPC.
 *   - Only surfaces subagents that already appear as
 *     `SubagentMessagePart` on some assistant message — the runtime is
 *     responsible for pushing that part; we don't re-derive from raw
 *     tool events.
 *   - Follow-up (later batch): once `Message.toolCall.subagentRunId`
 *     lands, this hook could enrich entries with realtime tool-call
 *     counters straight from tool messages instead of the summary field.
 */

import { useMemo } from "react";
import type {
	Message,
	MessagePart,
	SubagentMessagePart,
} from "@super-client/shared-types/chat";
import type { SubagentTaskStatus } from "@super-client/shared-types/subagent";
import { useChatMessageStore } from "../stores/chatMessageStore";

export interface SubagentInspectorEntry {
	subagentRunId: string;
	profileName?: string;
	taskGoal: string;
	status: SubagentTaskStatus;
	toolCallCount?: number;
	startedAt: number;
	endedAt?: number;
	hasError: boolean;
}

/**
 * Pure builder — given the raw message list, produce inspector entries
 * sorted by `startedAt` desc. Extracted so tests can call it directly
 * without mounting stores.
 */
export function buildSubagentsInspectorData(
	messages: Message[],
): SubagentInspectorEntry[] {
	const entries: SubagentInspectorEntry[] = [];
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		const parts = m.parts;
		if (!parts || parts.length === 0) continue;
		for (const part of parts as MessagePart[]) {
			if (part.type !== "subagent") continue;
			const run = (part as SubagentMessagePart).run;
			if (!run) continue;
			entries.push({
				subagentRunId: run.subagentRunId,
				profileName: run.profileName,
				taskGoal: run.taskGoal,
				status: run.status,
				toolCallCount: run.toolCallCount,
				startedAt: run.startedAt,
				endedAt: run.endedAt,
				hasError: run.status === "failed",
			});
		}
	}
	// Sort by startedAt desc — most recent first. Ties: keep insertion
	// order (stable sort) so parts appended later in the same tick don't
	// jitter position.
	entries.sort((a, b) => b.startedAt - a.startedAt);
	return entries;
}

/**
 * Renderer hook wrapper. Reads messages from `useChatMessageStore` for
 * the currently focused conversation (the store only ever holds the
 * active session's messages — `conversationId` is accepted for API
 * symmetry with peer hooks and to make the dependency explicit at call
 * sites, but is not currently required to select data).
 */
export function useSubagentsInspectorData(
	// Accepted for future-proofing (if the store ever multiplexes) and to
	// make the caller's intent explicit; not used internally today.
	conversationId?: string,
): SubagentInspectorEntry[] {
	void conversationId;
	const messages = useChatMessageStore((s) => s.messages);
	return useMemo(() => buildSubagentsInspectorData(messages), [messages]);
}
