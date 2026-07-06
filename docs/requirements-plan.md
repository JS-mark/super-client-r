# Agent 客户端需求规划与实施计划

> 日期：2026-06-27
>
> 最近复核：2026-06-30
>
> 状态：规划草案
>
> 设计文档：[design-doc.md](./design-doc.md)

## 1. 目标

本文把 [design-doc.md](./design-doc.md) 中的目标体验转换为需求、当前代码差距、阶段计划和验收标准。

已确认优先级：

1. Agent loop 状态机、事件流、tool call、approval、plan card。
2. 模型选择和模型配置。
3. UX/布局和设置页重组。
4. Context、Memory、结构化输出、Artifacts。
5. 多 Agent 委派。

Remote IM 纳入完整设计，在每个相关阶段同步考虑。

## 2. 产品与工程原则

这些原则是所有阶段的验收约束，不是可选优化项。

1. **产品交互体验要好**：关键交互必须流畅、反馈明确、状态可理解。审批、Plan、模型切换、Context 查看不能让用户猜当前系统在做什么。
2. **流程交互要简单明了**：优先缩短主路径，减少不必要弹窗和配置跳转。复杂配置放设置页，执行中的决策放输入区/右侧环境面板。
3. **性能开销要小**：长会话、流式输出、工具日志、结构化代码块、子 Agent timeline 都必须避免全量重渲染和 UI 卡顿。
4. **内存占用要小**：renderer 不长期持有大体积 stdout、文件内容、artifact 内容和历史 transcript 全量对象。优先使用摘要、引用、分页、懒加载、虚拟列表。
5. **默认摘要，按需展开**：工具结果、命令输出、子 Agent 细节、context 详情默认展示摘要，用户需要时再展开。
6. **可观测和可恢复**：所有关键状态变化必须落到事件或可回放状态中，包括 approval、compact、plan execution、subagent、remote delivery。

## 3. 当前代码差距

| 领域 | 当前证据 | 差距 |
| --- | --- | --- |
| Agent-only 发送路径 | `useChat.ts` 已固定 Agent 模式，并已改为 `agentRuntimeClient.createQuery()` runtime-first；runtime 创建失败不再 fallback 到 `agentSDKClient.createQuery()`，而是在当前 assistant 占位消息上 materialize structured error、恢复 idle 并清理 current request/watchdog。 | `useChat` 已拆出多组 helper，但仍承担 orchestration；product event replay 和 run terminal renderer-visible 状态仍需继续确认。 |
| 输入区审批替换 | `ChatInputArea.tsx`、`ApprovalDecisionCard.tsx`、`AskUserQuestionCard.tsx` 已存在。 | 需要正式定义输入区/审批区/Ask/Plan 决策区的状态契约。 |
| Tool call 展示 | `ToolCallCard`、`ApprovalDecisionCard` 已有基础。 | 需要统一事件分类和按工具类型展示策略。 |
| Plan mode | `PlanMode` 类型和 `planModeGate.ts` 已存在。 | 需要完整 Plan card、可编辑步骤、execute turn、Plan 限制 enforcement。 |
| 模型选择 | `SessionRuntimeResolver` 和 `useChat` 已有全局/项目/会话解析；当前批次已完成 one-shot model override、会话默认、`source` / `sourceLabel` 生效来源展示和发送后清理。 | 需要继续补模型能力元数据、Provider/Model 配置体验和子 Agent 运行时模型选择。 |
| 模型管理 | `ModelManageModal`、`ModelConfigPanel` 已存在。 | 需要重做 Provider / Model 两层设置。 |
| 设置页 | `Settings.tsx` 已有独立路由；当前批次已完成 Settings 分组、URL tab sync、无 `/extensions` 用户路由、MCP/Skills/Plugins 独立入口、Agent-only 文案和 Project Recovery 安全入口。 | 需要继续补完整 recovery wizard、backup/export 等设置深水区和 inspector 联动。 |
| 右侧环境面板 | `CodexEnvironmentInspector.tsx` 和 `inspectorPanelStore` 已存在。 | 需要补齐 changes、git/runtime、context、tool timeline、subagents、remote、artifacts。 |
| Context budget | `ContextUsagePill` 已有基础。 | 需要完整 context inspector、注入源列表、pin/unpin、compact event。 |
| Memory/rules | 仓库已有 `AGENTS.md`。 | 需要定义 memory 作用域和只读项目规则注入。 |
| 结构化输出 | `StreamPartRenderer`、`StructuredCodeCard` 已覆盖 text/code/diff/data/table/tree/source/artifact/status 的基础渲染；当前批次已补 typed tool part summary、大 tool result 折叠态 capped preview，以及带 `contentRef` part 的轻量引用摘要视图。 | 需要继续补 command/artifact 专用展示、contentRef 生产/读取 API、分页加载和 native structured event coverage。 |
| 长会话性能 | `ChatMessageList` 已接入 `react-window` 动态行高虚拟列表，`chatInputStore` 已隔离输入状态；当前批次已有 500 user/assistant turns + 多代码块虚拟列表测试。 | 需要继续拆分 `useChat`，并补真实运行长会话输入延迟/滚动 smoke。 |
| 存储与会话 | `SessionStorageService` 已正式使用 JSONL，创建/更新强制 `chatMode: "agent"`，项目会话写 app userData。 | 需要把项目删除、导出/备份、replay、repair、large output 引用化继续收口；不要恢复 `.scr-data` 写入方案。 |
| Agent runtime adapter | `AgentRuntimeIpcBroker` 和 shared `AgentRuntimeStreamEvent` 已有底层流事件。 | 需要增加产品语义事件 projection：run/turn/plan/context/memory/subagent/artifact/remote。 |
| 多 Agent | 已有 Agent profiles/teams 和 `AgentTeamSelector`。 | 需要主 Agent 委派语义、subagent task model、timeline、子线程展开、权限归属。 |
| Remote IM | 已有 remote 服务。 | 需要纳入同一 Agent event model，处理 approval/ask、投递错误、unbind 生命周期。 |

