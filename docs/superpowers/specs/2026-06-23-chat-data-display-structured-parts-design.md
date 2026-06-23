# Chat Data Display Structured Parts Design

**日期**：2026-06-23
**状态**：spec
**关联**：
- [../../streaming-structured-output-plan.md](../../streaming-structured-output-plan.md)
- [../../agent-runtime-and-project-cleanup-plan.md](../../agent-runtime-and-project-cleanup-plan.md)
- [../plans/2026-06-23-chat-data-display-structured-parts.md](../plans/2026-06-23-chat-data-display-structured-parts.md)

## 调研结论

当前主流 chat / agent UI 不再把所有 assistant 输出当作一整段 markdown 文本处理，而是拆成 typed parts：

- 文本、代码、diff、tool、approval、data、table、tree、sources、artifact 分类型渲染。
- 流式阶段用 stable part id 做增量更新；同 id reconcile，不重复插入卡片。
- 工具调用有状态机：`input-streaming -> input-available -> approval-requested -> executing -> output-available/output-error/denied`。
- 临时状态如“正在搜索 / 正在读取文件”用 transient part，只进 UI，不进历史。
- 可视化结果由受控 renderer 渲染，不把 raw JSON / raw HTML 直接塞进 markdown。

参考方向：

- Vercel AI SDK UI 的 `message.parts` 思路：复杂 chat UI 渲染 parts，而不是只读 `content`。
- Streaming custom data 的 same-id reconciliation：loading/status/result 使用同 id 更新。
- Tool call streaming：工具输入可在生成中展示，审批、执行、结果、错误按状态展示。
- Generative UI：tool result / structured data 映射到受控 React component。

## 当前代码观察

### ChatMessageList

文件：`src/renderer/src/components/chat/ChatMessageList.tsx`

- 当前会按 user / assistant turn 聚合，并在 `items > 80` 时用 `react-window` 虚拟化。
- assistant turn 仍主要使用 `contentRender -> Markdown / StreamingMarkdown`。
- tool / ask / approval 在 turn 内通过 `ToolCallCard`、`AskUserQuestionCard` 混排。
- pending interaction 现在基于 `extraInfo.hasPendingInteraction` 滚动到 turn；最新交互要求 active approval/ask 放 composer pending surface。

### MessageBubble

文件：`src/renderer/src/components/chat/MessageBubble.tsx`

- 仍有另一条 message 渲染路径，使用 `Markdown`、`ToolCallCard`、`FileArtifactCard`。
- 这条路径和 `ChatMessageList` 存在重复职责，后续 structured parts 应避免两套 renderer 漂移。

### Markdown

文件：`src/renderer/src/components/Markdown.tsx`

- 已支持 `SyntaxHighlighter`、Mermaid、ECharts、table copy。
- 但代码块、表格、图表都是 markdown AST 的结果，没有 stable part id。
- streaming 时仍以整段 string 喂给 `XMarkdown`，没有代码块级 / 表格级 / data part 级增量。

### Shared Types

文件：
- `packages/shared-types/src/chat.ts`
- `packages/shared-types/src/agent-sdk.ts`

现状：

- `ChatMessagePersist.type` 仍是 `text | tool_use | tool_result | error`。
- `toolCall` 是单个 message 字段，不是 message part。
- `AgentSDKStreamEvent` 已有 `tool_call`、`tool_error`、`permission_request`，但没有通用 structured part event。

## 目标体验

### Text

- 普通 assistant 文本仍显示为连续阅读体验。
- streaming 阶段只更新当前 text part。
- raw protocol token（例如 `tool_call>`、`<|eom|>`）不得进入 text part。

### Code

- 代码块以独立 card 展示。
- header 显示语言、文件路径/标题、streaming/final/error 状态。
- streaming 时不每 token 做完整 syntax highlight；完成后最终高亮一次。
- 支持复制、折叠、超长代码虚拟化。

### Diff / Patch

- 显示文件摘要、每文件 hunk、added/removed/context 行。
- 未完成或校验失败时不能 apply。
- apply 走 runtime approval gate。

