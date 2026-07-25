// @vitest-environment node
//
// E1 密钥安全改造 — requestLogger.redact() 单测。
//
// 两道防线：
//  ① 字段名匹配（大小写不敏感）
//  ② 值形态兜底：sk- / Bearer / gh*_ / xox*- / AKIA 前缀值一律打码，
//     即便字段名未命中。

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../utils/logger", () => ({
	logger: {
		withContext: () => ({
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		}),
	},
}));

import { redact } from "../requestLogger";

describe("redact — field-name matching", () => {
	it("redacts known sensitive fields regardless of case", () => {
		const out = redact({
			apiKey: "sk-abc",
			ApiKey: "sk-def",
			access_token: "at-123",
			Authorization: "Bearer xyz",
			normal: "keep-me",
		}) as Record<string, unknown>;
		expect(out.apiKey).toBe("***");
		expect(out.ApiKey).toBe("***");
		expect(out.access_token).toBe("***");
		expect(out.Authorization).toBe("***");
		expect(out.normal).toBe("keep-me");
	});

	it("leaves empty sensitive values untouched (nothing to hide)", () => {
		const out = redact({ apiKey: "" }) as Record<string, unknown>;
		expect(out.apiKey).toBe("");
	});
});

describe("redact — value-shape fallback", () => {
	it("masks sk- prefixed values under an innocuous field name", () => {
		const out = redact({ note: "sk-1234567890abcdef" }) as Record<
			string,
			unknown
		>;
		expect(out.note).toBe("***");
	});

	it("masks Bearer tokens under an innocuous field name", () => {
		const out = redact({ header: "Bearer eyJhbGciOi" }) as Record<
			string,
			unknown
		>;
		expect(out.header).toBe("***");
	});

	it("masks provider-token prefixes (gh*_, xox*-, AKIA)", () => {
		const out = redact({
			a: "ghp_abcdefABCDEF",
			b: "xoxb-111-222",
			c: "AKIAIOSFODNN7EXAMPLE",
		}) as Record<string, unknown>;
		expect(out.a).toBe("***");
		expect(out.b).toBe("***");
		expect(out.c).toBe("***");
	});

	it("keeps ordinary strings intact", () => {
		const out = redact({
			message: "hello world",
			url: "https://api.example.com/v1",
		}) as Record<string, unknown>;
		expect(out.message).toBe("hello world");
		expect(out.url).toBe("https://api.example.com/v1");
	});

	it("masks a bare sk- string (top-level, not in an object)", () => {
		expect(redact("sk-topsecret")).toBe("***");
		expect(redact("just text")).toBe("just text");
	});
});

describe("redact — recursion", () => {
	it("walks nested objects and arrays", () => {
		const out = redact({
			outer: {
				list: [{ apiKey: "sk-a" }, { note: "sk-b" }, { ok: "fine" }],
			},
		}) as { outer: { list: Array<Record<string, unknown>> } };
		expect(out.outer.list[0].apiKey).toBe("***");
		expect(out.outer.list[1].note).toBe("***");
		expect(out.outer.list[2].ok).toBe("fine");
	});

	it("does not mutate the original input", () => {
		const input = { apiKey: "sk-secret" };
		redact(input);
		expect(input.apiKey).toBe("sk-secret");
	});
});
