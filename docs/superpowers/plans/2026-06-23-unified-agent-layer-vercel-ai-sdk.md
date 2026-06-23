# Unified Agent Layer (Vercel AI SDK) Implementation Plan — v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual-SDK chat completion path in `LLMService` (currently `openai` + `@anthropic-ai/sdk`) with a single Vercel AI SDK (`ai` + `@ai-sdk/*`) backend, so adding new model providers becomes a one-line provider registration instead of a forked code path. All existing side effects (`broadcast`, runtime policy, approval gate, plan-mode gate, chat hooks, prompt-mode tool fallback, stream subscribers, stop/abort) and the public `ChatStreamEvent` shape are preserved bit-for-bit.

**Architecture:** Decompose the current 1500-line `LLMService.ts` into small focused modules under `src/main/services/llm/`: a provider factory, a message mapper, a tool adapter, a stream bridge, an `extraParams` mapper, and the existing helpers (plan-mode, prompt-mode). A new `chatCompletionUnified()` orchestrates them. **Rollout strategy:**

1. **Class-level flag** (not env var) — `LLMService` exposes `setUnifiedPath(enabled)`; default off; persisted via `electron-store` so the user can toggle per install / engineers can toggle per session for QA. No test pollution from `process.env`.
2. **Prompt-mode (`toolCallMode === "prompt"`) stays on legacy** — the AI SDK has no awareness of `<tool_call>` sentinels; routing it through `streamText` would single-step and silently swallow tool calls. The dispatcher in `chatCompletion` keeps prompt-mode on the legacy path forever (one branch, well-isolated).
3. **Legacy snapshot tests recorded first** (Task 0) — every subsequent extraction / refactor is validated against these fixtures with the flag **off**, so we can prove the refactor is behaviour-preserving before the cutover.

Public IPC and HTTP entry points (`modelHandlers.ts`, `server/routes/llm.ts`) are unchanged throughout.

**Tech Stack:** TypeScript 5.8, Vitest, `ai@^6`, `@ai-sdk/openai@^3`, `@ai-sdk/anthropic@^3`, `@ai-sdk/google@^3`, `@ai-sdk/xai@3`, `@openrouter/ai-sdk-provider@^2`, `electron-store` (already a dep).

---

## File Structure

**New files (`src/main/services/llm/`):**
- `providers.ts` — `resolveProvider(preset, baseUrl, apiKey, headers?) → LanguageModelV2`. One branch per preset; OpenAI-compatible presets share one branch.
- `messageMapper.ts` — `toModelMessages(messages) → ModelMessage[]`. Pure.
- `toolAdapter.ts` — `buildToolSet({ request, toolExecutor, broadcast, checkPermission, evaluateRuntimePolicy }) → ToolSet`. Wraps each tool's `execute` with the four cross-cutting concerns.
- `streamEventBridge.ts` — `drainFullStream(stream, { requestId, broadcast, startTime, abortSignal })`. Translates `fullStream` parts to `ChatStreamEvent`s. **Honours `abortSignal` to silently halt without broadcasting an error event** (parity with legacy abort handling).
- `extraParamsMapper.ts` — `mapExtraParams(preset, extraParams) → { top: Partial<StreamTextOptions>, providerOptions: Record<string, Record<string, unknown>> }`. Splits the legacy "everything flattened into OpenAI's create params" shape into AI SDK top-level fields and per-provider nested `providerOptions`.
- `planModeGate.ts` — extracted from `LLMService.ts`.
- `promptModeFallback.ts` — extracted from `LLMService.ts` (legacy path still uses it; unified path never does).

**Modified files:**
- `src/main/services/llm/LLMService.ts` — gains `chatCompletionUnified()` and an injectable `useUnifiedPath` flag. Legacy `chatCompletion` / `chatCompletionAnthropic` stay until Task 10's cutover.
- `package.json` — no new deps.

**New tests (`src/main/services/llm/__tests__/`):**
- `__fixtures__/` — recorded provider stream byte sequences (Task 0).
- `LLMService.legacy.test.ts` — pins legacy behaviour (Task 0). Run with flag off.
- `planModeGate.test.ts`, `promptModeFallback.test.ts`, `providers.test.ts`, `messageMapper.test.ts`, `toolAdapter.test.ts`, `streamEventBridge.test.ts`, `extraParamsMapper.test.ts`, `LLMService.unifiedPath.test.ts`.

---

## Task 0: Pin legacy behaviour with snapshot tests

The entire refactor rests on "extractions don't change behaviour" and "the unified path matches the legacy event stream". Before touching `LLMService.ts`, lock down what it currently does.

**Files:**
- Create: `src/main/services/llm/__tests__/LLMService.legacy.test.ts`

We mock the `openai` and `@anthropic-ai/sdk` SDK constructors at the module level and feed them controllable async iterables. We assert the full sequence of `ChatStreamEvent`s broadcast through `subscribeRequestEvents`.

- [ ] **Step 1: Write the failing tests (will pass on green, fail only if legacy regresses)**

```ts
// src/main/services/llm/__tests__/LLMService.legacy.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatStreamEvent } from "../../../ipc/types";

// Don't broadcast through electron.
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));

// ── Controllable OpenAI mock ──────────────────────────────────────────────
const openaiStreams: Array<AsyncIterable<unknown>> = [];
vi.mock("openai", () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn(async () => openaiStreams.shift() ?? emptyStream()),
        },
      };
      models = { list: vi.fn(async () => []) };
    },
  };
});

// ── Controllable Anthropic mock ───────────────────────────────────────────
const anthropicStreams: Array<AsyncIterable<unknown>> = [];
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = {
        stream: vi.fn(() => anthropicStreams.shift() ?? emptyStream()),
      };
    },
  };
});

async function* emptyStream() {
  yield {
    choices: [{ delta: { content: "" }, finish_reason: "stop", index: 0 }],
  };
}

async function* openAiTextStream() {
  yield { choices: [{ delta: { content: "Hel" }, index: 0 }] };
  yield { choices: [{ delta: { content: "lo" }, index: 0 }] };
  yield {
    choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  };
}

async function* openAiToolCallStream() {
  yield {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_a",
              function: { name: "echo", arguments: '{"m":"hi"}' },
            },
          ],
        },
        index: 0,
      },
    ],
  };
  yield {
    choices: [{ delta: {}, index: 0, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
  };
}

async function* anthropicTextStream() {
  yield {
    type: "message_start",
    message: { usage: { input_tokens: 3, output_tokens: 0 } },
  };
  yield {
    type: "content_block_delta",
    delta: { type: "text_delta", text: "Hi" },
  };
  yield {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 1 },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe("LLMService legacy path snapshot (flag off)", () => {
  beforeEach(() => {
    openaiStreams.length = 0;
    anthropicStreams.length = 0;
  });

  it("OpenAI: streams text chunks then done with usage", async () => {
    openaiStreams.push(openAiTextStream());
    const { LLMService } = await import("../LLMService");
    const service = new LLMService();
    const events: ChatStreamEvent[] = [];
    const unsub = service.subscribeRequestEvents("r1", (e) => events.push(e));
    await service.chatCompletion({
      requestId: "r1",
      baseUrl: "x",
      apiKey: "x",
      model: "gpt-x",
      messages: [{ role: "user", content: "say hi" }],
      providerPreset: "openai",
    });
    unsub();
    expect(
      events.filter((e) => e.type === "chunk").map((e) => e.content),
    ).toEqual(["Hel", "lo"]);
    const done = events.find((e) => e.type === "done");
    expect(done?.usage?.totalTokens).toBe(7);
  });

  it("OpenAI: emits tool_call → tool_result with duration", async () => {
    openaiStreams.push(openAiToolCallStream());
    openaiStreams.push(openAiTextStream()); // continuation
    const { LLMService } = await import("../LLMService");
    const service = new LLMService();
    const events: ChatStreamEvent[] = [];
    const unsub = service.subscribeRequestEvents("r2", (e) => events.push(e));
    await service.chatCompletion(
      {
        requestId: "r2",
        baseUrl: "x",
        apiKey: "x",
        model: "gpt-x",
        messages: [{ role: "user", content: "use a tool" }],
        providerPreset: "openai",
        tools: [
          {
            type: "function",
            function: {
              name: "echo",
              description: "echo",
              parameters: { type: "object" },
            },
          },
        ],
      },
      async (_n, args) => ({ ok: true, args }),
    );
    unsub();
    const toolCall = events.find((e) => e.type === "tool_call");
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolCall?.toolCall?.name).toBe("echo");
    expect(toolResult?.toolResult?.result).toEqual({ ok: true, args: { m: "hi" } });
    expect(typeof toolResult?.toolResult?.duration).toBe("number");
  });

  it("Anthropic: streams text chunks then done with usage", async () => {
    anthropicStreams.push(anthropicTextStream());
    const { LLMService } = await import("../LLMService");
    const service = new LLMService();
    const events: ChatStreamEvent[] = [];
    const unsub = service.subscribeRequestEvents("r3", (e) => events.push(e));
    await service.chatCompletion({
      requestId: "r3",
      baseUrl: "x",
      apiKey: "x",
      model: "claude-x",
      messages: [{ role: "user", content: "say hi" }],
      providerPreset: "anthropic",
    });
    unsub();
    expect(events.find((e) => e.type === "chunk")?.content).toBe("Hi");
    expect(events.find((e) => e.type === "done")?.usage?.inputTokens).toBe(3);
  });

  it("abort mid-stream halts silently without done or error", async () => {
    async function* slow() {
      yield { choices: [{ delta: { content: "a" }, index: 0 }] };
      // Hang forever until abort
      await new Promise(() => {});
    }
    openaiStreams.push(slow());
    const { LLMService } = await import("../LLMService");
    const service = new LLMService();
    const events: ChatStreamEvent[] = [];
    const unsub = service.subscribeRequestEvents("r4", (e) => events.push(e));
    const p = service.chatCompletion({
      requestId: "r4",
      baseUrl: "x",
      apiKey: "x",
      model: "gpt-x",
      messages: [{ role: "user", content: "go" }],
      providerPreset: "openai",
    });
    await new Promise((r) => setTimeout(r, 20));
    service.stopStream("r4");
    await p;
    unsub();
    expect(events.find((e) => e.type === "done")).toBeUndefined();
    expect(events.find((e) => e.type === "error")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the legacy tests to confirm they pass against today's `LLMService`**

Run: `pnpm test:run src/main/services/llm/__tests__/LLMService.legacy.test.ts`
Expected: PASS for all four cases.

If they fail, the test setup is wrong — fix the mocks before proceeding, because everything downstream relies on this baseline.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/llm/__tests__/LLMService.legacy.test.ts
git commit -m "test(llm): pin legacy chat completion behaviour before refactor"
```

