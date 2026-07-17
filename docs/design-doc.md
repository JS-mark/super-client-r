# Agent 客户端体验与架构设计

> 日期：2026-06-27
>
> 最近复核：2026-07-08
>
> 状态：设计草案
>
> 配套规划：[requirements-plan.md](./requirements-plan.md)

## 1. 产品方向

Super Client R 是一个 **Agent-only** 桌面 AI 客户端。后续不再恢复 direct/chat 对话模式，所有普通对话、项目对话、远端对话都走 Agent runtime。

目标体验参考 Codex 与 Claude：

- **Codex 方向**：以代码项目为核心，强调项目/会话、Agent 执行、Plan/Execute、工具审批、沙箱、Git/worktree、右侧环境面板、结构化代码输出。
- **Claude 方向**：强调稳定易读的对话体验、项目记忆、上下文管理、清晰的模型选择、Artifacts、MCP/Skills 生态。

产品定位：**两者混合，但以代码项目 Agent 为主**。

## 2. 已确认设定

| 主题 | 设定 |
| --- | --- |
| 产品模式 | 只有 Agent 模式；普通对话只是没有项目 cwd 的 Agent 会话。 |
| 页面结构 | 沿用当前整体结构：左侧项目/会话，中间 transcript + 输入/审批区，右侧可折叠环境面板，设置为独立路由页。 |
| 设置页 | 参考 Codex 设置页重组，使用左侧设置导航 + 右侧内容面板。 |
| 模型层级 | 支持全局默认、项目默认、会话覆盖、输入框 model pill 临时选择、子 Agent 运行时模型选择。 |
| 模型配置 | 重做为两层：Provider 管理 + Model 能力配置。 |
| 模型调用方式 | 默认按 provider/model 能力自动选择：OpenAI、Gemini、Claude/Anthropic 使用原生 Function Calling；开源模型和 OpenAI-compatible/local provider 使用 LangChain + MCP 协议适配工具调用；用户可在对话设置中覆盖。 |
| 本地模型 | Ollama/local 是一等能力，但低优先级。 |
| 成本展示 | 第一阶段不做准确成本，只展示上下文长度和能力标签。 |
| Plan/Execute | 用户可手动切换；Plan 只能读/搜/分析，Execute 可在审批/沙箱下执行。 |
| Plan 卡片 | 结构化展示步骤、风险、预计改动文件、执行按钮；允许编辑步骤、取消、重新生成。执行会创建新的 execute turn。 |
| 审批 UI | 需要审批时输入框区域被审批区替换。AskUserQuestion 可输入；普通 tool approval 不允许自由输入。 |
| 审批选项 | 允许一次、本会话允许、本项目允许、拒绝、拒绝并给原因、修改参数后允许。 |
| 权限模型 | 按 Codex 风格拆分 approval policy、sandbox policy、permission grants。 |
| Memory | 用户级偏好、项目级规则、会话摘要/长期记忆、Agent/Subagent memory。项目规则可读 `AGENTS.md` / `CLAUDE.md`，但 UI 不编辑。 |
| Context | 显示 token 使用、注入的文件/附件/memory，支持自动 compact/summarize，支持 pin/unpin。 |
| 多 Agent | 支持主 Agent 委派 Subagent。右侧面板显示子 Agent timeline，可展开完整子线程。 |
| 子 Agent cwd | 默认共享项目 cwd；每个 subagent 独立上下文/权限/memory。 |
| Artifacts | 作为一等产品对象，在右侧面板和独立库中展示生成文件、代码片段、报告。 |
| Remote IM | 纳入完整设计，不只是兼容路径。 |
| MCP/Skills/App Plugins | 保持独立入口，不再合并成 Extensions 页面。 |

## 3. 设计原则

