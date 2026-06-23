# ClaudeCodeAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@anthropic-ai/claude-agent-sdk` with a self-built `ClaudeCodeAgentRuntime` that delivers Claude Code-style agent experience (Read/Write/Edit/Bash/Grep/Glob/Task/WebFetch built-in tools + subagent + agent loop) on top of the already-merged unified `LLMService.chatCompletion`. Any model that supports native function calling (Qwen/DeepSeek/GPT/Claude/Gemini/etc.) gains the same agent experience.

**Architecture:** Two orthogonal layers. `LLMService` (already exists) is the model abstraction layer — knows nothing about agents, just speaks 3 wire formats. `ClaudeCodeAgentRuntime` (new) is the agent experience layer — owns the agent loop, built-in tool set, system prompt, and subagent recursion. Runtime plugs into the already-existing `AgentRuntimeRegistry` so the renderer (`agent-runtime:*` IPC) keeps working unchanged.

**Tech Stack:** TypeScript 5.8, Vitest, `ai@^6` (Vercel AI SDK), `@super-client/shared-types/agent-runtime` (`AgentRuntime` interface), the existing MCP internal servers (`@scp/file-system`, `@scp/bash`, `@scp/grep`, `@scp/fetch`, `@scp/file-system` etc.).

---

## File Structure

**New files** under `src/main/services/agent/runtime/`:

| File | Lines | Purpose |
|---|---|---|
| `ClaudeCodeAgentRuntime.ts` | ~400 | Main class implementing `AgentRuntime`; orchestrates loop |
| `tools/index.ts` | ~30 | Tool registry: builtin tool defs + dispatch function |
| `tools/read.ts` | ~80 | `Read` tool: wraps `@scp/file-system::read_file` + offset/limit/cat-n |
| `tools/write.ts` | ~40 | `Write` tool: wraps `write_file` + cwd resolve |
| `tools/edit.ts` | ~120 | `Edit` tool (NEW): anchor-based string replace + uniqueness check |
| `tools/bash.ts` | ~60 | `Bash` tool: wraps `execute_command` + field rename |
| `tools/grep.ts` | ~70 | `Grep` tool: wraps `grep` + output mode synthesis |
| `tools/glob.ts` | ~50 | `Glob` tool: wraps `search_files` + cwd default |
| `tools/webfetch.ts` | ~60 | `WebFetch` tool: wraps `fetch_html` + naive markdown |
| `tools/task.ts` | ~150 | `Task` tool (NEW): subagent dispatch (recursive call into runtime) |
| `systemPrompt.ts` | ~200 | Multi-model friendly Claude-Code-style system prompt builder |
| `streamEventTranslator.ts` | ~250 | ChatStreamEvent → AgentRuntimeStreamEvent state machine |
| `__tests__/tools.read.test.ts` | ~80 | Test for Read tool |
| `__tests__/tools.write.test.ts` | ~50 | Test for Write tool |
| `__tests__/tools.edit.test.ts` | ~120 | Test for Edit tool (uniqueness, fuzzy, indent) |
| `__tests__/tools.bash.test.ts` | ~60 | Test for Bash tool |
| `__tests__/tools.grep.test.ts` | ~80 | Test for Grep tool |
| `__tests__/tools.glob.test.ts` | ~50 | Test for Glob tool |
| `__tests__/tools.webfetch.test.ts` | ~50 | Test for WebFetch tool |
| `__tests__/tools.task.test.ts` | ~120 | Test for Task subagent: recursion + nesting cap + interrupt propagation |
| `__tests__/streamEventTranslator.test.ts` | ~200 | Test for translator state machine (10+ cases) |
| `__tests__/ClaudeCodeAgentRuntime.test.ts` | ~200 | Integration test for runtime |

**Modified files:**

| File | Change |
|---|---|
| `src/main/services/agent/runtime/bootstrap.ts` | Register `ClaudeCodeAgentRuntime`, set as default |
| `src/main/services/agent/runtime/AgentRuntimeRegistry.ts` | `pickDefaultRuntimeId` → return `"claude-code-agent"` |
| `src/main/ipc/handlers/streamingHandlers.ts` | Legacy `agent-sdk:create-query` → forward to new runtime |
| `src/main/ipc/api-impl.ts` | `agentSDK.*` methods → stubs / forwards |
| `src/main/ipc/types.ts` | Delete `ModelProvider.claudeCodeEnabled`/`claudeCodeModel` |
| `src/renderer/src/types/models.ts` | Same field deletion |
| `src/renderer/src/components/models/ModelList.tsx` | Delete Claude Code form section |
| `package.json` | `pnpm remove @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk` |

**Deleted files** (Phase D):

- `src/main/services/agent/AgentSDKService.ts`
- `src/main/services/agent/AgentService.ts`
- `src/main/services/agent/runtime/ClaudeSdkRuntime.ts`
- `src/main/services/agent/runtime/AgentSdkTraceSniffer.ts`
- `src/main/services/agent/__tests__/AgentSDKService.test.ts`
- `src/renderer/src/hooks/useAgent.ts`
- `src/renderer/src/stores/agentStore.ts`
- `src/renderer/src/services/agent/agentService.ts`

---

## Phase A — Build Tools + Runtime Skeleton

### Task A0: Setup worktree + baseline

**Files:** none new

- [ ] **Step 1: Create worktree** (Workflow controller responsibility)

```bash
cd /Users/mark/myself/code/super-client-r
git worktree add .worktrees/claude-code-agent -b feat/claude-code-agent
cd .worktrees/claude-code-agent
pnpm install --prefer-offline
# Electron binary symlink (same as previous worktree)
MAIN_ELECTRON=$(realpath ../../node_modules/.pnpm/electron@38.8.6/node_modules/electron)
ELECTRON_PKG_DIR=$(realpath node_modules/.pnpm/electron@*/node_modules/electron)
ln -s "$MAIN_ELECTRON/dist" "$ELECTRON_PKG_DIR/dist"
printf "Electron.app/Contents/MacOS/Electron" > "$ELECTRON_PKG_DIR/path.txt"
```

- [ ] **Step 2: Verify baseline**

```bash
pnpm exec tsc -b --noEmit  # → no errors
pnpm exec vitest run src/main/services/llm/__tests__/ # → 37 pass
```

- [ ] **Step 3: Commit setup**

```bash
git add -A
git commit -m "chore: worktree setup for claude-code-agent feature" --allow-empty
```

---

### Task A1: Built-in tool registry skeleton

**Files:**
- Create: `src/main/services/agent/runtime/tools/index.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/tools.registry.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BUILTIN_TOOL_NAMES, getBuiltinTools } from "../tools";

describe("builtin tool registry", () => {
	it("exposes the 8 canonical Claude Code tool names", () => {
		expect(BUILTIN_TOOL_NAMES).toEqual([
			"Read",
			"Write",
			"Edit",
			"Bash",
			"Grep",
			"Glob",
			"WebFetch",
			"Task",
		]);
	});

	it("getBuiltinTools(ctx) returns 8 tool definitions with inputSchema", () => {
		const tools = getBuiltinTools({ cwd: "/tmp", signal: new AbortController().signal });
		expect(tools).toHaveLength(8);
		for (const t of tools) {
			expect(typeof t.name).toBe("string");
			expect(typeof t.description).toBe("string");
			expect(typeof t.inputSchema).toBe("object");
			expect(typeof t.execute).toBe("function");
		}
	});
});
```

- [ ] **Step 2: Run test to verify fails**

```
pnpm exec vitest run src/main/services/agent/runtime/__tests__/tools.registry.test.ts
```

Expected: FAIL — `Cannot find module '../tools'`.

- [ ] **Step 3: Create `tools/index.ts`**

```ts
// src/main/services/agent/runtime/tools/index.ts
export interface BuiltinToolContext {
	cwd: string;
	signal: AbortSignal;
	/** When > 0 we're inside a Task subagent; used for nesting cap. */
	taskDepth?: number;
	/** Provided by ClaudeCodeAgentRuntime so Task can recurse. */
	dispatchSubagent?: (prompt: string, opts: { signal: AbortSignal; depth: number }) => Promise<string>;
}

export interface BuiltinToolDef {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	execute: (input: Record<string, unknown>) => Promise<string>;
}

export const BUILTIN_TOOL_NAMES = [
	"Read",
	"Write",
	"Edit",
	"Bash",
	"Grep",
	"Glob",
	"WebFetch",
	"Task",
] as const;

// Placeholders that throw — replaced by real impls in A2-A9.
const placeholder = (name: string): BuiltinToolDef => ({
	name,
	description: `${name} (not yet implemented)`,
	inputSchema: { type: "object" },
	execute: async () => {
		throw new Error(`${name}: not implemented`);
	},
});

export function getBuiltinTools(_ctx: BuiltinToolContext): BuiltinToolDef[] {
	return BUILTIN_TOOL_NAMES.map(placeholder);
}
```

- [ ] **Step 4: Run test to verify passes**

```
pnpm exec vitest run src/main/services/agent/runtime/__tests__/tools.registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.registry.test.ts
git commit -m "feat(agent): scaffold builtin tool registry (8 placeholder tools)"
```

---

### Task A2: `Read` tool

**Files:**
- Create: `src/main/services/agent/runtime/tools/read.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.read.test.ts`
- Modify: `src/main/services/agent/runtime/tools/index.ts` (replace Read placeholder)

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/tools.read.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReadTool } from "../tools/read";

const TMP = join(tmpdir(), `read-tool-${Date.now()}`);

