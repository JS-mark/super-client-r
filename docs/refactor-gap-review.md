# Refactor Gap Review

> 入口：[refactor-plan](./refactor-plan.md) ·
> 当前主计划：[project-session-redesign-plan](./project-session-redesign-plan.md)
>
> 本文只审查文档计划，不代表代码已实现。目标是提前暴露功能缺口和边界条件，等进入实现前逐项转成 task。

## 1. Review 结论

当前 project/session 主线已经覆盖了数据模型、JSONL 存储、迁移、store、UI、右键菜单和 P0/P1 缺陷修复，但还缺少一层“上线前异常路径设计”。最需要补齐的是：迁移失败/重复、JSONL 并发写、project path 变化、remote 生命周期、附件安全、runtime policy 真正 enforcement、搜索/归档/恢复的 UX 闭环。

## 2. Code Reality Sampled On 2026-06-21

这次 review 抽样对照了当前实现，结论是：主线不是空计划，已有一批 storage/runtime/UI 骨架，但文档里的 P0/P1 仍然不是“已完成”。

| 领域 | 当前实现观察 | 对 plan 的影响 |
| --- | --- | --- |
| Legacy import | `LegacyImporter` 当前采用 Option A：旧 conversation 全部导入为 `projectId=null`，保留 `importSource`；`importAll()` 仅在没有 failures 时设置 `migrationV2Done=true`。 | 迁移默认语义已收口为保守导入；workspace path → project 映射改为后续 relink/import wizard，不再作为当前自动迁移目标。 |
| Project session storage | `SessionStorageService` 当前将 project sessions 统一写入 app userData 的 `projects/<projectId>/sessions`，并明确不写 `project.cwd/.scr-data`。 | 最新实现优先保护用户项目目录不被客户端数据污染；后续删除、备份、恢复计划都应以 app-managed data bucket 为准。 |
| Runtime policy | `RuntimePolicyService.evaluate()` 当前只真正阻断 `external-app` + `blocked`；file/network/command/tool 仍返回 `kind-not-yet-enforced`。 | runtime matrix 是 P0，不是优化项；UI 不能声称完整 sandbox/approval enforcement。 |
| Attachment context | `AttachmentContextResolver` 只支持 text-like 文件和 per-file byte cap；vision、folder、URL、ask-before-read、ignore-for-model 都在注释里 deferred。 | attachment plan 需要按阶段拆，不应一次性承诺完整能力。 |
| cwd / projectId | `normalizeCwd()` 处理 `path.resolve`、尾 slash、Windows lower-case；macOS Unicode normalize、symlink resolve 明确 out-of-scope；hash 取 sha256 前 16 位。 | path/hash 边界需补 hash collision、symlink、macOS 中文路径、移动目录后的 relink 策略。 |
| JSONL writes | `SessionStorageService.appendEvent()` 使用同步 `appendFileSync`，随后 rewrite meta；未见 per-session queue 或并发 owner。 | 并发写矩阵仍需实现/测试，尤其是 Agent SDK callback、remote bridge、UI 同时写。 |
| ProjectSettings | `ProjectStorageService.saveSettings()` 当前是 top-level shallow merge；nested `runtimePolicy` / `contextPolicy` patch 可能覆盖 sibling fields，`null` clear 尚未规范化。 | `project-settings-overlay.md` 的 deep merge / clear / sparse persistence 仍是目标契约，需要实现与测试。 |
| Delete / archive | `ProjectStorageService` 已有 archive、remove keepFiles、physical delete app-managed project dir；`SessionStorageService.delete()` 直接删 meta/jsonl/subdir。 | 删除矩阵要明确 tombstone/trash/remote unbind 后才能扩 Phase F UI。 |
| Git worktree | `GitInfoService.createWorktree()` 包装 `git worktree add -b`，错误归一化；缺 dirty/submodule/LFS/branch/upstream preflight。 | worktree preflight 属 P2，但右键菜单上线前需要最小可解释错误。 |
| Existing tests | storage 基础、fork、delete、orphan restore、renderer store/global search 有测试；缺 LegacyImporter failure matrix、runtime enforcement matrix、attachment advanced modes、tombstone/retention、settings overlay null/undefined tests。 | 实现前应把缺失测试补进对应 phase，不要只看已有测试通过。 |

## 3. P0 / P1 缺口

