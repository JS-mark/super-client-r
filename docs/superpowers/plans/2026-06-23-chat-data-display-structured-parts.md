# Chat Data Display Structured Parts Implementation Plan

> 重构总入口：[../../refactor-plan.md](../../refactor-plan.md)。
>
> 本文是功能级 plan，只维护“对话中的数据展示 / structured parts renderer”的实现步骤；跨功能决策以总入口和 [../../streaming-structured-output-plan.md](../../streaming-structured-output-plan.md) 为准。
>
> **For agentic workers:** REQUIRED SUPERPOWER: use superpowers-style executing plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把对话展示从“整段 markdown + tool card 特判”升级为 typed message parts。代码块、diff、tool、approval、JSON/table/tree/sources/artifact 都有稳定 part id、状态机、独立 renderer、可恢复 JSONL 事件和可控性能。

**Architecture:** 分 6 批次推进：A 适配层和 turn builder、B renderer registry、C tool/approval composer pending surface、D code/diff/data 展示、E JSONL part events、F cleanup + tests。先兼容旧消息，再切新协议，避免一次性重写聊天页。

**Tech Stack:** React + TypeScript + Ant Design + `@ant-design/x` + Zustand + `react-window`。

**前置 spec:** [../specs/2026-06-23-chat-data-display-structured-parts-design.md](../specs/2026-06-23-chat-data-display-structured-parts-design.md)

---

## File Structure

| 路径 | 操作 | 责任 |
| --- | --- | --- |
| `packages/shared-types/src/chat.ts` | 修改 | 新增 `MessagePart` / part event 类型；旧 `ChatMessagePersist` 兼容读取 |
| `src/renderer/src/components/chat/parts/` | 新建 | typed part renderers |
| `src/renderer/src/components/chat/parts/StreamPartRenderer.tsx` | 新建 | part registry 分发 |
| `src/renderer/src/components/chat/parts/TextPartRenderer.tsx` | 新建 | 普通文本 / streaming text |
| `src/renderer/src/components/chat/parts/CodeBlockPartRenderer.tsx` | 新建 | 代码块 header、copy、final highlight、large mode |
| `src/renderer/src/components/chat/parts/DiffPartRenderer.tsx` | 新建 | patch / diff 展示 |
| `src/renderer/src/components/chat/parts/ToolPartRenderer.tsx` | 新建 | tool state 历史摘要 |
| `src/renderer/src/components/chat/parts/DataPartRenderer.tsx` | 新建 | JSON/YAML/object viewer |
| `src/renderer/src/components/chat/parts/TablePartRenderer.tsx` | 新建 | table viewer + copy TSV |
| `src/renderer/src/components/chat/parts/TreePartRenderer.tsx` | 新建 | 文件树/任务树 |
| `src/renderer/src/components/chat/parts/SourcesPartRenderer.tsx` | 新建 | 引用/来源 |
| `src/renderer/src/components/chat/parts/ArtifactPartRenderer.tsx` | 新建 | 安全 artifact preview |
| `src/renderer/src/components/chat/messagePartsAdapter.ts` | 新建 | 旧 message → compatible parts |
| `src/renderer/src/components/chat/messageTurns.ts` | 新建 | turn grouping / stable ids |
| `src/renderer/src/components/chat/ChatMessageList.tsx` | 修改 | 使用 `MessageTurnRenderer` / `StreamPartRenderer` |
| `src/renderer/src/components/chat/ChatInputArea.tsx` | 修改 | active approval/ask/tool_call 切到 composer pending surface |
| `src/renderer/src/stores/chatMessageStore.ts` | 修改 | parts reducer / same-id upsert / transient state |
| `src/main/services/storage/SessionStorageService.ts` | 修改 | JSONL part event append/replay |
| `src/main/services/agent/AgentSDKService.ts` | 修改 | SDK raw event → part event normalization |
| `src/renderer/src/i18n/locales/zh/chat.json` | 修改 | `parts.*` 文案 |
| `src/renderer/src/i18n/locales/en/chat.json` | 修改 | `parts.*` 文案 |

