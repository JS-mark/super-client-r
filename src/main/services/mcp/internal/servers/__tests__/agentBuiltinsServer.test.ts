// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentProductEvent } from "@super-client/shared-types/agent-product-events";

const { callToolMock } = vi.hoisted(() => ({
	callToolMock: vi.fn(),
}));
vi.mock("../../../McpService", () => ({
	mcpService: { callTool: callToolMock },
}));

import {
	AGENT_BUILTIN_TOOL_NAMES,
	createAgentBuiltinsServer,
} from "../agentBuiltinsServer";
import { SubagentEventBridge } from "../../../../agent/runtime/SubagentEventBridge";
import { setSubagentEventBridge } from "../../../../agent/runtime/subagentBridgeRegistry";
import {
	_resetSubagentControlRegistryForTest,
	cancelSubagentControl,
	hasSubagentControl,
} from "../../../../agent/runtime/subagentControlRegistry";

const TMP = mkdtempSync(join(tmpdir(), "agent-builtins-test-"));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));
afterEach(() => {
	setSubagentEventBridge(null);
	_resetSubagentControlRegistryForTest();
	vi.unstubAllGlobals();
});

type AnyResult = {
	content: Array<{ text?: string } | { data: string; mimeType: string }>;
};
function textOf(result: AnyResult): string {
	return result.content
		.map((c) => ("text" in c ? c.text ?? "" : ""))
		.join("");
}

function sseResponse(
	frames: Array<{ event: string; data: Record<string, unknown> }>,
): Response {
	const encoder = new TextEncoder();
	const body = frames
		.map((frame) => `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`)
		.join("");
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(body));
				controller.close();
			},
		}),
		{ status: 200 },
	);
}

describe("agentBuiltinsServer skeleton", () => {
	it("exposes 9 tools with canonical names", () => {
		const server = createAgentBuiltinsServer();
		expect(server.id).toBe("@scp/agent-builtins");
		expect(server.name).toBe("Agent Built-ins");
		expect(server.tools.map((t) => t.name).sort()).toEqual(
			[
				"AskUserQuestion",
				"Bash",
				"Edit",
				"Glob",
				"Grep",
				"Read",
				"Task",
				"WebFetch",
				"Write",
			].sort(),
		);
	});

	it("AGENT_BUILTIN_TOOL_NAMES matches tools[]", () => {
		const server = createAgentBuiltinsServer();
		expect(AGENT_BUILTIN_TOOL_NAMES).toEqual(server.tools.map((t) => t.name));
	});

	it("each tool has description + inputSchema + matching handler", () => {
		const server = createAgentBuiltinsServer();
		for (const tool of server.tools) {
			expect(typeof tool.description).toBe("string");
			expect(tool.description.length).toBeGreaterThan(20);
			expect(typeof tool.inputSchema).toBe("object");
			expect(server.handlers.has(tool.name)).toBe(true);
		}
	});

});

describe("Bash handler (delegates @scp/bash)", () => {
	it("forwards command + workingDir to @scp/bash::execute_command", async () => {
		callToolMock.mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "stdout" }], isError: false },
		});
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Bash")!({
			command: "echo hi",
			_cwd: "/proj",
		});
		expect(result.isError).toBeFalsy();
		expect(callToolMock).toHaveBeenCalledWith(
			"@scp/bash",
			"execute_command",
			expect.objectContaining({
				command: "echo hi",
				workingDir: "/proj",
				confirmed: true,
			}),
			expect.any(Object),
		);
	});

	it("isError when downstream returns isError", async () => {
		callToolMock.mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "stderr" }], isError: true },
		});
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Bash")!({
			command: "false",
			_cwd: "/proj",
		});
		expect(result.isError).toBe(true);
	});

	it("isError on missing command", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Bash")!({ _cwd: "/proj" });
		expect(result.isError).toBe(true);
	});
});

describe("Grep handler (delegates @scp/grep)", () => {
	it("forwards pattern + path + glob → include", async () => {
		callToolMock.mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "match" }] },
		});
		const server = createAgentBuiltinsServer();
		await server.handlers.get("Grep")!({
			pattern: "foo",
			glob: "*.ts",
			_cwd: "/proj",
		});
		expect(callToolMock).toHaveBeenCalledWith(
			"@scp/grep",
			"grep",
			expect.objectContaining({
				pattern: "foo",
				path: "/proj",
				include: "*.ts",
			}),
			expect.any(Object),
		);
	});
});