### 3.1 2026-06-29 代码复核结论

本次复核结论用于修正后续计划，不替代上面的需求目标。

| 结论 | 对计划的影响 |
| --- | --- |
| 产品路径已经是 Agent-only，代码中 `chatMode/direct` 仅剩兼容字段。 | 后续 UI、文案、测试不再规划“普通对话模式”；“普通对话”只表示没有项目 cwd 的 Agent 会话。 |
| 项目会话当前按 app-managed userData 存储，`.scr-data` 路径被显式禁用。 | 后续数据安全、删除、备份、恢复都按 app userData 方案设计；不再新增项目目录 `.scr-data` 迁移任务。 |
| runtime broker 已能把底层 runtime events 流式推到 renderer，且 `useChat` 已 runtime-first 发送；产品语义事件与 replay 仍不完整。 | Phase 0 后续重点是补 projection/replay/persistence 闭环，而不是恢复 direct/chat 或并行维护第二套 event reducer。 |
| 输入框审批替换区已经实现。 | Phase 0 应补状态契约、键盘操作、Plan decision、错误恢复，而不是改回 modal。 |
| 消息虚拟列表和代码块轻量渲染已经实现；500-turn 虚拟列表测试已覆盖只挂载可见 rows。 | Phase 3 应继续 typed parts / lazy content / artifact ref，不允许回退到整段 Markdown + 全量内容常驻。 |
| `useChat.ts` 已拆出 model/prompt/approval/event/run controller helper；模型 one-shot override、会话默认和 source/sourceLabel 展示已接入；run controller 已补 stop snapshot、approval pause/resume 和 already-idle terminal 去重证据，但 `useChat` 仍聚合发送编排、Plan decision 接线和 message metadata patch。 | Phase 0/1 后续应继续收缩 `useChat` orchestration，重点确认真实 runtime stop/error smoke、Plan/Execute 持久化语义和子 Agent model selection。 |
| 右侧面板目前是环境摘要，不是完整 context/memory/subagent inspector。 | Phase 2/3/4 应分阶段补模块，不应把所有细节塞进 transcript。 |
| `AgentTeamSelector` 只是选择入口。 | Phase 4 需要真正的 subagent task/event/state，而不是只扩展下拉框。 |

## 4. 需求

### R1. Agent Loop 状态机

应用必须有单一 Agent run 生命周期，覆盖本地、项目、远端、Skill、MCP、Subagent 路径。

状态：

- `idle`
- `composing`
- `planning`
- `awaiting_plan_decision`
- `executing`
- `awaiting_approval`
- `awaiting_answer`
- `streaming_output`
- `compacting_context`
- `completed`
- `stopped`
- `error`

验收：

- 发送一次用户消息会创建一个 `run.started` 和一个 user turn。
- 文本输出通过 typed delta event 更新。
- Tool call、approval、ask、plan、context compact、subagent 都有事件表达。
- Stop 能中断 runtime，并持久化 stopped 状态。
- Renderer 可以从事件历史恢复 UI。

### R2. 统一事件契约

需要定义共享事件类型：

- run lifecycle。
- message/structured output。
- tool call/result/error。
- approval request/resolution。
- AskUserQuestion。
- plan card/update/execute turn。
- context snapshot/compaction。
- memory read/write proposal。
- subagent lifecycle。
- artifact lifecycle。
- remote delivery。

