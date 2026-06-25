import { describe, expect, it } from "vitest";
import { formatTokenCount, formatTokenCountExact } from "../formatTokens";

describe("formatTokenCount — compact", () => {
	it("returns under-1000 values as plain integers", () => {
		expect(formatTokenCount(0)).toBe("0");
		expect(formatTokenCount(1)).toBe("1");
		expect(formatTokenCount(42)).toBe("42");
		expect(formatTokenCount(999)).toBe("999");
	});

	it("uses K with one decimal under 10K, drops decimal at 10K+", () => {
		// Exactly 1000 → no decimal, just "1K" (trailing .0 trimmed).
		expect(formatTokenCount(1000)).toBe("1K");
		// User's screenshot values.
		expect(formatTokenCount(1807)).toBe("1.8K");
		expect(formatTokenCount(1928)).toBe("1.9K");
		// Drop decimal once magnitude reaches 10K (Twitter/YouTube convention).
		expect(formatTokenCount(10000)).toBe("10K");
		expect(formatTokenCount(12345)).toBe("12K");
		expect(formatTokenCount(123456)).toBe("123K");
		expect(formatTokenCount(999_499)).toBe("999K");
	});

	it("uses M for millions, same decimal rule", () => {
		expect(formatTokenCount(1_000_000)).toBe("1M");
		expect(formatTokenCount(1_800_000)).toBe("1.8M");
		expect(formatTokenCount(9_900_000)).toBe("9.9M");
		// Drop decimal at 10M+.
		expect(formatTokenCount(12_345_678)).toBe("12M");
		expect(formatTokenCount(123_456_789)).toBe("123M");
	});

	it("uses B for billions", () => {
		expect(formatTokenCount(1_000_000_000)).toBe("1B");
		expect(formatTokenCount(1_234_567_890)).toBe("1.2B");
	});

	it("rounds fractional inputs to the nearest integer", () => {
		expect(formatTokenCount(1500.4)).toBe("1.5K");
		expect(formatTokenCount(0.6)).toBe("1");
	});

	it("returns em-dash for null / undefined / NaN", () => {
		expect(formatTokenCount(null)).toBe("—");
		expect(formatTokenCount(undefined)).toBe("—");
		expect(formatTokenCount(Number.NaN)).toBe("—");
		expect(formatTokenCount(Number.POSITIVE_INFINITY)).toBe("—");
	});

	it("clamps negatives to zero", () => {
		expect(formatTokenCount(-1)).toBe("0");
		expect(formatTokenCount(-9999)).toBe("0");
	});
});

describe("formatTokenCountExact — full precision", () => {
	it("renders with locale-aware thousand separators", () => {
		expect(formatTokenCountExact(1928)).toBe("1,928");
		expect(formatTokenCountExact(1_234_567)).toBe("1,234,567");
	});

	it("returns em-dash for null / undefined / NaN", () => {
		expect(formatTokenCountExact(null)).toBe("—");
		expect(formatTokenCountExact(undefined)).toBe("—");
		expect(formatTokenCountExact(Number.NaN)).toBe("—");
	});
});
