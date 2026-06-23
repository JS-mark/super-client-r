# Deletion and Retention Matrix

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md)
>
> 本文定义删除、归档、移除、物理删除、孤儿恢复之间的数据保留语义。

## 1. Terms

| Term | Meaning |
| --- | --- |
| Archive session | Hide session from main lists, keep all data. |
| Delete session | Remove session from active product state; may keep recoverable files depending on retention policy. |
| Archive project | Hide project and its sessions from main lists, keep data. |
| Remove project with keepFiles | Remove project registry entry, keep project directory under app data for restore. |
| Physical delete project | Delete project registry entry and app-managed project data. Must never delete the user's cwd. |
| Orphan project | Project registry/data exists but cwd path no longer exists. |

## 2. Current Implementation Snapshot

当前 storage 已经有部分能力：

- `ProjectStorageService.archive()` 只切 `archived` flag。
- `ProjectStorageService.remove(id, { keepFiles: true })` 会移除 registry，但保留 app-managed project dir，供 orphan restore。
- `ProjectStorageService.remove(id)` 默认删除 app-managed project dir。
- `SessionStorageService.delete()` soft-deletes session meta with `deletedAt` + `tombstone`; JSONL、attachments、tool outputs stay in place for recovery.
- `SessionStorageService.restoreDeleted()` clears the tombstone and makes the session visible again.

缺口：

- remote-bound session、运行中的 Agent callback、late webhook replay 没有统一 tombstone 策略。
- UI copy 和 destructive confirmation 还没有按下表绑定到具体 action。

## 3. Retention Matrix

| Action | Registry | JSONL/meta | attachments/tool outputs | User cwd | Recoverable? |
| --- | --- | --- | --- | --- | --- |
| Archive session | keep | keep | keep | unchanged | yes |
| Delete session | hidden from active lists via `deletedAt` | keep in place with tombstone meta | keep in place | unchanged | yes via `restoreDeleted` |
| Archive project | keep with `archived=true` | keep | keep | unchanged | yes |
| Remove project, keep files | remove registry row | keep under app data | keep | unchanged | yes via orphan restore |
| Physical delete project | remove registry row | delete app-managed project data | delete app-managed copies | unchanged | no |
| Cwd missing | keep registry | keep | keep | missing externally | yes after relink |

## 4. Non-Negotiable Rules

- Never delete the user's actual project cwd from this app.
- “Physical delete project” only deletes app-managed metadata, sessions, attachments, and tool outputs.
- Remote bindings must be unbound or tombstoned before any future session physical cleanup.
- Active session fallback must skip archived sessions and archived projects.
- Any destructive modal must name exactly what will be deleted and what will remain.

## 5. Tombstone Rules

Use tombstones when external systems may still send events:

| Entity | Tombstone needed? | Reason |
| --- | --- | --- |
| Remote-bound session | yes | Bot/webhook may replay messages after delete. |
| Session with running Agent SDK task | yes | Late callbacks may arrive. |
| Project removed with keepFiles | yes | Restore needs original id/path metadata. |
| Plain empty local session | optional | No external callbacks. |

Tombstone minimum fields:

```ts
interface Tombstone {
  id: string;
  kind: "session" | "project";
  deletedAt: string;
  reason: "user-delete" | "project-remove" | "migration";
  remoteBinding?: unknown;
  restoreHint?: string;
}
```

## 6. UI Copy Requirements

| Action | Modal copy must include |
| --- | --- |
| Delete session | Whether remote binding will be unbound; whether attachments/tool outputs remain recoverable. |
| Archive project | Sessions are hidden but not deleted. |
| Remove project keepFiles | Project disappears from sidebar; data can be restored from Settings. |
| Physical delete project | App metadata and sessions are permanently removed; cwd is not touched. |
| Restore orphan | New cwd path if relinking; whether original path is still missing. |

## 7. Tests To Add

- [ ] Delete active session picks next non-archived session outside archived projects.
- [x] Session delete creates tombstone, hides from normal lists, preserves JSONL, and blocks new appends.
- [x] Restore deleted session clears tombstone and makes it visible again.
- [ ] Delete remote-bound session creates tombstone or unbinds before future physical cleanup.
- [ ] Archive current project routes away from its active session.
- [x] Remove project keepFiles preserves app-managed project/session bucket for orphan restore.
- [x] Physical delete does not touch user cwd.
- [ ] Missing cwd project shows orphan recovery path.
