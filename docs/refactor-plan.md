# Super Client R 重构总计划

> 本文是重构工作的唯一总入口。具体功能 plan 保留在各自文档中，通过本文索引进入。
>
> 维护规则：新重构决策先更新本文；功能级实现细节写到对应 plan；不要继续往旧的 `workspace-session-ui-plan.md` 追加新章节。

## 1. 当前结论

这轮文档 review 后，当前重构口径如下：

1. **项目 / 会话重设计是主线**：`Project = cwd 路径 + 展示元数据`，不再把 `Workspace` 当作独立配置实体。
2. **会话存储正式升级为 JSONL structured part events + 小 meta**：消息日志 append-only，assistant text/code/diff/tool/data 等输出按 typed part event 持久化；session meta / project settings 作为小 JSON 维护。
3. **项目会话数据按当前实现统一写在 app userData**：普通会话在 `casual-sessions/`，项目会话在 `projects/<projectId>/sessions/`；项目 `cwd` 只作为 Agent/runtime 工作目录，不写入客户端 `.scr-data`，也不在删除项目时触碰用户真实项目目录。
4. **当前产品只保留 Agent 模式**：不再提供 direct/chat 对话模式切换；历史 `chatMode/direct` 文档只作为 migration/compatibility 参考，新实现路径一律走 Agent runtime。
5. **不使用 Extensions 聚合页**：`/mcp`、`/skills`、`/plugins` 保持独立市场/管理入口；应用插件不混入 Agent capability 产品入口。
6. **旧 Workspace/Session plan 只作为历史上下文**：其中权限、sandbox、attachments 等运行时要求仍可复用；所有独立 `WorkspaceConfig`、`chatMode/direct`、`Extensions` 产品模型描述以新 project/session plan 和功能 plan 为准。
7. **功能计划不合并进总文档正文**：composer、sidebar quick actions、skill validation 等具体计划通过索引引用，避免总文档继续膨胀。

## 2. Implementation Readiness

**当前判定：已进入分批实现阶段，但还不能声明整体重构完成。** Project/session 主线、Agent-only 发送/storage 写入、Agent prompt 附件/搜索上下文注入、composer pending approval、消息虚拟列表、Agent SDK text stream → `assistant_part`、JSONL structured part 基础协议、legacy fenced code/diff 展示、MCP unified runtime gate 已有实现与测试覆盖；per-server runtime 回归、导出/备份、native code/diff/data 专用事件流仍是后续收口项。

开工前硬门槛：

1. **迁移语义已按当前实现收口为保守导入**：旧会话全部导入为 casual session，并保留 `importSource` 供后续 relink；`importAll()` 仅在没有 failures 时设置 `migrationV2Done=true`。后续如需 workspace path → project 映射，应作为独立 relink/import wizard，不再作为当前自动迁移默认行为。
2. **Runtime enforcement 入口继续补齐**：当前 `RuntimePolicyService.evaluate()` 已覆盖 external-app、network、file write/delete、command exec 的核心决策；file open、attachment read、git worktree、legacy LLM tool executor、Agent SDK `canUseTool`、MCP unified `callTool` 已接入。per-server MCP/third-party deny tests 和部分 structured error / approval prompt paths 仍需按 [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) 继续收口。
3. **JSONL 写入 owner 已按当前实现收口为 main process storage**：`SessionStorageService.appendEvent()` 同步 append，统一分配 `eventId + seq + writtenAt`；JSONL reducer 已支持 `assistant.part_*` replay，meta repair 会按唯一 user / assistant / `assistant.part_start(messageId)` 重建 messageCount；transient parts 不落盘。后续仍需补 part delta batching 和更完整迁移恢复。
4. **删除/归档/恢复语义先固定**：当前 storage 已有 project physical delete / keepFiles / archive 能力；session delete 已改为 tombstone soft-delete，并支持 `restoreDeleted()`。Phase F 右键菜单前仍需按 [deletion-retention-matrix](./deletion-retention-matrix.md) 补齐 remote unbind / Settings recovery。
5. **附件 context 先选实现切片**：当前 resolver 是 text-like MVP，Agent 发送链路已把本轮附件解析结果注入 prompt；ask-before-read、vision、folder、URL、MCP resource、token budgeting 需要按 [attachment-context-plan](./attachment-context-plan.md) 拆成阶段。