1. **体验优先**：交互必须稳定、顺滑、可预期。用户在运行 Agent、审批工具、切换模型、查看上下文时，不应该需要理解内部实现细节。
2. **流程简单明了**：核心路径要短，状态要清楚。新建会话、选择模型、切换 Plan/Execute、审批工具、查看结果都应该有明确入口和明确反馈。
3. **信息分层**：默认展示摘要和关键状态，复杂细节按需展开。避免 transcript 被工具日志、子 Agent 细节和长输出淹没。
4. **低性能开销**：长会话、长输出、工具日志和 artifacts 不能造成明显卡顿。渲染应使用 typed parts、虚拟列表、按需展开和增量更新。
5. **低内存占用**：不要把所有长文本、工具输出、artifact 内容长期保存在 renderer 内存中。大内容应以引用、分页、摘要或懒加载方式呈现。
6. **可恢复和可解释**：Agent run、审批、context compact、模型解析、subagent 委派都要可回放、可解释，避免静默状态变化。
7. **安全边界清晰**：approval、sandbox、grants 必须分离；用户批准不能绕过沙箱硬限制。
8. **调用方式默认正确且可覆盖**：模型调用默认优先使用目标 provider 最稳定的原生能力。OpenAI、Gemini、Claude/Anthropic 默认走原生 Function Calling；开源模型默认走 LangChain + MCP 协议以统一工具适配。对话设置必须提供“调用方式”覆盖入口，用于兼容 provider 能力误判或用户偏好。

## 4. 外部参考

这些是产品/交互参考，不要求逐像素复刻。

- OpenAI Codex app：桌面代码 Agent 体验，项目、活动线程、review pane、Git/worktree 和环境工作流。参考：https://developers.openai.com/codex/app
- OpenAI Codex permissions：approval、sandbox、filesystem/network 权限和 permission profile 的拆分。参考：https://developers.openai.com/codex/permissions
- OpenAI Codex subagents：委派子 Agent、并行工作、审批来源归属。参考：https://developers.openai.com/codex/subagents
- Claude Code memory：通过 `CLAUDE.md` 等文件注入项目/用户记忆，memory 是上下文，不是强制策略。参考：https://docs.anthropic.com/en/docs/claude-code/memory
- Claude Code subagents：子 Agent 独立上下文、独立工具权限、通过描述触发。参考：https://docs.anthropic.com/en/docs/claude-code/sub-agents

## 5. 当前代码锚点

| 领域 | 当前代码 |
| --- | --- |
| Agent-only 发送主路径 | `src/renderer/src/hooks/useChat.ts`、`src/renderer/src/services/agent/agentRuntimeClient.ts` |
| 输入框与审批替换区 | `src/renderer/src/components/chat/ChatInputArea.tsx` |
| 统一审批卡片 | `src/renderer/src/components/chat/ApprovalDecisionCard.tsx` |
| AskUserQuestion | `src/renderer/src/components/chat/AskUserQuestionCard.tsx` |
| 右侧环境面板 | `src/renderer/src/components/chat/CodexEnvironmentInspector.tsx` |
| 右侧面板开关状态 | `src/renderer/src/stores/inspectorPanelStore.ts` |
| 设置页 | `src/renderer/src/pages/Settings.tsx` |
| 模型管理 | `src/renderer/src/components/models/ModelManageModal.tsx`、`ModelConfigPanel.tsx` |
| 模型解析 | `src/main/services/runtime/SessionRuntimeResolver.ts` |
| Plan mode gate | `src/main/services/llm/planModeGate.ts` |
| Agent profiles/teams | `packages/shared-types/src/agent-sdk.ts`、`AgentTeamSelector.tsx` |
| Agent runtime adapter | `packages/shared-types/src/agent-runtime.ts`、`src/main/services/agent/runtime/AgentRuntimeIpcBroker.ts` |
| Agent product event contract | `packages/shared-types/src/agent-product-events.ts`、`src/main/services/agent/runtime/productEventMaterializer.ts` |
| Agent run controller / reducer | `src/renderer/src/hooks/useAgentRunController.ts`、`src/renderer/src/hooks/useAgentEventReducer.ts` |
| Plan/Execute shared contract | `packages/shared-types/src/plan-execute.ts`、`src/renderer/src/lib/planExecute.ts` |
| JSONL 会话存储 | `src/main/services/storage/SessionStorageService.ts`、`jsonl.ts` |
| 消息虚拟列表 | `src/renderer/src/components/chat/ChatMessageList.tsx`、`chatMessageListVirtualization.ts` |
| 结构化输出渲染 | `src/renderer/src/components/chat/parts/StreamPartRenderer.tsx`、`src/renderer/src/components/markdown/StructuredCodeCard.tsx` |

