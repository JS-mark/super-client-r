# Streaming Structured Output Plan

> 入口：[refactor-plan](./refactor-plan.md)
> 相关计划：[agent-runtime-and-project-cleanup-plan](./agent-runtime-and-project-cleanup-plan.md) ·
> [jsonl-concurrency-plan](./jsonl-concurrency-plan.md) ·
> [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) ·
> [chat-data-display-structured-parts](./superpowers/plans/2026-06-23-chat-data-display-structured-parts.md)

## 1. 背景

当前聊天输出仍偏向“markdown 文本 + tool card 后处理”。这会带来几个问题：

- 代码块、diff、JSON、表格、文件树等结构化内容只能作为普通 markdown 流式拼接，无法稳定做分块、折叠、复制、应用和虚拟化。
- `tool_call` / `tool_use` / `tool_result` / `tool_error` 的展示链路不够统一，错误时容易泄漏 raw protocol 文本。
- streaming 时频繁更新大段 markdown，会触发较多 React diff 和重新测量，长会话或长代码输出会卡顿。
- 后续应用插件、MCP、Skill 如果要贡献可视化结果，没有统一的安全 renderer contract。

本计划补齐“结构化输出流式展示”主线。目标不是立即引入复杂 artifact 系统，而是先把消息协议从纯文本收口到 typed parts，让文本、代码、工具、结构化数据和临时状态都能按同一套生命周期渲染。

最新决策：JSONL 正式升级为 structured part event log。旧 project/session 文档里“只落最终 assistant_message、不持久化流式 chunk”的策略已废弃；本计划是后续 assistant streaming、tool state、代码块和 artifact/data 渲染的准入依据。

对话 UI 的具体组件拆分、当前代码观察和批次化实现见 superpowers 计划：[Chat Data Display Structured Parts](./superpowers/plans/2026-06-23-chat-data-display-structured-parts.md)。

## 2. 外部参考结论

调研当前较流行的 AI chat / agent UI 做法，核心趋势如下：

- Vercel AI SDK UI 推荐渲染 `message.parts`，而不是只依赖 `content`。`parts` 可承载 text、tool invocation、tool result 等不同消息类型，适合复杂 chat UI。
- Streaming custom data 允许把状态、引用、进度、结构化结果和模型文本一起流到客户端；同一个 `id` 的 data part 可以被持续 reconcile，从 loading 变成最终结果。
- Transient data parts 适合“正在搜索 / 正在读取文件 / 正在生成结构”这类不应进入历史记录的临时状态。
- Tool call streaming 已成为常规体验：工具输入可以在生成中展示，随后进入 `input-available`、`approval-requested`、`executing`、`output-available` 或 `output-error`。
- Generative UI 的常见做法是把 tool result / structured data 映射为受控 React component，而不是把原始 JSON 丢进 markdown。

对本项目的结论：

- 不再把结构化内容塞回 assistant 文本里解析；需要在 Agent SDK / renderer reducer 层形成 stable typed parts。
- `tool_call>`、`<|eom|>`、SDK raw block 等 protocol 文本必须在 normalization 层消费，不能进入用户可见正文。
- 代码、diff、表格、文件树、引用、artifact preview 都应是 message part，而不是 markdown 里的“偶然格式”。

## 3. 目标体验

### 3.1 代码流式输出

当模型输出代码块时：

- 先创建稳定 `code_block` part，显示语言、文件路径/标题、streaming 状态。
- 代码内容按 chunk 追加，但只更新该 code block，不重渲染整条 assistant message。
- fenced code 未闭合时仍按 raw code buffer 展示，不让 markdown parser 反复猜测结构。
- 完成后再做最终高亮、行号、复制、折叠、可选应用动作。
- 超长代码块使用内部虚拟化或分段渲染，避免一个 row 过高导致滚动卡顿。

### 3.2 Diff / Patch 流式输出

当模型输出 patch 或多文件修改计划时：

- 先展示文件变更摘要：新增、修改、删除、重命名数量。
- 每个文件使用独立 `diff_file` part/hunk 子结构，hunk 可以逐步追加。
- patch 未完成时只允许复制/查看，不允许直接应用。
- patch 完成且校验通过后，才显示“应用补丁 / 复制 patch / 展开全部”动作。
- apply 行为必须经过现有 runtime/approval gate，不因 UI part 类型绕过权限。

