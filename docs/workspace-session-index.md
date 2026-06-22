# Workspace / Session 文档索引

> 当前重构总入口：[refactor-plan.md](./refactor-plan.md)。
>
> 本文保留为旧链接兼容入口。新任务先读总入口，再按索引进入具体功能 plan。

工作区与会话核心运行时改造的历史文档汇总。从这里可以找到旧 plan、审计和评审，但当前 project/session 主线以 [refactor-plan.md](./refactor-plan.md) 与 [project-session-redesign-plan.md](./project-session-redesign-plan.md) 为准。

| 文档 | 用途 | 何时读 |
| --- | --- | --- |
| [refactor-plan.md](./refactor-plan.md) | 当前重构总入口：文档 review 结论、主线 roadmap、功能 plan 索引、维护规则 | 开始任何重构任务前 |
| [refactor-execution-gates.md](./refactor-execution-gates.md) | 执行门禁：定义 ready / implemented / verified / shippable 的证据要求 | 开始实现、合并阶段、或把 task 标记完成前 |
| [project-session-redesign-plan.md](./project-session-redesign-plan.md) | 当前主计划：取消独立 Workspace 抽象，改为 Project(cwd)+Session，JSONL 存储，Phase A-G | 做 project/session 数据、迁移、store、UI、清理、缺陷修复时 |
| [refactor-gap-review.md](./refactor-gap-review.md) | 缺口 review：功能缺失、边界条件、文档矛盾、前置矩阵索引 | 进入实现前做风险收敛时 |
| [workspace-session-ui-plan.md](./workspace-session-ui-plan.md) | 历史规划：产品模型、交互档案、各功能 UI/行为、运行时类型、迁移阶段、任务清单、验收标准 | 查运行时、UI shell、approval、sandbox 等历史要求时 |
| [workspace-session-implementation-audit.md](./workspace-session-implementation-audit.md) | Phase 0 审计：现有代码相对 plan 的差距，按主题分节列出实际文件与现状 | 验证 plan 假设是否还成立、决定下个 task 时 |
| [workspace-session-plan-review.md](./workspace-session-plan-review.md) | 计划审查 + 补充发现 + Pre-Phase 1 任务清单（含 Addendum） | 需要查 critical/medium/low gap、决定 unblock 顺序时 |

## 推荐阅读顺序

新加入的人：`refactor-plan.md` → `refactor-execution-gates.md` → `project-session-redesign-plan.md` §1-8 → 只读当前任务相关的功能 plan。

执行旧 Workspace/Session 遗留 task：读 `workspace-session-plan-review.md` / `workspace-session-task-queue.md` 对应小节，并先确认是否已被 `project-session-redesign-plan.md` supersede。

## 文档维护规则

`workspace-session-ui-plan.md` 已停止追加新章节。后续不再拆它作为当前主计划，而是在 [refactor-plan.md](./refactor-plan.md) 中维护总入口，通过功能 plan 索引分流。

具体功能计划继续放在 `docs/superpowers/plans/` 或对应 package docs；不要再把新的功能 spec 追加到 `workspace-session-ui-plan.md`。
