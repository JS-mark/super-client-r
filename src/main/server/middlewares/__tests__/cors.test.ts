// @vitest-environment node
//
// E2 安全高危项收口 — corsMiddleware 单测。
//
// 覆盖：
//  - 白名单内 origin 精确回显 + credentials。
//  - 无 Origin / file:// / 白名单外 origin：不设置任何 CORS 头，
//    绝不出现 `Access-Control-Allow-Origin: *` 与 credentials 组合。

import { describe, expect, it } from "vitest";
import { corsMiddleware } from "../cors";

interface FakeCtx {
	method: string;
	headers: Record<string, string | undefined>;
	status?: number;
	responseHeaders: Record<string, string>;
	set: (k: string, v: string) => void;
}

function makeCtx(origin?: string, method = "GET"): FakeCtx {
	const responseHeaders: Record<string, string> = {};
	return {
		method,
		headers: { origin },
		responseHeaders,
		set(k: string, v: string) {
			responseHeaders[k] = v;
		},
	};
}

async function run(ctx: FakeCtx): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await corsMiddleware(ctx as any, async () => {});
}

describe("corsMiddleware", () => {
	it("echoes an allowed origin with credentials", async () => {
		const ctx = makeCtx("http://localhost:5173");
		await run(ctx);
		expect(ctx.responseHeaders["Access-Control-Allow-Origin"]).toBe(
			"http://localhost:5173",
		);
		expect(ctx.responseHeaders["Access-Control-Allow-Credentials"]).toBe(
			"true",
		);
		expect(ctx.responseHeaders["Vary"]).toBe("Origin");
	});

	it("sets NO cors headers when there is no Origin (never * + credentials)", async () => {
		const ctx = makeCtx(undefined);
		await run(ctx);
		expect(ctx.responseHeaders["Access-Control-Allow-Origin"]).toBeUndefined();
		expect(
			ctx.responseHeaders["Access-Control-Allow-Credentials"],
		).toBeUndefined();
	});

	it("does NOT blanket-allow file:// origins", async () => {
		const ctx = makeCtx("file://");
		await run(ctx);
		expect(ctx.responseHeaders["Access-Control-Allow-Origin"]).toBeUndefined();
	});

	it("rejects a non-whitelisted origin", async () => {
		const ctx = makeCtx("https://evil.example.com");
		await run(ctx);
		expect(ctx.responseHeaders["Access-Control-Allow-Origin"]).toBeUndefined();
	});

	it("short-circuits OPTIONS preflight with 204", async () => {
		const ctx = makeCtx("http://localhost:5173", "OPTIONS");
		await run(ctx);
		expect(ctx.status).toBe(204);
	});
});