describe("Glob handler (delegates @scp/file-system::search_files)", () => {
	it("forwards pattern + cwd", async () => {
		callToolMock.mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "/proj/a.ts" }] },
		});
		const server = createAgentBuiltinsServer();
		await server.handlers.get("Glob")!({
			pattern: "**/*.ts",
			_cwd: "/proj",
		});
		expect(callToolMock).toHaveBeenCalledWith(
			"@scp/file-system",
			"search_files",
			expect.objectContaining({ pattern: "**/*.ts", path: "/proj" }),
			expect.any(Object),
		);
	});
});

describe("WebFetch handler (delegates @scp/fetch::fetch_html)", () => {
	it("forwards url", async () => {
		callToolMock.mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "page body" }] },
		});
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("WebFetch")!({
			url: "https://example.test",
		});
		expect(textOf(result)).toBe("page body");
		expect(callToolMock).toHaveBeenCalledWith(
			"@scp/fetch",
			"fetch_html",
			{ url: "https://example.test" },
			expect.any(Object),
		);
	});

	it("isError on missing url", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("WebFetch")!({});
		expect(result.isError).toBe(true);
	});
});

describe("Read handler", () => {
	it("reads relative path resolved against _cwd, formats with cat -n", async () => {
		writeFileSync(join(TMP, "small.txt"), "alpha\nbeta\ngamma\n");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Read")!({
			path: "small.txt",
			_cwd: TMP,
		});
		expect(result.isError).toBeFalsy();
		const text = textOf(result);
		expect(text).toMatch(/1\talpha/);
		expect(text).toMatch(/3\tgamma/);
	});

	it("honors offset + limit (1-indexed)", async () => {
		writeFileSync(
			join(TMP, "big.txt"),
			Array.from({ length: 100 }, (_, i) => `L${i + 1}`).join("\n"),
		);
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Read")!({
			path: "big.txt",
			_cwd: TMP,
			offset: 50,
			limit: 3,
		});
		const text = textOf(result);
		expect(text).toMatch(/50\tL50/);
		expect(text).toMatch(/52\tL52/);
		expect(text).not.toMatch(/53\tL53/);
	});

	it("returns isError on missing file", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Read")!({
			path: "nope.txt",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
	});
});

describe("Write handler", () => {
	it("creates file with parent dirs", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Write")!({
			path: "sub/dir/hello.txt",
			content: "hi\n",
			_cwd: TMP,
		});
		expect(result.isError).toBeFalsy();
		expect(readFileSync(join(TMP, "sub/dir/hello.txt"), "utf-8")).toBe("hi\n");
	});

	it("overwrites existing file", async () => {
		const server = createAgentBuiltinsServer();
		await server.handlers.get("Write")!({
			path: "ow.txt",
			content: "v1",
			_cwd: TMP,
		});
		await server.handlers.get("Write")!({
			path: "ow.txt",
			content: "v2",
			_cwd: TMP,
		});
		expect(readFileSync(join(TMP, "ow.txt"), "utf-8")).toBe("v2");
	});
});

describe("Edit handler", () => {
	it("replaces unique anchor exactly once", async () => {
		writeFileSync(join(TMP, "e1.txt"), "alpha\nbeta\ngamma\n");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e1.txt",
			old_string: "beta",
			new_string: "BETA",
			_cwd: TMP,
		});
		expect(result.isError).toBeFalsy();
		expect(readFileSync(join(TMP, "e1.txt"), "utf-8")).toBe(
			"alpha\nBETA\ngamma\n",
		);
	});

	it("isError on ambiguous anchor", async () => {
		writeFileSync(join(TMP, "e2.txt"), "dup\ndup\ndup\n");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e2.txt",
			old_string: "dup",
			new_string: "X",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/3 times|ambiguous/i);
	});

	it("replace_all permits multi-replace", async () => {
		writeFileSync(join(TMP, "e3.txt"), "dup\ndup\ndup\n");
		const server = createAgentBuiltinsServer();
		await server.handlers.get("Edit")!({
			path: "e3.txt",
			old_string: "dup",
			new_string: "X",
			replace_all: true,
			_cwd: TMP,
		});
		expect(readFileSync(join(TMP, "e3.txt"), "utf-8")).toBe("X\nX\nX\n");
	});

	it("isError on anchor not found", async () => {
		writeFileSync(join(TMP, "e4.txt"), "abc");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e4.txt",
			old_string: "xyz",
			new_string: "Y",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/not found/i);
	});

	it("isError when old_string === new_string", async () => {
		writeFileSync(join(TMP, "e5.txt"), "abc");
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Edit")!({
			path: "e5.txt",
			old_string: "abc",
			new_string: "abc",
			_cwd: TMP,
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/identical|no-op/i);
	});
});

