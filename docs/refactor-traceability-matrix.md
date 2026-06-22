# Refactor Traceability Matrix

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md) ·
> 执行门禁：[refactor-execution-gates](./refactor-execution-gates.md)
>
> 本文把用户需求、review gap、负责文档和完成证据串起来。它用于实现前审计，不代表代码已完成。

## 1. Requirement Coverage

| Requirement | Source | Owner docs | Current status | Evidence still needed |
| --- | --- | --- | --- | --- |
| 取消 Workspace 抽象，Project = cwd + 展示元数据 | user request / main plan | [project-session-redesign-plan](./project-session-redesign-plan.md), [refactor-plan](./refactor-plan.md) | planned, partially implemented in worktree | code/test audit for remaining old workspace runtime paths |
| 会话归属 project 或 casual | user request / main plan | [project-session-redesign-plan](./project-session-redesign-plan.md), [workspace-session-creation-flow](./workspace-session-creation-flow.md) | planned, partially implemented in worktree | create/send/reload tests for both session classes |
| 消息存储从 `messages.json` 改为 JSONL + small meta | user request / main plan | [project-session-redesign-plan](./project-session-redesign-plan.md), [project-session-migration-matrix](./project-session-migration-matrix.md), [jsonl-concurrency-plan](./jsonl-concurrency-plan.md) | planned, storage skeleton exists | concurrent append, malformed line, migration recovery evidence |
| 所有 refactor plan 有统一入口 | user request | [refactor-plan](./refactor-plan.md), [workspace-session-index](./workspace-session-index.md), package docs README | documented | keep links current as new specs are added |
| 功能级 plan 通过索引引用，不塞进总文档 | user request | [refactor-plan](./refactor-plan.md) | documented | future PRs follow writing rule |
| 只改文档，代码等确认后再动 | user request | this doc set | respected in this documentation pass | code implementation must wait for explicit confirmation |

## 2. Gap Traceability

| Gap | Severity | Owner docs | Current status | Blocking before implementation? |
| --- | --- | --- | --- | --- |
| GAP-1 Migration/import failure matrix | P0 | [project-session-migration-matrix](./project-session-migration-matrix.md), [project-management-settings-ia](./project-management-settings-ia.md) | documented; Option A/B decision still required | yes |
| GAP-2 JSONL write concurrency | P0 | [jsonl-concurrency-plan](./jsonl-concurrency-plan.md), [project-session-redesign-plan](./project-session-redesign-plan.md), [refactor-execution-gates](./refactor-execution-gates.md) | documented; open decisions remain on event id/seq/recovery mode | yes |
| GAP-3 projectId hash/path normalize boundary | P0 | [path-canonicalization-plan](./path-canonicalization-plan.md), [project-session-migration-matrix](./project-session-migration-matrix.md), [data-privacy-export-plan](./data-privacy-export-plan.md) | documented; symlink and legacy cwd defaults still require final decision | yes |
| GAP-4 runtime policy enforcement | P0 | [runtime-enforcement-matrix](./runtime-enforcement-matrix.md), [project-settings-overlay](./project-settings-overlay.md) | documented; implementation still MVP | yes |
| GAP-5 remote lifecycle | P1 | [remote-session-lifecycle](./remote-session-lifecycle.md), [deletion-retention-matrix](./deletion-retention-matrix.md) | documented | yes before remote-bound delete/archive work |
| GAP-6 attachment context/security | P1 | [attachment-context-plan](./attachment-context-plan.md), [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) | documented | yes before attachment context expansion |
| GAP-7 deletion/retention semantics | P1 | [deletion-retention-matrix](./deletion-retention-matrix.md), [project-management-settings-ia](./project-management-settings-ia.md) | documented | yes before Phase F destructive UI |
| GAP-8 ProjectSettings overlay | P1 | [project-settings-overlay](./project-settings-overlay.md), [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) | documented; current saveSettings shallow merge noted | yes before settings UI/reset work |
| GAP-9 full-text/session content search | P2 | [search-index-plan](./search-index-plan.md), sidebar quick actions plan | documented as staged v1/v2/v3 | no for metadata search; yes before full-text claims |
| GAP-10 ClaudeSidebar/AppSidebar parity | P2 | [sidebar-parity-plan](./sidebar-parity-plan.md), sidebar quick actions plan, [refactor-gap-review](./refactor-gap-review.md) | documented; verify against actual shell routing before release | no, but required for parity release |
| GAP-11 shortcut conflict | P2 | sidebar quick actions plan/spec | resolved to `global-search` + `mod+p` | no; verify Electron menu before ship |
| GAP-12 Settings recovery IA | P2/P1 | [project-management-settings-ia](./project-management-settings-ia.md) | documented | yes before recovery UI |
| GAP-13 worktree preflight | P2 | [git-worktree-preflight](./git-worktree-preflight.md), Composer v2 spec | documented | yes before broad worktree UX |
| GAP-14 i18n plan discipline | P2 | [i18n-plan-discipline](./i18n-plan-discipline.md), [refactor-execution-gates](./refactor-execution-gates.md), feature specs | documented; individual UI plans must now apply it | no, but every new UI plan must list keys |
| GAP-15 data privacy | P1 | [data-privacy-export-plan](./data-privacy-export-plan.md) | documented | yes before export/diagnostics |
| GAP-16 backup/export minimum | P1 | [data-privacy-export-plan](./data-privacy-export-plan.md) | documented | yes before claiming JSONL storage shippable |

