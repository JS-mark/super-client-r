# Unified Path Smoke Verification — 2026-06-23

End-to-end smoke test of the Vercel AI SDK unified `chatCompletion` path
behind `LLM_UNIFIED_PATH=1`. Tested via the local HTTP server
(`http://localhost:3000/v1/llm/chat/completions`) so the same code path the
renderer / external clients exercise gets validated, without needing UI.

## Environment

| Item | Value |
|---|---|
| Branch | `feat/llm-unified-agent` @ `3244573` |
| Base | `main` @ `bb1374d` |
| Toggle | `LLM_UNIFIED_PATH=1 pnpm dev` (verified `[INFO][App] LLMService: unified path enabled` at startup) |
| Providers exercised | dashscope (qwen-flash, qwen-plus) — OpenAI-compatible default branch; openrouter (deepseek-chat-v3.1) — createOpenRouter branch |

Anthropic / OpenAI first-party branches were not exercised because the running
install only had openrouter + dashscope configured. Coverage is therefore:

- ✅ `createOpenAI(...).chat()` fallback path (via dashscope)
- ✅ `createOpenRouter()` path (via openrouter)
- ❌ `createAnthropic()` path — needs a user with an Anthropic key

## Results

| # | Scenario | Provider | Outcome |
|---|---|---|---|
| 1 | Plain chat: streaming + done + usage + timing | dashscope · qwen-flash | ✅ chunks streamed in 280ms (first token) / 529ms (total) — done included `inputTokens:15, outputTokens:19, totalTokens:34` after the fix |
| 2 | Plain chat: streaming + done + usage + timing | openrouter · deepseek/deepseek-chat-v3.1 | ✅ done included `inputTokens:9, outputTokens:18, totalTokens:27` after the fix |
| 3 | Stop mid-stream: silent halt | dashscope · qwen-plus | ✅ 13 chunks broadcast before stop, then **0 done + 0 error** events. `POST /v1/llm/stop` returned `stopped: true` |
| 4 | `extraParams.response_format: { type: "json_object" }` | dashscope · qwen-plus | ✅ Model output reassembled to exactly `{"hello": "world"}` — no markdown / prose, JSON.parse succeeds. Confirms `extraParamsMapper` correctly routes `response_format` to AI SDK top-level `responseFormat` |
| 5 | Prompt-mode dispatch: `toolCallMode:"prompt"` must route to legacy | dashscope · qwen-plus | ✅ Stream completes cleanly with chunks + done + usage (13/55/68). `LLMService.unifiedPath.test.ts` already pins the dispatcher contract (flag-on + prompt-mode → legacy, not streamText) with a `vi.spyOn` on `chatCompletionLegacy`. The live smoke confirms the path is functional end-to-end |
| 6 | Tool call round-trip: model picks tool → adapter executes → second-round response | dashscope · qwen-plus + `@scp/file-system.read_file` | ✅ Event sequence: `tool_call` (model picked `read_file({"path":"/tmp/smoke-fc.txt"})`) → `tool_result` (MCP returned file contents, `duration:3ms`, `isError:false`) → 9× `chunk` (model's second-round answer) → `done` (`usage:{424,59,483}`). Validates: tool adapter broadcast wrapping, toolMapping → MCP dispatch, AI SDK `stopWhen` multi-step loop, approval gate auto-pass, and full IPC event contract preserved |

## Bug found and fixed during smoke

First pass surfaced a **missing `done.usage`** on every request even though
chunks were streaming fine. Root cause: AI SDK 6 renamed the
`finish` stream part's usage field from `usage` → `totalUsage` (the
per-step `finish-step` parts retained `usage`). The bridge was only
reading `part.usage`.

Fix in `3244573 fix(llm): read totalUsage from AI SDK 6 finish part + handle abort part`:

```ts
const u =
  (part as { totalUsage?: typeof usage }).totalUsage ??
  (part as { usage?: typeof usage }).usage;
if (u) usage = u;
```

Also added handling for the new dedicated `abort` stream part (SDK 6 emits
it explicitly in addition to honouring `abortSignal`) — falls into the
same "silent halt" branch as a signal-detected abort.

Re-running scenarios 1 + 2 after the fix produced full `done.usage` payloads.

## Carry-forwards (not blocking)

- **createAnthropic branch unexercised.** When a tester with an Anthropic
  API key runs scenarios 1, 3, and 6 against `providerPreset: "anthropic"`,
  that closes the only remaining coverage gap before Task 10 cutover.
  Concretely: `messageMapper.toModelMessages` handles `tool_calls` and
  `tool` role messages identically across providers, but the Anthropic
  branch's wire format conversion is what AI SDK does internally — verify
  once before deleting the legacy `chatCompletionAnthropic`.
- **48h soak** with the flag on (`LLM_UNIFIED_PATH=1`) is the standard
  gate per the plan's Task 10. Anything dashscope / openrouter related
  surfaces during day-to-day use will land on the legacy path with the
  flag off and on the unified path with it on; if no regression reports
  arrive, that's a strong signal.

## Conclusion

Unified path is **safe to keep as the default for the rolling window**:

```bash
LLM_UNIFIED_PATH=1 pnpm dev
```

All six smoke scenarios pass; the one bug found during smoke was caught
by direct event inspection, fixed in ~10 lines, and pinned with a new
unit test case so regressions are surfaced offline next time. The
remaining work before Task 10 cutover is:

1. Run scenarios 1, 3, 6 against an Anthropic-preset provider.
2. Let the flag bake for 48h on real day-to-day chat traffic.
3. Then delete legacy + drop `openai` and `@anthropic-ai/sdk` deps.
