import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	listWorkspaceFiles,
	type WorkspaceFileEntry,
} from "../services/workspaceService";

/**
 * Composer "@" file-mention hook.
 *
 * Mirrors `useSlashCommands` in shape (panel state, filtered items, capture-
 * phase keydown handler) so it slots into the same `topOverlay` +
 * `registerKeydownHandler` plumbing on ChatComposer. Differences from slash:
 *
 *  - Trigger is caret-aware (the `@` doesn't have to be at column 0).
 *  - Selection only splices the matched `@<query>` segment; the rest of the
 *    input is preserved. The hook does NOT mutate the input itself — it
 *    exposes a pure helper (`applyMentionToValue`) and a callback the parent
 *    wires up to its own state.
 */

/**
 * Pure helper exported for unit testing — given a value + caret and an
 * insertion string, replaces the trailing `@<query>` token before the caret
 * with `@<insertion> ` and returns the new value + caret position.
 *
 * If there is no `@<query>` token before the caret, returns the input as-is.
 */
export function applyMentionToValue(
	value: string,
	caret: number,
	insertion: string,
): { value: string; caret: number } {
	const safeCaret = Math.max(0, Math.min(caret, value.length));
	const before = value.slice(0, safeCaret);
	const after = value.slice(safeCaret);
	const replaced = before.replace(
		/(^|\s)@([^\s@]*)$/,
		(_match, lead) => `${lead}@${insertion} `,
	);
	if (replaced === before) {
		// No trailing @token before caret → just insert at caret as fallback.
		return { value: before + `@${insertion} ` + after, caret: before.length + insertion.length + 2 };
	}
	return { value: replaced + after, caret: replaced.length };
}

/**
 * Pure helper exported for unit testing — given a value + caret, returns the
 * mention query string if the caret is positioned right after an `@<query>`
 * token (with the `@` preceded by start-of-string or whitespace, and no
 * whitespace inside the query). Returns `null` otherwise.
 */
export function detectMentionTrigger(
	value: string,
	caret: number,
): string | null {
	const safeCaret = Math.max(0, Math.min(caret, value.length));
	const before = value.slice(0, safeCaret);
	const m = before.match(/(?:^|\s)@([^\s@]{0,200})$/);
	return m ? m[1] : null;
}

interface UseAtMentionsParams {
	sessionId: string | null | undefined;
	/**
	 * When the slash panel is open we yield: detection short-circuits and the
	 * capture-phase keydown handler doesn't consume Arrow/Enter/Esc. Slash
	 * starts at column 0, mentions are mid-text, so the two are usually
	 * mutually exclusive — this is a safety net for edge cases.
	 */
	isSlashOpen?: boolean;
}

export interface UseAtMentionsReturn {
	mentionPanelOpen: boolean;
	mentionQuery: string;
	mentionFilteredItems: WorkspaceFileEntry[];
	mentionHighlight: number;
	setMentionHighlight: (n: number) => void;
	closeMentionPanel: () => void;
	handleMentionInputChange: (value: string, caret: number) => void;
	registerKeydownHandler: (el: HTMLElement | null) => () => void;
	refresh: () => void;
	/**
	 * Register the splice callback the capture-phase Enter handler should
	 * invoke. The host composer owns the live `value` + caret state, so we
	 * can't hardcode the splice inside the hook — the parent assigns its
	 * current handler here. The hook stores it through a ref, so calling
	 * `setSelectHandler` on every render is cheap (no listener re-registration).
	 */
	setSelectHandler: (fn: ((item: WorkspaceFileEntry) => void) | null) => void;
}

const DEFAULT_LIMIT = 5000;
const RESULT_CAP = 200;

