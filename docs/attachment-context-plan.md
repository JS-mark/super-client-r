# Attachment Context Plan

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md) ·
> Runtime enforcement：[runtime-enforcement-matrix](./runtime-enforcement-matrix.md)
>
> 本文定义附件如何进入模型上下文，以及哪些路径必须先经过 approval / sandbox。

## 1. Goals

1. 附件必须有明确 context mode，不能被静默全文注入。
2. 大文件、目录、外部 URL、敏感路径必须先经过预算和权限判断。
3. 消息历史要记录“实际发送给模型的 attachment refs / blocks”，便于审计和复现。
4. Vision / binary / folder / URL 不同类型分开处理，不用一个 text-only 逻辑硬套。

## 2. Current Implementation Snapshot

当前 `AttachmentContextResolver` 是最小切片：

- 从 per-session attachments 目录按 attachment id 查找文件。
- 只对 text-like 扩展名读文本并按 per-file byte cap 截断。
- 非文本或读取失败时返回 reference block。
- 注释中明确 deferred：vision/binary embedding、会话级 token budgeting、`ask-before-read`、`ignore-for-model`。

因此本文后续能力应按阶段进入实现，不能默认视为当前已具备。

## 3. Attachment Types

| Type | Detection | Default mode | Model input |
| --- | --- | --- | --- |
| `text` | text mime / small UTF-8 file | `include-content` if under budget | text block |
| `code` | known source extension | `include-content` if under budget | text block with path/lang metadata |
| `markdown` | `.md`, `.mdx` | `include-content` if under budget | text block |
| `image` | png/jpeg/webp/gif | `ask-before-read` unless user attached directly | image block when model supports vision |
| `pdf/doc` | document mime | `reference-only` | metadata until extraction pipeline exists |
| `binary` | unknown/binary mime | `reference-only` | metadata only |
| `folder` | directory path | `ask-before-read` | tree summary, never recursive full read by default |
| `url` | http/https | `ask-before-read` | fetched text only after network policy allows |
| `mcp-resource` | MCP uri | `ask-before-read` | resource content after tool/resource approval |

## 4. Context Modes

| Mode | Meaning | Requires |
| --- | --- | --- |
| `include-content` | Read content and include in model input. | token budget + runtime policy allow/approval |
| `reference-only` | Include metadata/path/name only. | no content read |
| `ask-before-read` | Prompt at send time before reading content. | approval UI |
| `ignore-for-model` | Stored in chat but not sent to model. | none |

Mode changes are per attachment per message. Changing a later message must not rewrite historical sent-context records.

## 5. Budget Rules

| Budget | Rule |
| --- | --- |
| Small text | Include directly up to configured per-attachment token cap. |
| Large text | Use `reference-only` plus summary if summarizer exists; otherwise ask user. |
| Multiple attachments | Apply total attachment context budget before normal chat history budget. |
| Images | Count by model provider constraints, not text tokens. |
| Folders | Include shallow tree only; recursive read requires explicit approval. |

If budget is exceeded, UI must show which attachments were downgraded to `reference-only`.

## 6. Security Boundaries

- Symlinks must be resolved before sandbox checks.
- Paths outside project/casual session allowed roots require approval or denial according to runtime policy.
- URLs require network policy check before fetch.
- Folder reads must never cross ignored directories by default: `.git`, `node_modules`, build outputs, caches.
- Attachment display name must not be trusted as path.
- Audit event must record actual source path/URL in a redaction-safe way.

## 7. Send-Time Flow

```text
User sends message
  -> collect message attachments
  -> resolve EffectiveSessionRuntime
  -> for each attachment:
       classify type
       apply context mode
       apply sandbox / network policy
       check token / provider capability
       produce model block OR reference metadata OR approval prompt
  -> persist SentAttachmentContext snapshot
  -> call model
```

## 8. Sent Context Snapshot

```ts
interface SentAttachmentContext {
  attachmentId: string;
  messageId: string;
  mode: "include-content" | "reference-only" | "ask-before-read" | "ignore-for-model";
  resolvedType: string;
  included: boolean;
  tokenEstimate?: number;
  contentHash?: string;
  redactedSource?: string;
  downgradeReason?: string;
}
```

## 9. UI Requirements

- Composer chip shows attachment mode and warning state.
- Hover reveals size, type, mode, budget estimate, and whether content will be sent.
- Send button should prompt when any attachment is `ask-before-read`.
- If model lacks vision support, image attachment chip must show “reference only unless model changed”.
- Failed reads keep message unsent unless user explicitly chooses “send without attachment content”.

## 10. Tests To Add

- [ ] Small text under project path → included.
- [ ] Large text over budget → downgraded with reason.
- [ ] External path with ask policy → prompt required.
- [ ] Symlink outside project → treated as outside project.
- [ ] Image + non-vision model → reference-only.
- [ ] URL with network blocked → denied before fetch.
- [ ] Folder attachment excludes `.git` and `node_modules`.
- [ ] Sent context snapshot persists included/downgraded decision.
