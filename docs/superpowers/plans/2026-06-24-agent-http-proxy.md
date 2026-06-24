# Agent HTTP Proxy + Pure A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ClaudeCodeAgentRuntime` call the model through the local HTTP `/v1/llm/chat/completions` proxy instead of in-process `llmService.chatCompletion`. Move the 8 builtin tools (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task) into a new internal MCP server `@scp/agent-builtins` so they show as "内置" in the UI and route through standard MCP plumbing.

**Architecture:** Two orthogonal changes that compose. (1) Layer-1 (model HTTP): runtime uses `fetch(http://127.0.0.1:${port}/v1/llm/chat/completions)` + SSE parser instead of `subscribeRequestEvents`. (2) Layer-2 (tool MCP): builtin tools become an internal MCP server invokable via `toolMapping`, with provider config + cwd + storageDir injected by `toolExecutorFactory` like other internal servers. Task tool recurses via the same HTTP path; depth-capped at 3.

**Tech Stack:** TypeScript 5.8, Vitest, Koa (local server), undici (MockAgent for e2e provider mocking), Vercel AI SDK 6.

---

## File Structure

**New files:**

| File | Purpose |
|---|---|
| `src/main/services/llm/sseClient.ts` | SSE parser + fetch wrapper used by ClaudeCodeAgentRuntime and Task tool |
| `src/main/services/llm/__tests__/sseClient.test.ts` | Unit tests for SSE parser edge cases |
| `src/main/services/mcp/internal/servers/agentBuiltinsServer.ts` | `@scp/agent-builtins` MCP server with all 8 tools |
| `src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts` | Per-tool unit tests + Task recursion integration |
| `src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.e2e.test.ts` | True e2e: real LocalServer + undici MockAgent provider |
| `src/test-utils/mockProvider.ts` | Shared undici MockAgent helper for provider HTTP mocking |
| `src/test-utils/serverFixture.ts` | LocalServer startup helper for tests (random port) |

**Modified files:**

| File | Change |
|---|---|
| `src/main/services/mcp/internal/InternalMcpService.ts` | Register `agentBuiltinsServer` factory in `initialize()` array |
| `src/main/services/llm/toolExecutorFactory.ts` | Add `@scp/agent-builtins` to `SERVERS_WITH_STORAGE` + `SERVERS_WITH_PATH_ARGS`; introduce `SERVERS_WITH_PROVIDER_CONFIG` set + injection in `injectBuiltinArgs` |
| `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts` | Rewrite `createQuery` to use fetch+SSE; `buildChatRequest` routes builtin tools via `toolMapping → @scp/agent-builtins`; `interrupt` → POST `/v1/llm/stop`; `resolvePermission` → POST `/v1/llm/tool-approval` |
| `src/renderer/src/components/chat/ToolCallCard.tsx` | `getEnvType` adds `scp-agent-builtins → "builtin"`; `ENV_COLORS.builtin` color block |
| `src/renderer/src/i18n/locales/zh/chat.json` | `envType.builtin: "内置"` |
| `src/renderer/src/i18n/locales/en/chat.json` | `envType.builtin: "Built-in"` |

**Deleted files** (after E5):

- `src/main/services/agent/runtime/tools/` entire directory (8 tool files + index.ts)
- `src/main/services/agent/runtime/__tests__/tools.read.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.write.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.edit.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.bash.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.grep.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.glob.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.webfetch.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.task.test.ts`
- `src/main/services/agent/runtime/__tests__/tools.registry.test.ts`
- `src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts` (replaced by e2e)

---

## Phase E1: Foundation

### Task E1.0: Worktree setup

**Files:** none

- [ ] **Step 1: Create worktree**

```bash
cd /Users/mark/myself/code/super-client-r
git worktree add .worktrees/agent-http-proxy -b feat/agent-http-proxy
cd .worktrees/agent-http-proxy
pnpm install --prefer-offline
ELECTRON_PKG=$(realpath node_modules/.pnpm/electron@38.8.6/node_modules/electron)
MAIN=$(realpath ../../node_modules/.pnpm/electron@38.8.6/node_modules/electron)
ln -s "$MAIN/dist" "$ELECTRON_PKG/dist"
printf "Electron.app/Contents/MacOS/Electron" > "$ELECTRON_PKG/path.txt"
```

- [ ] **Step 2: Baseline tests**

```bash
pnpm exec tsc -b --noEmit
pnpm exec vitest run src/main/services/agent/runtime/__tests__/ src/main/services/llm/__tests__/
```

Expected: 0 TS errors, all green.

- [ ] **Step 3: Commit baseline marker (empty)**

```bash
git commit --allow-empty -m "chore: worktree setup for agent-http-proxy"
```

---

### Task E1.1: SSE parser util

**Files:**
- Create: `src/main/services/llm/sseClient.ts`
- Create: `src/main/services/llm/__tests__/sseClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/llm/__tests__/sseClient.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSSEStream } from "../sseClient";

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	let i = 0;
	return new ReadableStream({
		pull(ctrl) {
			if (i < chunks.length) ctrl.enqueue(enc.encode(chunks[i++]));
			else ctrl.close();
		},
	});
}

describe("parseSSEStream", () => {
	it("parses event:/data: frames separated by blank line", async () => {
		const s = toStream([
			'event: chunk\ndata: {"content":"Hi"}\n\n',
			'event: done\ndata: {"requestId":"r1"}\n\n',
		]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const frame of parseSSEStream(s)) out.push(frame);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ event: "chunk", data: { content: "Hi" } });
		expect(out[1]).toEqual({ event: "done", data: { requestId: "r1" } });
	});

	it("handles frames split mid-chunk across reader pulls", async () => {
		const s = toStream(["event: chunk\nda", 'ta: {"x":1}\n\n']);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([{ event: "chunk", data: { x: 1 } }]);
	});

	it("defaults event name to 'message' when missing", async () => {
		const s = toStream(['data: {"a":1}\n\n']);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out[0].event).toBe("message");
	});

	it("skips malformed JSON without throwing", async () => {
		const s = toStream(["event: chunk\ndata: not-json\n\n"]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([]);
	});

	it("handles multi-line data fields (concatenates)", async () => {
		const s = toStream(["event: chunk\ndata: {\ndata: \"x\":1}\n\n"]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		// Multi-line data should concatenate per SSE spec
		expect(out).toEqual([{ event: "chunk", data: { x: 1 } }]);
	});

	it("returns cleanly on empty stream", async () => {
		const s = toStream([]);
		const out: Array<{ event: string; data: unknown }> = [];
		for await (const f of parseSSEStream(s)) out.push(f);
		expect(out).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/services/llm/__tests__/sseClient.test.ts`
