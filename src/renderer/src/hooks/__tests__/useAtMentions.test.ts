// @vitest-environment node
//
// Unit tests for the pure helpers exported by `useAtMentions`. The hook body
// itself depends on zustand/electron and is exercised via the renderer at
// runtime; here we lock down the detection regex and the splice helper which
// are the parts that have user-visible edge cases.

import { describe, expect, it } from "vitest";
import {
	applyMentionToValue,
	detectMentionTrigger,
} from "../useAtMentions";

describe("detectMentionTrigger", () => {
	it("triggers when input starts with @", () => {
		expect(detectMentionTrigger("@", 1)).toBe("");
		expect(detectMentionTrigger("@foo", 4)).toBe("foo");
	});

	it("triggers after whitespace", () => {
		expect(detectMentionTrigger("hello @b", 8)).toBe("b");
		expect(detectMentionTrigger("a b @c", 6)).toBe("c");
		// Newline counts as whitespace
		expect(detectMentionTrigger("line1\n@d", 8)).toBe("d");
	});

	it("does NOT trigger when @ is embedded inside a word (e.g. email)", () => {
		expect(detectMentionTrigger("foo@bar", 7)).toBeNull();
		expect(detectMentionTrigger("user@example.com", 16)).toBeNull();
	});

	it("does NOT trigger when whitespace falls inside the query", () => {
		expect(detectMentionTrigger("@foo bar", 8)).toBeNull();
	});

	it("only considers content up to the caret position", () => {
		// Caret is right after @b; the trailing " bar" comes after the caret.
		expect(detectMentionTrigger("foo @b bar", 6)).toBe("b");
	});

	it("returns null when there is no @ token before the caret", () => {
		expect(detectMentionTrigger("plain text", 10)).toBeNull();
		expect(detectMentionTrigger("", 0)).toBeNull();
	});

	it("ignores @@ doubled triggers (cancels the query)", () => {
		// Second `@` would land inside the [^\s@]* class, terminating the run.
		expect(detectMentionTrigger("@a@b", 4)).toBeNull();
	});

	it("clamps caret to value length", () => {
		expect(detectMentionTrigger("@foo", 999)).toBe("foo");
		expect(detectMentionTrigger("@foo", -5)).toBeNull();
	});
});

describe("applyMentionToValue", () => {
	it("splices a single trailing @query at end of input", () => {
		const res = applyMentionToValue("hello @doc", 10, "docs/foo.md");
		expect(res.value).toBe("hello @docs/foo.md ");
		expect(res.caret).toBe(res.value.length);
	});

	it("replaces only the @<query> token, preserving text after caret", () => {
		// caret is right after "@b" — "@b bar" → "@docs/foo.md  bar" (space
		// from splice + original space before " bar"). Strictly we get
		// "@docs/foo.md " glued at position 6 in front of " bar".
		const res = applyMentionToValue("foo @b bar", 6, "docs/foo.md");
		expect(res.value).toBe("foo @docs/foo.md  bar");
		// Caret lands right after the inserted "@docs/foo.md " (with the
		// trailing space the splice helper adds).
		expect(res.value.slice(0, res.caret)).toBe("foo @docs/foo.md ");
	});

	it("inserts when caret is positioned right after a lone @", () => {
		const res = applyMentionToValue("@", 1, "README.md");
		expect(res.value).toBe("@README.md ");
		expect(res.caret).toBe(res.value.length);
	});

	it("falls back to plain insertion when there is no trailing @token", () => {
		const res = applyMentionToValue("hello world", 11, "docs/foo.md");
		expect(res.value).toBe("hello world@docs/foo.md ");
	});

	it("handles caret in the middle of multi-line input", () => {
		const src = "line1\n@doc\nline3";
		// Caret is at end of "@doc" on line 2 — index 10.
		const res = applyMentionToValue(src, 10, "docs/foo.md");
		expect(res.value).toBe("line1\n@docs/foo.md \nline3");
		// New caret right after the inserted token (before "\nline3")
		expect(res.value.slice(0, res.caret)).toBe("line1\n@docs/foo.md ");
	});

	it("clamps out-of-range caret values", () => {
		const res = applyMentionToValue("@a", 999, "x.md");
		expect(res.value).toBe("@x.md ");
	});
});
