# Data Privacy, Redaction, and Export Plan

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md)
>
> 本文定义 project/session 重构后，本地路径、日志、audit、导出和备份的隐私边界。

## 1. Data Classes

| Data | Examples | Default exposure |
| --- | --- | --- |
| Local paths | cwd, `path.txt`, attachment source, worktree path | redact in UI logs/exports |
| Chat content | user/assistant messages, tool results | export only by explicit user action |
| Runtime audit | command, path, URL, policy decision | show redacted target by default |
| Remote binding | botId, chatId, sender names | keep local; redact in diagnostics |
| Attachments | copied files, hashes, names | names visible; content export opt-in |
| Credentials | API keys, tokens, headers | never export; sanitize logs |

## 2. Redaction Rules

| Rule | Example |
| --- | --- |
| Home prefix | `/Users/mark/code/app` → `~/code/app` |
| User data root | `<userData>/super-client/...` → `<app-data>/...` |
| Deep path truncation | `~/a/b/c/d/e` → `~/a/b/.../e` in compact rows |
| URL query secrets | `?token=abc&x=1` → `?token=<redacted>&x=1` |
| Headers | `authorization`, `cookie`, `x-api-key` → `<redacted>` |
| Remote ids | show last 4 chars only unless user expands |

Full paths can be copied only through explicit actions such as “Copy full path”.

## 3. Export Modes

| Export | Includes | Excludes by default |
| --- | --- | --- |
| Session archive | meta, JSONL, selected attachments, sent context snapshots | credentials, full local paths unless requested |
| Project archive | project settings, sessions, attachments, tool outputs | user cwd directory contents |
| Diagnostic bundle | app version, feature flags, redacted logs/audit | chat content, attachments, credentials |
| Legacy import report | counts, ids, failure codes, redacted old data dir | message content unless user opts in |

## 4. Backup Minimum

Before JSONL storage is considered shippable:

- UI exposes “Open app data directory”.
- User can export one session archive.
- User can export one project archive without including the original cwd.
- Export manifest states app version, schema version, createdAt, redaction mode.

## 5. Audit / Log Retention

| Store | Default retention | User action |
| --- | --- | --- |
| Runtime audit buffer | bounded recent entries | clear audit log |
| Persistent logs | existing app policy | export redacted diagnostics |
| Remote tombstones | until purged | inspect / purge from Project Management |
| Import reports | until user dismisses or purges | retry / dismiss / open old dir |

## 6. Tests To Add

- [x] Redactor handles home path, app data path, URL query, headers.
- [x] Diagnostic export excludes chat content by default.
- [x] Session archive includes JSONL and manifest.
- [x] Project archive never copies user cwd.
- [ ] Legacy import report redacts old data dir.
- [ ] Full path copy is explicit, not part of default list rows.
