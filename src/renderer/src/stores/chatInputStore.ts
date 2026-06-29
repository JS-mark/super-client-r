/**
 * Composer input value, lifted out of React's component tree.
 *
 * Background (perf, 2026-06-28): the composer's text lived in `useChat`'s
 * `useState`, which meant every keystroke re-rendered the entire `Chat.tsx`
 * page — and through it `useChatPageState`, `useChat`'s memoised callbacks,
 * the slash/mention hooks, and the rest of the chat surface. Even though
 * downstream `useMemo`/`memo` boundaries kept the actual reconciliation
 * cheap (we measured 8 commits per 10s of typing, not 200), the function
 * call overhead of re-running so many hooks on every keystroke still
 * showed up under heavier scenarios.
 *
 * Moving the value into a dedicated Zustand store means:
 *  - Only components that *display* the value (the composer textarea, the
 *    char counter, the mention/slash matchers) re-render when it changes.
 *  - Side-effect consumers (`useChat.sendMessage` fallback, auto-send,
 *    conversation-name derivation) read via `getState()` and don't
 *    subscribe — so they don't re-render on each keystroke.
 *
 * The store is intentionally tiny: no persistence (we discard the draft on
 * reload), no history, no per-conversation isolation (the composer is a
 * single global surface — switching sessions resets it, see
 * `useChatPageState.tsx`'s session-change effect).
 */

import { create } from "zustand";

interface ChatInputState {
	value: string;
	setValue: (value: string) => void;
	clear: () => void;
}

export const useChatInputStore = create<ChatInputState>()((set) => ({
	value: "",
	setValue: (value) => set({ value }),
	clear: () => set({ value: "" }),
}));