| ID | 严重度 | 缺口 | 影响 | 建议落点 |
| --- | --- | --- | --- | --- |
| GAP-1 | P0 | **迁移 / import wizard 没有完整失败矩阵**：重复 sessionId、半迁移后重启、旧 metadata 缺字段、旧 attachment 复制失败、remote binding 迁移、用户取消导入后的状态未定义。 | 老用户升级时可能丢可见历史或重复导入。 | `project-session-redesign-plan.md` Phase B / G-3 增补“迁移决策表 + 幂等 key + error report”。 |
| GAP-2 | P0 | **JSONL 写入并发未定义**：同一 session 被 UI、remote bridge、Agent SDK callback 同时 append 时，没有 file lock / queue / writer ownership 描述。 | 消息乱序、半行、meta `lastUpdatedAt` 与 JSONL 不一致。 | Phase A-4/A-5 增加 per-session write queue、atomic meta write、append ordering tests。 |
| GAP-3 | P0 | **projectId hash 冲突 / path normalize 边界不足**：符号链接、大小写不敏感文件系统、网络盘、Windows drive letter、尾部 slash、路径不存在时 restore 策略没有完整规则。 | 同一路径变多个 project，或不同路径合并到同一 project。 | Phase A-2/A-3 增加 canonical path policy；hash collision fallback；path.txt 校验规则。 |
| GAP-4 | P0 | **runtime policy enforcement 范围仍散**：file write、command exec、network egress、external app、MCP shell、Agent SDK permission 的统一入口未成矩阵。 | UI 显示 sandbox/approval，但实际工具路径可绕过。 | G-4 后新增 `Runtime Enforcement Matrix`，列出每个执行入口的 gate 点和 audit record。 |
| GAP-5 | P1 | **remote 会话生命周期缺边界**：bot 离线、chatId 已绑定其他 session、删除时 unbind 失败、远端消息打到已删除/归档 session、重复 webhook replay 未定义。 | remote bridge 产生孤儿绑定、重复消息或误投递。 | G-2/G-3 后追加 remote binding 状态机和 retry/tombstone 策略。 |
| GAP-6 | P1 | **附件安全和 token budgeting 缺实现级边界**：目录附件、symlink、外部 URL、二进制、图片 vision、超大文件、敏感路径、ask-before-read 的交互未形成任务。 | 附件可能被静默读取，或大文件拖垮上下文。 | 保留 `workspace-session-ui-plan.md` §9/§17，但需要单独 `attachment-context-plan.md`。 |
| GAP-7 | P1 | **删除 / 归档 / 移除的数据保留语义不够硬**：session 删除、project remove keepFiles、project archive、physical delete、orphan restore 的关系没有统一真值表。 | 用户不清楚哪些操作可恢复，开发也容易删错目录。 | Phase F 前补 `Deletion and Retention Matrix`。 |
| GAP-8 | P1 | **ProjectSettings overlay 缺 schema 边界**：global default ← project settings ← session override 的字段、空值含义、删除 override、UI 回显没有表。 | 设置“恢复默认”或局部覆盖时容易出现假默认。 | G-4 增加 overlay table 和 unset/null 语义。 |

## 4. P2 功能缺口

| ID | 缺口 | 影响 | 建议 |
| --- | --- | --- | --- |
| GAP-9 | 全文搜索 / session content search 被推迟，但 global search plan 只搜 title + preview。 | 用户历史多后很难找回内容。 | 明确两阶段：v1 metadata search，v2 JSONL derived index；避免 UI 文案暗示全文。 |
| GAP-10 | ClaudeSidebar quick actions 与 AppSidebar 不对齐。 | Codex profile 用户看不到会话搜索 / IM / 扩展入口。 | quick actions 计划里新增 AppSidebar parity follow-up。 |
| GAP-11 | keyboard shortcut 曾有冲突：spec 写 `⌘K`，implementation plan 写 `mod+p`。 | 实现时会出现快捷键口径不一致。 | 已统一为 `global-search` + `mod+p`；实现时仍需验证 Electron menu 是否抢占。 |
| GAP-12 | import wizard / orphan restore / archived projects 的 Settings 入口没有信息架构。 | 用户找不到恢复入口。 | Settings → Advanced → Project Management 需要单独小 spec。 |
| GAP-13 | project worktree 创建缺 dirty/submodule/LFS/branch tracking 策略。 | 工作树创建可能成功但不可用。 | Phase F-9 增加 git preflight table。 |
| GAP-14 | i18n 口径不统一：功能 plan 中仍允许硬编码中文。 | 后续国际化 debt 扩散。 | 新增 rule：所有新 UI plan 必须列 i18n keys，临时硬编码需标注 debt owner。 |
| GAP-15 | data privacy 未覆盖：cwd/path.txt、日志、audit、export 里会暴露本地路径。 | 日志分享或导出时泄露个人目录。 | 增加 path redaction / export privacy policy。 |
| GAP-16 | backup/sync/restore 被列为 out-of-scope，但缺“本地备份”最低能力。 | JSONL 化后用户更关心数据可搬迁。 | 至少规划“打开数据目录 / 导出 project/session archive”。 |

