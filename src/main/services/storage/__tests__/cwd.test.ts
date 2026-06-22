// @vitest-environment node
//
// Project / Session 重设计 A-2 — cwd hash + normalize 测试。
// 主进程模块，需要 node 环境而非 jsdom（vitest.config.ts 默认是 jsdom）。

import { describe, expect, it } from "vitest";
import { hashCwd, normalizeCwd } from "../cwd";

describe("normalizeCwd", () => {
	it("removes trailing slash", () => {
		expect(normalizeCwd("/a/b/")).toBe("/a/b");
		expect(normalizeCwd("/a/b")).toBe("/a/b");
	});

	it("resolves .. and . segments", () => {
		expect(normalizeCwd("/a/b/../c")).toBe("/a/c");
		expect(normalizeCwd("/a/b/./c")).toBe("/a/b/c");
	});

	it("returns the same string for already-normalized paths", () => {
		expect(normalizeCwd("/Users/mark/projects/app")).toBe(
			"/Users/mark/projects/app",
		);
	});
});

describe("hashCwd", () => {
	it("returns the same hash for the same input", () => {
		const a = hashCwd("/a/b/c");
		const b = hashCwd("/a/b/c");
		expect(a).toBe(b);
	});

	it("normalizes before hashing — trailing slash and `..` are equivalent", () => {
		const canonical = hashCwd("/a/b/c");
		expect(hashCwd("/a/b/c/")).toBe(canonical);
		expect(hashCwd("/a/b/d/../c")).toBe(canonical);
	});

	it("returns different hashes for different cwds", () => {
		expect(hashCwd("/a/b/c")).not.toBe(hashCwd("/a/b/d"));
	});

	it("output is 16 lowercase hex chars", () => {
		const h = hashCwd("/Users/mark/projects/app");
		expect(h).toHaveLength(16);
		expect(h).toMatch(/^[0-9a-f]{16}$/);
	});
});
