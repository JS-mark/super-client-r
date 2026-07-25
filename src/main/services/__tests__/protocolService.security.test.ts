// @vitest-environment node
//
// E2 安全高危项收口 — protocolService 路径穿越 / 日志脱敏纯函数单测。
//
// 覆盖：
//  - sanitizeSkillName 拒绝 `..`、路径分隔符、绝对路径。
//  - isInsideDir 拒绝穿越到 skillsDir 之外的落点。
//  - redactParams 对 code/token/state 等敏感参数打码。

import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {},
	dialog: { showMessageBox: vi.fn() },
}));
vi.mock("../../utils/logger", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../pathService", () => ({
	pathService: { getPaths: () => ({ base: "/tmp/scr-base" }) },
}));
vi.mock("../skill/SkillService", () => ({
	getSkillService: () => ({ initialize: vi.fn() }),
}));

import {
	isInsideDir,
	redactParams,
	sanitizeSkillName,
} from "../protocolService";

describe("sanitizeSkillName", () => {
	it("accepts a plain single-segment name", () => {
		expect(sanitizeSkillName("my-skill")).toBe("my-skill");
	});

	it("trims surrounding whitespace", () => {
		expect(sanitizeSkillName("  my-skill  ")).toBe("my-skill");
	});

	it("rejects path traversal via ..", () => {
		expect(sanitizeSkillName("../../evil")).toBeNull();
		expect(sanitizeSkillName("..")).toBeNull();
	});

	it("rejects path separators", () => {
		expect(sanitizeSkillName("a/b")).toBeNull();
		expect(sanitizeSkillName("a\\b")).toBeNull();
	});

	it("rejects absolute paths", () => {
		expect(sanitizeSkillName("/etc/passwd")).toBeNull();
	});

	it("rejects empty / whitespace-only input", () => {
		expect(sanitizeSkillName("")).toBeNull();
		expect(sanitizeSkillName("   ")).toBeNull();
		expect(sanitizeSkillName(undefined)).toBeNull();
	});
});

describe("isInsideDir", () => {
	const base = "/tmp/scr-base/skills";

	it("accepts a file directly inside the dir", () => {
		expect(isInsideDir(base, join(base, "my-skill.json"))).toBe(true);
	});

	it("rejects a path escaping via ..", () => {
		expect(isInsideDir(base, join(base, "..", "..", "evil.json"))).toBe(false);
	});

	it("rejects the base dir itself (must be a child)", () => {
		expect(isInsideDir(base, base)).toBe(false);
	});
});

describe("redactParams", () => {
	it("masks sensitive params but keeps innocuous ones", () => {
		const out = redactParams({
			provider: "github",
			code: "super-secret-auth-code",
			state: "csrf-state",
			access_token: "at-123",
		});
		expect(out.provider).toBe("github");
		expect(out.code).toBe("***");
		expect(out.state).toBe("***");
		expect(out.access_token).toBe("***");
	});

	it("leaves empty sensitive values untouched", () => {
		expect(redactParams({ code: "" }).code).toBe("");
	});
});
