# Refactor Progress

> 入口：[refactor-plan](./refactor-plan.md) ·
> 覆盖矩阵：[refactor-traceability-matrix](./refactor-traceability-matrix.md) ·
> 执行门禁：[refactor-execution-gates](./refactor-execution-gates.md)
>
> 本文只记录当前实现进度和证据，不替代功能 plan。状态更新日期：2026-07-05（Phase 0a-c 复核与 P0 renderer 删除项目回归批次）。

## Current Status

**In progress.** 当前代码已经进入分批实现和验证阶段，但整体重构还不能标记为完成。P0 主线已经覆盖 Agent-only、JSONL structured parts、核心 runtime gate、项目/会话基础存储和对话展示骨架；Phase 0a 已完成 runtime projection 写入主流程 + `unknown` 兜底 + broker 对 `text.delta`/`reasoning.delta`/`status` 的 fast-skip + reducer 端 `plan.decision`/`execute.turn.created`/`run.rate_limit` 分支 + `run.usage` 改 transient；Phase 0b `useChat.ts` 已通过三轮抽取从 **1826 行降到 545 行（-1281 行 / -70%）**，新增 helper hooks 并有 focused tests；发送入口 runtime-first 且 runtime create failure 不再默认 fallback 到 Agent SDK。Phase 0c 已落地可测试 Plan card、聊天流展示、composer blocked decision + `paused-error` recovery、ApprovalDecisionCard/AskUserQuestionCard 键盘支持，以及 `planModeToolGuard` 的写/删/危险命令限制。Phase 1 已完成模型 one-shot 选择、会话默认、生效来源展示、发送后清理和能力元数据 chip。Phase 2 已完成 Settings IA 二次重构 + 交互 v2：11 项顶级 nav、Settings 嵌套路由、SettingsRail、TitleBar 空、底部 `SidebarUserRow` 共享、无 Extensions 聚合入口，MCP/Skills/Plugins 独立市场页保留。Phase 3 已完成大 tool result 折叠态 capped preview、typed tool part summary、500-turn 虚拟列表测试、storage `contentRef` producer、typed IPC read path 和 lightweight renderer service，另加 Plan/Execute replay summary、Context Inspector MVP 和 `ProjectRulesReader`（AGENTS.md/CLAUDE.md 只读读取，尚未接入 Agent prompt）。Phase 4 Multi-Agent MVP 已落地 `SubagentMessagePart`、subagent 产品事件、JSONL reducer、Task tool bridge、SubagentPartCard、SubagentsInspectorSection 和 approval subagent badge prop。Phase 5 Remote IM 已用 `RemoteSessionLifecycle` 纯状态机形式化并接入 `RemoteChatBridge`；remote duplicate replay drop、remote bot-offline、privacy redaction foundation、AgentTrace redaction、session archive directory export 已有 focused tests。

2026-07-05 代码复核结论：Phase 0a/0b/0c、消息虚拟列表、Agent-only 主发送链路、独立 MCP/Skills/Plugins 入口已经不是“待从零实现”项，后续应转入验收、回归和边界补齐。本批复核后确认 `ProjectStorageService.remove(projectId, { keepFiles:false })` 删除的是 app userData 下 `projects/<projectId>/`，其中包含 `sessions/`、JSONL/meta、attachments、tool-outputs/content-refs；已补 focused tests 锁定默认删除和 `keepFiles:true` 保留语义。旧 `.scr-data` 写入/迁移 helper 已删除，项目 cwd 下 `.scr-data/sessions` 只作为历史清理对象，不再作为写入或迁移目标。renderer 删除当前/运行中项目后的状态机回归已补 focused tests：删除入口先 stop stream，再 remove project，成功后才清理本地项目会话；当前项目会话删除后 fallback 到最新非 archived 会话，message/file artifact/loading/streaming 状态归位。仍待收口：project archive UI、diagnostic export UI/深水区、Recovery wizard 深水区、legacy import / recovery 默认路径脱敏、Phase 3 Context/Memory 深水区（prompt 注入、pin/unpin、compact 触发、artifact library）、Composer pills 编辑态与 git worktree preflight、MCP/Skill 独立市场重设计、完整分页读取、Phase 4 3 个 follow-up（`Message.toolCall.subagentRunId` renderer threading、`run.toolCallCount` 递归 SSE 实时递增、nested-of-nested Task 顶层化）、native structured stream events runtime producer（本阶段暂不做）。

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