建议执行方式：

- 可以先做**文档驱动的 P0 收敛 PR**：只补 migration/runtime/jsonl/delete/attachment 的测试清单与接口契约，不改 UI 大面。
- Composer 和 sidebar quick actions 可独立推进，但不要用它们来隐式改变 project/session/runtime 语义。
- 开工、合并、标记完成时按 [refactor-execution-gates](./refactor-execution-gates.md) 判断；旧文档里的 `✅` 只算历史状态，不能单独作为当前完成证据。

## 3. 文档 Review 结果

| 文档 | 状态 | 结论 |
| --- | --- | --- |
| [project-session-redesign-plan.md](./project-session-redesign-plan.md) | **当前主计划** | 覆盖 project/session 数据模型、存储、迁移、UI、Phase A-G。作为实现时的主依据。 |
| [workspace-session-ui-plan.md](./workspace-session-ui-plan.md) | 历史主计划 / 运行时参考 | UI shell、approval、sandbox、attachments、plan modes、extensions 的要求仍有价值；其中 `Workspace` 作为一等配置实体的章节已被新主计划 supersede。 |
| [workspace-session-plan-review.md](./workspace-session-plan-review.md) | 历史评审 | 记录了早期 critical gap：双 workspace、model scope、approval grants、attachment pipeline、ElectronAPI contract。大部分已转化为后续 R/G 任务。 |
| [workspace-session-implementation-audit.md](./workspace-session-implementation-audit.md) | 历史审计 | 作为代码现状证据使用；实现前可读相关小节确认旧假设是否还成立。 |
| [workspace-session-task-queue.md](./workspace-session-task-queue.md) | 旧任务队列 / 进度参考 | 记录 Workspace/Session 第一阶段与 R backlog 的推进状态；新任务应回到本文路线图或对应功能 plan。 |
| [workspace-session-creation-flow.md](./workspace-session-creation-flow.md) | 链路参考 | 创建 / 删除链路的流程图与 checklist 仍可复用；在新模型下把 `workspaceId` 映射为 `projectId | null`。 |
| [refactor-gap-review.md](./refactor-gap-review.md) | 缺口 review：功能缺失、边界条件、文档矛盾、建议新增的前置矩阵 | 进入实现前做风险收敛时 |
| [refactor-execution-gates.md](./refactor-execution-gates.md) | 执行门禁 | 定义 ready / implemented / verified / shippable 的证据要求；开始实现或声称完成前必须读。 |
| [refactor-traceability-matrix.md](./refactor-traceability-matrix.md) | 覆盖矩阵 | 把用户需求、GAP-1~GAP-16、负责文档、No-Go gate 和剩余证据串起来。 |
| [workspace-session-index.md](./workspace-session-index.md) | 兼容入口 | 保留给旧链接；实际入口应跳转到本文。 |
| [superpowers/plans/2026-06-20-chat-composer-redesign.md](./superpowers/plans/2026-06-20-chat-composer-redesign.md) | 功能级 plan | Composer 视觉与交互改造，不属于数据模型主线。 |
| [superpowers/plans/2026-06-20-claude-sidebar-quick-actions.md](./superpowers/plans/2026-06-20-claude-sidebar-quick-actions.md) | 功能级 plan | Sidebar quick actions / global search 计划，不属于数据模型主线。 |
| [superpowers/specs/2026-06-21-chat-composer-codex-style-design.md](./superpowers/specs/2026-06-21-chat-composer-codex-style-design.md) | 功能级 spec | Composer v2 Codex 风格：Project/LaunchMode/Branch/Approval/Model pills 与相关 git IPC。 |
| [remote-session-lifecycle.md](./remote-session-lifecycle.md) | 缺口矩阵 | Remote IM 绑定、bot 离线、重复 webhook、删除 tombstone、归档收消息状态机。 |
| [project-management-settings-ia.md](./project-management-settings-ia.md) | 产品 IA | Settings → Advanced → Project Management 下的 archive/orphan/import/deleted/remote recovery 入口。 |
| [git-worktree-preflight.md](./git-worktree-preflight.md) | 缺口矩阵 | Project 右键和 Composer LaunchMode 的 git worktree preflight、rollback、audit。 |
| [data-privacy-export-plan.md](./data-privacy-export-plan.md) | 安全/隐私 plan | cwd/path/log/audit/export/backup 的脱敏、导出和备份最低能力。 |
| [search-index-plan.md](./search-index-plan.md) | 功能边界 plan | Global search v1 metadata-only 与未来 JSONL/full-text index 的阶段边界。 |
| [jsonl-concurrency-plan.md](./jsonl-concurrency-plan.md) | 存储一致性 plan | JSONL per-session writer、event id、meta atomic write、半行恢复、并发测试。 |
| [path-canonicalization-plan.md](./path-canonicalization-plan.md) | 路径规范 plan | cwd normalize、symlink、missing path、hash collision、legacy cwd import/relink。 |
| [sidebar-parity-plan.md](./sidebar-parity-plan.md) | UI parity plan | ClaudeSidebar/AppSidebar 的入口一致性、global search、active fallback、Settings recovery。 |
| [i18n-plan-discipline.md](./i18n-plan-discipline.md) | 文案约束 plan | 新 UI plan/spec 的 i18n key、硬编码 debt、错误文案和长文本边界。 |
| [../packages/docs/SKILL_VALIDATION_REFACTOR.md](../packages/docs/SKILL_VALIDATION_REFACTOR.md) | 独立重构计划 | Skill 校验机制整改，和 project/session 主线独立。 |

