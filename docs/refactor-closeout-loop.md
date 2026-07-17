# 重构收口 Loop：提示词与执行框架

> 目标：收口当前未提交改动（80 文件 / +5828 行，横跨 2026-07-03~07-08 约 15 个批次），让它在完整工具链下整体过门禁、分组提交、进度文档归档。
>
> 这不是功能开发 loop，是**收口 loop**。主线功能已接线（见 [refactor-progress](./refactor-progress.md) 的 Code-Based Remaining Work Count），缺口是"这一大批改动从未在完整工具链下整体验证过"。
>
> 维护规则：每轮 retrospective 写回 [refactor-progress](./refactor-progress.md) 的 `## Gate Health Snapshot <日期>` 或 `## Closeout Loop Round <N>` 章节，下一轮 main agent 从那里读事实更新，不重复改本文。

## 1. 为什么需要 loop（而不是一次性做完）

| 风险 | 说明 |
| --- | --- |
| 整体从未验证 | 进度文档里 2026-07-03~07-08 大部分批次当时只跑过 focused tests，因 `node_modules/.bin` 反复缺失，从没跑过全量 `pnpm check` / `pnpm test:run`。 |
| 多批次叠加盲区 | Context/Memory、Multi-agent、Export/Recovery、worktree、Settings 壳、shared-types 改动交织，跨批次的类型/测试不同步只有全量跑才暴露。 |
| 历史环境阻塞干扰判断 | `serverFixture.test.ts` 和 `agentBuiltinsServer.e2e.test.ts` 在沙箱内因 `listen EPERM 0.0.0.0:3000` 跑不了，是环境问题不是代码问题，必须显式隔离，否则每轮都误判。 |
| 工具链现已齐全 | `node_modules/.bin/{vitest,tsc,oxlint}` 存在，node v22.14。loop 能真正转起来的硬前提已满足。 |

## 2. Loop 三要素

一个能转的 loop 必须有三样东西，缺一不可：

1. **Done Condition**：明确、可机器验证的结束条件（命令绿/红）。
2. **Backlog**：一组有优先级、切片化的任务，每个切片一轮能做完。
3. **Verification Gate**：每轮结束跑固定验证命令，决定这轮算不算"过"。

执行门禁已有现成定义（[refactor-execution-gates](./refactor-execution-gates.md) 的 status rules：planned/ready/implemented/verified/shippable），不需要重新发明。本文只补充当前活着的 backlog。

## 3. 角色分工

| 角色 | 职责 | 能否改文件 |
| --- | --- | --- |
| **main agent** | 编排、拆切片、决策、跑长命令（tsc/vitest 全量）、优化下一轮提示词、写 retrospective | 协调为主，必要时收尾 |
| **recon subagent（并行）** | 只读：扫代码现状、找 gap、复核"文档说的 vs 代码实际的" | ❌ 只读 |
| **impl subagent（串行）** | 拿一个明确切片独立实现 + 写 focused test，限定文件范围 | ✅ 白名单内 |

原则：

- **recon 必须只读、可并行**；impl 必须串行且限定文件范围，否则互相踩。
- 长命令（tsc 全量、vitest 全量）放 main 串行跑，它们共享 buildinfo / 进程状态，并行会互相干扰。subagent 用来做 fan-out 的只读分析。

## 4. 收口 Backlog

按依赖和风险排序，每项一轮。终止条件：工作树 clean + 全量门禁绿 + 进度文档无过期阻塞条目；连续 2 轮无新发现 → 停。

