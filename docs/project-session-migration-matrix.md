# Project / Session Migration Matrix

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md)
>
> 本文定义旧 `chats/` / workspace 数据迁移到新 Project/Session JSONL 存储时的异常路径。实现前必须把这里的矩阵转成 tests。

## 1. Migration Invariants

1. **Copy, not move**：Phase B 只复制旧数据，不 rename、不删除旧 `chats/`。
2. **Idempotent**：同一旧 conversation 重跑迁移不会重复写 event，也不会创建重复 session。
3. **Recoverable**：任何单 session 失败不能阻塞其它 session 导入；失败原因要进入 import report。
4. **User-visible**：导入完成后必须告诉用户成功、跳过、失败数量。
5. **No silent data loss**：附件、tool output、remote binding 迁移失败时，session 仍可导入，但 meta 必须标记缺失资源。

## 2. Current Implementation Decision

当前 `LegacyImporter` 已按保守导入（Option A）落地：

- 所有旧 conversation 都导入为 casual session：`projectId = null`。
- 沿用旧 conversation id 作为 session id。
- 复制 `attachments/` 与 `tool-outputs/`。
- 不删除旧 `chats/`。
- meta 写入 `importSource.kind = "legacy-conversation"`、旧 id、旧目录和 `needsCwdReview`，供后续手动 relink / import report 使用。
- `importAll()` 仅在没有 failures 时设置 `migrationV2Done=true`；失败项保留在 report 中，后续仍可 retry。

因此当前迁移默认不再做 workspace path → project 自动映射。下面矩阵保留为未来“项目映射导入 / 手动 relink wizard”的目标，不作为当前自动迁移默认行为。

| 决策 | Option A：保守导入 | Option B：项目映射导入 |
| --- | --- | --- |
| projectId | 全部 `null`，导入后让用户手动 relink/分组。 | 按旧 workspace path / metadata cwd `ensureProject(path)`。 |
| 失败后 done flag | 只有用户选择“跳过失败项 / Never for this data”才标记 dismiss。 | 同左；失败不应静默关闭未来 retry。 |
| 风险 | 老项目归属丢失，但不误判路径。 | 路径恢复更好，但 workspace metadata 缺失/过期会制造 orphan。 |

当前选择：Option A。后续如果要启用 Option B，必须作为独立功能重新补 tests 和用户可见确认，不应静默改变已有导入语义。

## 3. Source Decision Matrix

| 旧数据 | 判定 | 目标 |
| --- | --- | --- |
| `workspaceId === "default"` 且旧 workspace 无 `path` | 普通对话 | `projectId = null` |
| `workspaceId !== "default"` 且 workspace 有 `path` | 项目对话 | `ensureProject(path)` |
| workspace 缺失但 conversation metadata 有 cwd | 项目对话 | `ensureProject(cwd)`，标 `needsCwdReview=false` |
| workspace 缺失且无 cwd | 导入为普通对话 | `projectId = null`，标 `needsCwdReview=true` |
| workspace path 不存在 | orphan project | `ensureProject(path)`，project 标 `missingPath=true` |
| conversation 无 metadata | best-effort import | session title 使用旧 id，标 `needsReview=true` |

如果选择 Option A，上表不直接执行，只作为未来“项目映射导入 / 手动 relink wizard”的目标矩阵；当前导入仍应记录足够的 `importSource`，让后续 relink 可以追溯旧 workspace/cwd。

## 4. Failure Matrix

| 场景 | 行为 | Report |
| --- | --- | --- |
| `messages.json` 不存在 | 只导入 meta，JSONL 为空 | `messagesMissing` warning |
| `messages.json` 空文件 | 导入空 session | `emptyMessages` info |
| `messages.json` 非法 JSON | 不写 JSONL；保留失败项 | `invalidMessagesJson` error |
| 单条 message 无 id | 生成 deterministic id：`legacy-${index}` | `messageIdGenerated` warning |
| 单条 message role/type 不认识 | 写 `legacy_unknown_event`，不丢原 payload | `unknownMessageType` warning |
| attachment 文件缺失 | session 导入，attachment ref 标 missing | `attachmentMissing` warning |
| attachment copy 失败 | session 导入，继续其它附件 | `attachmentCopyFailed` warning |
| project ensure 失败 | session 回退到 casual，标 `needsCwdReview` | `projectCreateFailed` error |
| JSONL append 中断 | 下次重跑从 manifest/import marker 恢复 | `partialImportRecovered` info |
| meta write 失败 | session 失败，不写 migration done | `metaWriteFailed` error |

## 5. Idempotency Keys

| Entity | Key |
| --- | --- |
| Imported session | `legacyConversationId` stored in `SessionMeta.importSource.id` |
| Imported event | deterministic `event.id = legacy:${conversationId}:${messageId || index}:${kind}` |
| Imported attachment | deterministic `attachmentId = legacy:${conversationId}:${oldAttachmentId}` |
| Imported project | `projectId = hash(normalizedCwd)` |

Re-run rules:

- If a `SessionMeta.importSource.id` already exists, skip session unless `force=true`.
- If JSONL has event ids for all source messages, skip event rewrite.
- If meta exists but JSONL is missing, rebuild JSONL and keep same session id.
- Do not set `migrationV2Done=true` while the import report contains failures; successful and skipped sessions are final, failed sessions must remain retryable.
- If a user explicitly dismisses failed legacy data in the future, record that dismissal separately from successful migration completion.

## 6. Import Report Shape

```ts
interface LegacyImportReport {
  startedAt: string;
  finishedAt: string;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  warnings: Array<{
    legacyConversationId: string;
    code: string;
    message: string;
  }>;
  failures: Array<{
    legacyConversationId: string;
    code: string;
    message: string;
    recoverable: boolean;
  }>;
}
```

## 7. UI Contract

- First launch after detecting legacy data shows a modal: “发现 N 条历史会话，是否导入？”
- Actions: `Import now`, `Remind me later`, `Never for this data`.
- `Remind me later` must not set `migrationV2Done`.
- `Never for this data` records a separate `legacyImportDismissedAt`, not `migrationV2Done`.
- After import, show summary with “查看失败详情” if failures > 0.
- Failures must leave old data untouched and link to “打开旧数据目录”.

## 8. Tests To Add

- [ ] default workspace + no path → casual.
- [ ] project path → project session.
- [ ] missing workspace config → casual with `needsCwdReview`.
- [ ] invalid messages JSON → failure report, no done flag.
- [ ] interrupted import → rerun completes without duplicates.
- [ ] attachment missing → imported with warning.
- [ ] duplicate legacy id → skipped on rerun.
- [ ] all failed sessions → no `migrationV2Done`.
- [ ] partial failures keep retry or explicit dismissed state discoverable.
- [ ] Option A imports legacy project sessions as casual but preserves old source metadata for relink.
