# Context Management & Token Auto-Compression Plan

> 状态：**in progress** · 优先级：P2（Export/Recovery、Privacy 产品入口之后）
>
> 索引：[refactor-plan](./refactor-plan.md) · 进度：[refactor-progress](./refactor-progress.md)
>
> 相关：[design-doc.md](./design-doc.md) §Context/Memory、[requirements-plan.md](./requirements-plan.md) Phase 3

---

## 1. 问题陈述

### 当前现状

项目已进入 Context/Memory 分批实现：发送管线会把裁剪后的历史作为 `AgentHistoryMessage[]` 传给 Agent runtime，`ClaudeCodeAgentRuntime` 已能读取 `PromptPart[]` history，并且 cwd 下 `AGENTS.md` / `CLAUDE.md` 会通过 main process `ProjectRulesReader` 注入 system prompt。当前新增了 metadata-level context source / strategy 回放：发送管线会把本轮 history 策略、附件/搜索/历史/tool 来源和本地 compact marker 写回当前 assistant message metadata，Context Inspector 优先读取这些 metadata。`context.compacted` shared event/main materializer/renderer persistence path 已有最小接线；main runtime project-rules snapshot DTO 已接到 `init` / `run.started`，只回传文件名、byteLength、sha256、truncated、injected，不回传正文或绝对路径。LLM summarize seam 和真实 HTTP summarizer provider 已接线，并于 2026-07-18 复验通过（`contextSummarizer` SSE integration test + `useAgentSendPipeline` compact 注入用例）；metadata-level pin/unpin 已接到 Inspector 和下一轮 send metadata；session-scoped artifact library MVP 已接到 Inspector。

**核心缺口：**

| 问题 | 代码事实 |
| --- | --- |
| 历史回放基础 | 已完成：`useAgentSendPipeline.ts` 传入 `history`，并排除当前 user + assistant placeholder |
| 类型不匹配 | 已完成：`ClaudeCodeAgentRuntime.buildChatRequest()` 支持 `PromptPart[]` text extraction |
| contextCount 死代码 | 已完成低风险切片：发送管线读取 `SessionSettings.contextCount` 作为 sliding window |
| contextMode 未实现 | 已完成低风险切片：`SessionSettings.contextMode` + Settings segmented control + auto/compact/full 策略入口 |
| contextCompacted 占位 | 已完成 metadata-level 写入、shared/main/renderer `context.compacted` product/session event 最小链路；已于 2026-07-18 复验通过 |
| Token 数据仅展示 | `computeContextUsage()` 仍只驱动 UI；发送策略使用 model `contextWindow` + estimateTokens 进行预算判断，尚未使用真实 API usage 回写 |

### 目标

1. **多轮历史回放**：将对话历史组装为 `AgentHistoryMessage[]` 并传入 `createQuery`
2. **Token 预算感知**：利用已有的 `contextWindow` 和 token 估算决定发送策略
3. **自动压缩**：当历史 token 超出预算时，通过可注入 LLM 摘要接缝压缩旧消息；真实 HTTP 摘要调用已接到本地 `/v1/llm/chat/completions`，已于 2026-07-18 复验通过（SSE integration test + pipeline compact 注入用例）
4. **用户可控**：激活 `contextCount`（消息数量限制）和 `contextMode`（策略选择）

---

## 2. 架构设计

### 数据流（实现后）

```
User sends message
  │
  ▼
useSendMessage
  ├── createUserTurnPair → addMessage (user + assistant placeholder)
  └── sendAgentMessage (via useAgentSendPipeline)
        │
        ├── resolveModel, buildPromptContext, loadTools (existing)
        │
        ├── ── NEW: Context Strategy ──
        │   ├── 读取 chatMessageStore.messages
        │   ├── applyContextStrategy()
        │   │   ├── mode="full"      → 全量 → messagesToAgentHistory()
        │   │   ├── mode="sliding"   → 尾部裁剪 → messagesToAgentHistory()
        │   │   ├── mode="compact"   → 摘要压缩旧消息 → [summaryMsg, ...recent]
        │   │   └── mode="summarize"  → token 超预算 → 摘要 → [summaryMsg, ...recent]
        │   └── 转换为 AgentHistoryMessage[]
        │
        └── createQuery({ requestId, conversationId, prompt, history, tools, cwd })
              │
              ▼ IPC
        AgentRuntimeIpcBroker.createQuery()
              │
              ▼
        ClaudeCodeAgentRuntime.createQuery()
              └── buildChatRequest()
                  ├── system prompt
                  ├── history (PromptPart[] → 文本提取) ← 修复
                  └── current user message
```

