# Refactor Progress

> 入口：[refactor-plan](./refactor-plan.md) ·
> 覆盖矩阵：[refactor-traceability-matrix](./refactor-traceability-matrix.md) ·
> 执行门禁：[refactor-execution-gates](./refactor-execution-gates.md)
>
> 本文只记录当前实现进度和证据，不替代功能 plan。状态更新日期：2026-07-18（收口 loop R1–R4 完成）。

## Current Status

**收口完成（2026-07-18）。** 收口 loop R1–R4 已走完：全量门禁 5 条全绿（`git diff --check`、`pnpm check`、`pnpm lint`、`pnpm i18n:check`、`pnpm test:run`），`pnpm test:run` = 129 files / 1079 tests / 0 failed（含此前被沙箱 `listen EPERM` 阻塞、现已通过的 2 个 server e2e），工作树 clean，改动按 9 个功能域分组提交。详情见本文末尾 `## Gate Health Snapshot 2026-07-18`。当前代码已经进入分批实现和验证阶段，但整体重构还不能标记为完成。P0 主线已经覆盖 Agent-only、JSONL structured parts、核心 runtime gate、项目/会话基础存储和对话展示骨架；Phase 0a 已完成 runtime projection 写入主流程 + `unknown` 兜底 + broker 对 `text.delta`/`reasoning.delta`/`status`/`usage` 的 fast-skip + reducer 端 `plan.decision`/`execute.turn.created`/`run.rate_limit` 分支 + `run.usage` 改 transient；Phase 0b `useChat.ts` 已通过三轮抽取从 **1826 行降到 545 行（-1281 行 / -70%）**，新增 helper hooks 并有 focused tests，当前审批响应已通过 `useToolApprovalFlow` 接线；发送入口 runtime-first 且 runtime create failure 不再默认 fallback 到 Agent SDK。Phase 0c 已落地可测试 Plan card、聊天流展示、composer blocked decision + `paused-error` recovery、ApprovalDecisionCard/AskUserQuestionCard 键盘支持，以及 `planModeToolGuard` 的写/删/危险命令限制；当前 Runtime Inspector 和 composer info bar 的用户可见 planMode 已统一映射为 Plan/Execute，不再展示内部 `chat` 兼容值。Phase 1 已完成模型 one-shot 选择、会话默认、生效来源展示、发送后清理和能力元数据 chip。Phase 2 已完成 Settings IA 二次重构 + 交互 v2：11 项顶级 nav、Settings 嵌套路由、SettingsRail、TitleBar 空、底部 `SidebarUserRow` 共享、无 Extensions 聚合入口，MCP/Skills/Plugins 独立市场页保留。Phase 3 已完成大 tool result 折叠态 capped preview、typed tool part summary、500-turn 虚拟列表测试、storage `contentRef` producer、typed IPC read path 和 lightweight renderer service，另加 Plan/Execute replay summary、Context Inspector MVP、`ProjectRulesReader` 只读读取和 Agent prompt 注入、多轮 history 低风险切片、`contextCount` / `contextMode` 策略入口。Phase 4 Multi-Agent MVP 已落地 `SubagentMessagePart`、subagent 产品事件、JSONL reducer、Task tool bridge、SubagentPartCard、SubagentsInspectorSection 和 approval subagent badge prop。Phase 5 Remote IM 已用 `RemoteSessionLifecycle` 纯状态机形式化并接入 `RemoteChatBridge`；remote duplicate replay drop、remote bot-offline、privacy redaction foundation、AgentTrace redaction、session archive directory export 已有 focused tests。当前没有新的可落地代码任务；server e2e 端口监听阻塞已于 2026-07-18 解除，`pnpm test:run` 全量 129 files / 1079 tests / 0 failed。

2026-07-08 resumed completion audit continuation:

- **Subagent status**：按用户要求重新启动只读复核；Export/Recovery、Privacy display、Context/Memory 三个 explorer 已启动，测试/验证复核因 thread limit 由主 agent 承担。codebase-memory MCP 按 AGENTS 要求优先尝试 `list_projects`，但本轮仍返回 `Transport closed`，因此改用本地只读命令和 focused tests 取证。
- **新增重构原则**：模型调用方式按 provider/model 生态分层。OpenAI、Gemini、Claude/Anthropic 默认使用原生 Function Calling；开源模型和 OpenAI-compatible/local provider 默认通过 LangChain + MCP 协议适配工具调用；用户可在对话设置里的“调用方式”覆盖默认策略。已同步到 `refactor-plan.md`、`design-doc.md` 和 `requirements-plan.md`。
- **代码事实复核**：
  - `src/renderer/src/router.tsx` 没有 `/extensions` route；`src/renderer/src/lib/menuConfig.ts` 仍强制隐藏 compatibility `extensions`，并保持 `mcp` / `skills` / `plugins` enabled。
  - `SessionStorageService.create()` / `updateMeta()` 仍强制 `chatMode:"agent"`；renderer `useChat` / `useSendMessage` 导出的 `ChatMode` 仍为 `"agent"`。旧 `direct/chat` 命中仅为 compatibility type、locale/test 或历史文档残留。
  - `SessionStorageService.resolveSessionBucket()` 仍把项目会话写入 app userData `projects/<projectId>/sessions/`，`.scr-data` 只剩 app dev userData 名称、历史 cleanup helper 和测试断言，不是正式 project session storage target。
  - `exportSessionArchive()` / `exportProjectArchive()` 仍以 `includeChatContent === true` 才复制 JSONL；默认写空 JSONL 占位、清空 preview，不列 attachments/contentRefs。Settings 文案说明默认不含聊天记录、附件、tool payload 或真实项目目录。
  - 发现并修正一个过期代码注释：`ProjectRulesReader` 注释曾称“未接入 Agent system prompt”，但当前 `ClaudeCodeAgentRuntime` 已调用它注入 `AGENTS.md` / `CLAUDE.md` 并发出 renderer-safe `projectRulesSnapshot` DTO；已按代码事实更新注释。

2026-07-05 代码复核结论：Phase 0a/0b/0c、消息虚拟列表、Agent-only 主发送链路、独立 MCP/Skills/Plugins 入口已经不是“待从零实现”项，后续应转入验收、回归和边界补齐。本批复核后确认 `ProjectStorageService.remove(projectId, { keepFiles:false })` 删除的是 app userData 下 `projects/<projectId>/`，其中包含 `sessions/`、JSONL/meta、attachments、tool-outputs/content-refs；已补 focused tests 锁定默认删除和 `keepFiles:true` 保留语义。旧 `.scr-data` 写入/迁移 helper 已删除，项目 cwd 下 `.scr-data/sessions` 只作为历史清理对象，不再作为写入或迁移目标。renderer 删除当前/运行中项目后的状态机回归已补 focused tests：删除入口先 stop stream，再 remove project，成功后才清理本地项目会话；当前项目会话删除后 fallback 到最新非 archived 会话，message/file artifact/loading/streaming 状态归位。后续批次已补 Recovery wizard MVP、`Message.toolCall.subagentRunId` renderer threading、递归 subagent SSE tool count 更新、nested Task 顶层化、native code/json/diff structured producer、git worktree preflight 后端和 UI 展示、paged session message reads、MCP/Skills/Plugins 独立市场边界提示；依赖现已可用，focused tests、`pnpm check`、`pnpm lint`、`pnpm i18n:check` 已通过，`pnpm test:run` 仅剩 sandbox 禁止监听本地端口导致的 server e2e 验证阻塞。

2026-07-07 本批实现前代码事实冲突记录：`RecoverySettings` 已有 session export 入口，但默认成功反馈直接显示 raw `exportDir`；orphan / legacy import / archived project UI 默认直接显示完整 cwd 或 legacy data dir；`SessionStorageService.exportSessionArchive()` / `exportProjectArchive()` 当时默认仍复制 `.jsonl` 和 `.meta.json`。按“当前代码事实优先”处理：先补 project archive / diagnostic export 产品入口、拆清 archived restore 命名、收敛 Settings 默认路径展示为 redacted label；后续 archive 隐私语义批次已把默认改为 `includeChatContent:false`。

2026-07-07 polish 代码事实：只读 subagent 复核确认 session/project/diagnostic export 入口、IPC/preload/shared types、i18n 和 focused tests 已落地；本批只做 Settings 反馈与隐私展示小补丁，不重写底层 storage/export。`RecoverySettings` 现在把 project/session/diagnostic export feedback 放回各自 section；session/project archive 成功反馈已由后续 archive 隐私语义批次改为说明默认只包含 app-managed session metadata，除非显式 `includeChatContent:true`，否则不包含 JSONL transcripts、真实项目目录、attachments 或 tool payloads；legacy import 目录默认仍显示 redacted label，并新增 explicit `Copy full path`；orphan restore 失败 UI 不再原样展示 main 返回的 raw cwd/error message。后续批次已补 Recovery wizard MVP；Context/Memory focused tests 仍待依赖恢复复验。

2026-07-07 Context/Memory low-risk slice 代码事实：四个只读 subagent 复核确认 Export/Recovery 产品入口已齐，当前续点应转入 Context/Memory；`refactor-plan.md` 原“下一批补 project archive UI / diagnostic export UI”与当前代码事实冲突，已改为 Export/Recovery 深水区 follow-up。新增 `contextManager` 纯函数模块，支持 token budget、`contextCount` sliding window、`contextMode` full/auto/compact 和 Message → `AgentHistoryMessage` 转换；`useAgentSendPipeline` 现在排除当前 user + assistant placeholder 后把历史传给 `agentRuntimeClient.createQuery()`；`ClaudeCodeAgentRuntime.buildChatRequest()` 已修复 `PromptPart[]` history 静默跳过问题，并在 main runtime 侧读取 cwd 下 `AGENTS.md` / `CLAUDE.md` 注入 system prompt；`ChatSettingsModal` 新增 context mode segmented control。后续批次已补 LLM 摘要调用、`context.compacted` 可回放事件、Context Inspector source breakdown、pin/unpin 和 artifact library MVP；仍待依赖恢复后复验。

2026-07-07 Context/Memory metadata replay 小批次：本批只做 metadata-level 可观察性，不声称完成独立 `context.compacted` product/session event。`Message.metadata` 新增 `contextSources` / `contextStrategy`；`useAgentSendPipeline` 在发送前把本轮 history strategy、附件/搜索/history/tool source 和 compact marker 写回当前 assistant placeholder metadata，因此 reload 后可通过 `assistant_message.metadata` 回放到 Inspector。`useContextInspectorData` 现在优先读取 latest assistant 的 context metadata，旧会话才 fallback 到 system/project/attachment 推断；`ContextInspectorSection` 显示 history strategy、history/search/tool source icons 和 compact events。边界说明：renderer 侧 `projectRules` 只能表示 main runtime 会执行 AGENTS.md / CLAUDE.md runtime check，不能证明具体规则文件存在或是否截断；真实 project-rules snapshot DTO、独立 `context.compacted` product event、LLM summary seam、pin/unpin 仍是后续。

2026-07-07 Context/Memory product event contract 小批次：新增 shared `context.compacted` product event factory，payload 包含 summary message id、summary、original count、compactedAt、context strategy、summarySource/model 等最小字段；main `productEventMaterializer` 可把该事件转成带 `metadata.contextCompacted/contextStrategy` 的 `assistant_message`，因此 JSONL reducer 无需新 schema 分支即可 replay。后续 continuation 已把 `useAgentSendPipeline` 接到 product-event persistence path，并补 main runtime project-rules snapshot DTO；这些后续接线仍待依赖恢复后复验。LLM summary seam 仍未完成。

2026-07-07 Context/Memory pin/unpin continuation：本批补齐 metadata-level pin/unpin 最小闭环。`MessageContextSource.pinned` 已由 Context Inspector 的 source 行按钮写回 latest context assistant message metadata；`useAgentSendPipeline` 会从 latest context metadata 提取 pinned sources，并在下一轮 `buildContextMetadataForRuntime()` 重新生成同 id source 时保留 `pinned:true`。为避免误导用户，过期 search/attachment 等未在本轮实际出现的 pinned source 不会被强行追加显示。focused tests 已补 `toggleContextSourcePinned`、latest context message id、Inspector pin click、pinned source 跨轮 metadata 保留；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

2026-07-07 Context/Memory artifact library continuation：本批补 session-scoped artifact library MVP，不新增 Extensions 聚合页，也不改 storage/export 底层。新增 `artifactLibrary` 纯函数，把当前 conversation 的 `ChatFileArtifact` / `ChatFileChangeSet` 聚合为去重 library items；默认展示 `relativePath` 或 redacted path，`fullPath` 只保留给 explicit reveal/copy 操作。`CodexEnvironmentInspector` 的 Changes section 改为 `Artifacts / 工件`，仍复用当前侧栏入口，列表显示 kind/source、diff 计数和显式定位/复制操作。focused tests 已补当前会话过滤、同 message/path/kind 去重、默认不泄露绝对路径、changeSet index；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

2026-07-07 Export/Recovery archive privacy semantics continuation：本批补底层 archive `includeChatContent` 隐私语义，不引入任意 output path，也不复制真实项目 cwd。`exportSessionArchive()` / `exportProjectArchive()` options 新增 `includeChatContent?: boolean`，默认 false；默认 archive 仍写 meta + 空 JSONL 占位，但 session meta 的 `preview` 清空，manifest 标 `includeChatContent:false`，且不列 attachments/contentRefs。显式 `includeChatContent:true` 时保留旧复制 JSONL 和 referenced payload manifest 行为。IPC/shared/preload/renderer service contract 已支持可选 privacy options，Settings 文案改为默认不含聊天记录。focused tests 已补 storage 默认 no-chat-content、显式 include true、IPC/preload/service options 透传；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

2026-07-07 Recovery wizard continuation：本批补 Settings Project Recovery 的最小 wizard/checklist，不改 storage/export 底层。新增 `recoveryWizard` 纯函数，从 archived/orphan/legacy/exportable counts 生成稳定步骤和推荐动作；新增 `RecoveryWizardPanel` 复用现有 refresh / legacy import / diagnostic export callbacks，不暴露 raw path，不新增任意导出路径。`RecoverySettings` 顶部现在显示 Recovery checklist、可恢复项计数、推荐步骤；legacy 推荐动作会走现有 `legacyData.importAll()`。focused tests 已补推荐顺序、无路径数据、wizard 渲染和 legacy action；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

2026-07-07 Multi-agent tool-call threading continuation：本批补齐 `Message.toolCall.subagentRunId` renderer threading 的最小闭环，不改 subagent storage/event 底层。`ToolCall` shared type 新增 `subagentRunId`；runtime stream reducer 和 legacy SDK reducer 会把顶层 `subagentRunId` 写入 live `tool_use` message，`tool.result` patch、`messageConverter`、chatMessageStore terminal persistence 和 JSONL fallback top-level tool message 均保留该字段。`useSubagentsInspectorData` 现在在已有 `SubagentMessagePart.run.toolCallCount` 基础上扫描 live `tool_use.toolCall.subagentRunId`，对同一 run 取 summary/live 的较大值，从而支持运行中实时 tool count。focused tests 已补 runtime adapter/reducer threading、Inspector live count、message converter 和 JSONL fallback；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

2026-07-08 Multi-agent recursive tool-count continuation：本批补 Task HTTP recursion 内部的 `run.toolCallCount` 递增，不改 subagent storage schema。`Task` handler 现在消费子代理 SSE 时识别 `tool_call` / `tool.call` 帧，每看到一次工具发起就调用 `SubagentEventBridge.update(subagentRunId, { status:"running", toolCallCount })`，完成时把最终 `toolCallCount` 写入 `subagent.completed`。`SubagentEventBridge.update()` 会自动把 spawn 时注册的 `parentAssistantMessageId` 补进 patch，确保 materializer 能生成 `assistant.part_update`；Task handler 也接受可选 `_parentAssistantMessageId` 供 host 注入时使用。focused tests 已补 bridge parent-message patch 和 Task SSE tool-count update；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

2026-07-08 Multi-agent nested Task continuation：本批补 nested Task 顶层化，不把内部字段塞进 provider `extraParams`。`ChatCompletionRequest` 新增 host-only `agentBuiltins` context；LLM route 原样接收但 provider 调用仍只看 `extraParams`。`buildToolExecutorFromRequest()` 从 `agentBuiltins` 注入 `_taskDepth`、`_parentConversationId`、`_parentAssistantMessageId`，并保留调用参数里显式 `_taskDepth` 的优先级。`Task` handler 发起子代理 HTTP recursion 时保留父 `conversationId`，并通过 `agentBuiltins.taskDepth = depth + 1` 传递深度，因此子代理再调用 Task 时生命周期事件仍写回同一父会话，且 depth cap 不会重置。focused tests 已补 tool executor context 注入和 Task request body 断言；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

2026-07-08 native structured producer continuation：本批补 llm-loop runtime 的 code/json/diff fenced block producer，不新增 direct/chat 模式，不改 storage/export 底层。`AgentRuntimeStreamEvent` 新增 `assistant.part` wrapper；`ChatToRuntimeTranslator` 在 `done` 时保留原 `message.final` markdown，同时为 fenced `code_block`、合法 `json` data 和 diff 生成 `assistant.part_start` / `assistant.part_done`；renderer runtime reducer 把该事件应用到最新 assistant message，broker 侧直接把 `partEvent` 追加到 session storage，避免走 unknown product projection。focused tests 已补 translator producer、runtime reducer 和 broker persistence；因 `node_modules/.bin` 缺失，Vitest 尚未启动验证。

## Code-Based Remaining Work Count (2026-07-06)

按当前代码检索与调用链复核，不按旧文档 checkbox 计数：顶层未完成工作流剩 **0 个**；拆成可落地代码任务，核心未完成约 **0 项**；周边产品深化 MVP 也已接线。全量 full-test verification 已于 2026-07-18 收口完成（见末尾 `## Gate Health Snapshot 2026-07-18`），此前"沙箱无法完成本地端口监听类验证"的断言已 supersede。剩余仅是若产品继续投入时的深化项。

| 组 | 未完成项数 | 代码事实 | 未完成内容 |
| --- | ---: | --- | --- |
| Export / Recovery | 0 | `SessionStorageService.exportProjectArchive()` 已接入 Settings project export 入口；`DiagnosticExportService.export()` 已接入 Settings diagnostic export 入口；archived restore 组件已改名为 `ArchivedProjectsPanel`；archive 默认 `includeChatContent:false`，显式 true 才复制 JSONL；Project Recovery 顶部已有 wizard/checklist，引导 archived/orphan/legacy/export/diagnostic 下一步。 | Focused/full tests 已覆盖到该批；zip/package 格式和更完整迁移包可作为后续深化。 |
| Privacy display cleanup | 0 | Recovery / legacy import / orphan / archived project UI 默认路径展示已收敛为 redacted label，完整路径通过 explicit copy 操作暴露；orphan restore 失败不再把 raw cwd/error message 直接展示给用户；privacy redaction foundation 与 AgentTrace redaction 已有测试；session/project archive 默认不含聊天 JSONL 内容，显式 `includeChatContent:true` 才复制。 | Focused/full tests 已覆盖到该批；legacy import report 的更完整交互可作为后续深化。 |
| Context / Memory / Artifacts | 0 | `ProjectRulesReader` 已能只读 `AGENTS.md` / `CLAUDE.md` 并注入 Agent runtime system prompt；`contextManager` 纯函数、`PromptPart[]` history 修复、`useAgentSendPipeline` history 组装和 Settings `contextMode` 选择器已有 focused tests；latest assistant metadata 已记录 context source / strategy / compact marker，Inspector 优先读取 metadata 并可回放；`context.compacted` product/session event、project-rules snapshot DTO、Inspector source breakdown、LLM summarize seam 和 HTTP summarizer provider 已接线；metadata-level pin/unpin 已接线到 Inspector 和下一轮 send metadata；session-scoped artifact library MVP 已接到 Inspector。 | Focused/full tests 已覆盖到该批；专用摘要卡片和更完整 artifact actions 可作为后续深化，不阻塞当前 refactor 剩余主线。 |
| Multi-agent / structured output | 0 | `SubagentMessagePart`、subagent product events、JSONL reducer、`SubagentsInspectorSection` 和 `SubagentPartCard` 已有；`Message.toolCall.subagentRunId` 已从 runtime/SDK stream 贯穿到 renderer live tool messages、JSONL fallback 和 Inspector live count；Task HTTP recursion 会根据子代理 SSE tool-call 帧递增 `run.toolCallCount` 并通过 `subagent.updated` / `assistant.part_update` 持久化；nested Task recursion 通过 host-only `agentBuiltins` 保留父 conversation 和 depth；typed code/diff/data renderers 和 assistant parts 已有；llm-loop native fenced code/json/diff producer 已生成 `assistant.part` runtime events 并持久化为 session part events。 | Focused/full tests 已覆盖到该批；更细粒度 delta batching、table/tree/sources/artifact native producer 可作为后续深化。 |
| 周边产品深化 | 0 | MCP / Skills / Plugins 已保持独立入口；MCP、Skills、Plugins 三个独立市场页顶部已展示边界说明和交叉链接，但没有 Extensions 聚合页；Composer/Plan/Execute 主链路已存在；git worktree preflight 后端 API 已覆盖非 Git 仓库、目标路径、分支名、同名分支和 dirty/submodule/LFS/upstream issue，`createWorktree()` 会在 block 时提前返回；NewConversationModal 和 ProjectContextMenu 已在 worktree 创建前展示 preflight block/warn/info；session messages 已有 `readMessagesPage(offset, limit)`，初次切换、删除会话 fallback、删除项目 fallback 和“加载更早消息”均按页读取，不再点击后全量读取。 | Focused/full tests 已覆盖到该批；byte-index/增量 JSONL parse、Composer pill 更完整 branch switch/edit、MCP/Skill marketplace 视觉深水区可作为后续性能/体验深化。 |

当前 Export / Recovery、Privacy、Context / Memory / Artifacts、Multi-agent / structured output 和周边产品深化 MVP 均已完成接线，并已于 2026-07-18 整体验证通过：`git diff --check`、`pnpm check`、`pnpm lint`（31 warnings，无新增）、`pnpm i18n:check`、`pnpm test:run`（129 files / 1079 tests / 0 failed，含此前被沙箱 `listen EPERM` 阻塞的 2 个 server e2e）全绿。`pnpm build` 仍按用户要求未运行。

## Next Work Order (Code-Based, 2026-07-04)

按当前代码事实，下一批不再重跑 Phase 0a/0b/0c，而按以下顺序推进：

1. **P0 done: Project delete renderer regression**
   - Main 端 app userData project session 物理清理已由 `ProjectStorageService.remove()` 覆盖，并有 focused tests；renderer 端删除入口和 store fallback 回归已补。
   - `deleteProjectWithCleanup()` 先广播 `chat:stop-current-stream`，再调用 `projects.remove()`；只有 `removed:true` 才调用 `chatStore.deleteProjectConversationsLocally(projectId)`。
   - `chatStore.deleteProjectConversationsLocally(projectId)` 已覆盖当前项目、无 fallback、非当前项目三类路径；当前项目删除后会清 artifact/changeSets，切到最新非 archived fallback，会话运行/loading/streaming 状态归 idle/empty。

2. **P0 done: `.scr-data` policy cleanup follow-up**
   - 正式口径：项目会话只写 app userData，项目 cwd 不写 `.scr-data`。
   - `canUseProjectScrData()` / `migrateLegacyProjectBucket()` 已删除；当前只保留 `getLegacyProjectScrSessionsDir()` 给项目删除时清理历史 `.scr-data/sessions`。
   - 测试 helper 已改为 `legacyProjectScrSessionPath`；代码/测试命名不再把 `.scr-data` 表达为正式 session storage target。

3. **P1 done: Export / recovery product entry**
   - 底层已有 `exportSessionArchive()`、`exportProjectArchive()`、`DiagnosticExportService.export()`；Settings 现在已有 session/project/diagnostic export 入口和成功/失败反馈。
   - `ProjectArchiveManager` 已改名为 `ArchivedProjectsPanel`，只表达 archived project restore list；project archive export 走独立 Project Export section。
   - archive 默认 `includeChatContent:false`，显式 true 才复制 JSONL；Project Recovery 顶部已有 wizard/checklist。迁移包/zip/package 可作为后续深化。

4. **P1 done: Privacy display cleanup**
   - Recovery / legacy import / orphan / archived project UI 默认不直接显示完整路径；列表和反馈显示 redacted path，完整路径只通过 explicit copy 操作暴露；orphan restore 失败 toast 不再原样展示 raw cwd/error message。
   - session/project archive 本体默认不包含 chat content，显式 `includeChatContent:true` 才复制 JSONL。

5. **P2: Context/Memory deepening**
   - `ProjectRulesReader` 已只读 `AGENTS.md` / `CLAUDE.md` 并接入 Agent prompt context；`contextManager`、`PromptPart[]` history 修复、`useAgentSendPipeline` 历史组装与 Settings `contextMode` UI 激活已完成低风险切片。
   - Context Inspector 真实注入状态、pin/unpin context、自动 compact/summarize 和 session-scoped artifact library MVP 已接线，并已通过当前沙箱可运行的 focused/full tests 覆盖。
   - **上下文管理与 token 自动压缩已有完整 plan**（[context-management-plan](./context-management-plan.md)）：剩余重点是专用摘要卡片和后续 artifact actions 深化。

6. **P2: Multi-agent and structured output follow-up**
   - `Message.toolCall.subagentRunId` renderer threading 已接上 live tool message、JSONL fallback 和 Subagents Inspector live count。
   - Task HTTP recursion 已根据子代理 SSE tool-call 帧通过 `subagent.updated` 递增 `run.toolCallCount`。
   - nested Task recursion 已通过 host-only `agentBuiltins` 保留父 conversation 和 depth，生命周期事件顶层写回父会话。
   - llm-loop native fenced code/json/diff producer 已生成 `assistant.part` runtime events 并直写 session part events；table/tree/sources/artifact native producer 和 delta batching 可作为后续深化，不阻塞当前主线。

## Latest Verified Commands

> **归档声明（2026-07-18，R4 收口）**：本节下方 2026-07-03~07-08 各历史批次记录中所有 `Blocked verification` / `node_modules/.bin 缺失` / `尚不能执行 vitest/tsc/oxlint` / `因 listen EPERM 0.0.0.0:3000 无法完成 server e2e` 等阻塞断言**均已 supersede**。工具链早已齐全，server e2e 端口监听阻塞也已解除；全部历史批次的 focused tests + 全量 `pnpm check` / `pnpm lint` / `pnpm i18n:check` / `pnpm test:run` 已于 2026-07-18 整体验证通过（129 files / 1079 tests / 0 failed）。以下历史条目仅保留改动轨迹，其"未验证"措辞不再代表当前状态。最新权威状态见末尾 `## Gate Health Snapshot 2026-07-18`。

2026-07-17 R2 gate-health fixes (branch `r2/gate-health-fixes`, 3 commits)

- **背景**：R1 只读门禁体检(5 门禁全绿,129 files / 1077 tests / 0 回归)产出 backlog,R2 处理其中确认成立的中风险项。R1 结论未落盘(遵守 R1 只读约束),本条目是 R2 closeout。
- **已落地**:
  - **P-M1**:`agentBuiltinsServer.test.ts` 新增 `depth=2 → emits taskDepth=3` 边界用例,锁定 `MAX_TASK_DEPTH=3` 的下界;并订正过时注释(unit 实际覆盖 depth 递增 happy path,不只 error path)。e2e 不重复断言 depth(真 HTTP recursion 拿不到 outgoing body,depth invariant 归 unit)。
  - **P-M2**:`jsonl.ts` 的 `coerceSubagentRun` 去掉 `as unknown as SubagentRunSummary` 强转,改为对 8 个 optional 字段逐个 coerce-or-drop;新增 regression test 喂入脏类型字段断言被剔除而非渗入。
  - **P-M4(缩小)**:`SessionStorageService.ReadMessagesPageResult` 改为 re-export `shared-types` 的 `SessionMessagesPageResult`(field-identical,已核对);新增 `DiagnosticExportRedactionMode` / `DiagnosticExportFileEntry` / `DiagnosticExportManifest` 到 `shared-types/electron-api.ts`(纯增量,原只在 main-side `DiagnosticExportService`)。
- **未做(留 R3)**:
  - **P-M3**(R1 subagent-B 报 `toBeTruthy()` 弱断言):经主 agent 逐行核对,每个 `toBeTruthy()` 后都紧跟精确断言(`toContain`/`data-percent`/`toHaveLength`),属常规两步式断言,**结论不成立,已移除**。
  - **P-M4 Pair 3/5**(SessionArchive/ProjectArchive ExportResult):原计划做,实施时发现它们 `manifest` 字段嵌套的 `SessionArchiveManifest` → `SessionArchiveFileEntry.kind` 在本地是 5 成员 union、shared 是 3 成员(本地 emit `project-metadata`/`project-settings`)。只 alias ExportResult 不 alias Manifest 会编译失败,而 Manifest 归 Pair 2/4 已明确留 R3。故 Pair 3/5 随之延后。
  - **Pair 7 既存 bug**:shared-types 的 `DiagnosticExportResult` 缺 `manifest` 字段(main-side 实际 wire 有),改它会动跨进程契约,留 R3。
- **验证**(R2 改完后,完整工具链):`git diff --check` ✅;`pnpm check` ✅ exit 0;`pnpm lint` ✅ exit 0(31 warnings,无新增);`pnpm i18n:check` ✅;`pnpm test:run` ✅ **129 files / 1079 tests / 0 failed**(+2: P-M1 +1、P-M2 +1)。
- **稳定基线更新**:`pnpm test:run` = 129 files / **1079** tests / ~13s(原 1077)。

2026-07-08 blocked verification audit continuation

- **Codebase-memory status**：按 AGENTS.md 优先尝试 codebase-memory MCP，`list_projects` 返回 `Transport closed`，因此本轮代码发现回退到本地文件/命令扫描。
- **Completion audit**：
  - 已完整读取 `docs/refactor-plan.md`、`docs/design-doc.md`、`docs/requirements-plan.md`、`docs/refactor-progress.md`。
  - `git status --short` 显示工作树仍包含既有大批次改动；本轮未回滚用户/既有改动。
  - 路由/菜单扫描未发现用户可见 `/extensions` route；`AppSidebar` 仍通过 `getEffectiveMenuItems()` 强制隐藏 compatibility `extensions` 并保持 `mcp` / `skills` / `plugins` enabled。
  - `SessionStorageService.create()` / `updateMeta()` 仍强制 `chatMode:"agent"`；renderer `useChat` / `useSendMessage` 导出的 `ChatMode` 仍为 `"agent"`。旧 `direct/chat` 只作为 compatibility type/locale/test 文本残留。
  - `SessionStorageService.resolveSessionBucket()` 仍把项目会话写入 app userData `projects/<projectId>/sessions/`，`.scr-data` 只剩 dev userData 名称、历史 cleanup helper 和相关 tests。
- **Verification rerun**：
  - `git diff --check` → passed。
  - `pnpm check` → passed。
  - `pnpm lint` → passed，0 errors；仍有既有 warnings。
  - `pnpm i18n:check` → passed。
  - Focused continuation tests：`CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/runtime/__tests__/GitInfoService.worktree.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/stores/__tests__/chatStore.test.ts src/renderer/src/lib/__tests__/worktreePreflightDisplay.test.ts src/renderer/src/components/market/__tests__/IndependentMarketNotice.test.ts` → passed，8 files / 135 tests。
  - Focused regression tests：`CI=true ./node_modules/.bin/vitest run src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx src/renderer/src/services/sessionArchiveService.test.ts` → passed，3 files / 21 tests。
  - `pnpm test:run` → partial pass：128/130 test files passed，1074 tests passed，5 skipped；remaining 2 suites (`src/test-utils/__tests__/serverFixture.test.ts`、`src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.e2e.test.ts`) fail before assertions because sandbox blocks local server listen: `listen EPERM: operation not permitted 0.0.0.0:3000`。
  - 按权限规则请求提升权限重跑 `pnpm test:run`，但环境策略拒绝 unsandboxed test run；未尝试绕过或间接规避。