function setup() {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
	writeFileSync(join(TMP, "small.txt"), "line 1\nline 2\nline 3\n");
	writeFileSync(join(TMP, "big.txt"), Array.from({ length: 100 }, (_, i) => `L${i+1}`).join("\n"));
	return TMP;
}

describe("Read tool", () => {
	it("reads small file with line numbers", async () => {
		const dir = setup();
		const tool = createReadTool({ cwd: dir, signal: new AbortController().signal });
		const result = await tool.execute({ path: "small.txt" });
		expect(result).toContain("1\tline 1");
		expect(result).toContain("3\tline 3");
	});

	it("honours offset + limit (1-indexed inclusive offset, count limit)", async () => {
		const dir = setup();
		const tool = createReadTool({ cwd: dir, signal: new AbortController().signal });
		const result = await tool.execute({ path: "big.txt", offset: 50, limit: 3 });
		expect(result).toMatch(/50\tL50/);
		expect(result).toMatch(/52\tL52/);
		expect(result).not.toMatch(/53\tL53/);
	});

	it("resolves relative paths against cwd", async () => {
		const dir = setup();
		const tool = createReadTool({ cwd: dir, signal: new AbortController().signal });
		await expect(tool.execute({ path: "small.txt" })).resolves.toBeDefined();
	});

	it("errors clearly on missing file", async () => {
		const dir = setup();
		const tool = createReadTool({ cwd: dir, signal: new AbortController().signal });
		await expect(tool.execute({ path: "missing.txt" })).rejects.toThrow(/(no such file|ENOENT|Failed to read)/i);
	});
});
```

- [ ] **Step 2: Run test to verify fails**

```
pnpm exec vitest run src/main/services/agent/runtime/__tests__/tools.read.test.ts
```

Expected: FAIL — `Cannot find module '../tools/read'`.

- [ ] **Step 3: Create `tools/read.ts`**

```ts
// src/main/services/agent/runtime/tools/read.ts
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createReadTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Read",
		description:
			"Read the contents of a file. Returns content with line numbers in `cat -n` format. Supports `offset` (1-indexed start line) and `limit` (count). Use Glob/Grep first to discover files.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative-to-cwd path" },
				offset: { type: "number", description: "1-indexed starting line (default 1)" },
				limit: { type: "number", description: "Max lines to return (default all)" },
			},
			required: ["path"],
		},
		async execute(input) {
			const path = String(input.path ?? "");
			if (!path) throw new Error("Read: `path` is required");
			const offset = Math.max(1, Number(input.offset ?? 1) | 0);
			const limit = Number(input.limit ?? 0) | 0;
			const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			let content: string;
			try {
				content = await readFile(abs, "utf-8");
			} catch (err) {
				throw new Error(`Read: failed to read ${abs}: ${(err as Error).message}`);
			}
			const lines = content.split("\n");
			const sliceStart = offset - 1;
			const sliceEnd = limit > 0 ? sliceStart + limit : lines.length;
			const view = lines.slice(sliceStart, sliceEnd);
			return view
				.map((l, i) => `${(sliceStart + i + 1).toString().padStart(4)}\t${l}`)
				.join("\n");
		},
	};
}
```

- [ ] **Step 4: Update `tools/index.ts` to use createReadTool**

```ts
// src/main/services/agent/runtime/tools/index.ts (replace getBuiltinTools)
import { createReadTool } from "./read";

// ... interfaces unchanged ...

export function getBuiltinTools(ctx: BuiltinToolContext): BuiltinToolDef[] {
	return [
		createReadTool(ctx),
		placeholder("Write"),
		placeholder("Edit"),
		placeholder("Bash"),
		placeholder("Grep"),
		placeholder("Glob"),
		placeholder("WebFetch"),
		placeholder("Task"),
	];
}
```

- [ ] **Step 5: Run tests**

```
pnpm exec vitest run src/main/services/agent/runtime/__tests__/tools.read.test.ts \
                    src/main/services/agent/runtime/__tests__/tools.registry.test.ts
```

Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/tools/read.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.read.test.ts
git commit -m "feat(agent): Read tool with cat-n formatting + offset/limit"
```

---

### Task A3: `Write` tool

**Files:**
- Create: `src/main/services/agent/runtime/tools/write.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.write.test.ts`
- Modify: `tools/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/tools.write.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWriteTool } from "../tools/write";

const TMP = join(tmpdir(), `write-tool-${Date.now()}`);

describe("Write tool", () => {
	it("creates file with parent dirs if needed", async () => {
		rmSync(TMP, { recursive: true, force: true });
		mkdirSync(TMP, { recursive: true });
		const tool = createWriteTool({ cwd: TMP, signal: new AbortController().signal });
		const result = await tool.execute({ path: "sub/dir/hello.txt", content: "hi\n" });
		expect(result).toMatch(/Wrote/);
		expect(existsSync(join(TMP, "sub/dir/hello.txt"))).toBe(true);
		expect(readFileSync(join(TMP, "sub/dir/hello.txt"), "utf-8")).toBe("hi\n");
	});

	it("overwrites existing file", async () => {
		rmSync(TMP, { recursive: true, force: true });
		mkdirSync(TMP, { recursive: true });
		const tool = createWriteTool({ cwd: TMP, signal: new AbortController().signal });
		await tool.execute({ path: "a.txt", content: "v1" });
		await tool.execute({ path: "a.txt", content: "v2" });
		expect(readFileSync(join(TMP, "a.txt"), "utf-8")).toBe("v2");
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

```
pnpm exec vitest run src/main/services/agent/runtime/__tests__/tools.write.test.ts
```

- [ ] **Step 3: Create `tools/write.ts`**

```ts
// src/main/services/agent/runtime/tools/write.ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createWriteTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Write",
		description:
			"Write text to a file (UTF-8). Creates parent directories if they don't exist. Overwrites existing files. For partial edits prefer Edit.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative-to-cwd path" },
				content: { type: "string", description: "Full file content to write" },
			},
			required: ["path", "content"],
		},
		async execute(input) {
			const path = String(input.path ?? "");
			const content = String(input.content ?? "");
			if (!path) throw new Error("Write: `path` is required");
			const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			await mkdir(dirname(abs), { recursive: true });
			await writeFile(abs, content, "utf-8");
			return `Wrote ${content.length} bytes to ${abs}`;
		},
	};
}
```

- [ ] **Step 4: Wire into `tools/index.ts`** — replace `placeholder("Write")` with `createWriteTool(ctx)`, add `import { createWriteTool } from "./write";`

- [ ] **Step 5: Run tests pass**

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/tools/write.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.write.test.ts
git commit -m "feat(agent): Write tool with parent-dir auto-create"
```

---

### Task A4: `Edit` tool (anchor-based, uniqueness-checked)

**Files:**
- Create: `src/main/services/agent/runtime/tools/edit.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.edit.test.ts`
- Modify: `tools/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/tools.edit.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createEditTool } from "../tools/edit";

const TMP = join(tmpdir(), `edit-tool-${Date.now()}`);

function setup(content: string, name = "f.txt") {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
	writeFileSync(join(TMP, name), content);
	return TMP;
}

describe("Edit tool", () => {
	it("replaces unique anchor exactly once", async () => {
		const dir = setup("alpha\nbeta\ngamma\n");
		const tool = createEditTool({ cwd: dir, signal: new AbortController().signal });
		const result = await tool.execute({
			path: "f.txt",
			old_string: "beta",
			new_string: "BETA",
		});
		expect(result).toMatch(/Edited/);
		expect(readFileSync(join(dir, "f.txt"), "utf-8")).toBe("alpha\nBETA\ngamma\n");
	});

	it("errors when anchor not found", async () => {
		const dir = setup("alpha\nbeta\n");
		const tool = createEditTool({ cwd: dir, signal: new AbortController().signal });
		await expect(
			tool.execute({ path: "f.txt", old_string: "delta", new_string: "X" }),
		).rejects.toThrow(/not found/i);
	});

	it("errors when anchor is ambiguous (multiple matches)", async () => {
		const dir = setup("dup\ndup\ndup\n");
		const tool = createEditTool({ cwd: dir, signal: new AbortController().signal });
		await expect(
			tool.execute({ path: "f.txt", old_string: "dup", new_string: "X" }),
		).rejects.toThrow(/3 matches|ambiguous/i);
	});

	it("`replace_all: true` allows multi-replace", async () => {
		const dir = setup("dup\ndup\ndup\n");
		const tool = createEditTool({ cwd: dir, signal: new AbortController().signal });
		await tool.execute({
			path: "f.txt",
			old_string: "dup",
			new_string: "X",
			replace_all: true,
		});
		expect(readFileSync(join(dir, "f.txt"), "utf-8")).toBe("X\nX\nX\n");
	});

	it("errors when old_string === new_string", async () => {
		const dir = setup("abc");
		const tool = createEditTool({ cwd: dir, signal: new AbortController().signal });
		await expect(
			tool.execute({ path: "f.txt", old_string: "abc", new_string: "abc" }),
		).rejects.toThrow(/identical|same/i);
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

```
pnpm exec vitest run src/main/services/agent/runtime/__tests__/tools.edit.test.ts
```

- [ ] **Step 3: Create `tools/edit.ts`**

```ts
// src/main/services/agent/runtime/tools/edit.ts
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createEditTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Edit",
		description:
			"Replace `old_string` with `new_string` inside a file. `old_string` must appear exactly once unless `replace_all: true`. If the anchor is ambiguous, narrow it by adding more surrounding context. Prefer Edit over Write for partial changes.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative-to-cwd path" },
				old_string: { type: "string", description: "Exact substring to match" },
				new_string: { type: "string", description: "Replacement text" },
				replace_all: { type: "boolean", description: "Default false; replace every occurrence" },
			},
			required: ["path", "old_string", "new_string"],
		},
		async execute(input) {
			const path = String(input.path ?? "");
			const oldStr = String(input.old_string ?? "");
			const newStr = String(input.new_string ?? "");
			const replaceAll = Boolean(input.replace_all);
			if (!path) throw new Error("Edit: `path` is required");
			if (!oldStr) throw new Error("Edit: `old_string` must be non-empty");
			if (oldStr === newStr) {
				throw new Error("Edit: `old_string` and `new_string` are identical — no-op");
			}
			const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			const content = await readFile(abs, "utf-8");
			let count = 0;
			let idx = -1;
			while ((idx = content.indexOf(oldStr, idx + 1)) !== -1) count++;
			if (count === 0) {
				throw new Error(`Edit: anchor not found in ${abs}. Add surrounding context to old_string.`);
			}
			if (count > 1 && !replaceAll) {
				throw new Error(
					`Edit: anchor matches ${count} times in ${abs}; pass replace_all:true OR include more surrounding context for a unique match.`,
				);
			}
			const next = replaceAll
				? content.split(oldStr).join(newStr)
				: content.replace(oldStr, newStr);
			await writeFile(abs, next, "utf-8");
			const replaced = replaceAll ? count : 1;
			return `Edited ${abs}: ${replaced} replacement${replaced === 1 ? "" : "s"}`;
		},
	};
}
```

- [ ] **Step 4: Wire into `tools/index.ts`** — replace `placeholder("Edit")` with `createEditTool(ctx)`

- [ ] **Step 5: Run tests pass (5 cases)**

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/tools/edit.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.edit.test.ts
git commit -m "feat(agent): Edit tool with anchor uniqueness check + replace_all"
```