describe("Task handler (HTTP recursion)", () => {
	it("errors at depth >= 3", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Task")!({
			description: "x",
			prompt: "y",
			_taskDepth: 3,
			_provider: { baseUrl: "x", apiKey: "y", model: "z" },
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/depth|nest/i);
	});

	it("succeeds at the maximum allowed depth (depth=2 → emits taskDepth=3)", async () => {
		// MAX_TASK_DEPTH = 3 means depth 2 is the last allowed recursion:
		// the handler must still run and emit an outgoing body whose
		// taskDepth is 3. (That child's own Task call would then be rejected
		// by the `depth >= MAX_TASK_DEPTH` check above — covered by the
		// previous test — but emitting taskDepth: 3 from a depth-2 parent is
		// itself legal.) This pins the cap's lower bound so a future
		// off-by-one (e.g. `depth > MAX_TASK_DEPTH`) can't silently tighten
		// the limit without a test going red.
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([
				{ event: "chunk", data: { content: "ok" } },
				{ event: "done", data: {} },
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Task")!({
			description: "boundary",
			prompt: "Run at max depth.",
			_taskDepth: 2,
			_provider: { baseUrl: "https://provider.test", apiKey: "sk", model: "m" },
			_scpPort: 3000,
			_scpApiKey: "api-key",
		});

		expect(result.isError).toBeFalsy();
		expect(textOf(result)).toContain("ok");
		expect(fetchMock).toHaveBeenCalledOnce();
		const requestBody = JSON.parse(
			(fetchMock.mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
		) as { agentBuiltins?: { taskDepth?: number } };
		expect(requestBody.agentBuiltins?.taskDepth).toBe(3);
	});

	it("errors when _provider missing", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Task")!({
			description: "x",
			prompt: "y",
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/_provider|provider/i);
	});

	it("errors when _scpPort/_scpApiKey missing", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Task")!({
			description: "x",
			prompt: "y",
			_provider: { baseUrl: "x", apiKey: "y", model: "z" },
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/_scpPort|_scpApiKey|HTTP recursion/i);
	});

	it("errors on empty description/prompt", async () => {
		const server = createAgentBuiltinsServer();
		const r1 = await server.handlers.get("Task")!({
			description: "",
			prompt: "y",
		});
		expect(r1.isError).toBe(true);
		const r2 = await server.handlers.get("Task")!({
			description: "x",
			prompt: "  ",
		});
		expect(r2.isError).toBe(true);
	});

	it("emits subagent.updated tool counts while consuming recursive SSE tool calls", async () => {
		const emitted: AgentProductEvent[] = [];
		setSubagentEventBridge(
			new SubagentEventBridge({
				emitSubagentEvent: (event) => emitted.push(event),
				now: () => 123,
			}),
		);
		const fetchMock = vi.fn().mockResolvedValue(
			sseResponse([
				{ event: "tool_call", data: { id: "tc-1", name: "Read" } },
				{ event: "chunk", data: { content: "done" } },
				{ event: "tool.call", data: { callId: "tc-2", toolName: "Grep" } },
				{ event: "done", data: {} },
			]),
		);
		vi.stubGlobal("fetch", fetchMock);

		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Task")!({
			description: "inspect",
			prompt: "Find things.",
			_taskDepth: 0,
			_provider: { baseUrl: "https://provider.test", apiKey: "sk", model: "m" },
			_scpPort: 3000,
			_scpApiKey: "api-key",
			_parentRequestId: "parent-1",
			_parentConversationId: "conv-1",
			_parentAssistantMessageId: "assistant-parent-1",
		});

		expect(result.isError).toBeFalsy();
		expect(textOf(result)).toContain("done");
		expect(fetchMock).toHaveBeenCalledOnce();
		const requestBody = JSON.parse(
			(fetchMock.mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
		) as {
			conversationId?: string;
			agentBuiltins?: {
				taskDepth?: number;
				parentConversationId?: string;
				parentAssistantMessageId?: string;
			};
		};
		expect(requestBody.conversationId).toBe("conv-1");
		expect(requestBody.agentBuiltins).toMatchObject({
			taskDepth: 1,
			parentConversationId: "conv-1",
			parentAssistantMessageId: "assistant-parent-1",
		});
		const updates = emitted.filter(
			(
				event,
			): event is Extract<AgentProductEvent, { type: "subagent.updated" }> =>
				event.type === "subagent.updated",
		);
		expect(updates).toHaveLength(2);
		expect(updates.map((event) => event.payload.patch.toolCallCount)).toEqual([
			1,
			2,
		]);
		expect(updates[0].payload.patch).toMatchObject({
			status: "running",
			parentAssistantMessageId: "assistant-parent-1",
		});
		const completed = emitted.find(
			(
				event,
			): event is Extract<AgentProductEvent, { type: "subagent.completed" }> =>
				event.type === "subagent.completed",
		);
		expect(completed?.payload).toMatchObject({
			summary: "done",
			toolCallCount: 2,
		});
	});

	it("unregisters the control handle after a natural finish (finished runs can't be stopped)", async () => {
		const emitted: AgentProductEvent[] = [];
		setSubagentEventBridge(
			new SubagentEventBridge({
				emitSubagentEvent: (event) => emitted.push(event),
				now: () => 1,
			}),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				sseResponse([
					{ event: "chunk", data: { content: "ok" } },
					{ event: "done", data: {} },
				]),
			),
		);
		const server = createAgentBuiltinsServer();
		await server.handlers.get("Task")!({
			description: "inspect",
			prompt: "Find things.",
			_taskDepth: 0,
			_provider: { baseUrl: "https://provider.test", apiKey: "sk", model: "m" },
			_scpPort: 3000,
			_scpApiKey: "api-key",
			_parentRequestId: "parent-1",
			_parentConversationId: "conv-1",
		});
		const spawned = emitted.find((e) => e.type === "subagent.spawned");
		expect(spawned).toBeTruthy();
		// finally-block unregistered the handle, so it can't be stopped anymore.
		expect(hasSubagentControl(spawned!.subagentRunId!)).toBe(false);
		expect(cancelSubagentControl(spawned!.subagentRunId!)).toBe(false);
	});

	it("cancel aborts the in-flight sub-stream and returns 'stopped by user' without emitting subagent.failed", async () => {
		const emitted: AgentProductEvent[] = [];
		setSubagentEventBridge(
			new SubagentEventBridge({
				emitSubagentEvent: (event) => emitted.push(event),
				now: () => 1,
			}),
		);

		// A fetch that only settles when its AbortSignal fires — models a
		// long-running subagent stream we then stop mid-flight.
		let abortCbInstalled: (() => void) | null = null;
		const fetchMock = vi.fn(
			(_url: string, init?: { signal?: AbortSignal }) =>
				new Promise<Response>((_resolve, reject) => {
					const signal = init?.signal;
					if (!signal) return; // stop POST has no signal — ignore it here
					const onAbort = () => {
						reject(
							Object.assign(new Error("aborted"), { name: "AbortError" }),
						);
					};
					if (signal.aborted) onAbort();
					else signal.addEventListener("abort", onAbort, { once: true });
					abortCbInstalled = onAbort;
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const server = createAgentBuiltinsServer();
		const runPromise = server.handlers.get("Task")!({
			description: "inspect",
			prompt: "Find things.",
			_taskDepth: 0,
			_provider: { baseUrl: "https://provider.test", apiKey: "sk", model: "m" },
			_scpPort: 3000,
			_scpApiKey: "api-key",
			_parentRequestId: "parent-1",
			_parentConversationId: "conv-1",
		});

		// Wait a tick so spawn + registerSubagentControl have run.
		await new Promise((r) => setTimeout(r, 0));
		expect(abortCbInstalled).not.toBeNull();

		// Find the spawned run id and cancel it via the control registry.
		const spawned = emitted.find((e) => e.type === "subagent.spawned");
		expect(spawned).toBeTruthy();
		const subagentRunId = spawned!.subagentRunId!;
		expect(hasSubagentControl(subagentRunId)).toBe(true);

		const stopped = cancelSubagentControl(subagentRunId);
		expect(stopped).toBe(true);

		const result = await runPromise;
		expect(result.isError).toBe(true);
		expect(textOf(result)).toMatch(/stopped by user/i);
		// No subagent.failed on top of a user cancel.
		expect(emitted.some((e) => e.type === "subagent.failed")).toBe(false);
		// The abort also fired a best-effort /v1/llm/stop POST (signal-less).
		expect(
			fetchMock.mock.calls.some((call) =>
				String(call[0]).includes("/v1/llm/stop"),
			),
		).toBe(true);
		// Control handle cleaned up in finally.
		expect(hasSubagentControl(subagentRunId)).toBe(false);
	});

	// Note: the unit tests above cover both the depth-cap error path
	// (`depth >= MAX_TASK_DEPTH`) and the depth-increment happy path
	// (outgoing body `agentBuiltins.taskDepth === depth + 1`, asserted at
	// depth 0 and at the max-allowed depth 2) by inspecting the mocked
	// fetch body. The e2e suite (agentBuiltinsServer.e2e.test.ts) does NOT
	// re-assert the depth field: it runs real HTTP recursion through a live
	// LocalServer, whose outgoing body is not interceptable without spying
	// on LLMService.chatCompletion. The depth invariant is therefore fully
	// owned here; the e2e only verifies end-to-end real-HTTP recursion.
});