### 5.1 当前实现边界与落地约束

2026-06-29 代码复核后，后续设计落地必须遵守以下约束：

- **Agent-only 已是实现口径**：`useChat.ts` 的导出 `ChatMode` 已固定为 `"agent"`，`SessionStorageService.create/updateMeta` 也会强制写入 `chatMode: "agent"`。发送链路当前是 runtime-first：走 `agentRuntimeClient.createQuery()`；runtime 创建失败时 materialize structured error、恢复 idle 并清理 current request/watchdog，不再默认 fallback 到 Agent SDK。后续 UI 不再出现“对话模式 / Agent 模式”切换；类型中残留的 `chatMode`、`workspaceId` 只作为迁移兼容字段。
- **项目会话数据不回写项目目录**：当前 `SessionStorageService.resolveSessionBucket()` 明确把项目会话写入 app userData 的 `projects/<projectId>/sessions/`，并用 `storageRoot: "project-app-data-fallback"`、`storageFallbackReason: "scr-data-disabled-by-policy"` 标记。不再把会话 JSONL、附件或工具输出迁入项目 cwd 的 `.scr-data`。
- **runtime adapter 事件是底层事件，不等同于产品事件**：`AgentRuntimeStreamEvent` 已有 `text.delta`、`tool.call`、`permission.request`、`result` 等底层事件。当前已新增 `AgentProductEvent` projection/materializer，把可持久化 run/tool/approval/message 事件写入 JSONL；本文 9.4 的 `context.snapshot`、`subagent.*`、artifact/remote 等更完整产品事件仍是后续语义层，不应一次性替换 adapter。
- **Plan/Execute 已有 shared contract 和基础持久化语义**：`PlanMessagePart`、`PlanDecisionRecord`、`PlanExecuteTurnLink` 和 `PlanCard` 基础 UI 已落地；execute/regenerate 当前通过现有 `sendMessage()` 创建新 Agent turn，并写入本地 message metadata。`plan.decision` / `execute.turn.created` product event、JSONL marker 和基础 replay 已接入；后续继续补历史摘要 UI 和 turn-level timeline UX。
- **输入区审批替换已落地，应继续保留**：`ChatInputArea.tsx` 已在存在 pending approval/AskUserQuestion 时用审批区替换普通 composer。后续 Plan decision、paused/error recovery 也应接入同一阻塞区，避免新增分散弹窗。
- **长会话性能已有基础，不应回退**：`ChatMessageList.tsx` 已使用 `react-window` 动态行高虚拟列表，并保留小会话 `Bubble.List` 路径；`chatInputStore` 已隔离输入内容，避免打字触发整页重渲染。后续改 UI 必须保留这些边界。
- **结构化代码块已有性能优化路径**：`StructuredCodeCard` 流式阶段使用轻量 highlighter，完成后再挂载完整代码卡片，避免大量代码块滚动时创建重型 editor view。后续代码块视觉优化应在这个组件内收敛。
- **右侧面板已有基础但不是完整 Context Inspector**：`CodexEnvironmentInspector` 目前覆盖 changes、runtime、branch、附件来源；还缺 token source breakdown、memory/rules、pin/unpin、compact 事件、tool timeline、subagent timeline、remote 状态。
- **Agent team selector 不是完整多 Agent**：`AgentTeamSelector` 只是用户选择团队/profile 的入口。完整 subagent task model、独立上下文、权限归属和 timeline 仍需要后续阶段实现。