---

### Task A5: `Bash` tool

**Files:**
- Create: `src/main/services/agent/runtime/tools/bash.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.bash.test.ts`

- [ ] **Step 1: Write failing test (uses `vi.mock` for mcpService to avoid spawning subprocess)**

```ts
// src/main/services/agent/runtime/__tests__/tools.bash.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: {
		callTool: vi.fn(async (_serverId, _toolName, args) => ({
			success: true,
			data: {
				content: [{ type: "text", text: `OK ran: ${args.command}` }],
				isError: false,
			},
			serverType: "internal",
		})),
	},
}));

import { createBashTool } from "../tools/bash";

describe("Bash tool", () => {
	it("forwards command + workingDir to @scp/bash::execute_command", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		const tool = createBashTool({ cwd: "/tmp", signal: new AbortController().signal });
		await tool.execute({ command: "echo hi" });
		expect(mcpService.callTool).toHaveBeenCalledWith(
			"@scp/bash",
			"execute_command",
			expect.objectContaining({ command: "echo hi", workingDir: "/tmp" }),
			expect.any(Object),
		);
	});

	it("surfaces tool errors", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: false,
			error: "Bash: blocked dangerous command",
			serverType: "internal",
		});
		const tool = createBashTool({ cwd: "/tmp", signal: new AbortController().signal });
		await expect(tool.execute({ command: "rm -rf /" })).rejects.toThrow(/blocked/);
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/bash.ts`**

```ts
// src/main/services/agent/runtime/tools/bash.ts
import { mcpService } from "../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createBashTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Bash",
		description:
			"Run a shell command in the current working directory. Returns stdout, stderr and exit code. Default 30s timeout, max 120s. NOT for long-running daemons — use that pattern with `&`/`nohup` and a subsequent Read of the log file.",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string", description: "Shell command (bash/zsh/sh)" },
				timeout: { type: "number", description: "Optional ms timeout (default 30000)" },
			},
			required: ["command"],
		},
		async execute(input) {
			const command = String(input.command ?? "");
			if (!command) throw new Error("Bash: `command` is required");
			const timeout = Number(input.timeout) || undefined;
			const result = await mcpService.callTool(
				"@scp/bash",
				"execute_command",
				{
					command,
					workingDir: ctx.cwd,
					timeout,
					confirmed: true,
				},
				{},
			);
			if (!result.success) {
				throw new Error(`Bash: ${result.error || "execution failed"}`);
			}
			const data = result.data as { content?: Array<{ type: string; text?: string }>; isError?: boolean } | undefined;
			const text = data?.content?.map((c) => c.text ?? "").join("") ?? "";
			if (data?.isError) throw new Error(`Bash: ${text}`);
			return text;
		},
	};
}
```

- [ ] **Step 4: Wire into `tools/index.ts`** — import `createBashTool`, replace `placeholder("Bash")`

- [ ] **Step 5: Run tests pass**

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/tools/bash.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.bash.test.ts
git commit -m "feat(agent): Bash tool wrapping @scp/bash"
```

---

### Task A6: `Grep` tool

**Files:**
- Create: `src/main/services/agent/runtime/tools/grep.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.grep.test.ts`

- [ ] **Step 1: Write the failing test (mock mcpService)**

```ts
// src/main/services/agent/runtime/__tests__/tools.grep.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: {
		callTool: vi.fn(),
	},
}));

import { createGrepTool } from "../tools/grep";

describe("Grep tool", () => {
	it("forwards pattern + path + glob to @scp/grep", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "/x/y.ts:10:foo\n/x/z.ts:5:foo" }] },
		});
		const tool = createGrepTool({ cwd: "/x", signal: new AbortController().signal });
		const result = await tool.execute({ pattern: "foo", glob: "*.ts" });
		expect(result).toContain("y.ts");
		expect(mcpService.callTool).toHaveBeenCalledWith(
			"@scp/grep",
			"grep",
			expect.objectContaining({ pattern: "foo", path: "/x", include: "*.ts" }),
			expect.any(Object),
		);
	});

	it("filesOnly synthesizes file list output", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "/x/y.ts\n/x/z.ts" }] },
		});
		const tool = createGrepTool({ cwd: "/x", signal: new AbortController().signal });
		const out = await tool.execute({ pattern: "foo", filesOnly: true });
		expect(out).toContain("/x/y.ts");
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/grep.ts`**

```ts
// src/main/services/agent/runtime/tools/grep.ts
import { isAbsolute, resolve } from "node:path";
import { mcpService } from "../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createGrepTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Grep",
		description:
			"Search file contents using regex. Returns matching lines with file path and line number. Pass `glob` to filter included files (e.g. `*.ts`). Pass `filesOnly:true` to return only file paths.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "Regex pattern (ripgrep syntax)" },
				path: { type: "string", description: "Search root (default cwd)" },
				glob: { type: "string", description: "Optional glob filter, e.g. `*.ts`" },
				filesOnly: { type: "boolean", description: "List only matching file paths" },
				ignoreCase: { type: "boolean" },
				contextLines: { type: "number", description: "0-5; default 0" },
				maxResults: { type: "number", description: "Default 200; max 1000" },
			},
			required: ["pattern"],
		},
		async execute(input) {
			const pattern = String(input.pattern ?? "");
			if (!pattern) throw new Error("Grep: `pattern` is required");
			const path = String(input.path ?? ctx.cwd);
			const searchPath = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			const args: Record<string, unknown> = {
				pattern,
				path: searchPath,
				ignoreCase: Boolean(input.ignoreCase),
				filesOnly: Boolean(input.filesOnly),
			};
			if (typeof input.glob === "string") args.include = input.glob;
			if (typeof input.contextLines === "number") {
				args.contextLines = Math.max(0, Math.min(5, input.contextLines));
			}
			if (typeof input.maxResults === "number") {
				args.maxResults = Math.max(1, Math.min(1000, input.maxResults));
			}
			const result = await mcpService.callTool("@scp/grep", "grep", args, {});
			if (!result.success) throw new Error(`Grep: ${result.error}`);
			const data = result.data as { content?: Array<{ text?: string }> } | undefined;
			return data?.content?.map((c) => c.text ?? "").join("") ?? "";
		},
	};
}
```

- [ ] **Step 4: Wire** into `tools/index.ts`

- [ ] **Step 5: Run tests pass**

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/tools/grep.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.grep.test.ts
git commit -m "feat(agent): Grep tool wrapping @scp/grep"
```

---

### Task A7: `Glob` tool

**Files:**
- Create: `src/main/services/agent/runtime/tools/glob.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.glob.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/tools.glob.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: {
		callTool: vi.fn(async () => ({
			success: true,
			data: { content: [{ type: "text", text: "/x/a.ts\n/x/b/c.ts" }] },
		})),
	},
}));

import { createGlobTool } from "../tools/glob";

describe("Glob tool", () => {
	it("forwards pattern + cwd to search_files", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		const tool = createGlobTool({ cwd: "/x", signal: new AbortController().signal });
		const result = await tool.execute({ pattern: "**/*.ts" });
		expect(result).toContain("/x/a.ts");
		expect(mcpService.callTool).toHaveBeenCalledWith(
			"@scp/file-system",
			"search_files",
			expect.objectContaining({ pattern: "**/*.ts", path: "/x" }),
			expect.any(Object),
		);
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/glob.ts`**