### Token 预算计算

```
contextWindow (from model, e.g. 200K)
  - systemPromptTokens (~8K)
  - toolsTokens (~4K)
  - reserve (剩余 10%)
  ──────────────────────
  = availableForMessages (~169K)

If messages > availableForMessages:
  auto mode    → 对旧消息做 LLM 摘要直到预算内
  compact mode → 始终摘要旧消息的 50%
  full mode    → 全量发送（可能超出限制）
```

### 三种上下文策略

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| **auto** (默认) | 估算 token 用量，超预算时自动摘要压缩旧消息 | 大多数场景 |
| **compact** | 始终保留最近 50% 消息，旧消息全部摘要化 | 节省 token、长会话 |
| **full** | 全量发送，不做任何压缩 | 需要完整上下文、短会话 |

---

## 3. 文件结构

| 文件 | 职责 | 状态 |
| --- | --- | --- |
| `src/renderer/src/lib/contextManager.ts` | 核心上下文管理纯函数模块 | 新建 |
| `src/renderer/src/lib/__tests__/contextManager.test.ts` | contextManager 单元测试 | 新建 |
| `packages/shared-types/src/chat.ts` | `Message.metadata` 添加 `contextCompacted`、`contextSources`、`contextStrategy` 字段 | 修改 |
| `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts` | 修复 `buildChatRequest` history 处理 | 修改 |
| `src/renderer/src/hooks/useAgentSendPipeline.ts` | 组装历史、应用策略、传入 `history` | 修改 |
| `src/renderer/src/hooks/useChat.ts` | 提供消息/token 预算/摘要调用等依赖 | 修改 |
| `src/renderer/src/components/chat/ChatSettingsModal.tsx` | 添加 `contextMode` 选择器 UI | 修改 |
| `src/renderer/src/hooks/useContextUsage.ts` | 暴露原始 contextWindow 给管线 | 待定（当前管线直接使用 resolved model contextWindow） |
| `src/main/services/agent/runtime/agentSdkLegacyAdapter.ts` | 补充空历史注释说明 | 修改 |
| `src/renderer/src/components/chat/ChatMessageList.tsx` (或对应消息组件) | 压缩摘要消息的视觉标记 | 修改 |

---

## 4. 实现任务

### Task 1: Message 类型扩展 — 添加 `contextCompacted`

**文件：** `packages/shared-types/src/chat.ts` Message.metadata

在 `metadata` 对象中添加：

```typescript
contextCompacted?: {
  compacted: true;
  summary: string;
  originalCount: number;
  compactedAt: number;
};
```

**验收：** `pnpm check` 通过，无新增类型错误。

---

### Task 2: 核心引擎 `contextManager.ts` + 测试

**文件：** 新建 `src/renderer/src/lib/contextManager.ts`、`src/renderer/src/lib/__tests__/contextManager.test.ts`

纯函数模块（无 React、无副作用），包含：

| 函数/类型 | 职责 |
| --- | --- |
| `ContextBudget` / `ContextBudgetResult` | Token 预算计算：contextWindow - overhead - reserve |
| `ContextStrategyInput` / `ContextStrategyResult` | 策略输入/输出类型 |
| `computeContextBudget(budget)` | 计算 availableForMessages |
| `applyContextStrategy(input)` | 核心策略引擎：根据 contextCount/contextMode/budget 选择 full/sliding/compact/summarize |
| `summarizeMessagesText(messages, opts?)` | 将消息列表格式化为 LLM 摘要输入文本 |
| `messageToAgentHistory(msg)` | Message → AgentHistoryMessage 单条转换（跳过 system/tool） |
| `messagesToAgentHistory(messages)` | 批量转换 |
| `createSummaryMessage(summary, count, originals)` | 创建合成摘要 Message，带 contextCompacted metadata |