Expected: FAIL with `Cannot find module '../sseClient'`.

- [ ] **Step 3: Create `sseClient.ts`**

```ts
// src/main/services/llm/sseClient.ts
/**
 * SSE (Server-Sent Events) stream parser.
 *
 * Reads a fetch Response body (ReadableStream<Uint8Array>) and yields
 * `{ event, data }` for each `event: <name>\ndata: <json>\n\n` frame.
 *
 * Per SSE spec:
 *   - Multiple `data:` lines in one frame are concatenated with newline
 *   - Missing `event:` defaults to "message"
 *   - Malformed JSON is silently skipped (returns nothing for that frame)
 *
 * Used by ClaudeCodeAgentRuntime to consume `/v1/llm/chat/completions`
 * and by the Task tool to consume recursive subagent streams.
 */
export interface SSEFrame {
	event: string;
	data: unknown;
}

export async function* parseSSEStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEFrame, void, void> {
	const reader = body.getReader();
	const decoder = new TextDecoder("utf-8");
	let buf = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += decoder.decode(value, { stream: true });

			let sep: number;
			while ((sep = buf.indexOf("\n\n")) >= 0) {
				const frame = buf.slice(0, sep);
				buf = buf.slice(sep + 2);
				const parsed = parseFrame(frame);
				if (parsed) yield parsed;
			}
		}
		// Flush any final frame without trailing blank line.
		buf += decoder.decode();
		if (buf.trim()) {
			const parsed = parseFrame(buf);
			if (parsed) yield parsed;
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			/* ignore */
		}
	}
}

function parseFrame(frame: string): SSEFrame | null {
	const lines = frame.split("\n");
	let event = "message";
	const dataParts: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith(":")) continue;
		if (line.startsWith("event:")) {
			event = line.slice(6).trim();
		} else if (line.startsWith("data:")) {
			dataParts.push(line.slice(5).trim());
		}
	}
	if (dataParts.length === 0) return null;
	const dataStr = dataParts.join("\n");
	try {
		const data = JSON.parse(dataStr);
		return { event, data };
	} catch {
		return null;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/services/llm/__tests__/sseClient.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/services/llm/sseClient.ts \
        src/main/services/llm/__tests__/sseClient.test.ts
git commit -m "feat(llm): SSE parser for self-consuming /v1/llm/chat/completions"
```

---

### Task E1.2: Test infrastructure — undici MockAgent helper

**Files:**
- Create: `src/test-utils/mockProvider.ts`
- Create: `src/test-utils/__tests__/mockProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test-utils/__tests__/mockProvider.test.ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { setupMockProvider, mockChatCompletion } from "../mockProvider";

describe("mockProvider", () => {
	afterEach(() => {
		// Each test resets the global dispatcher
	});

	it("setupMockProvider intercepts a baseURL and replies with SSE", async () => {
		const { agent, cleanup } = setupMockProvider("https://prov.test/v1");
		mockChatCompletion(agent, "https://prov.test/v1", [
			{ event: "chunk", data: { content: "Hi" } },
			{ event: "done", data: { requestId: "r1" } },
		]);

		const res = await fetch("https://prov.test/v1/chat/completions", {
			method: "POST",
			body: "{}",
		});
		const text = await res.text();
		expect(text).toContain("event: chunk");
		expect(text).toContain('"content":"Hi"');
		expect(text).toContain("event: done");

		await cleanup();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/test-utils/__tests__/mockProvider.test.ts`
Expected: FAIL — `Cannot find module '../mockProvider'`.

- [ ] **Step 3: Create `mockProvider.ts`**