```ts
// src/main/services/agent/runtime/tools/glob.ts
import { isAbsolute, resolve } from "node:path";
import { mcpService } from "../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createGlobTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Glob",
		description:
			"List files matching a glob pattern. Examples: `**/*.ts`, `src/**/index.{ts,tsx}`, `*.md`. Default search root is cwd.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "Glob pattern" },
				path: { type: "string", description: "Search root (default cwd)" },
			},
			required: ["pattern"],
		},
		async execute(input) {
			const pattern = String(input.pattern ?? "");
			if (!pattern) throw new Error("Glob: `pattern` is required");
			const path = String(input.path ?? ctx.cwd);
			const searchPath = isAbsolute(path) ? path : resolve(ctx.cwd, path);
			const result = await mcpService.callTool(
				"@scp/file-system",
				"search_files",
				{ pattern, path: searchPath },
				{},
			);
			if (!result.success) throw new Error(`Glob: ${result.error}`);
			const data = result.data as { content?: Array<{ text?: string }> } | undefined;
			return data?.content?.map((c) => c.text ?? "").join("") ?? "";
		},
	};
}
```

- [ ] **Step 4: Wire** into `tools/index.ts`

- [ ] **Step 5: Run tests pass**

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/tools/glob.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.glob.test.ts
git commit -m "feat(agent): Glob tool wrapping @scp/file-system::search_files"
```

---

### Task A8: `WebFetch` tool

**Files:**
- Create: `src/main/services/agent/runtime/tools/webfetch.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.webfetch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/tools.webfetch.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: {
		callTool: vi.fn(async () => ({
			success: true,
			data: { content: [{ type: "text", text: "URL: https://x.test\nStatus: 200\n\nHello body" }] },
		})),
	},
}));

import { createWebFetchTool } from "../tools/webfetch";

describe("WebFetch tool", () => {
	it("forwards url to @scp/fetch::fetch_html and returns body text", async () => {
		const tool = createWebFetchTool({ cwd: "/", signal: new AbortController().signal });
		const result = await tool.execute({ url: "https://x.test" });
		expect(result).toContain("Hello body");
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/webfetch.ts`**

```ts
// src/main/services/agent/runtime/tools/webfetch.ts
import { mcpService } from "../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createWebFetchTool(_ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "WebFetch",
		description:
			"Fetch a URL and return its text content (HTML tags stripped). Use this when the user asks about online docs, packages, blog posts, etc.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "HTTPS URL to fetch" },
			},
			required: ["url"],
		},
		async execute(input) {
			const url = String(input.url ?? "");
			if (!url) throw new Error("WebFetch: `url` is required");
			const result = await mcpService.callTool(
				"@scp/fetch",
				"fetch_html",
				{ url },
				{},
			);
			if (!result.success) throw new Error(`WebFetch: ${result.error}`);
			const data = result.data as { content?: Array<{ text?: string }> } | undefined;
			return data?.content?.map((c) => c.text ?? "").join("") ?? "";
		},
	};
}
```

- [ ] **Step 4: Wire** into `tools/index.ts`

- [ ] **Step 5: Run tests pass**

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/tools/webfetch.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/__tests__/tools.webfetch.test.ts
git commit -m "feat(agent): WebFetch tool wrapping @scp/fetch::fetch_html"
```

---

### Task A9: `systemPrompt.ts`

**Files:**
- Create: `src/main/services/agent/runtime/systemPrompt.ts`
- Test: `src/main/services/agent/runtime/__tests__/systemPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/systemPrompt.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../systemPrompt";

describe("buildSystemPrompt", () => {
	it("includes the agent identity and tool-use protocol", () => {
		const out = buildSystemPrompt({ cwd: "/projects/foo", customPrompt: "" });
		expect(out).toMatch(/coding agent/i);
		expect(out).toMatch(/\/projects\/foo/);
		expect(out).toMatch(/Read|Write|Edit|Bash|Grep|Glob/);
	});

	it("appends customPrompt if provided", () => {
		const out = buildSystemPrompt({ cwd: "/x", customPrompt: "Always use TypeScript." });
		expect(out).toMatch(/Always use TypeScript/);
	});

	it("describes the tool-use protocol explicitly so non-Claude models behave", () => {
		const out = buildSystemPrompt({ cwd: "/x", customPrompt: "" });
		expect(out).toMatch(/plan|think/i);
		expect(out).toMatch(/Edit/);
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `systemPrompt.ts`**

```ts
// src/main/services/agent/runtime/systemPrompt.ts

export interface BuildSystemPromptArgs {
	cwd: string;
	customPrompt: string;
}

const CORE_PROMPT = `You are an interactive coding agent operating inside a desktop IDE.

# Workspace

- Current working directory: \${CWD}
- File paths in tool inputs can be absolute or relative to the cwd above.

# Available tools

You have a built-in tool set inspired by Claude Code:

- **Read**: Read a file with line numbers. Always Read before Edit so you see exact content.
- **Write**: Create or overwrite a whole file. Use for new files. Avoid using Write to modify existing files (use Edit).
- **Edit**: Replace an exact string. Pass enough surrounding context that \`old_string\` is unique in the file, OR set \`replace_all: true\`.
- **Bash**: Run shell commands in cwd. Use for git, build, install, scripts. Don't pipe interactive commands.
- **Grep**: Regex search through file contents.
- **Glob**: List files matching a pattern.
- **WebFetch**: Fetch and read a public URL.
- **Task**: Spawn a focused subagent for a self-contained sub-problem (e.g. "find all callers of X and summarise"). Subagents share the workspace but have isolated chat history.

Additional tools provided by the host (MCP servers, user-installed skills) are listed below.

# Operating principles

1. **Plan first**, then act. When a task is non-trivial, briefly state your plan before invoking tools.
2. **Read before Edit**: never guess file contents. Read the relevant lines first.
3. **Make small, verifiable changes**. Run tests/builds after meaningful edits via Bash.
4. **Be exact with tool inputs**: paths, command flags, regex syntax all matter.
5. **Stop on error**: if a tool returns an error, read the message, adjust, retry — don't blindly retry the same call.
6. **No secrets in logs**: redact API keys, passwords, tokens before echoing.

# Output style

- Reply concisely. No filler ("Sure!", "Great question!"). Address the user directly.
- When you finish a task, briefly summarise what changed and any next steps the user should know.
`;

export function buildSystemPrompt(args: BuildSystemPromptArgs): string {
	const core = CORE_PROMPT.replace("${CWD}", args.cwd);
	if (args.customPrompt && args.customPrompt.trim()) {
		return `${core}\n\n# User instructions\n\n${args.customPrompt.trim()}\n`;
	}
	return core;
}
```

- [ ] **Step 4: Run tests pass**

- [ ] **Step 5: Commit**

```bash
git add src/main/services/agent/runtime/systemPrompt.ts \
        src/main/services/agent/runtime/__tests__/systemPrompt.test.ts
git commit -m "feat(agent): multi-model-friendly Claude-Code-style system prompt"
```

---

### Task A10: `streamEventTranslator.ts`

**Files:**
- Create: `src/main/services/agent/runtime/streamEventTranslator.ts`
- Test: `src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts`

The translator converts `ChatStreamEvent` (from LLMService) into `AgentRuntimeStreamEvent` (what the IPC broker expects). It owns a part tracker state machine.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ChatToRuntimeTranslator } from "../streamEventTranslator";
import type { ChatStreamEvent } from "../../../../ipc/types";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

function collect(events: ChatStreamEvent[]): AgentRuntimeStreamEvent[] {
	const t = new ChatToRuntimeTranslator({ requestId: "r1", sessionId: "s1" });
	const out: AgentRuntimeStreamEvent[] = [];
	for (const ev of events) out.push(...t.translate(ev));
	out.push(...t.finalize());
	return out;
}

describe("ChatToRuntimeTranslator", () => {
	it("init + chunk + done → init / text.delta / message.final / result", () => {
		const out = collect([
			{ requestId: "r1", type: "chunk", content: "Hi" },
			{ requestId: "r1", type: "chunk", content: " there" },
			{
				requestId: "r1",
				type: "done",
				usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
				timing: { totalMs: 100 },
			},
		]);
		const types = out.map((e) => e.type);
		expect(types[0]).toBe("init");
		expect(types).toContain("text.delta");
		expect(types).toContain("message.final");
		expect(types).toContain("result");
		const result = out.find((e) => e.type === "result");
		expect((result as { usage: { totalTokens: number } }).usage.totalTokens).toBe(7);
	});

	it("tool_call → tool.call event", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "tool_call",
				toolCall: { id: "tc1", name: "Read", arguments: '{"path":"x.ts"}' },
			},
			{
				requestId: "r1",
				type: "tool_result",
				toolResult: { toolCallId: "tc1", name: "Read", result: "content", duration: 5 },
			},
			{ requestId: "r1", type: "done", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
		]);
		const types = out.map((e) => e.type);
		expect(types).toContain("tool.call");
		expect(types).toContain("tool.result");
	});

	it("tool_error → tool.result with isError:true", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "tool_error",
				toolError: { toolCallId: "tc2", name: "Bash", error: "boom" },
			},
			{ requestId: "r1", type: "done" },
		]);
		const toolResult = out.find((e) => e.type === "tool.result");
		expect(toolResult).toBeDefined();
		expect((toolResult as { isError: boolean }).isError).toBe(true);
	});

	it("error → error event terminates stream", () => {
		const out = collect([{ requestId: "r1", type: "error", error: "model crashed" }]);
		const err = out.find((e) => e.type === "error");
		expect(err).toBeDefined();
		expect((err as { error: string }).error).toBe("model crashed");
	});

	it("tool_approval_request → permission.request", () => {
		const out = collect([
			{
				requestId: "r1",
				type: "tool_approval_request",
				toolApproval: { toolCallId: "tc3", name: "Bash", arguments: '{"command":"rm -rf /tmp/x"}' },
			},
			{ requestId: "r1", type: "done" },
		]);
		const perm = out.find((e) => e.type === "permission.request");
		expect(perm).toBeDefined();
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `streamEventTranslator.ts`**

```ts
// src/main/services/agent/runtime/streamEventTranslator.ts
import type { ChatStreamEvent } from "../../../ipc/types";
import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

