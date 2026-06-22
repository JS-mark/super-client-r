/**
 * Mounts {@link RequestLogDrawer} at the application root so the main process
 * can open it from anywhere (menu item / keyboard shortcut) without having to
 * navigate into Settings first.
 *
 * Triggers:
 *   - `Cmd/Ctrl + Shift + N` — handled locally in this component.
 *   - `network:open-log-drawer` IPC event — fired from the application menu.
 */

import { useEffect, useState } from "react";
import { RequestLogDrawer } from "./RequestLogDrawer";

export function GlobalRequestLogHost() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			// Cmd+Shift+N (mac) / Ctrl+Shift+N (other) toggles the drawer.
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.shiftKey && (e.key === "N" || e.key === "n")) {
				e.preventDefault();
				setOpen((v) => !v);
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, []);

	useEffect(() => {
		if (!window.electron?.ipc) return;
		const onOpen = () => setOpen(true);
		window.electron.ipc.on("network:open-log-drawer", onOpen);
		return () => {
			window.electron.ipc.off("network:open-log-drawer", onOpen);
		};
	}, []);

	return <RequestLogDrawer open={open} onClose={() => setOpen(false)} />;
}