验收：

- shared types 增加事件类型。
- 现有 Agent SDK/LLM/tool events 先归一化，再进入 renderer state。
- 未识别事件安全展示 debug summary，不显示 raw exception。

### R3. Plan/Execute

Plan：

- 可读文件、搜索、分析。
- 禁止写入、删除、危险命令。
- 输出结构化 plan card。

Plan card：

- steps。
- risks。
- expected changed files。
- required approvals。
- suggested subagents。
- edit steps。
- execute。
- cancel。
- regenerate。

Execute：

- 从 Plan 创建新的 execute turn。
- 使用当前 approval/sandbox policy。

验收：

- Plan mode 不能写文件/删文件。
- Execute 不直接修改原 plan turn，而是创建新 turn。
- 编辑后的步骤会进入 execute context。
- Regenerate 会产生新的 plan version。

### R4. 输入区阻塞交互

输入区状态：

- normal input。
- tool approval。
- AskUserQuestion。
- plan decision。
- paused/error recovery。

验收：

- 阻塞时隐藏普通输入区。
- AskUserQuestion 支持输入和校验。
- 普通 tool approval 不允许任意自由输入。
- 审批支持允许一次、本会话允许、本项目允许、拒绝、拒绝并给原因、修改参数后允许。
- 键盘可操作。

### R5. Approval / Sandbox / Grants

按 Codex 风格拆分：

- Approval policy：什么时候问。
- Sandbox policy：实际允许什么。
- Grants：once/session/project 授权。

验收：

- sandbox deny 不能被 approval 绕过。
- grant scope 在 UI 中可见。
- grant key 包含工具类别、目标、项目/会话、风险等级。
- subagent 发起的审批必须显示来源。

### R6. 模型选择

解析顺序：

1. 输入框 model pill 的本次临时选择。
2. 会话 override。
3. 项目默认。
4. 全局默认。
5. runtime fallback。
6. subagent runtime selection。

验收：

- UI 展示生效模型来源。
- model pill 打开可搜索模型选择器。
- 模型选择器展示 provider、model、上下文长度、能力标签。
- model pill 默认只写 `messageOverride.model`，本次 send 后清除。
- model picker 提供“设为本会话默认”，写入 `session.modelOverride`，发送后不自动恢复。
- 会话覆盖有清除入口，清除后回到项目/全局默认。
- 项目设置可配置默认模型。
- 会话可覆盖项目/全局默认。

### R7. 模型配置

两层设置：

1. Provider 管理。
2. Model 能力管理。

Provider：

- preset 和 custom provider。
- API key。
- baseURL。
- API format。
- custom headers。
- fetch models。
- test connection。
- health/last error。

Model 能力：

- context length。
- reasoning support/effort。
- tool/function support。
- vision support。
- structured output support。
- streaming support。
- capability tags。
- preset + provider inference + user override 合并。

验收：

- 用户能配置至少一个 preset provider 和一个 custom provider。
- 用户能拉取或手动添加模型。
- 用户能覆盖模型能力。
- model picker 使用能力元数据。
- 第一阶段不要求成本统计。

### R8. 设置页重组

一级分组：

1. General（通用）
2. Models（模型）
3. Agent
4. Tools & Permissions（工具与权限）
5. Projects（项目）
6. Project Recovery（项目恢复）
7. Keyboard（键盘）
8. API Service（API 服务）
9. Webhook
10. Advanced（高级；内部使用 Tabs 拆分：实验性功能 / 快速操作 / 系统信息 / 性能监控）
11. About（关于）

说明：

- MCP / Skills / App Plugins 拥有独立的市场/管理入口（`/mcp`、`/skills`、`/plugins`），从顶部导航进入，不再出现在 Settings 内部导航中。
- Context & Memory 相关控件在 Phase 3 memory 工作落地时归入 Agent 分组或右侧 inspector，不再作为独立 Settings section。
- `API Service` / `Webhook` / `About` 曾经是 Advanced 组的内嵌子块，本次重构提升为一级 nav，避免用户在 Advanced 里滚动查找；`Advanced` 内部现在只承载调试/开发/实验类内容，通过顶部 Tabs 组织，不再嵌套第二层 Tabs。
- `AboutSection` 概览页的功能网格里也不再展示 MCP / 技能 / 应用插件 marketing 卡片；保留 5 项：Agent 工作台 / 联网搜索 / 主题定制 / 悬浮窗 / 本地 API。
- Settings **不是**页面内导航（旧模式），而是 **App MainLayout 内的嵌套路由**：
  - Rail 与工作区 sidebar 同层级，顶天立地取代 workspace sidebar；TitleBar 只在右列，不横跨全宽。
  - 每个一级 nav 项对应独立子路由 `/settings/<key>`（`general/models/agent/tools-permissions/projects/project-recovery/keyboard/api-service/webhook/advanced/about`）；`/settings` 无子路径时 index route 重定向到 `/settings/general`。
  - `?tab=<key>` legacy URL 与 IPC `navigate-to tab=about|debug` 事件在挂载时 replace 到新路径。
  - 进入 Settings 从窗口底部滑入（`y:100% → 0`, 0.28s），退出滑回底部；Rail 内切 tab 只换 Outlet，不触发整页 unmount。
  - "返回工作区" 语义 = 回到 `/chat` 工作区，不走 `history.back()`（Settings 内部跳转会污染 history）。
  - TitleBar 在 `/settings/*` 下左侧簇为空，不展示面包屑或页标题；页内也没有二级 tab 或 SettingsHeader；整个 Rail 本身就是"你在设置里"的唯一 affordance。
  - Rail 底部用户信息卡片与工作区 ClaudeSidebar 底部**共用同一个组件 `SidebarUserRow`**（含上方分割线内置于组件），保持两处外观、行为完全一致。
