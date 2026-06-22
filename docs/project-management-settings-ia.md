# Project Management Settings IA

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md) ·
> 删除保留矩阵：[deletion-retention-matrix](./deletion-retention-matrix.md)
>
> 本文定义 Settings 中用于 import wizard、orphan restore、archived projects、deleted/tombstoned sessions 的信息架构。

## 1. Current Implementation Snapshot

当前已有 `ProjectArchiveManager`：

- 展示 `archived === true` 的项目。
- 支持恢复归档项目。

缺口：

- 没有统一的 Settings → Advanced → Project Management 入口规范。
- orphan restore、legacy import report、remote tombstone、deleted/trash session 尚未放入同一 IA。
- 当前文案里直接显示 cwd，缺少隐私脱敏规则。

## 2. Proposed Navigation

```text
Settings
  Advanced
    Project Management
      Active Projects
      Archived Projects
      Removed Projects / Orphans
      Legacy Imports
      Deleted Sessions
      Remote Tombstones
```

Do not scatter these entries across unrelated settings tabs. Recovery workflows need one predictable place.

## 3. Section Matrix

| Section | Shows | Primary actions | Empty state |
| --- | --- | --- | --- |
| Active Projects | registered non-archived projects | reveal in Finder, archive, settings | no projects yet |
| Archived Projects | `archived=true` projects | restore, physical delete app data | no archived projects |
| Removed Projects / Orphans | project dirs not in registry, missing cwd projects | restore, relink cwd, delete app data | no removed projects |
| Legacy Imports | import reports, skipped/failed legacy conversations | retry, dismiss, open old data dir | no legacy data |
| Deleted Sessions | trash/tombstoned sessions | restore, purge | no deleted sessions |
| Remote Tombstones | deleted remote-bound session tombstones | inspect, purge, unblock binding | no remote tombstones |

## 4. UI Copy Requirements

- Always distinguish **user cwd** from **app-managed data**.
- For every destructive action, state whether chat history, attachments, tool outputs, remote binding, and cwd remain.
- Path display should use redacted home prefix by default, e.g. `~/code/app`, with copy-full-path behind explicit action.
- Recovery lists must show counts and last updated time; do not require users to inspect directories manually.

## 5. Entry Points

| Trigger | Target |
| --- | --- |
| Import prompt failure summary | `Project Management → Legacy Imports` |
| Project removed with `keepFiles=true` | `Project Management → Removed Projects / Orphans` |
| Project archive action | `Project Management → Archived Projects` |
| Remote-bound delete creates tombstone | `Project Management → Remote Tombstones` |
| Search result references archived/deleted item | section-specific recovery panel |

## 6. Tests To Add

- [ ] Archived project appears only in Archived Projects section.
- [ ] Removed keepFiles project appears in Orphans and can be restored.
- [ ] Failed import report remains discoverable after app restart.
- [ ] Remote tombstone blocks rebind until purged or restored.
- [ ] Paths are redacted in list rows by default.
