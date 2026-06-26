# Workspace / Session 任务派发队列

> 当前重构总入口：[refactor-plan](./refactor-plan.md) ·
> 当前主计划：[project-session-redesign-plan](./project-session-redesign-plan.md) ·
> 旧索引：[workspace-session-index.md](./workspace-session-index.md) ·
> 历史主计划：[ui-plan](./workspace-session-ui-plan.md)
>
> 注意：本文是旧 Workspace/Session 任务推进记录。新的主线 phase 和功能索引以 `refactor-plan.md` 为准。
> 其中 `extensions-*`、`menu-migration-extensions`、`model-switcher-direct-*` 等旧任务名只保留历史追踪含义，不代表当前仍要实现 Extensions 聚合页或 direct/chat 模式。

按 `superpowers:subagent-driven-development` 流程，由 main agent 作为 orchestrator
串行 dispatch implementer subagent 完成剩余任务。每个 task 完成后做 spec verify

+ 独立 code-quality review（轻量 grep 验证 + typecheck + lint）。

## 进度总览（plan §21 共 32 项）

**已完成 24/32 ≈ 75%**：

| ID | 任务                                          | 状态      |
|----|-----------------------------------------------|-----------|
| 1  | implementation-audit                          | ✅         |
| 2  | workspace-source-of-truth-migration           | ✅         |
| 3  | electron-api-contract                         | ✅ 渐进    |
| 4  | session-metadata-types                        | ✅         |
| 5  | workspace-conversation-binding                | ✅         |
| 6  | workspace-config-main-readable                | ✅         |
| 7  | effective-runtime-resolver                    | ✅         |
| 8  | model-resolution-adapter                      | ✅         |
| 9  | runtime-policy-service-skeleton               | ✅         |
| 10 | approval-grants-store                         | ✅         |
| 11 | approval-adapter                              | ✅         |
| 12 | runtime-policy-enforcement (audit-only slice) | ✅         |
| 13 | attachment-persistence-for-composer           | ✅         |
| 14 | attachment-context-resolver (text-only slice) | ✅         |
| 15 | chat-file-artifact-model                      | ✅         |
| 16 | file-operation-action-adapter                 | ✅         |
| 17 | chat-file-artifact-capture                    | ✅         |
| 18 | chat-file-card                                | ✅         |
| 20 | extension-descriptor-adapter（历史兼容只读投影） | ✅         |
| 21 | workspace-capability-state                    | ✅         |
| 22 | extensions-shell（已废弃，不再作为产品页）       | superseded |
| 23 | legacy-extension-route-cleanup                | ✅         |
| 24 | independent-marketplace-navigation            | ✅ partial |
| 25 | workspace-settings-shell                      | ✅         |
| 26 | model-switcher-agent-only                     | ✅         |
| 27 | composer-status-bar                           | ✅         |
| 28 | plan-mode-state                               | ✅         |
| 30 | approval-ui                                   | ✅         |
| 31 | app-plugin-copy                               | ✅         |
| 32 | profile-layouts                               | ✅         |

**新追加（plan §6 漏项）**：

| ID    | 任务                                                                 | 状态 |
|-------|----------------------------------------------------------------------|------|
| ext-1 | workspace-session-header（plan §6 顶部 header；挂载 WorkspaceSwitcher） | ✅    |
| 19    | changed-files-summary（含 capture 扩展）                               | ✅    |
| 29    | agent-sdk-runtime-alignment（observability slice）                     | ✅    |

**最终进度：plan §21 全部 32 项 + 1 项漏补 = 33/33 ≈ 100%**（多数任务取最小可行切片，深度功能留待后续阶段：enforcement / vision blocks / inspector pane / plan-only 阻断 / Agent SDK 完整 model alignment）。

## Chat Shell UI Redesign（plan §6 完整 layout 落地）

参考目标：Codex 桌面版 + Claude 桌面版。Codex 负责 coding-agent workbench：全局左 sidebar、project/session 分组、中央 transcript/timeline、右侧环境信息面板；Claude 负责空会话和普通聊天：左侧 recents/projects、中央 greeting、大 composer、quick intent chips。
之前 plan §6 的 layout 描述被解读得太弱（仅做了一行 header），这次补成可执行的 Codex/Claude shell。