- **字号基准**：Settings shell 全部 chrome（Rail 项、SettingSection h3、ApiServiceSettings/WebhookSettings 页头 h3）对齐工作区 `text-xs` (12px)，与 antd `compactAlgorithm` + `ClaudeSidebar` 的 `text-xs` 保持一致；不再叠 `text-lg`/`text-base` 视觉重量。
- **Rail 选中样式**：仅浅蓝底（`colorPrimaryBg`）+ 蓝字（`colorPrimary`），不叠 `borderLeft` 竖条也不叠 focus ring。
- Rail 曾有的"引导 (Onboarding)"占位卡片已删除。

验收：

- 设置页壳位于 App MainLayout 内的嵌套路由 `/settings/*`；进入 `/settings/*` 时 App 层 sidebar **被 `SettingsRail` 取代**（Rail 与 workspace sidebar 同层级、顶天立地；TitleBar 只在右列内，不横跨全宽）。
- 一级共 11 项，按上述顺序在 Rail 上呈现。
- 每个 nav 项对应一个独立子路由（`/settings/general` 等），支持直链和 deep-link；`?tab=<key>` legacy URL 与 IPC `navigate-to tab=about|debug` 在挂载时 replace navigate 到新路径；非法 legacy key 兜底到 `/settings/general`。
- 进入 Settings 从窗口底部滑入（`y:100% → 0`, 0.28s），退出滑回底部；Rail 内切 tab **只换 Outlet，不触发整页 unmount / 不重播 slide 动效**（`AnimatePresence` key 对 `/settings/*` 合并为 `"settings-shell"`）。
- Rail 顶部有 `← 返回工作区` 按钮：**永远 `navigate("/chat")`**，不走 `history.back()`（避免 Settings 内部跳转污染 history 后回退到上一个 tab）。
- Rail 底部为**共享组件 `SidebarUserRow`**（含内置上方分割线），与 workspace ClaudeSidebar 底部**必须是同一个组件**，行为、外观完全一致。
- TitleBar 在 `/settings/*` 下**左侧簇为空**，不展示面包屑或页标题；不需要 SettingsHeader；内容区顶部不再堆二级 tab。
- 内容区 `max-w-4xl mx-auto`，宽屏卡片不无限拉伸；`px-6 py-4` 紧凑排布。
- Settings shell 全部 chrome 字号对齐工作区 `text-xs` (12px) 基准：Rail 项、SettingSection h3、ApiServiceSettings h3、WebhookSettings h3、Rail 头像 (`w-8 h-8 text-[12px]`)、名字 (`text-[13px]`) 等；不再使用 `text-lg` / `text-base` 加重视觉。
- Rail 选中样式：仅 `colorPrimaryBg` + `colorPrimary`，无 `borderLeft` 竖条，无 focus ring。
- Rail 顶部有 macOS `TrafficLightSpacer`（30px），与 `ClaudeSidebar` 一致，保证交通灯不与"返回工作区"按钮重叠。
- 现有设置项映射到上述分组，作为 `pages/settings/<Page>.tsx` 薄 wrapper（11 个）。
- MCP、Skills、App Plugins 保持独立市场/管理页，但不再挂在 Settings 导航里；`AboutSection` 的功能网格里也不再出现它们的宣传卡片。
- API Service / Webhook / About 独立成一级 nav，不再作为 Advanced 的子块。
- Advanced 内部使用同级 Tabs（实验性功能 / 快速操作 / 系统信息 / 性能监控），不使用嵌套 Tabs。
- Rail 无"引导 (Onboarding)"占位卡片。
- 不出现 Extensions 聚合入口。

