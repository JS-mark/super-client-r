# Agent 客户端需求规划与实施计划

> 日期：2026-06-27
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
| Agent-only 发送路径 | `useChat.ts` 已固定 Agent 模式。 | 发送、状态机、流式、模型解析、审批、Skill 注入、错误处理耦合在一个大 hook 中。 |
| 输入区审批替换 | `ChatInputArea.tsx`、`ApprovalDecisionCard.tsx`、`AskUserQuestionCard.tsx` 已存在。 | 需要正式定义输入区/审批区/Ask/Plan 决策区的状态契约。 |
| Tool call 展示 | `ToolCallCard`、`ApprovalDecisionCard` 已有基础。 | 需要统一事件分类和按工具类型展示策略。 |
| Plan mode | `PlanMode` 类型和 `planModeGate.ts` 已存在。 | 需要完整 Plan card、可编辑步骤、execute turn、Plan 限制 enforcement。 |
| 模型选择 | `SessionRuntimeResolver` 和 `useChat` 已有全局/项目/会话解析。 | 需要 UI 展示生效来源、model pill 行为、模型能力元数据、子 Agent 运行时模型选择。 |
| 模型管理 | `ModelManageModal`、`ModelConfigPanel` 已存在。 | 需要重做 Provider / Model 两层设置。 |
| 设置页 | `Settings.tsx` 已有独立路由。 | 需要重组信息架构，降低混乱度。 |
| 右侧环境面板 | `CodexEnvironmentInspector.tsx` 和 `inspectorPanelStore` 已存在。 | 需要补齐 changes、git/runtime、context、tool timeline、subagents、remote、artifacts。 |
| Context budget | `ContextUsagePill` 已有基础。 | 需要完整 context inspector、注入源列表、pin/unpin、compact event。 |
| Memory/rules | 仓库已有 `AGENTS.md`。 | 需要定义 memory 作用域和只读项目规则注入。 |
| 结构化输出 | 已有部分 structured parts。 | 需要覆盖 code/diff/tree/command/tool/artifact/source/error。 |
| 多 Agent | 已有 Agent profiles/teams 和 `AgentTeamSelector`。 | 需要主 Agent 委派语义、subagent timeline、子线程展开、权限归属。 |
| Remote IM | 已有 remote 服务。 | 需要纳入同一 Agent event model，处理 approval/ask、投递错误、unbind 生命周期。 |

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

1. 输入框 model pill。
2. 会话 override。
3. 项目默认。
4. 全局默认。
5. runtime fallback。
6. subagent runtime selection。

验收：

- UI 展示生效模型来源。
- model pill 打开可搜索模型选择器。
- 模型选择器展示 provider、model、上下文长度、能力标签。
- model pill 选择发送后不自动恢复。
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

验收：

- 设置页是一个独立路由，左侧稳定导航。
- 现有设置项映射到上述分组。
- MCP、Skills、App Plugins 保持独立。
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

### Phase 0：事件契约与 Agent Loop 核心

目标：让 Agent 执行可观察、可持久化、可回放。

工作：

- 定义 shared event types。
- 归一化当前 LLM/Agent SDK/tool events。
- 从 renderer-heavy flow 中抽出 run 状态机边界。
- 添加 plan card model 和 execute-turn link。
- enforce Plan mode 限制。
- 定义 composer blocked states。

验收：

- 一次 run 可从事件历史回放。
- Plan mode 生成 plan card，不能写/删。
- 从 plan 执行会创建新的 execute turn。
- Tool approval 和 AskUserQuestion 使用输入区替换 UI。
- 现有聊天仍能流式输出。
- 流式更新不触发历史消息全量重渲染。

### Phase 1：模型选择与模型配置

目标：让模型选择明确、可解释、可配置。

工作：

- 重做 model pill picker。
- 展示 effective model source。
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
- 确保 MCP/Skills/App Plugins 独立入口。

验收：

- 设置分组符合本文。
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
- artifact model、transcript event、inspector list、artifact library。

验收：

- 用户能查看进入上下文的内容。
- compact 可见且可回放。
- 长命令输出不会卡 UI。
- code/diff/tool output 使用 typed renderer。
- artifacts 可在 transcript 外浏览。
- 大体积工具输出和 artifact 内容不常驻 renderer 内存。

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
