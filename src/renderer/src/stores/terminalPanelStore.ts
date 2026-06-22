/**
 * Terminal Panel Store
 *
 * Manages the bottom-docked terminal panel. Layout (height + open/closed) is
 * persisted to localStorage; pty sessions live only in memory because the
 * underlying child processes don't survive an app restart.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TerminalSession {
	/** Renderer-generated id; matches the pty sessionId in main process. */
	id: string;
	/** Display label, e.g. "mark@MacBookPro" or "mark@MacBookPro 2". */
	title: string;
	/** Resolved shell name (basename of shell path, e.g. "zsh"). */
	shell: string;
	/** Login user, used in tab labels (`user@host`). */
	user?: string;
	/** Hostname, used in tab labels (`user@host`). */
	host?: string;
	/** PID once main process spawn succeeds; 0 while pending. */
	pid: number;
	/** True after the pty exited; we keep the tab around so the user can read output. */
	exited: boolean;
	/** Exit code recorded when exited === true. */
	exitCode?: number;
}

interface TerminalPanelState {
	// ── persisted ────────────────────────────────
	isOpen: boolean;
	height: number;
	// ── transient ────────────────────────────────
	sessions: TerminalSession[];
	activeId: string | null;
	// ── actions ─────────────────────────────────
	open: () => void;
	close: () => void;
	toggle: () => void;
	setHeight: (h: number) => void;
	addSession: (session: TerminalSession) => void;
	removeSession: (id: string) => void;
	updateSession: (id: string, patch: Partial<TerminalSession>) => void;
	setActive: (id: string) => void;
	markExited: (id: string, exitCode: number) => void;
}

export const TERMINAL_DEFAULT_HEIGHT = 280;
export const TERMINAL_MIN_HEIGHT = 160;
/** Soft upper bound; the resizer also clamps against the live window height. */
export const TERMINAL_MAX_HEIGHT = 1200;

export const useTerminalPanelStore = create<TerminalPanelState>()(
	persist(
		(set, get) => ({
			isOpen: false,
			height: TERMINAL_DEFAULT_HEIGHT,
			sessions: [],
			activeId: null,

			open: () => set({ isOpen: true }),
			close: () => set({ isOpen: false }),
			toggle: () => set({ isOpen: !get().isOpen }),

			setHeight: (h) =>
				set({
					height: Math.max(
						TERMINAL_MIN_HEIGHT,
						Math.min(TERMINAL_MAX_HEIGHT, Math.round(h)),
					),
				}),

			addSession: (session) =>
				set((s) => ({
					sessions: [...s.sessions, session],
					activeId: session.id,
				})),

			removeSession: (id) =>
				set((s) => {
					const next = s.sessions.filter((x) => x.id !== id);
					let activeId = s.activeId;
					if (activeId === id) {
						activeId = next.length > 0 ? next[next.length - 1].id : null;
					}
					return {
						sessions: next,
						activeId,
						// auto-collapse panel when last tab closes
						isOpen: next.length === 0 ? false : s.isOpen,
					};
				}),

			updateSession: (id, patch) =>
				set((s) => ({
					sessions: s.sessions.map((x) =>
						x.id === id ? { ...x, ...patch } : x,
					),
				})),

			setActive: (id) => set({ activeId: id }),

			markExited: (id, exitCode) =>
				set((s) => ({
					sessions: s.sessions.map((x) =>
						x.id === id ? { ...x, exited: true, exitCode } : x,
					),
				})),
		}),
		{
			name: "terminal-panel-storage",
			partialize: (state) => ({
				isOpen: state.isOpen,
				height: state.height,
			}),
		},
	),
);