## 4. 当前主线 Roadmap

主线来自 [project-session-redesign-plan.md](./project-session-redesign-plan.md)，本文只保留执行索引和优先级。

| Phase | 范围 | 当前口径 |
| --- | --- | --- |
| A | 数据层并行实现 | 新 shared types、cwd hash、ProjectStorageService、JSONL utils、SessionStorageService、IPC。纯加法，不切 UI。 |
| B | 旧 chats 迁移 | 旧 `messages.json` copy 到 JSONL，不删除旧数据；升级路径必须可回滚。 |
| C | Renderer store 准备 | 新增 `useProjectStore` / `useSessionListStore`，先不切消费者。 |
| D | UI 重做 | Sidebar 改为 Recent + Projects；NewConversationModal 选 project；删除 `/workspaces` 旧入口。 |
| E | 清理旧 Workspace | 删除旧 workspace store/types/IPC 与迁移脚本中不再需要的部分。 |
| F | Project 右键菜单 | 置顶、Finder 显示、永久 worktree、重命名、归档、移除。 |
| G | 实施缺陷修复 | P0/P1 缺陷修复：cwd、approval/remote/attachments storage、升级 import、runtime resolver、legacy chatMode cleanup / agent-only enforcement。文档中已有完成标记的 task，进入代码实现前必须先用实际代码和测试复核。 |

### 当前优先级

1. **先复核 G-1 / G-2 / G-4 的代码与测试状态**：这些会影响新 storage 下 Agent SDK、approval、remote、attachments、runtime settings 是否真实生效；文档标记完成不等于可跳过验证。
2. **再复核 / 补齐 G-3**：避免老用户升级后历史会话不可见；迁移失败矩阵见 [project-session-migration-matrix.md](./project-session-migration-matrix.md)。
3. **G-5 已按 Agent-only 收口**：renderer 发送路径不再 fallback direct；skill prompt、附件解析结果、可选搜索结果作为 Agent context 注入；storage `create/updateMeta` 强制写 `chatMode: "agent"`。后续继续复核 G-6 / G-7：`default` 魔法值收口、项目首页。
4. **F 阶段和 UI 增量必须等 P0/P1 关闭后再继续扩展**；删除保留语义见 [deletion-retention-matrix.md](./deletion-retention-matrix.md)。
5. **项目会话存储不再迁入项目 cwd `.scr-data`**；任何涉及 project session path、删除清理、备份恢复的计划都应以 app-managed userData 为准。

