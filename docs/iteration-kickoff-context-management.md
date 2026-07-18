<!--
说明（不要粘贴这部分）：
本文件分两段。下方 CUT 标记以上的内容是给人看的元信息，
标记以下全部是要粘贴给新会话 agent 的 prompt。
用法：复制 === 8< === CUT HERE === 8< === 这行之后的所有内容。
配套 plan：docs/context-management-plan.md
收口基线：129 files / 1079 tests / 0 failed（见 refactor-progress.md Gate Health Snapshot 2026-07-18）
-->

> ⬇️ 复制下面 CUT 行开始的所有内容粘贴给新会话 ⬇️

=== 8< === CUT HERE === 8< ===

# Iteration Kickoff — Context Management v1 深化

## 角色

你是 main agent（controller），按 `iterative-phase-execution` skill 跑一个迭代 milestone。
**你不写代码**。你的职责：派 subagent 实现、审查、ITERATE、记录。

执行前**必须先用 Skill 工具调用 `iterative-phase-execution`**，读完它的 Core Loop 和三个 Prompt Slot 模板再动手。如果该 skill 要求先读 `superpowers:subagent-driven-development`，照做。

## 硬约束（来自 AGENTS.md + refactor-plan 硬口径，不可违反）

- **不写 `.scr-data`**：项目会话只写 app userData。
- **不加 `direct`/`chat` 对话模式**：Agent-only 是产品硬口径，旧 `chatMode` 仅兼容读取。
- **不合并 Extensions 聚合页**：MCP / Skills / Plugins 保持独立市场。
- **每个 phase 必须有 focused test 证据**，不只改实现。
- **不绕过沙箱策略**；任何提权请求被拒就记录、不绕过。
- **串行派发 impl subagent**：一次一个，不并行。并行只留给只读 recon。
- **每个 phase 结束都 ITERATE**，即使顺利也要做。

## 项目事实（取代任何旧文档断言）

- 仓库：`/Users/mark/myself/code/super-client-r`，Electron + React + Vite + TypeScript + Koa。
- 当前分支基线：`main`（收口 loop R1–R4 已完成，工作树 clean）。
- **建议分支**：新开 `r3/context-mgmt-v1`，从 `main` 切出（R2 closeout 已合并或即将合并，以 `main` 最新为准）。
- **测试基线**：`pnpm test:run` = 129 files / 1079 tests / 0 failed（含 2 个 server e2e，已不再被沙箱阻塞）。
- **验证命令**（每个 phase 退出前跑）：
  - `git diff --check`
  - `pnpm check`（tsc -b --noEmit）
  - `pnpm lint`（oxlint，31 warnings 基线，不许新增 error）
  - `pnpm i18n:check`
  - `pnpm test:run`
- **不跑 `pnpm build`**（按用户要求，打包命令不作为常规验证）。

## Context Management 当前代码事实（2026-07-18 只读复核，作为 phase 1 的 inherited_learnings）

已落地（无需重做，只需复验）：
- `src/renderer/src/lib/contextManager.ts`：7 个函数全部存在（`computeContextBudget` / `applyContextStrategy` / `summarizeMessagesText` / `messageToAgentHistory` / `messagesToAgentHistory` / `createSummaryMessage` + 类型）。`applyContextStrategy` 返回 `summaryInput`；`messageToAgentHistory` 跳过 tool/system。
- `src/renderer/src/services/agent/contextSummarizer.ts`：通过 `sseStream("/v1/llm/chat/completions")` 调本地端点，`maxTokens:2000`，`toolPermission:{mode:"none"}`，缺 baseUrl/model 时返回 undefined。
- `src/renderer/src/hooks/useAgentSendPipeline.ts`：已接入 HTTP summarizer（`prepareHistoryForRuntimeWithSummary` 行 184-240），失败回退本地 fallback summary；`persistContextCompactedEventForRuntime` 落地 context.compacted event。
- `src/main/services/agent/runtime/ClaudeCodeAgentRuntime.ts:421-444`：`buildChatRequest` 已修复支持 `PromptPart[]` history（Array.isArray 分支 + legacy string 分支），有 `ClaudeCodeAgentRuntime.test.ts:205` 覆盖。
- `src/renderer/src/lib/contextEventPersistence.ts`：renderer 侧 `context.compacted` persistence path 完整（34 行，只覆盖该单事件类型）。

缺口（本次 milestone 要做的）：
- **专用摘要卡片 UI（plan Task 9）完全未实现**：`ChatMessageList.tsx` / `MessageBubble.tsx` 对 `contextCompacted` 0 命中；当前只在 `ContextInspectorSection.tsx:356-380` 侧栏展示。**0 代码 0 测试**。
- **contextSummarizer 端到端集成测试缺失**：当前 `contextSummarizer.test.ts` 只有 3 个 it 且全 mock，未覆盖真实 SSE 路径。
- **plan 多处标注"依赖恢复后复验"**：依赖现已恢复，需实测复验这些链路（contextEventPersistence、projectRulesSnapshot、HTTP summarizer 真实调用），修复任何回归。

## 本 milestone 拆分（3 个 phase，顺序依赖）

> 拆分依据：风险递增 + 依赖顺序。Phase 1 纯增量无回归风险；Phase 2 是集成验证可能暴露回归；Phase 3 是 UI 收尾。

### Phase T1 — 复验已落地链路 + 补 contextSummarizer 集成测试