These tests must keep passing after Tasks 1, 2, 3-8 (flag off). They will be deleted in Task 10 alongside the legacy path itself.

---

## Task 1: Extract `planModeGate` helper

**Files:**
- Create: `src/main/services/llm/planModeGate.ts`
- Modify: `src/main/services/llm/LLMService.ts`
- Test: `src/main/services/llm/__tests__/planModeGate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/llm/__tests__/planModeGate.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { applyPlanModeGate } from "../planModeGate";
import type { ChatCompletionRequest } from "../../../ipc/types";

vi.mock("../../runtime/SessionRuntimeResolver", () => ({
  getSessionRuntimeResolver: () => ({
    resolve: () => ({ planMode: "plan-only", workspaceId: "ws-1" }),
  }),
}));
vi.mock("../../runtime/RuntimePolicyService", () => ({
  getRuntimePolicyService: () => ({ record: vi.fn() }),
}));

describe("applyPlanModeGate", () => {
  it("strips tools and prepends a plan-only system note when planMode=plan-only", () => {
    const req = {
      requestId: "r1",
      conversationId: "c1",
      baseUrl: "x",
      apiKey: "x",
      model: "m",
      messages: [{ role: "system", content: "base" }],
      tools: [{ type: "function", function: { name: "t", description: "", parameters: {} } }],
    } as unknown as ChatCompletionRequest;

    const out = applyPlanModeGate(req, async () => "x");
    expect(out.toolExecutor).toBeUndefined();
    expect(out.request.tools).toBeUndefined();
    expect((out.request.messages[0] as any).content).toMatch(/PLAN ONLY mode/);
    expect((out.request.messages[0] as any).content).toMatch(/base$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/planModeGate.test.ts`
Expected: FAIL with `Cannot find module '../planModeGate'`.

- [ ] **Step 3: Create `planModeGate.ts` by extracting the helper**

```ts
// src/main/services/llm/planModeGate.ts
import { getRuntimePolicyService } from "../runtime/RuntimePolicyService";
import { getSessionRuntimeResolver } from "../runtime/SessionRuntimeResolver";
import type { ChatCompletionRequest } from "../../ipc/types";
import type { PlanMode } from "@super-client/shared-types/chat";
import type { ToolExecutor } from "./LLMService";

const PLAN_NOTE =
  "You are in PLAN ONLY mode. Describe the plan you would carry out, but do NOT call any tools. If tool input is needed for planning, list the calls and arguments you would make in prose.";

export function applyPlanModeGate(
  request: ChatCompletionRequest,
  toolExecutor: ToolExecutor | undefined,
): {
  request: ChatCompletionRequest;
  toolExecutor: ToolExecutor | undefined;
} {
  const sessionId = request.conversationId;
  if (!sessionId) return { request, toolExecutor };

  let planMode: PlanMode = "chat";
  try {
    planMode = getSessionRuntimeResolver().resolve({ sessionId }).planMode;
  } catch {
    return { request, toolExecutor };
  }
  if (planMode !== "plan-only") return { request, toolExecutor };

  try {
    getRuntimePolicyService().record(
      {
        workspaceId: "",
        sessionId,
        source: "llm",
        operation: "plan-mode:strip-tools",
        kind: "tool-execute",
      },
      "denied",
      "plan-only-mode",
    );
  } catch {
    /* audit must never block */
  }

  const messages = request.messages.slice();
  const first = messages[0];
  if (
    first &&
    (first as { role?: string }).role === "system" &&
    typeof (first as { content?: unknown }).content === "string"
  ) {
    messages[0] = {
      ...(first as object),
      content: `${PLAN_NOTE}\n\n${(first as { content: string }).content}`,
    } as ChatCompletionRequest["messages"][number];
  } else {
    messages.unshift({
      role: "system",
      content: PLAN_NOTE,
    } as ChatCompletionRequest["messages"][number]);
  }

  return {
    request: {
      ...request,
      messages,
      tools: undefined,
      toolMapping: undefined,
      toolPermission: undefined,
    },
    toolExecutor: undefined,
  };
}
```

- [ ] **Step 4: Delegate from `LLMService.applyPlanModeGate`**

In `src/main/services/llm/LLMService.ts`:

- Add at the top: `import { applyPlanModeGate } from "./planModeGate";`
- Replace the private method body with:

```ts
private applyPlanModeGate(
  request: ChatCompletionRequest,
  toolExecutor: ToolExecutor | undefined,
): {
  request: ChatCompletionRequest;
  toolExecutor: ToolExecutor | undefined;
} {
  return applyPlanModeGate(request, toolExecutor);
}
```

- [ ] **Step 5: Run all LLM tests (legacy snapshot + new unit test)**

Run: `pnpm test:run src/main/services/llm`
Expected: PASS — both `LLMService.legacy.test.ts` (baseline unchanged) and `planModeGate.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/llm/planModeGate.ts \
        src/main/services/llm/__tests__/planModeGate.test.ts \
        src/main/services/llm/LLMService.ts
git commit -m "refactor(llm): extract applyPlanModeGate into its own module"
```

---

## Task 2: Extract prompt-mode tool fallback helpers