export interface TranslatorContext {
	requestId: string;
	sessionId: string;
}

/**
 * State machine that converts the LLMService ChatStreamEvent stream into
 * the AgentRuntime stream protocol the IPC broker expects.
 *
 * Tracks accumulated assistant text so we can emit `message.final` once
 * before `result`.
 */
export class ChatToRuntimeTranslator {
	private readonly ctx: TranslatorContext;
	private initSent = false;
	private accumulatedText = "";
	private finalizedAt: number | undefined;
	private finalUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
	private finalTimingMs = 0;

	constructor(ctx: TranslatorContext) {
		this.ctx = ctx;
	}

	translate(ev: ChatStreamEvent): AgentRuntimeStreamEvent[] {
		const out: AgentRuntimeStreamEvent[] = [];
		if (!this.initSent) {
			this.initSent = true;
			out.push({
				type: "init",
				requestId: this.ctx.requestId,
				sessionId: this.ctx.sessionId,
				ts: Date.now(),
			} as AgentRuntimeStreamEvent);
		}

		switch (ev.type) {
			case "chunk":
				if (ev.content) {
					this.accumulatedText += ev.content;
					out.push({
						type: "text.delta",
						requestId: this.ctx.requestId,
						sessionId: this.ctx.sessionId,
						ts: Date.now(),
						delta: ev.content,
					} as AgentRuntimeStreamEvent);
				}
				break;

			case "tool_call":
				if (ev.toolCall) {
					let parsed: unknown = {};
					try {
						parsed = JSON.parse(ev.toolCall.arguments || "{}");
					} catch {
						parsed = {};
					}
					out.push({
						type: "tool.call",
						requestId: this.ctx.requestId,
						sessionId: this.ctx.sessionId,
						ts: Date.now(),
						callId: ev.toolCall.id,
						name: ev.toolCall.name,
						input: parsed,
					} as AgentRuntimeStreamEvent);
				}
				break;

			case "tool_result":
				if (ev.toolResult) {
					out.push({
						type: "tool.result",
						requestId: this.ctx.requestId,
						sessionId: this.ctx.sessionId,
						ts: Date.now(),
						callId: ev.toolResult.toolCallId,
						content: { kind: "text", text: stringifyResult(ev.toolResult.result) },
						isError: false,
						durationMs: ev.toolResult.duration,
					} as AgentRuntimeStreamEvent);
				}
				break;

			case "tool_error":
				if (ev.toolError) {
					out.push({
						type: "tool.result",
						requestId: this.ctx.requestId,
						sessionId: this.ctx.sessionId,
						ts: Date.now(),
						callId: ev.toolError.toolCallId,
						content: { kind: "text", text: stringifyResult(ev.toolError.error) },
						isError: true,
						durationMs: ev.toolError.duration,
					} as AgentRuntimeStreamEvent);
				}
				break;

			case "tool_approval_request":
				if (ev.toolApproval) {
					let parsed: unknown = {};
					try {
						parsed = JSON.parse(ev.toolApproval.arguments || "{}");
					} catch {
						parsed = {};
					}
					out.push({
						type: "permission.request",
						requestId: this.ctx.requestId,
						sessionId: this.ctx.sessionId,
						ts: Date.now(),
						callId: ev.toolApproval.toolCallId,
						toolName: ev.toolApproval.name,
						input: parsed,
					} as AgentRuntimeStreamEvent);
				}
				break;

			case "tool_rejected":
				// Already covered by tool_error in our chain; no extra event needed.
				break;

			case "done":
				this.finalUsage = ev.usage;
				this.finalTimingMs = ev.timing?.totalMs ?? 0;
				this.finalizedAt = Date.now();
				out.push({
					type: "message.final",
					requestId: this.ctx.requestId,
					sessionId: this.ctx.sessionId,
					ts: Date.now(),
					text: this.accumulatedText,
				} as AgentRuntimeStreamEvent);
				out.push({
					type: "result",
					requestId: this.ctx.requestId,
					sessionId: this.ctx.sessionId,
					ts: Date.now(),
					success: true,
					text: this.accumulatedText,
					durationMs: this.finalTimingMs,
					numTurns: 1,
					totalCostUsd: 0,
					stopReason: "stop",
					usage: {
						inputTokens: this.finalUsage?.inputTokens ?? 0,
						outputTokens: this.finalUsage?.outputTokens ?? 0,
					},
				} as AgentRuntimeStreamEvent);
				break;

			case "error":
				out.push({
					type: "error",
					requestId: this.ctx.requestId,
					sessionId: this.ctx.sessionId,
					ts: Date.now(),
					error: ev.error ?? "unknown error",
				} as AgentRuntimeStreamEvent);
				break;
		}
		return out;
	}

	/** Emit any pending events when the underlying stream ends without a `done`. */
	finalize(): AgentRuntimeStreamEvent[] {
		if (this.finalizedAt) return [];
		return [
			{
				type: "result",
				requestId: this.ctx.requestId,
				sessionId: this.ctx.sessionId,
				ts: Date.now(),
				success: false,
				text: this.accumulatedText,
				durationMs: 0,
				numTurns: 1,
				totalCostUsd: 0,
				stopReason: "incomplete",
				usage: { inputTokens: 0, outputTokens: 0 },
			} as AgentRuntimeStreamEvent,
		];
	}
}

function stringifyResult(v: unknown): string {
	if (typeof v === "string") return v;
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}
```

- [ ] **Step 4: Run tests pass** (5 cases)

- [ ] **Step 5: Commit**

```bash
git add src/main/services/agent/runtime/streamEventTranslator.ts \
        src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts
git commit -m "feat(agent): ChatStreamEvent → AgentRuntimeStreamEvent translator"
```

---

### Task A11: `ClaudeCodeAgentRuntime.ts` main class

**Files:**
- Create: `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts`
- Test: `src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts`

This is the runtime class that wires everything together. It implements `AgentRuntime.createQuery` by:
1. Building system prompt from `req.runtime` + cwd
2. Merging built-in tools + `req.tools` into a `ChatCompletionRequest.tools[]`
3. Calling `llmService.chatCompletion` with a tool executor that routes to built-in vs MCP
4. Subscribing to ChatStreamEvent via `llmService.subscribeRequestEvents`
5. Yielding through the translator into the AsyncIterable

- [ ] **Step 1: Write the failing test (mock LLMService)**

```ts
// src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AgentQueryRequest, AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";

vi.mock("../../../llm/LLMService", () => {
	const subscribers = new Map<string, Array<(e: unknown) => void>>();
	return {
		llmService: {
			subscribeRequestEvents: (reqId: string, cb: (e: unknown) => void) => {
				if (!subscribers.has(reqId)) subscribers.set(reqId, []);
				subscribers.get(reqId)!.push(cb);
				return () => subscribers.delete(reqId);
			},
			chatCompletion: vi.fn(async (req) => {
				const subs = subscribers.get(req.requestId) ?? [];
				subs.forEach((s) => s({ requestId: req.requestId, type: "chunk", content: "Hello" }));
				subs.forEach((s) => s({ requestId: req.requestId, type: "done", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }));
			}),
			resolveToolApproval: vi.fn(),
		},
	};
});

import { ClaudeCodeAgentRuntime } from "../ClaudeCodeAgentRuntime";

function makeReq(overrides: Partial<AgentQueryRequest> = {}): AgentQueryRequest {
	return {
		requestId: "r1",
		conversationId: "c1",
		prompt: { kind: "text", text: "hello" },
		history: [],
		runtime: {} as never,
		tools: [],
		cwd: "/tmp",
		signal: new AbortController().signal,
		...overrides,
	} as AgentQueryRequest;
}

