import { Tooltip } from "antd";
import type { ComponentType } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
	useThemeStore,
	type ThemeMode,
} from "../../stores/themeStore";

/**
 * Bottom-sidebar theme switcher. One-click cycle:
 *
 *     跟随系统 (auto) → 浅色 (light) → 深色 (dark) → 跟随系统 → ...
 *
 * The icon and tooltip both reflect the CURRENT mode; we don't preview
 * the next mode on the icon because users typically read state ("what is
 * it now?") more naturally than action ("what will it become?"). State
 * lives in `themeStore` (persisted) and the rest of the UI re-renders the
 * moment `setMode` runs.
 *
 * Icon strategy: small inline SVGs (15×15, 1.8-stroke) — antd icons don't
 * ship a clean Sun glyph and mixing weights with the neighbouring
 * `SettingOutlined` looked off-balance.
 */

const MODE_CYCLE: readonly ThemeMode[] = ["auto", "light", "dark"];

interface ThemeToggleButtonProps {
	/** Foreground color for the icon when idle. */
	color: string;
	/** Background to apply on hover. */
	hoverBg: string;
}

const SunIcon = () => (
	<svg
		width="15"
		height="15"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
	</svg>
);

const MoonIcon = () => (
	<svg
		width="15"
		height="15"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
	</svg>
);

const DesktopIcon = () => (
	<svg
		width="15"
		height="15"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<rect x="3" y="4" width="18" height="12" rx="2" />
		<path d="M8 20h8M12 16v4" />
	</svg>
);

export function ThemeToggleButton({ color, hoverBg }: ThemeToggleButtonProps) {
	const { t } = useTranslation();
	const mode = useThemeStore((s) => s.mode);
	const actualTheme = useThemeStore((s) => s.actualTheme);
	const setMode = useThemeStore((s) => s.setMode);

	// Icon reflects the CURRENT mode. `auto` uses the desktop glyph so the
	// "following system" state is distinguishable from the resolved colors.
	const Icon: ComponentType =
		mode === "auto" ? DesktopIcon : actualTheme === "dark" ? MoonIcon : SunIcon;

	const handleClick = useCallback(async () => {
		const idx = MODE_CYCLE.indexOf(mode);
		// `indexOf` can return -1 if a future ThemeMode value sneaks in;
		// fall back to the first cycle entry so the click still does
		// something useful.
		const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length] ?? MODE_CYCLE[0];
		setMode(next);
		// Persist to the main process too. Without this, only the renderer's
		// zustand/localStorage copy updates while the main-process store keeps
		// the old mode — then any later `useTheme` mount (e.g. ThemeSettings on
		// the Settings page) runs `loadThemeFromMain` and rolls the theme back
		// to the stale value, so switching here and navigating to Settings made
		// the colors change. Mirror AppSidebar/useTheme so all switch entries
		// keep the two stores in sync.
		try {
			await window.electron.theme.set(next);
		} catch (err) {
			console.error("Failed to sync theme:", err);
		}
	}, [mode, setMode]);

	const tooltipTitle =
		mode === "auto"
			? t("theme.tooltip.auto", "自动", { ns: "settings" })
			: mode === "dark"
				? t("theme.tooltip.dark", "深色", { ns: "settings" })
				: t("theme.tooltip.light", "浅色", { ns: "settings" });

	return (
		<Tooltip title={tooltipTitle} mouseEnterDelay={0.3}>
			<button
				type="button"
				onClick={handleClick}
				className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
				style={{ color }}
				data-testid="sidebar-theme-toggle"
				aria-label={tooltipTitle}
				onMouseEnter={(e) => {
					e.currentTarget.style.background = hoverBg;
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.background = "transparent";
				}}
			>
				<Icon />
			</button>
		</Tooltip>
	);
}