- **goal**：确认收口期间标注"待复验"的 context management 链路在依赖恢复后真实可用，补 contextSummarizer 的非 mock 集成测试。
- **completion_criteria**：
  - `pnpm test:run` 全绿（仍 ≥ 1079 tests，只增不减）。
  - 新增 ≥ 1 个 contextSummarizer 测试，覆盖 SSE chunk 汇总到完整 summary 的路径（可用真实 localApiClient 或注入 fake stream，但不能只 mock 返回值）。
  - 跑通 `contextEventPersistence.test.ts`、`useAgentSendPipeline.test.ts` 的 compact/summarize 用例并记录真实 test 数。
  - ITERATE：把复验中发现的任何与 plan 不符的事实写入 T2 的 inherited_learnings。
- **scope_fence**：不改 `contextManager.ts` 的纯函数逻辑；不动 storage 底层；不碰 main process runtime。

### Phase T2 — 专用摘要卡片组件（plan Task 9）

- **goal**：为 `message.metadata.contextCompacted` 的消息在 message list 渲染专用视觉卡片，而非只在 Context Inspector 展示。
- **completion_criteria**：
  - 新增摘要卡片组件（PascalCase 命名，如 `CompactedSummaryCard.tsx`），在 `src/renderer/src/components/chat/` 下。
  - 卡片视觉：琥珀色标签 `N messages compacted` + 浅灰背景展示摘要正文；遵循仓库 React 模板（Props interface、useTranslation、Tailwind、`cn()`）。
  - `ChatMessageList` 或 `MessageBubble` 在检测到 `metadata.contextCompacted` 时渲染该卡片，不与普通消息混排。
  - i18n key 补全（en + zh），`pnpm i18n:check` 绿。
  - 新增 focused test ≥ 3 case：卡片渲染、N 计数显示、无 compacted metadata 时不渲染。
  - 全量 `pnpm test:run` + `pnpm check` + `pnpm lint` 绿。
- **scope_fence**：不改 contextManager 纯函数；不改 send pipeline；不改 storage/event 底层；不新增 Extensions 入口。
- **inherited_learnings**（从 T1 ITERATE 填，初始为空）：
  - {T1 跑完后填入}

### Phase T3 — 集成边界测试 + 手动 smoke 收尾（plan Task 10）

- **goal**：补 plan Task 10 列的集成边界测试 + 跑通手动 smoke 清单，把 milestone 标记为 `verified`。
- **completion_criteria**：
  - 补测试：空/单条消息列表、滑动窗口消息顺序、`messageToAgentHistory` 跳过 tool、`createSummaryMessage` metadata 正确性（若 T1 未覆盖）。
  - 手动 smoke（plan Task 10 §手动 smoke 7 步）：`pnpm dev` → 打开 >10 条消息会话 → 切 contextMode=compact 发送 → 验证 HTTP POST body 含 history + 出现摘要卡片 → 切 full 重发验证全量。**若环境无法手动，明确标注"自动化已覆盖，手测待用户"**，不许伪装成已手测。
  - 更新 `docs/context-management-plan.md` 状态：把"待依赖恢复后复验"标注改为"已于 2026-07-XX 复验通过"，把 Task 9 状态改为完成。
  - 更新 `docs/refactor-progress.md`：在末尾追加 milestone closeout 条目（SHA + test 数 + 做了什么）。
  - 全量门禁 5 条绿。
- **scope_fence**：本 phase 是测试 + 文档 + smoke，**不新增功能代码**（除非 smoke 暴露真实 bug，需在 retro 说明）。
- **inherited_learnings**（从 T2 ITERATE 填）：
  - {T2 跑完后填入}

## 执行规则（来自 skill，重申）

1. 每个 phase 开工前，**填好 goal card**（phase_id / goal / completion_criteria / scope_fence / inherited_learnings / model）。
2. 派 **1 个 impl subagent**，prompt 自包含（≤8 个文件 + 上下文 + numbered steps + scope fence + self-review + commit 规范 + report 格式），**不让 subagent 读 plan 全文**——你把需要的摘进 prompt。
3. subagent 返回 status：
   - `DONE` → review
   - `DONE_WITH_CONCERNS` → 分类（代码缺陷→fix subagent；环境→tech_debt）
   - `BLOCKED` → 带上"试过什么 + 需要什么帮助"升级给我（用户）
   - `NEEDS_CONTEXT` → 补上下文重派**同一 phase**，不进下一 phase
4. **Review 必做**（code phase）：spec 符合度 + 代码质量。Critical/Important → fix subagent → re-review 直到通过。
5. 记录：`git rev-parse HEAD` + tech_debt 追加到 `docs/refactor-progress.md` 的 GAP 条目。
6. **ITERATE（必做）**：提取 T_N 的新事实 → 检查 T_(N+1) 假设 → 分类（NO-OP / MINOR PATCH / PROMPT REWRITE / PHASE RE-PLAN）→ 记录。
7. 一行汇报给我：`"T{N} DONE at {SHA}. Tests: {n/m/failed}. Dispatching T{N+1}: {name}."`
8. **phase 之间不要停下来问我"要继续吗"**（违反 continuous-execution）。只在 BLOCKED / PHASE RE-PLAN / fix 循环 >2 轮不收敛时停。

## 终止条件

- T1 + T2 + T3 全部 DONE 且 review 通过。
- 全量门禁 5 条绿。
- `docs/context-management-plan.md` + `docs/refactor-progress.md` 已更新。
- 工作树 clean（改动已按 phase 分 commit）。
- 给我一份 milestone closeout 报告：每个 phase 的 SHA、test 数变化、tech_debt 清单、是否有 phase 假设被 ITERATE 推翻。

## 禁止

- 不许跳过 ITERATE（"phase 跑得很顺"不是理由）。
- 不许并行派多个 impl subagent。
- 不许把沙箱阻塞写成 PASS，也不许把手测未做写成已做。
- 不许为了过测试而改断言（除非断言本身错，需在 retro 说明）。
- 不许顺手做 scope 外的重构。

开始：先调用 skill `iterative-phase-execution`，然后填 T1 goal card，派 T1 subagent。