- **Not run**：`pnpm build` / 打包命令按用户要求未运行。

2026-07-08 final verification continuation

- **代码事实**：此前 `node_modules/.bin` 缺失的验证阻塞已经不再成立；focused tests 和项目级命令可以启动。重跑验证时发现并修复了几处真实回归：删除会话/删除项目 fallback 仍走旧 `readMessages({tail})`、独立市场文案仍出现 `Extensions` 聚合词、`ChatStreamEvent` / `ChatMessagePersist.toolCall` 类型未同步 `subagentRunId`、`context.compacted` session event helper 缺少 union narrowing，以及 Recovery / Context Inspector tests 的 mock/按钮选择与当前 UI 不同步。
- **改动**：
  - `src/renderer/src/stores/chatStore.ts`：删除当前会话 fallback 和删除项目 fallback 均改为 `readSessionMessagesPage({ offset:0, limit:100 })`，与初次切换和加载更早消息一致。
  - `src/renderer/src/components/market/IndependentMarketNotice.tsx`：移除 `Extensions bucket` / `UI extensions` 措辞，保留 MCP / Skills / App Plugins 独立市场边界说明。
  - `packages/shared-types/src/chat.ts`、`src/main/ipc/types.ts`、`src/renderer/src/types/models.ts`、`src/renderer/src/types/electron.d.ts`、`src/preload/index.ts`：同步 `subagentRunId` 类型契约。
  - `src/renderer/src/lib/contextEventPersistence.ts`：对 `createContextCompactedProductEvent()` 返回值先按 `event.type === "context.compacted"` 窄化后读取 payload。
  - `src/renderer/src/components/settings/RecoveryWizardPanel.tsx`：wizard step fallback label 改成用户可读动作文案。
  - Tests 同步：RecoverySettings 精确选择 session export 按钮、sessionArchiveService 断言可选 options 参数、ContextInspectorSection mock 补 `toggleContextSourcePinned`。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - Focused continuation tests：`CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/runtime/__tests__/GitInfoService.worktree.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/stores/__tests__/chatStore.test.ts src/renderer/src/lib/__tests__/worktreePreflightDisplay.test.ts src/renderer/src/components/market/__tests__/IndependentMarketNotice.test.ts` → passed，8 files / 135 tests。
  - Focused regression tests：`CI=true ./node_modules/.bin/vitest run src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx src/renderer/src/services/sessionArchiveService.test.ts` → passed，3 files / 21 tests。
  - `pnpm check` → passed (`tsc -b --noEmit`)。
  - `pnpm lint` → passed，0 errors；仍有既有 warnings。
  - `pnpm i18n:check` → passed。
  - `pnpm test:run` → partial pass：128/130 test files passed，1074 tests passed，5 skipped；remaining 2 suites (`src/test-utils/__tests__/serverFixture.test.ts`、`src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.e2e.test.ts`) fail before assertions because sandbox blocks local server listen: `listen EPERM: operation not permitted 0.0.0.0:3000`。按规则请求提升权限重跑 `pnpm test:run`，但被环境策略拒绝；未尝试绕过。
- **Not run**：`pnpm build` / 打包命令按用户要求未运行。

2026-07-08 independent markets continuation

- **代码事实**：MCP、Skills、Plugins 已是独立路由/页面，未恢复 Extensions 聚合页；缺口是三个市场页缺少一致边界说明，用户仍可能把 MCP server、prompt skill、App Plugin 混成一个 Extensions 产品面。
- **改动**：
  - 新增 `src/renderer/src/components/market/IndependentMarketNotice.tsx`，提供 MCP / Skills / App Plugins 独立市场边界说明和交叉链接。
  - `src/renderer/src/pages/McpMarket.tsx`、`src/renderer/src/pages/Skills.tsx`、`src/renderer/src/pages/Plugins.tsx` 顶部接入该 notice；不新增 `/extensions` 路由，不合并市场数据。
  - Focused tests 已补 `IndependentMarketNotice.test.ts`，覆盖三类市场文案保持独立且不命名 Extensions 聚合页。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/components/market/__tests__/IndependentMarketNotice.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-08 worktree preflight UI continuation

- **代码事实**：`NewConversationModal` 和 `ProjectContextMenu` 已有 worktree 创建入口，但此前只提示“后续接入统一命令审批”，不会展示新增的 `preflightCreateWorktree()` block/warn/info 结果；Composer info bar 的 pills 本体仍是轻量展示，不适合在本批新增完整 branch switch 编辑器。
- **改动**：
  - `src/renderer/src/components/chat/NewConversationModal.tsx`：创建 worktree + 新分支前调用 `gitService.preflightCreateWorktree()`；存在 block issue 时不创建项目/会话，并在表单里展示检查结果；warn/info 显示但允许继续。
  - `src/renderer/src/components/project/ProjectContextMenu.tsx`：右键创建工作树 modal 接入同一 preflight 展示和阻断。
  - `src/renderer/src/lib/worktreePreflightDisplay.ts`：抽出 preflight display 纯 helper，避免两个 modal 分叉。
  - Focused tests 已补 `worktreePreflightDisplay.test.ts`，覆盖 idle/block/warn/success 展示规则。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/runtime/__tests__/GitInfoService.worktree.test.ts src/renderer/src/lib/__tests__/worktreePreflightDisplay.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-08 paged session message reads continuation

- **代码事实**：`SessionStorageService.readMessages({tail})` 此前仍会 reduce 全量 JSONL 后 slice；renderer `switchConversation()` 初次 tail 读 100 条，但 `loadOlderMessages()` 点击后会无 `tail` 全量读取，长会话仍可能一次性加载全部历史。
- **改动**：
  - `src/main/services/storage/SessionStorageService.ts`：新增 `readMessagesPage(sessionId, { offset, limit })`，按“从最新消息往前跳过 offset 条”返回一页 chronological messages、`total`、`hasMore`、`nextOffset`；旧 `readMessages()` 保持兼容。
  - `packages/shared-types/src/electron-api.ts`、`src/main/ipc/api-impl.ts`、`src/preload/index.ts`：暴露 `sessions.readMessagesPage()`。
  - `src/renderer/src/stores/chatStore.ts`：`switchConversation()` 改用 page API 读取最新 100 条；`loadOlderMessages()` 用当前已加载数量作为 offset 读取上一页并 prepend，不再全量读取。
  - Focused tests 已补 `SessionStorageService.test.ts` page case 和 `chatStore.test.ts` older-page prepend case。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/stores/__tests__/chatStore.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-08 git worktree preflight backend continuation

- **Subagent status**：按用户要求启动了 3 个只读 explorer（Composer/worktree、MCP/Skills 独立市场、分页/验证），但三个 subagent 均因平台流断开失败：`stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)`，没有返回可用报告。主 agent 已改为本地只读复核后继续推进，不让 subagent 改文件。
- **代码事实**：`docs/git-worktree-preflight.md` 要求 worktree 创建前检查 Git repo、target path、branch name、branch exists、dirty/submodule/LFS/upstream；当前 `GitInfoService.createWorktree()` 此前只直接执行 `git worktree add -b`，Project 右键和 NewConversationModal 已有 worktree 创建入口，Composer `LaunchModePill` / `BranchPill` 仍是 read-only。
- **改动**：
  - `packages/shared-types/src/git.ts`：新增 `WorktreePreflightIssue`、`WorktreePreflightResult`、`CreateWorktreeResult`。
  - `src/main/services/runtime/GitInfoService.ts`：新增 `preflightCreateWorktree()`，阻断非 Git repo、已存在/不可访问目标路径、非法分支名和同名分支；dirty/submodule/LFS/upstream 返回 warn/info；`createWorktree()` 会先跑 preflight，block 时不执行 `git worktree add`。
  - `packages/shared-types/src/electron-api.ts`、`src/main/ipc/api-impl.ts`、`src/preload/index.ts`、`src/renderer/src/services/gitService.ts`：暴露 `git.preflightCreateWorktree()`，并把 `createWorktree()` 返回类型扩展为带 `preflight`。
  - `docs/git-worktree-preflight.md`：同步当前实现 snapshot 和测试 checklist。
  - Focused tests 已补 `src/main/services/runtime/__tests__/GitInfoService.worktree.test.ts`，覆盖非 Git repo 不执行 add、existing target block、invalid branch block、dirty warning 可继续。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/runtime/__tests__/GitInfoService.worktree.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-08 native structured producer continuation

- **代码事实**：shared `MessagePart` / `AssistantPartEvent` 和 renderer `applyAssistantPartEvent()` 已能承载 code/diff/data parts，但 `AgentRuntimeStreamEvent` 没有 runtime-native assistant part wrapper；llm-loop `ChatToRuntimeTranslator` 只在 `done` 时发 `message.final`，不会把 fenced code/json/diff 产出结构化 part event。
- **改动**：
  - `packages/shared-types/src/agent-runtime.ts`：新增 `AgentAssistantPartRuntimeEvent`（`type:"assistant.part"`），承载 existing `AssistantPartEvent`。
  - `src/main/services/agent/runtime/streamEventTranslator.ts`：在 `done` 时从 fenced blocks 生成 `code_block`、合法 JSON `data`、diff `diff` parts，并发 `assistant.part_start` / `assistant.part_done` wrapper；保留原 `message.final` markdown。
  - `src/renderer/src/hooks/useAgentEventReducer.ts`：runtime `assistant.part` 映射到最新 assistant message 的 `apply_assistant_part` action。
  - `src/main/services/agent/runtime/AgentRuntimeIpcBroker.ts`：`assistant.part` 直接把 `partEvent` 写入 session storage，不走 unknown product projection。
  - Focused tests 已补 `streamEventTranslator.test.ts`、`useAgentEventReducer.test.ts`、`AgentRuntimeIpcBroker.test.ts`。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-08 Multi-agent nested Task continuation

- **代码事实**：Task handler 的递归 HTTP request 此前使用 `conversationId = subRequestId`，导致子代理内部再次调用 Task 时 lifecycle 事件路由到子会话而不是父会话；递归请求也没有把 `_taskDepth` 传入后续 tool executor，depth cap 会重置。
- **改动**：
  - `src/main/ipc/types.ts`、`src/main/server/routes/llm.ts`：`ChatCompletionRequest` 新增 host-only `agentBuiltins` context，LLM route 原样接收但不走 provider `extraParams`。
  - `src/main/services/llm/toolExecutorFactory.ts`：从 `agentBuiltins` 注入 `_taskDepth`、`_parentConversationId`、`_parentAssistantMessageId`；调用参数显式 `_taskDepth` 仍优先。
  - `src/main/services/mcp/internal/servers/agentBuiltinsServer.ts`：Task recursion 保留父 `conversationId`，并传递 `agentBuiltins.taskDepth = depth + 1`。
  - Focused tests 已补 `toolExecutorFactory.test.ts` 和 `agentBuiltinsServer.test.ts`。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/llm/__tests__/toolExecutorFactory.test.ts src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts src/main/services/agent/runtime/__tests__/SubagentEventBridge.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-08 Multi-agent recursive tool-count continuation

- **代码事实**：`SubagentEventBridge.update()` 已存在，但此前不会自动把注册时的 `parentAssistantMessageId` 放入 patch；`Task` handler 消费子代理 SSE 时只累计 text chunk，不统计 `tool_call` / `tool.call` 帧，因此 `run.toolCallCount` 只能靠最终 summary 或 replay 吸收，缺少递归 SSE 过程更新。
- **改动**：
  - `src/main/services/agent/runtime/SubagentEventBridge.ts`：`update()` 自动把注册的 parent assistant message id 合并进 patch，使 `subagent.updated` 可 materialize 为 `assistant.part_update`。
  - `src/main/services/mcp/internal/servers/agentBuiltinsServer.ts`：Task HTTP recursion 识别 `tool_call` / `tool.call` SSE frame，递增 `toolCallCount` 并发 `bridge.update()`；完成时把最终 count 写入 `bridge.complete()`；同时接受可选 `_parentAssistantMessageId`。
  - Focused tests 已补 `SubagentEventBridge.test.ts` 和 `agentBuiltinsServer.test.ts`。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/SubagentEventBridge.test.ts src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/storage/__tests__/jsonl.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-07 Multi-agent tool-call threading continuation

- **代码事实**：shared runtime/product/session event 已有 `subagentRunId`，JSONL reducer 已能把子代理 tool events 吸收到 `SubagentMessagePart`；缺口是 renderer live `ToolCall` 类型/reducer 未携带该字段，Subagents Inspector 只能显示 replay summary count。
- **改动**：
  - `packages/shared-types/src/chat.ts`：`ToolCall` 新增 `subagentRunId?: string`。
  - `src/renderer/src/hooks/useAgentEventReducer.ts`、`src/renderer/src/hooks/useLegacyLLMStreamHandler.ts`、`packages/shared-types/src/agent-sdk.ts`：runtime / legacy SDK tool call、permission request、terminal result patch 透传子代理归属。
  - `packages/shared-types/src/messageConverter.ts`、`src/renderer/src/stores/chatMessageStore.ts`、`src/main/services/storage/jsonl.ts`：live store persistence、Message → SessionEvent conversion 和 JSONL fallback top-level tool message 均保留 `subagentRunId`。
  - `src/renderer/src/hooks/useSubagentsInspectorData.ts`：Subagents Inspector 对同一 run 的 summary/live tool count 取较大值，支持运行中实时递增。
  - Focused tests 已补 `useAgentEventReducer.test.ts`、`agentRuntimeStreamAdapter.test.ts`、`useSubagentsInspectorData.test.ts`、`messageConverter.test.ts`、`jsonl.test.ts`。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/hooks/__tests__/useSubagentsInspectorData.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/messageConverter.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-07 Recovery wizard continuation

- **Subagent 复核结论**：Epicurus 确认最小 Recovery wizard 应是 Project Recovery 顶部 checklist，而不是完整迁移包/恢复包导入；不应改 storage/export 底层，不应新增任意 output path，也不应触碰 direct/chat 或 Extensions 聚合页。
- **改动**：
  - 新增 `src/renderer/src/lib/recoveryWizard.ts`，从 archived/orphan/legacy/exportable counts 派生 wizard steps、recommended action、hasRecoveryAction。
  - 新增 `src/renderer/src/components/settings/RecoveryWizardPanel.tsx`，渲染 Recovery checklist 并复用传入的 refresh / legacy import / diagnostic export callbacks。
  - `RecoverySettings.tsx` 顶部接入 wizard panel；默认 DOM 仍只显示 redacted paths，full path 仍只通过 explicit copy 操作。
  - `src/renderer/src/i18n/locales/{en,zh}/settings.json` 新增 wizard 文案。
  - Focused tests 已补 `recoveryWizard.test.ts` 和 `RecoverySettings.test.tsx` wizard cases。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/settings.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/recoveryWizard.test.ts src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/components/settings/__tests__/ArchivedProjectsPanel.test.tsx` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-07 Export/Recovery archive privacy semantics continuation

- **改动**：
  - `src/main/services/storage/SessionStorageService.ts`：`exportSessionArchive()` / `exportProjectArchive()` 新增 `includeChatContent?: boolean`；默认 false 写空 JSONL 占位、清空 exported session meta `preview`、manifest 标 `includeChatContent:false`，且不列 attachments/contentRefs。显式 true 保持旧 JSONL copy 行为。
  - `packages/shared-types/src/electron-api.ts`、`src/main/ipc/api-impl.ts`、`src/preload/index.ts` auto bridge、`src/renderer/src/services/sessionArchiveService.ts`：archive API 支持可选 privacy options，但仍不接受 renderer-provided output path。
  - `RecoverySettings` 和 settings i18n 文案改为默认不含聊天 transcript、附件、tool payload 或真实项目目录。
  - Focused tests 已补 storage 默认 no-chat-content、显式 include true、IPC/preload/service options 透传。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/{chat,settings}.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/ipc/__tests__/sessionArchiveApi.test.ts src/preload/__tests__/sessionArchiveBridge.test.ts src/renderer/src/services/sessionArchiveService.test.ts src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-07 Context/Memory artifact library continuation

- **改动**：
  - 新增 `src/renderer/src/lib/artifactLibrary.ts`，把当前 conversation 的 `ChatFileArtifact` / `ChatFileChangeSet` 聚合为 session-scoped artifact library items，按 `messageId/path/kind` 去重，默认只输出 `relativePath` 或 redacted path。
  - `src/renderer/src/components/chat/CodexEnvironmentInspector.tsx`：Changes section 改为 `Artifacts / 工件`，复用现有侧栏入口显示当前会话 artifacts，full path 只用于显式 `定位` / `复制` 操作。
  - 新增 `src/renderer/src/lib/__tests__/artifactLibrary.test.ts`，覆盖当前会话过滤、去重、默认不泄露绝对路径、changeSet index。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/artifactLibrary.test.ts src/main/services/storage/__tests__/jsonl.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-07 Context/Memory pin/unpin continuation

- **Subagent 复核结论**：Faraday 确认 `MessageContextSource.pinned` 已存在，Inspector 当前可写 latest message metadata，但发送链路跨轮保留未闭环；建议只按同 id 合并 pinned 状态，避免把过期 search/attachment 展示为仍注入。Maxwell 确认 pin/unpin 后最小下一刀是 session-scoped artifact library MVP，并指出 `docs/context-management-plan.md` 的 `send-pipeline product-event persistence pending` 状态已过期。
- **改动**：
  - `src/renderer/src/hooks/useContextInspectorData.ts`：新增 latest context message id 和 `toggleContextSourcePinned()` 纯 helper。
  - `src/renderer/src/components/chat/inspector/ContextInspectorSection.tsx`：source 行新增 pin/unpin 图标按钮，写回 latest context assistant message metadata；fallback legacy chips 不显示 pin 按钮。
  - `src/renderer/src/hooks/useAgentSendPipeline.ts`：新增 `getPinnedContextSources()` / `mergePinnedContextSources()`，下一轮 send metadata 重新生成同 id source 时保留 `pinned:true`，不追加本轮未出现的过期 pinned source。
  - `src/renderer/src/i18n/locales/{en,zh}/chat.json`：补 pin/unpin 文案。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts src/renderer/src/hooks/__tests__/useContextInspectorData.test.ts src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；offline dependency restore 先前因 pnpm store 缺 `bun-types-1.3.14.tgz` 失败，network/escalated dependency restore 被环境策略拒绝。本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check` / `pnpm lint` / `pnpm test:run`。`pnpm build` 按用户要求未运行。

2026-07-07 Context/Memory metadata replay + Inspector source strategy

- **Subagent 复核结论**：Curie 确认当前 metadata-level source/strategy 已接入发送管线和 Inspector，但 projectRules source 仍只是 runtime check，不是真实文件 snapshot；Volta 建议完整 `context.compacted` product/session event 应单独接 shared event + materializer + JSONL replay；Jason 确认 Export/Recovery archive `includeChatContent` 不阻塞本批；Einstein 给出本批 focused tests 和 sandbox 风险矩阵。
- **改动 A：Context source / strategy metadata**
  - `packages/shared-types/src/chat.ts`：新增 `MessageContextSource`、`MessageContextStrategy`，并挂到 `Message.metadata.contextSources/contextStrategy`。
  - `src/renderer/src/hooks/useAgentSendPipeline.ts`：`prepareHistoryForRuntime()` 返回 history strategy metadata 和本地 compact marker；发送前把 context source / strategy / compact marker 写回当前 assistant placeholder metadata。
  - 当前 `projectRules` source 只标识 main runtime 会做 AGENTS.md / CLAUDE.md runtime check，不回传文件内容，也不声称具体文件存在。
- **改动 B：Context Inspector metadata-first**
  - `src/renderer/src/hooks/useContextInspectorData.ts`：优先读取 latest assistant 的 `contextSources/contextStrategy/contextCompacted`；旧会话继续 fallback 到 system/project/attachment chips。
  - `src/renderer/src/components/chat/inspector/ContextInspectorSection.tsx`：显示 history strategy、history/search/tool source icon 和 compact events。
  - `src/renderer/src/i18n/locales/{en,zh}/chat.json`：补 Context Inspector strategy 文案。
- **Focused verification**：
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts src/renderer/src/hooks/__tests__/useContextInspectorData.test.ts src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx src/renderer/src/lib/__tests__/contextManager.test.ts` → 4 files / 39 tests passed.
- **Remaining follow-up**：
  - 依赖恢复后复验 `useAgentSendPipeline` 的 compact marker → `context.compacted` product-event persistence path。
  - 依赖恢复后复验 main runtime project-rules snapshot DTO → assistant metadata / Context Inspector source breakdown。
  - 依赖恢复后复验 LLM summarize one-shot seam / real HTTP summarizer provider、pin/unpin、artifact library focused tests。

2026-07-07 Context/Memory HTTP summarizer provider continuation

- **改动**：
  - 新增 `src/renderer/src/services/agent/contextSummarizer.ts`，通过 `localApiClient.sseStream('/v1/llm/chat/completions')` 调用本地 Koa LLM HTTP 端点执行摘要；请求使用当前 effective provider/model，禁用 tools（`toolPermission: { mode: "none" }`），`maxTokens: 2000`，并复用 conversationId/requestId。
  - `useAgentSendPipeline` 在未显式注入 `summarizeContext` 时，会基于当前 effective provider/model 自动创建 HTTP summarizer；provider/baseUrl 或 model 缺失时仍回退到本地 fallback summary。
  - focused tests 已补：`contextSummarizer.test.ts` 覆盖不可调用时返回 undefined、SSE chunk 汇总、请求体包含 provider/model/system prompt/user history、endpoint error 抛出；已有 `useAgentSendPipeline.test.ts` 覆盖 summarizer 注入后的 `summarySource:"llm"`。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/services/agent/__tests__/contextSummarizer.test.ts src/renderer/src/lib/__tests__/contextManager.test.ts src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check`。依赖恢复后需优先复验 HTTP summarizer provider、LLM summarize seam、project-rules Inspector、project-rules DTO 和 compact persistence focused tests。

2026-07-07 Context/Memory LLM summarize seam continuation

- **改动**：
  - `contextManager.applyContextStrategy()` 现在在 compact/auto summarized 时返回 `summaryInput`，即被压缩旧消息的原始摘要输入文本。
  - `useAgentSendPipeline` 保留同步 `prepareHistoryForRuntime()`，新增 `prepareHistoryForRuntimeWithSummary()` async wrapper；当调用方提供 `summarizeContext` 且发生 compact/summarized 时，会调用注入 summarizer，把返回值写入 history 首条 summary、`metadata.contextCompacted.summary` 和 `ContextCompactedProductEventInput.summary`，并把 `summarySource` 标为 `"llm"`。
  - `UseAgentSendPipelineOptions` 新增可选 `summarizeContext` 接缝；当前 `useChat` 尚未提供真实 HTTP summarizer，因此产品行为仍回退到本地 fallback summary。
  - focused tests 已补：`contextManager.test.ts` 覆盖 `summaryInput`；`useAgentSendPipeline.test.ts` 覆盖 async summarizer 注入、LLM summary 替换 history/event 和 `summarySource:"llm"`。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/contextManager.test.ts src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check`。依赖恢复后需优先复验 LLM summarize seam、project-rules Inspector、project-rules DTO 和 compact persistence focused tests。

2026-07-07 Context/Memory project rules Inspector continuation

- **改动**：
  - `Message.metadata` 新增 `projectRulesSnapshot?: ProjectRulesSnapshotDto`，用于持久化 renderer-safe project rules 快照。
  - `useAgentEventReducer` 新增 `mergeProjectRulesSnapshotSources()`，在 runtime `init` event 携带 `projectRulesSnapshot` 时，把 snapshot 合并进最后一个 assistant 的 `metadata.contextSources`：更新 projectRules source 的 `detail`、`bytes` 和 `injected`，并保留原 label。
  - runtime init metadata 更新现在同时保存 `nativeSessionId` 和 `projectRulesSnapshot`；`chatMessageStore.updateMessageMetadata()` 已会用同 id `assistant_message` 重发 metadata，因此可随 JSONL replay 保留。
  - focused tests 已补：`useAgentEventReducer.test.ts` 覆盖 snapshot source merge、runtime init metadata 更新，以及不泄露 path/content 的基本断言。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useContextInspectorData.test.ts src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check`。依赖恢复后需优先复验本批 reducer/Inspector tests、project-rules snapshot DTO tests 和 compact persistence tests。

2026-07-07 Context/Memory project rules snapshot DTO continuation

- **改动**：
  - `packages/shared-types/src/chat.ts`：新增 `ProjectRulesSnapshotDto` / `ProjectRulesSnapshotFile`，只包含 `filename`、`byteLength`、`sha256`、`truncated`、`injected` 和 `readAt`，不包含规则正文或绝对路径。
  - `ProjectRulesReader` 新增 `toProjectRulesSnapshotDto()`，把现有安全读取结果转成 renderer-safe DTO；空文件会记录 `injected:false`，仍不回传 content/path。
  - `AgentInitEvent` 和 `run.started` product event payload 新增可选 `projectRulesSnapshot`。
  - `ChatToRuntimeTranslator` 在首个 `init` event 上携带 snapshot DTO；`ClaudeCodeAgentRuntime` 构建 request 时读取 project rules，一边注入 system prompt，一边把 DTO 交给 translator。
  - focused tests 已补：`ProjectRulesReader.test.ts` 覆盖 DTO 不泄露 path/content；`ClaudeCodeAgentRuntime.test.ts` 覆盖 init event 携带 snapshot 且不泄露规则正文；`agentProductEvents.test.ts` 覆盖 `init` → `run.started.payload.projectRulesSnapshot` projection。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/agent/memory/__tests__/ProjectRulesReader.test.ts src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check`。依赖恢复后需优先复验上述 focused tests 和上一批 compact persistence tests。

2026-07-07 Context/Memory compact persistence continuation

- **改动**：
  - 新增 `src/renderer/src/lib/contextEventPersistence.ts`，renderer 侧复用 shared `createContextCompactedProductEvent()`，materialize 出 JSONL reducer 可回放的 `assistant_message`，与 main `productEventMaterializer` 的 `context.compacted` 输出保持同构。
  - `useAgentSendPipeline.prepareHistoryForRuntime()` 现在在 compact 发生时返回 `ContextCompactedProductEventInput`，包含 summary message id、summary、original count、compactedAt、strategy、estimatedTokens 和 fallback summary source。
  - `useAgentSendPipeline` 在 `createQuery()` 成功后调用 `persistContextCompactedEventForRuntime()`，通过注入的 `appendSessionEvent` 写入 session JSONL；写入失败只记录 warning，不中断发送流程。
  - `useChat.ts` 给 send pipeline 注入 `window.electron.sessions.appendEvent()`，并在 IPC response 失败时抛出错误交给 persistence helper 记录。
  - 新增 focused tests 文件/用例：`src/renderer/src/lib/__tests__/contextEventPersistence.test.ts`、`useAgentSendPipeline.test.ts` 的 compact product input 和 persistence helper 覆盖。
- **Verification**：
  - `git diff --check` → passed。
  - `node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` → passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/contextEventPersistence.test.ts src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts` → 未进入测试，失败于 `zsh:1: no such file or directory: ./node_modules/.bin/vitest`。
- **Blocked verification**：
  - `node_modules/.bin` 仍缺失；此前离线 pnpm install 失败于缺少 `bun-types-1.3.14.tgz`，联网恢复依赖的提权安装被环境策略拒绝且不得绕过。
  - 因此本批已补 focused tests，但尚不能执行 `vitest` / `tsc` / `oxlint` / `pnpm check`；依赖恢复后需优先复验上述两条 focused tests，再跑 context/memory touched-file type/lint。

2026-07-07 Context/Memory product event contract

- **改动**：
  - `packages/shared-types/src/agent-product-events.ts`：新增 `context.compacted` event type、`ContextCompactedProductEventInput` / context 和 `createContextCompactedProductEvent()`。
  - `src/main/services/agent/runtime/productEventMaterializer.ts`：新增 `context.compacted` materializer，输出 `assistant_message` 并写入 `metadata.contextCompacted/contextStrategy`。
  - `src/main/services/storage/__tests__/jsonl.test.ts`：覆盖 compacted assistant metadata replay 和 same-id upsert。
- **Focused verification**：
  - `CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/storage/__tests__/jsonl.test.ts` → 3 files / 68 tests passed.
- **Verification blocked after this batch**：
  - 后续 `CI=true pnpm check` 触发 pnpm 重新创建 `node_modules`，在 sandbox 网络下下载依赖时报 `ENOTFOUND registry.npmjs.org` 并失败；此后 `node_modules/.bin` 缺失。
  - 按权限规则已请求提权恢复依赖（`corepack pnpm@10.24.0 install --ignore-scripts --config.confirmModulesPurge=false --frozen-lockfile`），但自动审批因 usage limit 拒绝；未绕过审批继续尝试。
  - 因此 product event 小批次尚未完成 `pnpm check` / 后续 lint 复验；需在依赖恢复后继续。
- **Loop continuation status**：
  - 2026-07-07 已确认当前 thread goal 仍为 active，目标是按本重构文档持续推进直到完成；本次不是从零重启。
  - 复核当前工作区后确认 `node_modules/.bin` 仍缺失；上一轮因此暂停继续追加核心 TS 改动。本轮 continuation 已按 goal 要求继续落地 `useAgentSendPipeline` → `context.compacted` persistence path，但验证仍受依赖缺失阻塞。
  - 当前可用轻量验证：`git diff --check` passed；`node -e` 解析 `src/renderer/src/i18n/locales/{en,zh}/chat.json` passed。
  - 后续 continuation 尝试 `corepack pnpm@10.24.0 install --offline --ignore-scripts --config.confirmModulesPurge=false --frozen-lockfile` 失败：pnpm store 缺少 `bun-types-1.3.14.tgz`，离线模式无法下载。
  - 随后按权限规则请求联网恢复依赖的提权安装；环境策略拒绝本会话的 escalated dependency install，并要求不得通过 workaround 绕过。因此当前无法恢复 `node_modules/.bin`，也无法继续运行 `vitest` / `tsc` / `oxlint` / `pnpm check`。

2026-07-07 Context/Memory low-risk slice

- **Subagent 复核结论**：A 确认 Export/Recovery 产品入口、IPC/preload/shared types、i18n 和 focused tests 已落地，建议转入 Context/Memory；B 确认默认 UI 路径展示基本已脱敏，但 archive 本体和 raw error 仍需后续隐私批次；C 确认 `ProjectRulesReader` 未注入 prompt、history/contextCount/contextMode 未生效；D 给出 Context/Memory focused tests 和最终验证建议。
- **代码事实冲突记录**：`refactor-plan.md` 原“下一批补 project archive UI / diagnostic export UI”已与当前代码冲突；本批已更新为 Export/Recovery 深水区 follow-up，当前实现转入 Context/Memory low-risk slice。
- **改动 A：Context strategy foundation**
  - 新增 `src/renderer/src/lib/contextManager.ts` 和测试：覆盖 token budget、`contextCount` sliding window、`contextMode` full/auto/compact、Message → `AgentHistoryMessage`、summary message metadata。
  - `packages/shared-types/src/chat.ts`：`Message.metadata.contextCompacted` 类型落地，供后续 compact replay / inspector 消费。
- **改动 B：History replay into Agent runtime**
  - `src/renderer/src/hooks/useAgentSendPipeline.ts`：新增 `prepareHistoryForRuntime()`，排除当前 user + assistant placeholder 后按策略生成 `history` 并传入 `agentRuntimeClient.createQuery()`。
  - `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts`：`buildChatRequest()` 支持 `AgentHistoryMessage.content: PromptPart[]` text extraction，不再静默跳过历史。