## 6. 信息架构

### 6.1 主工作台

```text
+-----------------------------------------------------------------------+
| 顶部上下文栏                                                            |
| 项目 | 分支/Worktree | 模型 | Plan/Execute | 设置/环境面板                |
+--------------------+-------------------------------+------------------+
| 项目/会话侧边栏    | Transcript                    | 环境面板          |
|                    |                               | 可折叠/关闭       |
| - Casual 会话      | 用户消息                       | - 文件变更        |
| - 项目             | Agent 输出                     | - Git/runtime     |
| - 项目会话         | Tool call                      | - Context         |
| - 最近/搜索        | Plan card                      | - Tool timeline   |
|                    | Structured output              | - Subagents       |
|                    |                               | - Artifacts       |
|                    | 输入区或审批区                  | - Remote          |
+--------------------+-------------------------------+------------------+
```

### 6.2 Transcript

Transcript 是用户可见执行历史的主线，包含：

- 用户 turn。
- Assistant 文本与结构化输出。
- Plan card。
- Tool call 摘要和结果。
- 审批决策。
- AskUserQuestion 交互。
- Artifact 创建/更新。
- Subagent 摘要。
- 错误卡片。

长输出不应作为一整段 Markdown 直接塞进对话，而应转成 typed parts。

### 6.3 输入区 / 阻塞交互区

底部区域只有两种主状态：

| 状态 | 行为 |
| --- | --- |
| 输入区 | 用户输入 prompt，选择模型、Plan/Execute、上下文、工具/附件。 |
| 阻塞交互区 | 替换输入区，展示审批、AskUserQuestion、Plan 执行决策等。 |

审批区要求：

- 标题明确说明当前请求。
- 显示工具/命令/路径/风险。
- 选项纵向排列。
- 长内容截断，hover/tip 展示完整内容。
- 按钮包含确认和拒绝，不只保留确认。
- 键盘可操作。
- 决策后显示状态：已允许、已拒绝、已跳过、执行中、失败。

## 7. 设置页设计

设置页保留独立路由，但重组为 Codex 风格的稳定设置中心。

一级分组全部保留：

1. General
2. Models
3. Agent
4. Context & Memory
5. Tools & Permissions
6. Projects
7. MCP
8. Skills
9. App Plugins
10. Keyboard
11. Advanced

布局：

```text
+-------------------------------------------------------------+
| 设置                                                        |
+----------------------+--------------------------------------+
| General              | 当前设置分组                         |
| Models               |                                      |
| Agent                | 分组标题                             |
| Context & Memory     | 表单/列表/状态                       |
| Tools & Permissions  | 校验/错误/说明                       |
| Projects             |                                      |
| MCP                  |                                      |
| Skills               |                                      |
| App Plugins          |                                      |
| Keyboard             |                                      |
| Advanced             |                                      |
+----------------------+--------------------------------------+
```

设置页不做营销式大卡片，不使用复杂装饰；重点是高密度、可扫描、可重复配置。

## 8. 模型选择与模型配置

### 8.1 模型解析层级

模型解析顺序：

1. 输入框 model pill 选择。
2. 会话级 override。
3. 项目默认模型。
4. 全局默认模型。
5. runtime fallback。
6. 子 Agent 运行时模型选择。

UI 必须显示当前生效来源：

- `本次选择`
- `会话覆盖`
- `项目默认`
- `全局默认`
- `Runtime fallback`
- `Subagent selected`

### 8.2 输入框 Model Pill

Model pill 是当前工作流最快入口：

- 点击打开模型选择器。
- 支持搜索 provider/model/capability。
- 展示 provider、模型名、上下文长度、能力标签。
- 选择后保留在当前输入区展示，发送后不自动恢复。
- 提供清除/恢复默认入口。