### R9. 右侧环境面板

模块：

- changes。
- git/worktree。
- runtime。
- context。
- tool timeline。
- subagents。
- remote。
- artifacts。

验收：

- 面板可折叠/关闭。
- 项目会话显示 cwd、branch/worktree、runtime policy、context summary。
- tool timeline 显示状态和错误。
- subagent timeline 可展开子线程。
- remote-bound session 显示绑定和投递状态。

### R10. Context 与 Memory

Memory scope：

- 用户偏好。
- 项目规则：只读 `AGENTS.md` / `CLAUDE.md`。
- 会话摘要/长期记忆。
- Agent/Subagent memory。

Context：

- token budget。
- 注入的文件/附件/memory 列表。
- pin/unpin。
- token 超阈值自动 compact。
- 用户手动 compact。
- 每 N 轮 compact。
- 长工具输出摘要。

验收：

- 用户能查看当前注入了什么上下文。
- 用户能 pin/unpin context。
- compact 产生可见 `context.compacted` 事件。
- 项目规则 UI 只读。
- memory 写入默认需要 proposal/confirmation。

### R11. 结构化输出

类型：

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

验收：

- 代码块有语言标签、copy、wrap、可读高对比样式。
- diff 按 file/hunk 展示。
- command output 默认摘要，可展开。
- tool result 按类别展示。
- error card 显示结构化错误上下文。

### R12. Artifacts

Artifacts 包括：

- 生成文件。
- 代码片段。
- 报告。
- Markdown 文档。
- Plan。

验收：

- artifact 创建/更新显示在 transcript。
- 当前会话 artifacts 显示在右侧面板。
- 独立 artifact library 可浏览。
- artifact 元数据能关联 session/turn/project。

### R13. 多 Agent

委派触发：

- 主 Agent 自动判断。
- 用户选择 team/profile。
- Plan card 建议并由用户确认。

规则：

- 默认共享项目 cwd。
- 独立上下文。
- 独立 memory。
- 可独立权限。
- 只读 subagent 默认只读。
- 高风险工具重新审批。

验收：

- 主 Agent 能创建至少一个 subagent task。
- 右侧面板显示 subagent 状态。
- 可展开完整子线程。
- subagent 结果以摘要进入主 transcript。
- 审批卡显示来源 subagent。

### R14. Remote IM

Remote session 使用同一 Agent event model。

验收：

- remote inbound message 创建正常 Agent run events。
- remote delivery status 可见。
- approval/AskUserQuestion 不会静默挂死。
- remote-bound delete/archive/unbind 生命周期明确。

## 5. 实施阶段

### Phase 0a：事件契约与 Projection

目标：先把现有底层事件和目标产品事件的边界固定，避免重复事件源。

工作：

- 定义 shared product event types。
- 增加 `AgentRuntimeStreamEvent` → product event projection。
- 定义 JSONL `SessionEvent`、runtime event、renderer derived state 的职责边界。
- 明确哪些事件落盘、哪些是 transient。
- 为未知事件提供 debug summary fallback。

验收：

- 同一 runtime event 只生成一条稳定 product event。
- replay 以 JSONL 为 source of truth，renderer state 可以从事件恢复。
- token delta、streaming buffer、未完成 reasoning 不直接落盘。
- tool call/result/error、approval、run terminal event 可回放。

### Phase 0b：Agent Run 状态机与 Hook 拆分

目标：降低 `useChat` 复杂度，让流式、审批、模型解析、上下文构造各自有边界。

工作：

- 从 renderer-heavy flow 中抽出 run 状态机边界。
- 拆分 `useChat`：`useAgentRunController`、`useAgentEventReducer`、`useToolApprovalFlow`、`useMessageModelResolution`、`usePromptContextBuilder`。
- 保留现有 stream rAF flush、watchdog、pending approval pause 机制，并补事件化状态。
- 定义 composer blocked states。

验收：

- 现有聊天仍能流式输出。
- 流式更新不触发历史消息全量重渲染。
- Tool approval 和 AskUserQuestion 继续使用输入区替换 UI。
- `useChat` 拆分后，每个子 hook 有单一职责和 focused test。
- Stop / error / watchdog 都能进入明确终态，不遗留 executing/awaiting 状态。

### Phase 0c：Plan/Execute 与阻塞决策

目标：把 Plan/Execute 做成可回放的 Agent turn，而不是临时 UI 状态。

工作：

- 添加 plan card model 和 execute-turn link。
- 把现有 `PlanMode` 映射到 Plan / Execute 产品语义。
- enforce Plan mode 限制。
- Plan decision 接入输入区阻塞交互。
- 执行 Plan 时创建新的 execute turn。