## 5. 已发现的文档矛盾

| 位置 | 矛盾 | 修正建议 |
| --- | --- | --- |
| `docs/workspace-session-creation-flow.md` | 仍用 `workspaceId=default` 作为主语，但顶部只说“映射为 projectId/null”，正文没有新版矩阵。 | 增加新版 project/session 创建矩阵，旧矩阵保留为 legacy。 |
| `docs/superpowers/specs/2026-06-20-claude-sidebar-quick-actions-design.md` vs plan | spec 曾写会话搜索快捷键 `⌘K`，implementation plan 写 `mod+p`。 | 已修正为 `global-search` 默认 `mod+p`，与 implementation plan 一致。 |
| `docs/superpowers/specs/2026-06-20-chat-composer-redesign-design.md` | 多处写 workspace / projectSettings，未说明新 Project 模型下的数据源。 | 改成 “project settings / legacy workspace fallback”。 |
| `project-session-redesign-plan.md` §11 | “多用户隔离已沿用”放在 out-of-scope，但 Phase A 表又要求 `<baseDir>/<userId>`。 | 改成“已有隔离沿用；多账号切换 UX out-of-scope”。 |
| `project-session-redesign-plan.md` §14 | G-1~G-7 在文档里有完成标记，但总入口如果直接说“处理 G-1/G-2/G-4”会让人误判状态。 | 总入口已改为“先复核代码与测试状态，再补齐”。 |
| `LegacyImporter` current MVP vs migration matrix | 已选择保守导入 casual session；matrix 中 workspace path → project 映射只作为未来 relink/import wizard 目标。 | 文档已按当前实现收口；后续不能把 project mapping 当作默认迁移前提。 |

## 6. 边界条件 Checklist

实现前每个 phase 至少过一遍这张表。

### Storage / Migration

- [ ] 旧 `messages.json` 缺失、空文件、非法 JSON、超大文件。
- [ ] 旧 conversation metadata 缺 `workspaceId` / `createdAt` / `updatedAt` / `remote`。
- [ ] 迁移中断后重启，是否可重复执行且不重复写 JSONL。
- [ ] 新旧 storage 双轨期间，新创建会话是否同时可被旧 UI 与新 UI 找到。
- [ ] attachment / tool-output 复制失败时，session 是否仍导入，如何标记缺失资源。
- [ ] JSONL 半行、无 trailing newline、重复 event id、乱序 tool_result。
- [ ] meta 写入失败、磁盘满、权限 denied、路径过长。

### Project / Path

- [ ] cwd 不存在、不可读、权限变化。
- [ ] symlink path 与 realpath 是否算同一 project。
- [ ] macOS / Windows 大小写差异。
- [ ] Windows drive letter、UNC path、中文/空格/emoji 路径。
- [ ] hash 冲突检测与恢复。
- [ ] 用户移动项目目录后的 orphan / restore / re-link 流程。

### Session Lifecycle

- [ ] 首条消息发送时同时改 `projectId` / `chatMode` 的竞态。
- [ ] 空 session 改绑 project 时，attachments/session dir 是否移动。
- [ ] 已有 remote binding 时是否允许改 chatMode/projectId。
- [ ] delete 当前 session 时 fallback 是否跳过 archived project/session。
- [ ] fork session 是否复制 attachments、tool outputs、runtime overrides、remote binding。
- [ ] archive project 后，active session 属于该 project 时如何切换。

### Runtime / Security

- [ ] LLM direct、Skill、MCP internal、MCP stdio、third-party MCP、Agent SDK 是否全部走同一 runtime resolver。
- [ ] file write outside project、command exec、network request、external app open 是否有统一 deny/ask/allow。
- [ ] approval grants 是否支持 once/session/project/global 的 revoke、expiry、audit。
- [ ] full-access 是否仍受 hard sandbox 限制，文案是否清楚。
- [ ] audit log retention、清理、导出脱敏。

### UI / Product

