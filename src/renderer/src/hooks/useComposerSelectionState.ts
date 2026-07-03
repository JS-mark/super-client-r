/**
 * useComposerSelectionState — the small bundle of "what did the user pick
 * in the composer" state used by `useChat`:
 *
 *   - `selectedAgentId`        — from the agent picker
 *   - `selectedSkillId`        — from the slash panel or explicit choice
 *   - `selectedCommandName`    — the sub-command inside a skill
 *   - `messageModelOverride`   — one-shot model override for the next send
 *   - `editingMessageIdRef`    — the message currently being edited in place
 *
 * Precedence rules kept intentionally simple: setters are independent.
 * `sendMessage` in `useChat` clears `selectedCommandName` after dispatching
 * a skill message (one-shot semantics); we do NOT auto-clear commandName
 * when `selectedSkillId` changes, to preserve the current UX where the
 * slash panel can update skill + command together.
 */
import { useRef, useState, type MutableRefObject } from "react";
import type { ActiveModelSelection } from "../types/models";

export interface ComposerSelectionState {
	selectedAgentId: string | null;
	setSelectedAgentId: (id: string | null) => void;
	selectedSkillId: string | null;
	setSelectedSkillId: (id: string | null) => void;
	selectedCommandName: string | null;
	setSelectedCommandName: (name: string | null) => void;
	messageModelOverride: ActiveModelSelection | null;
	setMessageModelOverride: (sel: ActiveModelSelection | null) => void;
	editingMessageIdRef: MutableRefObject<string | null>;
}

export function useComposerSelectionState(): ComposerSelectionState {
	const editingMessageIdRef = useRef<string | null>(null);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
	const [selectedCommandName, setSelectedCommandName] = useState<
		string | null
	>(null);
	const [messageModelOverride, setMessageModelOverride] =
		useState<ActiveModelSelection | null>(null);

	return {
		selectedAgentId,
		setSelectedAgentId,
		selectedSkillId,
		setSelectedSkillId,
		selectedCommandName,
		setSelectedCommandName,
		messageModelOverride,
		setMessageModelOverride,
		editingMessageIdRef,
	};
}