**策略优先级：**

1. `contextCount >= 0` → 硬消息数量限制（滑动窗口）
2. `contextMode === "full"` → 全量发送
3. `contextMode === "compact"` → 始终摘要旧消息
4. `contextMode === "auto"` → 估算 token，超预算则摘要

**测试覆盖：**

- `computeContextBudget`：正常预算、null contextWindow、overhead 超窗口
- `summarizeMessagesText`：正常消息、超长截断、空列表
- `applyContextStrategy`：小上下文 full、contextCount 限制 sliding、auto 超预算 summarize、compact 模式、null contextWindow 降级、边界消息保护
- `messageToAgentHistory`：跳过 tool/system、空内容处理
- `createSummaryMessage`：metadata 结构正确性

**验收：** `pnpm vitest run src/renderer/src/lib/__tests__/contextManager.test.ts` 全部通过。

---

### Task 3: 修复 `buildChatRequest` History 处理

**文件：** `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts:379-390`

当前代码 `typeof content === "string"` 导致 `PromptPart[]` 格式的历史被静默跳过。

**修改为：**

```typescript
if (Array.isArray(rawContent)) {
  // AgentHistoryMessage.content: PromptPart[]
  textContent = rawContent
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n");
} else if (typeof rawContent === "string") {
  textContent = rawContent; // legacy compat
}
```

**验收：** 新增 focused test 验证 `PromptPart[]` 内容被正确提取。

---

### Task 4: 管线集成 — `useAgentSendPipeline`

**文件：** `src/renderer/src/hooks/useAgentSendPipeline.ts`

**改动：**

1. `UseAgentSendPipelineOptions` 新增依赖字段：
   - `getMessages: () => Message[]`
   - `getContextWindow: () => number | null`
   - `getSystemPromptTokens: () => number`
   - `getToolsTokens: () => number`
   - `summarizeContext?: (text: string) => Promise<string>`

2. `sendAgentMessage` 内部，在 `buildPromptContext` 之后：
   - 读取 messages（排除最后 2 条：当前 user + assistant placeholder）
   - 调用 `applyContextStrategy()`
   - 若 `needsSummarization` 且有 `summarizeContext`，执行 LLM 摘要调用
   - 调用 `messagesToAgentHistory()` 转换
   - 将 `history` 传入 `createQuery` payload

**验收：** `pnpm check` 通过（useChat.ts 需同步更新 options）。

---

### Task 5: Hook 连接 — `useChat`

**文件：** `src/renderer/src/hooks/useChat.ts`

在 `useAgentSendPipeline` options 中提供新依赖：

- `getMessages` → `useChatMessageStore.getState().messages`
- `getContextWindow` → 从 `effectiveModelRef.current.model.contextWindow`
- `getSystemPromptTokens` → `estimateTokensSync(systemPrompt) + 600`
- `getToolsTokens` → `estimateTokensSync(JSON.stringify(tools))`
- `summarizeContext` → 调用 LLM HTTP 端点执行摘要（复用 `ClaudeCodeAgentRuntime` 的 port 解析模式）

摘要系统 prompt：

```
You are a conversation summarizer. Summarize the following conversation history concisely.
Preserve key facts, decisions, code snippets, and context needed to continue the conversation.
Write in the same language. Keep under 2000 tokens.
```

**验收：** 类型检查通过 + dev smoke 可发送带历史的请求。

---

### Task 6: Settings UI — 添加 `contextMode` 选择器

**文件：** `src/renderer/src/components/chat/ChatSettingsModal.tsx`

1. `SessionSettings` 接口添加 `contextMode: "auto" | "compact" | "full"`（默认 `"auto"`）
2. 在 `contextCount` 滑块下方添加三选一按钮组（Auto / Compact / Full）
3. 添加模式说明文案
4. 添加 i18n key（中/英）

**UI 草案：**