### 3.3 Tool / Approval 流式输出

工具统一状态机：

```text
created -> input-streaming -> input-available -> approval-requested
        -> executing -> output-available
        -> output-error
        -> denied
```

要求：

- `tool_call` / `tool_use` / `permission_request` 都 upsert 到同一个 `tool` part。
- `tool_error` 必须映射到 `output-error`，显示结构化 `code/messageKey/details`，不显示 raw exception。
- 审批卡片复用 `ApprovalDecisionCard`；需要审批时 active interaction 挂到 composer pending surface，普通输入框隐藏或降级为不可输入状态。
- 工具输入 JSON 只在 tool card 内展示，不能作为 assistant 正文出现。

### 3.4 其它结构化输出

第一阶段支持这些 part 类型：

- `text`：普通流式文本。
- `code_block`：代码块。
- `diff`：patch / diff / file hunks。
- `tool`：tool call、approval、result、error。
- `data`：JSON/YAML/typed object。
- `table`：二维表格，支持流式追加 rows。
- `tree`：文件树、目录树、任务树。
- `sources`：引用、检索结果、文件引用。
- `status`：临时进度，默认 transient，不进入历史。
- `artifact`：可预览产物，如 HTML、Markdown 文档、图片引用、报告草稿。

## 4. Message Part Contract

新增 renderer 内部 contract，后续可迁到 shared types：

```ts
type StructuredPartState =
  | 'streaming'
  | 'complete'
  | 'error'
  | 'collapsed'
  | 'requires-approval'
  | 'executing'
  | 'denied';

interface BaseMessagePart {
  id: string;
  type: string;
  state: StructuredPartState;
  transient?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface CodeBlockPart extends BaseMessagePart {
  type: 'code_block';
  language?: string;
  path?: string;
  title?: string;
  content: string;
  completeFence?: boolean;
  lineCount?: number;
}

interface ToolPart extends BaseMessagePart {
  type: 'tool';
  toolUseId: string;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: { code?: string; messageKey?: string; details?: unknown };
  approval?: {
    title?: string;
    description?: string;
    displayName?: string;
    suggestions?: unknown;
  };
}
```

事件协议建议：

```ts
type StructuredStreamEvent =
  | { type: 'part_start'; messageId: string; part: BaseMessagePart }
  | { type: 'part_delta'; messageId: string; partId: string; delta: unknown }
  | { type: 'part_update'; messageId: string; partId: string; patch: unknown }
  | { type: 'part_done'; messageId: string; partId: string; patch?: unknown }
  | { type: 'part_error'; messageId: string; partId: string; error: unknown };
```

规则：

- 同一个 `part.id` 的更新必须 reconcile，不能插入重复卡片。
- `transient=true` 的 part 只进入内存 UI 状态，不写入 JSONL 历史。
- 持久 part 写入 JSONL 时仍由 main process 分配 `eventId + seq`。
- Agent SDK raw event 在 main normalization 层转成 part event；renderer 不解析 SDK 私有格式。

## 5. 渲染架构

### 5.1 StreamPartRenderer

新增 `StreamPartRenderer`，按 `part.type` 分发：

- `TextPartRenderer`
- `CodeBlockPartRenderer`
- `DiffPartRenderer`
- `ToolPartRenderer`
- `DataPartRenderer`
- `TablePartRenderer`
- `TreePartRenderer`
- `SourcesPartRenderer`
- `ArtifactPartRenderer`
- `StatusPartRenderer`

渲染规则：

- 不使用 raw HTML。
- markdown 只在受控 renderer 内处理，且 sanitize。
- 每个 part 独立 `memo`，只订阅自己的 patch。
- 动态高度变化通知 `VirtualMessageList` 重新测量当前 row。
- 超长内容默认折叠，用户展开后再渲染完整内容。

### 5.2 Code Block Renderer

功能：

- header：语言、文件路径、streaming/final/error 状态、复制按钮。
- body：monospace、行号可选、长行横向滚动。
- streaming：低频节流渲染，避免每 token 触发高亮。
- complete：最终高亮一次；失败时回退 plain text。
- large mode：超过 400 行或 120KB 时启用虚拟代码行。

### 5.3 Diff Renderer

功能：

- file summary 列表。
- per-file collapse。
- hunk streaming。
- added/removed/context 三类行。
- patch 校验状态。
- 应用按钮只在 complete + valid 时出现。