- [ ] import wizard、orphan restore、archived projects、deleted projects 是否有可发现入口。
- [ ] loading/empty/error 状态是否覆盖 Settings、Sidebar、NewConversationModal、ProjectSettings。
- [ ] keyboard shortcut 冲突、可配置、i18n 文案。
- [ ] ClaudeSidebar 与 AppSidebar 功能入口是否一致或明确差异。
- [ ] 搜索 UI 是否明确 metadata-only，不冒充全文搜索。

## 7. 已补的前置文档

| 文档 | 目的 | 优先级 |
| --- | --- | --- |
| [project-session-migration-matrix.md](./project-session-migration-matrix.md) | 迁移失败、重复、回滚、导入 UX 的完整矩阵。 | P0 |
| [runtime-enforcement-matrix.md](./runtime-enforcement-matrix.md) | 所有执行入口到 resolver/approval/sandbox/audit 的映射。 | P0 |
| [deletion-retention-matrix.md](./deletion-retention-matrix.md) | delete/archive/remove/physical delete/orphan restore 的数据保留真值表。 | P1 |
| [attachment-context-plan.md](./attachment-context-plan.md) | 附件类型、安全、token budget、ask-before-read、vision support。 | P1 |
| [project-settings-overlay.md](./project-settings-overlay.md) | global/project/session overlay 字段、unset/null、UI 回显。 | P1 |
| [refactor-execution-gates.md](./refactor-execution-gates.md) | ready / implemented / verified / shippable 的证据要求，避免历史 `✅` 被误认为当前完成。 | P0 |
| [refactor-traceability-matrix.md](./refactor-traceability-matrix.md) | 用户需求、GAP-1~GAP-16、负责文档、No-Go gate 和剩余证据的覆盖矩阵。 | P0 |
| [remote-session-lifecycle.md](./remote-session-lifecycle.md) | bot 离线、绑定冲突、重复 webhook、归档/删除/tombstone 状态机。 | P1 |
| [project-management-settings-ia.md](./project-management-settings-ia.md) | import wizard、orphan restore、archived projects、deleted/tombstoned sessions 的 Settings 入口。 | P1 |
| [git-worktree-preflight.md](./git-worktree-preflight.md) | dirty/submodule/LFS/branch tracking、runtime command gate、rollback audit。 | P2 |
| [data-privacy-export-plan.md](./data-privacy-export-plan.md) | path redaction、diagnostic export、session/project archive、本地备份最低能力。 | P1 |
| [search-index-plan.md](./search-index-plan.md) | global search metadata-only v1 与 JSONL/full-text index v2/v3 的边界。 | P2 |
| [jsonl-concurrency-plan.md](./jsonl-concurrency-plan.md) | per-session writer、event id、atomic meta write、半行恢复、并发 append 测试。 | P0 |
| [path-canonicalization-plan.md](./path-canonicalization-plan.md) | cwd normalize、symlink、missing path、hash collision、legacy cwd import/relink。 | P0 |
| [sidebar-parity-plan.md](./sidebar-parity-plan.md) | ClaudeSidebar/AppSidebar 入口一致性、global search、active fallback、Settings recovery。 | P2 |
| [i18n-plan-discipline.md](./i18n-plan-discipline.md) | 新 UI plan/spec 的 i18n key、硬编码 debt、错误文案和长文本边界。 | P2 |

## 8. 建议执行顺序

1. 实现前先读 `refactor-execution-gates.md`，确认本轮任务是 `planned`、`ready`、`implemented`、`verified` 还是 `shippable`。
2. 再读 `refactor-traceability-matrix.md`，确认目标 gap 是否已有 owner doc、No-Go decision 和证据要求。
3. 再读 `project-session-migration-matrix.md`、`jsonl-concurrency-plan.md`、`path-canonicalization-plan.md` 与 `runtime-enforcement-matrix.md`，因为它们直接影响 P0 数据安全、路径归属和权限安全。
4. Phase F 前读 `deletion-retention-matrix.md`、`remote-session-lifecycle.md`、`project-management-settings-ia.md`，避免 archive/remove/delete/remote recovery 语义扩散。
5. 改 G-4 或 attachment 前读 `project-settings-overlay.md` 与 `attachment-context-plan.md`。
6. 改 worktree 前读 `git-worktree-preflight.md`；改导出/日志/备份前读 `data-privacy-export-plan.md`；改全局搜索前读 `search-index-plan.md`；改 sidebar shell 前读 `sidebar-parity-plan.md`。
7. 新增或修改 UI 文案前读 `i18n-plan-discipline.md`，并在功能 plan/spec 中列出 i18n 范围。
8. 功能级 plan 已修正 quick action 快捷键矛盾、Composer workspace/projectSettings 术语；实现时按修正后的文档执行。