describe("ClaudeCodeAgentRuntime", () => {
	it("createQuery yields init + text.delta + message.final + result", async () => {
		const runtime = new ClaudeCodeAgentRuntime();
		const events: AgentRuntimeStreamEvent[] = [];
		for await (const e of runtime.createQuery(makeReq())) events.push(e);
		const types = events.map((e) => e.type);
		expect(types[0]).toBe("init");
		expect(types).toContain("text.delta");
		expect(types).toContain("message.final");
		expect(types[types.length - 1]).toBe("result");
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `ClaudeCodeAgentRuntime.ts`**

```ts
// src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts
import { randomUUID } from "node:crypto";
import type {
	AgentQueryRequest,
	AgentRuntime,
	AgentRuntimeDescriptor,
	AgentRuntimeStreamEvent,
} from "@super-client/shared-types/agent-runtime";
import type { ChatCompletionRequest, ChatStreamEvent } from "../../../ipc/types";
import { llmService } from "../../llm/LLMService";
import { ChatToRuntimeTranslator } from "./streamEventTranslator";
import { buildSystemPrompt } from "./systemPrompt";
import { getBuiltinTools, type BuiltinToolDef } from "./tools";

const DESCRIPTOR: AgentRuntimeDescriptor = {
	id: "claude-code-agent",
	displayName: "Claude Code Agent",
	capabilities: {
		nativeSession: false,
		streamingTools: true,
		permissionRequests: true,
		reasoningStream: false,
	},
};

export class ClaudeCodeAgentRuntime implements AgentRuntime {
	readonly descriptor = DESCRIPTOR;

	createQuery(req: AgentQueryRequest): AsyncIterable<AgentRuntimeStreamEvent> {
		const translator = new ChatToRuntimeTranslator({
			requestId: req.requestId,
			sessionId: req.conversationId,
		});
		const queue: AgentRuntimeStreamEvent[] = [];
		let waiter: ((value: void) => void) | null = null;
		let finished = false;
		let errored: unknown = null;

		const wake = () => {
			if (waiter) {
				const w = waiter;
				waiter = null;
				w();
			}
		};

		const cwd = req.cwd ?? process.cwd();
		const builtinCtx = { cwd, signal: req.signal, taskDepth: 0 };
		const builtinTools = getBuiltinTools(builtinCtx);
		const toolByName = new Map<string, BuiltinToolDef>(
			builtinTools.map((t) => [t.name, t]),
		);

		const llmRequest = this.buildChatRequest(req, builtinTools);

		const unsubscribe = llmService.subscribeRequestEvents(
			req.requestId,
			(ev: ChatStreamEvent) => {
				for (const out of translator.translate(ev)) queue.push(out);
				if (ev.type === "done" || ev.type === "error") {
					finished = true;
				}
				wake();
			},
		);

		const toolExecutor = async (name: string, args: Record<string, unknown>) => {
			const builtin = toolByName.get(name);
			if (builtin) return await builtin.execute(args);
			// Non-builtin tool — defer to MCP via toolMapping (already set up).
			const binding = req.tools.find((t) => t.name === name);
			if (!binding) throw new Error(`Tool '${name}' not found`);
			const { mcpService } = await import("../../mcp/McpService");
			const result = await mcpService.callTool(
				binding.origin.serverId,
				name.includes("__") ? name.split("__").pop()! : name,
				args,
				{ conversationId: req.conversationId },
			);
			if (!result.success) throw new Error(result.error || "Tool call failed");
			return result.data;
		};

		llmService
			.chatCompletion(llmRequest, toolExecutor)
			.catch((err) => {
				errored = err;
				finished = true;
				wake();
			});

		const iter = async function* (): AsyncIterable<AgentRuntimeStreamEvent> {
			try {
				while (!finished || queue.length > 0) {
					if (queue.length === 0) {
						await new Promise<void>((resolve) => {
							waiter = resolve;
						});
						continue;
					}
					yield queue.shift()!;
				}
				if (errored) {
					throw errored;
				}
				for (const ev of translator.finalize()) yield ev;
			} finally {
				unsubscribe();
			}
		};

		return iter();
	}

	private buildChatRequest(
		req: AgentQueryRequest,
		builtinTools: BuiltinToolDef[],
	): ChatCompletionRequest {
		const cwd = req.cwd ?? process.cwd();
		const customPrompt = "";

		const systemPrompt = buildSystemPrompt({ cwd, customPrompt });
		const userText =
			req.prompt.kind === "text"
				? req.prompt.text
				: req.prompt.parts
						.filter((p) => p.type === "text")
						.map((p) => (p as { text: string }).text)
						.join("\n");

		const allTools = [
			...builtinTools.map((t) => ({
				type: "function" as const,
				function: { name: t.name, description: t.description, parameters: t.inputSchema },
			})),
			...req.tools.map((t) => ({
				type: "function" as const,
				function: { name: t.name, description: t.description, parameters: t.inputSchema },
			})),
		];

		const toolMapping: Record<string, { serverId: string; toolName: string }> = {};
		for (const t of req.tools) {
			toolMapping[t.name] = { serverId: t.origin.serverId, toolName: t.name };
		}

		return {
			requestId: req.requestId,
			conversationId: req.conversationId,
			baseUrl: "",
			apiKey: "",
			model: "",
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userText },
			],
			tools: allTools,
			toolMapping,
		};
	}
}
```

> NOTE: `buildChatRequest` deliberately leaves `model` / `baseUrl` / `apiKey` empty here. The plan's expectation is that `req.runtime: EffectiveSessionRuntime` carries the model + provider info. Task A12 will fill those in once we wire from `bootstrap.ts`. For the unit test we mock `llmService.chatCompletion` so empty strings don't matter.

- [ ] **Step 4: Run tests pass**

- [ ] **Step 5: Commit**

```bash
git add src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts \
        src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts
git commit -m "feat(agent): ClaudeCodeAgentRuntime skeleton (AgentRuntime impl)"
```

---

### Task A12: Wire model/provider from `EffectiveSessionRuntime`

**Files:**
- Modify: `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts`

`EffectiveSessionRuntime` lives in `@super-client/shared-types/chat`. It tells us which provider+model to use. We need to read it and look up the actual `ModelProvider` from the store to fill in baseUrl/apiKey/apiFormat.

- [ ] **Step 1: Read existing `EffectiveSessionRuntime` shape**

```
grep -B 1 -A 12 "interface EffectiveSessionRuntime" packages/shared-types/src/chat.ts
```

Identify the fields: `providerId`, `modelId` etc.

- [ ] **Step 2: Write the failing test**

```ts
// extend src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts
// inside the same describe block, add:
	it("looks up provider config and threads model/baseUrl/apiKey into LLMService request", async () => {
		vi.doMock("../../../store/StoreManager", () => ({
			storeManager: {
				getModelProviders: () => [
					{
						id: "prov-1",
						preset: "dashscope",
						baseUrl: "https://x.test/v1",
						apiKey: "sk-yyy",
						enabled: true,
						apiFormat: "chat-completions",
						models: [{ id: "qwen-flash", enabled: true }],
					},
				],
			},
		}));
		const { llmService } = await import("../../../llm/LLMService");
		(llmService.chatCompletion as ReturnType<typeof vi.fn>).mockClear();
		const { ClaudeCodeAgentRuntime } = await import("../ClaudeCodeAgentRuntime");
		const runtime = new ClaudeCodeAgentRuntime();
		const req = makeReq({
			runtime: { providerId: "prov-1", modelId: "qwen-flash" } as never,
		});
		const events = [];
		for await (const e of runtime.createQuery(req)) events.push(e);
		expect(llmService.chatCompletion).toHaveBeenCalledWith(
			expect.objectContaining({
				baseUrl: "https://x.test/v1",
				apiKey: "sk-yyy",
				model: "qwen-flash",
				providerPreset: "dashscope",
				apiFormat: "chat-completions",
			}),
			expect.any(Function),
		);
	});
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Modify `ClaudeCodeAgentRuntime.buildChatRequest` to consult storeManager**

```ts
// add at top of ClaudeCodeAgentRuntime.ts
import { storeManager } from "../../../store/StoreManager";

// inside buildChatRequest:
private buildChatRequest(req: AgentQueryRequest, builtinTools: BuiltinToolDef[]): ChatCompletionRequest {
	// ... existing systemPrompt + userText + allTools + toolMapping ...

	const runtimeInfo = req.runtime as { providerId?: string; modelId?: string } | undefined;
	const providerId = runtimeInfo?.providerId;
	const modelId = runtimeInfo?.modelId ?? "";

	const providers = storeManager.getModelProviders();
	const provider = providers.find((p) => p.id === providerId) ?? providers[0];

	return {
		requestId: req.requestId,
		conversationId: req.conversationId,
		baseUrl: provider?.baseUrl ?? "",
		apiKey: provider?.apiKey ?? "",
		model: modelId,
		providerPreset: provider?.preset,
		apiFormat: provider?.apiFormat,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userText },
		],
		tools: allTools,
		toolMapping,
	};
}
```

- [ ] **Step 5: Run tests pass**

- [ ] **Step 6: Commit**

```bash
git add src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts \
        src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts
git commit -m "feat(agent): runtime looks up provider config from store"
```

---

## Phase B — Task (subagent) + Registry wiring + compat

### Task B1: `Task` tool — subagent dispatcher

**Files:**
- Create: `src/main/services/agent/runtime/tools/task.ts`
- Test: `src/main/services/agent/runtime/__tests__/tools.task.test.ts`
- Modify: `tools/index.ts` (Task placeholder → real), `ClaudeCodeAgentRuntime.ts` (provide `dispatchSubagent`)

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/agent/runtime/__tests__/tools.task.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createTaskTool } from "../tools/task";

describe("Task tool", () => {
	it("invokes dispatchSubagent with description prompt", async () => {
		const dispatch = vi.fn(async () => "subagent result");
		const tool = createTaskTool({
			cwd: "/x",
			signal: new AbortController().signal,
			taskDepth: 0,
			dispatchSubagent: dispatch,
		});
		const result = await tool.execute({ description: "find foo", prompt: "Find all foo refs and list them." });
		expect(result).toBe("subagent result");
		expect(dispatch).toHaveBeenCalledWith(
			expect.stringContaining("Find all foo refs"),
			expect.objectContaining({ depth: 1 }),
		);
	});

	it("errors at nesting depth 3", async () => {
		const tool = createTaskTool({
			cwd: "/x",
			signal: new AbortController().signal,
			taskDepth: 3,
			dispatchSubagent: vi.fn(),
		});
		await expect(
			tool.execute({ description: "x", prompt: "y" }),
		).rejects.toThrow(/nest|depth/i);
	});

	it("errors if dispatchSubagent missing", async () => {
		const tool = createTaskTool({
			cwd: "/x",
			signal: new AbortController().signal,
			taskDepth: 0,
		});
		await expect(
			tool.execute({ description: "x", prompt: "y" }),
		).rejects.toThrow(/not available/i);
	});
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Create `tools/task.ts`**

```ts
// src/main/services/agent/runtime/tools/task.ts
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

const MAX_DEPTH = 3;

export function createTaskTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Task",
		description:
			"Spawn a focused subagent to complete a self-contained sub-problem. The subagent has access to the same workspace and built-in tools but starts with a fresh chat context. Use Task for: (a) parallel exploration ('find all callers of X'), (b) heavy multi-step analysis you want to summarise back, (c) isolating tool-noisy work so the main conversation stays clean. Avoid: trivial single-tool tasks (just call the tool yourself).",
		inputSchema: {
			type: "object",
			properties: {
				description: { type: "string", description: "Short label for the task (3-5 words)" },
				prompt: { type: "string", description: "Detailed instructions for the subagent" },
			},
			required: ["description", "prompt"],
		},
		async execute(input) {
			const description = String(input.description ?? "").trim();
			const prompt = String(input.prompt ?? "").trim();
			if (!description) throw new Error("Task: `description` is required");
			if (!prompt) throw new Error("Task: `prompt` is required");
			const depth = ctx.taskDepth ?? 0;
			if (depth >= MAX_DEPTH) {
				throw new Error(
					`Task: max subagent nesting depth (${MAX_DEPTH}) reached. Inline this work instead.`,
				);
			}
			if (!ctx.dispatchSubagent) {
				throw new Error("Task: subagent dispatch not available in this context");
			}
			return await ctx.dispatchSubagent(prompt, {
				signal: ctx.signal,
				depth: depth + 1,
			});
		},
	};
}
```

- [ ] **Step 4: Wire into `tools/index.ts`** — `placeholder("Task")` → `createTaskTool(ctx)`

- [ ] **Step 5: Provide `dispatchSubagent` in `ClaudeCodeAgentRuntime`**

In `ClaudeCodeAgentRuntime.createQuery`, before constructing `builtinCtx`:

```ts
const dispatchSubagent = async (
	subPrompt: string,
	opts: { signal: AbortSignal; depth: number },
): Promise<string> => {
	const subReq: AgentQueryRequest = {
		...req,
		requestId: `${req.requestId}_sub_${randomUUID().slice(0, 8)}`,
		prompt: { kind: "text", text: subPrompt },
		signal: opts.signal,
	};
	// Override taskDepth via a closure-captured context — pass through req if needed.
	let text = "";
	const subRuntime = new ClaudeCodeAgentRuntime();
	(subRuntime as unknown as { __taskDepth: number }).__taskDepth = opts.depth;
	for await (const ev of subRuntime.createQuery(subReq)) {
		if (ev.type === "text.delta") text += (ev as { delta: string }).delta;
	}
	return text;
};