Model pill 的状态语义必须明确，避免“本次选择”和“会话覆盖”混用：

| 操作 | 写入位置 | 生命周期 | UI 文案 |
| --- | --- | --- | --- |
| 临时选择本次模型 | `messageOverride.model` | 只对下一次 send 生效；发送成功、取消或切换会话后清除。 | `本次使用` |
| 固定为当前会话模型 | `session.modelOverride` | 对当前会话后续 send 生效，直到用户清除。 | `会话覆盖` |
| 清除会话覆盖 | 删除 `session.modelOverride` | 回到项目默认或全局默认。 | `恢复默认` |

默认交互：

- 点击 model pill 只做临时选择，不自动写会话覆盖。
- 模型选择器提供二级动作“设为本会话默认”。
- 发送后不自动恢复只适用于会话覆盖；临时选择必须随本次 send 消耗掉。
- UI 必须展示 effective model source，并提供清除路径。

### 8.3 Provider 层

Provider 管理负责连接配置：

- 预设 provider：OpenAI、Anthropic、OpenRouter、DashScope、Ollama/local 等。
- 自定义 provider：baseURL + API format + headers。
- API key/secret。
- baseURL。
- API format：Anthropic Messages、Chat Completions、Responses、OpenAI-compatible、local。
- 自定义 headers。
- 拉取模型列表。
- 测试连接。
- provider health / last error。
- 默认调用方式：`auto`、`native-function-calling`、`langchain-mcp`。`auto` 按 provider/model 能力选择；OpenAI、Gemini、Claude/Anthropic 默认解析为 `native-function-calling`，开源模型和 OpenAI-compatible/local provider 默认解析为 `langchain-mcp`。

### 8.4 Model 能力层

Model 能力配置负责模型元数据：

- 上下文长度。
- reasoning 支持和 effort 档位。
- 原生 tool/function calling 支持。
- LangChain + MCP 工具适配支持。
- vision/image 支持。
- structured output 支持。
- streaming 支持。
- 能力标签：code、fast、long-context、local、tool-capable、vision。

元数据来源：

1. 内置 preset。
2. Provider 拉取后自动推断。
3. 用户手动覆盖。

第一阶段不要求准确成本/价格表。

## 9. Agent Loop 架构

### 9.1 状态机

```text
idle
  -> composing
  -> run.started
  -> planning | executing
  -> awaiting_plan_decision
  -> executing
  -> awaiting_approval | awaiting_answer | streaming_output
  -> compacting_context
  -> completed | stopped | error
```

### 9.2 Plan 模式

Plan 是一等执行策略。

Plan 允许：

- 读文件。
- 搜索。
- 分析。
- 提问澄清。

Plan 禁止：

- 写文件。
- 删除文件。
- 危险命令执行。

Plan 输出为结构化卡片：

- 目标摘要。
- 步骤。
- 风险。
- 预计改动文件。
- 需要的审批。
- 需要的上下文。
- 建议使用的 Subagent。
- 执行。
- 取消。
- 重新生成。
- 执行前可编辑步骤。

点击执行后创建新的 execute turn，并关联 plan id。

当前代码中已有 `PlanMode` 兼容枚举。产品 UI 只展示 Plan / Execute 两种主状态，但实现需要按下表兼容旧值：

| 现有 `PlanMode` | 产品解释 | 运行策略 | 后续方向 |
| --- | --- | --- | --- |
| `chat` | 兼容值；不代表 direct/chat 产品模式。 | 作为 Execute 的默认轻量策略，允许正常 Agent 回复和安全工具路径。 | 逐步重命名为 `execute` 或通过 adapter 映射。 |
| `plan-only` | Plan。 | 只读、搜索、分析、提问；禁止写入/删除/危险命令。 | 保留为 Plan 的内部策略。 |
| `plan-then-ask` | Plan → 等待用户决策。 | 输出 Plan card，进入 `awaiting_plan_decision`。 | 映射到 Plan card flow。 |
| `auto-execute-safe` | Execute with safe auto-run。 | 低风险操作可自动执行，高风险进入 approval。 | 作为 Execute policy，而不是第三种 UI 模式。 |
| `full-agent` | Execute。 | 允许在 approval/sandbox 下完整执行。 | 作为 Execute policy，而不是单独 UI 模式。 |