### 5.4 Tool Renderer

功能：

- `input-streaming`：显示“准备工具输入”，可展开 partial JSON。
- `approval-requested`：显示统一审批卡片。
- `executing`：显示正在执行，不允许用户重复提交审批。
- `output-available`：显示摘要，默认折叠大型 JSON/stdout。
- `output-error`：显示结构化错误和可重试动作。

## 6. 数据与持久化

JSONL 存储新增/扩展事件：

- `assistant.part_start`
- `assistant.part_delta`
- `assistant.part_update`
- `assistant.part_done`
- `assistant.part_error`
- `assistant.status_transient`（不持久化，只走 IPC）

落盘策略：

- 文本和代码 delta 可以按 batch 合并写入，避免每 token 一行 JSONL。
- tool approval/result/error 必须持久化，保证恢复历史时能看到完整上下文。
- transient status 不写历史；重启后只保留最终消息和持久 part。
- repair/rebuild meta 时能从 part events 还原最终 message parts。

## 7. 分阶段实现

### P0：协议与 raw text 泄漏收口

- 在 Agent SDK normalization 层过滤 `<|eom|>`、raw `tool_call>`、SDK 私有 block 标记。
- 给 `useChat` reducer 增加 `parts` draft 状态和 same-id upsert。
- `tool_call` / `tool_use` / `tool_error` 统一映射为 `tool` part。
- 现有 ToolCallCard 接入 `ToolPartRenderer`，不改变底层执行逻辑。

### P1：代码块结构化流式展示

- 在 streaming markdown parser 中识别 fenced code start/end，生成 `code_block` part。
- 未闭合 fence 使用 raw code buffer；闭合后转 final highlight。
- 支持语言、路径、标题提取。
- 超长代码块低频渲染，避免卡顿。

### P2：Diff / data / table / tree

- 增加 diff detector 和 `diff` part renderer。
- 增加 JSON/table/tree renderer。
- 支持 sources/references part，给 RAG、文件引用和搜索结果复用。

### P3：Artifact / 应用插件 renderer contract

- 定义安全 renderer registry。
- 应用插件只能注册受控 part renderer，不能执行任意 renderer code。
- renderer 输入必须是 schema 校验后的 structured payload。
- artifact preview 与执行/写文件动作分离，写入仍走 approval gate。

## 8. 性能要求

- 对 streaming delta 做 `requestAnimationFrame` 或 50-100ms batch flush。
- 不在每个 token 到达时重建整个 `messages` 数组。
- message row、part renderer、code lines 分层 memo。
- `VirtualMessageList` 只测量发生变化的 row。
- 用户不在底部时不强制滚动到底；pending approval/ask 例外，需保持 composer pending surface 可见；tool error 可滚到对应历史摘要。
- 500 turns + 单个 1000 行代码块时，输入和滚动仍应可交互。

## 9. 安全与边界

- 所有结构化 payload 都是不可信内容。
- 禁止 raw HTML 注入。
- 代码块不自动执行。
- patch 不自动应用。
- tool input/output 默认折叠敏感大字段；路径和 token 类字段走脱敏策略。
- 应用插件 renderer 不能绕过 preload/IPС 安全边界。
- renderer 出错时只降级为 plain text / JSON viewer，不中断整条消息。

## 10. 验收测试

- streaming code fence 未闭合时不会破坏后续消息布局。
- 多个代码块使用稳定 `part.id`，delta 不互相串。
- final code block 只做一次高亮，streaming 阶段不卡顿。
- raw `tool_call>`、`<|eom|>` 不出现在用户可见消息中。
- `tool_call -> approval -> executing -> result` 只生成一个 tool part。
- `tool_error` 显示结构化错误，不显示 raw exception stack。
- same-id `data` part 从 loading reconcile 为 success，不生成重复卡片。
- transient status 不写入 JSONL，刷新后不恢复。
- 500 turns 和 1000 行代码块下，非当前 row 不重新渲染。
- diff 未完成时不能 apply；完成且校验通过后才显示 apply。

## 11. 非目标

- 本轮不实现完整 notebook/canvas artifact 系统。
- 本轮不让应用插件执行任意 UI 代码。
- 本轮不改变 Agent SDK provider 选择和认证链路。
- 本轮不自动应用模型生成代码。
