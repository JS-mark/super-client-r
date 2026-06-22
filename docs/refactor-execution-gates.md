# Refactor Execution Gates

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md)
>
> 本文定义开始实现、合并阶段、标记完成时需要的证据。它不替代功能 plan，只用于防止“文档写了 / checkbox 勾了”被误认为已经可交付。

## 1. Status Rules

| Status | Meaning | Allowed evidence |
| --- | --- | --- |
| `planned` | 文档定义了目标和任务。 | plan/spec/matrix 已存在，链接可达。 |
| `ready` | 可以开始写代码。 | 入口、边界、失败语义、测试清单、回滚路径都已明确。 |
| `implemented` | 代码路径已完成。 | 文件 diff + 类型检查 + 对应单元/集成测试。 |
| `verified` | 行为在真实链路里通过。 | 手测/自动化/e2e 证据覆盖用户路径和失败路径。 |
| `shippable` | 可以对用户开放。 | `verified` + rollback/feature flag + 文案/i18n + 数据迁移安全。 |

旧文档中的 `✅` 只能说明当时某个切片被认为完成；在本轮重构里，必须重新按上表复核后才能算 `verified` 或 `shippable`。

## 2. Global No-Go Gates

任一项未满足时，不应开始大范围实现：

| Gate | Required decision | Evidence |
| --- | --- | --- |
| Migration mode | 已选定保守 casual 导入；workspace path → project 映射仅作为后续 relink/import wizard。 | [project-session-migration-matrix](./project-session-migration-matrix.md) 记录 Option A 为当前实现；failure report / no silent done flag 测试继续补齐。 |
| Project session storage | 已选定 app-managed userData 分桶；不写 `project.cwd/.scr-data`。 | `SessionStorageService` 测试覆盖 writable cwd 仍落 userData、删除项目不触碰用户 cwd；相关 plan 不再要求 `.scr-data` 迁移。 |
| Runtime enforcement | 哪些 operation kind 在本轮真正 enforce，哪些仅 audit-only。 | [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) 的每个 operation 有 owner、entrypoint、test。 |
| JSONL concurrency | 同一 session 的 append owner / queue / atomic meta write 规则。 | [jsonl-concurrency-plan](./jsonl-concurrency-plan.md) 明确 per-session writer；并发 append 测试存在。 |
| Project path canonicalization | cwd normalize、symlink、missing path、hash collision、legacy cwd import/relink 规则。 | [path-canonicalization-plan](./path-canonicalization-plan.md) 的 MVP policy 被选定；collision/missing path 测试存在。 |
| Delete retention | session delete、project remove、archive、physical delete、tombstone 的最终语义。 | [deletion-retention-matrix](./deletion-retention-matrix.md) 的 action 都有 UI copy 和 tests。 |
| Remote lifecycle | remote binding、bot offline、webhook replay、tombstone 的状态机。 | [remote-session-lifecycle](./remote-session-lifecycle.md) 的 state matrix 有 tests。 |
| Settings overlay | `undefined` / `null` / empty object / nested policy merge 的持久化语义。 | [project-settings-overlay](./project-settings-overlay.md) 的 patch API 被实现并测试。 |
| Attachment context | 本轮 attachment 支持的类型和 context mode。 | [attachment-context-plan](./attachment-context-plan.md) 拆出 MVP 和 deferred 能力。 |
| Privacy/export | 是否暴露 cwd/path/audit/log/export 内容的规则。 | [data-privacy-export-plan](./data-privacy-export-plan.md) 定义 redaction 和 export modes。 |
| Sidebar parity | ClaudeSidebar/AppSidebar 能力边界和 delegated entry 是否明确。 | [sidebar-parity-plan](./sidebar-parity-plan.md) 覆盖 global search、Settings recovery、active fallback。 |
| i18n discipline | 新 UI plan 是否列出文案范围、key、硬编码 debt。 | [i18n-plan-discipline](./i18n-plan-discipline.md) 被对应功能 plan 引用。 |

## 3. Phase Gates

