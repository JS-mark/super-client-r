import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import {
	TERMINAL_DEFAULT_HEIGHT,
	TERMINAL_MIN_HEIGHT,
	useTerminalPanelStore,
} from "../../stores/terminalPanelStore";
import { useThemeStore } from "../../stores/themeStore";
import { TerminalPanelResizer } from "./TerminalPanelResizer";
import { TerminalSession } from "./TerminalSession";
import { TerminalTabs } from "./TerminalTabs";
import { makeTerminalTitle } from "./shellTitle";
import { getTerminalPalette } from "./terminalTheme";
import "./TerminalPanel.css";

function detectShellGuess(): string {
	if (
		typeof navigator !== "undefined" &&
		navigator.platform.toLowerCase().includes("win")
	) {
		return "powershell";
	}
	return "zsh";
}

/**
 * Bottom-docked terminal panel.
 *
 *   ┌──────────── resize handle ────────────┐
 *   │ 终端  [zsh] [super-client-r 1]   + ×  │ <- header
 *   │ ────────────────────────────────────  │
 *   │            xterm session              │ <- body
 *   └────────────────────────────────────────┘
 */
export function TerminalPanel() {
	const { t } = useTranslation();
	const actualTheme = useThemeStore((s) => s.actualTheme);
	const palette = getTerminalPalette(actualTheme);

	const isOpen = useTerminalPanelStore((s) => s.isOpen);
	const height = useTerminalPanelStore((s) => s.height);
	const sessions = useTerminalPanelStore((s) => s.sessions);
	const activeId = useTerminalPanelStore((s) => s.activeId);
	const setHeight = useTerminalPanelStore((s) => s.setHeight);
	const addSession = useTerminalPanelStore((s) => s.addSession);
	const removeSession = useTerminalPanelStore((s) => s.removeSession);
	const setActive = useTerminalPanelStore((s) => s.setActive);
	const close = useTerminalPanelStore((s) => s.close);
	const toggle = useTerminalPanelStore((s) => s.toggle);

	const handleNewSession = useCallback(() => {
		const id = nanoid();
		const guess = detectShellGuess();
		// Provisional title; real "user@host" label is filled in by
		// TerminalSession after pty.create returns.
		const provisional = makeTerminalTitle(
			undefined,
			undefined,
			guess,
			useTerminalPanelStore.getState().sessions,
		);
		addSession({
			id,
			title: provisional,
			shell: guess,
			pid: 0,
			exited: false,
		});
	}, [addSession]);

	// Auto-create the first session when the panel opens
	useEffect(() => {
		if (isOpen && sessions.length === 0) {
			handleNewSession();
		}
	}, [isOpen, sessions.length, handleNewSession]);

	// External "terminal:toggle" event support (for future entry points)
	useEffect(() => {
		const handler = () => toggle();
		window.addEventListener("terminal:toggle", handler);
		return () => window.removeEventListener("terminal:toggle", handler);
	}, [toggle]);

	// Keyboard shortcuts: Ctrl/Cmd+` toggles, Ctrl/Cmd+Shift+T new tab when open
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const mod = e.ctrlKey || e.metaKey;
			if (mod && e.key === "`") {
				e.preventDefault();
				toggle();
				return;
			}
			if (mod && e.shiftKey && (e.key === "T" || e.key === "t")) {
				if (useTerminalPanelStore.getState().isOpen) {
					e.preventDefault();
					handleNewSession();
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [toggle, handleNewSession]);

	const handleResetHeight = useCallback(() => {
		setHeight(TERMINAL_DEFAULT_HEIGHT);
	}, [setHeight]);

	const handleHeightChange = useCallback(
		(next: number) => {
			const max = Math.max(
				TERMINAL_MIN_HEIGHT,
				Math.floor(window.innerHeight * 0.8),
			);
			setHeight(Math.min(max, next));
		},
		[setHeight],
	);

	if (!isOpen) return null;

	return (
		<div
			className="terminal-panel relative flex flex-col"
			data-mode={actualTheme}
			style={{
				height,
				background: palette.chrome.panelBg,
				borderTop: `1px solid ${palette.chrome.border}`,
				color: palette.chrome.chromeText,
			}}
			data-testid="terminal-panel"
		>
			<TerminalPanelResizer
				currentHeight={height}
				onHeightChange={handleHeightChange}
				onResetHeight={handleResetHeight}
			/>

			{/* Header */}
			<div
				className="flex items-center justify-between gap-2 px-3 py-1.5 flex-shrink-0"
				style={{
					borderBottom: `1px solid ${palette.chrome.borderSecondary}`,
				}}
			>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					{sessions.length === 0 && (
						<span
							className="text-xs font-medium flex-shrink-0"
							style={{ color: palette.chrome.chromeText }}
						>
							{t("terminal.titleLabel", "终端")}
						</span>
					)}
					<TerminalTabs
						sessions={sessions}
						activeId={activeId}
						onSelect={setActive}
						onClose={(id) => {
							removeSession(id);
						}}
						chrome={palette.chrome}
					/>
				</div>

				<div className="flex items-center gap-1 flex-shrink-0">
					<Tooltip title={t("terminal.newTab", "新建终端")} placement="bottom">
						<button
							type="button"
							onClick={handleNewSession}
							className="terminal-panel-icon-btn flex items-center justify-center w-7 h-7 rounded transition-colors"
							style={{ color: palette.chrome.chromeText }}
							aria-label={t("terminal.newTab", "新建终端")}
						>
							<PlusOutlined style={{ fontSize: 14 }} />
						</button>
					</Tooltip>
					<Tooltip
						title={t("terminal.closePanel", "关闭面板")}
						placement="bottom"
					>
						<button
							type="button"
							onClick={() => close()}
							className="terminal-panel-icon-btn flex items-center justify-center w-7 h-7 rounded transition-colors"
							style={{ color: palette.chrome.chromeText }}
							aria-label={t("terminal.closePanel", "关闭面板")}
						>
							<CloseOutlined style={{ fontSize: 14 }} />
						</button>
					</Tooltip>
				</div>
			</div>

			{/* Body — keep all sessions mounted so output is preserved on tab switch */}
			<div className="relative flex-1 min-h-0">
				{sessions.map((s) => (
					<TerminalSession
						key={s.id}
						sessionId={s.id}
						visible={s.id === activeId}
					/>
				))}
			</div>
		</div>
	);
}