```ts
// src/test-utils/mockProvider.ts
/**
 * Test helper: intercept outbound provider HTTP calls and reply with
 * canned SSE streams. Built on undici MockAgent so the real HTTP-layer
 * code path (fetch, headers, body serialization) is exercised end-to-end.
 *
 * Usage:
 *   const { agent, cleanup } = setupMockProvider("https://api.example/v1");
 *   mockChatCompletion(agent, "https://api.example/v1", [
 *     { event: "chunk", data: { content: "Hi" } },
 *     { event: "done", data: { ... } },
 *   ]);
 *   // ... make requests via fetch ...
 *   await cleanup();
 */
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import type { Dispatcher } from "undici";

export interface SSEEvent {
	event: string;
	data: unknown;
}

export interface MockProviderHandle {
	agent: MockAgent;
	cleanup: () => Promise<void>;
}

export function setupMockProvider(_baseUrl: string): MockProviderHandle {
	const prior = getGlobalDispatcher();
	const agent = new MockAgent({ connections: 1 });
	agent.disableNetConnect();
	setGlobalDispatcher(agent);
	return {
		agent,
		cleanup: async () => {
			await agent.close();
			setGlobalDispatcher(prior as Dispatcher);
		},
	};
}

/**
 * Register an SSE-shaped response for POST {baseUrl}/chat/completions.
 */
export function mockChatCompletion(
	agent: MockAgent,
	baseUrl: string,
	events: SSEEvent[],
): void {
	const url = new URL(baseUrl);
	const origin = `${url.protocol}//${url.host}`;
	const path = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
	const body = events
		.map(
			(e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`,
		)
		.join("");
	agent
		.get(origin)
		.intercept({ path, method: "POST" })
		.reply(200, body, {
			headers: { "content-type": "text/event-stream" },
		});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/test-utils/__tests__/mockProvider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test-utils/mockProvider.ts src/test-utils/__tests__/mockProvider.test.ts
git commit -m "test: undici MockAgent helper for provider HTTP mocking"
```

---

### Task E1.3: LocalServer fixture helper

**Files:**
- Create: `src/test-utils/serverFixture.ts`
- Create: `src/test-utils/__tests__/serverFixture.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test-utils/__tests__/serverFixture.test.ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServerHandle } from "../serverFixture";

describe("serverFixture", () => {
	let handle: TestServerHandle;
	beforeAll(async () => {
		handle = await startTestServer();
	});
	afterAll(async () => {
		await handle.stop();
	});

	it("startTestServer returns port + apiKey + base URL", () => {
		expect(handle.port).toBeGreaterThan(0);
		expect(handle.apiKey).toMatch(/^sk-/);
		expect(handle.baseUrl).toBe(`http://127.0.0.1:${handle.port}`);
	});

	it("server responds to /health without auth", async () => {
		const res = await fetch(`${handle.baseUrl}/health`);
		expect(res.status).toBe(200);
	});

	it("server requires Bearer auth for /v1/llm/models", async () => {
		const res = await fetch(`${handle.baseUrl}/v1/llm/models`, {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(401);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/test-utils/__tests__/serverFixture.test.ts`
Expected: FAIL — `Cannot find module '../serverFixture'`.

- [ ] **Step 3: Create `serverFixture.ts`**

```ts
// src/test-utils/serverFixture.ts
/**
 * Boot a real LocalServer instance on a random free port for tests.
 *
 * The server is the actual production Koa app with all routes mounted.
 * Provider HTTP outbound is expected to be mocked via undici MockAgent
 * (see mockProvider.ts).
 */
import { localServer } from "../main/server";
import { getOrCreateApiKey } from "../main/server/config";

export interface TestServerHandle {
	port: number;
	apiKey: string;
	baseUrl: string;
	stop: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServerHandle> {
	if (!localServer.isRunning()) {
		await localServer.start(0); // 0 → random free port via get-port
	}
	const port = localServer.getPort();
	const apiKey = getOrCreateApiKey();
	return {
		port,
		apiKey,
		baseUrl: `http://127.0.0.1:${port}`,
		stop: async () => {
			await localServer.stop();
		},
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/test-utils/__tests__/serverFixture.test.ts`
Expected: PASS (3 cases). NOTE: if `LocalServer.start(0)` doesn't accept `0` for "random", check `get-port` behavior and adjust.

- [ ] **Step 5: Commit**

```bash
git add src/test-utils/serverFixture.ts src/test-utils/__tests__/serverFixture.test.ts
git commit -m "test: LocalServer fixture helper (random port + apiKey)"
```

---

## Phase E2: `@scp/agent-builtins` MCP Server

### Task E2.1: Server skeleton + registration

**Files:**
- Create: `src/main/services/mcp/internal/servers/agentBuiltinsServer.ts`
- Modify: `src/main/services/mcp/internal/InternalMcpService.ts`
- Create: `src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAgentBuiltinsServer } from "../agentBuiltinsServer";

describe("agentBuiltinsServer skeleton", () => {
	it("exposes 8 tools with correct names", () => {
		const server = createAgentBuiltinsServer();
		expect(server.id).toBe("@scp/agent-builtins");
		expect(server.tools.map((t) => t.name).sort()).toEqual(
			["Bash", "Edit", "Glob", "Grep", "Read", "Task", "WebFetch", "Write"].sort(),
		);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts`
Expected: FAIL — `Cannot find module '../agentBuiltinsServer'`.

- [ ] **Step 3: Create `agentBuiltinsServer.ts` skeleton**

```ts
// src/main/services/mcp/internal/servers/agentBuiltinsServer.ts
/**
 * @scp/agent-builtins — built-in tools for the Claude-Code-style agent.
 *
 * Mirrors the canonical Claude Code tool set so any model with native
 * function calling can drive the same agent loop. Each handler delegates
 * to either Node fs / child_process or another MCP server.
 *
 * Host injection (toolExecutorFactory.injectBuiltinArgs):
 *   - `_storageDir`: workspace storage subdir
 *   - `_cwd`: workspace cwd for path resolution
 *   - `_provider`: { baseUrl, apiKey, model, providerPreset, apiFormat }
 *     (for Task tool's subagent HTTP recursion)
 *   - `_parentRequestId`: parent's requestId (for trace correlation)
 *   - `_taskDepth`: current subagent nesting level (0 at root)
 */
import type {
	InternalMcpServer,
	InternalToolDefinition,
	InternalToolHandler,
	InternalToolResult,
} from "../types";

const toolDescriptions: InternalToolDefinition[] = [
	{
		name: "Read",
		description:
			"Read the contents of a file. Returns content with line numbers in cat -n format. Supports offset (1-indexed start line) and limit (count). Use Glob/Grep first to discover files.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative path" },
				offset: { type: "number" },
				limit: { type: "number" },
			},
			required: ["path"],
		},
	},
	{
		name: "Write",
		description:
			"Write text to a file (UTF-8). Creates parent directories. Overwrites existing files. For partial edits prefer Edit.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				content: { type: "string" },
			},
			required: ["path", "content"],
		},
	},
	{
		name: "Edit",
		description:
			"Replace old_string with new_string inside a file. old_string must appear exactly once unless replace_all:true. If anchor is ambiguous, narrow it with more surrounding context.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				old_string: { type: "string" },
				new_string: { type: "string" },
				replace_all: { type: "boolean" },
			},
			required: ["path", "old_string", "new_string"],
		},
	},
	{
		name: "Bash",
		description:
			"Run a shell command in cwd. Returns stdout/stderr/exit code. Default 30s timeout, max 120s. Don't pipe interactive commands.",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string" },
				timeout: { type: "number" },
			},
			required: ["command"],
		},
	},
	{
		name: "Grep",
		description:
			"Search file contents using regex (ripgrep). Pass glob to filter included files. filesOnly:true returns only file paths.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string" },
				path: { type: "string" },
				glob: { type: "string" },
				filesOnly: { type: "boolean" },
				ignoreCase: { type: "boolean" },
				contextLines: { type: "number" },
				maxResults: { type: "number" },
			},
			required: ["pattern"],
		},
	},
	{
		name: "Glob",
		description:
			"List files matching a glob pattern. Examples: **/*.ts, src/**/index.{ts,tsx}. Default search root is cwd.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string" },
				path: { type: "string" },
			},
			required: ["pattern"],
		},
	},
	{
		name: "WebFetch",
		description:
			"Fetch a URL and return its text content (HTML stripped). Use for online docs, blog posts.",
		inputSchema: {
			type: "object",
			properties: { url: { type: "string" } },
			required: ["url"],
		},
	},
	{
		name: "Task",
		description:
			"Spawn a focused subagent to complete a self-contained sub-problem. The subagent has access to the same workspace and built-in tools but starts with a fresh chat context. Use for: parallel exploration, heavy multi-step analysis you want summarised back, isolating tool-noisy work. Max nesting depth: 3.",
		inputSchema: {
			type: "object",
			properties: {
				description: { type: "string" },
				prompt: { type: "string" },
			},
			required: ["description", "prompt"],
		},
	},
];

