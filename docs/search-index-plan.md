# Search Index Plan

> 入口：[refactor-plan](./refactor-plan.md) ·
> Sidebar quick actions：[2026-06-20-claude-sidebar-quick-actions](./superpowers/plans/2026-06-20-claude-sidebar-quick-actions.md)
>
> 本文定义 global search 的阶段边界，避免 metadata-only 搜索被误认为全文搜索。

## 1. Current Implementation Snapshot

当前 quick actions 计划中的 `GlobalSessionSearchModal` 是 v1：

- 使用 renderer store 中已加载的 conversation/session metadata。
- 搜索 title + preview / loaded snippet。
- 不读取 JSONL 文件，不做全文索引。

这适合作为快速入口，但不能满足“搜索历史消息内容”。

## 2. Search Levels

| Level | Scope | Source | Latency target | Status |
| --- | --- | --- | --- | --- |
| v1 metadata | session title, preview, project name | renderer store / meta files | instant | current plan |
| v2 recent messages | last N reduced messages per session | JSONL lazy scan cache | < 500ms for common case | future |
| v3 full-text | all messages/tool results selected fields | derived SQLite/FTS or local index | indexed | future |
| v4 semantic | embeddings / RAG | derived vector index | indexed | out of scope |

## 3. UI Copy Rules

- v1 placeholder must say “Search sessions” or “Search titles and previews”.
- Do not label v1 as “Search all messages”.
- Empty state should offer “Full message search is not indexed yet” only if needed; avoid promising dates.
- Search result rows should show what field matched: title, preview, project, recent message, full text.

## 4. Index Ownership

JSONL remains source of truth. Any full-text index is derived and disposable:

- Rebuildable from JSONL + meta.
- Schema versioned.
- Safe to delete on corruption.
- Does not store credentials or full local paths.
- Respects deleted/tombstoned/archived visibility filters.

## 5. Tests To Add

- [ ] v1 search does not read JSONL.
- [ ] UI copy says metadata/title/preview scope.
- [ ] Archived sessions are excluded by default unless filter enabled.
- [ ] Deleted/tombstoned sessions are excluded.
- [ ] Future index rebuild skips corrupted JSONL lines and reports warnings.