| Phase | Entry gate | Exit evidence |
| --- | --- | --- |
| A: storage foundation | `Project/Session` schema、path/hash policy、JSONL event protocol 已冻结。 | `pnpm check`；storage tests 覆盖 cwd/hash、ProjectStorage、SessionStorage、jsonl parse/serialize、半行恢复。 |
| B: legacy migration | Migration mode 已选；failure matrix 已转测试。 | Legacy import tests 覆盖 invalid JSON、partial failure、rerun idempotency、attachment copy failure、no silent done flag。 |
| C: renderer stores | IPC contract 稳定；stores 不切消费者。 | store tests 覆盖 load/create/delete/rename/updateMeta、project cache、error path。 |
| D: UI switch | B/C 已 verified；旧/新会话读写路径不能混用。 | 新建 casual/project session、发送、重启恢复、remote/attachment 基础路径手测通过。 |
| E: cleanup | 旧入口无活跃 consumer；迁移 rollback 已验证。 | `rg` 证明旧 workspace store/types/IPC 无运行时引用；docs 标明删除版本和 fallback。 |
| F: project menu | 删除/归档/恢复矩阵已定稿；git preflight 最小策略已定。 | 右键菜单所有动作手测；archive fallback；remove keepFiles restore；physical delete 不碰用户 cwd；worktree failure rollback。 |
| G: defect closure | G-1~G-7 每项都有当前代码证据和测试覆盖。 | 不再依赖 “✅ 完成”文字；以命令输出、测试、手测记录证明。 |

## 4. Required Test Evidence

| Area | Minimum tests before implementation is considered complete |
| --- | --- |
| Migration | `LegacyImporter` failure matrix；`migrationV2Done` 不因失败静默关闭 retry；old data untouched。 |
| Runtime | Every operation kind has either enforce test or explicit audit-only test; `approval-required` cannot silently allow without UI label. |
| JSONL | Concurrent appends preserve line integrity and meta consistency; malformed trailing line recovery tested. |
| Project path | symlink policy, path missing, hash collision fallback, macOS Unicode/path casing decision documented and tested where supported. |
| Sidebar parity | global search shortcut works in both shells; active project/session fallback is consistent after archive/delete/remote incoming. |
| i18n | New or changed user-visible copy has keys, fallback behavior, long text checks, and no raw exception text in UI. |
| Settings overlay | deep merge preserves sibling keys; `null` clears overrides; persisted settings stay sparse. |
| Attachment | small text include, over-budget downgrade, non-text reference, external path policy, sent-context snapshot. |
| Deletion | remote-bound tombstone/unbind, active fallback skips archived, physical delete never touches cwd. |
| Remote | duplicate replay drop, bot-offline structured error, tombstone hit, archived receive behavior. |
| Worktree | git preflight blocks invalid cwd/path/branch; dirty warning; runtime command gate; rollback audit. |
| Privacy/export | redaction tests; diagnostic export excludes chat/credentials by default; archives never include user cwd. |
| UI | empty/loading/error states for import wizard, project settings, archive manager, NewConversationModal, global search. |

## 5. Manual Verification Matrix

| User path | Must verify |
| --- | --- |
| First launch with old chats | Import prompt appears; user can import, delay, or dismiss; failure report remains discoverable. |
| New casual session | Create, send, reload app, search metadata, delete with expected retention. |
| New project session | Add project, create session, send with correct cwd, project settings apply, archive project routes away. |
| Attachment send | Chip mode visible before send; included/downgraded/reference decision persists. |
| Runtime denial | A blocked operation shows structured denial and audit event; no string parsing required for UI. |
| Worktree | Create worktree, failure rollback, branch/path shown in UI, app does not mutate original cwd unexpectedly. |
| Global search | Shortcut opens correct modal; result navigation works outside chat page; UI says metadata-only if not full-text. |

## 6. Documentation Completion Checklist

Before asking for code implementation sign-off:

- [ ] [refactor-plan](./refactor-plan.md) links every active plan/spec/matrix.
- [ ] [refactor-traceability-matrix](./refactor-traceability-matrix.md) maps every active P0/P1/P2 gap to an owner document and evidence requirement.
- [ ] Every feature plan states whether it changes data model, IPC, runtime policy, storage, UI only, or docs only.
- [ ] Every `✅` status in historical docs is either backed by current evidence or explicitly marked as historical/MVP.
- [ ] Every P0/P1 gap in [refactor-gap-review](./refactor-gap-review.md) has an owning matrix or phase task.
- [ ] Every destructive or privacy-sensitive action has copy requirements and audit/redaction guidance.
- [ ] Every new UI plan/spec has an i18n section or explicit no-copy-change statement.
- [ ] Sidebar/global navigation changes declare whether `ClaudeSidebar`, `AppSidebar`, or global search owns each entry.
- [ ] Validation commands are listed and can be run without requiring network.
