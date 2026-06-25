# Refactor Traceability Matrix

> 入口：[refactor-plan](./refactor-plan.md) ·
> 进度：[refactor-progress](./refactor-progress.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md) ·
> 执行门禁：[refactor-execution-gates](./refactor-execution-gates.md)
>
> 本文把用户需求、review gap、负责文档和完成证据串起来。它用于实现前审计，不代表代码已完成。

## 1. Requirement Coverage

| Requirement | Source | Owner docs | Current status | Evidence still needed |
| --- | --- | --- | --- | --- |
| 取消 Workspace 抽象，Project = cwd + 展示元数据 | user request / main plan | [project-session-redesign-plan](./project-session-redesign-plan.md), [refactor-plan](./refactor-plan.md) | active project/session storage and runtime resolver use `projectId | null`; legacy `workspaceId` remains compatibility field | remaining audit for old workspace docs/API examples and compatibility types |
| 会话归属 project 或 casual | user request / main plan | [project-session-redesign-plan](./project-session-redesign-plan.md), [workspace-session-creation-flow](./workspace-session-creation-flow.md) | implemented in storage: casual and project buckets, create/list/reassign/fork/listAll all have tests | renderer recovery UI and relink/import wizard remain |
| 消息存储从 `messages.json` 改为 JSONL structured part events + small meta | user request / main plan | [project-session-redesign-plan](./project-session-redesign-plan.md), [project-session-migration-matrix](./project-session-migration-matrix.md), [jsonl-concurrency-plan](./jsonl-concurrency-plan.md), [streaming-structured-output-plan](./streaming-structured-output-plan.md) | partially implemented: `SessionEvent` includes `assistant.part_*`, reducer replays to `Message.parts`, writer assigns `eventId + seq + writtenAt`, meta repair counts part-only assistant messages, transient parts are filtered from persistence, legacy import converts old messages to JSONL | remaining: part delta batching, broader migration recovery/export |
| 当前产品只保留 Agent 模式，不保留 direct/chat 模式切换 | user request / main plan | [agent-runtime-and-project-cleanup-plan](./agent-runtime-and-project-cleanup-plan.md), [project-session-redesign-plan](./project-session-redesign-plan.md), [refactor-plan](./refactor-plan.md) | implemented for active send/create/storage paths | remaining audit: dead compatibility APIs/types and docs examples |
| 不使用 Extensions 聚合页，保留 MCP / Skills / App Plugins 独立入口 | user request / main plan | [agent-runtime-and-project-cleanup-plan](./agent-runtime-and-project-cleanup-plan.md), [mcp-skill-redesign-plan](./mcp-skill-redesign-plan.md), [sidebar-parity-plan](./sidebar-parity-plan.md) | decision made | route/menu/sidebar audit proves `/extensions` is not user-visible |
| 所有 refactor plan 有统一入口 | user request | [refactor-plan](./refactor-plan.md), [workspace-session-index](./workspace-session-index.md), package docs README | documented | keep links current as new specs are added |
| 功能级 plan 通过索引引用，不塞进总文档 | user request | [refactor-plan](./refactor-plan.md) | documented | future PRs follow writing rule |
| 只改文档，代码等确认后再动 | user request | this doc set | respected in this documentation pass | code implementation must wait for explicit confirmation |

## 2. Gap Traceability

