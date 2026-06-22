import type { TerminalSession } from "../../stores/terminalPanelStore";

/**
 * Compute a tab title for a new pty session.
 *
 * Preferred form: "user@host" (mirrors the reference design and matches what
 * users see in their actual shell prompt). When the same user@host already has
 * tabs, append a numeric suffix: "mark@MacBookPro 2".
 *
 * Falls back to shell basename + suffix if user/host are missing.
 */
export function makeTerminalTitle(
	user: string | undefined,
	host: string | undefined,
	shellPath: string,
	existing: TerminalSession[],
): string {
	const base =
		user && host ? `${user}@${shortHost(host)}` : basenameNoExt(shellPath);
	const same = existing.filter(
		(s) => titleStem(s.title) === base || s.title === base,
	);
	if (same.length === 0) return base;
	return `${base} ${same.length + 1}`;
}

/** Drop trailing " 2" / " 3" suffixes when comparing against the base. */
function titleStem(title: string): string {
	return title.replace(/\s+\d+$/, "");
}

/** Strip the .local / .lan suffixes that macOS / Linux often append. */
function shortHost(h: string): string {
	return h.replace(/\.(local|lan|home)$/i, "");
}

export function basenameNoExt(p: string): string {
	if (!p) return "shell";
	const cleaned = p.replace(/\\/g, "/");
	const last = cleaned.split("/").filter(Boolean).pop() || "shell";
	return last.replace(/\.(exe|cmd|bat)$/i, "");
}
