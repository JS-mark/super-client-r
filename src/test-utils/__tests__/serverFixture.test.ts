// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";

vi.mock("electron", () => {
	const { mkdtempSync: mk } = require("node:fs") as typeof import("node:fs");
	const { tmpdir: t } = require("node:os") as typeof import("node:os");
	const { join: j } = require("node:path") as typeof import("node:path");
	const userData = mk(j(t(), "server-fixture-"));
	const app = {
		name: "super-client-test",
		getPath: (name: string) =>
			name === "userData" ? userData : tmpdir(),
		getName: () => "super-client-test",
		getAppPath: () => process.cwd(),
		whenReady: () => Promise.resolve(),
		isPackaged: false,
	};
	const BrowserWindow = { getAllWindows: () => [] };
	const ipcMain = { handle: () => {}, on: () => {}, removeHandler: () => {} };
	return {
		default: { app, BrowserWindow, ipcMain },
		app,
		BrowserWindow,
		ipcMain,
	};
});

import { startTestServer, type TestServerHandle } from "../serverFixture";

describe("serverFixture", () => {
	let handle: TestServerHandle;

	beforeAll(async () => {
		handle = await startTestServer();
	});

	afterAll(async () => {
		await handle.stop();
	});

	it("returns port + apiKey + baseUrl", () => {
		expect(handle.port).toBeGreaterThan(0);
		expect(handle.apiKey).toMatch(/^sk-/);
		expect(handle.baseUrl).toBe(`http://127.0.0.1:${handle.port}`);
	});

	it("/health responds without auth", async () => {
		const res = await fetch(`${handle.baseUrl}/health`);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { status: string };
		expect(json.status).toBe("ok");
	});

	it("/v1/llm/models rejects unauthenticated requests with 401", async () => {
		const res = await fetch(`${handle.baseUrl}/v1/llm/models`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(401);
	});

	it("/v1/llm/models accepts the apiKey we returned", async () => {
		const res = await fetch(`${handle.baseUrl}/v1/llm/models`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${handle.apiKey}`,
			},
			body: JSON.stringify({ baseUrl: "http://invalid.test", apiKey: "x" }),
		});
		// 200 means handler ran; the inner request will fail upstream but the
		// auth middleware did its job (which is all we're testing here).
		expect(res.status).not.toBe(401);
	});
});