验收：

- Plan mode 生成 plan card，不能写/删。
- 从 plan 执行会创建新的 execute turn。
- 编辑后的步骤进入 execute context。
- Regenerate 产生新的 plan version。
- Plan / Execute 的 UI 不展示旧 `chat` / direct 模式概念。

### Phase 0a-c 当前接入状态

截至 2026-07-04 代码复核，Phase 0a-c 已完成 shared contract、runtime projection/materializer、main process JSONL 写入、approval/ask closed-loop、model/prompt/approval/event/run-controller helper、SDK/runtime event reducer、runtime-first 发送入口、Plan/Execute prompt helper、PlanCard 基础组件、聊天流展示、composer blocked decision 基础接线和消息虚拟列表。它们后续不再作为“从零实现”任务，改为验收、回归和边界补齐。剩余接入点如下：

| 接入点 | 当前状态 | 下一步 |
| --- | --- | --- |
| Phase 0a production projection | 已接入 `AgentRuntimeIpcBroker.persistRuntimeEvent()`：调用 `projectAgentRuntimeEvent()`，只把可持久化 product events 经 `materializeAgentProductEvent()` 写入 `SessionStorageService.appendEvent()`；`text.delta` / `reasoning.delta` / `run.usage` 等 transient event 不落盘。`ask.requested` / `ask.answered` / `plan.decision` / `execute.turn.created` / subagent events 已补进 product/materializer 路径。 | 只补验收缺口：unknown/debug summary 防御、native code/diff/data 专用事件和 delta batching。Native structured events 本阶段不阻塞。 |
| Approval / Ask closed-loop | 已接入：`resolvePermission()` 会生成 `permission.resolved` trace/product/session audit，并按 `requestId + approvalId` 去重 runtime 后续 resolution；broker 会从前置 `permission.request` 补 `toolName`，用于区分普通 approval 与 `AskUserQuestion` answer。 | 补 UI replay/历史 transcript 对 approval resolved / ask answered 的明确展示；防御孤立 `permission.resolved` 且无 request context 的 runtime。 |
| Renderer replay / run controller | 已接入 reducer helper：`useAgentEventReducer` 覆盖 Agent SDK 与 AgentRuntime 的 text/tool/permission/result/error/status/rate_limit 映射；`agentRuntimeStreamAdapter` 只是薄包装；`useAgentRunController` 已承接 request id、request type、native session id、approval pause、watchdog 和 interrupt snapshot。`eventsToMessages()` 已能 replay approval requested/resolved、ask requested/answered、tool terminal states、run terminal status、plan parts 和 subagent parts；Plan decision / execute turn marker 已可持久化；`ChatMessageList` 已有 `VirtualBubbleList` + dynamic row height + pending interaction scroll。 | 不再重复拆 `useChat`；后续补 stop / error recovery 证据、marker-only 历史 timeline UX、虚拟列表体验回归。 |
| 发送链路迁移 | 已按最终 Agent runtime 口径收口：`useChat` 发送入口调用 `agentRuntimeClient.createQuery()`；create failure 会 materialize structured error、恢复 idle、清理 current request/watchdog，不再默认 fallback 到 Agent SDK；stop 会按 request type 调 `agentRuntimeClient.interrupt()` 或兼容 SDK interrupt。 | 继续补 runtime create failure 的更完整 UI recovery / replay 证据；不恢复 direct/chat，不新增 SDK fallback projection 桥接。 |
| Plan/Execute UI | 已完成：Plan/Execute shared contract、execute turn prompt helper、PlanCard 基础组件、聊天流展示、composer blocked decision、execute/regenerate Agent turn、`plan.decision` / `execute.turn.created` JSONL marker，以及历史已决 plan 的只读 replay summary。 | 继续补 stop/error recovery、regenerate version 约束和真实 runtime smoke；不要让历史已决 PlanCard 再暴露可执行按钮。 |

### 当前后续工作安排（代码复核后）

Phase 0a-c 之后的下一批按数据正确性优先，不再继续扩展旧 Extensions 聚合页，也不把项目会话迁入项目 cwd `.scr-data`。