---

## Batch A: Adapter And Turn Builder

### Task A1: Define MessagePart Types

- [x] 在 `packages/shared-types/src/chat.ts` 增加 `MessagePart` union 和 `BaseMessagePart`。
- [x] 增加 `MessagePartState`：`streaming | complete | error | requires-approval | executing | denied`。
- [x] 增加 `AssistantPartEvent`：`part_start | part_delta | part_update | part_done | part_error`。
- [x] 保留旧 `ChatMessagePersist.content/toolCall/type`，不破坏旧数据读取。
- [x] `pnpm check`。

### Task A2: Add Legacy Message Adapter

- [x] 新建 `messagePartsAdapter.ts`。
- [x] `content` 转 `text` part。
- [x] `toolCall` 转 `tool` part。
- [x] `type=error` 转 `text` error part。
- [x] raw `tool_call>` / `<|eom|>` 在 adapter 层过滤。
- [x] 单测：旧 assistant、旧 tool、旧 error 都能生成 stable parts。

### Task A3: Extract Turn Builder

- [x] 新建 `messageTurns.ts`。
- [x] user turn = 单条 user message。
- [x] assistant turn = assistant text parts + tool parts。
- [x] 保持 `msg-<id>` anchor。
- [x] 保留 `hasPendingInteraction`，但只用于历史定位；active interaction 由 composer pending surface 接管。
- [x] 单测：user/assistant/tool 混排生成稳定 turns。

---

## Batch B: StreamPartRenderer Registry

### Task B1: Add StreamPartRenderer

- [x] 新建 `components/chat/parts/StreamPartRenderer.tsx`。
- [x] 按 `part.type` 分发 renderer。
- [x] 未知 type fallback 到 safe JSON viewer，不 raw HTML。
- [ ] 每个 renderer `memo`，只接收对应 part。
- [ ] part 高度变化时调用 row remeasure hook。

### Task B2: TextPartRenderer

- [x] 把现有 `Markdown` / `StreamingMarkdown` 包进 `TextPartRenderer`。
- [x] streaming 时只读当前 text part 的内容。
- [x] 不让父级因为每个 chunk 重建所有 bubble items。

### Task B3: Replace ChatMessageList Content Path

- [x] `ChatMessageList` 使用 `buildMessageTurns()`。
- [x] assistant turn 用 `StreamPartRenderer` 列表渲染。
- [x] 保留 `Bubble.List` / `VirtualBubbleList` fallback。
- [x] 保留复制、删除、收藏、上下文菜单。
- [x] 单测：小会话仍普通列表，大会话仍 virtual list。

---

## Batch C: Tool / Approval Composer Pending Surface

### Task C1: Normalize Tool Part State

- [ ] `tool_call` → `input-available` 或 `input-streaming` part。
- [x] `permission_request` → same tool message 更新为 `requires-approval`/`awaiting_approval`。
- [x] `permission_denied` / `tool_error` → same tool message 更新为 `denied/error`。
- [x] `tool_use_summary` → same tool message 更新 result。
- [x] 单测：任意事件顺序都只生成一个 tool part。

### Task C2: Move Active Interaction To Composer

- [x] `ChatInputArea` 从 store 读取 pending tool message。
- [x] pending approval/ask 时隐藏普通输入框，显示 composer pending surface。
- [x] pending surface 复用 `ApprovalDecisionCard` / `AskUserQuestionCard`。
- [x] transcript 内 awaiting approval/ask 不显示大型审批交互。
- [ ] 单测：pending 时 submit 普通消息不可用，Allow/Reject/Submit 调用参数不变。

### Task C3: ToolPartRenderer History Summary

- [ ] 显示工具名、风险 badge、状态、耗时。
- [ ] 输入 JSON 默认折叠；长字段 tooltip/展开。
- [ ] result/error 默认折叠；error 显示 `code/messageKey/details`。
- [ ] 不显示 raw SDK exception stack。

---

## Batch D: Code / Diff / Data Display

### Task D1: CodeBlockPartRenderer