3. **P1: Export / recovery product entry**
   - 底层已有 `exportSessionArchive()`、`exportProjectArchive()`、`DiagnosticExportService.export()`；下一步补 Settings 入口和 UX，而不是重写底层。
   - `ProjectArchiveManager` 当前只是 archived project restore list，命名和功能容易误导；需要拆成 restore manager 与 project export entry，或改名。
   - Diagnostic export 增加用户入口、成功路径展示、失败结构化错误和 i18n。

4. **P1: Privacy display cleanup**
   - Recovery / legacy import / orphan UI 默认不直接显示完整路径；列表显示短名或 redacted path，完整路径只通过 explicit copy/detail 操作暴露。
   - legacy import report 里的 old data dir 要 redacted；默认 diagnostic/session/project export 不包含 chat content，除非显式选择。

5. **P2: Context/Memory deepening**
   - `ProjectRulesReader` 已只读 `AGENTS.md` / `CLAUDE.md`；下一步接入 Agent prompt context，并在 Context Inspector 中展示注入状态。
   - 补 pin/unpin context、自动 compact/summarize、artifact library。

6. **P2: Multi-agent and structured output follow-up**
   - 接上 `Message.toolCall.subagentRunId` renderer threading、递归 tool call count、nested Task 顶层化。
   - Native structured events 暂按用户口径延后；当前 code/diff/data/table/tree/sources/artifact 继续作为计划，不作为本批阻塞项。

## Latest Verified Commands

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
- 剩余风险 / 需要产品决策：native structured `code_block/diff/data/table/tree/sources/artifact` runtime producer（本阶段用户已 defer）；Phase 3 Context inspector 深水区（pin/unpin、compact 触发、memory 写入、`metadata.contextCompacted` 写入端）；Phase 4 多 Agent 全套；Artifact library 全套；Composer pill 编辑态（worktree preflight / branch switch）；MCP/Skill 独立市场重设计；Recovery wizard 深水区；Project archive UI；Diagnostic export 深水区；`ProjectRulesReader` 接入 Agent prompt 注入。
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
- Phase 0a checklist：runtime product event projection + main process JSONL 写入已接入 `AgentRuntimeIpcBroker.persistRuntimeEvent()`；approval closed-loop 已由 `persistPermissionResolved()` 写 trace/product/session audit，并按 `requestId + approvalId` 去重。剩余为 unknown/debug summary、native structured event coverage、delta batching 和 renderer replay 展示细节。
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
| Privacy/export/backup | redaction foundation 已有 focused tests；AgentTrace 已接入 shared redactor；storage 已有最小 session archive directory export，包含 redacted manifest、meta 和 JSONL copy；renderer/main 已有 `sessions.exportArchive(sessionId)` 最小 API 出口且不接受任意输出路径；storage 已有 project archive minimum，导出 project metadata/settings/session meta/jsonl 且不复制用户 cwd；diagnostic export minimum 已默认排除聊天正文/payload；Settings Recovery 已有 session export UI 入口。zip/package 格式、project archive UI 和 cleanup 仍未实现。 |
| Full structured event stream | native code/diff/data/table/tree/source/artifact 专用 stream event 和 delta batching 尚未完成。 |
| Product event renderer wiring | Phase 0a storage 写入已接入 `AgentRuntimeIpcBroker`；renderer 已有 runtime event reducer/adapter，`useChat` 已 runtime-first。JSONL replay 已覆盖 approval resolved、ask answered、tool terminal states、run terminal status 和 plan parts；仍缺 structured native parts 的完整 renderer-visible 证据。 |
| Compatibility cleanup | 旧 workspace/chatMode/direct 兼容 API/type 仍需跟代码实际依赖一起分批收口；文档里保留的历史术语必须继续带 archived/superseded/compatibility 标注。 |
| Dev runtime smoke follow-up | `pnpm dev` 已验证到 renderer dev server、Electron main window、API server、AgentRuntime registry、IPC 和 internal MCP 初始化；后续仍需真实模型/tool run 的人工 smoke。 |

## Update Rules

1. 新实现只在有代码 diff 和测试证据后从 `In Progress` 移到 `Implemented With Evidence`。
2. `verified` 必须有用户路径或自动化路径证据；不能只凭 plan checkbox。
3. 不把功能任务细节写进本文；细节继续放在对应功能 plan。
4. 不运行打包命令作为常规进度验证；本阶段以 dev 可运行、类型检查、测试和 lint 为准。