**Files:**
- Create: `src/main/services/llm/promptModeFallback.ts`
- Modify: `src/main/services/llm/LLMService.ts`
- Test: `src/main/services/llm/__tests__/promptModeFallback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/llm/__tests__/promptModeFallback.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildToolPrompt,
  hasToolBlocks,
  parseToolCallsFromText,
} from "../promptModeFallback";

describe("promptModeFallback", () => {
  it("returns empty when no tools", () => {
    expect(buildToolPrompt(undefined)).toBe("");
    expect(buildToolPrompt([])).toBe("");
  });

  it("renders a tool prompt section that lists each tool", () => {
    const out = buildToolPrompt([
      {
        type: "function",
        function: { name: "read_file", description: "reads", parameters: { type: "object" } },
      },
    ]);
    expect(out).toMatch(/Available Tools/);
    expect(out).toMatch(/read_file/);
  });

  it("detects tool blocks in text", () => {
    expect(hasToolBlocks("hello")).toBe(false);
    expect(hasToolBlocks(`<tool_call>{"name":"x","arguments":{}}</tool_call>`)).toBe(true);
  });

  it("parses tool_call and tool_use blocks, accepts arguments/parameters/input", () => {
    const { cleanText, toolCalls } = parseToolCallsFromText(
      `before <tool_call>{"name":"a","arguments":{"k":1}}</tool_call> mid ` +
        `<tool_use>{"name":"b","parameters":{"k":2}}</tool_use> end`,
    );
    expect(cleanText).toBe("before  mid  end");
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].name).toBe("a");
    expect(toolCalls[0].arguments).toEqual({ k: 1 });
    expect(toolCalls[1].name).toBe("b");
    expect(toolCalls[1].arguments).toEqual({ k: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/promptModeFallback.test.ts`
Expected: FAIL with `Cannot find module '../promptModeFallback'`.

- [ ] **Step 3: Create `promptModeFallback.ts` by moving the helpers from `LLMService.ts`**

```ts
// src/main/services/llm/promptModeFallback.ts
import type { ChatCompletionRequest } from "../../ipc/types";

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export function buildToolPrompt(tools: ChatCompletionRequest["tools"]): string {
  if (!tools || tools.length === 0) return "";

  const toolDescriptions = tools
    .map((t) => {
      const params = JSON.stringify(t.function.parameters, null, 2);
      return [
        `### ${t.function.name}`,
        t.function.description,
        "Parameters:",
        "```json",
        params,
        "```",
      ].join("\n");
    })
    .join("\n\n");

  return `

--- Available Tools ---
You have access to the following tools. To call a tool, output a <tool_call> or <tool_use> XML block containing a JSON object with "name" and "arguments".

You may make multiple tool calls in a single response. Each call MUST be wrapped in its own XML tag.

Format (both are accepted):

<tool_call>
{"name": "tool_name", "arguments": {"key": "value"}}
</tool_call>

<tool_use>
{"name": "tool_name", "arguments": {"key": "value"}}
</tool_use>

After you output tool calls the system will execute them and return results in the next message. You can then continue your response.

IMPORTANT:
- You MUST use the XML tag format above. Do NOT merely describe what you would do — actually invoke the tool.
- Always wait for tool results before telling the user the outcome.

${toolDescriptions}`;
}

const TOOL_BLOCK_RE =
  /(?:<\s*)?(tool_call|tool_use)\s*>\s*([\s\S]*?)(?:<\s*\/\s*\1\s*>|$)/gi;

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  if (start < 0) return raw.trim();
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return raw.slice(start).trim();
}

function tryParseToolPayload(raw: string, idx: number): ParsedToolCall | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(extractJsonObject(raw));
  } catch {
    return null;
  }
  const name =
    (typeof obj.name === "string" && obj.name) ||
    (typeof obj.function === "string" && obj.function) ||
    (typeof obj.tool === "string" && obj.tool);
  if (!name) return null;
  const args: Record<string, unknown> =
    (typeof obj.arguments === "object" && obj.arguments !== null
      ? (obj.arguments as Record<string, unknown>)
      : undefined) ??
    (typeof obj.parameters === "object" && obj.parameters !== null
      ? (obj.parameters as Record<string, unknown>)
      : undefined) ??
    (typeof obj.input === "object" && obj.input !== null
      ? (obj.input as Record<string, unknown>)
      : undefined) ??
    {};
  return { id: `prompt_tc_${Date.now()}_${idx}`, name, arguments: args };
}

export function parseToolCallsFromText(text: string): {
  cleanText: string;
  toolCalls: ParsedToolCall[];
} {
  const toolCalls: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  TOOL_BLOCK_RE.lastIndex = 0;
  while ((match = TOOL_BLOCK_RE.exec(text)) !== null) {
    const tc = tryParseToolPayload(match[2], idx);
    if (tc) {
      toolCalls.push(tc);
      idx++;
    }
  }
  const cleanText = text.replace(TOOL_BLOCK_RE, "").trim();
  return { cleanText, toolCalls };
}

export function hasToolBlocks(text: string): boolean {
  TOOL_BLOCK_RE.lastIndex = 0;
  return TOOL_BLOCK_RE.test(text);
}
```

- [ ] **Step 4: Update `LLMService.ts`**

- Delete (from `LLMService.ts`): `ParsedToolCall` interface, `buildToolPrompt`, `TOOL_BLOCK_RE`, `extractJsonObject`, `tryParseToolPayload`, `parseToolCallsFromText`, `hasToolBlocks`.
- Add at top: `import { buildToolPrompt, hasToolBlocks, parseToolCallsFromText } from "./promptModeFallback";`

- [ ] **Step 5: Run all LLM tests**

Run: `pnpm test:run src/main/services/llm`
Expected: PASS — legacy snapshots + new unit tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/llm/promptModeFallback.ts \
        src/main/services/llm/__tests__/promptModeFallback.test.ts \
        src/main/services/llm/LLMService.ts
git commit -m "refactor(llm): extract prompt-mode tool fallback helpers"
```

---

## Task 3: Provider factory

**Files:**
- Create: `src/main/services/llm/providers.ts`
- Test: `src/main/services/llm/__tests__/providers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/llm/__tests__/providers.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveProvider } from "../providers";

describe("resolveProvider", () => {
  it("returns a LanguageModelV2 for each known preset", () => {
    const presets = ["openai", "anthropic", "gemini", "grok", "openrouter"] as const;
    for (const preset of presets) {
      const m = resolveProvider({
        preset,
        baseUrl: "https://example.test/v1",
        apiKey: "k",
        model: "m1",
      });
      expect(m.specificationVersion).toBe("v2");
      expect(m.modelId).toBe("m1");
    }
  });

  it("falls back to OpenAI-compatible for unknown / custom presets", () => {
    const presets = ["custom", "deepseek", "moonshot", "ollama", "lmstudio", "newapi"] as const;
    for (const preset of presets) {
      const m = resolveProvider({
        preset,
        baseUrl: "https://example.test/v1",
        apiKey: "k",
        model: "anything",
      });
      expect(m.specificationVersion).toBe("v2");
      expect(m.modelId).toBe("anything");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/providers.test.ts`
Expected: FAIL with `Cannot find module '../providers'`.

- [ ] **Step 3: Create `providers.ts`**

```ts
// src/main/services/llm/providers.ts
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { ModelProviderPreset } from "../../ipc/types";

export interface ResolveProviderArgs {
  preset: ModelProviderPreset | undefined;
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

export function resolveProvider(args: ResolveProviderArgs): LanguageModelV2 {
  const { preset, baseUrl, apiKey, model } = args;
  switch (preset) {
    case "anthropic": {
      const provider = createAnthropic({ apiKey: apiKey || "", baseURL: baseUrl || undefined });
      return provider(model);
    }
    case "gemini": {
      const provider = createGoogleGenerativeAI({
        apiKey: apiKey || "",
        baseURL: baseUrl || undefined,
      });
      return provider(model);
    }
    case "grok": {
      const provider = createXai({ apiKey: apiKey || "", baseURL: baseUrl || undefined });
      return provider(model);
    }
    case "openrouter": {
      const provider = createOpenRouter({
        apiKey: apiKey || "",
        baseURL: baseUrl || undefined,
        headers: {
          "HTTP-Referer": "https://superclient.app",
          "X-Title": "Super Client",
          ...args.headers,
        },
      });
      return provider(model);
    }
    case "openai":
    default: {
      // OpenAI-compatible: deepseek, moonshot, dashscope, siliconflow,
      // ollama, lmstudio, newapi, volcengine, custom, etc.
      const provider = createOpenAI({
        apiKey: apiKey || "sk-placeholder",
        baseURL: baseUrl || undefined,
        headers: args.headers,
        compatibility: preset === "openai" ? "strict" : "compatible",
      });
      return provider(model);
    }
  }
}

/**
 * Map a `ModelProviderPreset` to the key used inside AI SDK `providerOptions`.
 * Used by `extraParamsMapper.ts`.
 */
export function providerOptionsKey(
  preset: ModelProviderPreset | undefined,
): string {
  switch (preset) {
    case "anthropic":
      return "anthropic";
    case "gemini":
      return "google";
    case "grok":
      return "xai";
    case "openrouter":
      return "openrouter";
    default:
      return "openai";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/main/services/llm/__tests__/providers.test.ts`
