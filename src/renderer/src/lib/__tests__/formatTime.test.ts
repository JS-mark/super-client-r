import { describe, expect, it } from "vitest";
import { formatSmartTime } from "../formatTime";

// Minimal stand-in for i18next's TFunction. The real type is heavily
// overloaded, but `formatSmartTime` only calls it with `(key, options)` and
// reads the `defaultValue` fallback when the key is missing — so a function
// that honours `defaultValue` is enough for these tests.
function makeT(map: Record<string, string>) {
	return ((key: string, options?: { defaultValue?: string }) =>
		map[key] ?? options?.defaultValue ?? key) as unknown as Parameters<
		typeof formatSmartTime
	>[1];
}

const zh = makeT({ "sidebar.yesterday": "昨天" });
const en = makeT({ "sidebar.yesterday": "Yesterday" });

// Anchor "now" on a deterministic moment so all branches are reachable
// without freezing the real system clock.
const NOW = new Date(2026, 5, 25, 9, 40, 0).getTime(); // 2026-06-25 09:40 local

describe("formatSmartTime", () => {
	it("returns HH:mm for timestamps from today", () => {
		const ts = new Date(2026, 5, 25, 7, 5, 0).getTime();
		expect(formatSmartTime(ts, zh, NOW)).toBe("07:05");
		expect(formatSmartTime(ts, en, NOW)).toBe("07:05");
	});

	it("prefixes the i18n yesterday label for the previous day", () => {
		const ts = new Date(2026, 5, 24, 23, 59, 0).getTime();
		expect(formatSmartTime(ts, zh, NOW)).toBe("昨天 23:59");
		expect(formatSmartTime(ts, en, NOW)).toBe("Yesterday 23:59");
	});

	it("includes the year for earlier-this-year timestamps", () => {
		const ts = new Date(2026, 2, 14, 9, 0, 0).getTime();
		expect(formatSmartTime(ts, zh, NOW)).toBe("2026/03/14 09:00");
	});

	it("includes the year for prior years", () => {
		const ts = new Date(2025, 11, 31, 23, 59, 0).getTime();
		expect(formatSmartTime(ts, zh, NOW)).toBe("2025/12/31 23:59");
	});

	it("pads single-digit minutes and hours", () => {
		const ts = new Date(2026, 5, 25, 3, 4, 0).getTime();
		expect(formatSmartTime(ts, zh, NOW)).toBe("03:04");
	});

	it("treats midnight as part of the new day", () => {
		// 2026-06-25 00:00 — same day as NOW → time-only.
		const ts = new Date(2026, 5, 25, 0, 0, 0).getTime();
		expect(formatSmartTime(ts, zh, NOW)).toBe("00:00");
	});
});