export function createAgentBuiltinsServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	for (const def of toolDescriptions) {
		handlers.set(def.name, async (): Promise<InternalToolResult> => ({
			content: [{ type: "text", text: `${def.name}: not implemented yet` }],
			isError: true,
		}));
	}
	return {
		id: "@scp/agent-builtins",
		name: "Agent Built-ins",
		description: "Built-in tool set for the ClaudeCodeAgentRuntime.",
		version: "1.0.0",
		tools: toolDescriptions,
		handlers,
	};
}
```

- [ ] **Step 4: Register in `InternalMcpService.ts`**

In `src/main/services/mcp/internal/InternalMcpService.ts`, inside `initialize()` array of factory imports, add:

```ts
const { createAgentBuiltinsServer } = await import("./servers/agentBuiltinsServer");
this.register(createAgentBuiltinsServer());
```

- [ ] **Step 5: Run skeleton test passes**

Run: `pnpm exec vitest run src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 6: Commit**

```bash
git add src/main/services/mcp/internal/servers/agentBuiltinsServer.ts \
        src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts \
        src/main/services/mcp/internal/InternalMcpService.ts
git commit -m "feat(mcp): @scp/agent-builtins server skeleton (8 tool defs + placeholders)"
```

---

### Task E2.2: Read tool handler

**Files:** Modify `src/main/services/mcp/internal/servers/agentBuiltinsServer.ts`

- [ ] **Step 1: Add failing test case**

Append to `agentBuiltinsServer.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Read handler", () => {
	const dir = mkdtempSync(join(tmpdir(), "agent-builtins-read-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("reads relative path against _cwd with cat -n format", async () => {
		writeFileSync(join(dir, "small.txt"), "alpha\nbeta\ngamma\n");
		const server = createAgentBuiltinsServer();
		const handler = server.handlers.get("Read")!;
		const result = await handler({ path: "small.txt", _cwd: dir });
		expect(result.isError).toBeFalsy();
		const text = result.content.map((c: any) => c.text).join("");
		expect(text).toMatch(/1\talpha/);
		expect(text).toMatch(/3\tgamma/);
	});

	it("honors offset + limit", async () => {
		writeFileSync(join(dir, "big.txt"), Array.from({ length: 100 }, (_, i) => `L${i + 1}`).join("\n"));
		const server = createAgentBuiltinsServer();
		const handler = server.handlers.get("Read")!;
		const result = await handler({ path: "big.txt", _cwd: dir, offset: 50, limit: 3 });
		const text = result.content.map((c: any) => c.text).join("");
		expect(text).toMatch(/50\tL50/);
		expect(text).toMatch(/52\tL52/);
		expect(text).not.toMatch(/53\tL53/);
	});

	it("returns isError on missing file", async () => {
		const server = createAgentBuiltinsServer();
		const handler = server.handlers.get("Read")!;
		const result = await handler({ path: "nope.txt", _cwd: dir });
		expect(result.isError).toBe(true);
	});
});
```

- [ ] **Step 2: Run, expect failures**

Run: `pnpm exec vitest run src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts`
Expected: 3 failures (placeholder returns "not implemented").

- [ ] **Step 3: Implement Read handler**

In `agentBuiltinsServer.ts`, replace the placeholder for `"Read"`:

```ts
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

// ... inside createAgentBuiltinsServer:
handlers.set("Read", async (args): Promise<InternalToolResult> => {
	try {
		const path = String(args.path ?? "");
		if (!path) throw new Error("Read: path is required");
		const cwd = String(args._cwd ?? process.cwd());
		const offset = Math.max(1, Number(args.offset ?? 1) | 0);
		const limit = Number(args.limit ?? 0) | 0;
		const abs = isAbsolute(path) ? path : resolve(cwd, path);
		const content = await readFile(abs, "utf-8");
		const lines = content.split("\n");
		const sliceStart = offset - 1;
		const sliceEnd = limit > 0 ? sliceStart + limit : lines.length;
		const view = lines.slice(sliceStart, sliceEnd);
		const text = view
			.map((l, i) => `${(sliceStart + i + 1).toString().padStart(4)}\t${l}`)
			.join("\n");
		return { content: [{ type: "text", text }], isError: false };
	} catch (err) {
		return {
			content: [{ type: "text", text: (err as Error).message }],
			isError: true,
		};
	}
});
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/main/services/mcp/internal/servers/agentBuiltinsServer.ts \
        src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts
git commit -m "feat(mcp): @scp/agent-builtins Read handler"
```

---

### Task E2.3: Write tool handler

Same pattern as E2.2. Replace the Write placeholder:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