任何新增 UI 文案都不能把 `chat` 展示成“普通对话模式”。它只是兼容枚举值。

### 9.3 Execute 模式

Execute 可以在 approval/sandbox policy 下运行工具。

要求：

- 可停止。
- 停止后保留 partial output。
- 活跃 tool/approval/ask 状态必须释放或标记 stopped。
- 事件历史可回放。

### 9.4 统一事件模型

所有 runtime 路径收敛为一套事件：

| Event | 含义 |
| --- | --- |
| `run.started` | Agent run 开始。 |
| `turn.created` | 创建 user/plan/execute/tool/subagent turn。 |
| `message.delta` | assistant 文本流式增量。 |
| `structured_part.started` | typed part 开始。 |
| `structured_part.delta` | typed part 增量。 |
| `structured_part.completed` | typed part 完成。 |
| `plan.created` | 生成结构化计划。 |
| `plan.updated` | 用户或 Agent 修改计划。 |
| `execute_turn.created` | 从 plan 创建执行 turn。 |
| `tool.call` | 工具调用开始或被提出。 |
| `approval.requested` | 需要用户审批。 |
| `approval.resolved` | 审批完成。 |
| `tool.result` | 工具结果。 |
| `tool.error` | 工具失败或被拒绝。 |
| `ask.requested` | Agent 询问用户。 |
| `ask.answered` | 用户回答。 |
| `context.snapshot` | 捕获上下文快照。 |
| `context.compacted` | 上下文压缩/摘要完成。 |
| `memory.read` | memory/rules 被注入。 |
| `memory.write_proposed` | Agent 提议写入 memory。 |
| `subagent.started` | 子 Agent 开始。 |
| `subagent.delta` | 子 Agent 进度。 |
| `subagent.completed` | 子 Agent 完成。 |
| `artifact.created` | Artifact 创建。 |
| `artifact.updated` | Artifact 更新。 |
| `run.completed` | Run 完成。 |
| `run.stopped` | Run 被停止。 |
| `run.error` | Run 失败。 |

### 9.5 持久化

稳定 product/session events 必须可持久化、可回放；token delta、streaming buffer、未完成 reasoning 等热路径 transient events 不直接落 JSONL，只在形成稳定 message/part/run 事件后持久化。

最小字段：

- `eventId`
- `runId`
- `turnId`
- `sessionId`
- `projectId?`
- `type`
- `timestamp`
- `seq`
- `payload`
- `status`

### 9.6 Current → Target 事件映射

现有系统有三层事件/状态源，目标不是一次性替换，而是按 projection 收敛：

| 当前来源 | 当前例子 | 目标语义事件 | 是否落 JSONL | 说明 |
| --- | --- | --- | --- | --- |
| Runtime adapter | `text.delta` | `message.delta` | 否，除非形成稳定 part。 | 运行时流式热路径；renderer 可增量显示，完成后写稳定事件。 |
| Runtime adapter | `reasoning.delta` | `structured_part.delta` 或 `message.delta(reasoning)` | 否，默认 transient。 | 第一阶段只展示，不默认持久化完整 reasoning。 |
| Runtime adapter | `tool.call` | `tool.call` | 是。 | 写成 session tool event，并驱动 tool card。 |
| Runtime adapter | `tool.result` | `tool.result` | 是，长结果只写摘要 + `contentRef`。 | 大 stdout / artifact body 不常驻 renderer state。 |
| Runtime adapter | `permission.request` | `approval.requested` | 是。 | 与输入区阻塞状态绑定。 |
| Runtime adapter | `permission.resolved` | `approval.resolved` | 是。 | 记录用户决策、scope 和 reason。 |
| Runtime adapter | `result` | `run.completed` / `run.stopped` / `run.error` | 是。 | 作为 run 终态。 |
| JSONL session event | `user_message` | `turn.created(user)` | 是。 | replay 时还原 user turn。 |
| JSONL session event | `assistant_message` | `turn.created(assistant)` + `message.delta/final` | 是。 | 兼容旧整段消息。 |
| JSONL session event | `assistant.part_start/update/end` | `structured_part.started/delta/completed` | 是。 | 新 structured parts 主路径。 |
| Renderer state | `pending approval` | `awaiting_approval` blocked state | 派生，不单独落盘。 | 来源是 approval/tool events，UI state 可从事件恢复。 |
| Renderer state | `streamingContent` | in-flight `message.delta` | 否。 | 只做即时渲染，完成后归并为稳定消息/part。 |