| Gap | Severity | Owner docs | Current status | Blocking before implementation? |
| --- | --- | --- | --- | --- |
| GAP-1 Migration/import failure matrix | P0 | [project-session-migration-matrix](./project-session-migration-matrix.md), [project-management-settings-ia](./project-management-settings-ia.md) | implemented for Option A: legacy conversations import as casual, `importSource` is retained, invalid JSON reports failure without done flag, rerun skips imported sessions and can complete after fixing failures | yes before relink/import wizard and dismissal UI |
| GAP-2 JSONL write concurrency | P0 | [jsonl-concurrency-plan](./jsonl-concurrency-plan.md), [project-session-redesign-plan](./project-session-redesign-plan.md), [refactor-execution-gates](./refactor-execution-gates.md) | partially implemented: main writer assigns event id/seq/writtenAt, parser reports malformed lines, structured part replay, part-aware meta repair, duplicate eventId drop, and 120-event append integrity are covered by tests | yes for delta batching and broader migration recovery completion |
| GAP-3 projectId hash/path normalize boundary | P0 | [path-canonicalization-plan](./path-canonicalization-plan.md), [project-session-migration-matrix](./project-session-migration-matrix.md), [data-privacy-export-plan](./data-privacy-export-plan.md) | partially implemented: hash/path.txt storage, collision fallback, symlink-as-independent-project, and Chinese/space paths have tests; legacy cwd relink/import UI remains staged | yes before relink/import wizard and export claims |
| GAP-4 runtime policy enforcement | P0 | [runtime-enforcement-matrix](./runtime-enforcement-matrix.md), [project-settings-overlay](./project-settings-overlay.md) | partially implemented: evaluate covers core operation kinds; file open, attachment read, git worktree, legacy LLM tool executor, Agent SDK canUseTool, and MCP unified `callTool` have entrypoint gates | yes for per-server MCP/third-party deny tests and remaining structured error / approval prompt paths |
| GAP-5 remote lifecycle | P1 | [remote-session-lifecycle](./remote-session-lifecycle.md), [deletion-retention-matrix](./deletion-retention-matrix.md) | documented | yes before remote-bound delete/archive work |
| GAP-6 attachment context/security | P1 | [attachment-context-plan](./attachment-context-plan.md), [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) | partially implemented: Agent prompt context consumes selected attachments through resolver and selected search provider results; advanced modes remain planned | yes before attachment context expansion |
| GAP-7 deletion/retention semantics | P1 | [deletion-retention-matrix](./deletion-retention-matrix.md), [project-management-settings-ia](./project-management-settings-ia.md) | partially implemented: session delete tombstone/restore, append blocking after delete, project physical remove and keepFiles orphan retention have tests; remote-bound cleanup and Settings recovery IA remain | yes before Phase F destructive UI |
| GAP-8 ProjectSettings overlay | P1 | [project-settings-overlay](./project-settings-overlay.md), [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) | partially implemented: storage deep merge, null clear, undefined no-op, empty-object cleanup, project runtime overlay, and session model override have tests; UI reset/source display remains | yes before settings UI/reset work |
| GAP-9 full-text/session content search | P2 | [search-index-plan](./search-index-plan.md), sidebar quick actions plan | documented as staged v1/v2/v3 | no for metadata search; yes before full-text claims |
| GAP-10 ClaudeSidebar/AppSidebar parity | P2 | [sidebar-parity-plan](./sidebar-parity-plan.md), sidebar quick actions plan, [refactor-gap-review](./refactor-gap-review.md) | documented; verify against actual shell routing before release | no, but required for parity release |
| GAP-11 shortcut conflict | P2 | sidebar quick actions plan/spec | resolved to `global-search` + `mod+p` | no; verify Electron menu before ship |
| GAP-12 Settings recovery IA | P2/P1 | [project-management-settings-ia](./project-management-settings-ia.md) | documented | yes before recovery UI |
| GAP-13 worktree preflight | P2 | [git-worktree-preflight](./git-worktree-preflight.md), Composer v2 spec | documented | yes before broad worktree UX |
| GAP-14 i18n plan discipline | P2 | [i18n-plan-discipline](./i18n-plan-discipline.md), [refactor-execution-gates](./refactor-execution-gates.md), feature specs | documented; individual UI plans must now apply it | no, but every new UI plan must list keys |
| GAP-15 data privacy | P1 | [data-privacy-export-plan](./data-privacy-export-plan.md) | documented | yes before export/diagnostics |
| GAP-16 backup/export minimum | P1 | [data-privacy-export-plan](./data-privacy-export-plan.md) | documented | yes before claiming JSONL storage shippable |
| GAP-17 structured streaming output | P1 | [streaming-structured-output-plan](./streaming-structured-output-plan.md), [jsonl-concurrency-plan](./jsonl-concurrency-plan.md) | partially implemented: shared part types, legacy adapter, turn builder, text/code/diff renderer, composer pending surface, Agent SDK text `assistant_part`, JSONL part replay, and legacy fenced code/diff splitting are covered | yes before claiming native code/diff/data/table/tree/source/artifact event streaming complete |
| GAP-18 Agent-only cleanup | P0 | [agent-runtime-and-project-cleanup-plan](./agent-runtime-and-project-cleanup-plan.md), [project-session-redesign-plan](./project-session-redesign-plan.md) | active create/send/storage paths implemented as Agent-only; direct fallback removed; skill/attachment/search context now routes through Agent prompt context | no for active chat path; yes for compatibility cleanup sweep |

