/**
 * useContextInspectorData — read-only aggregator for the Context section
 * of the environment inspector (Round-5 R10 MVP).
 *
 * The hook exposes a "what's currently injected into the model context"
 * view, aggregating from data that already lives in the renderer stores
 * and per-message metadata. It **must not** trigger new IPC calls.
 *
 * MVP scope (Phase 3 Round 5):
 *   - System prompt chip (always present when a session is active)
 *   - Project rules chip (AGENTS.md / CLAUDE.md placeholder) when the
 *     session is bound to a project (workspaceId ≠ "default").
 *     File is not read from disk in this round; the chip only signals
 *     that project rules may be in play. ProjectRulesReader wiring is
 *     deferred to a later Phase 3 batch.
 *   - Attached files derived from the latest user message's
 *     `metadata.attachmentIds`.
 *   - Compact-event log entries derived from any message whose metadata
 *     carries a `contextCompacted` marker. If no such messages exist,
 *     the list is empty — we do not synthesise placeholders.
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
import type { Message } from "@super-client/shared-types/chat";

export type ContextSourceKind =
	| "systemPrompt"
	| "projectRules"
	| "attachment"
	| "other";

export interface ContextSourceEntry {
	/** Stable id (used as React key). */
	id: string;
	kind: ContextSourceKind;
	/** Display label (already localised — callers may still translate the
	 * fallback but no i18n happens inside this hook). */
	label: string;
	/** Optional detail line surfaced in tooltip. */
	detail?: string;
	/** Byte count if known (attachment size etc.). */
	bytes?: number;
}

export interface ContextCompactEvent {
	id: string;
	timestamp: number;
	/** Free-form description surfaced next to the timestamp. */
	summary?: string;
}

export interface ContextInspectorData {
	/** All source chips in a stable render order. */
	sources: ContextSourceEntry[];
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
interface MessageMetadataLike {
	contextCompacted?: {
		summary?: string;
	};
}

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

	// 1. System prompt is always present as long as the session is active.
	sources.push({
		id: "system-prompt",
		kind: "systemPrompt",
		label: systemPromptLabel,
	});

	// 2. Project rules placeholder when the session has a project cwd.
	//    Actual AGENTS.md / CLAUDE.md content read is deferred to a later
	//    Phase 3 batch — this round only signals "rules are available".
	if (hasProject) {
		sources.push({
			id: "project-rules",
			kind: "projectRules",
			label: projectRulesLabel,
			detail: "AGENTS.md / CLAUDE.md",
		});
	}

	// 3. Latest user message's attachments. Older attachments in the same
	//    conversation are ignored — the "context" pane reflects what got
	//    injected in the last turn.
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
			});
		} else {
			// The attachment metadata no longer resolves (e.g. cleared cache).
			// Still surface the id so users know the message referenced it.
			sources.push({
				id: `attachment:${id}`,
				kind: "attachment",
				label: id,
			});
		}
	}

	// 4. Compact events — only surface real markers.
	const compactEvents: ContextCompactEvent[] = [];
	for (const m of messages) {
		const meta = m.metadata as MessageMetadataLike | undefined;
		const marker = meta?.contextCompacted;
		if (marker) {
			compactEvents.push({
				id: m.id,
				timestamp: m.timestamp,
				summary: marker.summary,
			});
		}
	}

	return { sources, compactEvents, hasProject };
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