落盘原则：

- 稳定事实落 JSONL：user turn、assistant final/part、tool call/result/error、approval request/resolution、plan、context compact、artifact metadata、run terminal event。
- 热路径 transient 不直接落盘：每个 token delta、临时 streaming buffer、未完成 reasoning 全量内容。
- replay 以 JSONL 为 source of truth；renderer store 只能作为当前窗口派生状态。

## 10. Tool Call 与审批

### 10.1 工具分类

工具展示和审批按类别处理，而不是按原始 tool name 随意展示。

| 类别 | 示例 | 默认展示 |
| --- | --- | --- |
| 文件读取 | read file、list directory | 路径列表/摘要；越界读取提高风险。 |
| 文件写入/编辑 | write、patch、delete | diff/预计改动文件；默认需要审批。 |
| 命令执行 | shell、test、git | command block、cwd、环境、timeout、风险。 |
| 网络请求 | fetch、API request | URL、method、目标域、数据敏感性。 |
| 外部应用 | open editor/browser/terminal | app、目标、范围。 |
| MCP | MCP tool call | server、tool、输入摘要、权限来源。 |
| Skill | skill command/tool | skill id、command、上下文。 |
| Ask user | AskUserQuestion | 输入表单。 |
| Artifact | 生成文件/报告 | 预览、目标位置。 |

### 10.2 Approval Policy

Approval policy 决定什么时候问：

- 总是询问。
- 风险操作询问。
- 安全读取自动允许。
- session/project grant 自动允许。
- policy 直接拒绝。

### 10.3 Sandbox Policy

Sandbox policy 决定实际能不能执行：

- 文件读写范围。
- 网络访问。
- 外部应用启动。
- 命令执行。
- Git 操作。
- MCP tool 执行。

审批不能绕过 sandbox 硬限制。sandbox deny 要显示结构化拒绝原因。

### 10.4 Grants

授权作用域：

- once。
- session。
- project。

grant key 应包含：

- 工具类别。
- 目标资源。
- tool identity。
- project/session。
- 风险等级。

## 11. Context 与 Memory

### 11.1 Context 来源

Agent context 由以下来源组成：

- 用户 prompt。
- 当前 project cwd 和元数据。
- 明确选择的附件。
- 引用文件。
- pinned context。
- 搜索结果。
- 从 `AGENTS.md` / `CLAUDE.md` 读取的项目规则。
- 用户级偏好。
- 会话摘要。
- Subagent 输出。
- 被选择继续携带的工具结果。

### 11.2 Context Inspector

UI 需要展示：

- token 使用。
- 各类 context 占比。
- 注入的文件/附件。
- 注入的 memory/rules。
- pin/unpin 状态。
- compact 后的摘要。
- 被省略的内容和原因。

### 11.3 Compact / Summarize

触发条件：

- token 超阈值自动触发。
- 用户手动触发。
- 每 N 轮自动触发。
- 长工具输出自动摘要。

compact 必须形成可见事件，不能静默发生。

### 11.4 Memory 作用域