## 5. 功能 Plan 索引

| 功能 | Plan | 何时读 |
| --- | --- | --- |
| Project / Session 数据模型、存储、迁移、UI 主线 | [project-session-redesign-plan.md](./project-session-redesign-plan.md) | 做任何 project/session 主线改动前 |
| 迁移失败 / 导入边界 | [project-session-migration-matrix.md](./project-session-migration-matrix.md) | 做旧 chats 导入、迁移、回滚、import wizard 前 |
| JSONL 并发写 / 恢复 | [jsonl-concurrency-plan.md](./jsonl-concurrency-plan.md) | 改 session JSONL append、meta rewrite、remote/agent/UI 事件写入、repair/rebuild 前 |
| Project path / projectId 规范 | [path-canonicalization-plan.md](./path-canonicalization-plan.md) | 改 cwd normalize、hash、path.txt、orphan/relink、legacy cwd import 前 |
| Runtime enforcement | [runtime-enforcement-matrix.md](./runtime-enforcement-matrix.md) | 改 approval、sandbox、MCP、Agent SDK、文件/命令/网络执行路径前 |
| Attachment context | [attachment-context-plan.md](./attachment-context-plan.md) | 改附件读取、上下文注入、vision、URL/folder/MCP resource 处理前 |
| 删除 / 归档 / 恢复 | [deletion-retention-matrix.md](./deletion-retention-matrix.md) | 改 session/project delete、archive、remove、restore 前 |
| Settings overlay | [project-settings-overlay.md](./project-settings-overlay.md) | 改 global/project/session runtime settings 合并逻辑前 |
| 执行门禁 / 完成证据 | [refactor-execution-gates.md](./refactor-execution-gates.md) | 准备开始实现、合并阶段、或把 task 标记完成前 |
| 覆盖追踪 / 完整性审计 | [refactor-traceability-matrix.md](./refactor-traceability-matrix.md) | 准备判断 plan 是否完整、是否可开工、是否所有 gap 都有 owner 前 |
| Remote session lifecycle | [remote-session-lifecycle.md](./remote-session-lifecycle.md) | 改 IM bot binding、remote message routing、remote-bound delete、webhook replay 前 |
| Settings 项目管理入口 | [project-management-settings-ia.md](./project-management-settings-ia.md) | 改 archived/orphan/import/deleted/tombstone recovery UI 前 |
| Git worktree preflight | [git-worktree-preflight.md](./git-worktree-preflight.md) | 改 Project 右键 worktree、Composer LaunchModePill、新 git IPC 前 |
| 隐私 / 导出 / 备份 | [data-privacy-export-plan.md](./data-privacy-export-plan.md) | 改日志、audit、导出、备份、路径显示、诊断包前 |
| 搜索索引边界 | [search-index-plan.md](./search-index-plan.md) | 改 global search、全文搜索、JSONL derived index 前 |
| Sidebar parity | [sidebar-parity-plan.md](./sidebar-parity-plan.md) | 改 ClaudeSidebar/AppSidebar、quick actions、active fallback、Settings recovery 入口前 |
| i18n plan discipline | [i18n-plan-discipline.md](./i18n-plan-discipline.md) | 新增或修改任何用户可见 UI 文案前 |
| Agent runtime / 项目删除 / 独立市场页 / 审批 / 消息虚拟化 follow-up | [agent-runtime-and-project-cleanup-plan.md](./agent-runtime-and-project-cleanup-plan.md) | 改 Agent SDK 运行链路、项目删除清理、MCP/Skill/应用插件入口、新建对话分支选择、审批卡片、消息列表虚拟化前 |
| 结构化流式输出 / 代码块 / diff / tool state | [streaming-structured-output-plan.md](./streaming-structured-output-plan.md) | 改 assistant streaming、代码块展示、diff/patch 预览、tool_call/tool_use/tool_error、artifact/data/table/tree 渲染前 |
| 对话数据展示 / structured parts UI | [superpowers/plans/2026-06-23-chat-data-display-structured-parts.md](./superpowers/plans/2026-06-23-chat-data-display-structured-parts.md) | 改 `ChatMessageList`、message turns、part renderers、composer pending surface、data/table/tree/sources/artifact 展示前 |
| MCP / Skill 重新设计 | [mcp-skill-redesign-plan.md](./mcp-skill-redesign-plan.md) | 改 MCP/Skill 独立市场页、market/installed/runtime capability/scope/policy 边界前 |
| 创建 / 删除会话链路 | [workspace-session-creation-flow.md](./workspace-session-creation-flow.md) | 改新建会话、删除会话、remote bind/unbind、fallback focus 时 |
| Composer 改造 | [superpowers/plans/2026-06-20-chat-composer-redesign.md](./superpowers/plans/2026-06-20-chat-composer-redesign.md) | 改 `ChatInputArea`、composer footer、info bar、tools menu、欢迎页 composer 时 |
| Composer Codex v2 pills | [superpowers/specs/2026-06-21-chat-composer-codex-style-design.md](./superpowers/specs/2026-06-21-chat-composer-codex-style-design.md) | 改 ProjectPill、LaunchModePill、BranchPill、Approval/Model compact pills、composer context bar 时 |
| Claude sidebar quick actions / global search | [superpowers/plans/2026-06-20-claude-sidebar-quick-actions.md](./superpowers/plans/2026-06-20-claude-sidebar-quick-actions.md) | 改 `ClaudeSidebar` quick actions、global search modal、快捷键时 |
| Skill 校验机制 | [../packages/docs/SKILL_VALIDATION_REFACTOR.md](../packages/docs/SKILL_VALIDATION_REFACTOR.md) | 改 `SkillValidator`、SkillService 加载、`SKILL.md` frontmatter 校验时 |
| 缺口 / 边界条件 review | [refactor-gap-review.md](./refactor-gap-review.md) | 开始实现前，检查迁移、并发、删除、runtime、remote、attachment 等风险 |
| 运行时 policy / approval / sandbox 历史要求 | [workspace-session-ui-plan.md](./workspace-session-ui-plan.md) §11-13、§17、§26 | 改 plan mode、approval、sandbox enforcement、runtime resolver 时 |
| 实现差距证据 | [workspace-session-implementation-audit.md](./workspace-session-implementation-audit.md) | 需要确认旧代码路径、旧 plan 假设或历史技术债时 |