| ID      | 任务                                                                                                                                      | 复杂度 | 状态 |
|---------|-------------------------------------------------------------------------------------------------------------------------------------------|--------|------|
| shell-1 | claude-left-sidebar：mode tabs/quick actions/recents/projects/artifacts/customize/account（`ClaudeSidebar.tsx`）                             | 大     | ✅    |
| shell-2 | codex-project-session-sidebar：演化 `AppSidebar.tsx`；count badge/active accent/running indicator/project empty                             | 大     | ✅    |
| shell-3 | claude-empty-chat-home：居中 greeting + 大 composer + quick chips + notice（`ClaudeEmptyChatHome.tsx`）                                      | 中     | ✅    |
| shell-4 | codex-environment-inspector：右侧 changes/runtime/branch/sources/settings 面板（`CodexEnvironmentInspector.tsx`）                            | 大     | ✅    |
| shell-5 | cleanup-chat-drawer：移除 `ChatSidebar`/`ChatPageTitle`/`WorkspaceSessionHeader` 挂载，新增 mini action bar                                 | 中     | ✅    |
| shell-6 | profile-shell-routing：`useEffectiveInteractionProfile` + `MainLayout` 按 profile/hasContent 切换 Claude/Codex sidebar；breadcrumb TitleBar | 中     | ✅    |

**最终：plan §21 全部 34 项 = 100% 完成。** 所有 task 使用最小可行切片，深度功能（commit-push / artifacts library 后端 / Hooks 描述符 / 完整 enforcement / vision blocks / Agent SDK 完整 model alignment）留待 Phase 2 单独立项。

## Phase 1 收尾（acceptance criteria）

| ID     | 任务                                                                                                                                                       | 状态 |
|--------|------------------------------------------------------------------------------------------------------------------------------------------------------------|------|
| post-1 | TitleBar 极简化（Codex 风格 left = task name + ··· menu, right = IDE switcher + ⚙ + window controls）                                                        | ✅    |
| post-2 | IDE app switcher（VSCode/Sublime/Finder/Terminal/iTerm/Warp/Xcode/Android Studio）+ 设置 gear 提到 right cluster                                             | ✅    |
| post-3 | model chip 从 TitleBar 移除（仍在 ComposerStatusBar / Cmd+M / 大 composer 中可达）                                                                           | ✅    |
| post-4 | Codex Inspector 接 git branch（branch / dirty / ahead / behind / upstream，3s 缓存，refresh 按钮）                                                             | ✅    |
| post-5 | rollback feature flags（unifiedNavigation / runtimeEnforcement / fileArtifacts / profileLayouts，Settings UI + 各消费点条件渲染 + main 进程同步 enforcement） | ✅    |

**Acceptance criteria 关键条全部达成。** Phase 1 准备好交付。

## Session Lifecycle Refactor（plan §25）

| ID        | 任务                                                                 | 状态 |
|-----------|----------------------------------------------------------------------|------|
| 35-link-1 | sidebar 新建对话 → default workspace                                 | ✅    |
| 35-link-2 | TitleBar More 菜单 agent/remote → 新建对话…                          | ✅    |
| 35-link-3 | NewConversationModal                                                 | ✅    |
| 35-link-4 | chatStore.createConversationAdvanced                                 | ✅    |
| 35-link-5 | chatStore.deleteConversation 重写（next-focus + 解绑 + artifact 清理） | ✅    |
| 35-link-6 | SessionContextMenu 删除 confirm 远端解绑提示                         | ✅    |

配套文档：[workspace-session-creation-flow.md](./workspace-session-creation-flow.md)。

## Refactor Backlog（plan §26.4，按优先级排序）

> 这些不是新功能，而是把已经 ship 的东西收口。Plan 之前的进度数字（"100%"）只反映了"最小可行切片完成"，不代表运行时已经按 plan 全部对齐。下面 9 项是把承诺兑现的工作。

