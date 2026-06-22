# Remote Session Lifecycle

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md) ·
> 删除保留矩阵：[deletion-retention-matrix](./deletion-retention-matrix.md)
>
> 本文定义 IM bot 远端绑定会话的生命周期、重复消息处理、删除/归档边界和恢复策略。

## 1. Current Implementation Snapshot

当前 `RemoteChatBridge` 已有：

- `conversationId -> RemoteBinding` 内存表。
- `botId:chatId -> conversationId` 反向索引，避免同一远端 chat 绑定多个会话。
- 启动时从 `SessionStorage.listAll()` 读取 `meta.remote` 恢复绑定。
- incoming/outgoing 远端消息写入 per-session `remote-messages.json`。

缺口：

- 没有 tombstone；删除会话后 replay webhook 可能重新投递到旧 id 或丢失上下文。
- 没有 message id 去重；IM 平台重复投递会重复写入。
- 远端 chat 已绑定其它会话时只有同步 throw，缺少 UI recovery path。
- bot 离线、unbind 失败、归档项目收消息的语义未定义。

## 2. Binding States

| State | Meaning | Visible in UI | Accept incoming? |
| --- | --- | --- | --- |
| `active` | bot/chatId 正常绑定到 session。 | yes | yes |
| `bot-offline` | binding 存在，但 bot 未运行或不可达。 | warning | queue or show disabled |
| `archived` | session/project 被归档，binding 保留。 | hidden by default | no auto-focus; store with badge |
| `deleting` | 用户确认删除，正在 unbind / tombstone。 | modal progress | no |
| `tombstoned` | session 已删除或 project removed，但外部系统可能 replay。 | Settings recovery only | no, record audit/drop |
| `conflict` | same botId/chatId 指向另一个 live session。 | blocking dialog | no until resolved |

## 3. Incoming Message Rules

| Scenario | Behavior | Audit/report |
| --- | --- | --- |
| Active binding exists | Append remote message, broadcast to renderer. | `remote.received` |
| Duplicate platform message id | Drop duplicate, keep first. | `remote.duplicate-dropped` |
| Bot/chatId bound to deleted tombstone | Do not recreate session; store tombstone hit count. | `remote.tombstone-hit` |
| Binding points to archived session | Persist message and mark unread; do not route active focus. | `remote.archived-received` |
| Bot offline during outgoing send | Fail structured error; keep local outgoing draft unsent. | `remote.bot-offline` |
| Same botId/chatId already bound elsewhere | Block bind; offer jump/unbind old binding. | `remote.binding-conflict` |
| Unknown botId on startup | Keep binding as `bot-offline`, do not delete. | `remote.bot-missing` |

## 4. Deletion / Archive Rules

| Action | Remote behavior |
| --- | --- |
| Archive session | Keep binding; incoming messages stored but do not auto-open. |
| Delete session with remote binding | Try unbind first; if unbind fails, create tombstone and keep remote identifiers. |
| Physical delete session | Allowed only after tombstone is written or remote binding removed. |
| Archive project | All project remote sessions behave as archived. |
| Remove project keepFiles | Keep tombstones/recovery metadata with orphan project data. |
| Physical delete project | Tombstone remote-bound sessions before deleting app-managed data. |

## 5. Tombstone Shape

```ts
interface RemoteSessionTombstone {
  sessionId: string;
  projectId: string | null;
  deletedAt: number;
  remote: RemoteBinding;
  reason: "session-delete" | "project-remove" | "migration" | "manual-unbind";
  replayCount: number;
  lastReplayAt?: number;
}
```

Tombstones should live under app-managed user data, not the user's cwd.

## 6. Tests To Add

- [ ] Duplicate remote message id is dropped.
- [ ] Deleted remote-bound session creates tombstone before physical delete.
- [ ] Incoming replay to tombstone does not recreate session.
- [ ] Archived project receives remote message without changing active session.
- [ ] Bot offline on send returns structured error.
- [ ] Binding conflict offers old session id and blocks overwrite by default.
- [ ] Startup with missing bot preserves binding as recoverable.