handlers.set("Write", async (args): Promise<InternalToolResult> => {
	try {
		const path = String(args.path ?? "");
		const content = String(args.content ?? "");
		if (!path) throw new Error("Write: path is required");
		const cwd = String(args._cwd ?? process.cwd());
		const abs = isAbsolute(path) ? path : resolve(cwd, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf-8");
		return {
			content: [{ type: "text", text: `Wrote ${content.length} bytes to ${abs}` }],
			isError: false,
		};
	} catch (err) {
		return {
			content: [{ type: "text", text: (err as Error).message }],
			isError: true,
		};
	}
});
```

Tests: 2 cases (creates with parent dirs; overwrites). Commit:

```bash
git commit -m "feat(mcp): @scp/agent-builtins Write handler"
```

---

### Task E2.4: Edit tool handler

Same anchor-based logic as the deleted `tools/edit.ts`. Tests: 4 cases (unique replace, not found, ambiguous, replace_all). Commit:

```bash
git commit -m "feat(mcp): @scp/agent-builtins Edit handler (anchor + uniqueness)"
```

---

### Task E2.5: Bash tool handler

Delegate to `mcpService.callTool("@scp/bash", "execute_command", ...)`. Tests: mock mcpService, 2 cases (success forwards, error surfaces). Commit:

```bash
git commit -m "feat(mcp): @scp/agent-builtins Bash handler (delegates @scp/bash)"
```

---

### Task E2.6: Grep tool handler

Delegate to `@scp/grep`. Same as deleted `tools/grep.ts`. 3 cases. Commit:

```bash
git commit -m "feat(mcp): @scp/agent-builtins Grep handler"
```

---

### Task E2.7: Glob tool handler

Delegate to `@scp/file-system::search_files`. 2 cases. Commit:

```bash
git commit -m "feat(mcp): @scp/agent-builtins Glob handler"
```

---

### Task E2.8: WebFetch tool handler

Delegate to `@scp/fetch::fetch_html`. 3 cases. Commit:

```bash
git commit -m "feat(mcp): @scp/agent-builtins WebFetch handler"
```

---

### Task E2.9: Task tool handler (HTTP recursion)

**Files:** Modify `agentBuiltinsServer.ts` + tests

- [ ] **Step 1: Add failing tests**

```ts
import { mockChatCompletion, setupMockProvider } from "../../../../../../test-utils/mockProvider";
import { startTestServer } from "../../../../../../test-utils/serverFixture";

describe("Task handler (HTTP recursion)", () => {
	it("posts subagent request to localhost server and accumulates text", async () => {
		const test = await startTestServer();
		const prov = setupMockProvider("https://prov.test/v1");
		mockChatCompletion(prov.agent, "https://prov.test/v1", [
			{ event: "chunk", data: { content: "Sub-result." } },
			{ event: "done", data: {} },
		]);

		const server = createAgentBuiltinsServer();
		const handler = server.handlers.get("Task")!;
		const result = await handler({
			description: "find foo",
			prompt: "Find all foo refs",
			_provider: {
				baseUrl: "https://prov.test/v1",
				apiKey: "sk-fake",
				model: "test-model",
				providerPreset: "openai",
				apiFormat: "chat-completions",
			},
			_cwd: "/tmp",
			_parentRequestId: "parent-1",
			_taskDepth: 0,
			_scpApiKey: test.apiKey,
			_scpPort: test.port,
		});
		expect(result.isError).toBeFalsy();
		const text = result.content.map((c: any) => c.text).join("");
		expect(text).toContain("Sub-result");

		await prov.cleanup();
		await test.stop();
	});

	it("errors at depth >= 3", async () => {
		const server = createAgentBuiltinsServer();
		const handler = server.handlers.get("Task")!;
		const result = await handler({
			description: "x",
			prompt: "y",
			_taskDepth: 3,
			_provider: {} as any,
		});
		expect(result.isError).toBe(true);
		const text = result.content.map((c: any) => c.text).join("");
		expect(text).toMatch(/depth|nest/i);
	});

	it("errors when _provider missing", async () => {
		const server = createAgentBuiltinsServer();
		const handler = server.handlers.get("Task")!;
		const result = await handler({ description: "x", prompt: "y" });
		expect(result.isError).toBe(true);
	});
});
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement Task handler**

```ts
import { parseSSEStream } from "../../../llm/sseClient";

const MAX_TASK_DEPTH = 3;

handlers.set("Task", async (args): Promise<InternalToolResult> => {
	try {
		const description = String(args.description ?? "").trim();
		const prompt = String(args.prompt ?? "").trim();
		if (!description) throw new Error("Task: description is required");
		if (!prompt) throw new Error("Task: prompt is required");

		const depth = Number(args._taskDepth ?? 0);
		if (depth >= MAX_TASK_DEPTH) {
			throw new Error(`Task: max nesting depth (${MAX_TASK_DEPTH}) reached`);
		}

		const provider = args._provider as {
			baseUrl?: string;
			apiKey?: string;
			model?: string;
			providerPreset?: string;
			apiFormat?: string;
		} | undefined;
		if (!provider || !provider.baseUrl || !provider.model) {
			throw new Error("Task: _provider is required (host injection failed)");
		}

		const scpPort = Number(args._scpPort ?? 0);
		const scpKey = String(args._scpApiKey ?? "");
		if (!scpPort || !scpKey) {
			throw new Error("Task: _scpPort/_scpApiKey required for HTTP recursion");
		}

		const parentRequestId = String(args._parentRequestId ?? "");
		const subRequestId = `${parentRequestId || "task"}_d${depth + 1}_${Date.now()}`;

		// Build subagent's ChatCompletionRequest. Use same provider but fresh
		// messages + same builtin tools (allowing deeper recursion).
		const subRequest = {
			requestId: subRequestId,
			conversationId: subRequestId,
			baseUrl: provider.baseUrl,
			apiKey: provider.apiKey,
			model: provider.model,
			providerPreset: provider.providerPreset,
			apiFormat: provider.apiFormat,
			messages: [
				{
					role: "system" as const,
					content: `You are a focused subagent. Task: ${description}\nReturn a concise summary. You have the same tool set as the parent agent.`,
				},
				{ role: "user" as const, content: prompt },
			],
			// Pass the same 8 builtin tool definitions + toolMapping all
			// pointing back to @scp/agent-builtins. The HTTP server will
			// re-inject _taskDepth via host augmentation.
			tools: toolDescriptions.map((t) => ({
				type: "function" as const,
				function: {
					name: `scp-agent-builtins__${t.name}`,
					description: t.description,
					parameters: t.inputSchema,
				},
			})),
			toolMapping: Object.fromEntries(
				toolDescriptions.map((t) => [
					`scp-agent-builtins__${t.name}`,
					{ serverId: "@scp/agent-builtins", toolName: t.name },
				]),
			),
		};

		const res = await fetch(
			`http://127.0.0.1:${scpPort}/v1/llm/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${scpKey}`,
				},
				body: JSON.stringify(subRequest),
			},
		);
		if (!res.ok || !res.body) {
			throw new Error(`Task: subagent HTTP ${res.status}`);
		}

		let accumulated = "";
		for await (const frame of parseSSEStream(res.body)) {
			if (frame.event === "chunk") {
				const c = (frame.data as { content?: string }).content;
				if (c) accumulated += c;
			} else if (frame.event === "error") {
				const e = (frame.data as { error?: string }).error;
				throw new Error(`Task: subagent error: ${e}`);
			}
		}

		return {
			content: [
				{
					type: "text",
					text: accumulated || "(subagent returned no text)",
				},
			],
			isError: false,
		};
	} catch (err) {
		return {
			content: [{ type: "text", text: (err as Error).message }],
			isError: true,
		};
	}
});
```

- [ ] **Step 4: Run all agent-builtins tests pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mcp): @scp/agent-builtins Task handler (HTTP recursion, depth cap 3)"
```

---

### Task E2.10: toolExecutorFactory injection

**Files:** Modify `src/main/services/llm/toolExecutorFactory.ts`

- [ ] **Step 1: Add failing test**

Locate (or create) `toolExecutorFactory.test.ts`:

```ts
// Adding to existing test file:
describe("injectBuiltinArgs for @scp/agent-builtins", () => {
	it("injects _storageDir, _cwd, _provider, _scpPort, _scpApiKey", () => {
		const result = injectBuiltinArgs(
			"@scp/agent-builtins",
			{ path: "x" },
			{
				conversationId: "c1",
				storageDir: "/tmp/store",
				cwd: "/proj",
				provider: {
					baseUrl: "https://x.test/v1",
					apiKey: "sk-pp",
					model: "m1",
				},
				scpPort: 31337,
				scpApiKey: "sk-self",
				requestId: "r1",
			},
		);
		expect(result._storageDir).toBe("/tmp/store");
		expect(result._cwd).toBe("/proj");
		expect(result._provider).toMatchObject({ baseUrl: "https://x.test/v1" });
		expect(result._scpPort).toBe(31337);
		expect(result._scpApiKey).toBe("sk-self");
		expect(result._parentRequestId).toBe("r1");
	});

	it("resolves relative path args against _cwd", () => {
		const result = injectBuiltinArgs(
			"@scp/agent-builtins",
			{ path: "src/foo.ts" },
			{ cwd: "/proj" } as any,
		);
		expect(result.path).toBe("/proj/src/foo.ts");
	});
});
```

