# JSONL Concurrency Plan

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口：[refactor-gap-review](./refactor-gap-review.md) GAP-2 ·
> 门禁：[refactor-execution-gates](./refactor-execution-gates.md)
>
> 本文只定义 JSONL 写入并发、恢复和测试契约；不代表代码已实现。

## 1. Current Snapshot

当前抽样结论：

- `SessionStorageService.appendEvent()` 使用 `appendFileSync(jsonlPath, serializeEvent(event), "utf-8")` 写入事件。
- append 后会重写 session meta，用于维护 `lastUpdatedAt`、`messageCount` 等轻量状态。
- 文档目标是 JSONL append-only + small meta，但还没有明确同一 session 多来源并发写入时的 writer owner、队列、恢复和测试策略。

这意味着 JSONL 已经是正确方向，但不能直接把当前实现视为 shippable storage。

## 2. Sources That Can Append

同一 session 可能同时收到这些写入来源：

| Source | Example | Ordering expectation |
| --- | --- | --- |
| Renderer UI | 用户发送消息、编辑标题、删除附件引用 | 以用户动作发生顺序进入日志。 |
| Agent SDK callback | assistant delta、tool call、tool result、approval result | 同一次 run 内必须保持 callback 顺序。 |
| Remote bridge | IM webhook、bot reply、remote command | 必须先 dedupe，再 append。 |
| Migration/import | 旧 `messages.json` replay 到 JSONL | 不应和活跃 session append 混写；导入前后要有 phase boundary。 |
| Recovery/repair | 半行截断、meta rebuild、derived index rebuild | 只允许在 session 未被活跃 writer 持有时运行。 |

## 3. Required Write Ownership

实现前必须选定以下契约：

| Rule | Required behavior |
| --- | --- |
| One writer per session | 每个 `sessionId` 在主进程内有一个串行写队列。所有 append 都进入该队列。 |
| No renderer file write | Renderer 只能通过 IPC 请求 main process append，不能直接写 JSONL。 |
| Stable enqueue order | 同一 event source 内按 enqueue 顺序写入；跨 source 以进入 main process 队列的顺序为准。 |
| Event identity | 每个事件必须有 `eventId` 或可派生的 idempotency key，供 replay/dedupe 使用。 |
| Meta write follows append | meta 更新必须在对应 event 成功 append 后执行；meta 失败时不能回滚 JSONL，只能标记 repair needed。 |
| Import isolation | 正在 import 的 session 不能被 UI/remote/agent 同时 append；如果需要打开，必须先完成导入或切到 read-only。 |

MVP 可以只做 in-process per-session queue；跨进程 file lock 作为 future gate。Electron 主进程是当前唯一写入 owner 时，不应过早引入复杂 lock。

## 4. Event Protocol

每行 JSONL 至少需要支持这些字段：

| Field | Required | Notes |
| --- | --- | --- |
| `eventId` | yes | Dedupe key；可用 `sessionId + source + sourceEventId` 或 UUID。 |
| `sessionId` | yes | 必须和文件路径归属一致。 |
| `source` | yes | `ui` / `agent` / `remote` / `migration` / `repair`。 |
| `type` | yes | message/tool/approval/meta/update 等事件类型。 |
| `createdAt` | yes | 事件创建时间，不等同于写入时间。 |
| `seq` | recommended | writer 分配的单调序号，用于恢复排序和调试。 |
| `payload` | yes | 具体事件内容。 |

如果现有 schema 已经不同，实现时可以保留现有字段名，但必须满足同等能力：可排序、可 dedupe、可恢复、可审计。

## 5. Atomicity And Recovery

| Failure | Required handling |
| --- | --- |
| Half line / no trailing newline | parser 忽略最后一个 malformed trailing line，并把 repair report 写入 audit/meta。 |
| Malformed middle line | 不静默跳过；session 标记为 corrupted，需要 UI/diagnostic report。 |
| Append succeeds, meta fails | JSONL 作为 source of truth；下次 load rebuild meta，或标记 `metaNeedsRepair=true`。 |
| Meta succeeds, append fails | 不应发生；实现必须保证 append 在前、meta 在后。 |
| Disk full / permission denied | append 返回结构化错误；UI 不应显示消息已发送成功。 |
| Duplicate event id | 默认 drop duplicate；如果 payload 不一致，写 audit conflict，不覆盖原事件。 |
| Queue task throws | 后续 task 不能永久卡死；失败 task 进入 error state，队列继续处理可安全执行的后续任务。 |

meta JSON 写入应该使用 temp file + rename，避免半写 meta。

## 6. Derived State Rules

JSONL 是消息和事件 source of truth；meta 是读取性能优化。

| State | Source of truth | Repair strategy |
| --- | --- | --- |
| message count | JSONL replay | load 时可 rebuild。 |
| last message preview | JSONL replay | meta 缺失时 rebuild。 |
| `lastUpdatedAt` | latest accepted event | append 后更新；不信任比 JSONL 更新的 meta。 |
| title | explicit title event or meta | 若允许 meta-only title，必须有独立 audit/update event。 |
| attachments/tool outputs refs | JSONL event + session dir | 缺文件时标记 degraded，不删除事件。 |

## 7. Tests Required Before Implementation Is Ready

| Area | Minimum evidence |
| --- | --- |
| Concurrent append | 同一 session 100+ 并发 append，JSONL 行完整、seq 单调、meta 一致。 |
| Cross-source ordering | UI user message、agent delta、remote webhook 混合写入，队列顺序可解释。 |
| Duplicate event | 相同 `eventId` replay 不重复写；payload 冲突有 audit。 |
| Meta repair | append 成功后模拟 meta 写失败，下次 load 能 rebuild。 |
| Half-line recovery | 尾部半行被隔离，前面事件可读，repair report 可见。 |
| Import isolation | import 中的 session 不接受活跃 append，或活跃 append 被排队到 import 后。 |
| Remote replay | remote duplicate webhook 不重复产生用户消息。 |

## 8. Open Decisions

实现前需要明确：

1. `eventId` 是否由调用方提供，还是统一由 storage writer 分配。
2. 是否在 MVP 引入 `seq`，还是只依赖 line order。
3. malformed middle line 是阻断整个 session 读取，还是读取前后两段并标记 corrupted。
4. remote webhook 的 idempotency key 使用 IM 平台 message id、chat id + timestamp，还是 bridge 自建 key。
5. meta repair 是否自动执行，还是先暴露 recovery action。

## 9. Readiness Checklist

- [ ] `SessionStorageService` 有 per-session write queue 或等价串行 writer。
- [ ] JSONL event 协议包含 dedupe 和排序能力。
- [ ] meta write 使用 atomic temp + rename。
- [ ] load path 能处理尾部半行和 meta rebuild。
- [ ] 并发、半写、重复、remote replay 测试已加入。
- [ ] [refactor-traceability-matrix](./refactor-traceability-matrix.md) 的 GAP-2 不再是 “identified only”。