- **改动 C：Project rules prompt injection + Settings context mode**
  - `ClaudeCodeAgentRuntime` 在 main runtime 侧通过 `ProjectRulesReader` 只读 cwd 下 `AGENTS.md` / `CLAUDE.md`，作为 `# Project rules` 注入 system prompt；读失败降级为空，不阻塞 run。
  - `ChatSettingsModal` 新增 `contextMode`（Auto / Compact / Full）segmented control，`DEFAULT_SESSION_SETTINGS.contextMode = "auto"`；`chat.json` 中英文文案已补。
- **Focused verification**：
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/contextManager.test.ts src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts src/main/services/agent/memory/__tests__/ProjectRulesReader.test.ts` → 4 files / 48 tests passed.
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/contextManager.test.ts src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts src/main/services/agent/memory/__tests__/ProjectRulesReader.test.ts src/renderer/src/hooks/__tests__/useContextUsage.test.ts src/renderer/src/hooks/__tests__/useContextInspectorData.test.ts src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx` → 7 files / 73 tests passed.
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/contextManager.test.ts src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts src/main/services/agent/memory/__tests__/ProjectRulesReader.test.ts src/renderer/src/hooks/__tests__/useContextUsage.test.ts src/renderer/src/hooks/__tests__/useContextInspectorData.test.ts src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/components/settings/__tests__/ArchivedProjectsPanel.test.tsx` → 9 files / 82 tests passed.
  - `CI=true ./node_modules/.bin/oxlint <touched Context/Memory files>` → passed，0 warnings / 0 errors.
  - locale JSON parse for `src/renderer/src/i18n/locales/{en,zh}/*.json` → passed.
- **Integration verification**：
  - `CI=true pnpm check` → passed.
  - `git diff --check` → passed.
  - `CI=true pnpm lint` → passed with existing warnings, no errors.
  - `CI=true pnpm test:run` → sandbox failed because server fixture tests could not bind `0.0.0.0:3000`; first elevated rerun reached tests but failed with transient `EADDRINUSE :::3000`; second elevated rerun was rejected by the escalation reviewer, so full suite could not be completed in this turn.
  - `CI=true pnpm i18n:check` → sandbox failed with `/var/.../tsx-*.pipe` `EPERM`; elevated rerun was rejected by the escalation reviewer. Safe fallback locale JSON parse passed, but full i18n checker was not completed.
- **Not run**：`pnpm build` / `pnpm dev`。
- **Remaining follow-up**：
  - 后续已接线 LLM summary call、`context.compacted` product/session event、Context Inspector real injected sources、pin/unpin context、artifact library；仍待依赖恢复后复验 focused tests。
  - Export/Recovery still has Recovery wizard and archive `includeChatContent` privacy semantics follow-up.

2026-07-07 Export/Recovery polish + privacy display hardening

- **Subagent 复核结论**：A 确认 session/project/diagnostic export 的 Settings 入口、IPC/preload/shared types、i18n 和 focused tests 已落地；B 确认默认 UI 路径展示基本已脱敏，但指出 archive 本体仍复制 raw `.jsonl` / `.meta.json`、`restoreOrphan()` raw error message 可能透出、legacy import redacted label 缺 explicit copy；C 确认 `ProjectRulesReader` 仍未接入 Agent prompt，Context Inspector project rules 仍是占位；D 给出 focused tests 和最终验证命令建议。
- **改动 A：Export feedback 就近展示**
  - `src/renderer/src/components/settings/RecoverySettings.tsx`：新增 `renderExportFeedback()` helper，把 session/project/diagnostic export feedback 分别显示在 Session Export / Project Export / Current Coverage 对应 section，不再把 project/diagnostic feedback 混在 Session Export section。
  - session/project archive 成功反馈后续已改为说明：默认 archive 只包含 app-managed session metadata；除非显式 `includeChatContent:true`，否则不包含 JSONL transcripts、真实项目目录、attachments 或 tool payloads。
- **改动 B：Privacy display hardening**
  - `RecoverySettings.tsx`：legacy import 目录默认显示 redacted label，并新增 explicit `Copy full path` action；orphan restore 失败时记录 console warning，但 UI 只显示通用本地化错误，不直接展示 main 返回的 raw cwd/error message。
  - `src/renderer/src/i18n/locales/{en,zh}/settings.json`：新增 `settingsNav.recovery.archiveContentNotice`。
- **Focused verification**：
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx` → 1 file / 7 tests passed.
  - `CI=true ./node_modules/.bin/oxlint src/renderer/src/components/settings/RecoverySettings.tsx src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/i18n/locales/en/settings.json src/renderer/src/i18n/locales/zh/settings.json` → passed，0 warnings / 0 errors.
  - `CI=true ./node_modules/.bin/vitest run src/main/ipc/__tests__/sessionArchiveApi.test.ts src/preload/__tests__/sessionArchiveBridge.test.ts src/renderer/src/services/sessionArchiveService.test.ts src/renderer/src/services/diagnosticExportService.test.ts src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/components/settings/__tests__/ArchivedProjectsPanel.test.tsx src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/diagnostics/__tests__/DiagnosticExportService.test.ts src/main/services/privacy/__tests__/redaction.test.ts` → 9 files / 87 tests passed.
  - `CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/lib/__tests__/planModePresentation.test.ts src/renderer/src/components/chat/composer/__tests__/LaunchModePill.test.tsx` → 5 files / 34 tests passed.
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/components/settings/__tests__/SettingsRail.test.tsx src/renderer/src/pages/settings/__tests__/settingsShell.test.tsx` → 2 files / 7 tests passed.
- **Integration verification**：
  - `CI=true pnpm check` → passed.
  - `git diff --check` → passed.
  - `CI=true pnpm test:run` → sandbox failed because server fixture tests could not bind `0.0.0.0:3000`; elevated rerun passed, 122 files / 1008 tests passed.
  - `CI=true pnpm lint` → passed with existing warnings, no errors.
  - `CI=true pnpm i18n:check` → sandbox failed with `/var/.../tsx-*.pipe` `EPERM`; elevated rerun passed.
- **Not run**：`pnpm build` / `pnpm dev`。
- **Remaining follow-up**：
  - 后续 archive 隐私语义批次已把 `exportSessionArchive()` / `exportProjectArchive()` 改为默认 `includeChatContent:false`，显式 true 才复制 JSONL。
  - `ProjectRulesReader` 仍未注入 Agent prompt；Context Inspector project rules 仍是 placeholder，完整 Context/Memory 计划见 [context-management-plan](./context-management-plan.md)。

2026-07-07 Export/Recovery product entry + privacy display cleanup

- **Subagent 复核结论**：A/B/C/D 四个只读 subagent 确认当前续点应从 Export/Recovery 和 Privacy display cleanup 增量推进；Phase 0a/0b/0c 不应重写。代码事实：session export 已有 Settings 入口；project archive 只有 storage/test 调用；diagnostic export 有 main/preload IPC 但无 renderer 入口；Recovery / orphan / legacy / archived project UI 默认仍展示 raw paths；`ProjectRulesReader` 仍未接入 Agent prompt。
- **代码事实冲突记录**：当前 archive 底层默认复制 `.jsonl` / `.meta.json`，与“默认导出不含 chat content，除非显式选择”的目标隐私口径冲突。本批先做产品入口和默认展示脱敏，不在同一批重写 storage archive 内容语义。
- **改动 A：Project archive + diagnostic export 入口**
  - `packages/shared-types/src/electron-api.ts`：新增 `ProjectArchiveExportResult` / manifest DTO 和 `projects.exportArchive(projectId)`；新增 `DiagnosticExportResult` 和 `diagnostics.export()` shared contract。
  - `src/main/ipc/api-impl.ts`、`src/preload/index.ts`：把 `projects.exportArchive` 接到 `SessionStorageService.exportProjectArchive(projectId)`，不接受 renderer-provided output path。
  - `src/renderer/src/services/sessionArchiveService.ts`：新增 `exportProjectArchive(projectId)`；新增 `src/renderer/src/services/diagnosticExportService.ts`。
  - `src/renderer/src/components/settings/RecoverySettings.tsx`：新增 Project Export section 和 diagnostic export action，提供 loading、toast 和 inline alert 反馈。
- **改动 B：Privacy display cleanup**
  - 新增 `src/renderer/src/lib/privacyDisplay.ts`，renderer 默认展示 redacted path label。
  - `RecoverySettings.tsx`：orphan cwd、legacy import dir、session/project/diagnostic export success path 默认显示 redacted label；完整路径只通过 explicit copy action 使用。
  - `ProjectArchiveManager.tsx` 改名为 `ArchivedProjectsPanel.tsx`，只负责 archived project restore list；默认显示 redacted cwd，copy full path 是显式操作。
- **Focused verification**：
  - `CI=true ./node_modules/.bin/vitest run src/main/ipc/__tests__/sessionArchiveApi.test.ts src/preload/__tests__/sessionArchiveBridge.test.ts src/renderer/src/services/sessionArchiveService.test.ts src/renderer/src/services/diagnosticExportService.test.ts src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/components/settings/__tests__/ArchivedProjectsPanel.test.tsx src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/diagnostics/__tests__/DiagnosticExportService.test.ts src/main/services/privacy/__tests__/redaction.test.ts` → 9 files / 86 tests passed.
  - `CI=true ./node_modules/.bin/oxlint <touched files>` → passed，0 warnings / 0 errors.
  - `git diff --check` → passed.
- **Integration verification**：
  - `CI=true pnpm check` → passed.
  - `CI=true pnpm test:run` → sandbox failed because server fixture tests could not bind `0.0.0.0:3000`; first elevated rerun hit transient `EADDRINUSE :::3000`; second elevated rerun passed, 122 files / 1007 tests passed.
  - `CI=true pnpm lint` → passed with existing warnings, no errors.
  - `CI=true pnpm i18n:check` → sandbox failed with `/var/.../tsx-*.pipe` `EPERM`; elevated rerun passed.
- **Not run**：`pnpm build` / `pnpm dev`。
- **剩余风险 / follow-up**：
  - 后续 archive 隐私语义批次已把 `exportSessionArchive()` / `exportProjectArchive()` 改为默认 `includeChatContent:false`，显式 true 才复制 JSONL。
  - Recovery wizard MVP、Context/Memory prompt 注入、compact persistence、LLM summarize/provider、pin/unpin 和 artifact library 已在后续批次接线但待依赖恢复后复验。

2026-07-07 Phase 0a-c 验收补丁：usage fast-skip + Plan/Execute 展示映射 + approval hook 接线

- **Subagent 复核结论**：A/B/C/D 四个只读 subagent 均确认 Phase 0a/0b/0c 主链路已落地，不应从零重写。当前批次只补边界缺口：runtime `usage` telemetry 不进入 projection/materializer 热路径、用户可见 planMode 不暴露内部 `chat` 兼容值、`useChat` 审批响应通过已拆出的 `useToolApprovalFlow` 接线。
- **改动 A：usage telemetry fast-skip**
  - `src/main/services/agent/runtime/AgentRuntimeIpcBroker.ts`：把 `usage` 加入 transient fast path，和 `text.delta` / `reasoning.delta` / `status` 一样仍转发给 renderer/trace，但不进入 JSONL materialization。
  - `src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts`：新增 usage 回归测试，确认 storage 只写 `run.started` / `run.completed` marker。
- **改动 B：Plan/Execute 展示映射**
  - `src/renderer/src/components/chat/CodexEnvironmentInspector.tsx`：Runtime 面板使用 `toAgentComposerMode()` + `AGENT_COMPOSER_MODE_LABEL` 显示 Plan/Execute，不直接显示 raw `runtime.planMode`。
  - `src/renderer/src/components/chat/ChatInputArea.tsx`、`src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx`：把当前会话 `session.planMode` 传给 `ChatComposerInfoBar`，避免 LaunchModePill 默认 Execute 与真实会话策略不一致。
  - `src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx`：新增 info bar planMode 透传测试。
- **改动 C：approval helper 接线**
  - `src/renderer/src/hooks/useChat.ts`：从直接调用 `createRespondToApproval()` 改为使用已拆出的 `useToolApprovalFlow()`，行为保持同一 helper 路径。
- **Verification**：
	- `CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/lib/__tests__/planModePresentation.test.ts src/renderer/src/components/chat/composer/__tests__/LaunchModePill.test.tsx` → 4 files / 28 tests passed。
	- `CI=true ./node_modules/.bin/oxlint src/main/services/agent/runtime/AgentRuntimeIpcBroker.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/renderer/src/hooks/useChat.ts src/renderer/src/components/chat/CodexEnvironmentInspector.tsx src/renderer/src/components/chat/ChatInputArea.tsx src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx` → passed，0 warnings / 0 errors。
	- `CI=true pnpm check` → passed.
	- `CI=true pnpm lint` → passed with existing warnings, no errors.
	- `CI=true pnpm i18n:check` → sandbox failed with `/var/.../tsx-*.pipe` `EPERM`; elevated rerun passed.
	- `CI=true pnpm test:run` → sandbox failed because server fixture tests could not bind `0.0.0.0:3000`; first elevated rerun hit transient `EADDRINUSE :::3000`; second elevated rerun passed, 120 files / 996 tests passed.
- **Not run**：`pnpm build` / `pnpm dev`。
- **剩余风险 / follow-up**：
  - Context / Memory 深水区、Plan regenerate version 约束、execute marker failure recovery 和真实 runtime stop/error smoke 仍是后续项；native code/json/diff structured producer 已由 2026-07-08 批次补齐，剩余为更细粒度 delta batching 和更广 typed producer。

2026-07-06 Phase 0a-c 验收补丁：unknown runtime projection 边界 + composer approval 阻塞区回归

- **Subagent 复核结论**：A/B/C/D 四个只读 subagent 均确认 Phase 0a/0b/0c 主链路已落地，不应从零重写。当前批次按代码事实只补验收测试：runtime unknown/debug transient 边界、输入区 approval/Ask 替换普通 composer、transcript 不重复展示 awaiting approval tool message。
- **改动 A：unknown runtime event 不落 JSONL**
  - `src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts`：新增 broker 集成测试，覆盖未知 `AgentRuntimeStreamEvent` 仍转发给 renderer、进入 trace，但 projection/materializer 不写 session JSONL，只保留 `run.started` / `run.completed` marker。
- **改动 B：输入区审批替换回归**
  - `src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx`：新增普通 tool approval 和 AskUserQuestion 两条阻塞区测试，确认普通 composer 被隐藏，并且 compact card 的 approve/submit 会调用 `respondToApproval`。
- **改动 C：transcript 去重回归**
  - `src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx`：新增 awaiting approval tool message 跳过测试，确认阻塞审批只在 composer 区展示，已完成 tool message 仍正常渲染。
- **改动 D：SettingsRail 测试环境 shim**
  - `src/renderer/src/components/settings/__tests__/SettingsRail.test.tsx`：局部补 `window.addEventListener/removeEventListener/dispatchEvent` shim，并设置 React act test environment flag。原因是仓库 `vitest.setup.ts` 会把 jsdom `window` 替换成普通对象，全量测试中 `SidebarResizeHandle` 需要 window 事件 API。
- **Verification**：
  - `CI=true ./node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx` → 3 files / 26 tests passed。
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/components/settings/__tests__/SettingsRail.test.tsx` → 1 file / 4 tests passed。
  - `CI=true pnpm check` → passed.
  - `CI=true pnpm lint` → passed with existing warnings, no errors.
  - `CI=true pnpm i18n:check` → sandbox failed with `/var/.../tsx-*.pipe` `EPERM`; elevated rerun passed.
  - `CI=true pnpm test:run` → sandbox failed because server fixture tests could not bind `0.0.0.0:3000`; elevated rerun passed, 120 files / 994 tests passed.
- **Not run**：`pnpm build` / `pnpm dev`。
- **剩余风险 / follow-up**：
  - Plan/Execute 当前仍有 renderer 侧 `planEventPersistence` 直接 materialize session events 的重复路径；main `productEventMaterializer` 已支持同类 product events，但消除重复需要单独协调 `Chat.tsx` 决策链路。
  - renderer live UI 仍主要消费 raw runtime stream event，而不是 product-event stream；当前 JSONL source-of-truth replay 已可恢复核心消息派生状态，完整 product-event replay store 属后续阶段。
  - native code/json/diff structured producer 已由 2026-07-08 批次补齐；delta batching、更广 typed producer 和真实 runtime smoke 仍是后续验收项。

2026-07-05 Phase 0a-c 复核后 P0 renderer 删除项目回归批次

- **Subagent 复核结论**：A/B/C/D 四个只读 subagent 均确认 Phase 0a/0b/0c 主链路已落地，不应从零重写。当前最明确缺口是 renderer 删除当前/运行中项目后的状态机回归测试；其它缺口进入后续 P1/P2。
- **改动 A：删除项目入口顺序测试**
  - 新增 `src/renderer/src/services/__tests__/projectDeletionService.test.ts`。
  - 覆盖 `deleteProjectWithCleanup()` 调用顺序：先 `chat:stop-current-stream`，再 `projectStore.remove()`，成功 `removed:true` 后才清理本地项目会话。
  - 覆盖 `keepFiles` option 透传，以及 `removed:false` / `null` 时不清理 renderer 会话。
  - 测试文件内局部安装 `EventTarget` shim，因为仓库当前 `vitest.setup.ts` 会把 jsdom `window` 替换成普通对象，缺少 `addEventListener/dispatchEvent`。
- **改动 B：项目会话删除 store 回归**
  - 扩展 `src/renderer/src/stores/__tests__/chatStore.test.ts`。
  - 覆盖删除当前项目会话时 fallback 到最新非 archived 会话、更新 `useSessionListStore.currentSessionId/byProject`、清理被删项目所有 artifacts/changeSets、读取 fallback tail messages。
  - 覆盖无 fallback 时清空 messages/currentConversationId，并把 `sessionStatus/isStreaming/streamingContent/isLoadingMessages` 归位。
  - 覆盖删除非当前项目时不重置当前消息和 streaming 状态。
- **改动 C：运行/loading 状态清理补强**
  - `src/renderer/src/stores/chatStore.ts`：`deleteProjectConversationsLocally()` 删除当前项目会话时，除 `idle` / 清 streaming / 清 hasOlder 外，额外清 `isLoadingMessages` 和 `isLoadingOlderMessages`，避免删除发生在读盘/加载中时 UI 残留 loading。
- **改动 D：`.scr-data` cleanup 命名收口**
  - `ProjectStorageService.getProjectScrDataDir()` / `getProjectScrSessionsDir()` 重命名为 `getLegacyProjectScrDataDir()` / `getLegacyProjectScrSessionsDir()`，明确只服务历史 `.scr-data/sessions` 删除 cleanup。
  - `SessionStorageService.test.ts` 中 `projectScrSessionPath` 重命名为 `legacyProjectScrSessionPath`，避免把 `.scr-data` 表达为正式 project session storage target。
- **Verification**：
  - `CI=true ./node_modules/.bin/vitest run src/renderer/src/services/__tests__/projectDeletionService.test.ts src/renderer/src/stores/__tests__/chatStore.test.ts` → 2 files / 9 tests passed。
  - `CI=true ./node_modules/.bin/vitest run src/main/services/storage/__tests__/ProjectStorageService.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts` → 2 files / 85 tests passed。
  - `CI=true ./node_modules/.bin/tsc -b --noEmit --pretty false` → passed。
  - `CI=true ./node_modules/.bin/oxlint src/renderer/src/services/projectDeletionService.ts src/renderer/src/services/__tests__/projectDeletionService.test.ts src/renderer/src/stores/chatStore.ts src/renderer/src/stores/__tests__/chatStore.test.ts` → passed，0 warnings / 0 errors。
  - `CI=true ./node_modules/.bin/oxlint src/main/services/storage/ProjectStorageService.ts src/main/services/storage/__tests__/ProjectStorageService.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts` → passed，0 warnings / 0 errors。
- **Not run**：`pnpm build` / `pnpm test:run` / `pnpm dev`。
- **剩余风险 / follow-up**：
  - 当前测试证明 renderer 本地状态会收敛；真实 dev smoke 仍需手动删除一个运行中项目会话观察 UI，但不需要打包。
  - project archive/diagnostic export UI、privacy display、Context/Memory 深水区仍按 Next Work Order 推进。

2026-07-04 Phase 0a-c 复核后 P0 收敛批次：项目删除数据语义 + `.scr-data` 策略清理 + Plan replay 只读摘要

- **Subagent 复核结论**：A/B/C/D 四个只读 subagent 均确认 Phase 0a/0b/0c 主线已落地，不应从零重写。Phase 0a 已有 runtime → product event projection/materializer/JSONL replay；Phase 0b 已有 `useAgentRunController`、message model/prompt/approval/event reducer helper、runtime-first 发送；Phase 0c 已有 PlanCard、composer blocked decision、execute/regenerate turn 和虚拟列表。后续进入验收、边界补齐和产品入口阶段。
- **改动 A：项目删除与 app userData session 语义固定**
  - `src/main/services/storage/__tests__/ProjectStorageService.test.ts`：新增默认删除 app-managed project `sessions/` 子树测试，覆盖 JSONL/meta、per-session attachments、tool-outputs/content-refs；新增 `keepFiles:true` 保留 session 数据测试，固定 orphan recovery 语义。
  - 新增历史 cwd `.scr-data/sessions` 清理测试：`keepFiles:false` 只删除历史 `.scr-data/sessions`，不删除用户项目 cwd 中普通文件；`keepFiles:true` 保留历史 `.scr-data/sessions`。
- **改动 B：`.scr-data` 旧写入/迁移路径清理**
  - `src/main/services/storage/ProjectStorageService.ts`：删除无调用的 `canUseProjectScrData()`，避免后续误接入后主动在 project cwd 创建 `.scr-data/sessions`。
  - `src/main/services/storage/SessionStorageService.ts`：删除无调用的 `migrateLegacyProjectBucket()`；`withStorageMarker()` 写 meta 时清空 `storageMigratedAt`，正式路径只保留 app userData storage marker。
  - 当前 `.scr-data` 只剩项目删除时的历史 cleanup 读取路径，不再作为 session storage target。
- **改动 C：Plan/Execute replay 历史只读化**
  - `src/renderer/src/components/chat/ChatMessageList.tsx`：assistant plan part 若带 replay decision，则用 `describePlanDecisionSummary()` 渲染只读摘要，不再显示可编辑 PlanCard / Execute 按钮；pending plan 仍渲染可操作 PlanCard。
  - `src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx`：更新 cancel/execute replay 断言，要求历史 plan 显示 `plan-decision-summary`，且 cancel replay 不出现 Execute 按钮。
- **改动 D：dev 验证配置修复**
  - `tsconfig.web.json`：`ignoreDeprecations` 从 `"6.0"` 改为 TypeScript 5.8.3 可接受的 `"5.0"`；否则 `tsc -b --noEmit` 在读配置阶段即失败。
- **Verification**：
  - `CI=true ./node_modules/.bin/vitest run src/main/services/storage/__tests__/ProjectStorageService.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx` → 3 files / 90 tests passed。
  - `CI=true ./node_modules/.bin/tsc -b --noEmit` → passed。
  - `CI=true ./node_modules/.bin/oxlint .` → passed，只有既有 warnings，无 errors。
  - `CI=true ./node_modules/.bin/tsx scripts/i18n/check.ts` → 沙箱内因 `/var/.../tsx-*.pipe` `EPERM` 失败；提升权限重跑通过。
  - `pnpm check` 未作为最终验证使用：当前 pnpm wrapper 会先触发依赖状态检查并因 `packageExtensionsChecksum` mismatch 退出，还会重建 `node_modules`；本批用本地 `tsc` binary 完成等价类型检查。
- **Not run**：`pnpm build` / `pnpm test:run` / `pnpm dev`。
- **剩余风险 / follow-up**：
  - Renderer 侧删除当前/运行中项目后的状态机仍需 focused tests：`deleteProjectWithCleanup()`、`chatStore.deleteProjectConversationsLocally()`、current session fallback、stream stop/idle。
  - `ProjectStorageService.getLegacyProjectScrSessionsDir()` 仅保留给历史 cleanup；不要把它重新接入正式 `.scr-data` storage。

2026-07-03 UX 小修：i18n missingKey 兜底 + 「应用插件开发」入口迁移 + 「工作目录」语义修正

- **背景**：`pnpm dev` 控制台反复出现两个 `i18next::translator: missingKey zh-CN`；「应用插件开发」按钮原本挂在 `设置 → API 服务` 头部，只在 API server `running` 时才可见，用户希望和插件本身相关的入口放到 `应用插件中心`；「工作目录」按钮当前打开的是 project.cwd（项目根），与 AI 子进程实际 cwd（session 沙箱）不一致，用户要求回归 session cwd 语义。
- **改动 A：i18n 缺失键补齐**
  - `src/renderer/src/i18n/locales/{zh,en}/settings.json`：在 `theme` 对象下新增 `tooltip.{light,dark,auto}` 三键，对应 `src/renderer/src/components/layout/ThemeToggleButton.tsx:105-110` 的 `t("theme.tooltip.auto/dark/light", ..., { ns: "settings" })`；zh 用「浅色/深色/自动」，en 用「Light/Dark/Auto」。此前只能靠 fallback 文案渲染，i18next 每次 hover 都记一条 missingKey。
  - `src/renderer/src/i18n/locales/{zh,en}/chat.json`：`modelPicker` 下新增 3 键 `setSessionDefault` / `clearMessageOverride` / `clearSessionOverride`，对应 `ChatModelPicker.tsx:341/363/523`；zh「设为会话默认 / 清除本次 / 恢复默认」，en「Set as session default / Clear this / Restore default」。日志里只报了 `setSessionDefault`（其他两个在当次未触发交互路径），一并补齐避免下次触发 clear 按钮再冒。
  - 4 份 JSON 均通过 `JSON.parse` 校验；`ThemeToggleButton` / `ChatModelPicker` 未动源码，只补翻译。
- **改动 B：「应用插件开发」入口从 API 服务面板迁到应用插件中心**
  - `src/renderer/src/components/settings/ApiServiceSettings.tsx`：删除 `<CodeOutlined /> {t("pluginDevGuide", "应用插件开发", { ns: "settings" })}` 按钮 JSX 块（约 12 行），保留 `API 文档` 主按钮；同步清理 `CodeOutlined` 未再使用的 icon import。原路径 `http://localhost:{port}/plugin-dev` 迁走。
  - `src/renderer/src/pages/Plugins.tsx`：
    - 新增 `CodeOutlined` icon import 与 `apiService` / `appService` service import。
    - `useState<ApiStatus>({status:"stopped", port:0})` + `pluginDevLoading` 两个新 state。
    - 新增 `useEffect` 挂载时 `apiService.getStatus()` 拉一次并订阅 IPC `server-status-update`，卸载时 `off()` 兼容 HMR。
    - 新增 `handleOpenPluginDev`：若 API server 未运行则先 `apiService.start()` 再 `appService.openExternal("http://localhost:{port}/plugin-dev")`；失败通过 `message.error(t("plugins.pluginDevServerUnavailable", "无法启动本地 API 服务", { ns: "plugins" }))` 反馈。**行为变更**：原 API 面板按钮仅在 `isRunning` 时出现；插件中心新按钮**始终显示**，点击时按需启动服务，用户无需先去设置里手动启服务再回来。
    - 头部 `Space` 内在 `刷新` 前插入新按钮 `<Button size="small" icon={<CodeOutlined/>} loading={pluginDevLoading} onClick={handleOpenPluginDev}>{t("plugins.pluginDevGuide", ...)}</Button>`。
  - `src/renderer/src/i18n/locales/{zh,en}/plugins.json`：`plugins` 下新增 `pluginDevGuide`（zh「应用插件开发」/ en「Plugin Development」）与 `pluginDevServerUnavailable`（zh「无法启动本地 API 服务」/ en「Failed to start local API server」）。原 `settings.json` 从未落 `pluginDevGuide` 键（只走 t() 第二参数 fallback），因此无需清理旧键。
- **改动 C：「工作目录」按钮语义回归 session cwd**
  - `src/renderer/src/hooks/useChatPageState.tsx`：`workspaceDir = projectCwd ?? sessionSandboxDir` → `sessionSandboxDir ?? projectCwd`；顶部注释重写，明确「按钮永远打开 AI 子进程实际 cwd（`resolveSessionCwd`），project.cwd 仅在 session cwd 解析失败时兜底」。`handleOpenWorkspace` 逻辑不变（仍走 `app:open-path`）。
  - `src/renderer/src/components/layout/IdeAppSwitcher.tsx`：`cwd = projectCwd ?? sandboxCwd` → `sandboxCwd ?? projectCwd`；`useEffect` 早退条件从 `if (!conversationId || projectCwd)` 改为 `if (!conversationId)`（原来项目会话直接跳过 session cwd 解析，现在无条件解析），依赖数组 `[conversationId, projectCwd]` → `[conversationId]`。注释同步更新说明与 ChatPage 保持同一心智。
  - **未改动的相邻功能（刻意保留）**：
    - `src/renderer/src/components/chat/CodexBranchSection.tsx` 分支信息仍用 `resolveProjectRoot` —— 分支属于项目 git 仓库，与 session 沙箱无关。
    - `src/renderer/src/services/terminalCwdService.ts` 「新开终端」仍优先 `resolveProjectRoot` —— 与「打开工作目录」是两套心智（终端习惯落在项目根），本轮未同步调整；如需对齐再评估。
    - `src/renderer/src/components/layout/SessionContextMenu.tsx` 「复制工作目录」原本就用 `resolveSessionCwd`，行为已一致。
- **文件清单**：
  - MODIFIED：`src/renderer/src/i18n/locales/{zh,en}/settings.json`（+`theme.tooltip`）；`src/renderer/src/i18n/locales/{zh,en}/chat.json`（+`modelPicker.setSessionDefault/clearMessageOverride/clearSessionOverride`）；`src/renderer/src/i18n/locales/{zh,en}/plugins.json`（+`plugins.pluginDevGuide/pluginDevServerUnavailable`）；`src/renderer/src/components/settings/ApiServiceSettings.tsx`（-`应用插件开发` 按钮 + `CodeOutlined` import）；`src/renderer/src/pages/Plugins.tsx`（+`应用插件开发` 按钮 / `apiStatus` state / `server-status-update` subscribe / `handleOpenPluginDev`）；`src/renderer/src/hooks/useChatPageState.tsx`（`workspaceDir` 优先级反转 + 注释）；`src/renderer/src/components/layout/IdeAppSwitcher.tsx`（`cwd` 优先级反转 + useEffect 依赖收窄 + 注释）。
  - 无 NEW / DELETED 文件。
- **Verification**：
  - `JSON.parse` 对 6 份 locale 文件全过。
  - `./node_modules/.bin/oxlint src/renderer/src/pages/Plugins.tsx src/renderer/src/components/settings/ApiServiceSettings.tsx src/renderer/src/hooks/useChatPageState.tsx src/renderer/src/components/layout/IdeAppSwitcher.tsx` → 0 warnings / 0 errors。
  - **Not run**：`pnpm check` / `pnpm test:run` / `pnpm build` / `pnpm dev` 冒烟（用户未要求；仅前端行为 + i18n 数据 + 无 IPC channel 变更）。
- **行为变更 & 兼容性口径**：
  - `应用插件开发` 按钮从「仅在 API server running 时可见」改为「始终显示、点击时按需启动」；插件页头部按钮变为 3 个（`应用插件开发 / 刷新 / 安装本地应用插件`）。API 服务面板顶部只剩 `API 文档` 一颗按钮。
  - `工作目录` 按钮的默认打开目标从项目根切到 session 沙箱。之前 G-2 那段"避免用户点开只看到沙箱看不到项目本体"的口径被用户显式推翻——用户希望这个按钮和 AI 看到的 cwd 严格对齐。若后续再要项目根语义，需要单独入口而非复用此按钮。
- **剩余风险 / follow-up**：
  - `terminalCwdService` 与「打开工作目录」现在心智不一致（终端 → 项目根；工作目录 → session 沙箱）。目前不认为是 bug，但需要在 UX 侧留意，如果用户后续报"终端和工作目录不在同一处"，需要同步反转 `terminalCwdService`。
  - `ThemeToggleButton` fallback 文案（第二参数）与新 locale 数据一致；若未来改 fallback，需同步 locale 值否则视觉会不稳定。
  - 新增按钮的 `apiService.start()` 兜底如果本地端口被占用，会走 `apiService` 现有错误路径 → `message.error(String(error))`；未在 UI 里做端口重试/切换向导。用户明示接受当前行为。

2026-07-03 Settings 壳交互 v2：需求变更（UX 迭代）

- **需求变更口径**（用户在 dev smoke 后针对 Settings shell 的多轮迭代反馈）：
  1. Settings 页去掉页面内 nav；Rail 与工作区 sidebar 同层级；结构必须是"左 Rail + 右列（TitleBar + 内容）"，不是"顶栏 + 下方 Rail+内容"的上下结构。
  2. 进入 Settings 页面应从底向上滑入；退出滑回底部；同一 shell 内切 Rail tab 只换 Outlet，不整页重渲染。
  3. "返回工作区" 语义 = 回到 `/chat` 工作区，不用 `history.back()`（history 里可能是 Settings 内部跳转，会回到上一个 tab）。
  4. TitleBar 在 `/settings/*` 下**不展示任何面包屑或页标题**（保留交通灯 + 拖拽区）。
  5. 全部 Settings chrome 字号对齐工作区基准（antd `compactAlgorithm` → 12px，`ClaudeSidebar` `text-xs`）：Rail 项、Header、SettingSection h3、ApiServiceSettings h3、WebhookSettings h3 一律 `text-xs`。
  6. Rail 选中样式回到简约款：只有 `colorPrimaryBg` 浅蓝底 + `colorPrimary` 蓝字，不叠 `borderLeft` 竖条也不叠 `focus-visible:ring-2` 焦点环。
  7. AboutSection 概览网格删除 MCP / 技能 / 应用插件 marketing 卡；剩下 5 张（Agent 工作台 / 联网搜索 / 主题定制 / 悬浮窗 / 本地 API）。
  8. Rail 底部用户信息卡片必须与工作区 ClaudeSidebar 底部**完全同一个组件**（含上方分割线），行为一致。
  9. 删除 Rail 的"引导 (Onboarding)"占位卡片。
- **代码层落地**：
  - Route：`/settings` 保持 `<Settings />` 一级 route，加 `children` 数组 + `index → <Navigate to="general" replace/>` + 11 条子路径（`general/models/agent/tools-permissions/projects/project-recovery/keyboard/api-service/webhook/advanced/about`）。BC：`?tab=<key>` 与 IPC `navigate-to tab=about|debug` 在挂载时 replace 到 `/settings/<key>`（`about`→`/settings/about`, `debug`→`/settings/advanced`）；非法 legacy key（`mcp/skills/app-plugins/context-memory`）兜底 `/settings/general`。
  - Layout：`MainLayout.tsx` 检测 `isSettingsRoute` 时 sidebar 槽位直接 render `<SettingsRail/>`，取代 workspace sidebar；TitleBar 在 `/settings/*` 下左侧 cluster 显式 `null`（`isSettingsRoute` 分支）。
  - Motion：`AnimatePresence` key 对 `/settings/*` 合并为 `"settings-shell"`（切 Rail tab 不再触发整页 unmount）；进入 Settings 时 `initial={{ opacity:0, y:"100%" }}` → `animate={{ opacity:1, y:0 }}`，退出 `exit={{ opacity:0, y:"100%" }}`，`duration:0.28s`。
  - Rail：新增 `SettingsRail.tsx`，顶部 `TrafficLightSpacer`（mac 30px）+ "← 返回工作区" 按钮（永远 `navigate("/chat")`）+ 11 项 nav（`SETTINGS_NAVIGATION_GROUPS` 数据源）+ 分割线 + 共享 `SidebarUserRow`。
  - 选中态：`px-3 py-1.5 rounded-lg text-xs font-medium`；active = `backgroundColor: colorPrimaryBg, color: colorPrimary`；hover = `colorFillTertiary` + `colorText`；无 `borderLeft`，无 focus ring。
  - 内容区：`Settings.tsx` 变成薄壳，`<MainLayout><div flex-col><Outlet context={...}/></div></MainLayout>`；内层 `max-w-4xl mx-auto px-6 py-4`，宽屏卡片不再无限拉伸。
  - 抽取共享组件 `src/renderer/src/components/layout/SidebarUserRow.tsx`：`w-8 h-8` 头像 + `text-[13px]` 名字 + `ThemeToggleButton` + `SettingOutlined` 按钮，**内置上方分割线** `border-t + colorBorderSecondary`；props `{ settingsPath?, onOpenSettings?, guestInitial? }`。`ClaudeSidebar.tsx` 底部 40+ 行 inline block 替换为 `<SidebarUserRow onOpenSettings={handleSettings}/>`，unused imports (`cn`, `getUserInitials`, `getAvatarColor`, `useUserStore`, `ThemeToggleButton`) 与局部变量 (`user`, `initials`, `avatarColor`) 同步清理。
  - 字号：`SettingsRail` button/back/onboarding-已删/profile → `text-xs`，icon → `text-sm`，nav item `py-1.5`；`SettingSection` h3 `text-lg font-semibold` → `text-xs font-semibold m-0`；`ApiServiceSettings` h3 `text-lg` → `text-xs`；`WebhookSettings` h3 `text-base` → `text-xs`。
  - 删除：`SettingsHeader.tsx` 组件文件；`SettingsRail` 引导 CTA `<Divider>+<button>` 块；相关 unused imports `RocketOutlined` / `message` / `Divider` / `Tag` / `SettingOutlined`（Rail 内的）。
  - AboutSection：`OverviewTab.features` 从 8 张减到 5 张（删 MCP / 技能 / 应用插件），imports 同步清 `CodeOutlined` / `StarOutlined` / `AppstoreOutlined`。
- **文件清单**：
  - MODIFIED：`src/renderer/src/components/layout/MainLayout.tsx`（sidebar 槽位换 SettingsRail + AnimatePresence key/motion 变体）；`src/renderer/src/components/layout/TitleBar.tsx`（`/settings/*` 左侧簇 null）；`src/renderer/src/components/layout/ClaudeSidebar.tsx`（inline user row → `<SidebarUserRow/>`）；`src/renderer/src/pages/Settings.tsx`（薄壳 + 无 `useTitle` + BC redirect）；`src/renderer/src/components/settings/SettingsRail.tsx`（新增）→ 后续多轮迭代（分割线内置 / 删引导 / 字号 / 选中样式）；`src/renderer/src/components/settings/SettingSection.tsx`（text-xs）；`src/renderer/src/components/settings/ApiServiceSettings.tsx` / `WebhookSettings.tsx`（h3 → text-xs）；`src/renderer/src/components/settings/AboutSection.tsx`（features 8→5，清 imports）；`src/renderer/src/lib/settingsNavigation.ts`（11 项，含 api-service / webhook / about 独立）；`src/renderer/src/lib/__tests__/settingsNavigation.test.ts`（REQUIRED_ORDER 11 项 + 防御断言）；`src/renderer/src/i18n/locales/{en,zh}/settings.json`（新 keys 见下）；`src/renderer/src/components/settings/__tests__/SettingsRail.test.tsx`（antd mock 补 `Tooltip`）。
  - NEW：`src/renderer/src/components/layout/SidebarUserRow.tsx`；`src/renderer/src/pages/settings/{GeneralPage,ModelsPage,AgentPage,ToolsPermissionsPage,ProjectsPage,ProjectRecoveryPage,KeyboardPage,ApiServicePage,WebhookPage,AdvancedPage,AboutPage}.tsx`（11 薄 wrapper）；`src/renderer/src/pages/settings/__tests__/settingsShell.test.tsx`。
  - DELETED：`src/renderer/src/components/settings/SettingsHeader.tsx`。
  - i18n keys 新增：`settingsShell.backToWorkspace`；`settingsNav.apiService` / `webhook` / `about`；`advancedTabs.experimental` / `quickActions` / `systemInfo` / `performance` / `debug`。保留但未使用的 legacy 描述 keys（mcp/skills/appPlugins/contextMemory 等）继续留在 JSON。
- **Focused verification**：
  ```
  ./node_modules/.bin/vitest run \
    src/renderer/src/lib/__tests__/settingsNavigation.test.ts \
    src/renderer/src/components/settings/__tests__/SettingsRail.test.tsx \
    src/renderer/src/pages/settings/__tests__/settingsShell.test.tsx \
    src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx
  ```
  4 files / 17 tests 全过。
- **Integration verification**：`./node_modules/.bin/tsc -b --noEmit --pretty false` 通过；touched-file `./node_modules/.bin/oxlint` 0 warnings / 0 errors；`./node_modules/.bin/tsx scripts/i18n/check.ts` 通过。
- **Not run**：`pnpm build` / `pnpm install` / 全量 `pnpm test:run`。
- **剩余风险 / 已识别 follow-up**：
  - `ClaudeSidebar` / `AppSidebar` 上方 nav 项没走 `text-xs` 统一 audit；本轮只统一 Settings-scope。若后续再要求"整个 App 字号统一"，需要一次 sidebar 侧的字号审查。
  - `SettingsHeader.tsx` 已删除但 i18n `settingsShell.onboarding` / `settingsShell.onboardingHint` 两个 key 仍留在 JSON（无引用，无副作用）。
  - Rail 底部 SettingsIcon 目前跳 `/settings/general`——在 Settings 页里点击等于"回自己首页"，不太有意义，但保持与 workspace 行为一致。

2026-07-03 Settings 壳重构：内嵌 nav → 应用级 Rail + 嵌套路由

- **UX 目标**：Settings 页从"页面内左侧导航" → "App MainLayout 内的专属视图"。进 `/settings/*` 时 App 层 sidebar 让位给 SettingsRail；每个模块是一个独立的嵌套子路由；不再有"内嵌左侧 nav + `?tab=` 状态机"这层。
- **决策口径**（用户 4 项确认）：
  - MCP / 技能 / 应用插件 **不进** Settings Rail —— 保持独立市场页 `/mcp` `/skills` `/plugins`。
  - 本轮只搭 shell + 迁移现有 11 项，不新建业务页（子智能体 / 代码预览 / 命令 / 索引库 / 使用统计 待后续实体化）。
  - Shell 是 **MainLayout 内 route**，不新建全屏 Electron 窗口；"返回工作区"回到浏览器 history 前一条或 `/chat`。
  - 内容区顶部**不再堆二级 tab**，只显示当前页标题；页内如 Advanced 内部仍是同级 Tabs。
- **改动清单**：
  - `src/renderer/src/pages/Settings.tsx` **384 → 117 行 (-267)**：变成一个薄壳，`<MainLayout>` 内挂 `<SettingsRail/>` + `<main><SettingsHeader/><Outlet context={{appInfo, openAboutModal}}/></main>`；保留 AboutModal state 与 `show-about-modal` / `navigate-to` IPC 监听；`?tab=<key>` deep link 在 mount 时 replace navigate 到 `/settings/<key>`，非法 legacy key（mcp/skills/app-plugins/context-memory）回退到 general；`tab=about` → `/settings/about`，`tab=debug` → `/settings/advanced`。
  - `src/renderer/src/router.tsx`：`APP_ROUTE_PATHS.settings` 保留 `/settings`，但新加 `children: [...]` 数组：`index` route → `<Navigate to="general" replace/>`，加上 11 个子路径 `general / models / agent / tools-permissions / projects / project-recovery / keyboard / api-service / webhook / advanced / about`。
  - `src/renderer/src/components/layout/MainLayout.tsx`：新增 `const isSettingsRoute = location.pathname.startsWith("/settings")`，`isSettingsRoute` 时 skip 渲染 `<ClaudeSidebar>` / `<AppSidebar>`。其他行为不变。
  - **NEW** `src/renderer/src/components/settings/SettingsRail.tsx`：240px（≥md）/ 64px（<md，icon-only）响应式 Rail。顶部 "← 返回工作区" 按钮（`history.length>1` → `navigate(-1)`；否则 `navigate("/chat")`）；中部 `SETTINGS_NAVIGATION_GROUPS.map` 渲染 11 条 nav item，active/hover/focus 三态；分隔线；底部 "🚀 引导" 卡片（onClick = `message.info` 占位 + `TODO(settings-shell)` 注释）；最下方 user profile mini card（读 `useUserStore` + 已有 `getUserInitials`/`getAvatarColor` helper）。导出 `SettingsRail`、`getActiveSettingsKey(pathname)`、`getSettingsNavigationIcon(key)`。
  - **NEW** `src/renderer/src/components/settings/SettingsHeader.tsx`：Option A 布局，只显示 localized 当前页标题。
  - **NEW** 11 个 page wrapper 位于 `src/renderer/src/pages/settings/`：`GeneralPage / ModelsPage / AgentPage / ToolsPermissionsPage / ProjectsPage / ProjectRecoveryPage / KeyboardPage / ApiServicePage / WebhookPage / AdvancedPage / AboutPage`。每个都是薄 wrapper：`GeneralPage → <GeneralSettings/>`；`ModelsPage → <ModelList/> + <ApiKeysConfig/>`；`AgentPage → <SearchSettings/>`；`ToolsPermissionsPage → 占位卡片`（CTA path 改为 `/settings/projects`）；`ProjectsPage → <ProjectArchiveManager/>`；`ProjectRecoveryPage → <RecoverySettings/>`；`KeyboardPage → <ShortcutSettings/>`；`ApiServicePage → <ApiServiceSettings/>`；`WebhookPage → <WebhookSettings/>`；`AdvancedPage → 4 个同级 Tabs（实验性功能 / 快速操作 / 系统信息 / 性能监控）`；`AboutPage → <AboutSection {...useOutletContext<{appInfo, openAboutModal}>()} />`。
  - `src/renderer/src/lib/__tests__/settingsNavigation.test.ts` 加防御断言 `length === 11`（6 → 7 tests）。
  - i18n `settings.json` en + zh 新增 `settingsShell.backToWorkspace` / `settingsShell.onboarding` / `settingsShell.onboardingHint`。
- **NEW 测试**：
  - `src/renderer/src/components/settings/__tests__/SettingsRail.test.tsx`（4 tests）：11 项按顺序渲染、active 状态匹配 pathname、item click 调用 `navigate("/settings/<key>")`、"返回工作区" 点击调用 navigate。
  - `src/renderer/src/pages/settings/__tests__/settingsShell.test.tsx`（3 tests）：MemoryRouter 挂在 `/settings/general` 渲染 General 内容；navigate `/settings/models` 渲染 Models；index route 重定向到 general。AntD + `@ant-design/icons` + `userStore` mock（同 RecoverySettings 现有模式）；重内容组件 stub 掉，只测 shell wiring。
- **Focused verification**：
  ```
  ./node_modules/.bin/vitest run \
    src/renderer/src/lib/__tests__/settingsNavigation.test.ts \
    src/renderer/src/components/settings/__tests__/SettingsRail.test.tsx \
    src/renderer/src/pages/settings/__tests__/settingsShell.test.tsx \
    src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx
  ```
  4 files / 17 tests 全过。
- **Integration verification**：`./node_modules/.bin/tsc -b --noEmit --pretty false` 通过；touched-file `./node_modules/.bin/oxlint`（19 files）0 warnings / 0 errors；`./node_modules/.bin/tsx scripts/i18n/check.ts` 通过。
- **Not run**：`pnpm build` / `pnpm install` / 全量 `pnpm test:run`。

2026-07-03 Settings IA 二次重构 + shared-types index 恢复 + Electron mirror 长期化

- **AboutSection 概览功能网格清理**：`src/renderer/src/components/settings/AboutSection.tsx` `OverviewTab.features` 从 8 张 marketing 卡片削到 5 张，移除 `MCP 支持` / `技能系统` / `应用插件系统`（保留 `Agent 工作台` / `联网搜索` / `主题定制` / `悬浮窗` / `本地 API`）；相应删除 `CodeOutlined` / `StarOutlined` / `AppstoreOutlined` 三个未再使用的 icon import；顶部加了注释说明 MCP/Skills/App Plugins 已迁到独立市场页，Context & Memory 由 Agent / 项目相关设置组承担，因此不在 Settings 里独立展示。
- **Settings 顶级 nav 二次重构**（用户明确 `api / 关于 / webhook / 实验性功能` 都要独立成一级）：
  - `src/renderer/src/lib/settingsNavigation.ts` `SETTINGS_NAVIGATION_GROUPS` 从 8 项增到 11 项，新增 `api-service` / `webhook` / `about` 三组，位置分别在 `keyboard` 之后、`advanced` 之前、`advanced` 之后。
  - `src/renderer/src/pages/Settings.tsx`：`getSettingsNavigationIcon` 加 `ApiOutlined` / `BellOutlined` / `InfoCircleOutlined` 三个 icon；`getSettingsNavigationContent` 加 `case "api-service"` / `case "webhook"` / `case "about"`，`ApiServiceSettings` / `WebhookSettings` / `AboutSection` 从 `advanced` 里搬出到各自独立 case；`advanced` case 内部改用 antd `<Tabs>` 平铺 4 个同级 tab（默认 `experimental`）：`实验性功能`→`FeatureFlagsSettings`、`快速操作`→`QuickActionsTab`、`系统信息`→`SystemInfoTab`、`性能监控`→`PerformanceMonitorTab`，删除已经不再嵌套的 `<DebugTools>` 包装；`Space` import 因 advanced case 简化而移除。
  - `src/renderer/src/components/settings/DebugTools.tsx`：把内部 `QuickActionsTab` / `SystemInfoTab` / `PerformanceMonitorTab` 三个组件由 `const` 改成 `export const`（不动 `DebugTools` 外层导出，保 BC）。
  - `handleNavigate` IPC handler：`tab=about` 现在 setActiveTab 到 `about`；`tab=debug` 仍然 setActiveTab 到 `advanced`。
  - i18n `src/renderer/src/i18n/locales/{en,zh}/settings.json`：`settingsNav` 块加 `apiService` / `webhook` / `about`；新增顶层 `advancedTabs` 块含 `experimental` / `quickActions` / `systemInfo` / `performance` / `debug` 五项 label；en 用 `API Service` / `Webhook` / `About` / `Experimental Features` / `Quick Actions` / `System Info` / `Performance` / `Debug Tools`，zh 用中文对照。
  - `src/renderer/src/lib/__tests__/settingsNavigation.test.ts` `REQUIRED_ORDER` 更新为 11 项；六个测试用例保持不变。
- **shared-types 恢复**（阻塞 `pnpm dev` 的实际 bug）：`packages/shared-types/src/index.ts` 之前被某轮 subagent 误删（`git status` 显示 "删除"），导致 4 个从 bare `@super-client/shared-types` 导入 `ResolvedAttachmentBlock` 等类型的文件在 `pnpm dev`（不带 `--noEmit` 的 `tsc -b`）下报 `TS2307: Cannot find module`。恢复了 `index.ts` 全量 re-export（新增 `agent-product-events` / `plan-execute` / `subagent`），并在 `packages/shared-types/package.json` `exports` 映射里补上 `./subagent` 和 `./agent-sdk` 子路径；清除 `packages/shared-types/tsconfig.tsbuildinfo` 等 stale build info 强制全量重编。之前 `tsc -b --noEmit` 一直绿是因为 buildinfo 缓存里还留着旧 index.ts 的编译元信息。
- **`.npmrc` 长期化 Electron mirror**：因为下载 Electron 二进制被 GitHub CDN 拒（TLS 握手失败），把 `electron_mirror=https://npmmirror.com/mirrors/electron/` 和 `electron_builder_binaries_mirror=https://registry.npmmirror.com/-/binary/electron-builder-binaries/` 写入 `.npmrc`（原本以为 npmmirror 没有 electron-builder-binaries 的 Note 已过时，实测 `https://registry.npmmirror.com/-/binary/electron-builder-binaries/` 目录列表可达 0.3.0-latest）；`engine-strict=true` 与 `only-built-dependencies` 原封保留。
- Focused verification：
  ```
  ./node_modules/.bin/vitest run src/renderer/src/lib/__tests__/settingsNavigation.test.ts
  ```
  6 tests / 1 file 全过。
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false` 通过。
- Touched-file lint：`./node_modules/.bin/oxlint src/renderer/src/lib/settingsNavigation.ts src/renderer/src/pages/Settings.tsx src/renderer/src/lib/__tests__/settingsNavigation.test.ts src/renderer/src/components/settings/AboutSection.tsx src/renderer/src/components/settings/DebugTools.tsx` 全部 0 warnings / 0 errors。
- `./node_modules/.bin/tsx scripts/i18n/check.ts`：通过。
- JSON syntax sanity：`node -e "JSON.parse(require('fs').readFileSync('src/renderer/src/i18n/locales/{en,zh}/settings.json','utf8'))"` 通过。
- Dev smoke：`pnpm dev` 成功拉起（renderer :5173 + Electron main + 249 IPC + 11 internal MCP + AgentRuntime registry + Remote WS :8088 + API :3000），未运行 `pnpm build` / `pnpm install` / 全量 `pnpm test:run`。

2026-07-02 Round 6/7：Phase 4 Multi-Agent MVP + Settings nav slim-down

- **Settings nav slim-down（用户指定）**：从 `SETTINGS_NAVIGATION_GROUPS` 移除 `context-memory` / `mcp` / `skills` / `app-plugins` 四项；剩下 `general / models / agent / tools-permissions / projects / project-recovery / keyboard / advanced` 八组。`Settings.tsx` 中对应 switch 分支与 icon 映射同步移除；`pluginSettingsContent` 因唯一消费点删除而清理（`pluginService` 与 `PluginConfigPanel` import 一并移除）；`standaloneSection` 保留供 `tools-permissions` 使用。External `tab=` URL 命中已废弃 key 时通过 `isSettingsNavigationKey()` 守卫回退到 `general`。MCP / Skills / App Plugins 仍走顶部导航的 `/mcp` `/skills` `/plugins` 独立市场页，API service 与 About 仍在 `advanced` 组内。文档 `docs/requirements-plan.md` §4 R8 + §5 Phase 2 acceptance 同步。
- **Phase 4 Multi-Agent MVP（用户按 A/A/A/A 选定）** —— 分 4 个 subagent 并行 / 串行落地：
  - **Impl-15 + 15b（foundation）**：
    - NEW `packages/shared-types/src/subagent.ts`：`SubagentTaskStatus`（spawned/running/completed/failed/cancelled）、`SubagentRunSummary`（parentRunId / subagentRunId / parentAssistantMessageId / profileId / profileName / taskGoal / status / startedAt / endedAt / tokenUsage / toolCallCount / errorMessage / summary / resultRef）。
    - `packages/shared-types/src/chat.ts` MessagePart union 加入 `SubagentMessagePart { type: "subagent"; run: SubagentRunSummary; collapsed?: boolean }`。
    - `packages/shared-types/src/agent-product-events.ts` 新增 4 类事件 `subagent.spawned` / `subagent.updated` / `subagent.completed` / `subagent.failed` + factories + `AgentProductEventBase.subagentRunId?` 传播字段；`projectAgentRuntimeEvent()` 保留 `subagentRunId`。
    - `packages/shared-types/src/agent-runtime.ts` 所有 stream event base 加可选 `parentRunId?` / `subagentRunId?`。
    - `packages/shared-types/src/project.ts` `tool_call` / `tool_result` / `tool_error` SessionEvent 加可选 `subagentRunId?`。
    - `src/main/services/agent/runtime/productEventMaterializer.ts` 每类 subagent 事件都物化成 `session_marker` + `assistant.part_*` 对，保证父 transcript 里 SubagentMessagePart 可回放；`tool.call/result/error` 在有 `subagentRunId` 时把它写到 SessionEvent。
    - `src/main/services/storage/jsonl.ts` 4 个 reducer 分支：`subagent.spawned` upsert 到父 assistant message 的 SubagentMessagePart（`id: "subagent_part_<subagentRunId>"`），`subagent.updated` patch `run`，`subagent.completed` 设 `status:"completed"` + summary/tokenUsage，`subagent.failed` 设 `status:"failed"` + errorMessage；`tool_call` 携带 `subagentRunId` 时不产生顶层 tool message，而是在 SubagentMessagePart 上 `run.toolCallCount++`；无匹配 spawned 时兜底回原路径。
    - `src/renderer/src/components/chat/parts/StreamPartRenderer.tsx` `referencedPartTitle` 补 `case "subagent"`（临时 fallback；主 switch 走 default JsonFallback 直到 Impl-17）。
    - Focused tests：agentProductEvents / productEventMaterializer / jsonl 各加一批。
  - **Impl-16（runtime）**：
    - NEW `src/main/services/agent/runtime/subagentPolicy.ts` pure classifier：默认 `planMode:"plan-then-ask"`、`approvalMode:"on-request"`、`inheritsGrants:false`；effectiveTools = `READ_ONLY_TOOL_NAMES ∪ profile.tools`（destructive 仍走 approval）；disallowedTools = destructive 减去 profile 允许项；audit reason 带 `subagent-policy:*` label。
    - NEW `src/main/services/agent/runtime/SubagentEventBridge.ts` `spawn()/update()/complete()/fail()` façade 走 product event factories → broker。
    - NEW `src/main/services/agent/runtime/subagentBridgeRegistry.ts` 模块级 `set/getSubagentEventBridge()` 用作 IPC broker 与 internal MCP Task tool 之间的 seam（避免改 `AgentRuntimeIpcBrokerDeps` 构造签名）。
    - `AgentRuntimeIpcBroker.ts` 加 `emitSubagentEvent(event, ctx)` 公共方法 + `emittedSubagentEventIds` 去重 Set。
    - `ClaudeCodeAgentRuntime.canUseTool()` 接受可选 `subagentPolicy`，subagent 场景下 hard-cap 拒绝比 planMode gate 先跑（audit tag `subagent-policy:canUseTool-deny`）；不存在 policy 时行为不变。
    - `mcp/internal/servers/agentBuiltinsServer.ts` Task tool 生成 `sub_<parentRequestId>_<uuid>`，在验证通过后 `bridge.spawn()`，成功回调 `bridge.complete()` 带 summary，异常 `bridge.fail()`。
    - `llm/toolExecutorFactory.ts` 注入 `_parentConversationId` 到 `@scp/agent-builtins` 上下文。
    - `ipc/handlers/agentRuntimeHandlers.ts` broker 单例构造时同步 `setSubagentEventBridge()`，dispose 时清空。
    - Focused tests：subagentPolicy（9 cases）、SubagentEventBridge（7 cases）、broker `emitSubagentEvent` 去重 + materialize、runtime `canUseTool` 三态。
  - **Impl-17（renderer card）**：NEW `src/renderer/src/components/chat/parts/SubagentPartCard.tsx` 折叠卡（默认 collapsed）：一行显示 profileName/taskGoal + status Tag（spawned/running=blue, completed=green, failed=red, cancelled=default）+ tool count + token 用量；点击/Enter/Space 切换 expanded，展开显示 taskGoal 全文、summary、errorMessage、endedAt。`data-part-id="subagent-card-<runId>"` 便于测试。`StreamPartRenderer.tsx` main switch 加 `case "subagent"`。9 个 focused test + 1 个 integration case。i18n `chat:subagent.card.*` 双语齐。
  - **Impl-18（inspector + badge）**：NEW `src/renderer/src/hooks/useSubagentsInspectorData.ts` 从当前 conversation 的所有 assistant messages 抽 SubagentMessagePart，按 startedAt desc 排序返回 `SubagentInspectorEntry[]`；NEW `src/renderer/src/components/chat/inspector/SubagentsInspectorSection.tsx` 右侧 inspector 加 Subagents 折叠段（在 context / branch 之后、sources 之前）；`ApprovalDecisionCard.tsx` + `ToolCallCard.tsx` 加可选 `subagentSource?: { profileName?, taskGoal?, subagentRunId }` prop，命中时上方渲染 muted Tag `From subagent: <name>`。i18n `chat:subagentsInspector.*` + `chat:subagentSource.badge` 双语齐。
- 已知遗留（follow-up，不阻塞 MVP）：
  - `Message.toolCall.subagentRunId` 的 renderer 端 threading 尚未完成——`ApprovalDecisionCard.subagentSource` prop 已就位，等下一批把 renderer 侧的推导逻辑接上。
  - `run.toolCallCount` 现在依赖 SubagentEventBridge 主动调 `update()` 才会递增；Task tool 目前只在 spawn/complete/fail 三个点发事件，未拦截递归 SSE 每帧的 `tool.call` 累加。SubagentMessagePart card 上仍会显示 count（若上游填了），但会偏低。
  - Nested-of-nested Task（sub-of-sub）会把事件写到子 session JSONL 而非顶层——仅 1 层被 MVP 覆盖。
- Focused verification（本轮 + 上轮全套，20 test 文件 / 246 tests）：
  ```
  ./node_modules/.bin/vitest run \
    src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts \
    src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts \
    src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts \
    src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.orphanResolve.test.ts \
    src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts \
    src/main/services/agent/runtime/__tests__/planModeToolGuard.test.ts \
    src/main/services/agent/runtime/__tests__/subagentPolicy.test.ts \
    src/main/services/agent/runtime/__tests__/SubagentEventBridge.test.ts \
    src/main/services/storage/__tests__/jsonl.test.ts \
    src/main/services/storage/__tests__/jsonl.approvalReplay.test.ts \
    src/main/services/storage/__tests__/SessionStorageService.test.ts \
    src/renderer/src/components/chat/parts/__tests__/SubagentPartCard.test.tsx \
    src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx \
    src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx \
    src/renderer/src/components/chat/__tests__/ApprovalDecisionCard.test.ts \
    src/renderer/src/components/chat/inspector/__tests__/SubagentsInspectorSection.test.tsx \
    src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx \
    src/renderer/src/hooks/__tests__/useSubagentsInspectorData.test.ts \
    src/renderer/src/hooks/__tests__/useContextInspectorData.test.ts \
    src/renderer/src/lib/__tests__/settingsNavigation.test.ts
  ```
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false` 通过；touched-file `./node_modules/.bin/oxlint` 0/0；`./node_modules/.bin/tsx scripts/i18n/check.ts` 通过。
- Not run：`pnpm build`、`pnpm install`、全量 `pnpm test:run`。

2026-07-02 loop rounds 3/4/5：send pipeline + Phase 1/2/3/5 collateral

- **Round 3（Phase 0b 收尾 + Phase 0a 微调）**
  - `useChat.ts` 从 1039 → 545 行（-494 / -47.5%，累计 -70%）。5 个新 helper 全部 renderer 侧：`useAgentSendPipeline`（含 `runtimeCreateFailureHandler` / `loadRuntimeToolsForRequest` / `resolveModelForRequest`）、`useSendMessage`（`deriveConversationName`/`createUserTurnPair`/`chooseSkillOrAgentPath` pure helper）、`useMessageRetry`、`useComposerSelectionState`、`useCurrentModelInfoRef`。全部有 focused test（合计 +48 tests）。留在 useChat 的是 `respondToApproval`/`upsertToolMessage`/`createAgentEventReducerContext`/`updateLastAssistantContent`/`editMessage` 等无从抽的 glue，rationale 已在 Impl-9 报告中列出。
  - `run.usage` product event 改为 `persist:false, transient:true`（`AgentResultEvent` 目前不携带 usage，暂不做 terminal snapshot）；materializer 对 `run.usage` 返回 `[]`；test 已调整。
  - 新增 `src/main/services/agent/memory/ProjectRulesReader.ts` + test：读取 project cwd 下 `AGENTS.md`/`CLAUDE.md`，SHA256/byteLength/truncated，128 KiB 上限，`realpath`+`isInside` 拦截 symlink 越界；MVP 未接入 Agent prompt 注入。
- **Round 4（Phase 1 Model + Phase 2 Composer pills）**
  - `ModelCapabilityEditor` 拉出 contextWindow / maxTokens / supportsStreaming / capabilities / category / systemPrompt 编辑；接入 `ModelConfigPanel` + `ModelManageModal`，通过 `useModelStore.updateModelConfig` 持久化，不新增 IPC。
  - `ChatModelPicker` 每条模型行加能力 chip（Vision / Reasoning / Tool / Web + `Ctx: 128K`），只显示模型实际支持的能力；`formatContextChipValue` pure helper。
  - Composer 三 pill 骨架（只读）：`ProjectPill`（项目名 + 短 cwd tail）、`LaunchModePill`（复用 `toAgentComposerMode()` 映射，仅 Plan / Execute，无 direct/chat）、`BranchPill`（有 branch 时展示，无时 muted "no branch"）；集成 `ChatComposerInfoBar`，`flex-wrap` 兼容窄屏；编辑态（worktree preflight / branch switch / launch mode edit）留待后续。
  - `modelService.fetchModels()` + `testConnection()` 已在服务层可用（未在本轮加新 UI）。i18n keys 双语齐。
- **Round 5（Phase 5 Remote IM + Phase 3 Context Inspector MVP）**
  - `RemoteSessionLifecycle.ts` 纯状态机：8 种状态（unbound / bound-idle / bound-active / bot-offline / archived / tombstoned / error-recoverable / error-fatal）× 2 方向 inbound/outbound 全 16 格转移矩阵覆盖测试；`RemoteChatBridge` 用 `computeRemoteLifecycle` + `resolveTransition` 消费，新增 `RemoteOutboundRejectedError` typed 出站拒绝（archived / tombstoned 分别带 `remote.archived` / `remote.tombstoned` code），bot-offline 仍走原 `RemoteBotOfflineError` 路径不变；不新增 IPC 通道。
  - `ContextInspectorSection` + `useContextInspectorData`：右侧 inspector 加 Context 折叠段；token budget 进度条读 `useContextUsage()`，未知时只显示文字；注入源 chip 显示 System prompt / 附件（从最新 user message metadata 解析 attachmentStore）/ Project rules（有项目 cwd 时占位 chip，未真读文件）；`metadata.contextCompacted` 支持消费但暂未有写入端；无内容时友好空态；完全只读，不触发 IPC。
- Focused verification（累计 41 个 test 文件 / 447 个测试）：
  ```
  ./node_modules/.bin/vitest run \
    src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts \
    src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts \
    src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts \
    src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.orphanResolve.test.ts \
    src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts \
    src/main/services/agent/runtime/__tests__/planModeToolGuard.test.ts \
    src/main/services/agent/memory/__tests__/ProjectRulesReader.test.ts \
    src/main/services/llm/__tests__/planModeGate.test.ts \
    src/main/services/storage/__tests__/jsonl.test.ts \
    src/main/services/storage/__tests__/jsonl.approvalReplay.test.ts \
    src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts \
    src/main/services/remote-chat/__tests__/RemoteSessionLifecycle.test.ts \
    src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunController.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunController.createFailure.test.ts \
    src/renderer/src/hooks/__tests__/useAssistantStreamBuffer.test.ts \
    src/renderer/src/hooks/__tests__/agentRunError.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunStopper.test.ts \
    src/renderer/src/hooks/__tests__/useAvailableToolsCatalog.test.ts \
    src/renderer/src/hooks/__tests__/useAgentEventDispatcher.test.ts \
    src/renderer/src/hooks/__tests__/useLegacyLLMStreamHandler.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRuntimeStreamHandler.test.ts \
    src/renderer/src/hooks/__tests__/useAgentSDKStreamHandler.test.ts \
    src/renderer/src/hooks/__tests__/useAgentSendPipeline.test.ts \
    src/renderer/src/hooks/__tests__/useSendMessage.test.ts \
    src/renderer/src/hooks/__tests__/useMessageRetry.test.ts \
    src/renderer/src/hooks/__tests__/useComposerSelectionState.test.ts \
    src/renderer/src/hooks/__tests__/useCurrentModelInfoRef.test.ts \
    src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts \
    src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts \
    src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts \
    src/renderer/src/hooks/__tests__/useContextInspectorData.test.ts \
    src/renderer/src/components/models/__tests__/ModelCapabilityEditor.test.tsx \
    src/renderer/src/components/chat/__tests__/ChatModelPicker.test.tsx \
    src/renderer/src/components/chat/composer/__tests__/LaunchModePill.test.tsx \
    src/renderer/src/components/chat/composer/__tests__/BranchPill.test.tsx \
    src/renderer/src/components/chat/composer/__tests__/ProjectPill.test.tsx \
    src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts \
    src/renderer/src/components/chat/inspector/__tests__/ContextInspectorSection.test.tsx
  ```
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false` 通过；touched-file `./node_modules/.bin/oxlint` 0/0；`./node_modules/.bin/tsx scripts/i18n/check.ts` 通过。
- 剩余风险 / 需要产品决策：更广 native structured `table/tree/sources/artifact` producer 和 delta batching；Phase 3 Context inspector 深水区的 memory 写入和专用摘要卡片；Artifact library 后续 actions 深化；Composer pill 编辑态（preflight 展示 / branch switch）；MCP/Skill 独立市场重设计；Recovery wizard 后续迁移包/zip/package 深化。
- Not run：`pnpm build`、`pnpm install`、全量 `pnpm test:run`。

2026-07-01 Phase 0b continuation：useChat 二次深度抽取 + 补 focused tests + ApprovalDecisionCard 清理

- **`useChat.ts` 累计从 1826 → 1039 行（-787 行 / -43%）**，本轮再抽 5 个 helper（Impl-6 抽 2，Impl-7 抽 3）：
  - Impl-6：`src/renderer/src/hooks/useAvailableToolsCatalog.ts` + test（8 cases）承接 builtin/MCP/skill tools 合并（MCP 失败非致命、按 prefixedName 去重、skill 切换取消旧 fetch）；`src/renderer/src/hooks/useAgentEventDispatcher.ts` + test（20 cases）承接 `applyAgentEventActions` 全部 action 变体（`remember_session` 分双 target 写 `sessions.updateMeta`；`persist_messages` 只在有焦点会话时写；`complete_request` 先 `clearCurrentRequest` 后 `clearWatchdog`）。useChat.ts 从 1704 → 1547 (-157)。
  - Impl-7：`src/renderer/src/hooks/useLegacyLLMStreamHandler.ts` + test（11 cases）承接 legacy stream，包含 requestId + reverse-channel 双 gate、`captureFileArtifactsFromToolResult` 调用、AskUserQuestion optimistic answer guard、`done` metadata 写回、`pauseForApproval` 分支；`useAgentRuntimeStreamHandler.ts` + test（4 cases）gated by `requestType==="runtime"`，走 `reduceAgentRuntimeStreamEvent`；`useAgentSDKStreamHandler.ts` + test（5 cases）gated by `requestType==="agent-sdk"`，走 `reduceAgentSDKStreamEvent`，保留 init/error 结构化日志。useChat.ts 从 1547 → 1039 (-508)。
- **补 focused tests（Impl-8）**：
  - `src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.orphanResolve.test.ts`：孤立 `permission.resolved`（无前置 `permission.request` context）不 crash，仍正常转发 sender+trace，storage 有/无都不抛。
  - `src/renderer/src/hooks/__tests__/useAgentRunController.createFailure.test.ts`：`materializeAgentRunCreateFailure()` 一次性在错误 bubble 上写 `providerErrorCode: agent_runtime_create_failed`，restore idle、clear stream/request/watchdog；不触碰任何 SDK createQuery mock；副作用顺序 error→status→stream→request→watchdog。
  - `src/main/services/storage/__tests__/jsonl.approvalReplay.test.ts`：`approval.requested`+`approval` replay 出稳定 resolved tool message；`ask.requested`+`ask.answered` replay 出 `approval.userAnswers`；孤立 `ask.answered` 也能兜底。
- **小清理（Impl-8）**：`src/renderer/src/components/chat/ApprovalDecisionCard.tsx` 未使用的 `maxWidth` 参数改为 `_maxWidth`（不能删除，`ToolCallCard`/`AskUserQuestionCard` 仍传入），oxlint warning 归零。
- Focused verification（主 agent 集成运行，累计 35 个测试文件）：
  ```
  ./node_modules/.bin/vitest run \
    src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts \
    src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts \
    src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts \
    src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.orphanResolve.test.ts \
    src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts \
    src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts \
    src/main/services/agent/runtime/__tests__/planModeToolGuard.test.ts \
    src/main/services/llm/__tests__/planModeGate.test.ts \
    src/main/services/storage/__tests__/jsonl.test.ts \
    src/main/services/storage/__tests__/jsonl.approvalReplay.test.ts \
    src/main/services/storage/__tests__/SessionStorageService.test.ts \
    src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunController.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunController.createFailure.test.ts \
    src/renderer/src/hooks/__tests__/useAssistantStreamBuffer.test.ts \
    src/renderer/src/hooks/__tests__/agentRunError.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunStopper.test.ts \
    src/renderer/src/hooks/__tests__/useAvailableToolsCatalog.test.ts \
    src/renderer/src/hooks/__tests__/useAgentEventDispatcher.test.ts \
    src/renderer/src/hooks/__tests__/useLegacyLLMStreamHandler.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRuntimeStreamHandler.test.ts \
    src/renderer/src/hooks/__tests__/useAgentSDKStreamHandler.test.ts \
    src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts \
    src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts \
    src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts \
    src/renderer/src/components/chat/__tests__/PlanCard.test.tsx \
    src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx \
    src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx \
    src/renderer/src/components/chat/__tests__/AskUserQuestionCard.test.ts \
    src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx \
    src/renderer/src/components/chat/__tests__/ToolCallCard.test.tsx \
    src/renderer/src/lib/__tests__/planExecute.test.ts \
    src/renderer/src/lib/__tests__/planEventPersistence.test.ts \
    src/renderer/src/lib/__tests__/planModePresentation.test.ts \
    src/renderer/src/lib/__tests__/planReplayView.test.ts
  ```
  通过：35 个测试文件 / 350 个测试（33 files/288 tests 主 batch + 2 files/62 tests 补充）。
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false` 通过。
- Touched-file lint：`./node_modules/.bin/oxlint <15 个 touched files>` 通过，**0 warnings / 0 errors**（`ApprovalDecisionCard.maxWidth` 之前的 warning 已消除）。
- `./node_modules/.bin/tsx scripts/i18n/check.ts`：通过。
- `git diff --check`：通过。
- 剩余风险：`useChat` 仍保留 send pipeline (`sendAgentMessage`/`sendSkillMessage`/`sendMessage`/`retryMessage`/`editMessage`) 和 `agentLog` module-scope logger、`materializeStreamError`/`updateLastAssistantContent`/`createAgentEventReducerContext`/`upsertToolMessage`（多路径共用，未强行下移）；native structured `code_block/diff/data/table/tree/sources/artifact` runtime producer 用户已确认本轮不做，只留 `unknown` 兜底；`run.usage` 每 tick 仍落盘（未纳入本轮），后续可评估改为 terminal-only。
- Not run：`pnpm build`、`pnpm install`、全量 `pnpm test:run`。

2026-07-01 Phase 0a/0b/0c consolidation batch：projection debug 兜底 / broker fast-skip / reducer plan+execute+rate_limit / Plan mode runtime enforcement / composer blocked keyboard+paused-error / PlanCard extras / replay status bubble / useChat helper split

- **Phase 0a 事件契约（Impl-1 + 主 agent）**：
  - `packages/shared-types/src/agent-product-events.ts` 新增 `AgentProductEventType = "unknown"` 变体和 `buildUnknownProductEvent()`；`projectAgentRuntimeEvent()` 加了运行时安全兜底，未识别的 runtime event 现在以 transient/persist:false 形式返回 debug summary，不再隐式 `undefined`，`materializeAgentProductEvent()` 对 `"unknown"` 直接返回 `[]`。
  - `src/main/services/agent/runtime/AgentRuntimeIpcBroker.ts` `persistRuntimeEvent()` 增加 fast-skip：`text.delta` / `reasoning.delta` / `status` 直接绕过 `projectAgentRuntimeEvent()` + materializer + `appendEvent()` 循环；`permission.request/resolved` 的 approval context 与 dedupe 未变，pump 到 sender + trace 的行为也未变。
  - `src/main/services/storage/jsonl.ts` reducer 新增分支：`plan.decision` marker 落到源 turn 的 PlanMessagePart（`pendingDecision:false`、`status:"decision-<action>"`、`decision` 附回）；`execute.turn.created` marker 在链接的 assistant/user message 上追加 `plan_exec_link_<planId>` 的 `Plan executed` status part；`run.rate_limit` 与 `run.completed/stopped/error` 一起纳入 terminal marker 家族，replay 为 `error` 状态的 status part，detail 含 "retry in Ns" 和上游 message。
- **Phase 0b `useChat` 抽取（Impl-5）**：
  - 新文件 `src/renderer/src/hooks/useAssistantStreamBuffer.ts`（rAF-batched 流式 buffer，sanitize 一致保留）、`src/renderer/src/hooks/agentRunError.ts`（pure `computeErrorRichness()` + `buildMergedErrorContext()` + `materializeStreamErrorPatch()`）、`src/renderer/src/hooks/useAgentRunStopper.ts`（承接 `stopCurrentStream` + `chat:stop-current-stream` window listener + 按 requestType dispatch interrupt）。
  - `src/renderer/src/hooks/useChat.ts` 从 1826 行 → 1704 行（-122 行 / -6.7%）；`streamContentRef`/`streamFlushRafRef`/`materializeStreamError`/`stopCurrentStream` 全部改为 helper 调用；公开返回签名和 rAF/`sanitizeAssistantContent`/stop 顺序/richness 保护/create-failure/one-shot override/requestId bail-gate 等 invariant 完整保留。
- **Phase 0c Plan/Execute UI + enforcement（Impl-2/3/4）**：
  - `src/main/services/agent/runtime/planModeToolGuard.ts` 新增：`READ_ONLY_TOOL_NAMES` allow-list（`Read/Grep/Glob/WebFetch/AskUserQuestion`，允许 `scp-agent-builtins__` 前缀），`isDestructiveTool()`、`planModeToPolicy()`、`evaluateToolAgainstPlanMode()`。
  - `src/main/services/llm/planModeGate.ts` 扩展到 `plan-then-ask`：过滤 `tools[]` + `toolMapping` 中的 destructive 工具但保留 `toolExecutor`；补 `plan-mode:<mode>` audit；`chat`/`auto-execute-safe`/`full-agent` 保持透传。
  - `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts` 加 `canUseTool(name, input, ctx)` 公共方法（拒绝时返回 `{approved:false, reason:"planMode:..."}` 并写 `agent-sdk` deny audit）；`buildChatRequest` 使用同一个 guard 从 `tools[]`+`toolMapping` 中剔除 destructive 项，输入是 `req.runtime.planMode`；`SessionRuntimeResolver` / broker 无需改动，`EffectiveSessionRuntime.planMode` 已在链路中。
  - `src/renderer/src/components/chat/PlanCard.tsx`：新增 `suggestedSubagents` 展示、`reason (optional)` 单行输入、`instructions (optional)` 多行输入（仅 execute/regenerate 显示），`buildPlanDecisionFromDrafts` 接收 `{reason, instructions}` 并写入 `PlanDecisionInput`；卡片根节点 tabIndex + `onKeyDown`：Enter/Cmd+Enter → execute（非输入焦点时），Esc → cancel，Shift+Enter no-op；step description textarea 不被劫持。
  - `src/renderer/src/components/chat/ApprovalDecisionCard.tsx` 加根节点键盘：Enter → allow once、Shift+Enter → deny、Esc → optional dismiss；`AskUserQuestionCard.tsx` 加 Enter → submit（全部必填已填时），Esc → optional cancel。
  - `src/renderer/src/components/chat/composerBlockedState.ts` 新增 `derivePausedErrorState()`；`ChatInputArea.tsx` 加 `paused-error` 分支：当最新 assistant 的 `metadata.errorContext.providerErrorCode` 命中 `agent_runtime_create_failed` 时用 inline recovery region（Recover / Dismiss + 结构化错误摘要）替换普通输入，Dismiss 关闭；不直接调用 stop/retry，只清 local 状态。
  - `src/renderer/src/lib/planReplayView.ts` + test：pure `describePlanDecisionSummary({action, sourcePlanId, sourcePlanVersion, executeTurnUserMessageId})` 返回 replay 摘要 `{label, detail?}`；`ChatMessageList.plan.test.tsx` 新增 replay 场景验证 plan 取消 + plan executed 的 status bubble。
  - i18n：`chat.json` en/zh 新增 `planCard.*`（title/steps/addStep/stepTitle/stepDescription/removeStep/expectedFiles/approvals/risks/suggestedSubagents/reasonLabel/reasonPlaceholder/instructionsLabel/instructionsPlaceholder/execute/cancel/regenerate）和 `composer.pausedError.*`（title/fallback/recover/dismiss）。
- **修正 stale 测试**：`productEventMaterializer.test.ts` 中 `expect(eventsToMessages(replayed)).toEqual([])` 已随 reducer 新分支更新为断言 `plan_exec_link_*` status part 的存在与 detail。
- Focused verification（主 agent 集成运行）：
  ```
  ./node_modules/.bin/vitest run \
    src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts \
    src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts \
    src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts \
    src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts \
    src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts \
    src/main/services/agent/runtime/__tests__/planModeToolGuard.test.ts \
    src/main/services/llm/__tests__/planModeGate.test.ts \
    src/main/services/storage/__tests__/jsonl.test.ts \
    src/main/services/storage/__tests__/SessionStorageService.test.ts \
    src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunController.test.ts \
    src/renderer/src/hooks/__tests__/useAssistantStreamBuffer.test.ts \
    src/renderer/src/hooks/__tests__/agentRunError.test.ts \
    src/renderer/src/hooks/__tests__/useAgentRunStopper.test.ts \
    src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts \
    src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts \
    src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts \
    src/renderer/src/components/chat/__tests__/PlanCard.test.tsx \
    src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx \
    src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx \
    src/renderer/src/components/chat/__tests__/AskUserQuestionCard.test.ts \
    src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx \
    src/renderer/src/lib/__tests__/planExecute.test.ts \
    src/renderer/src/lib/__tests__/planEventPersistence.test.ts \
    src/renderer/src/lib/__tests__/planModePresentation.test.ts \
    src/renderer/src/lib/__tests__/planReplayView.test.ts
  ```
  通过：26 个测试文件 / 292 个测试。
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false` 通过。
- Touched-file lint：`./node_modules/.bin/oxlint <32 个 touched files>` 通过，0 errors / 1 warning（pre-existing unused `maxWidth` 参数在 `ApprovalDecisionCard`，与本批无关）。
- `./node_modules/.bin/tsx scripts/i18n/check.ts`：通过。
- `git diff --check`：通过。
- 剩余风险：native structured `code_block/diff/data/table/tree/sources/artifact` runtime producer 未实现（用户已确认本轮不做，只留 unknown 兜底）；`useChat` 仍持有 send pipeline、event dispatcher、per-source stream handlers、消息 metadata patch 等 orchestration，本轮只抽了 3 个高 ROI helper；ApprovalDecisionCard `maxWidth` warning 未处理。
- Not run：`pnpm build`、`pnpm install`、全量 `pnpm test:run`。

2026-07-01 continuation batch：diagnostic export / recovery session export / MCP runtime tests

- Diagnostic export：新增最小 diagnostic export，写入 app-managed `exports/diagnostics/<timestamp>`，包含 `manifest.json` 和 redacted `diagnostic.json`；默认不复制 JSONL、attachments、tool payloads，不包含聊天正文，只导出元数据计数和 redacted summary；IPC 为无参数 `diagnostics.export()`，不接受 renderer output path。
- Settings Recovery session export：`RecoverySettings` 增加最小 session export 入口，从当前/可见/可恢复会话行调用 `sessionArchiveService.exportArchive(sessionId)`；成功显示 exportDir，失败显示结构化通用错误，不暴露 raw exception；不做 project archive UI 和物理 cleanup。
- MCP runtime regression：`McpService.runtimePolicy.test.ts` 补 `callTool()` focused regression，覆盖 stdio/builtin allow、stdio audit-only file read、stdio write deny、third-party network deny、third-party needs-approval 未授权 blocked / 授权后 allow；测试 mock Electron，避免 Electron binary 缺失影响 import。
- Focused verification：`./node_modules/.bin/vitest run src/main/services/diagnostics/__tests__/DiagnosticExportService.test.ts src/main/services/mcp/__tests__/McpService.runtimePolicy.test.ts`：通过，2 个测试文件 / 13 个测试。
- Focused verification：`./node_modules/.bin/vitest run src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx`：通过，1 个测试文件 / 3 个测试。
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false`：通过。
- Touched-file lint：`./node_modules/.bin/oxlint src/main/services/diagnostics/DiagnosticExportService.ts src/main/services/diagnostics/__tests__/DiagnosticExportService.test.ts src/main/ipc/handlers/diagnosticsHandlers.ts src/main/ipc/channels.ts src/main/ipc/index.ts src/preload/index.ts src/renderer/src/components/settings/RecoverySettings.tsx src/renderer/src/components/settings/__tests__/RecoverySettings.test.tsx src/renderer/src/i18n/locales/en/settings.json src/renderer/src/i18n/locales/zh/settings.json src/main/services/mcp/__tests__/McpService.runtimePolicy.test.ts`：通过，0 warnings / 0 errors。
- i18n：sandbox 下 `tsx` 临时 pipe 报 `EPERM`；提权后 `./node_modules/.bin/tsx scripts/i18n/check.ts` 通过。
- `git diff --check`：通过。
- Not run：未运行 `pnpm build` 或任何打包命令；未跑 full `pnpm test:run`。

2026-07-01 continuation batch：project archive / contentRef range / remote inactive receive

- Project archive：`SessionStorageService.exportProjectArchive(projectId)` 已提供 storage-only minimum，导出到 app-managed `exports/project-archives`；包含 manifest、`project.json`、`project-settings.json`、project session meta/jsonl copies；不复制用户 cwd、attachments 或 tool payload dirs，并且 manifest/project metadata 不包含 raw cwd。
- ContentRef range：`readContentRef(sessionId, contentRef, options?)` 支持 `{ offset, maxBytes }` range read，storage 使用 range read 避免全量读取；IPC DTO 返回 `offset` / `bytesRead` / `totalByteLength` / `truncated` / `nextOffset`；renderer service 默认请求 64 KiB preview，二进制仍只返回 metadata。
- Remote inactive receive：`RemoteChatBridge` incoming raw-message 在 broadcast/persist 前检查 session lifecycle；deleted/tombstoned、archived 或 missing session 会发出 `remote.inactive-received` event/log，并阻止普通 incoming message 落盘和广播。
- Focused verification：`./node_modules/.bin/vitest run src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/ipc/__tests__/sessionContentRef.test.ts`：通过，2 个测试文件 / 66 个测试。
- Focused verification：`./node_modules/.bin/vitest run src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts src/main/ipc/__tests__/register.test.ts`：通过，2 个测试文件 / 9 个测试。
- Focused verification：`./node_modules/.bin/vitest run src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/renderer/src/services/sessionArchiveService.test.ts src/main/ipc/__tests__/sessionArchiveApi.test.ts src/preload/__tests__/sessionArchiveBridge.test.ts`：通过，4 个测试文件 / 17 个测试。
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false`：通过。
- Touched-file lint：`./node_modules/.bin/oxlint src/main/services/storage/SessionStorageService.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/ipc/sessionContentRef.ts src/main/ipc/__tests__/sessionContentRef.test.ts src/main/services/remote-chat/RemoteChatBridge.ts src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts packages/shared-types/src/electron-api.ts src/main/ipc/api-impl.ts src/renderer/src/services/sessionContentRefService.ts src/renderer/src/components/chat/parts/StreamPartRenderer.tsx src/renderer/src/components/chat/ChatMessageList.tsx`：通过，0 warnings / 0 errors。
- Not run：未运行 `pnpm build` 或任何打包命令。一次误触发的 full `vitest run` 被中断；它暴露的是当前 `--ignore-scripts` 依赖恢复后的 Electron binary 缺失（`Electron failed to install correctly`）环境问题，不能作为本批逻辑回归信号。

2026-07-01 continuation batch：contentRef on-demand UI / session archive API / remote IPC structured error

- ContentRef UI：`StreamPartRenderer` 对 `contentRef` part 默认仍只展示轻量摘要，不自动读取正文；新增 `Load content / 加载内容` 按需加载按钮，通过 `sessionContentRefService.read(sessionId, contentRef)` 获取 text-like 内容。成功后组件 state 只保留 capped preview；binary/metadata-only 返回显示“不可预览”；失败显示结构化 fallback，不显示 raw exception。
- ContentRef session threading：`ChatMessageList` 将当前 `conversationId` 作为 `sessionId` 最小透传到 `StreamPartRenderer`，避免大改 message list 架构。
- Session archive API：`sessions.exportArchive(sessionId)` 已加入 shared/preload/renderer service，renderer 只传 sessionId，不接受 output path；main 只调用 `SessionStorageService.exportSessionArchive(sessionId)`，返回 app-managed `exportDir` / `manifestPath` / redacted manifest DTO。
- Remote IPC structured error：typed IPC wrapper 只对 `code === "remote.botOffline"` 的错误透传 `{ success:false, error, code, details }`，普通错误保持原 envelope；`remoteChat.sendMessage()` renderer 类型可读取 `code/details`。
- Focused verification：`./node_modules/.bin/vitest run src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx`：通过，2 个测试文件 / 16 个测试。
- Focused verification：`./node_modules/.bin/vitest run src/main/ipc/__tests__/sessionArchiveApi.test.ts src/preload/__tests__/sessionArchiveBridge.test.ts src/renderer/src/services/sessionArchiveService.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts`：通过，4 个测试文件 / 61 个测试。
- Focused verification：`./node_modules/.bin/vitest run src/main/ipc/__tests__/register.test.ts src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts`：通过，2 个测试文件 / 6 个测试。
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false`：通过。
- Touched-file lint：`./node_modules/.bin/oxlint src/renderer/src/components/chat/parts/StreamPartRenderer.tsx src/renderer/src/components/chat/ChatMessageList.tsx src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/main/ipc/register.ts src/main/ipc/__tests__/register.test.ts src/main/ipc/__tests__/sessionArchiveApi.test.ts src/preload/__tests__/sessionArchiveBridge.test.ts src/renderer/src/services/sessionArchiveService.ts src/renderer/src/services/sessionArchiveService.test.ts packages/shared-types/src/electron-api.ts src/main/ipc/api-impl.ts src/preload/index.ts src/renderer/src/types/electron.d.ts`：通过，0 warnings / 0 errors。
- i18n：sandbox 下 `tsx` 临时 pipe 报 `EPERM`；提权后 `./node_modules/.bin/tsx scripts/i18n/check.ts` 通过。
- `git diff --check`：通过。
- Not run：未运行 `pnpm build` 或任何打包命令；未跑 full `pnpm test:run`。

2026-07-01 continuation batch：contentRef IPC / session archive foundation / remote bot-offline

- Dependency recovery：上一条记录中的 `node_modules` 恢复阻断已被后续恢复覆盖；`corepack pnpm@10.24.0 install --ignore-scripts --config.confirmModulesPurge=false --frozen-lockfile` 已成功完成，未运行 postinstall、`pnpm build` 或任何打包命令。
- ContentRef IPC：新增 `sessions.readContentRef(sessionId, contentRef)` typed IPC/preload/renderer helper 路径；读取仍由 `SessionStorageService.readContentRef()` 校验 session-relative ref，renderer 只收到 `{ contentRef, byteLength, mediaType?, source?, text? }`，不暴露路径、Buffer、sha256 或任意字节。二进制 payload 只返回 metadata；text-like UTF-8 payload 返回 text。
- Session archive foundation：`SessionStorageService.exportSessionArchive()` 已可导出 app-managed directory archive，包含 `manifest.json`、session meta、JSONL copy；manifest 记录 schemaVersion、createdAt、sessionId、projectId、redactionMode、file list，并列出 attachments/contentRefs 为 `referencedPayloads.copied=false`，不复制项目 cwd 或 payload 目录。
- Remote bot-offline：`RemoteChatBridge.sendMessage()` 对 bound 但 bot 不在线/运行实例缺失的会话发出 `remote.bot-offline` event/log，并抛出 `RemoteBotOfflineError`，包含稳定 `code: "remote.botOffline"` 和 `{ conversationId, botId, chatId, platform }` details；成功发送和 duplicate drop 行为保持不变。
- Focused verification：`./node_modules/.bin/vitest run src/main/ipc/__tests__/sessionContentRef.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts`：通过，2 个测试文件 / 61 个测试。
- Focused verification：`./node_modules/.bin/vitest run src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts`：通过，1 个测试文件 / 4 个测试。
- Integration verification：`./node_modules/.bin/tsc -b --noEmit --pretty false`：通过。
- Touched-file lint：`./node_modules/.bin/oxlint src/main/ipc/sessionContentRef.ts src/main/ipc/__tests__/sessionContentRef.test.ts src/main/services/storage/SessionStorageService.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/remote-chat/RemoteChatBridge.ts src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts packages/shared-types/src/electron-api.ts src/main/ipc/api-impl.ts src/preload/index.ts src/renderer/src/types/electron.d.ts src/renderer/src/services/sessionContentRefService.ts`：通过，0 warnings / 0 errors。
- Not run：未运行 `pnpm build` 或任何打包命令；未跑 full `pnpm test:run`，本批只做 focused tests 和类型/lint 集成检查。

2026-07-01 continuation batch：producer wiring / trace privacy / remote delete ordering

- Large content producer：`appendEvent()` 对超过 64 KiB 的 `assistant.part_start` / `assistant.part_update` payload 做 storage-side externalization，覆盖 text/code content、tool input/output、data value、artifact preview；JSONL 只保留 `contentRef` / `byteLength` / `truncated` 和轻量占位。`tool_result` replay payload 暂保持 inline，避免改变旧 tool message reducer 行为。
- AgentTrace privacy：Agent trace redaction 已接入 shared `privacy/redaction` helper；loose/strict 模式会脱敏 home/app-data path、URL query secrets、remote ids 和 nested diagnostics；`off` 仍保持原样。bootstrap 会把 Electron `home` / `userData` 传入 collector。
- Remote delete ordering：remote-bound conversation delete 先调用 session delete/tombstone，再做 remote unbind；这样 storage tombstone 仍能看到 `meta.remote` 并保留 remote binding。`useSessionListStore.delete()` 改为返回 boolean，供 chatStore 判断是否继续 unbind。
- Subagent-reported tests：对应 worker 报告已分别跑过 storage / trace / chat store focused tests；主 agent 未能复验，因为 worker 的 pnpm 尝试清空了 `node_modules`，sandbox 恢复依赖因 registry DNS `ENOTFOUND` 失败，提权恢复又被自动审批拒绝（Codex usage limit）。
- Main-agent verification completed：`git diff --check` 通过。
- Main-agent verification blocked：`vitest` / `tsc` / `oxlint` 当前不可运行，原因是 `node_modules/.bin` 不存在且依赖恢复被阻断。未运行 `pnpm build` 或任何打包命令。

2026-06-30 continuation batch：contentRef storage / remote duplicate drop / privacy redaction

- Large content storage：`SessionStorageService.writeContentRef()` / `readContentRef()` 已新增 storage-local API，大 payload 写入 per-session `tool-outputs/content-refs/`，返回 hash-based `session-content://v1/...` ref；project session 仍写 app userData，不触碰项目 cwd `.scr-data`；fork 后 refs 仍可读；deleted session 拒绝新写入。
- Remote lifecycle：`RemoteChatBridge` 对 incoming IM 使用平台 message id 生成稳定 `in_<id>`；重复 remote message id 在广播和落盘前 drop，并发出 `remote.duplicate-dropped` event/log。当前仅覆盖 duplicate replay，不等同于 tombstone/archive/bot-offline 完整状态机。
- Privacy/export：新增 `privacy/redaction` helper，覆盖 home path、app userData path、URL query secret、headers/secrets、remote id 和 nested diagnostic value redaction；`data-privacy-export-plan` 的 redactor test gap 已关闭。现有 trace/log/exporter 尚未接入。
- Focused verification：`./node_modules/.bin/vitest run src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts src/main/services/privacy/__tests__/redaction.test.ts`：通过，3 个测试文件 / 60 个测试。
- `./node_modules/.bin/tsc -b --noEmit --pretty false`：通过。
- `./node_modules/.bin/oxlint src/main/services/storage/SessionStorageService.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/remote-chat/RemoteChatBridge.ts src/main/services/remote-chat/__tests__/RemoteChatBridge.test.ts src/main/services/privacy/redaction.ts src/main/services/privacy/__tests__/redaction.test.ts`：通过，0 warnings / 0 errors。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 continuation batch：Project Recovery / contentRef / run recovery

- Settings recovery：新增 `Project Recovery` 分组和 `RecoverySettings` 最小入口，覆盖 archived projects、orphan restore、legacy import、tombstone/relink/backup 当前覆盖状态；不暴露物理删除，不新增 `/extensions`，MCP/Skills/Plugins 仍保持独立入口。
- Large content：`BaseMessagePart` 新增可选 `contentRef` / `byteLength` / `truncated`；`StreamPartRenderer` 对带 `contentRef` 的 text/tool/data/artifact 等 part 走引用摘要视图，显示 ref、size、truncated 状态，不挂载正文/结果/preview，也不注入 HTML。
- Run recovery：`useAgentRunController` 新增 `snapshotAndClearAgentRunRequest()`，stop snapshot 保留 runtime request type；`pauseForApproval()` 修正为清旧 watchdog 后保持 awaiting 状态；`useAgentEventReducer` terminal cleanup 在上下文已 `idle` 时避免重复发状态清理 action。
- Focused verification：`node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useAgentRunController.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/renderer/src/lib/__tests__/settingsNavigation.test.ts`：通过，4 个测试文件 / 44 个测试。
- `node_modules/.bin/tsc -b --noEmit --pretty false`：通过。
- `node_modules/.bin/oxlint packages/shared-types/src/chat.ts src/renderer/src/hooks/useAgentRunController.ts src/renderer/src/hooks/__tests__/useAgentRunController.test.ts src/renderer/src/hooks/useAgentEventReducer.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/components/chat/parts/StreamPartRenderer.tsx src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/renderer/src/pages/Settings.tsx src/renderer/src/components/settings/RecoverySettings.tsx src/renderer/src/lib/settingsNavigation.ts src/renderer/src/lib/__tests__/settingsNavigation.test.ts`：通过，0 warnings / 0 errors。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Phase 1/2/3 current completion sync：

- Phase 1 模型选择：输入框 model pill 支持本次 one-shot 选择，发送后清理；model picker 支持设为会话默认；消息/会话 metadata 已带 `source` / `sourceLabel`，用于展示生效模型来源。
- Phase 2 Settings/Shell：Settings 已按分组拆分并与 URL tab 同步；当前用户路由无 `/extensions` 聚合入口；MCP、Skills、Plugins 保持独立入口；相关 shell/menu 文案按 Agent-only 口径收口。
- Phase 3 结构化输出/性能：大 tool result 折叠态使用 capped preview，不再在折叠态全量 stringify；`StreamPartRenderer` 已有 typed `tool` part summary；500 user/assistant turns + 多代码块虚拟列表测试覆盖只挂载可见 rows。
- 验证口径：`node_modules/.bin/tsc -b --noEmit` 通过；focused/targeted Vitest 累计 225+ 测试通过；`node_modules/.bin/oxlint .` 为 0 errors，但保留既有 warnings；`node_modules/.bin/tsx scripts/i18n/check.ts` 在 sandbox 下需要提权，提权后通过。
- 本 worker 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Phase 3 Structured Output/Performance Evidence worker：

- `ToolCallCard` 折叠态 large result 预览改为 capped summary：plain stdout 不再先尝试 JSON parse，折叠 tooltip/inline preview 不再 `JSON.stringify()` 全量输出；展开后仍按需挂载 `JsonView`。
- `StreamPartRenderer` 补 `tool` typed part 专用摘要渲染，避免 tool result part 落入 raw JSON fallback；大字符串输出只展示 bounded preview。
- 补 500 user/assistant turns + 多代码块虚拟化证据：`ChatMessageList.plan.test.tsx` 的 `react-window` mock 只挂载 12 个可见 row，验证 1000 bubble rows 中隐藏代码块不进入 DOM。
- Focused tests：`node_modules/.bin/vitest run src/renderer/src/components/chat/__tests__/ChatMessageList.test.ts src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/renderer/src/components/chat/__tests__/messagePartsAdapter.test.ts src/renderer/src/components/chat/__tests__/ToolCallCard.test.tsx`：通过，5 个测试文件 / 17 个测试。
- Plan/renderer adjacent focused tests：`node_modules/.bin/vitest run src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planEventPersistence.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，5 个测试文件 / 19 个测试。
- `node_modules/.bin/oxlint src/renderer/src/components/chat/ToolCallCard.tsx src/renderer/src/components/chat/parts/StreamPartRenderer.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/renderer/src/components/chat/__tests__/ToolCallCard.test.tsx`：通过，0 warnings / 0 errors。
- `node_modules/.bin/tsc -p tsconfig.web.json --noEmit --pretty false`：该 worker 曾遇到并行改动中的 out-of-scope 类型错误；后续最终整合验证已由 `node_modules/.bin/tsc -b --noEmit` 通过覆盖。
- 未运行 `pnpm build` 或任何打包命令。
- 剩余风险：typed `contentRef` / 分页加载契约尚未进入 shared `MessagePart` 类型；renderer 仍会持有已经进入 message state 的大 tool result/artifact 原值，本批只保证折叠态不全量渲染、不挂载隐藏 rows。

2026-06-30 主 agent 最终整合验证：

- Runtime create failure 已按最终口径收口：默认不再 fallback 到 Agent SDK，失败会 materialize structured error 并清理 request/watchdog。
- JSONL replay 已覆盖 approval resolved、ask answered、tool terminal states、run terminal status、plan parts、Plan decision marker 和 execute turn marker。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/storage/__tests__/messageConverter.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeClient.test.ts src/renderer/src/hooks/__tests__/useAgentRunController.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planEventPersistence.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，21 个测试文件 / 203 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，37 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：提升权限后通过。
- `git diff --check`：通过。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Runtime Fallback Removal worker：

- `useChat` runtime create failure 失败路径已移除默认 Agent SDK fallback 和 SDK intent 预检；失败会在当前 assistant 占位消息上 materialize structured error，设置 `providerErrorCode: "agent_runtime_create_failed"`，恢复 `idle`，清理 current request 和 watchdog。
- `useAgentRunController` 新增 `materializeAgentRunCreateFailure()` helper，并以 focused test 固化 create failure 收尾顺序。
- `node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useAgentRunController.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeClient.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts`：通过，7 个测试文件 / 55 个测试。
- `node_modules/.bin/tsc -p tsconfig.web.json --noEmit --pretty false`：通过。
- 本批未运行 `pnpm build`。

2026-06-30 第二批 subagent 收口验证：

- Plan/Product Event worker 完成正式 `plan.decision` / `execute.turn.created` product event 契约、factory 和 JSONL materializer；事件以 `session_marker` 保留 source plan、decision、execute link、turn/message ids。
- Renderer Replay worker 修复 `eventsToMessages()`：`approval.requested` / `ask.requested` 的 `session_marker` 会 replay 成 tool message，并由 `approval` / `ask.answered` 收尾为 success/error；Plan part decision replay 已有 focused test。
- Runtime Fallback worker 补齐 runtime `init` 的 `nativeSessionId` metadata，和 SDK init 保持一致；同时确认 SDK fallback 只适合作为迁移期兜底，最终应收口为结构化 runtime error 或显式 compat flag。
- 主 agent 随后补齐 renderer 调用点：`Chat.tsx` 的 Plan `cancel` / `execute` / `regenerate` decision 会经 `createPlanDecisionSessionEvents()` 追加 `plan.decision` JSONL marker；execute 会额外追加 `execute.turn.created` marker。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/storage/__tests__/messageConverter.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeClient.test.ts src/renderer/src/hooks/__tests__/useAgentRunController.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planEventPersistence.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，21 个测试文件 / 199 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，37 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：提升权限后通过。
- `git diff --check`：通过。
- 后续 run terminal replay worker 已补 `run.completed` / `run.stopped` / `run.error` renderer-visible status part。SDK fallback projection/replay 项已由本批最终口径 supersede：runtime create failure 不再默认 fallback 到 SDK。

2026-06-30 主 agent + subagent 收口验证：

- Runtime contract worker 完成 `ask.requested` / `ask.answered` product event：`permission.request` 的 `toolName` 会由 broker 记录，用户 `resolvePermission()` 时补回 `permission.resolved.toolName`，避免 `AskUserQuestion` answer 被落成普通 approval；`text.delta` / `reasoning.delta` 仍保持 transient，不写 JSONL。
- Renderer worker 完成 Plan/列表稳定性修补：`ChatMessageList` 的 older-message handler 不再位于 loading early return 之后，降低 hooks 顺序和 update-depth 风险；`PlanCard` 在 plan id/version/source turn 改变时重置 editable draft，避免 regenerate 后显示旧步骤。
- 主 agent 恢复 pnpm workspace symlink 后验证：`corepack pnpm@10.24.0 install --ignore-scripts` 通过；未运行 postinstall、`pnpm build` 或任何打包命令。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/agent/runtime/__tests__/ClaudeCodeAgentRuntime.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeClient.test.ts src/renderer/src/hooks/__tests__/useAgentRunController.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，19 个测试文件 / 178 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，37 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：提升权限后通过；sandbox 下 `tsx` 临时 IPC pipe 会被拦截。
- `git diff --check`：通过。
- `corepack pnpm@10.24.0 dev`：提升权限后 dev smoke 通过到 renderer dev server `http://localhost:5173/`、Electron app start、main window created、API server、AgentRuntime registry、IPC 和 internal MCP 初始化。为满足 dev 环境，主 agent 补跑了 `node node_modules/electron/install.js` 和 `corepack pnpm@10.24.0 exec electron-builder install-app-deps`，仅安装/重建 Electron 与 native dev dependency，未运行 `pnpm build` 或打包。
- codebase-memory MCP：`query_graph` 能连接并提示项目名为 `Users-mark-myself-code-super-client-r`，但当前图谱查询不到 `AgentRuntimeIpcBroker` / `PlanCard` / `useChat` 等 TS/TSX 符号；本批以本地代码检查和 focused tests 作为最终证据。

2026-06-30 docs worker 状态同步：

- `git status --short`：当前工作区包含文档和代码并行改动；本 worker 只更新文档，不回滚或改动实现代码。
- codebase-memory MCP 可用：`list_projects` 返回 `Users-mark-myself-code-super-client-r`，`index_status` 为 ready；`search_graph` 确认 `useAgentRunController()`、`agentRuntimeClient.createQuery()`、`projectAgentRuntimeEvent()`、`materializeAgentProductEvent()` 已在当前索引中。
- 当时 diff 显示 runtime-first 发送路径已经进入 `useChat.ts`：先调用 `agentRuntimeClient.createQuery()` 并用 `agentRuntimeClient.interrupt()` 停止 runtime 请求；runtime 创建失败时仍走 `agentSDKClient.createQuery()` fallback。该 fallback 已由本批移除；`agentRuntimeStreamAdapter` 作为 `useAgentEventReducer` 的薄包装，避免第二套 runtime event reducer。
- 当前 diff 显示 Phase 0b 已新增 `useAgentRunController.ts` 和测试；该 controller 承接 request id、request type、runtime/native session id、approval pause、watchdog、interrupt snapshot 等生命周期状态。
- 当前 diff 显示 Plan/Execute shared contract 已进入 shared package：`PlanMessagePart`、`PlanDecisionRecord`、`PlanExecuteTurnLink`、`PlanCard`、`createExecuteTurnPrompt()`、`createPlanExecuteTurnLink()`；`Chat.tsx` 会把 execute/regenerate 决策转成新的 Agent turn，并把 plan decision/link 写入本地 message metadata。正式 product event / JSONL replay 语义仍待主 agent 确认。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/hooks/__tests__/useAgentRunController.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，17 个测试文件 / 164 个测试。
- `git diff --check`：通过。
- `node_modules/.bin/oxlint docs/refactor-progress.md docs/refactor-plan.md docs/design-doc.md docs/requirements-plan.md`：0 warnings / 0 errors；该命令没有匹配 JS/TS 源文件，仅作为轻量命令记录。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：未进入脚本，sandbox 下 `tsx` 创建临时 IPC pipe 失败：`listen EPERM .../T/tsx-501/84788.pipe`。需要主 agent 在允许提权的上下文中重跑。
- 本 worker 未运行 `pnpm build`，也未运行会更新 `tsconfig.tsbuildinfo` 的类型构建命令。

2026-06-30 Subagent A/B/C 收口 + 主 agent wiring：

- `useChat` 的 Agent SDK live handler 已把 `init`、`chunk`、`assistant_part`、`assistant`、tool、permission、`result`、`error`、`rate_limit`、`status` 分支接到 `reduceAgentSDKStreamEvent()` + `applyAgentEventActions()`；`assistant` snapshot 和 `result.text` 已恢复 `sanitizeAssistantContent().trim()`，避免 `<|eom|>` / 裸 `tool_call` 文本进入最终消息。
- `PlanCard` 已接入 `ChatMessageList` structured parts 渲染；`ChatInputArea` 会在 pending plan decision 时隐藏普通 composer 并展示 PlanCard。
- `Chat.tsx` 已补最小 production wiring：Plan `execute` / `regenerate` 决策会先关闭本地 pending plan part，再通过现有 `sendMessage()` 创建新的 Agent turn；`cancel` 关闭阻塞态但不发起新 run。该路径仍是兼容接线，正式 `plan.decision` / `execute.turn.created` product event 仍待 Phase 0c 后续补齐。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/components/chat/__tests__/ChatMessageList.plan.test.tsx src/renderer/src/components/chat/__tests__/ChatInputArea.plan.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，16 个测试文件 / 156 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，38 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：sandbox 下因 tsx 临时 IPC pipe `EPERM` 未进入脚本；提升权限重跑通过。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Subagent C 验证矩阵与文档同步：

- Subagent C 报告 codebase-memory MCP 在其运行上下文可用：`list_projects` 返回 `Users-mark-myself-code-super-client-r`，并用 `search_graph` / `get_code_snippet` 复核了 `projectAgentRuntimeEvent()`、`materializeAgentProductEvent()`、`AgentRuntimeIpcBroker.persistRuntimeEvent()`、`persistPermissionResolved()`、`reduceAgentSDKStreamEvent()`、`reduceAgentRuntimeStreamEvent()`、`PlanCard` 和 Plan/Execute shared contract。主 agent 本轮重试 MCP 仍遇到 `Transport closed`，最终以本地检查和测试为准。
- Phase 0a checklist：runtime product event projection + main process JSONL 写入已接入 `AgentRuntimeIpcBroker.persistRuntimeEvent()`；approval closed-loop 已由 `persistPermissionResolved()` 写 trace/product/session audit，并按 `requestId + approvalId` 去重。后续已补 unknown/debug summary 与 native code/json/diff producer；剩余为 delta batching、更广 typed producer 和 renderer replay 展示细节。
- Phase 0b checklist（当时状态）：`useMessageModelResolution()`、`usePromptContextBuilder()`、`useToolApprovalFlow()`、`useAgentEventReducer()` 已存在并有 focused tests；`useChat` 把 SDK `assistant`、tool、permission、`result`、`error`、`rate_limit`、`status` 分支交给 reducer action。当时剩余为抽 `useAgentRunController` 并把发送入口迁到 `agentRuntimeClient`；后续 docs worker 复核确认这两项已部分落地，见本节最上方记录。
- Phase 0c checklist：Plan/Execute shared types、execute turn prompt helper、`PlanCard` 基础组件、聊天流展示和 composer blocked decision 基础路径已存在并通过测试；剩余为正式 plan decision product event、replay event 和 execute turn 持久化语义。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，14 个测试文件 / 145 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，38 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：未进入脚本，sandbox 下 `tsx` 创建临时 IPC pipe 失败：`listen EPERM .../T/tsx-501/87955.pipe`。按本批约束未提升权限重跑。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 retry/subagent 收口验证记录：

- codebase-memory MCP 重试失败：`list_projects` 返回 `Transport closed`；该批次改用本地代码检查继续推进。后续 Subagent C 复核时 MCP 已恢复可用。
- `useChat` 的 Agent SDK live handler 已把 `assistant`、`tool_call`、`tool_use_summary`、`tool_error`、`permission_request`、`permission_denied`、`result`、`error`、`rate_limit`、`status` 分支接到 `reduceAgentSDKStreamEvent()` + `applyAgentEventActions()`；该条记录生成时发送入口仍保持 `agentSDKClient.createQuery()`。后续 docs worker 复核确认当时代码已改为 runtime-first 并保留 SDK fallback；该 fallback 已由本批移除。
- `agentRuntimeStreamAdapter` 已保留为 runtime client 迁移入口，但实现改为薄包装 `reduceAgentRuntimeStreamEvent()`，避免和 `useAgentEventReducer` 产生第二套 runtime event 映射。
- `PlanCard` 基础组件已新增：支持展示 plan goal/summary/steps/metadata，编辑/新增/删除步骤，并输出 `execute` / `cancel` / `regenerate` decision payload；后续已接入聊天流和 composer blocked 区，execute/regenerate 暂走现有 send path。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/services/agent/__tests__/agentRuntimeStreamAdapter.test.ts src/renderer/src/components/chat/__tests__/PlanCard.test.tsx src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，14 个测试文件 / 145 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，38 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：sandbox 下因 tsx 临时 IPC pipe `EPERM` 未进入脚本；提升权限重跑通过。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Subagent 执行批次验证记录：

- Subagent 批次完成并由主 agent 集成：`useToolApprovalFlow` helper 已接回 `useChat.respondToApproval()`；`productEventMaterializer` pure helper 已补 approval requested audit 语义；Plan/Execute shared package export 已补齐。
- `corepack pnpm@10.24.0 install --ignore-scripts --config.confirmModulesPurge=false --frozen-lockfile`：通过，用仓库声明的 pnpm 版本恢复依赖；未修改 lockfile，未运行 postinstall。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，7 个测试文件 / 33 个测试。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/main/services/llm/__tests__/planModeGate.test.ts src/renderer/src/components/chat/__tests__/AskUserQuestionCard.test.ts src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts`：通过，7 个测试文件 / 89 个测试。
- `node_modules/.bin/vitest run src/renderer/src/lib/__tests__/planExecute.test.ts`：修复 execute context `steps` 兜底后重跑通过，1 个测试文件 / 4 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，38 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：sandbox 下因 tsx 临时 IPC pipe `EPERM` 未进入脚本；提升权限重跑通过。
- `node_modules/.bin/vitest run`：未通过，阻塞于依赖环境而非本批逻辑；`--ignore-scripts` 恢复依赖后 Electron 二进制缺失，import `electron` 的 12 个测试文件报 `Electron failed to install correctly`，其余 52 个测试文件 / 434 个测试通过。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Phase 0a runtime wiring 验证记录：

- `AgentRuntimeIpcBroker` 已接入 product event projection + materializer；可持久化 runtime events 会通过 main process `SessionStorageService.appendEvent()` 写入 JSONL，`text.delta` 等 transient event 不落盘。
- `resolvePermission()` 已补用户审批闭环：用户决策会生成 `permission.resolved` trace/product/session audit；如果 runtime 后续也发 `permission.resolved`，broker 会按 `requestId + approvalId` 去重，避免重复 JSONL approval。
- `agentRuntimeHandlers` 创建 broker 时注入 `getSessionStorage()`；session resolver 传递 `projectId` 给 projection context。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts`：通过，1 个测试文件 / 10 个测试。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，11 个测试文件 / 118 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，38 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：sandbox 下因 tsx 临时 IPC pipe `EPERM` 未进入脚本；提升权限重跑通过。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Phase 0b reducer helper 验证记录：

- `useAgentEventReducer` 已新增为纯 reducer/helper，统一把 Agent SDK stream events 和 AgentRuntime stream events 转成 message/tool/approval action 列表；本批次只做可测试 helper 和 `AskUserQuestion` 名称判断复用，没有把 `useChat` 发送入口切到 `agentRuntimeClient`。
- `corepack pnpm@10.24.0 install --ignore-scripts --config.confirmModulesPurge=false --frozen-lockfile`：通过，用仓库声明的 pnpm 版本恢复依赖；裸 `pnpm` 仍会因 pnpm 11 不读取 `package.json.pnpm.packageExtensions` 而触发 lockfile config mismatch。
- `node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts`：通过，2 个测试文件 / 16 个测试。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/main/services/agent/runtime/__tests__/productEventMaterializer.test.ts src/main/services/agent/runtime/__tests__/AgentRuntimeIpcBroker.test.ts src/main/services/agent/runtime/__tests__/streamEventTranslator.test.ts src/main/services/storage/__tests__/jsonl.test.ts src/main/services/storage/__tests__/SessionStorageService.test.ts src/renderer/src/hooks/__tests__/useAgentEventReducer.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useToolApprovalFlow.test.ts src/renderer/src/lib/__tests__/planExecute.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，12 个测试文件 / 128 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，38 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：sandbox 下因 tsx 临时 IPC pipe `EPERM` 未进入脚本；提升权限重跑通过。
- 未运行 `pnpm build` 或任何打包命令。

2026-06-30 Phase 0b 验证记录：

- `usePromptContextBuilder()` 已从 `useChat` 抽出 cwd/env、MCP server、system prompt、skill context、team agents、attachment/search prompt 组装；该条记录生成时 `useChat` 发送路径还是同一 `createQuery` 参数结构，后续已推进到 runtime-first。
- `node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts`：通过，2 个测试文件 / 9 个测试。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts src/renderer/src/hooks/__tests__/usePromptContextBuilder.test.ts src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，4 个测试文件 / 18 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，39 个 warning / 0 个 error；warning 为既有 cleanup 项。

2026-06-29 Phase 0a/0b/0c 验证记录：

- Subagent A/B/C/D 已完成只读代码盘点：事件契约、`useChat` 拆分、Plan/Execute、测试计划均未修改文件。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts`：通过，1 个测试文件 / 6 个测试。
- `node_modules/.bin/vitest run src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts`：通过，1 个测试文件 / 5 个测试。
- `node_modules/.bin/vitest run src/renderer/src/lib/__tests__/planModePresentation.test.ts`：通过，1 个测试文件 / 3 个测试。
- `node_modules/.bin/vitest run src/main/services/agent/runtime/__tests__/agentProductEvents.test.ts src/renderer/src/hooks/__tests__/useMessageModelResolution.test.ts`：通过，2 个测试文件 / 11 个测试。
- `node_modules/.bin/tsc -b --noEmit`：通过。
- `node_modules/.bin/oxlint .`：通过，39 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `node_modules/.bin/tsx scripts/i18n/check.ts`：sandbox 下因 tsx 临时 IPC pipe `EPERM` 未进入脚本；提升权限重跑通过。
- `pnpm exec vitest run ...agentProductEvents.test.ts`：未进入测试执行；pnpm 在非 TTY 下触发依赖目录处理并中止，已改用本地 Vitest binary 验证。

2026-06-25 复核验证记录：

- `git status --short`：干净工作区。
- Extensions aggregate route 扫描：未发现用户可见 route；仅剩只读 descriptor service / compatibility API。
- `pnpm test:run src/renderer/src/lib/__tests__/menuConfig.test.ts src/renderer/src/components/chat/__tests__/ChatMessageList.test.ts src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx src/renderer/src/components/chat/__tests__/messagePartsAdapter.test.ts src/renderer/src/components/chat/__tests__/messageTurns.test.ts`：通过，5 个测试文件 / 18 个测试。
- `pnpm check`：通过。
- `pnpm lint`：通过，37 个 warning / 0 个 error；warning 为既有 cleanup 项。
- `pnpm i18n:check`：通过。

本次更新验证记录：

- `pnpm test:run src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx`：通过，1 个测试文件 / 4 个测试。
- `pnpm check`：通过。
- `pnpm lint`：通过，33 个 warning / 0 个 error；warning 为既有未清理项。
- `pnpm i18n:check`：通过。
- 历史文档清理扫描：`/extensions` 用户路由、`handleExtensions` 可执行示例、Extensions 聚合页任务、direct/chat 模式实现任务已改为 archived/superseded/compatibility 说明；仅保留明确标注的历史上下文和 compatibility 字段。
- 本条为历史 docs-only 更新记录；当前工作区已进入代码实现批次，不能再按 docs-only 状态理解。

上一轮完整验证记录：

- `pnpm check`：通过。
- `pnpm test:run`：通过，36 个测试文件 / 321 个测试。
- `pnpm lint`：通过，30 个 warning / 0 个 error。
- `pnpm i18n:check`：通过。
- `pnpm dev`：本轮未验证，因运行环境限制未继续拉起 dev server。

后续每次完成一个批次，应在这里追加新的 focused test / check 证据。

## Implemented With Evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Agent-only active path | Implemented | 新建、欢迎页发送、active send/storage 路径按 Agent runtime 收口；direct/chat 模式仅保留 compatibility type 读取。 |
| JSONL event storage | Implemented / partial | `SessionStorageService.appendEvent()` 分配 `eventId + seq + writtenAt`；JSONL parser 覆盖半行恢复、malformed middle corrupted、duplicate eventId、meta repair。 |
| Structured message parts | Implemented / partial | `MessagePart` / `AssistantPartEvent` 已进入 shared types；JSONL replay 可恢复 `Message.parts`；legacy fenced code/diff adapter 已接入。 |
| Agent streaming text | Implemented / partial | Agent SDK text delta 已转换为 `assistant.part_*`，并保留 legacy chunk 兼容。 |
| Agent product event projection | Implemented / partial | `AgentProductEvent` 契约和 `projectAgentRuntimeEvent()` 已覆盖 run/message/structured_part/tool/approval/usage/rate_limit/error 映射；`productEventMaterializer()` 已提供 pure materialize helper；`AgentRuntimeIpcBroker` 已将 persisted product events 写入 main process JSONL storage，并补 `permission.resolved` audit 去重。renderer 已有 runtime stream adapter 薄包装；`useChat` 发送入口已 runtime-first，runtime create failure 不再 fallback 到 Agent SDK，而是 materialize structured error 并恢复 idle。 |
| `useChat` model / prompt / approval / event split | Implemented / partial | `useMessageModelResolution()` 已承接 session override、project default、global active、main resolver fallback；`usePromptContextBuilder()` 已承接 cwd/env、MCP server、system prompt、skill context、team agents、attachment/search prompt 组装；`useToolApprovalFlow()` 已抽出 approval resolver/optimistic patch 并接回 `useChat.respondToApproval()`；`useAgentEventReducer()` 已提供 SDK/runtime stream event → UI action 的纯 reducer；`useAgentRunController()` 已承接 request lifecycle、watchdog、runtime/SDK request type 和 interrupt snapshot。`useChat` 仍负责较多 orchestration，后续需继续瘦身。 |
| Model selection UX | Implemented / partial | Phase 1 当前批次已完成输入框 one-shot model override、发送后清理、会话默认模型设置，以及 `source` / `sourceLabel` 生效来源展示。Provider/Model 能力配置和 subagent runtime model selection 仍需后续批次。 |
| Settings / shell IA | Implemented / partial | Phase 2 当前批次已完成 Settings 分组、URL tab sync、无 `/extensions` 用户路由、MCP/Skills/Plugins 独立入口和 Agent-only 文案收口。Settings recovery UI 和完整 inspector 模块仍在后续批次。 |
| Plan/Execute presentation mapping | Implemented / partial | Composer 状态栏已把内部 `PlanMode` 映射为用户可见 `Plan` / `Execute`，`chat` 仅作为 Execute 兼容值，不再展示为普通对话模式；Plan/Execute shared contract、execute turn prompt helper、`PlanCard` 基础组件、聊天流展示和 composer blocked 区已通过 focused tests。execute/regenerate 会经现有 `sendMessage()` 创建新 Agent turn，并在本地 message metadata 写入 `planDecision` / `planExecute`；`plan.decision` / `execute.turn.created` product event 契约、materializer、renderer appendEvent 调用点和 JSONL marker 已接入。剩余是 run terminal 状态与更完整 replay UI。 |
| Prompt context | Implemented | Agent prompt 注入附件 resolver 结果、search context、skill/system prompt context。 |
| Tool approval foundation | Implemented / partial | `tool_call` / `permission_request` / `tool_error` 可 upsert 到统一 tool message；composer pending surface 已承接 active approval/ask。 |
| Runtime enforcement core | Implemented / partial | file open、attachment read、git worktree、legacy LLM tool executor、Agent SDK `canUseTool`、MCP unified `callTool()` 已接入 `RuntimePolicyService.evaluate()`；MCP `callTool()` 已有 allow/audit-only/deny/needs-approval focused regression tests。 |
| Project path policy | Implemented / partial | symlink 独立 project、hash collision fallback、中文/空格路径、settings deep merge/null clear/undefined no-op 有测试覆盖。 |
| Legacy import Option A | Implemented | 旧 chats 保守导入 casual session；invalid JSON/partial failure/rerun/no silent done flag 有测试覆盖。 |
| Session deletion | Implemented / partial | session delete tombstone、restoreDeleted、deleted append blocking 有测试覆盖。 |
| Tool result summary / typed tool parts | Implemented / partial | 大 tool result 折叠态已改为 capped preview，避免折叠态全量 stringify；`StreamPartRenderer` 已补 typed `tool` part summary；`BaseMessagePart` 已有 `contentRef` / `byteLength` / `truncated`，renderer 对引用内容显示轻量摘要；`SessionStorageService` 已有 storage-local `writeContentRef()` / `readContentRef()`，`appendEvent()` 已对大 assistant part payload 生产 `contentRef`；`sessions.readContentRef()` typed IPC/preload/renderer helper 已可安全读取 text-like payload；UI 已支持按需加载并只保留 capped preview；read API 支持 `offset/maxBytes` 分页预览。 |
| Message list virtualization | Implemented / partial | `ChatMessageList` 已按 turn 构建并在大列表走 virtual list；500 user/assistant turns + 多代码块测试验证只挂载可见 rows。仍需真实运行长会话视觉/输入延迟 smoke。 |
| Independent marketplace navigation | Implemented | `getEffectiveMenuItems()` 强制隐藏 `extensions` 并保持 MCP / Skills / Plugins 可见；router 扫描未发现 Extensions 聚合用户 route；当前 shell 保持 MCP、Skills、Plugins 独立入口。 |
| Historical docs cleanup | Implemented / partial | 旧 Workspace 主计划、任务队列、审计文档、composer/sidebar superpowers plan 已标记 archived/superseded；旧 Extensions 聚合页和 direct/chat 模式示例不再作为可执行计划。 |

## In Progress

| Area | Current work | Next evidence |
| --- | --- | --- |
| Structured code block UI | `code_block` part 已改为专用白底代码卡片：语言 badge、wrap/copy 图标、无内层 Markdown chrome；普通 Markdown `SyntaxHighlighter` 保持兼容路径。 | large mode / 视觉手测 / 长代码滚动性能。 |
| Tool / approval UI | composer pending surface 已接入；大 tool result 折叠态 capped preview 和 typed tool part summary 已有 focused tests。历史 transcript 仍需进一步统一 approval/tool state、折叠输入和结构化错误。 | `ApprovalDecisionCard` tests + replay UI evidence。 |
| MCP runtime regression | unified `callTool()` 已接入；browser/third-party proxy 仍缺 per-server deny/approval 回归。 | MCP per-server tests。 |
| Structured renderer coverage | text/code/diff/data/table/tree/sources/artifact 基础 renderer 已有；typed tool part summary、大输出折叠预览、contentRef 安全读取 IPC、range read 和 UI 按需展开已接入。large code mode、diff hunk collapse、artifact actions 和“加载更多”分页 UI 仍未完成。 | renderer tests + long content performance check。 |
| Phase 0b hook split | 已完成 `useMessageModelResolution`、`usePromptContextBuilder`、`useToolApprovalFlow`、`useAgentEventReducer`、`useAgentRunController` 低风险抽取；`useChat` 已把 SDK/runtime event 分支接入 reducer，并以 runtime-first 方式发送。runtime create failure fallback 到 SDK 的默认路径已移除。下一步继续把 `useChat` orchestration 瘦身。 | focused hook tests + runtime-first smoke + no streaming/approval regression。 |
| Phase 0c Plan/Execute | 已完成 Plan/Execute presentation mapper、shared contract、execute turn prompt helper、PlanCard 基础组件、聊天流展示、composer blocked decision、本地 execute/regenerate 接线，以及 `plan.decision` / `execute.turn.created` JSONL marker 持久化。下一步补 Plan decision 历史摘要 UI 和更完整 replay UX。 | Plan card / composer blocked state tests + replay/persistence tests。 |

## Remaining Gaps

| Gap | Why it remains open |
| --- | --- |
| Remote lifecycle | duplicate webhook replay drop 已有 focused test；remote-bound delete ordering 已改为先 tombstone 后 unbind；bound bot stopped/missing 时已发出 `remote.bot-offline` event/log 并抛出 structured `RemoteBotOfflineError`，且 IPC response 会透传 `remote.botOffline` code/details；deleted/archived/missing session 收到 IM 会发出 `remote.inactive-received` 并阻止普通广播/落盘。remote archive/cleanup 状态机仍缺实现证据。 |
| Settings recovery UI | 已有 `Project Recovery` 安全入口，覆盖 archived/orphan/legacy import/tombstone/relink/backup 的当前状态和有限操作；完整 wizard、backup/export bundle、物理 cleanup 仍未实现。 |
| Privacy/export/backup | redaction foundation 已有 focused tests；AgentTrace 已接入 shared redactor；storage 已有最小 session/project archive directory export，renderer/main 已有 `sessions.exportArchive(sessionId)` / `projects.exportArchive(projectId)` / diagnostic export 入口且不接受任意输出路径；diagnostic export minimum 已默认排除聊天正文/payload；session/project archive 默认 `includeChatContent:false`，显式 true 才复制 JSONL；Settings Recovery 已有 session/project/diagnostic export UI 和 Recovery checklist。zip/package 格式、完整迁移包和 cleanup 深水区仍未实现。 |
| Full structured event stream | llm-loop native fenced code/json/diff producer 已生成 `assistant.part` runtime events 并写入 session storage；table/tree/source/artifact 专用 producer 和 delta batching 尚未完成。 |
| Product event renderer wiring | Phase 0a storage 写入已接入 `AgentRuntimeIpcBroker`；renderer 已有 runtime event reducer/adapter，`useChat` 已 runtime-first。JSONL replay 已覆盖 approval resolved、ask answered、tool terminal states、run terminal status、plan parts 和 native code/json/diff assistant parts；仍缺更广 structured native parts 的完整 renderer-visible 证据。 |
| Compatibility cleanup | 旧 workspace/chatMode/direct 兼容 API/type 仍需跟代码实际依赖一起分批收口；文档里保留的历史术语必须继续带 archived/superseded/compatibility 标注。 |
| Dev runtime smoke follow-up | `pnpm dev` 已验证到 renderer dev server、Electron main window、API server、AgentRuntime registry、IPC 和 internal MCP 初始化；后续仍需真实模型/tool run 的人工 smoke。 |
| Context management / token compression | 低风险切片已完成：发送管线会传入裁剪后的 `AgentHistoryMessage[]`，runtime 支持 `PromptPart[]` history，`contextCount`/`contextMode` 已进入策略和 Settings UI，`ProjectRulesReader` 已注入 Agent prompt；`context.compacted` 可回放事件、Context Inspector source breakdown、LLM summarize/provider、metadata-level pin/unpin 和 session-scoped artifact library MVP 已接线。剩余：专用摘要卡片和后续 artifact actions 深化；当前 focused/full tests 已覆盖到沙箱可运行范围。 |

## Update Rules

1. 新实现只在有代码 diff 和测试证据后从 `In Progress` 移到 `Implemented With Evidence`。
2. `verified` 必须有用户路径或自动化路径证据；不能只凭 plan checkbox。
3. 不把功能任务细节写进本文；细节继续放在对应功能 plan。
4. 不运行打包命令作为常规进度验证；本阶段以 dev 可运行、类型检查、测试和 lint 为准。

## Gate Health Snapshot 2026-07-18

> 收口 loop（[refactor-closeout-loop](./refactor-closeout-loop.md)）R3 + R4 合并执行。R3 分组提交此前已在 `main`（6 个功能域 commit）+ `r2/gate-health-fixes`（4 个 R2 增量 commit）上完成；本轮 R3 做抽样复核 + R4 做文档归档，一次性走完收口 loop。

### R3 — 分组提交复核

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 工作树 clean | ✅ | `git status --short` 空输出 |
| `git diff --check` | ✅ | exit 0 |
| commit 按功能域分组 | ✅ | `main..HEAD` + `main` 上共 10 个 commit，覆盖 9 个功能域：shared-types / Context·Memory / Multi-agent / native structured producer / Export·Recovery·Privacy / worktree+paged reads / Settings 壳+独立市场 / i18n / docs；每条自洽、可单独回滚 |
| 抽样 commit 过域 focused test（≥3） | ✅ | `c9f6e81` Task max-depth → `agentBuiltinsServer.test.ts` 26 passed；`14fef18` shared-types diagnostic manifest → `SessionStorageService.test.ts` 64 passed；`f741079` SubagentRunSummary coerce → `jsonl.test.ts` 36 passed |

### R4 — 全量门禁复跑

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | ✅ PASS | exit 0 |
| `pnpm check` | ✅ PASS | `tsc -b --noEmit` exit 0 |
| `pnpm lint` | ✅ PASS | oxlint 31 warnings / 0 errors，无新增 |
| `pnpm i18n:check` | ✅ PASS | en/zh 均通过 |
| `pnpm test:run` | ✅ PASS | **129 files / 1079 tests / 0 failed**（含此前被沙箱 `listen EPERM 0.0.0.0:3000` 阻塞、现已通过的 2 个 server e2e：`serverFixture.test.ts`、`agentBuiltinsServer.e2e.test.ts`） |

### 关键状态更新（R4 归档）

- **server e2e 端口监听阻塞已解除**：此前多轮记录的 `listen EPERM 0.0.0.0:3000` 环境阻塞在本轮不再复现，`serverFixture.test.ts` 和 `agentBuiltinsServer.e2e.test.ts` 均已通过。
- **`node_modules/.bin` 缺失断言已 supersede**：2026-07-03~07-08 各历史批次记录中的 17 处 `Blocked verification` / `node_modules/.bin 缺失` / `尚不能执行 vitest/tsc/oxlint` 断言统一由 `## Latest Verified Commands` 顶部的归档声明覆盖，历史条目保留轨迹不删除。
- **Current Status / Code-Based Remaining Work Count 段**已更新为反映"已整体验证通过"的真实状态。
- **refactor-plan.md** Implementation Readiness 段 + §1.5/§1.6 已同步更新沙箱阻塞与 server e2e 补跑断言。

### Retrospective

- **What worked**：R2 已把回归修完并按域分 commit，R3 复核只需抽样验证，无需重新分组；全量门禁一次跑通，server e2e 端口阻塞自然解除（非代码变更导致，是环境差异）。
- **What blocked**：无。本轮无任何环境或代码阻塞。
- **代码事实更新**：`pnpm test:run` 稳定基线 = 129 files / 1079 tests / 0 failed（与 R2 closeout 一致，本轮复跑确认）。
- **是否继续 loop**：**否**。终止条件全部满足——工作树 clean + 全量门禁绿（含历史阻塞的 server e2e）+ 进度文档无过期阻塞条目。收口 loop R1–R4 正式关闭。
- **后续工作（loop 外）**：per-server runtime 回归、导出/备份深水区（zip/package/完整迁移包）、marketplace 视觉深化、byte-index/增量 JSONL parse、专用摘要卡片、table/tree/source/artifact native producer 等属产品深化项，不再纳入收口 loop。V2 Tauri 迁移需等 v1 达 `shippable` 后启动。

## Gate Health Snapshot 2026-07-19 (mirror-type cleanup)

> **R 编号纠正声明**：本节执行的是 **R2 closeout（commit `f7dc551`）里写明"留 R3"的那批实改**——`SessionArchiveFileEntry.kind` union 统一 + `DiagnosticExportResult` 补 `manifest` 既存 bug + 镜像类型合并。它与上方 `## Gate Health Snapshot 2026-07-18` 里的"R3 分组提交复核"**同名但不同内涵**：那个 R3 是抽样验证（零代码改动），本节 R3 是实改 shared-types 跨进程契约。编号撞车是历史会话遗留，此处按 R2 closeout 的原始定义补完，不推翻 2026-07-18 的归档结论（那份归档针对的是"分组复核 + 全量门禁"，与本节的契约修复合并各自独立成立）。

### 本批落地（commit `0590d56`，branch `r2/gate-health-fixes`）

| 项 | 改动 | 说明 |
| --- | --- | --- |
| FileEntry union 统一 | `packages/shared-types/src/electron-api.ts`：`SessionArchiveFileEntry.kind` 从 3 成员拓宽到 5 成员（加 `project-metadata` / `project-settings`） | shared 侧原本欠spec；main 在 project archive 里一直 emit 这两种 kind（`SessionStorageService.ts:956, 981`），拓宽后 shared 契约匹配实际 wire shape |
| SessionStorageService 镜像类型合并 | `SessionArchive{FileEntry,Manifest,ExportResult,RedactionMode,ReferencedAttachment,ReferencedContentRef}` + `ProjectArchive{Manifest,ExportResult,SessionEntry,ReferencedPayloadSession}` 全部改为 re-export shared 的 alias | field-for-field 核对一致；本地 `ExportSessionArchiveOptions` / `ProjectArchiveMetadata` 保留（shared 无对应） |
| Pair 7 既存 bug 修复 | `DiagnosticExportResult` 在 shared 侧补 `manifest: DiagnosticExportManifest` 字段 | main exporter 一直在 wire 上返回该字段，shared 契约欠spec；属契约纠正非行为变更 |
| Preload / DiagnosticExportService 收口 | preload 本地 inline 的 `DiagnosticExportResult` 改为 import shared；`DiagnosticExportService` 本地 4 个类型改为 re-export shared | renderer 经 `electron.d.ts` 自动继承，无需改 |

### 验证（5 门禁）

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `git diff --check` | ✅ PASS | exit 0 |
| `pnpm check` | ✅ PASS | `tsc -b --noEmit` exit 0 |
| `pnpm lint` | ✅ PASS | oxlint 31 warnings / 0 errors，无新增 |
| `pnpm i18n:check` | ✅ PASS | en 通过 |
| `pnpm test:run` | ✅ PASS | 129 files / 1079 tests / 0 failed |

### 已知 pre-existing 测试基建 flake（本批未引入，记为 follow-up）

- **现象**：本批首次全量 `pnpm test:run` 出现 `src/test-utils/__tests__/serverFixture.test.ts` FAIL，报 `listen EADDRINUSE: address already in use :::3000`；立即重跑通过（129/1079 全绿）。
- **根因**：`src/main/server/app.ts:177` 的 `LocalServer.start()` 走 `getPort({ port: 3000 })`，当多个 vitest worker 并行调用时会在 port 3000 上 race（get-port 看到 3000 空闲 → 两 worker 同时 listen → 一个 EADDRINUSE）。
- **与历史阻塞的区别**：2026-07-18 之前记录的 `listen EPERM 0.0.0.0:3000` 是沙箱拒绑（权限问题，已解除）；本次 `EADDRINUSE :::3000` 是并行 worker 端口竞争（并发问题，仍存在但概率低）。
- **是否阻塞**：否。孤立重跑（`vitest run` 单跑那 2 个 e2e）稳定通过；全量重跑也通过。属 flake，非确定性失败。
- **建议修法（留独立批次）**：`LocalServer.start()` 改为 `getPort({ port: 0 })` 或让 test fixture 强制随机端口，消除固定 3000 的竞争面。

### Retrospective

- **What worked**：FileEntry union 方向有事实支撑（grep 到 main 实际 emit `project-metadata`/`project-settings`），无需问用户即可定方向 = shared 拓宽。Pair 7 补 manifest 是纯 widening（renderer 没人读 `.manifest`），向后兼容零风险。
- **What blocked**：无代码阻塞。中途发现仓库已有 `4e7cfb8` 声明"loop R1-R4 关闭"，与用户"进 R3"指令表面冲突——经 AskUserQuestion 对齐后按用户指令做、文档里加编号纠正声明解决，没擅自推翻或无视。
- **代码事实更新**：`SessionArchiveFileEntry.kind` 现在是 5 成员 union（shared 侧）；`DiagnosticExportResult` 现含 `manifest` 字段（shared 侧）。preprocess/preload/renderer 全部经 shared 统一。镜像类型重复声明已消除。
- **是否继续 loop**：否。R2 closeout 写明的 R3 实改已完成验证。剩余 P-L1（`useChat.ts:404` 死 throw）、P-L2（`server/routes/llm.ts` 补 unit）、清 31 个 lint warnings、以及上面记的 EADDRINUSE flake 修法，均属独立小批次，不再纳入本 mirror-type cleanup loop。

## Gate Health Snapshot 2026-07-19 (quality-debt cleanup)

> 接 R3 closeout 的剩余 backlog,清质保债:lint warnings + P-L2。branch `r2/gate-health-fixes`,commit `06bc06e`（lint）+ `8cf1397`（P-L2 测试）。

### 落地

| 项 | 改动 | 结果 |
| --- | --- | --- |
| **lint warnings 清理** | 12 文件:`no-unused-vars`(删未用 import/var/param + iconfont skill 12 个 catch 去绑定)、`no-useless-catch`(requestLogger 删纯重抛 catch)、`no-control-regex`(assistantContent 改 RegExp 构造保留 \u0000 sentinel 语义)、`unicorn/no-useless-fallback-in-spread`(ProjectSettingsModal 3 处加 targeted eslint-disable——TS null-check 与 unicorn 规则真冲突,运行时 no-op 但 tsc 要求) | **31 → 2 warnings**(剩 2 个是 RequestLogService 的 pre-existing `no-this-alias`,不同规则类、在 network-interceptor 代码里、本批未触) |
| **P-L2** | 新增 `src/main/server/routes/__tests__/llm.test.ts`,7 tests 覆盖 `fetchModels` / `testConnection` 的 400/200/500 分支(直接 mock ctx,不 boot LocalServer;SSE chat-completion 的真 HTTP recursion 已由 e2e 覆盖) | 130 files / **1086 tests** / 0 failed |

### P-L1 移除说明

R1 subagent-B 报 `useChat.ts:404` 的 `throw new Error(response.error...)` 是死代码。本批核对后**结论不成立,移除**:该 throw 是 `messageStoreApi.appendSessionEvent` 对真实 IPC 失败的正常错误传播(契约 API);被 `useAgentSendPipeline` 的 try/catch 吞掉是 pipeline 层的容错选择,不代表 producer 的 throw 无用。相关测试(`useAgentSendPipeline.test.ts:463`)mock 的是 `appendSessionEvent` 自己 throw,与 useChat 的 throw 无关。删 throw 会破坏契约(IPC 失败静默成功)。

### 验证(5 门禁)

| 命令 | 结果 |
| --- | --- |
| `git diff --check` | ✅ exit 0 |
| `pnpm check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0,**2 warnings**(RequestLogService pre-existing `no-this-alias`)/ 0 errors |
| `pnpm i18n:check` | ✅ exit 0 |
| `pnpm test:run` | ✅ exit 0,**130 files / 1086 tests / 0 failed**(本次无 EADDRINUSE flake 复现) |

### Retrospective

- **What worked**:lint 清理按规则分类做,no-unused-vars 是机械批处理、control-regex 和 useless-fallback 需个案判断(后者是 TS/lint 真冲突,用 targeted disable + 注释解决而非硬改)。P-L2 用最小 mock ctx 直接测 controller 方法,避免 boot LocalServer 的重负担。
- **What blocked**:无。中途发现我之前的 lint warning 计数脚本(node 解析)有 bug,把 warning-to-location 配对错位,导致一度以为 ProjectSettingsModal 是 no-unused-vars、RequestLogService 有 catch warning——实际是 unicorn 规则和 no-this-alias。纠正后按真实规则集处理。
- **代码事实更新**:lint 稳定基线 = **2 warnings**(剩 RequestLogService 的 `no-this-alias`,留独立批次);test 稳定基线 = 130 files / 1086 tests。
- **是否继续 loop**:否。质保债已清(剩 2 个 no-this-alias + EADDRINUSE flake 是独立技术债,不属本质量清理 loop)。

## 2026-07-20 feat: native structured producers (table/tree/sources/artifact)

> Remaining Gaps "Full structured event stream" 项的深化。branch `r2/gate-health-fixes`,commit `0e170cf`。

### 落地

给 llm-loop fence-producer(`streamEventTranslator.buildMessagePart`)加 4 个 native producer,LLM 在 fence 里写的 table/tree/sources/artifact 现在被解析成 typed `MessagePart`,不再 fallback 成 code_block:

| fence 语言 | 输出 part | body 格式 |
| --- | --- | --- |
| ` ```table ` | `TableMessagePart` | GFM markdown table(`\| col \|` + `\|---\|`) |
| ` ```tree ` | `TreeMessagePart` | 缩进语法(2 空格/tab 算层级,可选 `kind:` 前缀) |
| ` ```sources ` | `SourcesMessagePart` | markdown 列表(`- [title](url)` / bare path / 纯文本) |
| ` ```artifact ` | `ArtifactMessagePart` | JSON(`{artifactId, type, title?, preview?}`) |

4 个 producer 全部遵循现有 json-producer 的容错契约:**解析失败 → fall through 到 code_block**(带 language 标记),LLM 写坏不崩。

### 关键事实(探查确认,非 gap)

- **renderer 不是 gap**:`StreamPartRenderer.tsx` 早有 4 个 typed handler,producer 一发就渲染;之前是死代码等 producer。
- **shared-types 不是 gap**:`Table/Tree/Sources/ArtifactMessagePart` 已定义、已在 `MessagePart` union。
- **persistence 不是 gap**:JSONL replay 通用处理所有 `assistant.part_*` 事件。
- **唯一 gap**:`buildMessagePart` 的 if/else 链缺 4 个分支 + 4 个 body parser。

### 验证

| 命令 | 结果 |
| --- | --- |
| `git diff --check` | ✅ exit 0 |
| `pnpm check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0(2 warnings,无新增) |
| `pnpm i18n:check` | ✅ exit 0 |
| `pnpm test:run` | ✅ exit 0,**130 files / 1092 tests / 0 failed**(+6:table/tree/sources/artifact happy + 2 fallback) |

### Remaining Gaps 更新

"Full structured event stream" 项的 table/tree/sources/artifact producer 部分**已完成**;剩 **delta batching**(plan task E1:part_delta 批量合并,目前 producer 全是 post-stream synchronous emit start+done)作为后续独立深化。

### Retrospective

- **What worked**:探查阶段先确认 renderer/shared-types/persistence 都不是 gap,把改动面精确收敛到 1 个文件的 if/else 链 + parser——避免了误改 renderer 或重定义类型的多文件返工。body schema 经 2 轮 AskUserQuestion 让用户定(table=Markdown、tree=缩进、sources=列表、artifact=JSON,各选最自然格式),没猜。
- **What blocked**:中途 table producer 的 separator 正则 `[\s:-]+` 把 `:` 和 `-` 当 ASCII range 解析出错,导致 `| --- | --- |` 匹配失败、测试红了。改成简单的字符类 `[|\s:-]+` 修好——这是真 bug 不是 flake,测试抓住的。
- **代码事实更新**:`streamEventTranslator.buildMessagePart` 现支持 code/json/diff/table/tree/sources/artifact 7 种 fence producer;test 基线 = 130 files / **1092 tests**。
- **是否继续 loop**:本轮是功能开发(非 gate-health loop),无 loop 概念。下一步可选:delta batching、或转其他 Remaining Gaps(recovery wizard / export zip / remote lifecycle)。

## 2026-07-20 feat: stream structured parts (E1 — open-fence state machine + throttle)

> plan task E1("part delta batch 合并,避免每 token 一行")的实改。branch `r2/gate-health-fixes`,commit `ea078d4`。接续上轮 structured parts producer,把 producer 从 finalize-then-emit 改成真流式。

### 落地

`streamEventTranslator` 加 per-instance fence 状态机,每个 chunk 驱动:

| 状态 | 行为 |
| --- | --- |
| fence 外 | 扫描 buffer 尾部找开标记 ` ``` `;开时 emit `part_start`(type:`code_block`,state:`streaming`),记 language |
| fence 内 | 累积 content;**按行边界**(非 per-token)flush `part_delta`——这就是 E1 的 batching |
| 闭合(` ``` ` 或 stream end) | flush 残余 content → `part_update` **re-classify**(body 能 parse 成 table/tree/sources/artifact/json/diff 就替换成结构化 part,否则保持 code_block)→ `part_done` |

设计要点:
- **所有 fence 先以 code_block 流式出现**(用户立刻看到代码边写边显示),闭合时 re-classify 成最终结构化卡片——因为 table/tree 等没法逐 token parse,但 code_block 能。
- **batching 在 producer 侧**(按行 flush),不改 renderer/storage。避免 per-token 一次 JSONL append+fsync + 一次 re-render。
- 跨 chunk 边界的开标记处理:outside buffer 留尾部切片;info-string 换行未到的开标记等下个 chunk。

### 不是 gap(探查确认)

- **renderer 不需改**:`chatMessageStore.applyAssistantPartToMessage` 早有 `part_delta`/`part_update`/`part_done` 分支(`:114-152`)。
- **JSONL replay 不需改**:`jsonl.ts:261-277` 早处理 part_delta。
- **`AssistantPartEvent` union 不需改**:5 个变体早定义。
- **唯一改动**:`streamEventTranslator.ts` 加状态机 + 删 dead code(`buildStructuredAssistantPartEvents`/`extractFencedBlocks`)。

### 验证

| 命令 | 结果 |
| --- | --- |
| `git diff --check` | ✅ exit 0 |
| `pnpm check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0(2 warnings,无新增——test helper 的 3 处 `?? {}` 加了 targeted disable) |
| `pnpm i18n:check` | ✅ exit 0 |
| `pnpm test:run` | ✅ exit 0,**130 files / 1097 tests / 0 failed**(+5 streaming 专用测试) |

### 测试覆盖(新增 5 个 streaming 专用)

1. 多 chunk fence:start → delta → update → done 完整序列
2. 行边界 throttle:单行内 4 个 token chunk 只发 1 个 delta(非 per-token)
3. part_start 是 code_block,闭合后 re-classify 成 table
4. `done` 时未闭合的 fence 仍被 finalize(completeFence:false)
5. 连续两个 fence:闭合后 outside-fence 扫描正确恢复

原有 6 个 structured-part 测试改成用 `finalPartsArray()` 折叠事件序列(因为结构化类型现在经 part_update 到达,不在 part_start)。

### Remaining Gaps 更新

"Full structured event stream" 项**整体完成**:producer(code/json/diff/table/tree/sources/artifact 7 种)+ 流式(E1 delta batching)都已落地。该项从 Remaining Gaps 移除。

### Retrospective

- **What worked**:探查阶段先确认 renderer/JSONL/union 都不是 gap,把改动精确收敛到 1 个 producer 文件——避免了改 renderer 或重定义 event 契约的多文件返工。两个关键设计决策(结构化类型策略=全部流式+闭合 re-classify、batching 位置=producer 侧)经 AskUserQuestion 让用户定,没猜。5 个 streaming 测试覆盖了状态机的所有转换(开/关/跨 chunk/未闭合/连续)。
- **What blocked**:无代码阻塞。中途 lint 多了 3 个 `unicorn/no-useless-fallback-in-spread`(test helper 的 `?? {}`)——和 ProjectSettingsModal 同样的 TS-null-check vs unicorn 规则真冲突,加了 targeted disable + 注释解决。
- **代码事实更新**:`streamEventTranslator` 现在是流式 producer(fence 状态机 + 行边界 throttle + 闭合 re-classify);test 基线 = 130 files / **1097 tests**。"Full structured event stream" Remaining Gap 项整体完成。
- **下一步可选**:转其他 Remaining Gaps —— recovery wizard 完整版 / export zip 打包 / remote lifecycle 状态机。

## 2026-07-20 feat: recovery wizard step state machine + per-step actions

> Remaining Gaps "Settings recovery UI" 项的第一个子工作流(wizard 状态机 + 接线)。branch `r2/gate-health-fixes`,commit `ff9692e`。

### 落地

把 RecoveryWizardPanel 从**扁平 checklist**改成**真 step-by-step wizard**:

| 层 | 改动 |
| --- | --- |
| **model**(`recoveryWizard.ts`) | 每个 `RecoveryWizardStep` 加 `actionKind`(refresh/restore-archived/restore-orphan/import-legacy/export-diagnostics/none),让 panel 按 kind 渲染 per-step action 按钮。actionKind 在 step 状态变化时保持稳定(done 的 archived step 仍声明 restore-archived)。 |
| **panel**(`RecoveryWizardPanel.tsx`) | 扁平 `.map` → 单个 current-step 视图 + Prev/Next 导航 + "Step N of M" 指示器。`currentStepId` 状态 seed 到 recommended step,推荐变化时 useEffect 重置。per-step action 按 actionKind 渲染,handler 缺失时按钮整组隐藏(优雅降级)。新增 props `onRestoreArchived`/`onRestoreOrphan`。 |
| **parent**(`RecoverySettings.tsx`) | 加 `handleRestoreArchivedFromWizard`(恢复首个 archived project)+ `handleRestoreOrphanFromWizard`(恢复首个 orphan)。wizard 步骤是单按钮,恢复首个 + 让用户重复;完整 per-project 列表仍在各自 section 做精准操作。 |

**关键接线价值**:之前 archived/orphan remediation 在独立的 SettingSection 里,wizard 里是死路(recommended=archived 时只能 fallback 到 "Refresh status")。现在 wizard 的 archived/orphan 步骤能直接触发恢复操作。

### 验证

| 命令 | 结果 |
| --- | --- |
| `git diff --check` | ✅ exit 0 |
| `pnpm check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0(2 warnings,无新增) |
| `pnpm i18n:check` | ✅ exit 0 |
| `pnpm test:run` | ✅ exit 0,**131 files / 1106 tests / 0 failed**(+9:lib +2、新 panel test +7) |

### 测试覆盖

- `recoveryWizard.test.ts` +2:actionKind 分配到每个 step + 状态变化时 actionKind 稳定
- 新 `RecoveryWizardPanel.test.tsx` +7:recommended seed、Prev/Next 导航、最后步 Next 禁用、per-step action 触发 archived/orphan handler、handler 缺失时按钮隐藏、推荐变化时重置 currentStep
- `RecoverySettings.test.tsx` 更新:wizard 可见性测试适配单步 UI(当前步显 count + Recommended,其他步经 Next 可达);icons mock 补 LeftOutlined/RightOutlined

### Remaining Gaps 更新

"Settings recovery UI" 项的 **wizard 状态机 + 接线** 子工作流完成。剩 3 个子工作流(均独立,留后续批次):
- **backup/export bundle**:组合 3 个 exporter 成单一 artifact,可能引入 zip 库
- **物理 cleanup**:`deleteOrphan`/`purgeTombstone`/`legacyPurge` IPC(不可逆删除,需确认 UI + 安全设计)
- **relink-with-path-change**:`restoreOrphan` 在 hash mismatch 时抛错,改路径的 relink 仍 out of scope

### Retrospective

- **What worked**:探查阶段确认 wizard 实际是 4 个正交子工作流(wizard 状态机 / bundle / cleanup / 接线),经 AskUserQuestion 让用户选收敛到"wizard 状态机+接线"——避免一轮做不完 4 个的糊弄。model 保持纯函数、panel 持 currentStepId 状态的设计干净(handler 缺失时优雅降级,panel 可独立测试)。新 RecoveryWizardPanel.test.tsx 覆盖了状态机所有转换。
- **What blocked**:无代码阻塞。中途遇到 antd Button wave effect 在 jsdom 崩溃(读 undefined.ELEMENT_NODE)——和 RecoverySettings.test 同样问题,mock antd 解决;mock Button 一开始没转发 `data-testid` 导致测试找不到元素,加 `...rest` 修复;一处 TS strict 的 closure narrowing 问题(`if(harness)` 在 act callback 内不生效)用局部 const 捕获解决。3 个小问题都被测试/类型检查抓住,没漏到后面。
- **代码事实更新**:`RecoveryWizardPanel` 现在是真 wizard(currentStepId + Prev/Next + per-step action by actionKind);archived/orphan remediation 已接入 wizard;test 基线 = 131 files / **1106 tests**。
- **下一步可选**:wizard 的另 3 个子工作流(bundle / cleanup / relink),或转其他 Remaining Gaps(export zip / remote lifecycle)。

## 2026-07-20 feat: physical cleanup (deleteOrphan / purgeTombstone / legacyPurge)

> Remaining Gaps "Settings recovery UI" 的第 2 个子工作流(物理 cleanup)。接续上轮 wizard 状态机。branch `r2/gate-health-fixes`,commit `d103d93`。

### 落地

3 个物理删除 IPC + service 方法 + confirm modal UI。每个都有 containment guards(不可逆操作的安全设计)。

| Op | Service | 关键 guard |
| --- | --- | --- |
| **deleteOrphan** | `ProjectStorageService`,删 `<userRoot>/projects/<projectId>/` | (1) projectId 拒 `/`/`\`/`..`/空 (2) 路径**从 projectId 派生**(绝不从 `entry.cwd`,那是用户真实项目工作目录);(3) 断言 resolved 在 projects 根内;(4) 拒删注册中项目(用 `remove` 走注册注销路径);(5) `isBlockedPath` L3 |
| **purgeTombstone** | `SessionStorageService`,删 meta+jsonl+session subdir | (1) `findMeta(includeDeleted:true)`,missing 返 `{purged:false}`;(2) **拒 live session**(`!meta.deletedAt` 抛);(3) 断言 bucket 在 userRoot 内;(4) L3 |
| **purge**(legacy) | `LegacyImporter`,删 `<userData>/chats/<userId>/` | (1) 拒 un-imported chats(`detect().count > 0 && !alreadyImported` 抛);(2) 断言 `info.legacyDir` 匹配 `app.getPath("userData")` 派生的期望路径;(3) L3;(4) `migrationV2Done` flag 保留 |

### 关键安全事实(subagent 探查确认,最高优先)

**`deleteOrphan` 绝不能 `rmSync(orphan.cwd)`** —— `ListOrphansEntry.cwd` 是用户的真实项目工作目录(源代码!),只有 `projectDir(projectId)`(app-managed storage)能删。测试专门写了一个 tmpdir 作为假 cwd,删完 orphan 断言 cwd **仍存在**,把这个 invariant 钉死。

### IPC 6-step + 顺带修复的 pre-existing bug

3 个 op 各自走完整链:type → service → api-impl 一行 → auto-register → preload key → renderer call。中途**顺带修复**:`listDeleted`/`restoreDeleted` 早已在 sessions type 里定义,但**preload createBridge key list 漏了**,一直是"type 有,renderer 调用会崩"的死状态。本批把它们补上了。

### UI 挂载

3 个 danger 按钮 + `App.useApp()` modal.confirm(红 ExclamationCircleFilled 图标、danger OK 按钮,镜像 `ProjectSettingsModal` 项目删除模式):
- **orphan Delete**:orphan 列表行的 Restore 旁
- **session Purge permanently**:Session Export 列表 tombstoned 行的 Export 旁(条件渲染)
- **legacy Delete legacy data**:Import Legacy Chats 按钮旁(gate on `count > 0 || alreadyImported`)

**不加到 RecoveryWizardPanel**——wizard 是 safe-mode only,与 destructive 操作语义冲突。用户进 wizard 走指引恢复,destructive ops 在相邻 SettingSection 里,靠近对应的 per-item Restore 按钮。

### 验证

| 命令 | 结果 |
| --- | --- |
| `git diff --check` | ✅ exit 0 |
| `pnpm check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0(2 warnings,无新增) |
| `pnpm i18n:check` | ✅ exit 0 |
| `pnpm test:run` | ✅ exit 0,**131 files / 1116 tests / 0 failed**(+10:deleteOrphan 4 + purgeTombstone 3 + legacyPurge 3) |

### 测试覆盖(每个 op 3-4 case)

- **deleteOrphan**:happy(专门用真 tmpdir 作 cwd,断言 cwd 未被 touch)、幂等、unsafe id 拒(`../`、`/`、`\`、空)、拒注册中项目
- **purgeTombstone**:soft-delete 后 purge 断言 meta+jsonl 全删且不在 listDeleted、拒 live session、幂等
- **legacyPurge**:importAll 后 purge 断言 dir 全删且 detect 返 count:0、un-imported 时拒、dir 不存在返 `purged:false`

### Remaining Gaps 更新

"Settings recovery UI" 的 **wizard 状态机 + 物理 cleanup** 完成。剩 2 个子工作流(独立):
- **backup/export bundle**(可能引入 zip 库)
- **relink-with-path-change**(`restoreOrphan` hash mismatch 时接受新 cwd)

### Retrospective

- **What worked**:探查阶段 subagent 把最高安全风险(`deleteOrphan` 误删 cwd)直接标出来,让 plan 一开始就把"不删 cwd"作为 load-bearing invariant。每个 service 方法都镜像了现有 `restoreOrphan`/`delete` 的 pattern,IPC 6-step 走 registerAPI 自动路径(零手写 handler),模式风险低。测试用真 tmpdir 作 fake cwd 把"不删 cwd"这个 invariant 直接钉死,不是靠"信 code review"。
- **What blocked**:无代码阻塞。中途发现 `listDeleted`/`restoreDeleted` 在 preload key list 漏了(pre-existing bug,type 有但 renderer 调用会崩),顺带补上。RecoverySettings.test 需要补 antd `App` mock(`App.useApp()` 返 modal stub 让 onOk 同步执行)+ 新图标 mock,3 处补齐,现有 9 个测试仍全绿。
- **代码事实更新**:3 个物理删除路径全部落地并有 guard 保护;preload sessions bridge 现在暴露完整的 delete/list/restore/purge tombstone 语义;test 基线 = 131 files / **1116 tests**。
- **下一步可选**:recovery wizard 剩 2 子工作流(bundle / relink),或转其他 Remaining Gaps(export zip / remote lifecycle)。

## 2026-07-20 feat: relinkOrphan(recovery UI 第 3 子工作流)

> Remaining Gaps "Settings recovery UI" 的第 3 个子工作流(relink-with-path-change)。commit `48f8d09`。

### 落地

用户可以把 orphan 项目 relink 到新 cwd(项目目录被移动/改名)。此前 `restoreOrphan` 在 hash mismatch 时抛 "manual migration required (out of scope)",本批把这个缺口补上。

**service `ProjectStorageService.relinkOrphan(projectId, newCwd)`**:
1. rehash newCwd → newId
2. rename storage dir(旧 id → 新 id,`renameSync`)
3. rewrite path.txt 到 newCwd
4. `add(newCwd)` 注册

**Guards**:(a) projectId 拒 `/`/`\`/`..`/空;(b) 拒注册中项目(relink 只对 orphan);(c) 拒 source dir 不存在;(d) 拒 target dir 已存在(不覆盖另一个 orphan);(e) newId === projectId 时降级为 restoreOrphan 行为(no-rename,只 refresh path.txt + add)。

**UI**:orphan 行加 Relink 按钮(在 Restore 和 Delete 之间),点击弹 `modal.confirm` 带 Input(预填当前 cwd),onOk 通过 mutable box 捕获输入值调用 `relinkOrphan`。

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **131 files / 1120 tests / 0 failed**(+4:happy + no-op relink + target-exists + guards) |

### Remaining Gaps 更新

"Settings recovery UI" 的 **wizard 状态机 + 物理 cleanup + relink** 已完成。剩 1 个独立子工作流:
- **backup/export bundle**(可能引入 zip 库)

### Retrospective

- **What worked**:范围小,复用 `deleteOrphan` 的 guard pattern + `restoreOrphan` 的 hash 校验 pattern + `add()` 的 idempotent registry pattern,新方法几乎全是组合已有 primitives。测试的 happy 用例专门断言 path.txt 被更新为新 cwd + 旧目录消失 + 新目录出现,把 rename 语义钉死。
- **What blocked**:无。`modal.confirm` 无法返回表单值——用 mutable box `{ value: currentCwd }` + onChange 直接 mutate 解决(闭包持有 box 引用,onOk 读它)。这是 antd modal.confirm 带 input 的通用 workaround。
- **代码事实更新**:orphan 现有完整 5 操作(list / restore / relink / delete / archive delegate);test 基线 = 131 files / **1120 tests**。
- **下一步可选**:剩 1 个 recovery 子工作流(bundle,可能引入 zip),或转其他 Remaining Gaps(export zip / remote lifecycle)。

## 2026-07-20 feat: recovery bundle export(recovery UI 第 4 子工作流)

> Remaining Gaps "Settings recovery UI" 的最后一个子工作流(backup/export bundle)。commit `b8b22ab`。**Recovery UI 4 个子工作流全部完成**。

### 落地

新 `RecoveryBundleService` 编排 3 个现有 exporter 成单一 bundle 目录 + 顶层 manifest。**目录形式,不引入 zip 依赖**(为未来 `packAsZip:true` 保留接口)。

**Service 设计**(不改现有 exporter 签名):
1. 创建 `<userRoot>/exports/bundles/<timestamp>/`
2. 每个 session/project 调现有 `exportSessionArchive`/`exportProjectArchive`(写自己的 timestamp dir),然后 `renameSync` 移进 bundle 下的 `sessions/<sid>` / `projects/<pid>`
3. `DiagnosticExportService.export()` + rename 到 `bundle/diagnostic/`
4. 写 `bundle-manifest.json`(schemaVersion + createdAt + appVersion + includeChatContent + entries[])

**Guards**:空请求(无 sessions/projects/diagnostic)抛;id 拒 `../`/`/`/`\`

**IPC**:新 `recovery.exportBundle(options?)` 命名空间;`SessionStorageService` 新增 `getUserRoot()` public getter(peer service 需要复合路径时用)

**UI**:诊断按钮旁加 primary "Export recovery bundle" 按钮(non-destructive 无 confirm modal)

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **132 files / 1125 tests / 0 failed**(+5 bundle service) |

首跑遇到已知的 pre-existing EADDRINUSE `:::3000` flake(`serverFixture` 并行 worker 端口竞争,与本批改动无关),重跑绿。

### Remaining Gaps 更新

**"Settings recovery UI" 整体完成**——wizard 状态机 + 物理 cleanup + relink + bundle 全部 4 个子工作流完成。从 Remaining Gaps 移除。

剩独立候选:**export zip 打包**(引入 zip 依赖)、**remote lifecycle 状态机**。

### Retrospective

- **What worked**:组合式设计(编排现有 exporter + rename)避免了改动 3 个 exporter 签名,把 blast radius 收敛到 1 个新 service + 1 个 IPC channel + 1 个按钮。`renameSync` 在同 fs 上是原子的,失败也不会污染源 exporter 输出。为未来 zip 打包保留了干净接口(`packAsZip:true` 只需 wrap 目录树,不动 API 契约)。
- **What blocked**:无代码阻塞。`SessionStorageService.userRoot` 是 private,需加 `getUserRoot()` public getter 给 peer service 复合路径——合理的最小侵入改动。
- **代码事实更新**:Recovery UI 4 子工作流全成;`SessionStorageService` 新增 `getUserRoot()` 供 peer services 用;test 基线 = **132 files / 1125 tests**。
- **下一步可选**:export zip 打包(引入 zip 库),或 remote lifecycle 状态机。

## 2026-07-20 feat: remote lifecycle listener 接线 + delete-from-main

> Remaining Gaps "Remote lifecycle" 的第 1 个子工作流(共 7 个)。commit `95924dd`。

### 落地

**broadcast 接线**:`RemoteChatBridge.wireLifecycleBroadcasts()` 在 constructor 订阅自己的 4 个 lifecycle events,重新 broadcast 到 renderer(此前只有 tests 订阅、production 无消费者):

| EventEmitter event | Broadcast channel |
| --- | --- |
| `remote.outbound-rejected` | `remote-chat:outbound-rejected` |
| `remote.duplicate-dropped` | `remote-chat:duplicate-dropped` |
| `remote.inactive-received` | `remote-chat:inactive-received` |
| `remote.bot-offline` | `remote-chat:bot-offline` |

**Preload API 扩展**:`window.electron.remoteChat` 加 4 个 `on*` subscriber(镜像 `onIMMessage` 模式),`createBridge` 自动派生 IPC channel。**Renderer 本轮无强制改动**,只暴露 API 给未来的 `RemoteSessionsPanel` 用。

**delete-from-main**:`SessionStorageService` 加 `setRemoteBindingSink(fn)` DI 点。`delete()` 写 tombstone 后,若 `meta.remote` 存在则调 sink(try/catch 兜底,sink 错误不阻 delete)。`main.ts` 在 `setRemoteChatBridge` 后注入 `sid => bridge.unbind(sid)`。renderer chatStore 的 unbind 保留作 defense-in-depth(bridge.unbind 幂等)。

**关键设计**:`SessionStorageService` 对 `RemoteChatBridge` **零硬依赖**(sink 是函数值,不是 import 类型),保持 storage 层 remote-chat-agnostic。

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **132 files / 1132 tests / 0 failed**(+7:4 broadcast + 3 sink) |

3 个原 `expect(broadcastEvent).not.toHaveBeenCalled()` 断言经收窄为 `not.toHaveBeenCalledWith("remote-chat:im-message", ...)` —— 原意是"入站消息未转发",而非"broadcastEvent 从未被调用";现在 lifecycle 也 broadcast 了,所以要按 channel 区分。

### Remaining Gaps 更新

"Remote lifecycle" 项的**第 1 个子工作流**完成。**剩 6 个独立子项**(留后续):
- `SessionStorageService.archive` + IPC(镜像 Project.archive)
- `ProjectStorageService.archive` 级联到 remote-bound sessions
- Tombstone shape 扩展(`replayCount`/`lastReplayAt`,per `remote-session-lifecycle.md §5`)
- Binding conflict / bot-missing 类型化错误(`RemoteBindingConflictError`)
- `remoteChat.listBindings` IPC + `RemoteSessionsPanel` UI
- Physical purge guard(`purgeTombstone` 拒 `tombstone.remoteBinding` 未 unbind)

### Retrospective

- **What worked**:探查阶段 subagent 明确列出 remote lifecycle 是 7 个正交子项,经 AskUserQuestion 收敛到"最小完整切片 = listener 接线 + delete-from-main"——避免重蹈把 4/7 塞一轮的糊弄。broadcast wiring 是纯增量(不改 emit 逻辑),`SessionStorageService.setRemoteBindingSink` 保持 storage 层无硬依赖(测试可 stub 或 skip)。`createBridge` 的 `onFoo` → `namespace:foo` channel derivation 让 broadcast 侧的 channel 名和 preload 侧完美对齐,零手写 IPC 布线。
- **What blocked**:无代码阻塞。3 个原 `broadcastEvent NOT called` 断言在 wiring 后失败——这是断言意图收窄问题(原本想说的是"入站消息未转发",不是"broadcastEvent 从未被调用");按 channel 收窄断言解决,现有测试语义仍完整。
- **代码事实更新**:`RemoteChatBridge` 现在 broadcast 4 个 lifecycle channels 到 renderer;`SessionStorageService.delete` 通过 sink 自动 unbind remote binding,不依赖 renderer chatStore 路径;test 基线 = **132 files / 1132 tests**。
- **下一步可选**:remote lifecycle 剩 6 个子项(见 Remaining Gaps 更新),或转 export zip 打包(引入 zip 库)。

## 2026-07-21 feat: purgeTombstone remote-binding guard(remote lifecycle 2/7)

> Remaining Gaps "Remote lifecycle" 的第 2 个子工作流。commit `f34dbe8`。

### 落地

`SessionStorageService.purgeTombstone` 默认拒 tombstone 上仍有 `remoteBinding` 的情况——把 `deletion-retention-matrix.md:49` 的 invariant("Remote bindings must be unbound before physical cleanup")在 storage 层钉死。

**Why the guard sits at purge**:`delete()` 已调 `remoteBindingSink`(1/7 sub-workflow 落地)清 live binding,但 tombstone.remoteBinding 保留供审计。到 purge 时如果仍带 remoteBinding,说明:sink 没接 / caller 绕过 delete 直接写 tombstone / tombstone 早于 sink 接线——都不该静默丢证据。

**API**:`purgeTombstone(sessionId, opts?: { forceIgnoreRemoteBinding?: boolean })`。默认拒;显式 force 覆盖(用于 bot 永久离线 / relay 退役场景)。**向后兼容**:现有 callers 不传 opts,行为收紧。

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **132 files / 1135 tests / 0 failed**(+3 guard / force / no-binding-passes) |

### Remaining Gaps 更新

"Remote lifecycle" 项 **2/7 子工作流** 完成。剩 5 个:
- `SessionStorageService.archive` + IPC
- `ProjectStorageService.archive` 级联到 remote-bound sessions
- Tombstone shape 扩展(`replayCount`/`lastReplayAt`)
- Binding conflict / bot-missing 类型化错误
- `remoteChat.listBindings` + `RemoteSessionsPanel` UI

### Retrospective

- **What worked**:范围极小(1 个方法 + 1 个类型 + 3 个测试),风险最低,但直接销上一个安全 invariant。设计选项 A(默认拒 + force override)胜过 B(通过 sink 查询 bridge——太复杂,还给 storage 层加 remote 依赖)——保持 storage 层对 remote-chat 零硬依赖。opts 参数向后兼容(现有测试无 opts 通过)。
- **What blocked**:无。
- **代码事实更新**:physical purge 不再有可能悄悄清掉未 unbind 的 remote binding;test 基线 = **132 files / 1135 tests**。
- **下一步可选**:remote lifecycle 剩 5 子项,或转 export zip 打包。

## 2026-07-21 feat: tombstone shape — replayCount + lastReplayAt(remote lifecycle 3/7)

> Remaining Gaps "Remote lifecycle" 的第 3 个子工作流。commit `efbafdf`。

### 落地

按 `remote-session-lifecycle.md §5` 要求扩展 `SessionTombstone`,记录 tombstoned session 上的 remote IM 重放计数。

**Type**:`SessionTombstone` 加 `replayCount?: number` + `lastReplayAt?: number`(absent when zero,保持磁盘 shape 最小)。

**Storage 方法**:`SessionStorageService.recordTombstoneReplay(sessionId)` 用 `findMeta({includeDeleted:true})` 定位、递增两字段、`writeMeta`;返回 `{replayCount, lastReplayAt}` 或 `null`(session missing / 非 tombstoned)。

**Bridge wire-up**:`RemoteChatBridge.reportInactiveReceived` 在 `reason === "deleted"` 时调 `recordTombstoneReplay`。archived(会话仍活)/missing-session(无 meta)不 bump。try/catch 兜底,storage 失败不阻 drop 路径。

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **132 files / 1138 tests / 0 failed**(+3) |

### Remaining Gaps 更新

Remote lifecycle **3/7 完成**。剩 4:
- `SessionStorageService.archive` + IPC
- `ProjectStorageService.archive` 级联到 remote-bound sessions
- Binding conflict / bot-missing 类型化错误
- `remoteChat.listBindings` + `RemoteSessionsPanel` UI

### Retrospective

- **What worked**:范围严格聚焦(1 type 扩展 + 1 storage 方法 + 1 bridge 一处新增调用 + 3 storage 测试 + 3 bridge 断言),bridge 侧只在 `reason === "deleted"` bump,archived/missing 显式不 bump——语义正确性由 reason 分支保证。
- **What blocked**:无。
- **代码事实更新**:tombstone 现在带 replayCount/lastReplayAt(可选,零时缺省不写);test 基线 = **132 files / 1138 tests**。
- **下一步可选**:remote lifecycle 剩 4 子项,或转 export zip 打包。

## 2026-07-21 feat: 类型化 binding 错误 — conflict + bot-missing(remote lifecycle 4/7)

> Remaining Gaps "Remote lifecycle" 的第 4 个子工作流。commit `b69ed22`。

### 落地

`RemoteChatBridge.bind()` 里的 plain `new Error(...)` 替换成结构化错误,让 renderer 能做定向恢复 UI(冲突时跳到已绑定会话、bot-missing 时显示恢复 banner),而不是通用错误 toast。

| 场景 | 错误类 | code | payload |
| --- | --- | --- | --- |
| bind 时 `(botId, chatId)` 已被绑定到别的 conversation | `RemoteBindingConflictError` | `remote.binding-conflict` | `{requestedConversationId, existingConversationId, botId, chatId}` |
| bind 时 botId 在 imbot 里不存在 | `RemoteBotMissingError` | `remote.bot-missing` | `{botId, conversationId}` |
| **启动**时发现 stored binding 的 bot config 消失 | 同类 `RemoteBotMissingPayload` 通过 `remote.bot-missing` event → broadcast | 同上 | `{botId, conversationIds[]}`(按 botId 分组) |

**Startup 保留 binding**:spec "startup with missing bot preserves binding as recoverable"。`loadBindingsFromStorage` 遇到 bot-missing 时保留 binding + emit event(不删除)。

**Broadcast wiring**:`remote.bot-missing` → `remote-chat:bot-missing`。preload 加 `onBotMissing` subscriber(第 5 个 lifecycle 通道)。

**Constructor 顺序修复**:`wireLifecycleBroadcasts` 现在在 `loadBindingsFromStorage` **之前**运行,保证启动时的 bot-missing event 能被 broadcast(否则会被 no-listener 窗口吞掉)。

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **132 files / 1143 tests / 0 failed**(+5) |

### Remaining Gaps 更新

Remote lifecycle **4/7 完成**。剩 3:
- `SessionStorageService.archive` + IPC(镜像 project.archive)
- `ProjectStorageService.archive` 级联到 remote-bound sessions
- `remoteChat.listBindings` + `RemoteSessionsPanel` UI

### Retrospective

- **What worked**:范围小(2 个 error 类 + 修 bind() 抛出点 + startup 扫描 + broadcast wiring + preload key + 5 测试),但直接修 2 个真实 UX 问题(冲突 UI / 缺 bot 恢复)。构造函数顺序 bug 在写 broadcast wiring 时立刻发现(不然启动时的 bot-missing 会静默丢失),把 loadBindingsFromStorage 挪到 wireLifecycleBroadcasts 之后修好。测试对 MockIMBotService 加了 `removeConfig()` 助手,模拟 bot 配置被删的场景。
- **What blocked**:无。
- **代码事实更新**:bind() 现在抛类型化错误(向后兼容——继承 Error,message 相同);preload 现在暴露 5 个 lifecycle 通道(此前 4 个);test 基线 = **132 files / 1143 tests**。
- **下一步可选**:remote lifecycle 剩 3 子项,或转 export zip 打包。

## 2026-07-21 feat: session.archive — session 级 archive 一等公民(remote lifecycle 5/7)

> Remaining Gaps "Remote lifecycle" 第 5 个子工作流。commit `6ad643e`。

### 落地

`SessionMeta.archived` 字段现在有 production 写入路径。此前 `RemoteChatBridge.readSessionLifecycleFacts` 一直读 `meta.archived`,但没有生产代码写它——只有测试用 `as any` 强制写入。本批把这个不对称补上。

- **Type**:`SessionMeta` 加 `archived?: boolean`(镜像 `Project.archived`)
- **Service**:`SessionStorageService.archive(sid, archived)` 镜像 `ProjectStorageService.archive`(idempotent、不影响 tombstoned session、走 `updateMeta` 保持 writeMeta pipeline)
- **IPC 6-step**:`sessions.archive` 全链路(shared-types → api-impl → preload)

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **132 files / 1147 tests / 0 failed**(+4) |

### Remaining Gaps 更新

Remote lifecycle **5/7 完成**。剩 2:
- `ProjectStorageService.archive` 级联到 remote-bound sessions(现在有 `session.archive` 作为基础)
- `remoteChat.listBindings` + `RemoteSessionsPanel` UI

### Retrospective

- **What worked**:范围最小(1 类型字段 + 1 service 方法 + 1 IPC + 4 测试),但填补了一个真实的**非对称**——bridge 读、生产代码不写。基础放稳后,project cascade 就能直接调 `sessions.archive` 而不需要重复实现。
- **What blocked**:无。
- **代码事实更新**:renderer 现在有 `window.electron.sessions.archive(sid, archived)`;`SessionMeta.archived` 是官方字段(非 `as any` 补丁);test 基线 = **132 files / 1147 tests**。
- **下一步可选**:remote lifecycle 剩 2 子项(project cascade / listBindings + UI),或转 export zip 打包。

## 2026-07-21 feat: project.archive 级联到 sessions(remote lifecycle 6/7)

> Remaining Gaps "Remote lifecycle" 第 6 个子工作流。commit `db70955`。

### 落地

Project archive/unarchive 时自动同步 project 下所有非 tombstoned sessions 的 `archived` flag——让 sidebar 过滤、`RemoteChatBridge.readSessionLifecycleFacts`(早就在读 meta.archived)、以及未来的 `RemoteSessionsPanel` 看到一致的"project 与其 sessions 一起归档"状态。

**新方法**:`SessionStorageService.archiveByProject(projectId, archived)`——批量翻转,per-session idempotent,返回 `{affectedSessionIds}`。

**DI sink**:`ProjectStorageService.setArchiveSessionsSink(fn)`(镜像 delete-side `RemoteBindingSink` 模式)。`archive()` 在 registry 提交**之后**且**仅在状态真翻转时**才调 sink。sink 错误吞掉不阻 registry write(project 状态权威,session cascade 收敛可重跑)。

**main.ts** 在两个 storage 初始化后立即接线。

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **132 files / 1152 tests / 0 failed**(+5:2 archiveByProject + 3 sink) |

首跑遇到已知 pre-existing EADDRINUSE flake(serverFixture 并行 worker 端口 3000 竞争,与本批改动无关),重跑绿。

### Remaining Gaps 更新

Remote lifecycle **6/7 完成**。剩最后 1 个子项:
- `remoteChat.listBindings` IPC + `RemoteSessionsPanel` UI(最大、用户可见)

### Retrospective

- **What worked**:直接复用 delete-side `RemoteBindingSink` pattern(project → sink → session storage,零硬依赖),`archiveByProject` 是纯 storage 层批处理。状态实际翻转时才调 sink——避免无谓 side-effect(no-op 时 sink 不触发,测试专门覆盖这个点)。sink 错误吞掉 + 项目状态权威保证 registry 一致性。
- **What blocked**:无代码阻塞。首跑遇到 pre-existing EADDRINUSE flake,与本批无关。
- **代码事实更新**:`project.archive` 现有 session-level 级联(通过 DI sink);remote lifecycle **6/7 完成**;test 基线 = **132 files / 1152 tests**。
- **下一步可选**:remote lifecycle 最后 1 子项(listBindings + RemoteSessionsPanel UI,最大),或转 export zip。

## 2026-07-21 feat: listBindings + RemoteSessionsPanel UI(remote lifecycle 7/7 — 完成)

> Remaining Gaps "Remote lifecycle" **最后 1 个子工作流 — 7/7 闭环**。commit `a2607f7`。

### 落地

用户现在能在 Settings > Recovery 看到一个新面板列出所有 remote binding + 其分类后的 lifecycle state,按问题严重程度排序(tombstoned/bot-offline/archived 先),逐行 Unbind 按钮。直接补 4/7 typed 错误子项提到的 "recovery banner 缺位" 问题。

**bridge**:`listBindingsWithLifecycle()` 新方法,迭代 `this.bindings` 用现有 `classifyLifecycle` 分类(保证列表与发送/接收时看到的一致)。

**shared-types**:添加 `RemoteLifecycleState` + `RemoteBindingListEntry`(与 main 结构等价 —— shared-types 对 remote-chat 零依赖)。payload 类型(`RemoteOutboundRejected*` 等 5 个)从 preload 移到 shared-types/chat,preload 和 renderer d.ts 现从同源头引用。

**IPC 6-step**:shared-types → bridge 方法 → api-impl → preload createBridge 键 → renderer service wrapper → electron.d.ts 扩展(5 个 `on*` subscribers + `listBindings`)。

**UI**:新 `RemoteSessionsPanel` —
- Empty 态, Refresh 按钮 + auto-refresh (订阅 4 个 lifecycle broadcast 频道)
- 每行: bot 名 + platform Tag + state Tag (按严重程度颜色) + danger Unbind (App.useApp() modal.confirm)
- 排序: tombstoned → error-fatal → bot-offline → error-recoverable → archived → bound-active → bound-idle
- 挂在 `RecoverySettings` 中 ArchivedProjectsPanel 之后

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **133 files / 1160 tests / 0 failed**(+8: 3 bridge + 5 panel; 另 `RecoverySettings.test` 补 remoteChat stub) |

### Remaining Gaps 更新

**Remote lifecycle 7/7 全部完成 — 从 Remaining Gaps 彻底移除**。本会话落地的 7 个子工作流:
1. broadcast wiring + delete-from-main
2. purgeTombstone remote-binding guard
3. tombstone shape (replayCount / lastReplayAt)
4. typed binding errors (conflict + bot-missing)
5. session.archive
6. project.archive cascade
7. listBindings + RemoteSessionsPanel

剩 Remaining Gaps: **export zip 打包**(引入 zip 运行时依赖)。

### Retrospective

- **What worked**:前 6 项基础让本项变得很自然 — bridge 方法多 `for` 循环包现有 classifyLifecycle,不重复逻辑。payload 类型从 preload 移到 shared-types 顺便补了 4/7 时遗留的 renderer d.ts 与 preload 之间的 type drift(之前 renderer d.ts 没那 4 个 `on*`)。UI 镜像 `RecoveryWizardPanel` 的 antd mock 模式,Row key 与 IPC 断言都补上。
- **What blocked**:无代码阻塞。中途 3 个小问题都被类型检查 / 测试拿下: (a) IMBotService.bots 私有 → 改用 `checkBotOnline` 判 online + sentinel bot; (b) renderer electron.d.ts 缺 4 个 on* + listBindings → 同步补齐; (c) RecoverySettings.test 因新面板新增依赖 remoteChat stub → 补 5 个方法。
- **代码事实更新**: `remoteChat` IPC 现有 `listBindings`;preload / renderer d.ts / shared-types 对 remote lifecycle payload 类型同源;`RemoteSessionsPanel` 给用户提供一个管理 remote binding 的一级入口。test 基线 = **133 files / 1160 tests**。
- **下一步可选**仅 export zip。remote lifecycle 7/7 完成,Remaining Gaps 排除。

## 2026-07-21 feat: recovery bundle 可选 zip 打包(Remaining Gaps 全部清空)

> Remaining Gaps 里最后一个:**export zip 打包**。commit `688e179`。

### 落地

`recovery.exportBundle` 新增可选 `packAsZip?: boolean`,true 时把 bundle 目录打包成单个 `.zip` 并移除源目录,用户拿到一个可以直接分享的文件而不是目录树。

**范围严格聚焦**:只 recovery bundle 加 zip,单个 export(session/project/diagnostic)仍返回目录 —— 保持基础安装轻量,让 renderer 按调用选择。本批 UI 上"Export recovery bundle"按钮 flip 为 `packAsZip:true`。

**库选型**:`adm-zip`(依赖最少,2 个 transitive deps)。`archiver`(60+ deps)、`jszip`(全内存 buffer)、`yazl`(小众)均比选下。

**依赖处理策略**:package.json 手动 patch(dev 环境 pnpm store v10↔v11 冲突,不重跑 `pnpm install` 以免污染 lockfile),`zipHelper.ts` 用 dynamic `require` + typed `ZipDependencyMissingError`(code `recovery.zip-dependency-missing`)—— `pnpm check` 通过、测试通过、真正 exercise packAsZip 路径的运行时缺 adm-zip 会抛结构化错误而非崩溃。用户之后 `pnpm install` 就能跑。

**Service DI**:`RecoveryBundleService` 加 optional `packZip` dep,默认 = `zipHelper.packDirectoryToZip`,测试注入 stub 避免 test-time 依赖 adm-zip。

**失败处理**:packer 抛错时源 bundleDir 不删除 —— caller 可以降级为目录导出。

### 验证

| 命令 | 结果 |
| --- | --- |
| 5 门禁 | 全绿 |
| `pnpm test:run` | **133 files / 1163 tests / 0 failed**(+3:pack happy / skip when off / bundleDir salvaged on throw) |

lint 中途多了 1 个 `no-useless-catch`(纯 rethrow 的 try/catch),已顺手去掉;最终 lint 仍为 2 warnings(pre-existing no-this-alias,与本批无关)。

### Remaining Gaps 最终状态

**全部清空**。本次会话彻底关闭:
- Full structured event stream(structured producers + streaming E1)
- Settings recovery UI(wizard state machine + physical cleanup + relink + bundle)
- Remote lifecycle(broadcast wiring + delete-from-main + purgeTombstone guard + tombstone shape + typed errors + session.archive + project cascade + listBindings + UI)
- **Export zip 打包**

### 已知未落地

**adm-zip 未 install**:package.json 已声明但 lockfile 未更新。用户需在合并前跑 `pnpm install`(可能触发 store 迁移);未 install 时 packAsZip 路径抛 `ZipDependencyMissingError`,不崩溃、结构化 error 会通过 IPC message 呈现给用户。**这是有意的取舍**:避免动 lockfile 污染本次 diff。

### Retrospective

- **What worked**:zipHelper 的 dynamic require 模式让整个链路(type check / lint / test)在 adm-zip 未安装时仍能通过,把"依赖安装"这个环境问题和"代码正确性"这个代码问题解耦。Service 的 packZip DI 让测试完全不需要 zip 库。Renderer 端只改一行(button 加 packAsZip:true),没有新 UI —— 最小侵入。
- **What blocked**:pnpm store v10↔v11 版本冲突阻止 `pnpm add adm-zip`。经 AskUserQuestion 决定手工 patch package.json + 让用户之后 install,不重跑 install 污染 lockfile。这是一个环境问题,用文档 + 结构化错误覆盖比强行绕过 lockfile 更稳。
- **代码事实更新**:package.json 声明 adm-zip runtime 依赖;`recovery.exportBundle` 可选打 zip;RecoveryBundleService 的 `packZip` DI 让测试独立于 zip 库;test 基线 = **133 files / 1163 tests**。
- **Remaining Gaps 全部清空**;下一步产品方向需要用户重新规划。