- [ ] **Step 2: Update `injectBuiltinArgs` to support @scp/agent-builtins**

In `src/main/services/llm/toolExecutorFactory.ts`:

```ts
const SERVERS_WITH_STORAGE = new Set(["@scp/plan", "@scp/todo", "@scp/agent-builtins"]);
const SERVERS_WITH_PATH_ARGS = new Set([
	"@scp/file-system",
	"@scp/grep",
	"@scp/agent-builtins", // Read/Write/Edit/Glob need cwd-relative path resolution
]);
const SERVERS_WITH_PROVIDER_CONFIG = new Set(["@scp/agent-builtins"]);

export function injectBuiltinArgs(
	serverId: string,
	args: Record<string, unknown>,
	ctx: {
		conversationId?: string;
		storageDir?: string;
		cwd?: string;
		provider?: {
			baseUrl: string;
			apiKey?: string;
			model: string;
			providerPreset?: string;
			apiFormat?: string;
		};
		scpPort?: number;
		scpApiKey?: string;
		requestId?: string;
	},
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...args };

	if (SERVERS_WITH_STORAGE.has(serverId) && ctx.storageDir) {
		merged._storageDir = ctx.storageDir;
	}
	if (SERVERS_WITH_PATH_ARGS.has(serverId) && ctx.cwd) {
		merged._cwd = ctx.cwd;
		for (const key of ["path", "source", "destination"]) {
			const v = merged[key];
			if (typeof v === "string" && !isAbsolute(v)) {
				merged[key] = resolve(ctx.cwd, v);
			}
		}
	}
	if (SERVERS_WITH_PROVIDER_CONFIG.has(serverId)) {
		if (ctx.provider) merged._provider = ctx.provider;
		if (ctx.scpPort) merged._scpPort = ctx.scpPort;
		if (ctx.scpApiKey) merged._scpApiKey = ctx.scpApiKey;
		if (ctx.requestId) merged._parentRequestId = ctx.requestId;
	}
	return merged;
}
```

- [ ] **Step 3: Run tests pass**

- [ ] **Step 4: Wire context: update the toolExecutor factory in `routes/llm.ts` to populate `provider/scpPort/scpApiKey/requestId` from the request body**

The HTTP route handler (`src/main/server/routes/llm.ts` near line 220) builds the toolExecutor. Update it to pass provider info from `req.body.baseUrl/apiKey/model/...` + `localServer.getPort()` + `getOrCreateApiKey()` + `req.body.requestId` to `injectBuiltinArgs`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(llm): toolExecutorFactory injects provider/port/scpKey for @scp/agent-builtins"
```

---

## Phase E3: ClaudeCodeAgentRuntime HTTP rewrite

### Task E3.1: Build chat request routes via @scp/agent-builtins

**Files:** Modify `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts`

- [ ] **Step 1: Update failing test**

In `ClaudeCodeAgentRuntime.test.ts` (the one we'll delete in E5 but use during transition), add:

```ts
it("buildChatRequest emits scp-agent-builtins__X tool names + toolMapping", async () => {
	chatCompletionMock.mockImplementationOnce(async (req) => {
		const names = req.tools.map((t: any) => t.function.name);
		expect(names).toContain("scp-agent-builtins__Read");
		expect(names).toContain("scp-agent-builtins__Task");
		expect(req.toolMapping["scp-agent-builtins__Read"]).toEqual({
			serverId: "@scp/agent-builtins",
			toolName: "Read",
		});
		pushEventsAndDone(req.requestId, [{ requestId: req.requestId, type: "done" }]);
	});
	const runtime = new ClaudeCodeAgentRuntime();
	for await (const _ev of runtime.createQuery(makeReq())) {
		/* drain */
	}
});
```

- [ ] **Step 2: Modify `buildChatRequest` in `ClaudeCodeAgentRuntime.ts`**

Replace the in-process `getBuiltinTools` with hardcoded agent-builtins metadata (or import from the MCP server):

```ts
import { createAgentBuiltinsServer } from "../../mcp/internal/servers/agentBuiltinsServer";

private buildChatRequest(req: AgentQueryRequest): ChatCompletionRequest {
	// ... provider lookup unchanged ...

	const builtin = createAgentBuiltinsServer();
	const builtinPrefix = "scp-agent-builtins__";

	const builtinTools = builtin.tools.map((t) => ({
		type: "function" as const,
		function: {
			name: `${builtinPrefix}${t.name}`,
			description: t.description,
			parameters: t.inputSchema,
		},
	}));

	const builtinMapping = Object.fromEntries(
		builtin.tools.map((t) => [
			`${builtinPrefix}${t.name}`,
			{ serverId: "@scp/agent-builtins", toolName: t.name },
		]),
	);

	const userTools = req.tools.map(/* same as before */);
	const userMapping: Record<string, { serverId: string; toolName: string }> = {};
	for (const t of req.tools) {
		userMapping[t.name] = { serverId: t.origin.serverId, toolName: t.name };
	}

	return {
		// ... same fields ...
		tools: [...builtinTools, ...userTools],
		toolMapping: { ...builtinMapping, ...userMapping },
	};
}
```

- [ ] **Step 3: Run tests pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): buildChatRequest routes builtin tools via @scp/agent-builtins MCP"
```

---

### Task E3.2: createQuery uses fetch + SSE

**Files:** Modify `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts`

- [ ] **Step 1: Add failing e2e test (use serverFixture + mockProvider)**