## 3. No-Go Coverage

| No-Go gate | Covered by | Remaining decision |
| --- | --- | --- |
| Migration mode | [project-session-migration-matrix](./project-session-migration-matrix.md) | Option A conservative casual import is chosen; Option B only belongs to a future explicit relink/import wizard. |
| Runtime enforcement | [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) | First pass enforces hard denies for external-app/network/file write/delete/command where entrypoints can resolve session runtime; no-prompt legacy paths deny `needs-approval`, Agent SDK prompt path asks. |
| JSONL concurrency / structured part events | [jsonl-concurrency-plan](./jsonl-concurrency-plan.md), [streaming-structured-output-plan](./streaming-structured-output-plan.md), [refactor-execution-gates](./refactor-execution-gates.md) | Main process storage owns `eventId + seq + writtenAt`; malformed trailing line is recoverable, malformed middle marks corrupted; typed part replay is JSONL source of truth. |
| Project path canonicalization | [path-canonicalization-plan](./path-canonicalization-plan.md), [project-session-migration-matrix](./project-session-migration-matrix.md) | Symlink path remains an independent project; hash collision fallback uses longer hash; legacy missing cwd imports as casual with `importSource` for future relink. |
| Delete retention | [deletion-retention-matrix](./deletion-retention-matrix.md) | Session delete is tombstone soft-delete; project physical delete removes only app-managed data and never touches user cwd; keepFiles preserves app-managed orphan bucket. |
| Remote lifecycle | [remote-session-lifecycle](./remote-session-lifecycle.md) | Decide replay dedupe key source per IM platform. |
| Settings overlay | [project-settings-overlay](./project-settings-overlay.md) | Storage implements deep merge, null clear, undefined no-op, and empty-object cleanup; renderer reset/source display remains. |
| Attachment context | [attachment-context-plan](./attachment-context-plan.md) | MVP mode is text-like/reference prompt context through resolver; vision/folder/URL/MCP resource and ask-before-read UX remain deferred. |
| Privacy/export | [data-privacy-export-plan](./data-privacy-export-plan.md) | Define export manifest schema and redaction defaults. |

## 4. Implementation Readiness Verdict

| Area | Verdict | Reason |
| --- | --- | --- |
| Documentation index | ready | Active plan/spec/matrix docs are linked from [refactor-plan](./refactor-plan.md). |
| P0 data safety | partially ready | Migration mode and app-managed project storage are chosen; JSONL structured part replay, event id/seq, transient filtering, append integrity, duplicate eventId drop, and part-aware meta repair are implemented. Remaining risk: delta batching, broader migration recovery, and export/backup. |
| P0 runtime safety | partially ready | Core policy decisions and several entrypoints are wired, including Agent SDK canUseTool and MCP unified callTool; per-server MCP/third-party deny tests and some structured error / approval prompt paths remain open. |
| P1 product recovery | planned | Deletion, remote lifecycle, and Settings IA are documented but not verified. |
| P1 privacy/export | planned | Redaction/export rules are documented but not implemented or tested. |
| UI feature plans | mixed | Composer/sidebar plans exist; must respect runtime/storage gates before changing semantics. |

## 5. Completion Audit Checklist

Before declaring the refactor plan “complete enough to implement”:

- [ ] Every row in §2 has an owner doc.
- [ ] Every P0 row has a concrete implementation task and test evidence.
- [ ] Every No-Go gate in §3 has a chosen decision, not multiple options.
- [ ] [refactor-plan](./refactor-plan.md) links all active docs listed here.
- [ ] [refactor-progress](./refactor-progress.md) records current implementation evidence and remaining gaps.
- [ ] [refactor-execution-gates](./refactor-execution-gates.md) has evidence requirements for all P0/P1 areas.
- [ ] `pnpm docs:build` passes.
- [ ] Local Markdown link scan reports `missing=0`.