| 优先级 | 工作项 | 验收标准 |
| --- | --- | --- |
| P0 | Project delete renderer regression | Main 端 `projects.remove(projectId, { keepFiles:false })` 删除 app userData project sessions 已有 focused tests；下一步验收删除当前/运行中会话后 renderer 状态回 idle、current session fallback、message/file artifact 清理；`keepFiles:true` 保留可恢复数据。 |
| P0 done | `.scr-data` policy cleanup follow-up | 正式代码路径和测试不再期望项目 cwd `.scr-data`；`canUseProjectScrData()` / `migrateLegacyProjectBucket()` 已删除；历史 cleanup helper 已命名为 `getLegacyProjectScrSessionsDir()`，测试 helper 已命名为 `legacyProjectScrSessionPath`。仅保留历史 `.scr-data/sessions` 删除 cleanup，不作为正式 storage target。 |
| P1 | Project archive / diagnostic export UI | 不重写底层 export service；补 Settings 入口、成功/失败反馈、i18n、focused tests。`ProjectArchiveManager` 的恢复列表职责与 archive export 职责要拆清楚。 |
| P1 | Recovery / legacy import privacy | 列表默认不展示完整路径；完整路径只通过 explicit copy/detail；legacy import report redacts old data dir。 |
| P2 | Context/Memory deepening | `ProjectRulesReader` 读到的 AGENTS.md/CLAUDE.md 接入 Agent prompt；Context Inspector 显示注入源并支持 pin/unpin；补 compact/summarize 触发策略。 |
| P2 | Multi-agent follow-up | `Message.toolCall.subagentRunId` renderer threading、recursive toolCallCount、nested Task 顶层化有 focused tests。 |

### Phase 1：模型选择与模型配置

目标：让模型选择明确、可解释、可配置。

工作：

- 重做 model pill picker。
- 展示 effective model source。
- 明确输入框 model pill 的两类语义：一次性 `messageOverride.model` 发送后自动清除；会话级 `session.modelOverride` 持续生效且必须展示清除路径。当前批次已完成 one-shot、会话默认、`source` / `sourceLabel` 和发送后清理。
- 拆分 provider config 和 model capability config。
- 支持 custom provider 的目标 UI。
- 支持 preset + provider inference + user override 的元数据合并。
- 为 subagent runtime model selection 预留字段。

验收：

- 用户能在设置中配置 provider 和 model。
- 用户能看到上下文长度和能力标签。
- 用户能从 model pill 选择模型。
- 项目默认和会话 override 可见且可解释。
- 不要求成本展示。

### Phase 2：UX Shell 与设置页重组

目标：对齐 Codex/Claude 混合 Agent workbench。

工作：

- 保持当前 shell，但优化 title/context bar、transcript、composer、inspector。
- 重做设置页左侧导航。
- 把现有设置项迁移到新分组。
- 优化 inspector 折叠/关闭体验。
- 确保 MCP/Skills/App Plugins 独立入口（顶部导航直达 `/mcp`、`/skills`、`/plugins`），不再在 Settings 内部重复列出。
- 移除/隐藏所有残留 Extensions 聚合入口、路由和文案；保留 MCP、Skills、App Plugins 各自市场/管理页面。
- 不改动已经落地的输入区审批替换模式，只补 Plan decision / paused recovery 状态。

当前状态：

- Settings 分组和 URL tab sync 已完成，MCP / Skills / App Plugins / Context & Memory 已从 Settings 内部导航移除。
- API Service / Webhook / About 已从 Advanced 组提升为独立一级 nav；Advanced 内部改为 4 个同级 Tabs：实验性功能 / 快速操作 / 系统信息 / 性能监控。
- Settings 壳已升级为 App MainLayout 内的嵌套路由，`SettingsRail` 顶天立地取代 workspace sidebar；TitleBar 在 `/settings/*` 下不展示面包屑；进入设置从下向上滑入；Rail 内切 tab 不整页 unmount；"返回工作区" 永远 `navigate("/chat")`。
- 全部 Settings chrome 字号对齐工作区 `text-xs` (12px)；Rail 选中样式回归极简 `bg + color`；Rail 底部用户信息卡片与 ClaudeSidebar 共用 `SidebarUserRow` 组件。
- Rail 上"引导 (Onboarding)"占位卡片已删除。
- `AboutSection` 概览功能网格删除 MCP / Skills / App Plugin marketing 卡片，只保留 Agent 工作台 / 联网搜索 / 主题定制 / 悬浮窗 / 本地 API 五项。
- 当前用户路由无 `/extensions` 聚合入口。
- MCP、Skills、Plugins 已保持独立入口。
- Shell/menu 文案已按 Agent-only 口径收口。

验收：

- 设置分组符合本文（General / Models / Agent / Tools & Permissions / Projects / Project Recovery / Keyboard / API Service / Webhook / Advanced / About，共 11 项）。
- Advanced 内部使用同级 Tabs，不嵌套 Debug 子 Tab 层。
- Settings 壳交互 v2 全部生效（Rail 与 sidebar 同层、动效、切 tab 不重刷、返回工作区、TitleBar 空、字号 12px、Rail 选中极简、`SidebarUserRow` 共用、无引导卡）。
- 没有 Extensions 聚合入口。
- inspector 可打开/关闭并记住状态。
- 模型/项目/分支/runtime context 不需要到处找。
- transcript 和 composer 在窄屏/宽屏都可读。
- 关键路径点击层级清晰：新建会话、选模型、审批、查看 context 不需要跨多个无关页面。