- [x] header：语言、路径/标题、状态。
- [x] streaming 阶段标记 streaming 并复用现有高亮组件。
- [ ] 400 行或 120KB 以上进入 large mode。
- [ ] 单测：未闭合 code fence 不破坏布局，完成后仍可复制。

### Task D2: DiffPartRenderer

- [x] 文件摘要：文件数量和状态。
- [ ] 每文件 collapsible hunk。
- [ ] 未完成/invalid 不显示 apply。
- [ ] apply 只触发 action，不在 renderer 内直接写文件。

### Task D3: Data / Table / Tree / Sources

- [x] `DataPartRenderer`：安全 JSON/text fallback。
- [x] `TablePartRenderer`：表格展示、行数统计。
- [x] `TreePartRenderer`：文件/节点列表展示。
- [x] `SourcesPartRenderer`：标题、路径/URL、snippet。
- [x] 所有 renderer 禁止 raw HTML。

### Task D4: ArtifactPartRenderer

- [x] 支持 markdown/html/image/file reference 的安全 preview。
- [x] HTML artifact 不直接注入 DOM；先文本化。
- [ ] 写入/打开/执行动作走 runtime approval gate。

---

## Batch E: JSONL Structured Part Events

### Task E1: SessionStorage Part Event Append

- [x] `SessionStorageService.appendEvent` 支持 `assistant.part_*`。
- [x] writer 分配 `eventId + seq + writtenAt`。
- [ ] part delta 可以 batch 合并，避免每 token 一行。
- [x] transient status / part 不持久化。

### Task E2: Replay / Rebuild

- [x] load JSONL 时 replay part events 还原 message parts。
- [x] malformed trailing line 走现有恢复策略。
- [x] malformed middle line 标记 corrupted。
- [x] meta rebuild 能从 part events 得出 message count / preview / updatedAt。

### Task E3: Agent SDK Normalization

- [x] `AgentSDKService` 输出 text `part_start/delta/done`，并保留 `chunk` 兼容事件。
- [ ] `AgentSDKService` 输出 code/diff/data/tool 等非 text 专用 part event。
- [x] `tool_call>`、`<|eom|>` 不进入 renderer text。
- [x] `AskUserQuestion` 生成 tool/ask message + composer pending interaction。

---

## Batch F: Cleanup And Verification

### Task F1: Remove Duplicate Renderer Drift

- [ ] `MessageBubble` 改为调用 `StreamPartRenderer` 或标记 legacy-only。
- [ ] 删除重复 tool/data/code 展示逻辑。
- [ ] `ChatMessageList` 成为唯一主消息展示入口。

### Task F2: i18n

- [ ] 添加 spec 中列出的 `parts.*` zh/en key。
- [ ] 错误 UI 用 code/messageKey 翻译，不显示 raw exception。
- [ ] 长英文 tooltip 不挤爆 composer/sidebar/message card。

### Task F3: Tests

- [x] Adapter tests：旧 content/tool/error → parts。
- [x] Reducer tests：same id reconcile，不重复卡片。
- [x] Renderer tests：table/sources/artifact safe fallback。
- [ ] Composer tests：pending approval/ask 隐藏普通输入，Allow/Reject/Submit 参数正确。
- [x] Storage tests：part event replay。
- [ ] Performance check：500 turns + 1000 行代码块时滚动可用。

### Task F4: Validation Commands

- [x] `pnpm check`
- [x] `pnpm test:run`
- [x] `pnpm lint`
- [x] `pnpm i18n:check`
- [x] `pnpm dev`

不运行 `pnpm build` 或任何打包命令。

---

## Current Research Summary

调研结论已经转成实现约束：

- 使用 typed parts，而不是把所有数据塞进 markdown。
- same-id reconciliation 是 tool/data/status 展示的核心。
- approval/ask 是 composer pending interaction，不是巨大 modal，也不是普通文本。
- data/table/tree/artifact 都必须有受控 renderer 和安全 fallback。
- JSONL 正式持久化 structured part events，支持 replay/rebuild。
