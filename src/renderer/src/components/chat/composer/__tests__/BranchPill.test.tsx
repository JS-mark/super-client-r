import { describe, expect, it } from "vitest";
import { describeBranch } from "../BranchPill";

const FALLBACK = "no branch";

describe("describeBranch", () => {
	it("returns the trimmed branch name when present", () => {
		expect(describeBranch("main", FALLBACK)).toEqual({
			label: "main",
			muted: false,
		});
		expect(describeBranch("  feature/foo  ", FALLBACK)).toEqual({
			label: "feature/foo",
			muted: false,
		});
	});

	it("returns a muted fallback when branch is missing", () => {
		expect(describeBranch(undefined, FALLBACK)).toEqual({
			label: FALLBACK,
			muted: true,
		});
		expect(describeBranch(null, FALLBACK)).toEqual({
			label: FALLBACK,
			muted: true,
		});
		expect(describeBranch("", FALLBACK)).toEqual({
			label: FALLBACK,
			muted: true,
		});
		expect(describeBranch("   ", FALLBACK)).toEqual({
			label: FALLBACK,
			muted: true,
		});
	});
});