## 3. No-Go Coverage

| No-Go gate | Covered by | Remaining decision |
| --- | --- | --- |
| Migration mode | [project-session-migration-matrix](./project-session-migration-matrix.md) | Choose Option A conservative import or Option B project mapping. |
| Runtime enforcement | [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) | Decide which operation kinds enforce in first implementation pass. |
| JSONL concurrency | [jsonl-concurrency-plan](./jsonl-concurrency-plan.md), [refactor-execution-gates](./refactor-execution-gates.md) | Choose event id ownership, seq usage, and recovery behavior for malformed middle lines. |
| Project path canonicalization | [path-canonicalization-plan](./path-canonicalization-plan.md), [project-session-migration-matrix](./project-session-migration-matrix.md) | Choose symlink policy, legacy missing cwd fallback, and hash collision fallback format. |
| Delete retention | [deletion-retention-matrix](./deletion-retention-matrix.md) | Decide trash vs tombstone vs direct delete for session delete. |
| Remote lifecycle | [remote-session-lifecycle](./remote-session-lifecycle.md) | Decide replay dedupe key source per IM platform. |
| Settings overlay | [project-settings-overlay](./project-settings-overlay.md) | Implement deep merge and null clear semantics. |
| Attachment context | [attachment-context-plan](./attachment-context-plan.md) | Choose MVP modes and deferred modes. |
| Privacy/export | [data-privacy-export-plan](./data-privacy-export-plan.md) | Define export manifest schema and redaction defaults. |

## 4. Implementation Readiness Verdict

| Area | Verdict | Reason |
| --- | --- | --- |
| Documentation index | ready | Active plan/spec/matrix docs are linked from [refactor-plan](./refactor-plan.md). |
| P0 data safety | not ready | Migration mode, JSONL concurrency, path canonicalization need final decisions and tests. |
| P0 runtime safety | not ready | Runtime enforcement matrix exists, but current implementation snapshot is MVP/audit-only for many kinds. |
| P1 product recovery | planned | Deletion, remote lifecycle, and Settings IA are documented but not verified. |
| P1 privacy/export | planned | Redaction/export rules are documented but not implemented or tested. |
| UI feature plans | mixed | Composer/sidebar plans exist; must respect runtime/storage gates before changing semantics. |

## 5. Completion Audit Checklist

Before declaring the refactor plan “complete enough to implement”:

- [ ] Every row in §2 has an owner doc.
- [ ] Every P0 row has a concrete implementation task and test evidence.
- [ ] Every No-Go gate in §3 has a chosen decision, not multiple options.
- [ ] [refactor-plan](./refactor-plan.md) links all active docs listed here.
- [ ] [refactor-execution-gates](./refactor-execution-gates.md) has evidence requirements for all P0/P1 areas.
- [ ] `pnpm docs:build` passes.
- [ ] Local Markdown link scan reports `missing=0`.
