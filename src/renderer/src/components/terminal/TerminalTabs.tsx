import { CloseOutlined } from "@ant-design/icons";
import { cn } from "@/lib/utils";
import type { TerminalSession } from "../../stores/terminalPanelStore";
import type { PanelChromeTheme } from "./terminalTheme";

interface TerminalTabsProps {
	sessions: TerminalSession[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	chrome: PanelChromeTheme;
}

/**
 * Compact `>_` glyph rendered inside each tab chip — same shape as the title
 * bar's terminal toggle, scaled down to 12px so it sits comfortably alongside
 * the `user@host` label.
 */
function TabGlyph({ size = 12 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{ flexShrink: 0 }}
		>
			<rect x="1.5" y="2.5" width="13" height="11" rx="2" />
			<path d="M4.5 6L7 8L4.5 10" />
			<path d="M8 10.5H11.5" />
		</svg>
	);
}

/**
 * Horizontally scrollable tab strip. Each tab is a chip with a leading `>_`
 * glyph + the user@host (or shell-fallback) title and a close button visible
 * on hover/active. Layout matches the reference design.
 */
export function TerminalTabs({
	sessions,
	activeId,
	onSelect,
	onClose,
	chrome,
}: TerminalTabsProps) {
	if (sessions.length === 0) return null;

	return (
		<div
			className="terminal-panel-tabs flex items-center gap-1 overflow-x-auto"
			style={{ minWidth: 0 }}
		>
			{sessions.map((s) => {
				const isActive = s.id === activeId;
				return (
					<div
						key={s.id}
						className={cn(
							"terminal-tab-chip group flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-t-md cursor-pointer text-xs transition-colors flex-shrink-0",
						)}
						data-active={isActive ? "true" : undefined}
						style={{
							background: isActive ? chrome.activeChipBg : "transparent",
							color: isActive ? chrome.chromeText : chrome.chromeTextMuted,
							opacity: s.exited ? 0.55 : 1,
							fontWeight: isActive ? 600 : 400,
							// Accent underline drawn as an inset shadow so it stays
							// inside the chip's bounding box (the parent tab strip
							// uses overflow-x-auto and would clip an absolutely
							// positioned bar below the chip).
							boxShadow: isActive
								? `inset 0 -2px 0 0 ${chrome.accent}`
								: "none",
						}}
						onClick={() => onSelect(s.id)}
						onAuxClick={(e) => {
							// middle click closes
							if (e.button === 1) {
								e.preventDefault();
								onClose(s.id);
							}
						}}
						role="tab"
						aria-selected={isActive}
					>
						<TabGlyph />
						<span
							className="truncate max-w-[180px]"
							title={s.title}
							style={{
								fontFamily: "var(--font-mono, ui-monospace, monospace)",
							}}
						>
							{s.title}
						</span>
						<button
							type="button"
							className={cn(
								"terminal-tab-close flex items-center justify-center w-4 h-4 rounded transition-opacity ml-0.5",
								isActive
									? "opacity-60 hover:opacity-100"
									: "opacity-0 group-hover:opacity-60 hover:opacity-100",
							)}
							style={{
								color: isActive ? chrome.chromeText : chrome.chromeTextMuted,
							}}
							onClick={(e) => {
								e.stopPropagation();
								onClose(s.id);
							}}
							aria-label="关闭终端"
						>
							<CloseOutlined style={{ fontSize: 10 }} />
						</button>
					</div>
				);
			})}
		</div>
	);
}