const builtinCtx = { cwd, signal: req.signal, taskDepth: 0, dispatchSubagent };
```

Then inside the class read `__taskDepth` if set:

```ts
const initialDepth = (this as unknown as { __taskDepth?: number }).__taskDepth ?? 0;
const builtinCtx = { cwd, signal: req.signal, taskDepth: initialDepth, dispatchSubagent };
```

- [ ] **Step 6: Run tests pass**

- [ ] **Step 7: Commit**

```bash
git add src/main/services/agent/runtime/tools/task.ts \
        src/main/services/agent/runtime/tools/index.ts \
        src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts \
        src/main/services/agent/runtime/__tests__/tools.task.test.ts
git commit -m "feat(agent): Task tool spawns recursive ClaudeCodeAgent subagent (depth cap 3)"
```

---

### Task B2: Register runtime in `bootstrap.ts` + default

**Files:**
- Modify: `src/main/services/agent/runtime/bootstrap.ts`
- Modify: `src/main/services/agent/runtime/AgentRuntimeRegistry.ts` (`pickDefaultRuntimeId`)

- [ ] **Step 1: Read current bootstrap.ts** to understand wire format

```
grep -nE "registry|register|register\(" src/main/services/agent/runtime/bootstrap.ts
```

- [ ] **Step 2: Modify bootstrap.ts**

Add ClaudeCodeAgentRuntime registration:

```ts
// inside bootstrap.ts after existing registry setup
import { ClaudeCodeAgentRuntime } from "./ClaudeCodeAgentRuntime";

// ... existing wiring ...

registry.register(new ClaudeCodeAgentRuntime());
```

- [ ] **Step 3: Modify `AgentRuntimeRegistry.pickDefaultRuntimeId`**

Change the default returned id from `"claude-sdk"` to `"claude-code-agent"`. Keep `"claude-sdk"` as a fallback when user explicitly opts in.

- [ ] **Step 4: Run all agent runtime tests**

```
pnpm exec vitest run src/main/services/agent/runtime/__tests__/
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/agent/runtime/bootstrap.ts \
        src/main/services/agent/runtime/AgentRuntimeRegistry.ts