### Phase 3：Context、Memory、结构化输出、Artifacts

目标：让上下文和输出可理解、可控制。

工作：

- Context inspector：token budget 和注入源。
- pin/unpin context。
- 自动/手动/N-turn/长输出 compact。
- 只读读取 `AGENTS.md` / `CLAUDE.md`。
- 结构化渲染 code、diff、file tree、command、tool result、table/data、sources、artifacts。
- 在现有 `StructuredCodeCard` 上继续优化代码块视觉，不引入重型编辑器常驻 message list。
- 大 stdout、tool result、artifact 内容使用 contentRef / 分页 / 懒加载，renderer state 只保留摘要和引用。
- artifact model、transcript event、inspector list、artifact library。

当前状态：

- 大 tool result 折叠态已使用 capped preview。
- `StreamPartRenderer` 已补 typed `tool` part summary。
- `BaseMessagePart` 已有 `contentRef` / `byteLength` / `truncated`；renderer 对带引用的 part 显示轻量摘要，不挂载正文/结果/preview。
- 500 user/assistant turns + 多代码块虚拟列表测试已覆盖只挂载可见 rows。

验收：

- 用户能查看进入上下文的内容。
- compact 可见且可回放。
- 长命令输出不会卡 UI。
- code/diff/tool output 使用 typed renderer。
- artifacts 可在 transcript 外浏览。
- 大体积工具输出和 artifact 内容不常驻 renderer 内存。
- 500 turns + 多代码块滚动不出现明显掉帧，输入区打字不触发 transcript 大范围更新。

### Phase 4：多 Agent 委派

目标：支持一个主 Agent 委派子 Agent。

工作：

- 定义 subagent task model。
- 连接 agent profiles/teams。
- 增加 subagent runtime events。
- 右侧面板 subagent timeline。
- 子线程展开。
- subagent 权限归属。
- 主 transcript 摘要。

验收：

- 主 Agent 能委派至少一个子任务。
- inspector 显示 subagent timeline。
- 可打开完整子线程。
- subagent tool approval 显示来源。
- subagent 结果摘要回到主 transcript。

### Phase 5：Remote IM 完整化与可靠性

目标：让远端会话成为一等 Agent run。

工作：

- 归一化 remote inbound/outbound events。
- inspector 展示 remote binding/delivery。
- 定义 remote-bound approval/ask 路由。
- 定义 delete/archive/unbind 生命周期。
- 增加错误恢复和 replay 规则。

验收：

- remote inbound prompt 走同一 run/event model。
- remote 投递失败是结构化事件。
- remote-bound approval 不会挂死。
- 删除 remote-bound session 有明确 unbind 行为。

## 6. 跨阶段验证

每个阶段应包含：

- Type check。
- Focused unit tests。
- 必要的 renderer interaction tests。
- Agent run event replay tests。
- 新增用户文案的 i18n check。
- Dev-mode manual smoke。
- 长会话性能 smoke：不少于 500 turns 的 transcript 不明显卡顿。
- 大输出内存 smoke：长 command output / artifact preview 使用摘要、引用或懒加载，不把全量内容常驻 renderer state。

本阶段不把打包/build 作为常规验证要求。

## 7. 非目标

- 不恢复 direct/chat 模式。
- 不做统一 Extensions 页面。
- 不把 MCP/Skills/App Plugins 合并成一个入口。
- 第一阶段不做精确价格/成本统计。
- 不通过 UI 编辑 `AGENTS.md` / `CLAUDE.md`。
- 第一阶段不要求每个 subagent 独立 worktree。
- 不静默写 memory。
- 不允许 approval 绕过 sandbox。
- 不要求打包。

## 8. 主要风险

| 风险 | 缓解 |
| --- | --- |
| `useChat` 过大，职责耦合。 | 先建立事件/状态机边界，再做 UI。 |
| 模型层级过多导致用户不理解。 | 永远展示 effective model source 和 reset path。 |
| grant 设计不当导致权限过大。 | approval、sandbox、grants 明确分离。 |
| compact 隐藏重要上下文。 | compact 必须生成可见事件，可检查。 |
| 多 Agent 输出污染主 transcript。 | 主 transcript 只展示摘要，右侧面板承载细节。 |
| Remote approval 卡住。 | 默认回到桌面审批区，不做静默等待。 |
| 长会话和长输出导致卡顿/内存上涨。 | 使用虚拟列表、typed parts、摘要、懒加载和引用式 artifact 存储。 |