| Round | 目标切片 | Done 判据 | 文件范围 |
| --- | --- | --- | --- |
| **R1** | 整体门禁体检——跑全量 check/lint/test/i18n，产出红绿清单 | `git diff --check` 绿 + 每条命令真实结果 + 红绿清单写入进度文档 | 只读，不改文件 |
| **R2** | 修复 R1 暴露的回归——多批次叠加产生的类型/测试/lint 红项 | `pnpm check && pnpm lint && pnpm i18n:check` 全绿；`pnpm test:run` 除已知 2 个 server e2e 外全绿 | 限定 R1 报告的文件 |
| **R3** | 分组提交——按功能域切 commit，每个自洽、可回滚 | `git log` 每条 commit 单独过 focused tests；工作树 clean | 只 `git add` + `commit`，不改内容 |
| **R4** | 收尾 + 进度文档归档——把"因 node_modules/.bin 缺失未验证"的过期断言更新 | refactor-progress 阻塞条目更新或标注已解决 | 仅 docs |

分组提交建议域（R3 用）：

1. `shared-types`（packages/shared-types/src/*）
2. `Context/Memory`（contextManager / contextEventPersistence / contextSummarizer / useAgentSendPipeline / ContextInspector / ChatSettingsModal contextMode / ProjectRulesReader）
3. `Multi-agent`（subagentRunId threading / SubagentEventBridge / agentBuiltinsServer Task recursion / toolExecutorFactory agentBuiltins）
4. `native structured producer`（streamEventTranslator / useAgentEventReducer / AgentRuntimeIpcBroker assistant.part）
5. `Export/Recovery + Privacy`（SessionStorageService exportArchive includeChatContent / privacyDisplay / RecoverySettings / RecoveryWizardPanel / ArchivedProjectsPanel / diagnosticExportService / sessionArchive*）
6. `worktree preflight + paged reads`（GitInfoService preflight / gitService / worktreePreflightDisplay / NewConversationModal / ProjectContextMenu / SessionStorageService readMessagesPage / chatStore paging）
7. `Settings 壳 + 独立市场`（SettingsRail / settingsShell / IndependentMarketNotice / 各 settings page wrapper）
8. `i18n`（locales en/zh）
9. `docs`（refactor-progress / refactor-plan / requirements / design / git-worktree-preflight / tauri-migration / context-management-plan）

> 注意：删除的 `ProjectArchiveManager.tsx` 应跟 `ArchivedProjectsPanel.tsx`（新）放在同一 commit（Export/Recovery 组）。

## 5. Round 1 提示词（可直接复制使用）

```
# Loop Round 1 — 整体门禁体检（只读）

## 角色
你是 main agent。本轮只做只读验证，不改任何源码。
你可以派只读 subagent 并行收集证据，但所有结论必须由你汇总裁决。

## 硬约束（来自 AGENTS.md / refactor-execution-gates）
- 不改文件。不绕过沙箱策略。不 git add / commit（本轮）。
- 任何红项都要记下"哪条命令、哪个文件、什么报错"，不许只说"有问题"。
- 旧文档里的 ✅ 一律不算证据；以本轮命令输出为准。

## 当前代码事实（取代旧文档断言）
- 工作树有 80 个文件未提交，+5828/-606，横跨 2026-07-03~07-08 约 15 个批次
  （Settings 壳重构 / Context·Memory 多批 / Multi-agent threading /
   native structured producer / Export·Recovery 隐私 / Recovery wizard /
   worktree preflight / paged reads / 独立市场）。
- 工具链现在齐全：node_modules/.bin/{vitest,tsc,oxlint} 存在，node v22.14。
- 进度文档（refactor-progress.md）大量批次当时只跑过 focused tests，
  因 node_modules/.bin 反复缺失，从未在完整工具链下整体验证过。
- 已知历史阻塞：src/test-utils/__tests__/serverFixture.test.ts 和
  src/main/services/mcp/internal/servers/__tests__/agentBuiltinsServer.e2e.test.ts
  在沙箱内因 listen EPERM 0.0.0.0:3000 跑不了——这两个是环境问题，不是代码问题，
  要单独标注，不计入代码回归。
- 进度文档自述"核心未完成约 0 项"，所以本批大概率是验证+收口，不是新功能。

## 本轮目标（单一收敛切片）
对当前未提交改动做一次完整门禁体检，产出一份机器可读的红绿清单，
作为 R2 修复的 backlog 输入。

## Done 判据（必须全部满足才算本轮过）
1. 跑完以下命令并记录真实输出：
   - git diff --check
   - pnpm check            （tsc -b --noEmit）
   - pnpm lint             （oxlint .）
   - pnpm i18n:check
   - pnpm test:run         （vitest run 全量）
2. 对每个命令给出：PASS / FAIL / 部分PASS。FAIL 必须列出具体文件 + 报错首行。
3. 对 pnpm test:run：区分"代码回归"（FAIL） vs "沙箱阻塞"（已知2个e2e）。
4. 产出一份 markdown 表格，列：命令 | 结果 | 失败文件 | 根因分类（代码/环境/文档）。
5. 把表格写入 docs/refactor-progress.md 的新章节 "## Gate Health Snapshot <日期>"。

## 执行步骤
1. 派 2 个只读 subagent 并行预扫描（避免 main 卡在长命令）：
   - subagent-A：扫 80 个改动文件的 import/类型签名，预判 pnpm check 可能红的点
     （例如跨批次 shared-types 变更 vs renderer consumer 不同步）
   - subagent-B：扫测试文件改动，预判 pnpm test:run 可能红的点
2. main 汇总预扫描，但以实际命令输出为准，预扫描只用来排优先级。
3. 顺序跑 5 条命令（并行跑可能互相干扰 tsc 的 buildinfo，建议串行）。
4. pnpm test:run 如因 server fixture 阻塞，用 --exclude 跳过那 2 个 e2e 再跑一次，
   拿到其余 128 个 suite 的真实结果。
5. 写红绿清单到进度文档。
6. 写 retrospective：本批发现了什么、R2 应该先修哪几个最高风险回归。

## 禁止
- 不许为了"让它绿"而改源码或改测试断言。看到红就如实记录。
- 不许跳过命令。不许用 focused test 代替全量。
- 不许把沙箱阻塞伪装成 PASS。

## Retrospective 模板（本轮结束必填）
- What worked:
- What blocked:
- 代码事实更新（下一轮要替换的旧断言）:
- R2 最高优先级修复（≤5 项，带文件路径）:
- 是否继续 loop: 是/否（理由）
```

## 6. Round 2–4 提示词骨架

结构不变，只换 `## 本轮目标` / `## Done 判据` / `## 执行步骤` 三段。`## 角色`、`## 硬约束`、`## Retrospective 模板` 沿用 R1。

### Round 2 — 修复回归

```
## 当前代码事实（替换为 R1 retrospective 的输出）
{粘贴 R1 红绿清单 + R2 最高优先级修复项}

## 本轮目标
修复 R1 报告的全部代码回归（不含沙箱阻塞的 2 个 e2e）。

## Done 判据
1. R1 报告的每个红项都有对应修复 commit/diff。
2. 重跑 pnpm check && pnpm lint && pnpm i18n:check 全绿。
3. pnpm test:run 除已知 2 个 server e2e 外全绿。
4. 每个修复都附 focused test 证据（新增或已有），不只改实现。
5. 不引入新 red（对比 R1 清单只减不增）。

## 执行步骤
1. 按 R1 优先级排序，每次只修一类（如先 shared-types 同步，再 renderer consumer）。
2. 每修一类，跑对应 focused test + pnpm check 增量验证。
3. 全部修完跑全量 5 条命令复验。
4. retrospective：修了哪些、是否有 R1 没发现的次生回归。

## 禁止
- 不许改测试断言来让它过（除非确认断言本身错了，需在 retro 说明理由）。
- 不许顺手做 backlog 外的重构。
```

### Round 3 — 分组提交

```
## 前置
R2 已通过：工作树内容稳定，全量门禁绿。

## 本轮目标
按第 4 节的 9 个功能域切 commit，每个 commit 自洽、可单独回滚。

## Done 判据
1. git log 清晰，每条 commit 属于且仅属于一个功能域。
2. 每个 commit 单独 checkout 后能过该域的 focused test（抽样验证 ≥3 个 commit）。
3. 工作树最终 clean（仅剩 .codebase-memory/ .zcode/ 等工具产物，按需 .gitignore）。
4. commit message 遵循仓库惯例（feat/refactor/fix/chore/docs + scope）。

## 执行步骤
1. 先 git stash 或记录当前状态，按域分批 git add -p / git add <路径>。
2. shared-types 先提交（其他域依赖它）。
3. docs 最后提交（含 progress 文档本轮记录）。
4. 每个 commit 后跑一次该域 focused test 抽样。

## 禁止
- 不许 git commit -A 一把梭。
- 不许为了凑 commit 把不相关改动塞进同一域。
- 提交前不许再改源码内容（要改回 R2）。
```

### Round 4 — 文档归档

```
## 前置
R3 已完成：工作树 clean，所有改动已分组提交。

## 本轮目标
更新 refactor-progress.md 里"因 node_modules/.bin 缺失未验证"的过期断言，
让进度文档反映"已整体验证 + 已分组提交"的真实状态。

## Done 判据
1. refactor-progress 里所有"Blocked verification / node_modules/.bin 缺失"条目
   要么更新为"已于 <日期> 整体验证通过"，要么标注为"已 supersede，见 Gate Health Snapshot"。
2. Current Status 段反映收口后的真实状态。
3. Gate Health Snapshot 章节保留作为证据。
4. refactor-plan.md / requirements-plan.md 如有依赖该状态的断言同步更新。

## 禁止
- 不许把"沙箱阻塞的 2 个 e2e"写成"已通过"。
- 不许删除历史批次记录（只更新状态，保留轨迹）。
```

## 7. 每轮提示词优化逻辑（main agent 自动做）

每轮 retrospective 产出三样东西，喂回下一轮 prompt：

- **What worked / What didn't**：这轮哪些假设错了、哪些验证被环境阻塞。
- **Updated facts**：代码现状变化，写进下一轮的 `## 当前代码事实` 段落，**替换**旧断言。
- **Narrowed scope**：发现的新 gap 拆进 backlog，或把不成立的项删掉。

三个具体动作：

1. **收窄范围**：R1 发现 shared-types 改了但 renderer 没同步 → R2 只修这一类，不碰别的。
2. **替换事实**：把"工具链缺失"这类过期断言从 prompt 删掉，换成"已验证通过"。
3. **调整终止**：R1 发现实际红项比预期多 → 把"连续 2 轮无新发现"的阈值调高；反之收口。

下一轮 main agent 读 refactor-progress.md 的 retro 段落即可拿到事实更新，不需要手动改本文。

## 8. 何时停 loop

- ✅ 停：工作树 clean + 全量门禁绿 + 进度文档无过期阻塞条目。
- ✅ 停：连续 2 轮 recon 发现无活着的 backlog。
- ⚠️ 升级（找用户）：R1 发现红项远超预期（如 >20 个测试 fail），说明改动质量有结构性问题，需要重新评估是收口还是回滚部分批次，而不是闷头修。
- ⚠️ 升级：任何一轮需要恢复已删除的 `.scr-data` 写入 / 新增 direct/chat 模式 / 合并 Extensions 聚合页——这些触碰 refactor-plan 的硬口径，不能在 loop 内自作主张。

## 9. 可选：索引

如本文证明有用，可在 [refactor-plan](./refactor-plan.md) §5 功能 Plan 索引补一行：

```
| 收口未提交改动的 loop 框架与提示词 | [refactor-closeout-loop](./refactor-closeout-loop.md) | 把多批次未提交改动整体验证、分组提交、归档时 |
```

否则作为独立工具文档保留即可。
