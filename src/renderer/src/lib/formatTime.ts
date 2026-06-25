/**
 * Smart relative time formatter for chat message headers.
 *
 * Today / yesterday still collapse to a relative label (it would be silly to
 * print the full year for a message sent five minutes ago) but everything
 * older spells out `YYYY/MM/DD HH:mm` so the year is always visible — long
 * conversations get archived across year boundaries and users want to see at
 * a glance which year a message belongs to.
 *
 * Buckets:
 *   • Today      → `HH:mm`                       e.g. `09:40`
 *   • Yesterday  → `<i18n yesterday> HH:mm`      e.g. `昨天 09:40`
 *   • Older      → `YYYY/MM/DD HH:mm`            e.g. `2026/03/14 09:00`
 *
 * Reuses the existing `chat:sidebar.yesterday` key so we don't add yet another
 * i18n namespace. `t` is accepted as a parameter (rather than calling
 * `useTranslation` inside) so the helper stays a pure function that's trivial
 * to unit-test against a fake translator.
 */

import type { TFunction } from "i18next";

const pad2 = (n: number) => String(n).padStart(2, "0");

function timeOfDay(d: Date): string {
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfDay(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Format a Unix-ms timestamp for display in a chat bubble header.
 *
 * `now` is injectable purely so tests can pin "today" deterministically; in
 * production callers omit it and we anchor on `Date.now()`.
 */
export function formatSmartTime(
	ts: number,
	t: TFunction,
	now: number = Date.now(),
): string {
	const target = new Date(ts);
	const today = new Date(now);

	const todayStart = startOfDay(today);
	const targetStart = startOfDay(target);
	const dayDiff = Math.round((todayStart - targetStart) / 86_400_000);

	if (dayDiff === 0) {
		return timeOfDay(target);
	}
	if (dayDiff === 1) {
		const label = t("sidebar.yesterday", { ns: "chat", defaultValue: "昨天" });
		return `${label} ${timeOfDay(target)}`;
	}
	// Older than yesterday: always include the year so cross-year archives
	// stay unambiguous without a separate tooltip.
	return `${target.getFullYear()}/${pad2(target.getMonth() + 1)}/${pad2(target.getDate())} ${timeOfDay(target)}`;
}
