# Agent Runtime and Project Cleanup Follow-up Plan

> 入口：[refactor-plan](./refactor-plan.md)
> 相关计划：[runtime-enforcement-matrix](./runtime-enforcement-matrix.md) ·
> [deletion-retention-matrix](./deletion-retention-matrix.md) ·
> [git-worktree-preflight](./git-worktree-preflight.md) ·
> [sidebar-parity-plan](./sidebar-parity-plan.md) ·
> [streaming-structured-output-plan](./streaming-structured-output-plan.md)

## 1. 当前 Agent 运行链路

当前产品已经固定为 Agent 模式。实际运行链路如下：

1. Renderer `useChat.sendAgentMessage()` 创建 `requestId`，把当前 `conversationId` 同时作为 `sessionId` 传给 main。
2. Preload/IPС 调用 `agent-sdk:create-query`。
3. Main `AgentSDKService.createQuery()` 调用 `@anthropic-ai/claude-agent-sdk` 的 `query({ prompt, options })`。
4. `AgentSDKService` 解析 session runtime：
   - `sessionId` → `SessionRuntimeResolver`
   - project/casual cwd → `resolveConversationCwd`
   - project runtime policy → Agent SDK `permissionMode`
5. Agent SDK stream message 被归一化为 renderer 事件：
   - `init`
   - `text_delta`
   - `tool_call`
   - `tool_use_summary`
   - `permission_request`
   - `permission_denied`
   - `done`
   - `error`
6. Renderer `useChat` 把 tool/permission/ask 事件 upsert 到同一个 tool message。
7. 用户审批后调用 `agentSDK.resolvePermission(toolUseId, allowed, updatedInput?, updatedPermissions?)`，SDK 继续执行。

## 2. Claude / Codex 参考原则

本项目不复刻某个产品 UI，而是吸收两类成熟交互模式：

- Claude 风格：左侧 recents/projects，当前对话优先；tool/ask 交互在 transcript 内作为上下文卡片，不脱离会话历史。
- Codex 风格：项目/分支/权限/运行环境是任务上下文的一部分；需要审批时用明确的阻塞选择，支持 Allow once、Allow for project/session、Reject，并在确认后继续执行。

统一原则：

- 所有审批必须进入同一类 Approval interaction，不再散落成按钮、Modal、toast 或 raw exception。
- AskUserQuestion 是“模型询问用户”，不是普通工具；它仍使用问答卡片，但视觉和阻塞状态应与 approval family 保持一致。
- 最新交互：当 pending tool_call / approval / ask 出现时，Composer 输入区切换为阻塞交互面板；普通输入框隐藏或降级为不可编辑 pending surface，用户先处理当前请求，再恢复输入。

## 3. 用户反馈汇总

### 问题 1：删除项目时运行状态和数据清理不完整

现状：

- `ProjectStorageService.remove()` 只删除 project registry 和 app 数据目录里的 project bucket。
- renderer 只从 `useProjectStore.projects` 移除项目。
- 如果当前项目会话正在 streaming/tool_calling，`useChatMessageStore.sessionStatus` 不会被重置。
- project sessions 当前按最新实现存储在 app-managed userData：`<appData>/<user>/projects/<projectId>/sessions`；项目 `cwd` 只作为运行目录，不写客户端数据。

预期：

- 删除项目时，项目关联的所有会话、会话附件、tool outputs、file artifacts、UI streaming 状态一起清理。
- project session 数据与 casual session 都由 app userData 托管，但分桶隔离：`casual-sessions/` 与 `projects/<projectId>/sessions/`。
- 删除项目只能删除 app-managed project bucket，不触碰用户真实项目目录。

本轮实现：

- 删除项目前触发当前 chat stream stop。
- 删除项目后清理 renderer 中该项目下所有 conversation/session/file-artifact 状态。
- 如果当前会话属于被删项目，fallback 到其它可用会话；没有可用会话则清空 messages 并置 idle。
- 文案改为“删除项目数据”，不再暗示仅从列表移除。
- project session 主存储保持在 app userData project bucket，不迁移到 `<project.cwd>/.scr-data`。
- `storageRoot` 对项目会话记录为 `project-app-data-fallback`，`storageFallbackReason` 使用 `scr-data-disabled-by-policy` 表示这是产品策略而不是运行时失败。
- 删除项目时默认清理 app-managed `projects/<projectId>/sessions` 及其 attachments/tool-outputs；`keepFiles=true` 保留 app-managed project bucket 用于 orphan/recovery。

后续 P0：

- 增加 Settings recovery/cleanup 入口，允许用户恢复或物理清理 app-managed orphan project/session bucket。
- 如果未来重新考虑项目目录内 `.scr-data`，必须先更新 privacy/export、deletion-retention、backup/recovery 文档，并重新评审“不触碰用户 cwd”的产品约束。

### 问题 2：设置中的菜单配置删除

现状：

- Settings 里仍有“菜单配置”tab。
- 重构后一级导航已固定为 Agent/project/marketplace 工作流，不再需要用户管理菜单。

本轮实现：