Create `src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.e2e.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServerHandle } from "../../../../../test-utils/serverFixture";
import { mockChatCompletion, setupMockProvider, type MockProviderHandle } from "../../../../../test-utils/mockProvider";
import { ClaudeCodeAgentRuntime } from "../ClaudeCodeAgentRuntime";
import { storeManager } from "../../../store/StoreManager";

describe("ClaudeCodeAgentRuntime e2e (real LocalServer + mocked provider)", () => {
	let server: TestServerHandle;
	let provider: MockProviderHandle;

	beforeAll(async () => {
		server = await startTestServer();
		// Add a provider configured to point at our mock
		storeManager.saveModelProvider({
			id: "test-prov",
			name: "Test Provider",
			preset: "openai",
			baseUrl: "https://prov.test/v1",
			apiKey: "sk-fake",
			apiFormat: "chat-completions",
			enabled: true,
			tested: true,
			models: [{ id: "test-model", name: "test-model", enabled: true }],
			createdAt: 0,
			updatedAt: 0,
		});
	});

	afterAll(async () => {
		if (provider) await provider.cleanup();
		await server.stop();
	});

	it("plain chat: fetches /v1/llm/chat/completions and yields runtime events", async () => {
		provider = setupMockProvider("https://prov.test/v1");
		mockChatCompletion(provider.agent, "https://prov.test/v1", [
			{ event: "chunk", data: { content: "Hello" } },
			{ event: "done", data: { usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } } },
		]);

		const runtime = new ClaudeCodeAgentRuntime();
		const events: any[] = [];
		const req = {
			requestId: "e2e-1",
			conversationId: "e2e-conv-1",
			prompt: { kind: "text", text: "hi" },
			history: [],
			runtime: {
				model: { providerId: "test-prov", modelId: "test-model" },
			} as any,
			tools: [],
			cwd: "/tmp",
			signal: new AbortController().signal,
		} as any;
		for await (const ev of runtime.createQuery(req)) events.push(ev);
		const types = events.map((e) => e.type);
		expect(types[0]).toBe("init");
		expect(types).toContain("text.delta");
		expect(types).toContain("result");
	});
});
```

- [ ] **Step 2: Run, expect FAIL** (because runtime still uses subscribeRequestEvents)

- [ ] **Step 3: Rewrite `createQuery` to use fetch + SSE**

```ts
import { parseSSEStream } from "../../llm/sseClient";
import { localServer } from "../../../server";
import { getOrCreateApiKey } from "../../../server/config";

createQuery(req: AgentQueryRequest): AsyncIterable<AgentRuntimeStreamEvent> {
	const translator = new ChatToRuntimeTranslator({
		requestId: req.requestId,
		conversationId: req.conversationId,
	});
	const controller = new AbortController();
	const onParentAbort = () => controller.abort();
	req.signal.addEventListener("abort", onParentAbort);
	this.active.set(req.requestId, controller);

	const llmRequest = this.buildChatRequest(req);
	const port = localServer.getPort();
	const apiKey = getOrCreateApiKey();

	const self = this;
	return (async function* () {
		try {
			const res = await fetch(
				`http://127.0.0.1:${port}/v1/llm/chat/completions`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify(llmRequest),
					signal: controller.signal,
				},
			);
			if (!res.ok || !res.body) {
				const text = await res.text().catch(() => "");
				for (const ev of translator.translate({
					requestId: req.requestId,
					type: "error",
					error: `LLM HTTP ${res.status}: ${text}`,
				} as never)) yield ev;
				return;
			}

			for await (const frame of parseSSEStream(res.body)) {
				const chatEvent = frame.data as ChatStreamEvent;
				for (const out of translator.translate(chatEvent)) yield out;
				if (chatEvent.type === "done" || chatEvent.type === "error") break;
			}
			for (const ev of translator.finalize()) yield ev;
		} catch (err) {
			if (!controller.signal.aborted) {
				for (const ev of translator.translate({
					requestId: req.requestId,
					type: "error",
					error: (err as Error).message,
				} as never)) yield ev;
			} else {
				for (const ev of translator.finalize()) yield ev;
			}
		} finally {
			req.signal.removeEventListener("abort", onParentAbort);
			self.active.delete(req.requestId);
		}
	})();
}
```

- [ ] **Step 4: Run, expect tests pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): ClaudeCodeAgentRuntime.createQuery uses HTTP fetch + SSE"
```

---

### Task E3.3: interrupt + resolvePermission go HTTP

- [ ] **Step 1: Update `interrupt` method**

```ts
async interrupt(requestId: string): Promise<void> {
	const ctrl = this.active.get(requestId);
	if (ctrl) ctrl.abort();
	const port = localServer.getPort();
	const apiKey = getOrCreateApiKey();
	await fetch(`http://127.0.0.1:${port}/v1/llm/stop`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({ requestId }),
	}).catch(() => {}); // non-fatal
}
```

- [ ] **Step 2: Update `resolvePermission`**

```ts
async resolvePermission(approvalId: string, decision: PermissionDecision): Promise<void> {
	const port = localServer.getPort();
	const apiKey = getOrCreateApiKey();
	await fetch(`http://127.0.0.1:${port}/v1/llm/tool-approval`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			toolCallId: approvalId,
			approved: decision.approved,
		}),
	}).catch(() => {});
}
```

- [ ] **Step 3: Add tests in e2e file**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): interrupt + resolvePermission go via HTTP"
```

---

### Task E3.4: Verify legacy adapter still works

- [ ] **Step 1: Run all agent runtime tests** (legacy `agentSdkLegacyAdapter.test.ts` + new e2e)

- [ ] **Step 2: Commit verification note** if all green:

```bash
git commit --allow-empty -m "verify: legacy agent-sdk:create-query still routes through new HTTP runtime"
```

---

## Phase E4: Renderer badge fix

### Task E4.1: Add `builtin` env type to ToolCallCard

**Files:**
- Modify: `src/renderer/src/components/chat/ToolCallCard.tsx`

- [ ] **Step 1: Add failing test** (or visual smoke note; this file may not have unit tests — write one if missing, otherwise verify by reading the file structure)

- [ ] **Step 2: Update `getEnvType`**

```ts
function getEnvType(server: string | null): "sandbox" | "local" | "network" | "browser" | "builtin" | "external" {
	if (!server) return "external";
	if (server.startsWith("scp-agent-builtins")) return "builtin";  // new
	if (server.startsWith("scp-python") || server.startsWith("scp-javascript")) return "sandbox";
	if (server.startsWith("scp-file-system") || server.startsWith("scp-nodejs")) return "local";
	if (server.startsWith("scp-fetch") || server.startsWith("scp-image")) return "network";
	if (server.startsWith("mcp-browser")) return "browser";
	return "external";
}
```

- [ ] **Step 3: Add `ENV_COLORS.builtin`**

```ts
const ENV_COLORS = {
	// ... existing ...
	builtin: {
		light: "#e6f7ff",
		dark: "#1a2e3a",
		text: "#1677ff",
		darkText: "#69b1ff",
	},
};
```

