# Git Worktree Preflight

> 入口：[refactor-plan](./refactor-plan.md) ·
> Composer v2 spec：[2026-06-21-chat-composer-codex-style-design](./superpowers/specs/2026-06-21-chat-composer-codex-style-design.md)
>
> 本文定义 `git worktree` 创建前后的最小安全检查。它适用于 Project 右键菜单和 Composer `LaunchModePill`。

## 1. Current Implementation Snapshot

当前 `GitInfoService.createWorktree()`：

- 直接执行 `git -C <cwd> worktree add -b <branchName> <worktreePath>`。
- 返回 `{ ok, error?, worktreePath? }`，错误归一化。
- 有 `removeWorktree()` 作为 best-effort rollback。

缺口：

- 没有目标路径、分支名、dirty/submodule/LFS/upstream、已有 worktree 的 preflight。
- `command-exec` runtime policy 尚未统一 gate。
- rollback 成功/失败没有 audit shape。

## 2. Preflight Matrix

| Check | Command / rule | Block? | UI message |
| --- | --- | --- | --- |
| cwd is git repo | `git rev-parse --is-inside-work-tree` | yes | 当前项目不是 Git 仓库 |
| target path empty/nonexistent | fs check before git | yes | 工作树目录已存在或不可写 |
| branch name valid | reject empty, whitespace-only, path traversal; optionally `git check-ref-format --branch` | yes | 分支名不合法 |
| branch already exists | `git show-ref --verify refs/heads/<branch>` | ask/yes | 分支已存在，选择检出已有分支或换名 |
| dirty source worktree | `git status --porcelain` | warn | 当前工作区有未提交变更 |
| submodules present | `.gitmodules` or `git submodule status` | warn | 新工作树可能需要初始化子模块 |
| LFS present | `.gitattributes` contains `filter=lfs` or `git lfs env` works | warn | 新工作树可能需要拉取 LFS 文件 |
| upstream missing | `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` | info | 当前分支无 upstream |
| runtime policy | `command-exec` gate | yes/ask | 需要批准 git worktree 操作 |

## 3. Creation Transaction

```text
preflight
  -> request approval if policy requires
  -> git worktree add
  -> register new Project with lineage.kind = "worktree-of"
  -> if Project registration fails:
       git worktree remove --force <worktreePath>
       report rollback result
```

Do not register the new project before git succeeds.

## 4. Audit Shape

```ts
interface WorktreeAuditEvent {
  id: string;
  createdAt: string;
  sourceProjectId: string;
  sourceCwd: string;
  worktreePath: string;
  branchName: string;
  preflight: Array<{ check: string; level: "block" | "warn" | "info"; message: string }>;
  result: "created" | "blocked" | "failed" | "rolled-back" | "rollback-failed";
}
```

The stored/exported form must redact `sourceCwd` and `worktreePath` unless the user requests full paths.

## 5. Tests To Add

- [ ] Non-git cwd blocks before command execution.
- [ ] Existing target path blocks.
- [ ] Invalid branch name blocks.
- [ ] Dirty source returns warning but can proceed after confirmation.
- [ ] Runtime command-exec policy is consulted.
- [ ] Project registration failure triggers worktree rollback.
- [ ] Rollback failure is reported without deleting user cwd.
