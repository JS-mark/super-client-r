# Project Path Canonicalization Plan

> 入口：[refactor-plan](./refactor-plan.md) ·
> 缺口：[refactor-gap-review](./refactor-gap-review.md) GAP-3 ·
> 迁移：[project-session-migration-matrix](./project-session-migration-matrix.md)
>
> 本文定义 `Project = cwd + 展示元数据` 下的路径规范化、projectId、hash collision 和 re-link 规则。

## 1. Current Snapshot

当前抽样结论：

- `normalizeCwd()` 使用 `path.resolve()`，去掉尾部 slash/backslash。
- Windows 路径会 lower-case；macOS Unicode normalize 与 symlink realpath 在注释中标为 out-of-scope。
- `hashCwd()` 对 normalized cwd 做 sha256，取前 16 hex。
- `ProjectStorageService.add()` 按 hash idempotent 创建 project，并写入 `path.txt`。
- 还没有专门文档定义 symlink、大小写文件系统、网络盘、路径不存在和 hash collision。

## 2. Terminology

| Term | Meaning |
| --- | --- |
| `inputPath` | 用户或系统传入的原始路径。只用于审计和错误提示，不作为 id。 |
| `normalizedPath` | 经 `path.resolve`、尾部 slash 处理、平台大小写策略后的路径。 |
| `realPath` | 通过 filesystem realpath 得到的物理路径；可能失败，也可能改变 symlink 语义。 |
| `displayPath` | UI 展示路径，可能被 privacy plan 脱敏。 |
| `projectId` | storage id，默认由 canonical hash 派生。 |
| `path.txt` | app-managed project record 中保存的路径锚点，用于 restore/relink。 |

## 3. Canonical Path Policy

推荐 MVP：

| Case | MVP rule | Future option |
| --- | --- | --- |
| Relative path | 先 `path.resolve` 成绝对路径。 | 无。 |
| Trailing slash | 去掉尾部 slash/backslash，root 除外。 | 无。 |
| Windows drive letter | drive letter 和路径统一 lower-case。 | 保留原 display case。 |
| macOS case | 不强制 lower-case。 | 按 volume case sensitivity 检测。 |
| Unicode | 不做 NFC/NFD 改写，但测试中文和 emoji 路径。 | macOS 上记录 normalized Unicode form。 |
| Symlink | 默认把 symlink path 当独立 project，不自动 realpath 合并。 | 提供 “link to existing project” 提示。 |
| Missing path | 允许 project record 存在，但状态为 missing/orphan。 | 提供 relink wizard。 |
| Network/removable disk | 不阻止创建；load 时标记 unavailable。 | 增加 volume id 识别。 |

关键原则：不要在没有 UI 提示的情况下把用户输入的 symlink project 自动合并到 realpath project。

## 4. ProjectId And Collision Rules

| Rule | Required behavior |
| --- | --- |
| Hash input | MVP 使用 `normalizedPath`，不是 displayPath。 |
| Collision detection | 创建 project 时，如果 `projectId` 已存在但 `path.txt` 指向不同 canonical path，必须进入 collision handling。 |
| Collision fallback | 使用加长 hash 或 `hash + "-2"` 这类确定性 fallback；不能覆盖旧 project。 |
| Path drift | load 时发现 `path.txt` 与当前 normalized path 不一致，记录 audit，不自动改 id。 |
| Manual relink | orphan/missing project 只能通过明确 UI action 绑定到新 path。 |

16 hex sha256 足够低概率，但实现仍要处理 collision，因为 collision 也可能来自旧数据、手动改文件或未来 hash 策略变化。

## 5. Migration Rules

旧 workspace/session 导入时：

| Input | Required handling |
| --- | --- |
| Legacy workspace has cwd | 按本文 canonical policy 生成或匹配 project。 |
| Legacy workspace cwd missing | 导入为 orphan project 或按 migration matrix 选择 casual import。 |
| Duplicate legacy workspaces same cwd | 合并到同一 project，并保留 legacy ids 到 import report。 |
| Same cwd via symlink and realpath | 按 MVP 视为不同 project，除非用户选择 relink。 |
| Invalid path string | 不阻断 session 导入；记录 error report，并可选择 casual fallback。 |

如果最终选择 “全部 legacy session 先导入 casual”，本文仍适用于用户后续手动 relink project。

## 6. UI And Recovery Requirements

| State | UI requirement |
| --- | --- |
| Project path exists | 可正常打开、显示 Finder/terminal/git 操作入口。 |
| Path missing | Sidebar/Settings 显示 unavailable；允许 relink、archive、remove record。 |
| Permission denied | 区分 missing 与 denied；不自动删除 record。 |
| Hash collision | Settings recovery 中显示冲突 project，并要求用户选择保留/重命名/relink。 |
| Symlink duplicate | 如果检测到 realpath 相同，可以提示 “可能是同一目录”，但不能自动合并。 |

UI 文案需要遵循 [data-privacy-export-plan](./data-privacy-export-plan.md) 的路径脱敏规则。

## 7. Tests Required

| Area | Minimum evidence |
| --- | --- |
| Normalize | relative path、trailing slash、root、spaces、中文、emoji。 |
| Platform cases | Windows drive/UNC path 单元测试；macOS case 规则以当前平台或 mock 覆盖。 |
| Symlink | symlink 与 realpath 是否生成两个 project 的测试。 |
| Missing path | path 不存在时 project record 可 load，状态为 missing。 |
| Collision | 人工制造 hash/id 冲突时不覆盖旧 project。 |
| Migration | duplicate legacy cwd、invalid cwd、missing cwd 的 import report。 |
| Privacy | display/log/export 中路径按 privacy plan 脱敏。 |

## 8. Open Decisions

1. symlink 是否长期保持独立 project，还是未来提供 “按 realpath 合并” 设置。
2. macOS 是否需要 NFC/NFD normalize，尤其是中文目录名。
3. hash fallback 采用加长 hash、suffix，还是保存 explicit random id。
4. legacy workspace cwd 缺失时默认 orphan project 还是 casual session。

## 9. Readiness Checklist

- [ ] `normalizeCwd` 的规则和本文一致，或者本文被更新为实现真实规则。
- [ ] collision handling 不会覆盖旧 project。
- [ ] missing/orphan/relink UI 已在 [project-management-settings-ia](./project-management-settings-ia.md) 里有入口。
- [ ] migration matrix 明确 legacy cwd 到 project/casual 的选择。
- [ ] 测试覆盖 symlink、中文路径、missing path、hash collision。
