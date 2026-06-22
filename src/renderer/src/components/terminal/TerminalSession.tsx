import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useTerminalPanelStore } from "../../stores/terminalPanelStore";
import { resolveTerminalCwd } from "../../services/terminalCwdService";
import { useChatStore } from "../../stores/chatStore";
import { useThemeStore } from "../../stores/themeStore";
import { basenameNoExt, makeTerminalTitle } from "./shellTitle";
import { getTerminalPalette } from "./terminalTheme";

interface TerminalSessionProps {
	sessionId: string;
	/** When false the host hides the container; we keep the term mounted so output is preserved. */
	visible: boolean;
}

/**
 * One xterm.js terminal wired to a main-process pty session. Owns the lifecycle:
 *   1. mount → spawn pty
 *   2. data flow: pty.onData → xterm.write; xterm.onData → pty.write
 *   3. resize: ResizeObserver → fit + pty.resize
 *   4. unmount or pty exit → kill + dispose
 */
export function TerminalSession({ sessionId, visible }: TerminalSessionProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);

	const updateSession = useTerminalPanelStore((s) => s.updateSession);
	const markExited = useTerminalPanelStore((s) => s.markExited);
	const actualTheme = useThemeStore((s) => s.actualTheme);
	const palette = getTerminalPalette(actualTheme);
	// Stable ref so the (mount-once) effect can grab the current palette
	// without having to depend on it.
	const paletteRef = useRef(palette);
	paletteRef.current = palette;

	// Mount xterm + start pty. Init is deferred to the next animation frame so
	// (a) the container has real layout (otherwise fit() yields 0×0) and
	// (b) React StrictMode's double-invoke can fully cancel the first attempt
	//     before we call pty.create on the main process, avoiding the same-id
	//     spawn / kill / spawn race.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let cancelled = false;
		let term: Terminal | null = null;
		let fit: FitAddon | null = null;
		let ro: ResizeObserver | null = null;
		let onWindowResize: (() => void) | null = null;
		let offData: (() => void) | null = null;
		let offExit: (() => void) | null = null;
		let dataDisposable: { dispose: () => void } | null = null;
		let ptyCreated = false;
		let resizeTimer: number | null = null;

		const raf = window.requestAnimationFrame(() => {
			if (cancelled) return;

			term = new Terminal({
				theme: paletteRef.current.xterm,
				fontFamily:
					'Menlo, Monaco, "Courier New", "Liberation Mono", monospace',
				fontSize: 13,
				lineHeight: 1.2,
				cursorBlink: true,
				cursorStyle: "block",
				scrollback: 5000,
				allowProposedApi: true,
				convertEol: false,
				macOptionIsMeta: true,
				rightClickSelectsWord: true,
			});
			fit = new FitAddon();
			const links = new WebLinksAddon();
			term.loadAddon(fit);
			term.loadAddon(links);
			term.open(container);
			termRef.current = term;
			fitRef.current = fit;

			try {
				fit.fit();
			} catch {
				/* container may not have layout yet */
			}
			const cols = term.cols || 80;
			const rows = term.rows || 24;

			// Forward keystrokes to the pty
			dataDisposable = term.onData((d) => {
				if (cancelled) return;
				window.electron.pty.write(sessionId, d).catch(() => void 0);
			});

			// Subscribe to pty output / exit (filter by sessionId)
			offData = window.electron.pty.onData((event) => {
				if (event.sessionId !== sessionId) return;
				term?.write(event.data);
			});
			offExit = window.electron.pty.onExit((event) => {
				if (event.sessionId !== sessionId) return;
				markExited(sessionId, event.exitCode);
				term?.write(
					`\r\n\x1b[38;2;${paletteRef.current.errorRgb}m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`,
				);
			});

			// Resize handling — debounced so sidebar drag (mousemove ~60fps)
			// doesn't push SIGWINCH to the shell on every frame, which makes
			// starship reflow its prompt and leaves duplicates in scrollback.
			let lastCols = term.cols;
			let lastRows = term.rows;
			const scheduleFit = () => {
				if (cancelled || !term || !fit) return;
				if (resizeTimer != null) window.clearTimeout(resizeTimer);
				resizeTimer = window.setTimeout(() => {
					resizeTimer = null;
					if (cancelled || !term || !fit) return;
					try {
						fit.fit();
						const c = term.cols;
						const r = term.rows;
						if (c !== lastCols || r !== lastRows) {
							lastCols = c;
							lastRows = r;
							window.electron.pty.resize(sessionId, c, r).catch(() => void 0);
						}
					} catch {
						/* noop */
					}
				}, 80);
			};
			ro = new ResizeObserver(() => {
				scheduleFit();
			});
			ro.observe(container);
			onWindowResize = () => {
				scheduleFit();
			};
			window.addEventListener("resize", onWindowResize);

			// Spawn the pty
			(async () => {
				const conversationId =
					useChatStore.getState().currentConversationId ?? undefined;
				const cwd = await resolveTerminalCwd(conversationId);
				if (cancelled) return;
				const res = await window.electron.pty.create({
					sessionId,
					cwd,
					cols,
					rows,
				});
				if (cancelled) {
					if (res.success) {
						window.electron.pty.kill(sessionId).catch(() => void 0);
					}
					return;
				}
				if (!res.success || !res.data) {
					const msg = res.error || "failed to spawn pty";
					term?.write(
						`\r\n\x1b[38;2;${paletteRef.current.errorRgb}m[pty spawn failed: ${msg}]\x1b[0m\r\n`,
					);
					return;
				}
				ptyCreated = true;
				const data = res.data;
				const existing = useTerminalPanelStore
					.getState()
					.sessions.filter((s) => s.id !== sessionId);
				const realTitle = makeTerminalTitle(
					data.user,
					data.host,
					data.shell,
					existing,
				);
				updateSession(sessionId, {
					pid: data.pid,
					shell: basenameNoExt(data.shell),
					user: data.user,
					host: data.host,
					title: realTitle,
				});
				term?.focus();
			})().catch((error: unknown) => {
				if (cancelled) return;
				const msg = error instanceof Error ? error.message : String(error);
				term?.write(
					`\r\n\x1b[38;2;${paletteRef.current.errorRgb}m[pty error: ${msg}]\x1b[0m\r\n`,
				);
			});
		});

		return () => {
			cancelled = true;
			window.cancelAnimationFrame(raf);
			if (resizeTimer != null) window.clearTimeout(resizeTimer);
			if (onWindowResize) window.removeEventListener("resize", onWindowResize);
			ro?.disconnect();
			dataDisposable?.dispose();
			offData?.();
			offExit?.();
			if (ptyCreated) {
				window.electron.pty.kill(sessionId).catch(() => void 0);
			}
			term?.dispose();
			termRef.current = null;
			fitRef.current = null;
		};
	}, [sessionId, updateSession, markExited]);

	// Refit + focus when the tab becomes visible
	useEffect(() => {
		if (!visible) return;
		const id = window.setTimeout(() => {
			try {
				fitRef.current?.fit();
				const term = termRef.current;
				if (term) {
					window.electron.pty
						.resize(sessionId, term.cols, term.rows)
						.catch(() => void 0);
					term.focus();
				}
			} catch {
				/* noop */
			}
		}, 0);
		return () => window.clearTimeout(id);
	}, [visible, sessionId]);

	// Live-swap xterm theme when the app's light/dark mode changes. xterm
	// supports updating `term.options.theme` in place — existing scrollback
	// keeps its ANSI tokens but is re-painted against the new palette.
	useEffect(() => {
		const term = termRef.current;
		if (term) term.options.theme = palette.xterm;
	}, [palette]);

	return (
		<div
			className="absolute inset-0"
			style={{
				display: visible ? "block" : "none",
				background: palette.chrome.panelBg,
			}}
		>
			<div
				ref={containerRef}
				className="absolute inset-0 px-2 pt-1"
				data-testid={`terminal-session-${sessionId}`}
			/>
		</div>
	);
}
