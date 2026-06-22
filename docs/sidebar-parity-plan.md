# Sidebar Parity Plan

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口：[refactor-gap-review](./refactor-gap-review.md) GAP-10 ·
> 功能计划：[Claude sidebar quick actions](./superpowers/plans/2026-06-20-claude-sidebar-quick-actions.md)
>
> 本文只定义 `ClaudeSidebar` 与 `AppSidebar` 在重构后的能力一致性边界。

## 1. Problem

当前 sidebar 相关计划主要聚焦 `ClaudeSidebar` quick actions 和 global search。重构后实际入口可能同时存在：

- `ClaudeSidebar`：Codex/Claude 风格会话导航与 quick actions。
- `AppSidebar`：应用级导航、设置、扩展、IM、项目入口。

如果两者能力边界不清，用户可能在一个 profile 里能搜索/管理会话，在另一个 profile 里找不到入口。

## 2. Capability Matrix

| Capability | ClaudeSidebar | AppSidebar | Required parity |
| --- | --- | --- | --- |
| New casual session | yes | yes or delegated | 必须可达。 |
| New project session | yes | yes or delegated | 必须可达。 |
| Recent sessions | yes | optional | 至少一个主 sidebar 可达；另一个要有跳转。 |
| Project list | yes | yes | 数据源一致，active state 一致。 |
| Global search | yes | yes or shortcut-only | `mod+p` 在两个 shell 下都可用。 |
| Remote/IM entry | maybe | yes | 如果 ClaudeSidebar 不展示，必须提供明确 AppSidebar 跳转。 |
| Extensions/Skills | maybe | yes | 不要求视觉一致，但入口不能消失。 |
| Settings / Project Management | yes or delegated | yes | archive/orphan/import/deleted recovery 必须可发现。 |
| Archived projects | hidden by default | managed in settings | 两者不能展示互相矛盾的数量或 active state。 |
| Runtime status | compact indicators | page/detail indicators | 不要求相同 UI，但 project/session context 必须一致。 |

## 3. Allowed Differences

这些差异是允许的：

- ClaudeSidebar 可以更像会话工作台，优先 Recent、Projects、Search。
- AppSidebar 可以更像应用导航，优先 Chat、Settings、Extensions、IM。
- Quick action 视觉样式可以不同。
- 非核心入口可以通过 command palette/global search 访问，而不是两个 sidebar 都放按钮。

不允许的差异：

- 只有一个 sidebar 能创建 project session。
- 只有一个 sidebar 能打开 global search。
- active project/session 在两个 sidebar 显示不一致。
- 一个 sidebar 隐藏 archived/missing 状态，另一个仍允许进入已归档 active session。
- 快捷键在不同 shell 下绑定不同动作。

## 4. Navigation Rules

| Action | Required result |
| --- | --- |
| Open global search | 不依赖当前 route；搜索结果可导航到 session/project/settings recovery。 |
| Archive active project | 当前 session 属于 archived project 时，两个 sidebar 都切到 safe fallback。 |
| Delete active session | fallback 不能选到 archived/deleted session。 |
| Remote session incoming | 如果在 sidebar 中创建或唤醒 session，两个 sidebar 的 recent/project count 都要更新。 |
| Import/relink project | Settings recovery 完成后，两个 sidebar 都重新加载 project list。 |

## 5. Data Source Rules

- 两个 sidebar 必须使用同一 renderer store 或同一 IPC-backed source。
- 不允许一个 sidebar 读旧 workspace store，另一个读新 project store。
- sidebar 不应该自己推导 archived/missing/orphan 状态；状态来自 project/session store。
- global search 的 metadata-only/full-text 阶段文案遵循 [search-index-plan](./search-index-plan.md)。

## 6. Tests And Manual Checks

| Area | Required evidence |
| --- | --- |
| Shortcut | `mod+p` 在 chat page、settings page、extension page 都打开同一 global search。 |
| Create session | 两个 sidebar/shell 下都可创建 casual 和 project session。 |
| Active state | 切换 project/session 后两个 sidebar 显示一致。 |
| Archive/delete fallback | active project/session 被 archive/delete 后不会残留选中状态。 |
| Settings recovery | archived/orphan/deleted recovery 可从 AppSidebar 或 global search 进入。 |
| Remote update | remote incoming session 更新 recent count 和 search metadata。 |

## 7. Readiness Checklist

- [ ] `ClaudeSidebar` quick actions plan 明确哪些入口直接展示，哪些 delegated。
- [ ] `AppSidebar` 不再依赖旧 workspace-only 数据。
- [ ] global search shortcut/action id 在两个 shell 下唯一。
- [ ] Settings Project Management 可从至少一个稳定入口和 global search 打开。
- [ ] active/fallback 状态测试覆盖 archive、delete、remote incoming。
