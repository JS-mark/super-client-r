import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import type { ShortcutScope } from "../stores/shortcutStore";
import { useGlobalShortcuts } from "./useShortcuts";

/**
 * Central app shortcut hook.
 * Determines the active scope from the current route, defines handlers
 * for all shortcut IDs, and wires them into useGlobalShortcuts.
 *
 * Call this once in MainLayout.
 */
export function useAppShortcuts() {
	const navigate = useNavigate();
	const location = useLocation();
	const clearMessages = useChatStore((s) => s.clearMessages);

	// Determine active scope from current pathname
	const activeScope: ShortcutScope = useMemo(() => {
		if (
			location.pathname === "/chat" ||
			location.pathname.startsWith("/chat/")
		) {
			return "chat";
		}
		return "global";
	}, [location.pathname]);

	// Handler map: shortcut ID -> handler function
	const handlers = useMemo(
		() => ({
			// === Global shortcuts ===
			"new-chat": () => {
				clearMessages();
				navigate("/chat");
			},
			"quick-search": () => {
				// Feature not yet built
			},
			"toggle-sidebar": () => {
				// Feature not yet built
			},
			"open-settings": () => {
				navigate("/settings");
			},
			"open-bookmarks": () => {
				navigate("/bookmarks");
			},

			// === Navigation shortcuts ===
			"go-to-chat": () => {
				navigate("/chat");
			},
			"go-to-models": () => {
				navigate("/models");
			},
			"go-to-skills": () => {
				navigate("/skills");
			},
			"go-to-plugins": () => {
				navigate("/plugins");
			},
			"go-to-bookmarks": () => {
				navigate("/bookmarks");
			},

			// === Chat shortcuts ===
			"clear-chat": () => {
				clearMessages();
			},
			"focus-input": () => {
				document.querySelector<HTMLTextAreaElement>(".chat-textarea")?.focus();
			},
		}),
		[navigate, clearMessages],
	);

	useGlobalShortcuts(handlers, activeScope);
}