## 6. 新文档写法

1. **总方向只写在本文**：概念模型、phase 顺序、当前优先级、跨功能决策。
2. **功能细节写在功能 plan**：文件清单、task steps、验收方式、风险。
3. **已被 supersede 的内容不要删除**：保留历史文档，但在入口处标记“请先看总计划”。
4. **避免重复状态源**：同一个 task 的最新状态只放一个地方。主线 phase 状态放本文；功能级 checkbox 放功能 plan。
5. **实现前最少阅读路径**：
   - 主线改动：本文 → `project-session-redesign-plan.md` 对应 phase → 相关功能 plan。
   - UI 小改：本文索引 → 对应功能 plan。
   - 历史 gap 验证：本文 → audit/review 对应小节。

## 7. Review 发现的问题

本次 review 发现的主要问题已经通过本文收口：

- `workspace-session-ui-plan.md` 过长，混合 vision、runtime、types、phases、tasks、review，继续追加会腐化。
- `project-session-redesign-plan.md` 已经事实上成为新主计划，但旧索引仍把 `workspace-session-ui-plan.md` 放在主入口。
- `workspace-session-task-queue.md` 的“100%”口径指最小可行切片，不代表运行时 enforcement / Agent SDK / storage 全部闭环。
- 多个具体功能计划与主线混在搜索结果里，缺少“读哪份”的决策层。
- Skill 校验重构是独立主线，不应挂在 Workspace/Session 文档树下。

后续执行时，以本文为入口能避免继续把新功能 plan 直接塞进旧主文档。
