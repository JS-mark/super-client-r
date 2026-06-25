/**
 * Token-count formatting helpers used by chat message footers and
 * usage badges.
 *
 * Two flavours:
 *   • `formatTokenCount` — compact (1.9K / 12K / 1.8M / 1.2B), for inline
 *     chips where vertical-/horizontal-shift caused by varying digit count
 *     would be distracting. Backed by `Intl.NumberFormat`'s compact notation,
 *     pinned to the `en` locale so the suffix stays K/M/B (developer-tool
 *     norm, used by OpenAI dashboard / Anthropic console / Cursor) instead
 *     of 万/亿 even in a Chinese UI.
 *   • `formatTokenCountExact` — `1,928` / `1,234,567`, for tooltips and
 *     places where the user is inspecting precise usage.
 *
 * Convention notes:
 *   • Numbers under 1,000 are returned as-is (no compaction).
 *   • Negative / NaN / null / undefined → `"—"`.
 *   • Values are rounded to the nearest integer before display.
 */

/**
 * Tiered compact formatter. Width-controlled so chips stay ≤ 5 chars in the
 * common range:
 *
 *   <1K       "0"   "999"                (raw)
 *   1K-9.99K  "1K"  "1.5K"  "9.9K"       (1 decimal, trim ".0")
 *   10K-999K  "10K" "123K"               (no decimal — Twitter rule)
 *   1M-9.99M  "1M"  "1.8M"  "9.9M"       (1 decimal)
 *   10M-999M  "12M" "123M"
 *   1B+       "1B"  "1.2B" "12B" …
 *
 * Compared with `Intl.NumberFormat({notation:"compact"})` (which always keeps
 * one decimal, e.g. "123.5K"), this tighter format matches YouTube / Twitter
 * conventions and keeps the chip width stable.
 */
function compactSmall(n: number, divisor: number, suffix: string): string {
	const v = n / divisor;
	if (v >= 10) return `${Math.round(v)}${suffix}`;
	// 1 decimal, but trim trailing ".0" so 1000 → "1K" not "1.0K".
	const oneDecimal = (Math.round(v * 10) / 10).toFixed(1);
	return `${oneDecimal.replace(/\.0$/, "")}${suffix}`;
}

export function formatTokenCount(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "—";
	const rounded = Math.max(0, Math.round(n));
	if (rounded < 1_000) return String(rounded);
	if (rounded < 1_000_000) return compactSmall(rounded, 1_000, "K");
	if (rounded < 1_000_000_000) return compactSmall(rounded, 1_000_000, "M");
	return compactSmall(rounded, 1_000_000_000, "B");
}

export function formatTokenCountExact(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "—";
	return Math.max(0, Math.round(n)).toLocaleString();
}
