import { describe, expect, it } from "vitest";
import type { Project } from "@super-client/shared-types/project";
import { getProjectPillLabel, shortenCwd } from "../ProjectPill";

describe("shortenCwd", () => {
	it("returns the last path segment for posix paths", () => {
		expect(shortenCwd("/Users/mark/code/super-client-r")).toBe(
			"super-client-r",
		);
	});

	it("handles trailing slashes", () => {
		expect(shortenCwd("/Users/mark/code/super-client-r/")).toBe(
			"super-client-r",
		);
	});

	it("handles windows-style paths", () => {
		expect(shortenCwd("C:\\Users\\mark\\code\\super-client-r")).toBe(
			"super-client-r",
		);
	});

	it("returns empty string for empty input", () => {
		expect(shortenCwd("")).toBe("");
	});

	it("returns input when no separator is present", () => {
		expect(shortenCwd("plain")).toBe("plain");
	});
});

describe("getProjectPillLabel", () => {
	const project: Project = {
		id: "p1",
		cwd: "/Users/mark/code/super-client-r",
		name: "super-client-r",
		createdAt: 0,
		updatedAt: 0,
		lastSeenAt: 0,
	};

	it("returns name + short suffix + full cwd for a project", () => {
		expect(getProjectPillLabel(project)).toEqual({
			name: "super-client-r",
			suffix: "super-client-r",
			cwd: "/Users/mark/code/super-client-r",
		});
	});

	it("returns null when the session has no project (casual)", () => {
		expect(getProjectPillLabel(null)).toBeNull();
		expect(getProjectPillLabel(undefined)).toBeNull();
	});
});