- Settings 删除菜单配置 tab。
- 菜单配置组件保留为兼容死代码，后续 cleanup PR 可物理删除 `MenuSettings/MenuRow/MenuEditModal/MenuIconConfig/menuStore`。

### 问题 3：保留独立市场页面，取消 Extensions 聚合页

现状：

- `/extensions` 聚合页会削弱原有 MCP 市场、Skill 市场、应用插件市场的清晰入口。
- MCP、Skill、应用插件不是同一个产品实体：
  - MCP / Skill 是 Agent 可用能力与运行时上下文。
  - 应用插件是扩展 app UI、app 功能和可能的能力贡献。
- 应用插件不应该混入 Agent capability descriptor 类型，也不再放进 Extensions 聚合页。

目标：

- 取消用户可见的 `/extensions` 页面和菜单入口。
- `/mcp`、`/skills`、`/plugins` 作为一级市场/管理入口保留。
- App Plugin 中文名统一为“应用插件”，定位为 app UI、app 功能和能力贡献扩展。
- 如果应用插件未来贡献 Agent-facing capability，只在 runtime capability / approval 层体现，不改变应用插件的产品入口。

本轮实现：

- 删除 `/extensions` route 和默认菜单项。
- sidebar / quick menu 不再显示 Extensions。
- feature flag `unifiedNavigation` 仅保留兼容字段，不再控制可见入口。
- `/skills`、`/mcp`、`/plugins` 保留原市场/管理页面。

后续 P1：

- 抽出独立市场页之间可复用的 market shell：搜索、source 选择、已安装状态、空状态、错误状态、安装/启用/禁用动作保持一致。
- App Plugin 只在应用插件中心管理；若应用插件贡献 agent-facing capability，runtime 层只显示该 capability，不显示应用插件本体。

### 问题 3.1：MCP / Skill 设计需要重新设计

当前问题：

- MCP 页面同时承载 market source、内置 server、第三方配置、已安装状态、工具状态，缺少清晰的信息架构。
- Skill 页面混合内置 skill、市场 skill、已安装 skill、聊天入口，未区分“可发现”“已安装”“当前项目/会话启用”“运行时可调用”。
- MCP / Skill 都缺少统一的 scope 语义：global、project、session、temporary grant 没有在 UI 和数据模型中明确表达。
- “市场 item / installed item / runtime capability / permission policy”混在一起，后续做权限、审计、项目级启用和导入导出会继续变复杂。

重设计目标：

- MCP 重构为四层：
  - Discover：市场与 source 管理。
  - Installed：已安装/已配置 server，包括内置、第三方、市场安装。
  - Runtime Tools：当前可被 Agent 调用的 tools、状态、最后错误、权限需求。
  - Scope & Policy：global/project/session 启用状态、runtime approval、网络/命令/file access 风险。
- Skill 重构为四层：
  - Discover：Skill 市场。
  - Built-in：随应用提供、只读、无需安装的 skills。
  - Installed：用户安装的 skills、版本、来源、校验状态。
  - Activation：global/project/session 启用与当前聊天可用状态。
- MCP、Skill、应用插件各自保留独立 domain model，不再通过 Extensions 页面聚合。

后续 P1/P2：

- P1：补 MCP/Skill 领域模型文档，拆清 `market item`、`installed config`、`runtime capability`、`permission grant`。
- P1：新增统一 status model：`installed | enabled | available | error | needs-config | needs-approval`。
- P2：改造 MCP 页面 IA，先不改底层服务，只重排现有数据。
- P2：改造 Skill 页面 IA，明确 built-in / market / installed / enabled scopes。
- P2：把项目级启用和 session grant 纳入 project settings overlay，不再散落在页面状态或 store 中。

### 问题 4：新建对话入口和项目/分支选择

现状：

- Sidebar “对话”容易被理解为导航项，不像创建动作。
- `NewConversationModal` 只选择普通/项目和远端 IM，缺少 branch/worktree 语义。

目标：

- 按钮命名为“新建对话”。
- 新建对话可创建普通对话或项目对话。
- 项目对话选择项目工作目录和分支。
- 分支下拉支持：
  - 当前分支
  - 创建新分支
  - 创建新 worktree/新分支
  - Git 图谱弹窗

本轮实现：

- Sidebar chat quick action 显示“新建对话”。
- `NewConversationModal` 增加项目分支区域：
  - 读取当前项目 git branch info。
  - 支持当前分支 / 新分支 / 新 worktree 三种选择 UI。
  - 提供 Git 信息弹窗作为图谱入口的 MVP。

后续 P1：

- 增加 branch list / switch branch IPC。
- 增加真正 git graph 数据：commit DAG、当前 HEAD、upstream、dirty files。
- 创建新分支或 worktree 走 command-exec approval gate。

### 问题 5：审批交互统一

现状：

- 普通工具审批在 `ToolCallCard` 内用三按钮。
- Agent SDK AskUserQuestion 用单独卡片。
- 视觉上和 Codex 风格的阻塞审批选择不一致。

目标：

- 所有工具审批统一维护。
- 审批卡片使用清晰的“需要权限 + 选项 + 确认”结构：
  - 允许，仅此一次
  - 始终允许本项目/本会话
  - 拒绝
