// @vitest-environment node
/**
 * E2E test for the @scp/agent-builtins Task tool's HTTP recursion.
 *
 * Boots a real LocalServer on a free port, mocks the provider HTTP
 * with undici MockAgent, and verifies the Task handler successfully
 * recurses through:
 *
 *   Task handler
 *     → fetch http://127.0.0.1:{port}/v1/llm/chat/completions
 *     → LLMService.chatCompletion
 *     → provider HTTP (mocked)
 *     → SSE stream back to Task handler
 *     → accumulated text returned as tool result
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => {
	const { mkdtempSync: mk } = require("node:fs") as typeof import("node:fs");
	const { tmpdir: t } = require("node:os") as typeof import("node:os");
	const { join: j } = require("node:path") as typeof import("node:path");
	const userData = mk(j(t(), "agent-builtins-e2e-"));
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
	const ipcMain = {
		handle: () => {},
		on: () => {},
		removeHandler: () => {},
	};
	return {
		default: { app, BrowserWindow, ipcMain },
		app,
		BrowserWindow,
		ipcMain,
	};
});

import { createAgentBuiltinsServer } from "../agentBuiltinsServer";
import {
	setupMockProvider,
	type MockProviderHandle,
} from "../../../../../../test-utils/mockProvider";
import {
	startTestServer,
	type TestServerHandle,
} from "../../../../../../test-utils/serverFixture";

/**
 * The provider HTTP we mock here is consumed by the Vercel AI SDK (via
 * LLMService.chatCompletion), which expects OpenAI chat-completions
 * streaming format — NOT our internal `event: chunk / event: done`
 * SSE wire format. This helper emits OpenAI-shaped chunks.
 */
function mockOpenAIChatCompletion(
	agent: MockProviderHandle["agent"],
	baseUrl: string,
	deltas: string[],
): void {
	const url = new URL(baseUrl);
	const origin = `${url.protocol}//${url.host}`;
	const basePath = url.pathname.replace(/\/$/, "");
	const path = basePath.endsWith("/chat/completions")
		? basePath
		: `${basePath}/chat/completions`;
	const id = "chatcmpl-test";
	const lines: string[] = [];
	lines.push(
		`data: ${JSON.stringify({
			id,
			object: "chat.completion.chunk",
			choices: [{ index: 0, delta: { role: "assistant", content: "" } }],
		})}\n\n`,
	);
	for (const d of deltas) {
		lines.push(
			`data: ${JSON.stringify({
				id,
				object: "chat.completion.chunk",
				choices: [{ index: 0, delta: { content: d } }],
			})}\n\n`,
		);
	}
	lines.push(
		`data: ${JSON.stringify({
			id,
			object: "chat.completion.chunk",
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
		})}\n\n`,
	);
	lines.push(`data: [DONE]\n\n`);
	agent
		.get(origin)
		.intercept({ path, method: "POST" })
		.reply(200, lines.join(""), {
			headers: { "content-type": "text/event-stream" },
		});
}

describe("@scp/agent-builtins Task tool e2e (HTTP recursion)", () => {
	let server: TestServerHandle;
	let provider: MockProviderHandle;

	beforeAll(async () => {
		server = await startTestServer();
	});

	afterAll(async () => {
		if (provider) await provider.cleanup();
		await server.stop();
	});

	it("Task handler HTTP-recurses through real LocalServer + mocked provider", async () => {
		provider = setupMockProvider();
		mockOpenAIChatCompletion(provider.agent, "https://prov.test/v1", [
			"subagent says hi",
		]);

		const builtins = createAgentBuiltinsServer();
		const taskHandler = builtins.handlers.get("Task")!;

		const result = await taskHandler({
			description: "say hi",
			prompt: "Say hi.",
			_taskDepth: 0,
			_provider: {
				baseUrl: "https://prov.test/v1",
				apiKey: "sk-fake",
				model: "test-model",
				providerPreset: "openai",
				apiFormat: "chat-completions",
			},
			_scpPort: server.port,
			_scpApiKey: server.apiKey,
			_parentRequestId: "parent-1",
		});

		expect(result.isError).toBeFalsy();
		const text = result.content
			.map((c: { text?: string } | { data: string; mimeType: string }) =>
				"text" in c ? c.text ?? "" : "",
			)
			.join("");
		expect(text).toContain("subagent says hi");
	});
});