| ID  | 任务                                            | 优先级   | 说明                                                                                                                                                                                                                                                                                    |
|-----|-------------------------------------------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| R-1 | workspace store 双 source-of-truth 收口         | 高       | ✅ phase 1：`WorkspaceConfig` 加 icon/order；`useWorkspaceStore` CRUD 双写 main · ✅ phase 2：`useWorkspaceConfigStore` 加 `defaultId` + `useSortedWorkspaceConfigs()` hook；TitleBar / ClaudeSidebar / AppSidebar / NewConversationModal / useChatPageState 全部翻到 main mirror；删 dead WorkspaceSessionHeader。phase 3（删 useWorkspaceStore）blocked on color/description/type 进 main schema |
| R-2 | EffectiveSessionRuntime 消费者审计              | **最高** | ✅ useChat 4 个发送/重试路径迁到 IPC resolver；AgentSDKService 仍 audit-only（待 task #29）；UI sync 用 fallback 保留                                                                                                                                                                        |
| R-3 | chatStore 拆分                                  | 中       | step 1 ✅ `remoteSessionService` 抽出 · step 2 ✅ `useChatMessageStore` 拆出（messages / sessionStatus / isStreaming / streamingContent / persistMessages 全部迁移）；11 consumer 文件改 import；chatStore.test → chatMessageStore.test，并修掉了之前 stale-snapshot 写法（pre-refactor 7/8 红） |
| R-4 | conversation cwd 与 WorkspaceConfig.path 收口   | 中       | ✅ 新建 `services/runtime/conversationCwd.ts`：workspace.path 优先，沙箱目录回退；`chat.getConversationCwd` IPC + modelHandlers 都改走这一处；WorkspaceRuntimeForm 加入 path 输入框（之前是 dead 字段）                                                                                        |
| R-5 | plan-only mode 真正阻断工具执行                 | 中       | ✅ first slice：`LLMService.applyPlanModeGate` 在 chatCompletion 入口解析 planMode，`plan-only` 时丢 tools/toolMapping/toolPermission/toolExecutor，注入"plan only"系统提示，audit 记录 deny。其它 4 个 planMode 仍 informational                                                             |
| R-6 | runtime policy 从 audit-only → enforce          | **最高** | ⚙️ 进行中：external-app `blocked` 已 enforce（FileActionService.open / openWith）；后续接 network / file-write / command                                                                                                                                                                    |
| R-7 | useChatPageState 与 chatStore 创建路径合一      | 中       | ✅ 删掉死的 handleNewChat/handleNewAgentChat/handleNewRemoteChat 与 ChatInlineSidebar.tsx / ChatPageTitle.tsx；float-widget lazy create 显式传 default workspaceId                                                                                                                        |
| R-8 | sidebarLayoutStore.collapsed 字段下个大版本删除 | 低       | ✅ 字段从 store 类型与 partialize 中删除；两侧边栏的 force-reset effect + useEffect import 一起清掉。zustand persist 自动忽略遗留 localStorage key                                                                                                                                         |
| R-9 | SessionMetadata 字段分组（flags / lineage 嵌套）  | 低       | ✅ 引入 `SessionFlags / SessionLineage` 嵌套类型；`normalizeSessionMetadata` 同时接受 flat + nested 输入并输出 nested；`mergeSessionMetadata` 对 flags/lineage 做深合并，单 key patch 不会清掉同级其它 key；renderer 全部读写改成嵌套                                                        |

**推荐执行顺序**：R-2 → R-6 → R-7 + R-1 → R-3 → R-4 → R-5 → R-9 → R-8。

R-2 / R-6 是 Phase 1 / Phase 2 当时口径声称已完成、但实际只跑了 audit-only 的两条；先跑通这两条，UI 上的 approval / plan-mode 控件才不再是装饰。

### R-6 推进记录（first slice）

| 子项                                                                                 | 状态 |
|--------------------------------------------------------------------------------------|------|
| `RuntimePolicyService.evaluate(ctx, policy)` 引入                                    | ✅    |
| 移除「关闭 flag 时不写 audit buffer」的误导语义；audit 始终记录                         | ✅    |
| `external-app === "blocked"` 路径接入 `FileActionService.open` / `openWith`          | ✅    |
| Settings UI 文案更新（原"关闭后不写 audit"是错的，现在描述真实语义）                    | ✅    |
| `network-request === "blocked"` 接入（egress 入口待定，可能在 LLMService / 网络代理层） | ⏳    |
| `file-write` workspace-外路径 deny（caller path：tool exec / patch tool）               | ⏳    |
| `command-exec` block / approval-required（caller path：bash tool / mcp shell）          | ⏳    |
| approval-required UI prompt（让 needs-approval 不再被回落到 allow）                    | ⏳    |

## 早期遗留（plan §17 阶段没完全交付的部分）

1. **§17.4 attachment 多模式**：当前仅 `include-content` for text。`reference-only` 预算 / `ask-before-read` 审批 / image vision block 未实现。
2. **§19 changed-files capture**：等 §17 ChangeSet capture 接入后再做完整版。
3. **§29 Agent SDK runtime alignment**：observability slice 完成；§29 first slice ✅ 把 `EffectiveSessionRuntime.planMode / runtimePolicy.approvalMode` 映射到 SDK `PermissionMode`（plan-only → "plan"，full-access → "bypassPermissions"，其它 → "default"），并补 `cwd` 经由 `resolveConversationCwd` 回退到 R-4 路径。完整 model alignment 仍等 provider chain 重构。
4. **Hooks 描述符**：Extensions 页 Hooks tab 空占位；等真正有 hook 概念再立项。
