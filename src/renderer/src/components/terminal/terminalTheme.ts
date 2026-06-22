/**
 * Light + dark palettes for the terminal panel.
 *
 * Dark: Catppuccin Mocha (matches DeviceTerminal so terminals look uniform).
 * Light: Catppuccin Latte — same family, light surface, identical hue mapping.
 *
 * Each palette also includes panel-level (non-xterm) tokens so the wrapping
 * chrome (header bar, tab strip, body background) tracks the active mode.
 */

import type { ITheme } from "@xterm/xterm";

export interface PanelChromeTheme {
	/** Panel body background (also the xterm theme.background). */
	panelBg: string;
	/** Top edge / header bottom border. */
	border: string;
	/** Subtle secondary border inside header. */
	borderSecondary: string;
	/** Default (active) foreground for chrome text (e.g. active tab label). */
	chromeText: string;
	/** Muted foreground for inactive tabs / secondary chrome text. */
	chromeTextMuted: string;
	/** Active tab chip background (used as a low-opacity tint). */
	activeChipBg: string;
	/** Tab hover background. */
	hoverBg: string;
	/** Accent line color used to mark the active tab. */
	accent: string;
}

export interface TerminalPalette {
	xterm: ITheme;
	chrome: PanelChromeTheme;
	/** Inline-ANSI red used for error / exit messages. */
	errorRgb: string;
}

const DARK: TerminalPalette = {
	xterm: {
		background: "#1e1e2e",
		foreground: "#cdd6f4",
		cursor: "#f5e0dc",
		cursorAccent: "#1e1e2e",
		selectionBackground: "#585b7066",
		black: "#45475a",
		red: "#f38ba8",
		green: "#a6e3a1",
		yellow: "#f9e2af",
		blue: "#89b4fa",
		magenta: "#f5c2e7",
		cyan: "#94e2d5",
		white: "#bac2de",
		brightBlack: "#585b70",
		brightRed: "#f38ba8",
		brightGreen: "#a6e3a1",
		brightYellow: "#f9e2af",
		brightBlue: "#89b4fa",
		brightMagenta: "#f5c2e7",
		brightCyan: "#94e2d5",
		brightWhite: "#a6adc8",
	},
	chrome: {
		panelBg: "#1e1e2e",
		border: "rgba(255, 255, 255, 0.12)",
		borderSecondary: "rgba(255, 255, 255, 0.06)",
		chromeText: "#cdd6f4",
		chromeTextMuted: "rgba(205, 214, 244, 0.55)",
		activeChipBg: "rgba(255, 255, 255, 0.05)",
		hoverBg: "rgba(255, 255, 255, 0.05)",
		accent: "#89b4fa",
	},
	errorRgb: "243;139;168",
};

const LIGHT: TerminalPalette = {
	xterm: {
		// Light terminal — surface matches antd's --color-bg-container (#ffffff)
		// so the panel reads as part of the same chrome as the chat composer
		// card. Foreground & ANSI palette stay Catppuccin Latte for hue
		// consistency with the dark Mocha set.
		background: "#ffffff",
		foreground: "#4c4f69",
		cursor: "#dc8a78",
		cursorAccent: "#ffffff",
		selectionBackground: "#acb0be66",
		black: "#5c5f77",
		red: "#d20f39",
		green: "#40a02b",
		yellow: "#df8e1d",
		blue: "#1e66f5",
		magenta: "#ea76cb",
		cyan: "#179299",
		white: "#acb0be",
		brightBlack: "#6c6f85",
		brightRed: "#d20f39",
		brightGreen: "#40a02b",
		brightYellow: "#df8e1d",
		brightBlue: "#1e66f5",
		brightMagenta: "#ea76cb",
		brightCyan: "#179299",
		brightWhite: "#bcc0cc",
	},
	chrome: {
		// `#ffffff` = antd's --color-bg-container in light mode, same value
		// used by .chat-composer-card. Border tints copy --color-border /
		// --color-border-secondary so the panel's seams line up with the rest
		// of the chrome.
		panelBg: "#ffffff",
		border: "#d9d9d9",
		borderSecondary: "#f0f0f0",
		chromeText: "#4c4f69",
		chromeTextMuted: "rgba(76, 79, 105, 0.60)",
		activeChipBg: "rgba(0, 0, 0, 0.04)",
		hoverBg: "rgba(0, 0, 0, 0.04)",
		accent: "#1e66f5",
	},
	errorRgb: "210;15;57",
};

export function getTerminalPalette(mode: "light" | "dark"): TerminalPalette {
	return mode === "light" ? LIGHT : DARK;
}