### Tool / Approval / Ask

- active approval/ask 放 composer pending surface。
- transcript 里只保留工具历史摘要：输入、状态、结果、错误。
- tool 输入 JSON 不进入 assistant 正文。
- `tool_error` 用结构化 error card 展示，不显示 raw exception stack。

### Data / Table / Tree / Sources

- JSON/YAML 用 inspector-style viewer，默认折叠大字段。
- table 支持 sticky header、复制 TSV、行数统计。
- tree 支持目录/任务树、展开折叠、路径 tooltip。
- sources 显示引用来源、文件路径、检索片段和可信度/来源类型。

### Artifact

- artifact preview 只做安全预览。
- HTML 不注入 raw HTML，必须 sandbox 或文本化。
- 写文件/执行/apply 仍走 approval gate。

## 组件结构

```text
ChatMessageList
  ├─ buildMessageTurns(messages)
  ├─ Bubble.List / VirtualBubbleList
  └─ MessageTurnRenderer
       ├─ UserMessageRenderer
       └─ AssistantTurnRenderer
            └─ StreamPartRenderer
                 ├─ TextPartRenderer
                 ├─ CodeBlockPartRenderer
                 ├─ DiffPartRenderer
                 ├─ ToolPartRenderer
                 ├─ DataPartRenderer
                 ├─ TablePartRenderer
                 ├─ TreePartRenderer
                 ├─ SourcesPartRenderer
                 ├─ ArtifactPartRenderer
                 └─ StatusPartRenderer
```

Composer:

```text
ChatInputArea / ChatComposer
  ├─ normal input surface
  └─ pending interaction surface
       ├─ ApprovalDecisionCard
       ├─ AskUserQuestionCard
       └─ ToolInputPreview
```

## Data Contract

Renderer 内部先使用兼容 contract：

```ts
type MessagePart =
  | TextPart
  | CodeBlockPart
  | DiffPart
  | ToolPart
  | DataPart
  | TablePart
  | TreePart
  | SourcesPart
  | ArtifactPart
  | StatusPart;

interface BasePart {
  id: string;
  type: string;
  state: 'streaming' | 'complete' | 'error' | 'requires-approval' | 'executing' | 'denied';
  transient?: boolean;
  createdAt: number;
  updatedAt: number;
}
```

落盘后的 source of truth 是 JSONL part events：

- `assistant.part_start`
- `assistant.part_delta`
- `assistant.part_update`
- `assistant.part_done`
- `assistant.part_error`

旧 message schema 读取时可以转换为兼容 parts：

- `content` → single `text` part。
- `toolCall` → single `tool` part。
- `type=error` → `text/error` part。

## UI Rules

- 不在卡片套卡片。
- 大型 JSON/stdout/code 默认折叠。
- 每个 part 有稳定尺寸策略；展开/收起触发 virtual row remeasure。
- 所有长文本提供 tooltip 或可展开详情，不挤压布局。
- 表格、代码、JSON、diff 都要有复制动作，但执行/apply 动作必须受控。
- 用户在历史位置阅读时不强制滚到底；active approval/ask 只保证 composer pending surface 可见。

## i18n Keys

新增文案必须进 `chat.json`：

- `parts.code.copy`
- `parts.code.copied`
- `parts.code.streaming`
- `parts.diff.filesChanged`
- `parts.diff.apply`
- `parts.diff.invalid`
- `parts.tool.inputStreaming`
- `parts.tool.executing`
- `parts.tool.outputAvailable`
- `parts.tool.outputError`
- `parts.data.expand`
- `parts.data.collapse`
- `parts.table.copyTsv`
- `parts.sources.title`
- `parts.artifact.preview`
- `parts.status.transient`

## Non-goals

- 不实现任意插件 JS renderer。
- 不自动执行模型输出代码。
- 不把 HTML artifact 直接注入 DOM。
- 不一次性删除旧 `MessageBubble`，先通过 adapter 收口后再清理。