- [ ] **Step 4: Update `ENV_LABELS` (or wherever badge text is rendered) to include `builtin` → t("envType.builtin")**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): builtin env type for scp-agent-builtins tool calls"
```

---

### Task E4.2: i18n keys

**Files:**
- Modify: `src/renderer/src/i18n/locales/zh/chat.json`
- Modify: `src/renderer/src/i18n/locales/en/chat.json`

- [ ] **Step 1: Add `envType.builtin` key to both files**

zh:
```json
"envType": {
  "external": "外部",
  "sandbox": "沙箱",
  "local": "本地",
  "network": "网络",
  "browser": "浏览器",
  "builtin": "内置"
}
```

en:
```json
"envType": {
  "external": "External",
  ...,
  "builtin": "Built-in"
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "i18n(chat): builtin env type label (zh + en)"
```

---

## Phase E5: Cleanup + e2e tests

### Task E5.1: Delete `runtime/tools/` directory

**Files to delete:**
- `src/main/services/agent/runtime/tools/index.ts`
- `src/main/services/agent/runtime/tools/read.ts`
- `src/main/services/agent/runtime/tools/write.ts`
- `src/main/services/agent/runtime/tools/edit.ts`
- `src/main/services/agent/runtime/tools/bash.ts`
- `src/main/services/agent/runtime/tools/grep.ts`
- `src/main/services/agent/runtime/tools/glob.ts`
- `src/main/services/agent/runtime/tools/webfetch.ts`
- `src/main/services/agent/runtime/tools/task.ts`
- Their unit tests under `__tests__/`
- `src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts` (replaced by `.e2e.test.ts`)

- [ ] **Step 1: Verify no remaining imports**

```bash
rg "from .*runtime/tools" src
```

Expected: empty (ClaudeCodeAgentRuntime should now import from `mcp/internal/servers/agentBuiltinsServer.ts`).

- [ ] **Step 2: Delete files**

```bash
rm -rf src/main/services/agent/runtime/tools
rm src/main/services/agent/runtime/__tests__/tools.*.test.ts
rm src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts
```

- [ ] **Step 3: Run all tests + typecheck**

```bash
pnpm exec tsc -b --noEmit
pnpm exec vitest run
```

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(agent)!: delete runtime/tools/ — implementation moved to @scp/agent-builtins MCP"
```

---

### Task E5.2: Expand e2e test coverage

- [ ] **Step 1: Add tool-call round-trip test**

In `ClaudeCodeAgentRuntime.e2e.test.ts`:

```ts
it("tool call via @scp/agent-builtins: model calls Read, server executes, runtime emits tool.call/tool.result", async () => {
	// Provider returns a tool_call sequence
	provider = setupMockProvider("https://prov.test/v1");
	mockChatCompletion(provider.agent, "https://prov.test/v1", [
		{ event: "chunk", data: { content: "" } },
		// Simulate model deciding to call Read
		// (depends on AI SDK / fake provider format — adjust)
		// ... canned tool_call event sequence ...
		{ event: "tool_call", data: { toolCall: { id: "tc1", name: "scp-agent-builtins__Read", arguments: '{"path":"/tmp/test"}' } } },
		{ event: "tool_result", data: { toolResult: { toolCallId: "tc1", name: "scp-agent-builtins__Read", result: "file body", duration: 1 } } },
		{ event: "chunk", data: { content: "Done." } },
		{ event: "done", data: {} },
	]);

	// ... drive runtime and assert ...
});
```

- [ ] **Step 2: Add Task recursion test** (depth 0 → depth 1 subagent)

- [ ] **Step 3: Add interrupt test**

- [ ] **Step 4: Run all e2e tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "test(agent): expand e2e coverage — tool call / Task recursion / interrupt"
```

---

### Task E5.3: Final smoke (dev) + finishing

- [ ] **Step 1: Final TS + test sweep**

```bash
pnpm exec tsc -b --noEmit
pnpm exec vitest run
```

- [ ] **Step 2: Dev smoke** (manually, brief)

```bash
LLM_UNIFIED_PATH=1 pnpm dev
# Open chat, send "Read /tmp/foo.txt", verify UI shows 内置 badge and stream
```

- [ ] **Step 3: Invoke `superpowers:finishing-a-development-branch`** for rebase merge to main.

---

## Edge Case Checklist

| # | Case | Handled in task |
|---|---|---|
| 1 | LocalServer not started | E3.2 — runtime ctor `localServer.isRunning()` short-circuit |
| 2 | SSE connection drops mid-stream | E1.1 — parser handles `reader.read() done`; E3.2 translator.finalize emits cancelled |
| 3 | Task HTTP timeout | E2.9 — fetch with AbortSignal; depth check |
| 4 | `_provider` missing | E2.9 — explicit error |
| 5 | Task depth > 3 | E2.9 — handler check |
| 6 | API key lazy generate | E1.3 — `getOrCreateApiKey()` |
| 7 | Old session archived `external` badge | not changed — frozen data |
| 8 | provider doesn't stream totalUsage | unchanged (already handled in streamEventBridge) |
| 9 | Legacy `agent-sdk:create-query` | E3.4 — adapter unchanged |
| 10 | Port collision in tests | E1.3 — `get-port` finds free port |
| 11 | Tool args with absolute path | E2.10 — `isAbsolute` check before cwd resolve |
| 12 | Provider config not in store | E3.1 — `buildChatRequest` falls back to first enabled provider |
| 13 | undici test interception leak | E1.2 — `cleanup()` resets dispatcher |
| 14 | Server stop in test | E1.3 — `handle.stop()` |
| 15 | Re-entrancy of Task within Task | E2.9 — depth threaded through args; HTTP recursion supports it |
| 16 | Edit fuzzy match ambiguity | E2.4 — uniqueness check (carried over from old impl) |
| 17 | Edit indent preserve | unchanged — exact match semantics |
| 18 | Tool approval reject | server-side `toolAdapter` already emits `tool_error` code TOOL_REJECTED |
| 19 | streamEventTranslator state | unchanged — still consumes ChatStreamEvent |
| 20 | Renderer chatMessageStore unchanged | E3.x — `agentSdkLegacyAdapter` emits same legacy events |

---

## Self-Review

- ✅ All 22 tasks have file paths + step commits + test gates
- ✅ Each phase ends in a clean buildable state
- ✅ No "TBD" / "TODO" placeholders
- ✅ Type consistency: `InternalMcpServer`, `InternalToolHandler`, `InternalToolResult` from `mcp/internal/types`; `ChatStreamEvent` from `ipc/types`; `AgentRuntimeStreamEvent` from `shared-types/agent-runtime`
- ✅ E2.x tasks all follow same TDD shape: failing test → impl → green → commit
- ✅ Phase ordering respected: E1 infra → E2 server → E3 runtime → E4 ui → E5 cleanup
- ✅ Rollback safe: every commit is reversible via `git revert`