```
Context Count          [====○=================] 20
Context Mode           [Auto] [Compact] [Full]
                       Auto: 自动压缩旧消息当 token 超出预算时
```

**验收：** Settings 面板显示 contextMode 选择器，`pnpm check` 通过。

---

### Task 7: `useContextUsage` 暴露原始数据

**文件：** `src/renderer/src/hooks/useContextUsage.ts`

在返回值中暴露 `contextWindow` 和 `hasApiTruth`，供 `useChat` 获取 contextWindow。

---

### Task 8: Legacy Adapter 注释

**文件：** `src/main/services/agent/runtime/agentSdkLegacyAdapter.ts`

补充 `history: []` 注释说明：legacy 路径不访问 renderer message store，空历史是有意设计。

---

### Task 9: UI 指示器 — 压缩摘要消息视觉标记

**状态：** 已完成（commit 13fe6de，2026-07-18）。

**文件：** 消息渲染组件（检查现有 error message 特殊渲染模式，沿用相同模式）

对 `message.metadata.contextCompacted` 的消息渲染：

- 顶部显示琥珀色标签：`⟨⟩ N messages compacted`
- 正文区域：浅灰背景展示摘要内容

当前已完成的较小切片：Context Inspector 会展示 latest assistant message metadata 中的 history strategy 和 compact event；shared product event 已有最小 `context.compacted` contract，并可经 main materializer 转成带 `metadata.contextCompacted` 的 `assistant_message`；发送链路已接到 renderer product-event persistence helper；LLM summarize 注入接缝和真实 HTTP summarizer provider 已存在。message list 中的专用摘要卡片已完成（`CompactedSummaryCard`，commit 13fe6de）：`ChatMessageList` 对 `role === "assistant"` 且带 `metadata.contextCompacted` 的消息并行渲染专用卡片；组件 focused test 已覆盖（`CompactedSummaryCard.test.tsx`）。

### Task 9b: Context Inspector metadata source replay

**状态：** metadata-level done，product event contract/materializer minimum done，send-pipeline product-event persistence wired but awaiting dependency-restored verification。

当前发送管线会写入：

- `metadata.contextSources`：system prompt、runtime project-rules check、attachments count、search result count、history count、runtime tool count。
- `metadata.contextStrategy`：`mode`、`strategy`、history count、omitted count、estimated tokens、available budget、是否 compacted。
- `metadata.contextCompacted`：compact/auto summarized 时的本地 summary marker。

Context Inspector 优先读取这些 metadata；旧会话无 metadata 时才回退到 system/project/attachment chips。

pin/unpin 当前是 metadata-level 最小闭环：Inspector source 行可把 `MessageContextSource.pinned` 写回 latest context assistant message metadata；下一轮 `useAgentSendPipeline` 重新生成同 id context source 时保留 `pinned:true`。本轮未实际出现的过期 search/attachment source 不会因 pinned 被强行追加显示，避免把“曾经固定”误表示为“仍已注入”。

已知限制：

- `projectRules` source 当前已有 main runtime snapshot DTO，并已接入 assistant metadata / Context Inspector source breakdown；可证明具体规则文件的 filename、byteLength、sha256、truncated、injected，且不回传正文或绝对路径。该链路已于 2026-07-18 复验通过。
- `context.compacted` product event 当前已有 shared factory + main materializer + JSONL replay 测试，并已接入 renderer send pipeline persistence path；LLM summarize seam / HTTP provider 已接入。该链路已于 2026-07-18 复验通过。

---

### Task 10: 集成测试 & 边界

**状态：** 自动化已覆盖边界逻辑 + 组件 + HTTP body；GUI 手动 smoke 待用户。

**测试补充（自动化覆盖映射）：**

