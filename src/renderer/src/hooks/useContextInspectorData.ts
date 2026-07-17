/**
 * useContextInspectorData — read-only aggregator for the Context section
 * of the environment inspector (Round-5 R10 MVP).
 *
 * The hook exposes a "what's currently injected into the model context"
 * view, aggregating from data that already lives in the renderer stores
 * and per-message metadata. It **must not** trigger new IPC calls.
 *
 * Current scope:
 *   - Prefer the context source / strategy metadata written by the latest
 *     agent send. This reflects what the send pipeline actually passed to
 *     the runtime (history strategy, attachments/search counts, project
 *     rules runtime hook, tools).
 *   - Fall back to legacy store-derived chips for sessions that were created
 *     before context metadata existed.
 *   - Compact-event log entries are derived from real
 *     `metadata.contextCompacted` markers.
 *
 * All the compute is pure and store-driven, so `useContextInspectorData`
 * itself is trivially testable by feeding a `buildContextInspectorData`
 * pure helper the same inputs the hook would collect.
 */

import { useMemo } from "react";
import type { Attachment } from "../stores/attachmentStore";
import { useAttachmentStore } from "../stores/attachmentStore";
import { useChatStore } from "../stores/chatStore";
import { useChatMessageStore } from "../stores/chatMessageStore";
import { useProjectStore } from "../stores/projectStore";
import type {
	ContextSourceKind,
	Message,
	MessageContextSource,
	MessageContextStrategy,
} from "@super-client/shared-types/chat";

export type { ContextSourceKind };
export type ContextSourceEntry = MessageContextSource;

export interface ContextCompactEvent {
	id: string;
	timestamp: number;
	/** Free-form description surfaced next to the timestamp. */
	summary?: string;
	originalCount?: number;
}

export interface ContextInspectorData {
	/** All source chips in a stable render order. */
	sources: ContextSourceEntry[];
	/** Message whose metadata supplied the current source list, if any. */
	latestContextMessageId?: string;
	/** Context strategy used for the latest send, when available. */
	strategy?: MessageContextStrategy;
	/** Compact / summarisation events (chronological). */
	compactEvents: ContextCompactEvent[];
	/** True when the active conversation is bound to a project.
	 * Consumers use this to hide project-scoped chips on Casual sessions. */
	hasProject: boolean;
}

/**
 * Metadata shape we opportunistically read for compact events. Uses a
 * looser index type so we don't couple to the canonical Message
 * metadata type (Round 5 does not add the field to shared-types).
 */
export interface BuildContextInspectorDataInput {
	/** Current session messages (chronological). */
	messages: Message[];
	/** All attachments known to the renderer. */
	attachments: Attachment[];
	/** True when the session belongs to a project (has a cwd). */
	hasProject: boolean;
	/** Localised label for the "System prompt" chip. */
	systemPromptLabel: string;
	/** Localised label for the "Project rules: AGENTS.md" chip. */
	projectRulesLabel: string;
}

export function findLatestContextMetadata(
	messages: Message[],
): {
	messageId?: string;
	sources?: MessageContextSource[];
	strategy?: MessageContextStrategy;
} {
	for (let i = messages.length - 1; i >= 0; i--) {
		const meta = messages[i].metadata;
		if (meta?.contextSources?.length || meta?.contextStrategy) {
			return {
				messageId: messages[i].id,
				sources: meta.contextSources,
				strategy: meta.contextStrategy,
			};
		}
	}
	return {};
}

export function toggleContextSourcePinned(
	sources: MessageContextSource[],
	sourceId: string,
	pinned: boolean,
): MessageContextSource[] {
	return sources.map((source) =>
		source.id === sourceId ? { ...source, pinned } : source,
	);
}

/**
 * Pure aggregator. Given the raw inputs, produce the display model.
 * Kept side-effect free so tests can call it directly without mounting
 * zustand stores.
 */
export function buildContextInspectorData(
	input: BuildContextInspectorDataInput,
): ContextInspectorData {
	const {
		messages,
		attachments,
		hasProject,
		systemPromptLabel,
		projectRulesLabel,
	} = input;

	const sources: ContextSourceEntry[] = [];
	const latestContext = findLatestContextMetadata(messages);

	if (latestContext.sources?.length) {
		sources.push(...latestContext.sources);
	} else {
		// Legacy fallback for sessions created before context metadata existed.
		sources.push({
			id: "system-prompt",
			kind: "systemPrompt",
			label: systemPromptLabel,
			injected: true,
		});

		if (hasProject) {
			sources.push({
				id: "project-rules",
				kind: "projectRules",
				label: projectRulesLabel,
				detail: "AGENTS.md / CLAUDE.md",
				injected: true,
			});
		}

		let latestAttachmentIds: string[] = [];
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m.role === "user" && m.metadata?.attachmentIds?.length) {
				latestAttachmentIds = m.metadata.attachmentIds;
				break;
			}
		}
		for (const id of latestAttachmentIds) {
			const att = attachments.find((a) => a.id === id);
			if (att) {
				sources.push({
					id: `attachment:${id}`,
					kind: "attachment",
					label: att.originalName ?? att.name,
					detail: att.type,
					bytes: att.size,
					injected: true,
				});
			} else {
				sources.push({
					id: `attachment:${id}`,
					kind: "attachment",
					label: id,
					injected: true,
				});
			}
		}
	}

	const compactEvents: ContextCompactEvent[] = [];
	for (const m of messages) {
		const marker = m.metadata?.contextCompacted;
		if (marker) {
			compactEvents.push({
				id: m.id,
				timestamp: m.timestamp,
				...(marker.summary !== undefined ? { summary: marker.summary } : {}),
				...(marker.originalCount !== undefined
					? { originalCount: marker.originalCount }
					: {}),
			});
		}
	}

	return {
		sources,
		...(latestContext.messageId
			? { latestContextMessageId: latestContext.messageId }
			: {}),
		...(latestContext.strategy ? { strategy: latestContext.strategy } : {}),
		compactEvents,
		hasProject,
	};
}

/**
 * Renderer hook wrapper. Pulls everything from stores and passes it to
 * the pure builder. No IPC calls — safe to use inside the inspector
 * panel without adding round-trips.
 */
export interface UseContextInspectorDataOptions {
	systemPromptLabel: string;
	projectRulesLabel: string;
}

export function useContextInspectorData(
	options: UseContextInspectorDataOptions,
): ContextInspectorData {
	const messages = useChatMessageStore((s) => s.messages);
	const attachments = useAttachmentStore((s) => s.attachments);

	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);
	const projects = useProjectStore((s) => s.projects);

	const hasProject = useMemo(() => {
		const wsId = currentConversation?.workspaceId;
		if (!wsId || wsId === "default") return false;
		// Cross-check against the project registry so that a stale
		// workspaceId pointing at a removed project doesn't render a
		// misleading "Project rules" chip.
		return projects.some((p) => p.id === wsId);
	}, [currentConversation?.workspaceId, projects]);

	return useMemo(
		() =>
			buildContextInspectorData({
				messages,
				attachments,
				hasProject,
				systemPromptLabel: options.systemPromptLabel,
				projectRulesLabel: options.projectRulesLabel,
			}),
		[
			messages,
			attachments,
			hasProject,
			options.systemPromptLabel,
			options.projectRulesLabel,
		],
	);
}