- 保留 transcript-first，不使用系统级 Modal。
- ToolCall/Ask 的阻塞交互应优先落在 composer 区域，避免普通聊天流里出现 raw `tool_call>` 文本或过大的工具审批卡片；聊天流中保留执行历史摘要。

本轮实现：

- `ToolCallCard` awaiting approval 状态改为选择式 Approval panel，确认后提交。
- `Allow for session` 仍写 session grant，并把 SDK suggestions 作为 updatedPermissions 传回。
- 抽出 `ApprovalDecisionCard`，ToolCall 和 AskUserQuestion 共享同一外框、状态和操作区。
- 按最新要求，下一步 UI 应把 active approval/ask 挂到 composer pending surface；transcript 内 tool message 只显示状态、输入/结果摘要和错误。

后续 P1：

- 让 attachment ask-before-read、runtime command/file/network gate 全部接入 `ApprovalDecisionCard`。

### 问题 6：消息展示缺少虚拟列表优化

现状：

- `ChatMessageList` 当前通过 `@ant-design/x` 的 `Bubble.List` 渲染完整消息列表。
- 未使用 `react-window`、虚拟列表或动态高度测量。
- 长会话里每次新增 chunk / tool card / markdown 更新都会让大量 Bubble item 参与 React diff，后续会成为性能瓶颈。

目标：

- 按“turn”而不是单条 message 虚拟化：
  - user turn = 单个用户消息
  - assistant turn = assistant text + tool/approval/ask cards 的组合
- 使用动态高度虚拟列表：
  - 每个 turn 初始估高。
  - 渲染后用 `ResizeObserver` 测量真实高度并回写 size cache。
  - markdown、代码块、图片/附件、tool result 展开收起后触发重新测量。
- 保持聊天体验：
  - 当用户在底部附近时自动跟随最新消息。
  - 用户向上滚动查看历史时，不强制跳到底部。
  - pending approval / ask 出现时 composer pending surface 自动可见；transcript 只保留对应 tool/ask 历史摘要。
  - 支持 `msg-<id>` 定位和搜索跳转。

设计方案：

- 新增 `VirtualMessageList`：
  - 复用当前 `ChatMessageList` 的 turn grouping 和 bubble rendering。
  - 引入 `react-window` dynamic list 或本地 `useVirtualMessageList` 实现。
  - `overscan` 默认 6-10 个 turn。
  - 保留非虚拟 fallback，便于回滚。
- 把 streaming markdown 隔离成单独 memoized row，避免每个 chunk 重建整组 list。
- 大于阈值再启用虚拟化：
  - `turns.length <= 80` 继续用普通 `Bubble.List`，减少小会话复杂度。
  - `turns.length > 80` 启用 virtual list。

验收：

- 500+ turns 的历史会话滚动不卡顿。
- streaming 时非当前 row 不重新渲染。
- approval / AskUserQuestion 卡片可见且键盘交互不丢焦点。
- 搜索跳转和复制/收藏/删除按钮仍工作。

本轮实现：

- 保留 `Bubble.List` 作为小会话路径，`turns/items > 80` 时启用 `react-window` v2 `List + useDynamicRowHeight`。
- 虚拟列表按现有 turn/bubble item 渲染，不重写 markdown、tool card、approval、AskUserQuestion、context menu、bookmark action。
- pending approval / AskUserQuestion 触发 composer pending surface；对应 turn 保留 `hasPendingInteraction` 标记用于历史定位，但不再把主审批交互塞进大消息卡片。
- 新增阈值单测；大列表视觉和滚动继续通过 `pnpm dev` 做人工回归。

### 问题 7：代码 / diff / tool / 结构化结果缺少流式结构化展示

现状：

- assistant streaming 仍主要依赖 markdown 文本拼接。
- 代码块、diff、JSON、表格、文件树、引用等结构化内容没有 stable part id，无法独立更新、折叠、复制、虚拟化或最终校验。
- `tool_call` / `tool_use` / `tool_error` 已开始收口到 tool message，但还缺少统一的 typed part state machine。
- raw protocol 文本一旦漏过 normalization，就会出现在用户可见正文里。

目标：

- 引入 typed message parts，把 text、code block、diff、tool、data、table、tree、sources、status、artifact 分开渲染。
- 同一个 part id 的更新必须 reconcile，不能重复插入卡片。
- tool 状态统一为 `input-streaming -> input-available -> approval-requested -> executing -> output-available/output-error/denied`。
- transient status 只用于 UI 进度，不写入 JSONL 历史。
- 代码块和大结构化结果按 part 层级节流渲染，避免每个 token 重建整条消息。

执行依据：

- 详细协议、renderer 拆分、性能要求和验收测试见 [streaming-structured-output-plan](./streaming-structured-output-plan.md)。
- 实现顺序应排在虚拟列表基础能力之后，至少先保证 part 高度变化能触发当前 row remeasure。

## 4. 本轮验证

- `pnpm check`
- `pnpm test:run`
- `pnpm lint`
- `pnpm i18n:check`
- `pnpm dev` 只验证 dev compile，不跑 build。