- 空/单条消息列表 — **已覆盖**：`src/renderer/src/lib/__tests__/contextManager.test.ts` → `applyContextStrategy boundary cases` 中的 “handles an empty message list without compaction or summarization” 与 “leaves a single-message list untouched in compact mode”。
- 滑动窗口消息顺序保持 — **已覆盖**：同文件 “preserves chronological order of the sliding-window tail (not reversed)”（5 条消息保留尾部 3 条，断言保持原序）；既有 `applies contextCount as a hard sliding window` 覆盖 2 条保留窗口。
- 摘要消息在返回数组中的位置 — **已覆盖**：同文件 “places the summary message FIRST, followed by retained recent messages in order”（断言 summary 在 index 0，retained tail 保持原序）。
- `messageToAgentHistory` 跳过 tool 消息 — **已覆盖**：同文件 “skips tool and empty messages”（line 75）。
- `createSummaryMessage` metadata 正确性 — **已覆盖**：同文件 “creates a summary message with contextCompacted metadata”（line 84）。
- HTTP summarize body shape — **已覆盖**（T1）：`src/renderer/src/services/agent/__tests__/contextSummarizer.integration.test.ts` 断言 SSE POST body 含 provider/model/system prompt/user history。
- pipeline compact 注入 — **已覆盖**：`src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts` 的 `uses injected LLM summarizer when compacting context` 等 4 个 compact/summarize 用例。
- 摘要卡片组件 — **已覆盖**（T2）：`src/renderer/src/components/chat/__tests__/CompactedSummaryCard.test.tsx` + `ChatMessageList` 在 `metadata.contextCompacted` 存在时并行渲染分支。

**手动 smoke（GUI Electron，待用户执行）：**

> 自动化已覆盖：HTTP body shape（T1 integration test）、摘要卡片组件渲染（T2 组件 test）、摘要消息 metadata + 边界逻辑（本任务）。以下步骤需要运行真实 Electron GUI，当前 subagent 环境无法执行，明确标注为「自动化已覆盖，手测待用户」。

1. `pnpm dev` — **手测待用户**（subagent 无法启动 GUI Electron）。
2. 打开有 >10 条消息的会话 — **手测待用户**（需要 GUI 导航到真实长会话）。
3. Settings 中切换 contextMode = compact，发送消息 — **手测待用户**（需要 GUI 切换 segmented control + 触发真实 send）。
4. 验证 LLM HTTP POST body 包含 history — **自动化已覆盖**（T1 `contextSummarizer.integration.test.ts` 断言 body shape）；真实运行下 POST 抓包仍建议用户手测一次。
5. 验证聊天中出现摘要消息 — **自动化已覆盖**（T2 `CompactedSummaryCard.test.tsx` 组件渲染 + `ChatMessageList` 并行分支）；真实渲染样式建议用户手测一次。
6. 切换 contextMode = full，再次发送 — **手测待用户**（需要 GUI 切换 + 真实 send）。
7. 验证全量历史发送 — **自动化已覆盖**（`useAgentSendPipeline.test.ts` 的 `prepareHistoryForRuntime` full 模式用例）；真实运行下端到端发送仍建议用户手测一次。

---

## 5. 风险与约束

| 风险 | 缓解 |
| --- | --- |
| 首次摘要调用增加延迟 | 摘要仅对旧消息执行，不阻塞当前 turn 的 streaming；摘要失败时 fallback 到滑动窗口 |
| 摘要质量不确定 | 保留原始消息在 JSONL 中，压缩只影响 API 调用；UI 可回滚到 full 模式 |
| Token 估算误差（~5-15%） | 用保守 reserveRatio（10%）吸收误差；真实 API `inputTokens` 回写后下次更准确 |
| `buildChatRequest` 类型不匹配是已有 bug | 修复后需回归现有 test 确保无副作用 |
| LLM HTTP 端口解析依赖 | 复用 `ClaudeCodeAgentRuntime` 的 `localServer.port` 模式，不硬编码 |

## 6. 与现有代码的衔接

- `computeContextUsage()`（`contextUsageMath.ts`）继续驱动 UI 展示，不修改
- `estimateTokensSync()`（`tokenizer.ts`）直接复用，无需新增 tokenizer
- `ModelSelection.contextMode` 类型已存在，不需要新增 shared type
- `SessionSettings.contextCount` 已在 UI 中定义，只需激活
- `useContextInspectorData` 中 `contextCompacted` 的读取逻辑天然兼容新 metadata
