// @vitest-environment node
//
// E2 安全高危项收口 — authMiddleware 单测。
//
// 覆盖：
//  - 公开路径精确匹配（`/health` 放行；`/health/../v1/x` 这类 `..` 前缀
//    绕过被拒，走鉴权）。
//  - 目录白名单（`/swagger-ui/`）只匹配真实子路径。
//  - Bearer 恒定时间比较：正确 key 放行、错误 key/格式被拒。

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
	SERVER_CONFIG: {
		PUBLIC_PATHS: [
			"/health",
			"/favicon.ico",
			"/swagger-ui/",
			"/v1/app/init-config",
		],
	},
	getOrCreateApiKey: () => "sk-test-key",
}));

import { authMiddleware } from "../auth";

interface FakeCtx {
	path: string;
	headers: Record<string, string>;
	status?: number;
	body?: unknown;
}

function makeCtx(path: string, authorization?: string): FakeCtx {
	return {
		path,
		headers: authorization ? { authorization } : {},
	};
}

async function run(ctx: FakeCtx): Promise<boolean> {
	let nextCalled = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await authMiddleware(ctx as any, async () => {
		nextCalled = true;
	});
	return nextCalled;
}

describe("authMiddleware — public path matching", () => {
	beforeEach(() => vi.clearAllMocks());

	it("lets an exact public path through without auth", async () => {
		expect(await run(makeCtx("/health"))).toBe(true);
	});

	it("does NOT treat a `..` prefix path as public (no bypass)", async () => {
		const ctx = makeCtx("/health/../v1/secret");
		const passed = await run(ctx);
		expect(passed).toBe(false);
		expect(ctx.status).toBe(401);
	});

	it("does NOT treat `/healthz` as the public `/health`", async () => {
		const ctx = makeCtx("/healthz");
		expect(await run(ctx)).toBe(false);
		expect(ctx.status).toBe(401);
	});

	it("matches directory whitelist only on real sub-paths", async () => {
		expect(await run(makeCtx("/swagger-ui/index.html"))).toBe(true);
	});
});

describe("authMiddleware — bearer auth", () => {
	beforeEach(() => vi.clearAllMocks());

	it("rejects a missing authorization header", async () => {
		const ctx = makeCtx("/v1/protected");
		expect(await run(ctx)).toBe(false);
		expect(ctx.status).toBe(401);
	});

	it("rejects a malformed authorization header", async () => {
		const ctx = makeCtx("/v1/protected", "Token sk-test-key");
		expect(await run(ctx)).toBe(false);
		expect(ctx.status).toBe(401);
	});

	it("rejects a wrong key", async () => {
		const ctx = makeCtx("/v1/protected", "Bearer sk-wrong");
		expect(await run(ctx)).toBe(false);
		expect(ctx.status).toBe(401);
	});

	it("accepts the correct key", async () => {
		const ctx = makeCtx("/v1/protected", "Bearer sk-test-key");
		expect(await run(ctx)).toBe(true);
		expect(ctx.status).toBeUndefined();
	});
});