export function useAtMentions({
	sessionId,
	isSlashOpen,
}: UseAtMentionsParams): UseAtMentionsReturn {
	const [mentionPanelOpen, setMentionPanelOpen] = useState(false);
	const [mentionQuery, setMentionQuery] = useState("");
	const [items, setItems] = useState<WorkspaceFileEntry[]>([]);
	const [mentionHighlight, setMentionHighlight] = useState(0);

	// Refs so the capture-phase keydown listener doesn't need to re-register
	// on every state/prop change.
	const onSelectRef = useRef<((item: WorkspaceFileEntry) => void) | null>(
		null,
	);
	const setSelectHandler = useCallback(
		(fn: ((item: WorkspaceFileEntry) => void) | null) => {
			onSelectRef.current = fn;
		},
		[],
	);
	const isSlashOpenRef = useRef(!!isSlashOpen);
	isSlashOpenRef.current = !!isSlashOpen;

	// Load the workspace listing once per sessionId. workspaceService caches
	// for 30s internally so this is cheap on switch.
	useEffect(() => {
		if (!sessionId) {
			setItems([]);
			return;
		}
		let cancelled = false;
		listWorkspaceFiles(sessionId, { limit: DEFAULT_LIMIT }).then((res) => {
			if (!cancelled) setItems(res.files);
		});
		return () => {
			cancelled = true;
		};
	}, [sessionId]);

	const mentionFilteredItems = useMemo<WorkspaceFileEntry[]>(() => {
		if (!mentionPanelOpen) return [];
		if (!mentionQuery) {
			// Already mtime-sorted server-side; show the freshest slice.
			return items.slice(0, RESULT_CAP);
		}
		const q = mentionQuery.toLowerCase();
		const scored: Array<{ item: WorkspaceFileEntry; score: number }> = [];
		for (const it of items) {
			const name = it.name.toLowerCase();
			const rel = it.relativePath.toLowerCase();
			let score = 0;
			if (name === q) score = 4;
			else if (name.startsWith(q)) score = 3;
			else if (name.includes(q)) score = 2;
			else if (rel.includes(q)) score = 1;
			if (score) scored.push({ item: it, score });
		}
		scored.sort((a, b) =>
			b.score !== a.score
				? b.score - a.score
				: b.item.mtimeMs - a.item.mtimeMs,
		);
		return scored.slice(0, RESULT_CAP).map((s) => s.item);
	}, [mentionPanelOpen, mentionQuery, items]);

	// Reset highlight when the filtered set changes
	useEffect(() => {
		setMentionHighlight(0);
	}, [mentionQuery, mentionPanelOpen]);

	// Mirror state for the capture-phase listener
	const stateRef = useRef({
		open: false,
		items: [] as WorkspaceFileEntry[],
		highlight: 0,
	});
	stateRef.current = {
		open: mentionPanelOpen,
		items: mentionFilteredItems,
		highlight: mentionHighlight,
	};

	const closeMentionPanel = useCallback(() => {
		setMentionPanelOpen(false);
		setMentionQuery("");
	}, []);

	const handleMentionInputChange = useCallback(
		(value: string, caret: number) => {
			// Slash takes precedence — its hook owns the panel when input
			// starts with `/`.
			if (value.startsWith("/")) {
				if (mentionPanelOpen) {
					setMentionPanelOpen(false);
					setMentionQuery("");
				}
				return;
			}
			const q = detectMentionTrigger(value, caret);
			if (q !== null) {
				setMentionPanelOpen(true);
				setMentionQuery(q);
			} else if (mentionPanelOpen) {
				setMentionPanelOpen(false);
				setMentionQuery("");
			}
		},
		[mentionPanelOpen],
	);

	const registerKeydownHandler = useCallback((el: HTMLElement | null) => {
		if (!el) return () => {};
		const handleKeyDown = (e: KeyboardEvent) => {
			const { open, items: list, highlight } = stateRef.current;
			if (!open) return;
			if (isSlashOpenRef.current) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setMentionHighlight(highlight < list.length - 1 ? highlight + 1 : 0);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setMentionHighlight(highlight > 0 ? highlight - 1 : list.length - 1);
			} else if (e.key === "Enter") {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (list.length > 0) {
					onSelectRef.current?.(list[highlight]);
					setMentionPanelOpen(false);
					setMentionQuery("");
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setMentionPanelOpen(false);
				setMentionQuery("");
			}
		};
		el.addEventListener("keydown", handleKeyDown, true);
		return () => el.removeEventListener("keydown", handleKeyDown, true);
	}, []);

	const refresh = useCallback(() => {
		if (!sessionId) return;
		listWorkspaceFiles(sessionId, { force: true, limit: DEFAULT_LIMIT }).then(
			(res) => setItems(res.files),
		);
	}, [sessionId]);

	return {
		mentionPanelOpen,
		mentionQuery,
		mentionFilteredItems,
		mentionHighlight,
		setMentionHighlight,
		closeMentionPanel,
		handleMentionInputChange,
		registerKeydownHandler,
		refresh,
		setSelectHandler,
	};
}