Expected: PASS for all cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/llm/providers.ts \
        src/main/services/llm/__tests__/providers.test.ts
git commit -m "feat(llm): add provider factory mapping presets to AI SDK models"
```

---

## Task 4: Message mapper

(Unchanged from v1 plan.)

**Files:**
- Create: `src/main/services/llm/messageMapper.ts`
- Test: `src/main/services/llm/__tests__/messageMapper.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/llm/__tests__/messageMapper.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toModelMessages } from "../messageMapper";
import type { ChatCompletionRequest } from "../../../ipc/types";

describe("toModelMessages", () => {
  it("converts plain user/assistant/system messages", () => {
    const out = toModelMessages([
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ] satisfies ChatCompletionRequest["messages"]);
    expect(out).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });

  it("converts assistant.tool_calls into tool-call content parts", () => {
    const out = toModelMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"a.txt"}' },
          },
        ],
      },
    ]);
    const m = out[0] as { role: string; content: Array<{ type: string }> };
    expect(m.role).toBe("assistant");
    expect(m.content[0]).toMatchObject({
      type: "tool-call",
      toolCallId: "call_1",
      toolName: "read_file",
      input: { path: "a.txt" },
    });
  });

  it("converts role=tool into tool-result content parts and coalesces consecutive ones", () => {
    const out = toModelMessages([
      { role: "tool", tool_call_id: "a", content: "1" },
      { role: "tool", tool_call_id: "b", content: "2" },
    ]);
    expect(out).toHaveLength(1);
    const m = out[0] as { role: string; content: unknown[] };
    expect(m.role).toBe("tool");
    expect(m.content).toHaveLength(2);
  });

  it("tolerates malformed tool-call argument JSON", () => {
    const out = toModelMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "x", type: "function", function: { name: "t", arguments: "not json" } },
        ],
      },
    ]);
    const m = out[0] as { content: Array<{ input: unknown }> };
    expect(m.content[0].input).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/messageMapper.test.ts`
Expected: FAIL with `Cannot find module '../messageMapper'`.

- [ ] **Step 3: Create `messageMapper.ts`**

```ts
// src/main/services/llm/messageMapper.ts
import type { ModelMessage } from "ai";
import type { ChatCompletionRequest } from "../../ipc/types";

type InMsg = ChatCompletionRequest["messages"][number];