| Scope | 默认可见范围 |
| --- | --- |
| 用户级偏好 | 所有项目，除非用户关闭。 |
| 项目规则 | 只进入对应项目。只读 `AGENTS.md` / `CLAUDE.md`。 |
| 会话摘要 | 只进入当前会话。 |
| Agent/Subagent memory | 默认只进入对应 Agent。 |

Memory 写入应通过 proposal，而不是静默提交。

## 12. 多 Agent

### 12.1 委派触发

主 Agent 可通过三种方式委派：

1. 主 Agent 自动判断。
2. 用户在输入区选择 team/profile。
3. Plan card 建议 subagent，用户确认。

### 12.2 子 Agent 执行

默认规则：

- 默认共享项目 cwd。
- 独立上下文。
- 独立 memory。
- 可独立权限。
- 只读 subagent 默认只读。
- 高风险工具必须重新审批。

每个 subagent 独立 worktree 是后续增强，不作为默认。

### 12.3 子 Agent UI

右侧环境面板负责子 Agent timeline：

- 活跃子 Agent。
- 状态：queued/running/blocked/completed/failed。
- 工具活动。
- 带来源归属的审批请求。
- summary result。
- 可展开完整子线程。

主 transcript 默认只展示子 Agent 摘要，不塞满所有子线程事件。

## 13. 右侧环境面板

环境面板可折叠/关闭，包含：

1. Changes：修改文件、diff、生成 artifacts。
2. Git：branch、worktree、commit/push、dirty state。
3. Runtime：cwd、sandbox、approval policy、Plan/Execute。
4. Context：附件、memory、rules、token 使用、pinned context。
5. Tool timeline：命令/工具历史、状态、错误。
6. Subagents：活跃/完成的子 Agent timeline，可展开子线程。
7. Remote：IM 绑定、webhook 状态、远端投递状态。

## 14. 结构化输出

Assistant 输出应支持 typed parts：

- text。
- code block。
- diff。
- file tree。
- command output。
- tool result。
- table/data。
- source/reference list。
- artifact preview。
- plan card。
- approval/ask card。
- error card。

工具结果展示按类型区分：

- command output：摘要 + stdout/stderr 可展开，错误默认展开。
- file write/edit：diff 优先。
- file read/list：路径/表格紧凑展示。
- network：请求/响应元信息 + 安全 body preview。
- MCP/Skill：server/skill identity、输入摘要、输出 preview。
- artifact：preview、open/reveal/export。

## 15. Artifacts

Artifacts 是一等对象：

- 生成文件。
- 代码片段。
- 报告。
- Markdown 文档。
- Plan。

展示位置：

- transcript 中作为创建/更新事件。
- 右侧面板展示当前会话 artifacts。
- 独立 artifact library 可浏览和复用。

元数据：

- `artifactId`
- `sessionId`
- `projectId?`
- `kind`
- `title`
- `sourceTurnId`
- `path?`
- `contentRef?`
- `createdAt`
- `updatedAt`

## 16. Remote IM

Remote IM 是完整产品路径：

- remote-bound session 仍走 Agent runtime。
- remote 消息进入同一事件模型。
- 审批和 AskUserQuestion 默认回到桌面 UI，除非配置了安全的远端审批通道。
- remote 状态进入右侧环境面板。
- 远端投递错误是结构化事件。
- 删除/归档 remote-bound session 要有 unbind/cleanup 语义。

## 17. 非目标

- 不恢复 direct/chat 模式。
- 不创建统一 Extensions 页面。
- 不把 MCP、Skills、App Plugins 合并隐藏到一个入口。
- 不把审批当成 sandbox 绕过。
- 不通过 UI 编辑 `AGENTS.md` / `CLAUDE.md`。
- 第一阶段不要求准确成本统计。
- 第一阶段不要求每个 subagent 独立 worktree。
- 不静默写 memory。
- 不把打包/build 作为本设计的常规验证要求。