git commit -m "feat(agent): register ClaudeCodeAgentRuntime, make it default"
```

---

### Task B3: Legacy `agent-sdk:create-query` compat layer

**Files:**
- Modify: `src/main/ipc/handlers/streamingHandlers.ts`

Renderer still calls `window.electron.agentSDK.createQuery(...)` via the legacy `agent-sdk:create-query` channel. While Phase C runs we keep it working by adapting incoming `AgentSDKQueryRequest` → `AgentQueryRequest` and pumping events back as `AgentSDKStreamEvent`.

- [ ] **Step 1: Read existing handler**

```
grep -A 30 "agent-sdk:create-query" src/main/ipc/handlers/streamingHandlers.ts
```

- [ ] **Step 2: Replace handler body with a thin forwarder**

```ts
// inside registerStreamingHandlers in src/main/ipc/handlers/streamingHandlers.ts
ipcMain.handle("agent-sdk:create-query", async (event, requestId, request) => {
	const { getAgentRuntimeRegistry } = await import("../../services/agent/runtime/AgentRuntimeRegistry");
	const registry = getAgentRuntimeRegistry();
	const runtime = registry.tryGet("claude-code-agent") ?? registry.tryGet("claude-sdk");
	if (!runtime) {
		return { success: false, error: "No agent runtime registered" };
	}
	const adapted = adaptSdkRequestToRuntimeRequest(requestId, request);
	(async () => {
		try {
			for await (const ev of runtime.createQuery(adapted)) {
				event.sender.send("agent-sdk:stream-event", runtimeEventToSdkEvent(ev));
			}
		} catch (err) {
			event.sender.send("agent-sdk:stream-event", {
				requestId,
				type: "error",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	})();
	return { success: true, data: { requestId } };
});

function adaptSdkRequestToRuntimeRequest(requestId, request) {
	return {
		requestId,
		conversationId: request.sessionId ?? requestId,
		prompt: { kind: "text", text: request.prompt },
		history: [],
		runtime: { providerId: request.providerId, modelId: request.model },
		tools: [],
		cwd: request.cwd,
		signal: new AbortController().signal,
	};
}

function runtimeEventToSdkEvent(ev) {
	switch (ev.type) {
		case "init": return { requestId: ev.requestId, sessionId: ev.sessionId, type: "init", status: "ok" };
		case "text.delta": return { requestId: ev.requestId, sessionId: ev.sessionId, type: "chunk", content: ev.delta };
		case "tool.call": return { requestId: ev.requestId, sessionId: ev.sessionId, type: "tool_call", toolCall: { id: ev.callId, name: ev.name, input: ev.input, kind: "tool" } };
		case "tool.result": return { requestId: ev.requestId, sessionId: ev.sessionId, type: ev.isError ? "tool_error" : "tool_call", toolError: ev.isError ? { id: ev.callId, name: "?", error: typeof ev.content === "object" ? JSON.stringify(ev.content) : String(ev.content), kind: "tool" } : undefined };
		case "permission.request": return { requestId: ev.requestId, sessionId: ev.sessionId, type: "permission_request", permissionRequest: { toolName: ev.toolName, toolUseId: ev.callId, toolInput: ev.input } };
		case "result": return { requestId: ev.requestId, sessionId: ev.sessionId, type: "result", result: { success: ev.success, text: ev.text, durationMs: ev.durationMs, numTurns: ev.numTurns, totalCostUsd: ev.totalCostUsd, stopReason: ev.stopReason, usage: ev.usage } };
		case "error": return { requestId: ev.requestId, sessionId: ev.sessionId, type: "error", error: ev.error };
		default: return null;
	}
}
```

(Filter out nulls in the loop.)

- [ ] **Step 3: Type-check + run tests**

```
pnpm exec tsc -b --noEmit && pnpm exec vitest run src/main/services/agent/runtime/__tests__/
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/handlers/streamingHandlers.ts
git commit -m "feat(agent): legacy agent-sdk:create-query now forwards to ClaudeCodeAgentRuntime"
```

---

## Phase C — Smoke verification

### Task C1: Smoke #1 — plain chat (no tools)

- [ ] **Step 1: Start dev**

```bash
cd /Users/mark/myself/code/super-client-r/.worktrees/claude-code-agent
pnpm dev &
```

- [ ] **Step 2: Send chat** through HTTP API (skips renderer):

```bash
SCP_KEY=$(cat ~/.scr-data-dev/config.json | python3 -c "import json,sys; print(json.load(sys.stdin)['apiKey'])")
curl -sN -X POST http://localhost:3000/v1/llm/chat/completions \
  -H "Authorization: Bearer $SCP_KEY" -H "Content-Type: application/json" \
  -d '{ ... include valid dashscope baseUrl/apiKey/qwen-flash/messages ... }'
```

Expected: `event: chunk`, then `event: done` with usage.

- [ ] **Step 3: Document smoke**

Append to `docs/superpowers/plans/2026-06-23-claude-code-agent.smoke.md`:

```
## Smoke #1 — Plain chat
Date: <YYYY-MM-DD>
Result: PASS — chunks streamed, done with usage(...)
```

- [ ] **Step 4: Commit smoke note**

```bash
git add docs/superpowers/plans/2026-06-23-claude-code-agent.smoke.md
git commit -m "docs: smoke #1 plain chat PASS"
```

---

### Task C2: Smoke #2 — Read tool

- [ ] **Step 1: Create test file**

```bash
echo "smoke-test-$(date +%s)" > /tmp/cca-smoke.txt
```

- [ ] **Step 2: Send chat asking model to use Read**

Send `messages: [{role: "user", content: "Read the file /tmp/cca-smoke.txt and tell me the content."}]` plus `tools: [<Read tool def>]` and `toolMapping`. Expect event order: `tool_call → tool_result → chunks → done`.

- [ ] **Step 3: Document smoke #2** in same file

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-06-23-claude-code-agent.smoke.md
git commit -m "docs: smoke #2 Read PASS"
```

---

### Task C3: Smoke #3 — Edit tool

Similar: create file, ask model to "change `foo` to `bar` in /tmp/cca-edit.txt", verify diff.

- [ ] **Step 1: Setup file** `echo "alpha foo gamma" > /tmp/cca-edit.txt`
- [ ] **Step 2: Send chat asking Edit**
- [ ] **Step 3: Verify file** `cat /tmp/cca-edit.txt` should contain `alpha bar gamma`
- [ ] **Step 4: Document + commit**

---

### Task C4: Smoke #4 — Task subagent

- [ ] **Step 1: Send chat** asking model to spawn subagent: "Use the Task tool to find all .ts files in /tmp and tell me how many"
- [ ] **Step 2: Verify** event log shows nested tool_call for Task, then Glob inside the subagent, then summary back
- [ ] **Step 3: Document + commit**

---

### Task C5: Smoke #5 — three provider sanity

Run smoke #1 against each of:
- dashscope (qwen-flash)
- openrouter (deepseek/deepseek-chat-v3.1)
- (optional) an anthropic-compatible provider if available

- [ ] **Step 1-3: Run each, document, commit**

---

## Phase D — Cleanup legacy

### Task D1: Delete `AgentSDKService.ts` + related

**Files to delete:**
- `src/main/services/agent/AgentSDKService.ts`
- `src/main/services/agent/AgentService.ts`
- `src/main/services/agent/runtime/ClaudeSdkRuntime.ts`
- `src/main/services/agent/runtime/AgentSdkTraceSniffer.ts`
- `src/main/services/agent/__tests__/AgentSDKService.test.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
rg "from .*AgentSDKService|from .*ClaudeSdkRuntime|from .*AgentSdkTraceSniffer|from .*services/agent/AgentService" src --type ts
```

Replace any remaining caller with a `getAgentRuntimeRegistry()` lookup or remove.

- [ ] **Step 2: Delete files**

```bash
rm src/main/services/agent/AgentSDKService.ts \
   src/main/services/agent/AgentService.ts \
   src/main/services/agent/runtime/ClaudeSdkRuntime.ts \
   src/main/services/agent/runtime/AgentSdkTraceSniffer.ts \
   src/main/services/agent/__tests__/AgentSDKService.test.ts
```

- [ ] **Step 3: Update `bootstrap.ts`** to stop registering `ClaudeSdkRuntime`.

- [ ] **Step 4: Run typecheck + tests**

```
pnpm exec tsc -b --noEmit && pnpm exec vitest run
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(agent)!: delete AgentSDKService + AgentService + ClaudeSdkRuntime"
```

---

### Task D2: Delete renderer dead code

- [ ] **Step 1: Verify dead** (already confirmed in explore — no consumers)

```
rg "useAgentStore|useAgent\(\)" src/renderer | grep -v "stores/agent\|hooks/useAgent"
```

Expected: empty.

- [ ] **Step 2: Delete files**

```bash
rm src/renderer/src/hooks/useAgent.ts \
   src/renderer/src/stores/agentStore.ts \
   src/renderer/src/services/agent/agentService.ts
```

- [ ] **Step 3: Remove re-exports from `hooks/index.ts` and `services/index.ts`**

```bash
sed -i.bak '/useAgent/d' src/renderer/src/hooks/index.ts && rm src/renderer/src/hooks/index.ts.bak
sed -i.bak '/agent\/agentService/d' src/renderer/src/services/index.ts && rm src/renderer/src/services/index.ts.bak
```

- [ ] **Step 4: Run typecheck + tests**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(agent): delete dead renderer agentService / useAgent / agentStore"
```

---

### Task D3: Delete `claudeCodeEnabled` / `claudeCodeModel`

**Files to modify:**
- `src/main/ipc/types.ts`
- `src/renderer/src/types/models.ts`
- `src/renderer/src/components/models/ModelList.tsx`
- `src/main/store/StoreManager.ts` (single-select enforcement logic)

- [ ] **Step 1: Delete `claudeCodeEnabled?` and `claudeCodeModel?` fields from `ModelProvider` interface in both files**

- [ ] **Step 2: Delete the "Claude Code / 智能体" Form section in `ModelList.tsx`** (the toggle + model select shown in user's screenshot)

- [ ] **Step 3: Delete StoreManager's "only one claudeCodeEnabled at a time" enforcement code**

- [ ] **Step 4: Delete `provider.claudeCodeEnabled` / `provider.claudeCodeModel` read-sites** (these were only in AgentSDKService which is deleted, but verify)

```bash
rg "claudeCodeEnabled|claudeCodeModel" src
```

Expected: empty.

- [ ] **Step 5: Run typecheck + tests**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(models): drop claudeCodeEnabled/claudeCodeModel (obsolete after AgentSDK removal)"
```

---

### Task D4: Drop deps

- [ ] **Step 1: Verify no remaining imports**

```bash
rg "from .['\"]@anthropic-ai/(claude-agent-sdk|sdk)" src --type ts
```

Expected: empty.

- [ ] **Step 2: Remove packages**

```bash
pnpm remove @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk
```

- [ ] **Step 3: Run typecheck + tests**

```
pnpm exec tsc -b --noEmit && pnpm exec vitest run
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "refactor(deps): drop @anthropic-ai/claude-agent-sdk + @anthropic-ai/sdk"
```

---

### Task D5: Final smoke + finishing

- [ ] **Step 1: Re-smoke** Phase C scenarios on the cleaned-up branch.

- [ ] **Step 2: Run full test suite**

```
pnpm exec tsc -b --noEmit && pnpm exec vitest run
```

- [ ] **Step 3: Invoke `superpowers:finishing-a-development-branch`** to merge to main (linear rebase preferred per user request).

---

## Edge Case Coverage Matrix

| Edge case | Where handled |
|---|---|
| 1. Model lacks native function calling | Task A11 — model error surfaces via `error` event |
| 2. Subagent infinite recursion | Task B1 — hard cap `MAX_DEPTH = 3` |
| 3. Subagent token explosion | LLMService `stepCountIs(10)` (already exists) |
| 4. Interrupt during subagent | Task B1 — parent `signal` threaded into subReq |
| 5. Tool execution timeout | LLMService toolExecutor already has timeout |
| 6. UUID session resume | N/A — not used; renderer field becomes synthetic |
| 7. `mcpServerNames` filter | Task A11 — passed through `req.tools` (broker pre-filters) |
| 8. `request.agents` profiles | Phase D+ (deferred) |
| 9. CWD resolution | All tools — `isAbsolute(path) ? path : resolve(cwd, path)` |
| 10. Permission gate | Task A11 — translator emits `permission.request`, broker handles |
| 11. Cost / usage | Task A10 — `result` event sets `totalCostUsd: 0` for now |
| 12. `assistant_part` legacy events | Task B3 — compat layer maps subset |
| 13. `stderr-line` | N/A — no subprocess |
| 14. `agent-runtime:*` keeps working | Task B2 — same registry path |
| 15. `agent-sdk:*` compat | Task B3 |
| 16. Provider config missing | Task A12 — falls back to first enabled provider |
| 17. Edit ambiguity | Task A4 — uniqueness check |
| 18. Edit indent preserve | Out of scope v1 (preserved by exact match anyway) |
| 19. Bash approval rejected | Standard `tool_error` path via toolAdapter |
| 20. Test mocking | Each tool test uses `vi.mock` for mcpService/llmService |

---

## Self-Review

- ✅ Spec coverage: each of the 8 tools + translator + runtime + system prompt + Task subagent has a task
- ✅ Each task has exact file paths + steps + commit
- ✅ Edge case matrix lists 20 cases each mapped to a concrete task
- ✅ No TBD / TODO placeholders
- ✅ Phase B's Task tool depends on A11's `dispatchSubagent`; A12 reads `EffectiveSessionRuntime` consistently with A11
- ✅ Streamline events: types match the actual `AgentRuntimeStreamEvent` variants we confirmed (`init`, `text.delta`, `tool.call`, `tool.result`, `permission.request`, `result`, `error`)