export function toModelMessages(messages: InMsg[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const msg of messages) {
    if (!("role" in msg)) continue;

    if (msg.role === "system" && typeof msg.content === "string") {
      out.push({ role: "system", content: msg.content });
      continue;
    }
    if (msg.role === "user" && typeof msg.content === "string") {
      out.push({ role: "user", content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const toolCalls =
        "tool_calls" in msg && Array.isArray(msg.tool_calls) ? msg.tool_calls : undefined;
      if (toolCalls && toolCalls.length > 0) {
        const parts: Array<
          | { type: "text"; text: string }
          | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
        > = [];
        if (typeof msg.content === "string" && msg.content) {
          parts.push({ type: "text", text: msg.content });
        }
        for (const tc of toolCalls) {
          let input: unknown = {};
          try {
            input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            input = {};
          }
          parts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.function.name,
            input,
          });
        }
        out.push({ role: "assistant", content: parts });
      } else if (typeof msg.content === "string") {
        out.push({ role: "assistant", content: msg.content });
      }
      continue;
    }

    if (msg.role === "tool" && "tool_call_id" in msg) {
      const part = {
        type: "tool-result" as const,
        toolCallId: msg.tool_call_id,
        toolName: "",
        output: { type: "text" as const, value: msg.content },
      };
      const last = out[out.length - 1];
      if (last && last.role === "tool" && Array.isArray(last.content)) {
        (last.content as unknown as Array<typeof part>).push(part);
      } else {
        out.push({ role: "tool", content: [part] } as ModelMessage);
      }
      continue;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/main/services/llm/__tests__/messageMapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/llm/messageMapper.ts \
        src/main/services/llm/__tests__/messageMapper.test.ts
git commit -m "feat(llm): add ChatCompletionRequest → ModelMessage mapper"
```

---

## Task 5: Tool adapter

**Files:**
- Create: `src/main/services/llm/toolAdapter.ts`
- Test: `src/main/services/llm/__tests__/toolAdapter.test.ts`

- [ ] **Step 1: Write the failing test (includes the new "executor-throws is forwarded as tool_error" case)**

```ts
// src/main/services/llm/__tests__/toolAdapter.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildToolSet } from "../toolAdapter";
import type { ChatCompletionRequest, ChatStreamEvent } from "../../../ipc/types";

function makeReq(overrides?: Partial<ChatCompletionRequest>): ChatCompletionRequest {
  return {
    requestId: "r1",
    baseUrl: "x",
    apiKey: "x",
    model: "m",
    messages: [],
    tools: [
      {
        type: "function",
        function: {
          name: "echo",
          description: "echo",
          parameters: { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] },
        },
      },
    ],
    conversationId: "c1",
    ...overrides,
  };
}

describe("buildToolSet", () => {
  it("returns undefined when there are no tools or no executor", () => {
    expect(
      buildToolSet({
        request: { ...makeReq(), tools: [] },
        toolExecutor: undefined,
        broadcast: vi.fn(),
        checkPermission: async () => true,
        evaluateRuntimePolicy: () => ({ allowed: true }),
      }),
    ).toBeUndefined();
    expect(
      buildToolSet({
        request: makeReq(),
        toolExecutor: undefined,
        broadcast: vi.fn(),
        checkPermission: async () => true,
        evaluateRuntimePolicy: () => ({ allowed: true }),
      }),
    ).toBeUndefined();
  });

  it("executes tool and broadcasts tool_call + tool_result with duration", async () => {
    const events: ChatStreamEvent[] = [];
    const executor = vi.fn(async (_n: string, args: Record<string, unknown>) => ({ ok: true, args }));
    const set = buildToolSet({
      request: makeReq(),
      toolExecutor: executor,
      broadcast: (e) => events.push(e),
      checkPermission: async () => true,
      evaluateRuntimePolicy: () => ({ allowed: true }),
    });
    const result = await set!["echo"].execute!(
      { msg: "hi" },
      { toolCallId: "tc1", messages: [] as never },
    );
    expect(executor).toHaveBeenCalledWith("echo", { msg: "hi" });
    expect(result).toEqual({ ok: true, args: { msg: "hi" } });
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      type: "tool_call",
      toolCall: { id: "tc1", name: "echo" },
    });
    const r = events.find((e) => e.type === "tool_result");
    expect(r?.toolResult?.toolCallId).toBe("tc1");
    expect(typeof r?.toolResult?.duration).toBe("number");
  });

  it("blocks execution and emits tool_error when permission denies", async () => {
    const events: ChatStreamEvent[] = [];
    const set = buildToolSet({
      request: makeReq(),
      toolExecutor: vi.fn(),
      broadcast: (e) => events.push(e),
      checkPermission: async () => false,
      evaluateRuntimePolicy: () => ({ allowed: true }),
    });
    await expect(
      set!["echo"].execute!({ msg: "hi" }, { toolCallId: "tc1", messages: [] as never }),
    ).rejects.toThrow(/rejected/i);
    expect(events.find((e) => e.type === "tool_error")?.toolError?.code).toBe("TOOL_REJECTED");
  });

  it("blocks execution and emits tool_error when runtime policy denies", async () => {
    const events: ChatStreamEvent[] = [];
    const set = buildToolSet({
      request: makeReq(),
      toolExecutor: vi.fn(),
      broadcast: (e) => events.push(e),
      checkPermission: async () => true,
      evaluateRuntimePolicy: () => ({ allowed: false, code: "X", message: "nope" }),
    });
    await expect(
      set!["echo"].execute!({ msg: "hi" }, { toolCallId: "tc2", messages: [] as never }),
    ).rejects.toThrow(/nope/);
    expect(events.find((e) => e.type === "tool_error")?.toolError?.code).toBe("X");
  });

  it("turns executor exceptions into tool_error events and rethrows so SDK can feed back to model", async () => {
    const events: ChatStreamEvent[] = [];
    const set = buildToolSet({
      request: makeReq(),
      toolExecutor: async () => {
        throw new Error("boom");
      },
      broadcast: (e) => events.push(e),
      checkPermission: async () => true,
      evaluateRuntimePolicy: () => ({ allowed: true }),
    });
    await expect(
      set!["echo"].execute!({ msg: "hi" }, { toolCallId: "tc3", messages: [] as never }),
    ).rejects.toThrow(/boom/);
    const err = events.find((e) => e.type === "tool_error");
    expect(err?.toolError?.error).toBe("boom");
    expect(typeof err?.toolError?.duration).toBe("number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/toolAdapter.test.ts`
Expected: FAIL with `Cannot find module '../toolAdapter'`.

- [ ] **Step 3: Create `toolAdapter.ts`**

```ts
// src/main/services/llm/toolAdapter.ts
import { jsonSchema, tool, type ToolSet } from "ai";
import type {
  ChatCompletionRequest,
  ChatStreamEvent,
} from "../../ipc/types";
import type { ToolExecutor } from "./LLMService";

export interface BuildToolSetArgs {
  request: ChatCompletionRequest;
  toolExecutor: ToolExecutor | undefined;
  broadcast: (event: ChatStreamEvent) => void;
  checkPermission: (args: {
    toolCallId: string;
    toolName: string;
    toolArgs: string;
  }) => Promise<boolean>;
  evaluateRuntimePolicy: (
    toolName: string,
    args: Record<string, unknown>,
  ) => { allowed: true } | { allowed: false; code: string; message: string };
}

export function buildToolSet(args: BuildToolSetArgs): ToolSet | undefined {
  const { request, toolExecutor, broadcast, checkPermission, evaluateRuntimePolicy } = args;
  if (!request.tools || request.tools.length === 0 || !toolExecutor) return undefined;

  const set: ToolSet = {};
  for (const t of request.tools) {
    const name = t.function.name;
    set[name] = tool({
      description: t.function.description,
      inputSchema: jsonSchema(t.function.parameters as Parameters<typeof jsonSchema>[0]),
      execute: async (input, { toolCallId }) => {
        const argsObj =
          input && typeof input === "object" ? (input as Record<string, unknown>) : {};
        const argsJson = JSON.stringify(argsObj);

        broadcast({
          requestId: request.requestId,
          type: "tool_call",
          toolCall: { id: toolCallId, name, arguments: argsJson },
        });

        const approved = await checkPermission({
          toolCallId,
          toolName: name,
          toolArgs: argsJson,
        });
        if (!approved) {
          broadcast({
            requestId: request.requestId,
            type: "tool_error",
            toolError: {
              toolCallId,
              name,
              error: "Tool call was rejected by user.",
              code: "TOOL_REJECTED",
            },
          });
          throw new Error("Tool call was rejected by user.");
        }

        const policy = evaluateRuntimePolicy(name, argsObj);
        if (!policy.allowed) {
          broadcast({
            requestId: request.requestId,
            type: "tool_error",
            toolError: { toolCallId, name, error: policy.message, code: policy.code },
          });
          throw new Error(policy.message);
        }

        const started = Date.now();
        try {
          const result = await toolExecutor(name, argsObj);
          const duration = Date.now() - started;
          broadcast({
            requestId: request.requestId,
            type: "tool_result",
            toolResult: { toolCallId, name, result, duration },
          });
          return result;
        } catch (err) {
          const duration = Date.now() - started;
          const message = err instanceof Error ? err.message : String(err);
          broadcast({
            requestId: request.requestId,
            type: "tool_error",
            toolError: { toolCallId, name, error: message, duration },
          });
          throw err;
        }
      },
    });
  }
  return set;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/main/services/llm/__tests__/toolAdapter.test.ts`
Expected: PASS for all five cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/llm/toolAdapter.ts \
        src/main/services/llm/__tests__/toolAdapter.test.ts
git commit -m "feat(llm): add tool adapter wrapping approval, policy, broadcast"
```

---

## Task 6: Stream event bridge (abort-aware)

**Files:**
- Create: `src/main/services/llm/streamEventBridge.ts`
- Test: `src/main/services/llm/__tests__/streamEventBridge.test.ts`

- [ ] **Step 1: Write the failing test (now includes the abort case)**

```ts
// src/main/services/llm/__tests__/streamEventBridge.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { drainFullStream } from "../streamEventBridge";
import type { ChatStreamEvent } from "../../../ipc/types";

async function* textStream() {
  yield { type: "text-delta", delta: "Hel" } as const;
  yield { type: "text-delta", delta: "lo" } as const;
  yield {
    type: "finish",
    finishReason: "stop",
    usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
  } as const;
}

describe("drainFullStream", () => {
  it("emits chunk events for text-delta and a final done with usage and timing", async () => {
    const events: ChatStreamEvent[] = [];
    await drainFullStream(textStream() as never, {
      requestId: "r1",
      broadcast: (e) => events.push(e),
      startTime: Date.now() - 100,
    });
    expect(events.filter((e) => e.type === "chunk").map((e) => e.content)).toEqual(["Hel", "lo"]);
    const done = events.find((e) => e.type === "done");
    expect(done?.usage?.totalTokens).toBe(10);
    expect(done?.timing?.firstTokenMs).toBeGreaterThanOrEqual(0);
  });

  it("emits an error event on stream errors", async () => {
    const events: ChatStreamEvent[] = [];
    async function* bad() {
      yield { type: "error", error: new Error("upstream") } as const;
    }
    await drainFullStream(bad() as never, {
      requestId: "r1",
      broadcast: (e) => events.push(e),
      startTime: Date.now(),
    });
    expect(events.find((e) => e.type === "error")?.error).toMatch(/upstream/);
  });

  it("silently halts (no done, no error) when abortSignal is aborted", async () => {
    const events: ChatStreamEvent[] = [];
    const ac = new AbortController();
    async function* abortable() {
      yield { type: "text-delta", delta: "a" } as const;
      ac.abort();
      yield { type: "error", error: new Error("AbortError") } as const;
    }
    await drainFullStream(abortable() as never, {
      requestId: "r1",
      broadcast: (e) => events.push(e),
      startTime: Date.now(),
      abortSignal: ac.signal,
    });
    expect(events.find((e) => e.type === "chunk")?.content).toBe("a");
    expect(events.find((e) => e.type === "done")).toBeUndefined();
    expect(events.find((e) => e.type === "error")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/streamEventBridge.test.ts`
Expected: FAIL with `Cannot find module '../streamEventBridge'`.

- [ ] **Step 3: Create `streamEventBridge.ts`**

```ts
// src/main/services/llm/streamEventBridge.ts
import type { StreamTextResult, ToolSet } from "ai";
import type { ChatStreamEvent } from "../../ipc/types";

export interface DrainArgs {
  requestId: string;
  broadcast: (event: ChatStreamEvent) => void;
  startTime: number;
  /**
   * When set and aborted, the bridge silently exits without broadcasting a
   * `done` or `error` event — matching the legacy stopStream() behaviour.
   */
  abortSignal?: AbortSignal;
}

export async function drainFullStream(
  stream:
    | StreamTextResult<ToolSet, unknown>["fullStream"]
    | AsyncIterable<{ type: string; [k: string]: unknown }>,
  args: DrainArgs,
): Promise<void> {
  const { requestId, broadcast, startTime, abortSignal } = args;
  let firstTokenTime: number | undefined;
  let usage:
    | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
    | undefined;
  let errored = false;
  let aborted = false;

  try {
    for await (const part of stream as AsyncIterable<{ type: string; [k: string]: unknown }>) {
      if (abortSignal?.aborted) {
        aborted = true;
        break;
      }
      if (part.type === "text-delta") {
        if (firstTokenTime === undefined) firstTokenTime = Date.now();
        const delta =
          (part as { delta?: string; text?: string }).delta ??
          (part as { text?: string }).text ??
          "";
        if (delta) broadcast({ requestId, type: "chunk", content: delta });
      } else if (part.type === "finish") {
        const u = (part as { usage?: typeof usage }).usage;
        if (u) usage = u;
      } else if (part.type === "error") {
        if (abortSignal?.aborted) {
          aborted = true;
          break;
        }
        errored = true;
        const err = (part as { error?: unknown }).error;
        broadcast({
          requestId,
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (abortSignal?.aborted) {
      aborted = true;
    } else {
      errored = true;
      broadcast({
        requestId,
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (errored || aborted) return;

  broadcast({
    requestId,
    type: "done",
    usage: usage
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        }
      : undefined,
    timing: {
      firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
      totalMs: Date.now() - startTime,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/main/services/llm/__tests__/streamEventBridge.test.ts`
Expected: PASS for all three cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/llm/streamEventBridge.ts \
        src/main/services/llm/__tests__/streamEventBridge.test.ts
git commit -m "feat(llm): add abort-aware fullStream → ChatStreamEvent bridge"
```

---

## Task 7: `extraParams` mapper

**Files:**
- Create: `src/main/services/llm/extraParamsMapper.ts`
- Test: `src/main/services/llm/__tests__/extraParamsMapper.test.ts`

Background: the legacy path did `Object.assign(createParams, request.extraParams)` so users could pass OpenAI top-level fields (`frequency_penalty`, `presence_penalty`, `response_format`, `seed`, etc.) directly. The AI SDK splits these into top-level streamText options (`frequencyPenalty`, `presencePenalty`, `seed`, `stopSequences`, `responseFormat`) and per-provider nested `providerOptions.{provider}`. We need an explicit mapping table.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/llm/__tests__/extraParamsMapper.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapExtraParams } from "../extraParamsMapper";

describe("mapExtraParams", () => {
  it("returns empty top + providerOptions when extraParams is missing", () => {
    expect(mapExtraParams("openai", undefined)).toEqual({ top: {}, providerOptions: {} });
    expect(mapExtraParams("openai", {})).toEqual({ top: {}, providerOptions: {} });
  });

  it("maps OpenAI-style snake_case top-level fields to AI SDK camelCase", () => {
    const out = mapExtraParams("openai", {
      frequency_penalty: 0.5,
      presence_penalty: -0.2,
      seed: 42,
      stop: ["END"],
      response_format: { type: "json_object" },
    });
    expect(out.top).toEqual({
      frequencyPenalty: 0.5,
      presencePenalty: -0.2,
      seed: 42,
      stopSequences: ["END"],
      responseFormat: { type: "json_object" },
    });
    expect(out.providerOptions).toEqual({});
  });

  it("routes unknown keys into providerOptions under the provider's key", () => {
    const out = mapExtraParams("openai", { logprobs: true, top_logprobs: 3 });
    expect(out.top).toEqual({});
    expect(out.providerOptions).toEqual({
      openai: { logprobs: true, top_logprobs: 3 },
    });
  });

  it("routes anthropic-specific keys to providerOptions.anthropic", () => {
    const out = mapExtraParams("anthropic", { top_k: 50, thinking: { type: "enabled" } });
    expect(out.top).toEqual({});
    expect(out.providerOptions).toEqual({
      anthropic: { top_k: 50, thinking: { type: "enabled" } },
    });
  });

  it("treats `stop` as alias for stopSequences regardless of preset", () => {
    expect(mapExtraParams("anthropic", { stop: ["X"] }).top).toEqual({
      stopSequences: ["X"],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/extraParamsMapper.test.ts`
Expected: FAIL with `Cannot find module '../extraParamsMapper'`.

- [ ] **Step 3: Create `extraParamsMapper.ts`**

```ts
// src/main/services/llm/extraParamsMapper.ts
import { providerOptionsKey } from "./providers";
import type { ModelProviderPreset } from "../../ipc/types";

/**
 * Subset of AI SDK `streamText` top-level options we know how to populate from
 * the OpenAI-style `extraParams` shape the renderer sends us.
 */
export interface MappedTopLevel {
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  responseFormat?: unknown;
}

export interface MappedExtraParams {
  top: MappedTopLevel;
  providerOptions: Record<string, Record<string, unknown>>;
}

/**
 * Known top-level field aliases (snake_case → AI SDK camelCase). Everything
 * not in this list falls through to provider-specific `providerOptions`.
 */
const TOP_LEVEL_ALIASES: Record<string, keyof MappedTopLevel> = {
  frequency_penalty: "frequencyPenalty",
  frequencyPenalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
  presencePenalty: "presencePenalty",
  seed: "seed",
  stop: "stopSequences",
  stop_sequences: "stopSequences",
  stopSequences: "stopSequences",
  response_format: "responseFormat",
  responseFormat: "responseFormat",
};

export function mapExtraParams(
  preset: ModelProviderPreset | undefined,
  extraParams: Record<string, unknown> | undefined,
): MappedExtraParams {
  const result: MappedExtraParams = { top: {}, providerOptions: {} };
  if (!extraParams) return result;

  const provider = providerOptionsKey(preset);
  for (const [k, v] of Object.entries(extraParams)) {
    if (v === undefined) continue;
    const aliased = TOP_LEVEL_ALIASES[k];
    if (aliased) {
      if (aliased === "stopSequences") {
        // accept either string or string[]
        (result.top as Record<string, unknown>)[aliased] = Array.isArray(v) ? v : [String(v)];
      } else {
        (result.top as Record<string, unknown>)[aliased] = v;
      }
      continue;
    }
    if (!result.providerOptions[provider]) result.providerOptions[provider] = {};
    result.providerOptions[provider][k] = v;
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/main/services/llm/__tests__/extraParamsMapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/llm/extraParamsMapper.ts \
        src/main/services/llm/__tests__/extraParamsMapper.test.ts
git commit -m "feat(llm): map extraParams to AI SDK top-level + providerOptions"
```

---

## Task 8: Unified `chatCompletionUnified()` with class-level flag

**Files:**
- Modify: `src/main/services/llm/LLMService.ts`
- Test: `src/main/services/llm/__tests__/LLMService.unifiedPath.test.ts`

Key design decisions baked in here:
- **Class-level flag**, not env var. Default off. `setUnifiedPath(enabled)` exposes runtime toggling.
- **Prompt-mode stays on legacy.** Dispatcher routes `toolCallMode === "prompt"` to the existing body unconditionally. `chatCompletionUnified` does not contain any prompt-mode code.
- **Abort is silent.** `controller.signal` flows into both `streamText` and `drainFullStream`.
- **`postResponse` hook delta broadcast preserved.** After the stream drains, if the hook mutated the response we broadcast the tail diff as an extra `chunk`, matching legacy.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/llm/__tests__/LLMService.unifiedPath.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatStreamEvent } from "../../../ipc/types";

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../providers", () => ({
  resolveProvider: () => ({ specificationVersion: "v2", modelId: "fake", provider: "fake" }),
  providerOptionsKey: () => "openai",
}));

const streamTextMock = vi.fn();
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: (...args: unknown[]) => streamTextMock(...args),
  };
});

function fakeResult(chunks: string[]) {
  const text = chunks.join("");
  return {
    fullStream: (async function* () {
      for (const c of chunks) yield { type: "text-delta", delta: c };
      yield {
        type: "finish",
        usage: { inputTokens: 1, outputTokens: chunks.length, totalTokens: 1 + chunks.length },
      };
    })(),
    text: Promise.resolve(text),
  };
}

describe("LLMService unified path", () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  it("streams text deltas and emits done when the flag is on", async () => {
    streamTextMock.mockReturnValueOnce(fakeResult(["Hel", "lo"]));
    const { LLMService } = await import("../LLMService");
    const service = new LLMService();
    service.setUnifiedPath(true);
    const events: ChatStreamEvent[] = [];
    const unsub = service.subscribeRequestEvents("rU", (e) => events.push(e));
    await service.chatCompletion({
      requestId: "rU",
      baseUrl: "x",
      apiKey: "x",
      model: "fake",
      messages: [{ role: "user", content: "hi" }],
      providerPreset: "openai",
    });
    unsub();
    expect(events.filter((e) => e.type === "chunk").map((e) => e.content)).toEqual([
      "Hel",
      "lo",
    ]);
    expect(events.find((e) => e.type === "done")?.usage?.totalTokens).toBe(3);
  });

  it("routes prompt-mode requests to the legacy path even when the flag is on", async () => {
    const { LLMService } = await import("../LLMService");
    const service = new LLMService();
    service.setUnifiedPath(true);
    // Spy on private legacy method via Object.getOwnPropertyDescriptor.
    const legacySpy = vi.spyOn(
      service as unknown as { chatCompletionLegacy: (...a: unknown[]) => Promise<void> },
      "chatCompletionLegacy" as never,
    );
    await service.chatCompletion({
      requestId: "rP",
      baseUrl: "x",
      apiKey: "x",
      model: "fake",
      messages: [{ role: "user", content: "hi" }],
      providerPreset: "openai",
      toolCallMode: "prompt",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(legacySpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/main/services/llm/__tests__/LLMService.unifiedPath.test.ts`
Expected: FAIL — `setUnifiedPath` / `chatCompletionLegacy` not implemented.

- [ ] **Step 3: Edit `LLMService.ts` — add the flag, rename legacy body, implement unified, wire dispatch**

a) Add imports at the top of the file:

```ts
import { stepCountIs, streamText } from "ai";
import { resolveProvider } from "./providers";
import { toModelMessages } from "./messageMapper";
import { buildToolSet } from "./toolAdapter";
import { drainFullStream } from "./streamEventBridge";
import { mapExtraParams } from "./extraParamsMapper";
```

b) Add a private field and a setter at the top of the class:

```ts
private useUnifiedPath = false;

/** Toggle the Vercel AI SDK unified path. Default off. */
setUnifiedPath(enabled: boolean): void {
  this.useUnifiedPath = enabled;
}
```

c) Rename the current `chatCompletion` body to a private `chatCompletionLegacy` method (signature identical to the previous public `chatCompletion`). Mechanically: change the line

```ts
async chatCompletion(
```

to

```ts
private async chatCompletionLegacy(
```

…leaving the entire body intact (including the legacy `if (request.providerPreset === "anthropic")` branch and `chatCompletionAnthropic` call).

d) Add the new dispatcher as the public `chatCompletion`:

```ts
async chatCompletion(
  rawRequest: ChatCompletionRequest,
  rawToolExecutor?: ToolExecutor,
): Promise<void> {
  // Prompt-mode (`<tool_call>` sentinel) cannot be expressed through the AI
  // SDK's tool loop, so it always stays on the legacy code path even when
  // the unified flag is on. See plan v2 §Architecture.
  if (this.useUnifiedPath && rawRequest.toolCallMode !== "prompt") {
    return this.chatCompletionUnified(rawRequest, rawToolExecutor);
  }
  return this.chatCompletionLegacy(rawRequest, rawToolExecutor);
}
```

e) Add `chatCompletionUnified`:

```ts
private async chatCompletionUnified(
  rawRequest: ChatCompletionRequest,
  rawToolExecutor?: ToolExecutor,
): Promise<void> {
  const gated = this.applyPlanModeGate(rawRequest, rawToolExecutor);
  const request = gated.request;
  const toolExecutor = gated.toolExecutor;

  const controller = new AbortController();
  this.activeStreams.set(request.requestId, controller);

  const messages = toModelMessages(request.messages).slice();

  // preSend hook parity
  if (this.chatHookRegistry?.hasHooks("preSend")) {
    const ctx: import("../plugin/types").PreSendHookContext = {
      messages: messages.map((m) => ({
        role: String((m as { role: string }).role),
        content:
          typeof (m as { content?: unknown }).content === "string"
            ? (m as { content: string }).content
            : JSON.stringify((m as { content?: unknown }).content ?? ""),
      })),
    };
    await this.chatHookRegistry.runPreSendHooks(ctx);
    if (ctx.cancelled) {
      this.broadcast({ requestId: request.requestId, type: "done" });
      this.activeStreams.delete(request.requestId);
      return;
    }
  }

  // systemPrompt hook parity
  if (this.chatHookRegistry?.hasHooks("systemPrompt")) {
    const first = messages[0];
    if (first && first.role === "system" && typeof first.content === "string") {
      const ctx = { systemPrompt: first.content };
      await this.chatHookRegistry.runSystemPromptHooks(ctx);
      (first as { content: string }).content = ctx.systemPrompt;
    }
  }

  const model = resolveProvider({
    preset: request.providerPreset,
    baseUrl: request.baseUrl,
    apiKey: request.apiKey,
    model: request.model,
  });

  const toolSet = buildToolSet({
    request,
    toolExecutor,
    broadcast: (e) => this.broadcast(e),
    checkPermission: ({ toolCallId, toolName, toolArgs }) =>
      this.checkToolPermission(
        request.requestId,
        request.toolPermission,
        toolCallId,
        toolName,
        toolArgs,
        request.conversationId,
      ),
    evaluateRuntimePolicy: (toolName, args) =>
      this.evaluateToolRuntimePolicy(request.conversationId, toolName, args),
  });

  const mapped = mapExtraParams(request.providerPreset, request.extraParams);

  const startTime = Date.now();
  let accumulatedText = "";
  // Tap into chunks so we can compute a postResponse delta later.
  const taggingBroadcast = (e: ChatStreamEvent) => {
    if (e.type === "chunk" && typeof e.content === "string") {
      accumulatedText += e.content;
    }
    this.broadcast(e);
  };

  try {
    const result = streamText({
      model,
      messages,
      tools: toolSet,
      stopWhen: stepCountIs(10),
      abortSignal: controller.signal,
      temperature: request.temperature ?? 0.7,
      topP: request.topP,
      maxOutputTokens: request.maxTokens ?? 4096,
      ...mapped.top,
      providerOptions:
        Object.keys(mapped.providerOptions).length > 0
          ? mapped.providerOptions
          : undefined,
    });

    await drainFullStream(result.fullStream, {
      requestId: request.requestId,
      broadcast: taggingBroadcast,
      startTime,
      abortSignal: controller.signal,
    });

    // postResponse hook: broadcast tail delta if hook mutated the response,
    // matching legacy behaviour.
    if (
      !controller.signal.aborted &&
      accumulatedText &&
      this.chatHookRegistry?.hasHooks("postResponse")
    ) {
      const ctx = { response: accumulatedText };
      await this.chatHookRegistry.runPostResponseHooks(ctx);
      if (ctx.response !== accumulatedText) {
        const tail = ctx.response.slice(accumulatedText.length);
        if (tail) {
          this.broadcast({
            requestId: request.requestId,
            type: "chunk",
            content: tail,
          });
        }
      }
    }
  } catch (error: unknown) {
    if (controller.signal.aborted) return;
    this.broadcast({
      requestId: request.requestId,
      type: "error",
      error: error instanceof Error ? error.message : "Stream failed",
    });
  } finally {
    this.activeStreams.delete(request.requestId);
  }
}
```

- [ ] **Step 4: Run unified-path test**

Run: `pnpm test:run src/main/services/llm/__tests__/LLMService.unifiedPath.test.ts`
Expected: PASS — text streaming case and prompt-mode-routes-to-legacy case both green.

- [ ] **Step 5: Run all LLM tests — legacy snapshots MUST still be green**

Run: `pnpm test:run src/main/services/llm`
Expected: PASS. If `LLMService.legacy.test.ts` regressed, the rename of `chatCompletion` → `chatCompletionLegacy` was applied wrong (the dispatcher's else branch must still call it for flag-off cases).

- [ ] **Step 6: Type-check the whole project**

Run: `pnpm check`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/llm/LLMService.ts \
        src/main/services/llm/__tests__/LLMService.unifiedPath.test.ts
git commit -m "feat(llm): add unified chatCompletion path behind a class-level flag"
```

---

## Task 9: End-to-end smoke against real providers (manual)

**Files:** none (manual verification)

- [ ] **Step 1: Wire a temporary toggle so the flag can be flipped at runtime**

Edit `src/main/main.ts` (or whichever file constructs `llmService`) to read an env var **once at startup** and call `setUnifiedPath`:

```ts
if (process.env.LLM_UNIFIED_PATH === "1") {
  llmService.setUnifiedPath(true);
}
```

This avoids burying the toggle in unit-test files.

- [ ] **Step 2: Start dev server with the flag on**

Run: `LLM_UNIFIED_PATH=1 pnpm dev`
Expected: Electron launches; no errors in main log.

- [ ] **Step 3: Plain chat smoke (openai + anthropic)**

Configure both providers in Settings → Models. Send "say hi" to each. Expected: tokens stream, message completes, usage shown.

- [ ] **Step 4: Tool-call smoke with FS MCP (openai + anthropic)**

In a project with `@scp/file-system`, ask the model to read a known file. Expected: tool approval card (if `approve_always`), then tool result, then final answer. Runtime inspector shows an `allowed` audit entry.

- [ ] **Step 5: Abort smoke**

Send a long-running prompt, click Stop. Expected: stream halts; **no red "Stream failed" toast**; message marked stopped.

- [ ] **Step 6: extraParams smoke**

In Settings → Models, add an extra parameter `response_format: { "type": "json_object" }` for an OpenAI provider. Ask "Give me a JSON object with a 'hello' key". Expected: response is valid JSON, not free text.

- [ ] **Step 7: Prompt-mode regression check**

Configure DeepSeek-R1 (or any prompt-mode model). Ask it to use a tool. Expected: tool is actually called (legacy code path still in effect for prompt-mode). If this fails, the dispatcher in Task 8 step 3d has a bug.

- [ ] **Step 8: Record the smoke result**

Create `docs/superpowers/plans/2026-06-23-unified-agent-layer-vercel-ai-sdk.smoke.md`:

```markdown
# Unified Path Smoke Verification — YYYY-MM-DD

| Scenario | Provider | Result |
|---|---|---|
| Plain chat | openai | ✅ |
| Plain chat | anthropic | ✅ |
| Tool call (FS MCP) | openai | ✅ |
| Tool call (FS MCP) | anthropic | ✅ |
| Stop mid-stream | openai | ✅ |
| extraParams (response_format) | openai | ✅ |
| Prompt-mode (legacy) | deepseek-r1 | ✅ |

Notes: …
```

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/plans/2026-06-23-unified-agent-layer-vercel-ai-sdk.smoke.md src/main/main.ts
git commit -m "docs(llm): record unified path smoke verification + env toggle"
```

---

## Task 10: Cutover — delete the legacy path

Only start after Task 9 has been green for at least 48 hours.

**Files:**
- Modify: `src/main/services/llm/LLMService.ts`
- Modify: `package.json`, `pnpm-lock.yaml`
- Delete: `src/main/services/llm/__tests__/LLMService.legacy.test.ts`

- [ ] **Step 1: Delete the legacy branches in `LLMService.ts`**

In `src/main/services/llm/LLMService.ts`:

- Delete `chatCompletionAnthropic()`.
- Delete `chatCompletionLegacy()`.
- Delete `useUnifiedPath` field and `setUnifiedPath()` method (the flag is no longer needed).
- Replace `chatCompletion` body with:

```ts
async chatCompletion(
  rawRequest: ChatCompletionRequest,
  rawToolExecutor?: ToolExecutor,
): Promise<void> {
  // Prompt-mode (`<tool_call>` sentinel) is not supported by the unified
  // path. If the renderer requests it, it's an explicit error.
  if (rawRequest.toolCallMode === "prompt") {
    throw new Error(
      "toolCallMode='prompt' is no longer supported after the unified-path cutover.",
    );
  }
  return this.chatCompletionUnified(rawRequest, rawToolExecutor);
}
```

Note: if there are still active users of prompt-mode (DeepSeek-R1 callers), defer this task and keep `chatCompletionLegacy` around. Search:

```bash
pnpm exec rg 'toolCallMode\s*:\s*"prompt"' src
```

If matches exist, address them first.

- [ ] **Step 2: Update `testConnection` and `fetchModels` to drop the `openai` package dependency**

Replace the bodies with fetch-based implementations:

```ts
async fetchModels(baseUrl: string, apiKey: string, preset?: ModelProviderPreset) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey || "sk-placeholder"}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const raw = (json.data ?? []).map((m) => ({ id: m.id, name: m.id }));
  raw.sort((a, b) => a.id.localeCompare(b.id));
  return normalizeModels(raw, preset);
}

async testConnection(baseUrl: string, apiKey: string) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey || "sk-placeholder"}` },
    });
    if (!res.ok) {
      return { success: false, latencyMs: Date.now() - start, error: `HTTP ${res.status}` };
    }
    return { success: true, latencyMs: Date.now() - start };
  } catch (error: unknown) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
```

- [ ] **Step 3: Remove now-unused imports and helpers from `LLMService.ts`**

- `import Anthropic from "@anthropic-ai/sdk";`
- `import OpenAI from "openai";`
- `import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";`
- `MAX_TOOL_ROUNDS` constant.
- `classifyToolKind`, `extractTarget`, `safeParseArgs`, `createToolOutcomeEvent` — **verify each has no remaining references** before deleting. `classifyToolKind` and `extractTarget` are used by `evaluateToolRuntimePolicy`; keep those two if so.
- `import { buildToolPrompt, hasToolBlocks, parseToolCallsFromText } from "./promptModeFallback";` — no longer needed in `LLMService.ts` after legacy deletion. The module file itself is **kept on disk** for now (`promptModeFallback.ts`) so DeepSeek-R1 users can resurrect prompt-mode in a future feature without re-doing the extraction.

- [ ] **Step 4: Verify nothing outside `LLMService.ts` still imports `openai` or `@anthropic-ai/sdk`**

Run: `pnpm exec rg "from ['\"]openai['\"]|from ['\"]@anthropic-ai/sdk['\"]" src`
Expected: zero matches. If anything else shows up, convert those before continuing.

- [ ] **Step 5: Drop the packages**

```bash
pnpm remove openai @anthropic-ai/sdk
```

Expected: both packages disappear from `package.json` and `pnpm-lock.yaml`.

- [ ] **Step 6: Delete the legacy snapshot tests**

```bash
rm src/main/services/llm/__tests__/LLMService.legacy.test.ts
```

Rationale: the file mocks `openai` and `@anthropic-ai/sdk` which no longer resolve.

- [ ] **Step 7: Lint + typecheck + tests**

Run: `pnpm check && pnpm lint && pnpm test:run`
Expected: all green.

- [ ] **Step 8: Re-smoke (Task 9 steps 3, 4, 5) to confirm cutover didn't regress anything**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(llm)!: drop openai + @anthropic-ai/sdk; unified path is the only path"
```

---

## Task 11 (Optional): Extend provider coverage

After cutover, adding a new preset is one branch in `providers.ts` plus one `it` in `providers.test.ts`. Do this opportunistically. Example for Mistral:

```ts
case "mistral": {
  const provider = createMistral({ apiKey, baseURL: baseUrl });
  return provider(model);
}
```

…with matching test:

```ts
it("returns a LanguageModelV2 for mistral preset", () => {
  const m = resolveProvider({ preset: "mistral", baseUrl: "x", apiKey: "k", model: "m" });
  expect(m.specificationVersion).toBe("v2");
});
```

---

## Roll-back plan

- Before **Task 10**: call `llmService.setUnifiedPath(false)` (or `unset LLM_UNIFIED_PATH` and restart). Legacy path is byte-for-byte intact and pinned by `LLMService.legacy.test.ts`.
- After **Task 10**: `git revert` the cutover commit. The reverted state will need `pnpm install` to put `openai` and `@anthropic-ai/sdk` back.

## What v2 changed vs v1

| Issue | Resolution |
|---|---|
| 🔴 Prompt-mode broken on unified path | Dispatcher routes `toolCallMode === "prompt"` to legacy unconditionally; unified body contains no prompt-mode code. |
| 🔴 `extraParams` shape mismatch | Task 7 splits OpenAI-style fields into AI SDK top-level + `providerOptions` via explicit mapping table. |
| 🔴 Abort would broadcast error | `drainFullStream` takes `abortSignal`; on abort it silently exits without `done` or `error`. Tested in Task 6 step 1 case 3 and Task 0 step 1 case 4. |
| 🔴 No regression coverage for legacy path | Task 0 pins four legacy scenarios (text, tool call, anthropic text, abort) before any extraction starts. Every later task re-runs them. |
| 🟡 Executor-throws semantics | New test case in Task 5 asserts adapter rethrows so SDK feeds the error back to the model (matches legacy "tool error message → next round"). |
| 🟡 env-var flag pollutes tests | Replaced with class-level `setUnifiedPath()`; production toggle is one line in `main.ts` (Task 9 step 1). |
| 🟡 postResponse hook delta lost | Task 8's `taggingBroadcast` records `accumulatedText`; post-stream hook diff is broadcast as a tail `chunk` event, matching legacy. |
| 🟢 `stepCountIs(10)` vs `MAX_TOOL_ROUNDS` | Documented; no behavioural change expected at the common limits. |
| 🟢 Task 9 dep-removal ordering | Reordered so legacy code is deleted **before** `rg` runs and **before** `pnpm remove`. |
