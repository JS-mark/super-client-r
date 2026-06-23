# Runtime Enforcement Matrix

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口 review：[refactor-gap-review](./refactor-gap-review.md)
>
> 本文定义每个执行入口必须经过的 resolver / approval / sandbox / audit gate。实现前用它检查是否还有绕过路径。

## 1. Required Decision Order

Every operation that can touch files, commands, network, external apps, MCP, or Agent SDK tools must follow this order:

1. Resolve `EffectiveSessionRuntime`.
2. Classify operation: `file-read`, `file-write`, `command-exec`, `network-request`, `external-app`, `mcp-tool`, `agent-tool`.
3. Apply hard sandbox boundary.
4. Consult approval policy and grants.
5. Execute or deny.
6. Record audit event with the final decision.

Approval can reduce prompts, but it must not bypass hard sandbox limits.

## 2. Current Implementation Snapshot

Current `RuntimePolicyService.evaluate()` covers the core policy decisions:

- `external-app`: `blocked` denies, `approval-required` returns `needs-approval`.
- `network-request`: `blocked` denies, `approval-required` returns `needs-approval`.
- `file-write` / `file-delete`: `read-only` denies; `approvalMode=request` returns `needs-approval`.
- `command-exec`: anything below `system-access` returns `needs-approval`.
- `file-read` and unknown `tool-execute` remain explicit audit-only.

Wiring status:

- File open/open-with and attachment resolver call `evaluate()`.
- Git worktree creation calls `evaluate()` and denies when approval would be required but no prompt path exists.
- Legacy LLM tool executor now calls `evaluate()` before executing classified tools; `needs-approval` without a prompt path is denied as a structured tool error.
- Agent SDK `canUseTool` now classifies tool requests and calls `evaluate()` before
  showing the SDK permission prompt; hard `deny` decisions are returned to the SDK,
  while `allow` / `needs-approval` continue through the existing approval card.
- MCP `McpService.callTool()` now accepts optional `conversationId`, classifies
  internal/builtin/market/third-party tool calls, and calls `evaluate()` before
  dispatch. Callers without a prompt path deny `needs-approval`; no-session
  callers are explicit audit-only. Tests cover no-session audit and read-only
  file-write deny, command-exec approval-required denial, and network-blocked
  denial; browser/third-party proxy approval tests still need to be expanded.

## 3. Operation Matrix

| Operation | Entry points | Required gate | Audit fields |
| --- | --- | --- | --- |
| File read | attachment resolver, file artifact open, MCP file tools, Agent SDK file tools | path normalize + project root / allowed roots + context policy | `path`, `withinProject`, `source`, `decision` |
| File write | patch/write tools, generated files, tool outputs | sandbox `file-write` + approval when outside project | `path`, `writeKind`, `beforeExists`, `decision` |
| Command exec | bash MCP, Agent SDK shell, git worktree | command classifier + cwd check + approval | `command`, `cwd`, `risk`, `decision` |
| Network request | fetch MCP, web search, third-party MCP, plugin HTTP | allowlist/blocklist + approval for unknown domains | `url`, `domain`, `method`, `decision` |
| External app | open Finder, IDE switcher, open-with-app | external-app policy | `target`, `app`, `decision` |
| MCP tool | internal, builtin, market, third-party | tool metadata → operation classifier | `serverId`, `toolName`, `operation`, `decision` |
| Agent SDK tool | Agent SDK permission callback | same classifier as MCP/tool calls | `toolName`, `inputSummary`, `decision` |
| Remote bridge | send to IM / receive from IM | binding state + session existence + tombstone check | `botId`, `chatId`, `sessionId`, `decision` |

## 4. Policy Matrix

| Policy value | Meaning | UI text constraint |
| --- | --- | --- |
| `blocked` | Always deny before execution. | Must show denial reason and recovery action. |
| `approval-required` | Prompt unless a matching grant exists. | Prompt must show operation, target, scope, duration. |
| `audit-only` | Allow but record. | UI must not imply enforcement. |
| `allowed` | Allow and record lightweight audit. | Still subject to hard sandbox. |

## 5. Grant Scope Rules

| Scope | Valid for | Invalidated by |
| --- | --- | --- |
| `once` | One operation id | operation completes |
| `session` | Same session + same operation class + matching target pattern | session delete, explicit revoke |
| `project` | Same project + same operation class + matching target pattern | project remove/archive if policy says revoke |
| `global` | Same app user + matching target pattern | explicit revoke, policy version bump |

Grant matching must include operation class and target pattern. A grant for `file-read` must not authorize `file-write`.

## 6. Enforcement Gaps To Close

- [x] Direct LLM tool executor uses `RuntimePolicyService.evaluate` before calling MCP / tool executor.
- [x] Agent SDK `canUseTool` uses the same classifier family as MCP/tool calls and records audit evidence.
- [x] Attachment reads are classified before reading file content.
- [x] File artifact open/open-with-app respects external-app policy.
- [x] Git worktree creation goes through command-exec policy, even though it is app-initiated.
- [ ] All deny paths return structured errors that renderer can show without string parsing.
- [ ] `approval-required` returns `needs-approval` only when caller has a prompt path; Agent SDK has one, legacy LLM direct tools currently deny `needs-approval` as structured tool errors.
- [ ] Tests assert every operation kind is either enforced or explicitly documented as not yet enforced.
- [ ] MCP per-server regression tests cover file-system, bash, fetch/browser, and third-party proxy paths with real session runtime policies. File-system, bash command, and fetch/network classification are covered; browser/third-party remain.

## 7. Audit Event Shape

```ts
interface RuntimeAuditEvent {
  id: string;
  createdAt: string;
  sessionId: string;
  projectId: string | null;
  operation: string;
  targetSummary: string;
  policyDecision: "allow" | "deny" | "ask" | "audit-only";
  finalDecision: "executed" | "denied" | "cancelled";
  grantId?: string;
  reason?: string;
}
```
