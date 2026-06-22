# Chat Composer Codex 风格完善（v2）

**日期**：2026-06-21
**状态**：spec
**重构总入口**：[../../refactor-plan.md](../../refactor-plan.md)
**执行门禁**：[../../refactor-execution-gates.md](../../refactor-execution-gates.md)
**前置**：[2026-06-20-chat-composer-redesign-design.md](./2026-06-20-chat-composer-redesign-design.md)
**参考**：用户提供的 6 张 Codex 截图（项目下拉、模式下拉、分支下拉、+ 菜单、approval、model+reasoning）

## 目标

在 v1 已统一 composer 视觉的基础上，进一步把对话窗口对齐 Codex 截图的双层卡片结构：

- 把 InfoBar 升级为「上下文 Pill 行」，与 composer 卡片视觉粘连
- 新增 / 改造 6 类 Pill：Project（带搜索）、LaunchMode（本地 vs 工作树）、Branch（带未提交计数与切换）、Approval（描述行式三档）、Model（紧凑 reasoning 形态）
- 扩展 `+` 菜单，加入「计划模式」与「指定目标」
- 移除麦克风
- 仅保留可在本项目落地的功能；不引入 Codex web / 云端额度 / 发送至云端 / 剩余用量 / Codex 系 plugin 子系统

## 适用范围

| 场景 | 入口组件 | 是否在本 spec 范围 |
|------|---------|-------------------|
| 空会话首页 | `ClaudeEmptyChatHome.tsx` | ✅ |
| 会话进行中 | `ChatInputArea.tsx` | ✅ |
| Remote IM 会话 | `RemoteChatPane.tsx` | ❌（保持 v1 行为） |

## 架构选型

**采用 Approach A — 双层 Pill 行 + CSS 视觉粘连**。

```
┌──────────────────────────────────────────────────┐  composer-card (white)
│ 随心输入                                          │
│ ────────────────────────────────────────────     │
│ + 替我审批⌄          GPT-5.5 高⌄  ⬆            │  ← Sender footer
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐  composer-context-bar (light gray)
│ 📁 super-client-r⌄  💻 本地模式⌄  🌿 main⌄    ⋯  │  ← 改造后的 InfoBar
└──────────────────────────────────────────────────┘
```

- 上层：`ChatComposer` 包裹的 `Sender` 卡片，仍负责输入 + footer pills（+/Approval/Model/Send）
- 下层：`ChatComposerInfoBar` 重构为「上下文 Pill 行」，承载 Project / LaunchMode / Branch + 右侧 ⋯ 状态弹层
- 两层圆角对齐、上下贴合；下层背景 `colorFillTertiary`，上层 `colorBgContainer`
- 旧 `mt-3` 间距 → 0；通过外层包裹 `<div className="composer-stack">` 控制圆角与阴影

不选 B（合并 ComposerCard）的原因：`ChatInputArea.tsx` 已 17.5K，重写引入额外回归风险。
不选 C（全塞 Sender footer）的原因：Project/Branch 是上下文不是输入工具，语义错位。

---

## § 1 Pill 行视觉与定位

### 改造文件

- `src/renderer/src/components/chat/composer/ChatComposer.tsx`
  - 移除 `<div className="mt-3">{infoBar}</div>` 包裹
  - 把 `infoBar` 直接作为 sibling，由外部 `composer-stack` CSS 控制粘连
- `src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx`
  - 完全改造为 `<div className="composer-context-bar">` + 三 Pill + 右侧 ⋯
  - props 全部重写（见 § 2/§ 3/§ 4）
- `src/renderer/src/styles/composer.css`（或既有 composer 样式文件）
  - 新增 `.composer-stack`、`.composer-context-bar` 类
  - `.composer-stack` 内部 `.chat-composer-card` 圆角下方为 0；`.composer-context-bar` 圆角上方为 0
- `src/renderer/src/components/chat/ChatInputArea.tsx`
  - 删除原 footer 内 mic 按钮
  - 接入新 InfoBar；删除任何与旧 InfoBar 重复的 workspace 标签

### 删除

- ChatInputArea / ClaudeEmptyChatHome 内的麦克风占位（无对应业务，且用户明确不要）

---

## § 2 ProjectPill（截图 4）

### 新增组件

- `src/renderer/src/components/chat/composer/ProjectPill.tsx`

### Props 与数据

```ts
interface ProjectPillProps {
  conversationId: string;          // 用于写回 workspaceId
  currentProjectId: string | null; // null = 不使用项目
}
```

数据源：

- `useProjectStore` 已有 `projects` 列表
- **写回（已知约束）**：当前 `chatStore.updateConversationMetadata` 注释明确「workspaceId 在新模型里不再可改，忽略」。本 spec 选择**扩展该 action 支持修改 projectId**：在 `metaPatch` 里增加 `projectId` 字段映射（`workspaceId === "default"` → `projectId = null`），并在 `ConversationStorageService` 层支持 projectId patch。这样 ProjectPill 可对当前会话生效；旧会话切换项目走同一路径

### 下拉内容

```
┌──────────────────────────────┐
│ 🔍 搜索项目                   │
│ ──                            │
│ 📁 super-client-r        ✓   │  ← 当前选中
│ 📁 Bridgent                  │
│ 📁 personal-resume-website   │
│ 📁 cherry-studio             │
│ 📁 node-auth                 │
│ ──                            │
│ ➕ 添加新项目             ›  │  ← 触发既有 NewProjectModal
│ 📁 不使用项目                │  ← 写 workspaceId = "default"
└──────────────────────────────┘
```

- 列表：根据 `useProjectStore` 输出，使用 `name` 作为 label，`Icon` 优先 `FolderOutlined`
- 「添加新项目」打开 `NewProjectModal`（项目内已存在），完成后切回 ProjectPill 选中态
- 「不使用项目」写 `workspaceId = "default"`

### Pill 显示

- 有项目：`📁 项目名 ⌄`
- 无项目：`📁 未指定 ⌄`
- 受 `useChatStore.currentConversation.workspaceId` 驱动

---

## § 3 LaunchModePill（截图 5，简化版）

### 新增组件

- `src/renderer/src/components/chat/composer/LaunchModePill.tsx`

### 模式枚举（精简）

```ts
type LaunchMode = "local" | "worktree";
```

> 截图中的「关联 Codex web / 发送至云端 / 剩余用量」三项**不实现**，菜单不展示。

### 下拉内容

```
┌──────────────────────────────┐
│ 启动模式                      │
│ 💻 在本地处理            ✓   │
│ 📂 新工作树                  │  ← 触发 worktree 创建
└──────────────────────────────┘
```

### 状态归属

- launchMode 是 **per-conversation** 的瞬时态，不持久化为单独字段
- 推导：`conversation.worktreePath ? "worktree" : "local"`
- 写回：选「新工作树」时调用既有 `git.createWorktree(cwd, worktreePath, branchName)` IPC，返回的 `worktreePath` 写入 `conversation.worktreePath`（已是 `ConversationStorageService` 已知字段）

### 「新工作树」交互

- 点击 → 弹小输入框：分支名（必填）+ 工作树路径（默认 `<projectRoot>/.worktrees/<branchName>`）
- 复用 `ConversationStorageService.session.worktreePath` 字段
- **超出本 spec**：worktree 列表 / 切换 / 清理 — 后续单独 spec

### 显示条件

- 仅当 `currentProject` 存在且为 git 仓库时显示，否则隐藏整个 pill

---

## § 4 BranchPill（截图 6）

### 新增组件

- `src/renderer/src/components/chat/composer/BranchPill.tsx`

### 下拉内容

```
┌──────────────────────────────┐
│ 🔍 搜索分支                   │
│ 分支                          │
│ ── main                  ✓   │
│    未提交：104 个文件          │
│    feature/foo               │
│    fix/bar                   │
│ ──                            │
│ ➕ 创建并检出新分支...         │
└──────────────────────────────┘
```

### 新增 IPC

```ts
// src/main/ipc/channels.ts
GIT.LIST_BRANCHES = "git:list-branches";
GIT.SWITCH_BRANCH = "git:switch-branch";
GIT.GET_STATUS    = "git:get-status";
```

### 新增类型（`packages/shared-types/src/git.ts`）

```ts
export interface BranchEntry {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
}
export interface ListBranchesResult {
  isRepo: boolean;
  current?: string;
  branches: BranchEntry[];
}
export interface GitStatusResult {
  isRepo: boolean;
  uncommittedCount: number;
  dirty: boolean;
}
```

### 主进程

- `GitInfoService` 扩展 `listBranches(cwd)` / `switchBranch(cwd, name)` / `getStatus(cwd)`
- 实现：
  - `listBranches` = `git for-each-ref --format='%(refname:short)|%(HEAD)|%(upstream:short)' refs/heads refs/remotes`
  - `switchBranch` = `git checkout <name>`，前置校验 `git status --porcelain` 无冲突；冲突时抛 `{ ok: false, error: "uncommitted changes" }`
  - `getStatus` = `execFile("git", ["status", "--porcelain"])`，在 Node 端拆 `\n` 计行（项目不走 shell，无管道）；返回 `{ uncommittedCount, dirty: count > 0 }`
- 与 `getBranchInfo` 一样使用 2s 缓存，但 `switchBranch` 调用后立即失效缓存

### 显示条件

- `launchMode === "local"` 且 `isRepo === true` 才显示
- worktree 模式下隐藏（worktree 自带分支）

### 写回

- 选分支 → 调用 `git.switchBranch(cwd, name)`
- 创建分支 → 调用 `git.createBranch(cwd, name)`（**新增 IPC**：`git:create-branch`，封装 `git checkout -b`）

---

## § 5 ApprovalModePill 视觉细化（截图 8）

### 改造文件

- `src/renderer/src/components/chat/composer/ApprovalModePill.tsx`

### 新 popover 内容

```
应如何批准 Codex 操作?         了解更多
──────────────────────────────────────
🤚  请求批准
    编辑外部文件和使用互联网时始终询问

🛡️  替我审批                       ✓
    仅对检测到的风险操作请求批准

⚠️  完全访问权限
    可不受限制地访问互联网和您电脑上的任何文件
```

- 三个 ApprovalMode 用 Card 列表布局，不再用 `Radio.Group`
- 每行：图标 + 标题（粗）+ 描述（secondary）+ 选中 ✓
- 顶部：标题 `应如何批准 Codex 操作?` + 右上「了解更多」（外链到 docs/runtime-policy.md）
- i18n key 已在 `chat.json` 存在的 mode label 上扩展 description 字段

### 文案

| Mode | 标题 | 描述 |
|------|------|------|
| `request` | 按需审批 | 编辑外部文件和使用互联网时始终询问 |
| `auto-safe` | 替我审批 | 仅对检测到的风险操作请求批准 |
| `full-access` | 完全访问权限 | 可不受限制地访问互联网和您电脑上的任何文件 |

> 与既有 `approvalModeLabel` 中的「完全放行」存在出入；本 spec 以截图为准，更新 `ApprovalModePill.approvalModeLabel('full-access')` 返回值为「完全访问权限」。受影响测试用例同步更新。

---

## § 6 ModelPill 紧凑形态 + reasoning（截图 9）

### 改造文件

- `src/renderer/src/components/chat/composer/ModelPill.tsx`

### 新显示

| 条件 | Pill 文案 |
|------|-----------|
| 模型支持 reasoning | `GPT-5.5 高 ⌄` |
| 模型不支持 reasoning | `GPT-5.5 ⌄` |
| 未选模型 | `选择模型 ⌄` |

> 「provider 名」从 Pill 上移除（节省横向空间）；tooltip 仍显示完整 `provider · model · reasoning`。

### 新 popover

```
推理
──
低
中
高              ✓
超高
──
GPT-5.5            ›    ← 二级菜单/或触发既有 ModelSwitcherModal
```

### Reasoning 数据源

- 复用既有模型 store。新增字段：`model.supportsReasoning?: boolean`、`conversation.reasoningEffort?: "low" | "medium" | "high" | "max"`
- 写回：`chat.updateConversation({ reasoningEffort })`
- 主进程发送 LLM 请求时把 reasoning_effort 透传给 OpenAI 兼容 backend（参考 OpenAI Responses API `reasoning.effort`）

### 二级模型选择

- 「GPT-5.5 ›」点击 → `window.dispatchEvent(new Event("chat:open-model-switcher"))` 维持原行为
- 不在 ModelPill popover 内展开完整模型树

---

## § 7 + 菜单扩展（截图 7）

### 改造文件

- `src/renderer/src/components/chat/composer/ChatToolsMenu.tsx`

### 菜单分组与项

```
Add
─────────────
📎 Files and folders
📝 Prompt 模板
💬 引用
🔧 Tools
─────────────
✓  计划模式（Toggle，开启后聊天进入 plan 模式）
🎯 指定目标（弹小输入框，写 conversation.metadata.persistentGoal）
```

### 计划模式（Plan）

- `ChatMode` 类型扩展：`"direct" | "agent" | "plan"`
- `useChat.ts` 在 plan 模式下：
  - 用户消息发送前注入系统消息「现处于计划模式，先输出执行计划，等用户确认后再执行」
  - 不调用工具（`tools = []`）
- AgentSDKService / LLMService 的模式分支需相应扩展
- Pill 视觉指示（在 ChatToolsMenu trigger 上）：plan 开启时给 + 按钮加蓝色描边

### 指定目标（Goal）

- **存储位置选定**：直接在 `SessionMeta` 顶层加 `persistentGoal?: string` 字段（不引入新的 `metadata` 容器，避免再造一层结构）。`shared-types/chat.ts` 的 `SessionMeta` / `ConversationSummary` / `ConversationSummaryUpdate` 同步加字段；`updateConversationMetadata` 的 `metaPatch` 增加映射
- 点击菜单项 → 弹 Modal/Popover：textarea + 保存 + 清除
- 实现：每条 user message 发送前在 `useChat.sendMessage` 拼接前缀：`# 持续目标\n${goal}\n\n# 本次请求\n${userText}`
- Empty home 与 ChatInputArea 共享同一行为

---

## § 8 新增 / 修改的 IPC 总览

| 通道 | 输入 | 输出 | 用途 | 新/改 |
|------|------|------|------|------|
| `git:list-branches` | `{ cwd }` | `ListBranchesResult` | BranchPill 下拉 | 新 |
| `git:switch-branch` | `{ cwd, name }` | `{ ok, error? }` | 切换分支 | 新 |
| `git:create-branch` | `{ cwd, name }` | `{ ok, error? }` | 新建并 checkout | 新 |
| `git:get-status` | `{ cwd }` | `GitStatusResult` | 未提交计数 | 新 |
| `git:get-branch-info` | `{ cwd }` | `GitBranchInfo` | 已有 | 不改 |
| `git:create-worktree` | `{ cwd, worktreePath, branchName }` | `CreateWorktreeResult` | 已有 | 不改 |
| `chat:update-conversation` | partial | conversation | projectId / worktreePath / reasoningEffort / persistentGoal（均扩展 `metaPatch` 映射） | 改（字段扩展）|

按 CLAUDE.md「IPC 6 步」流程逐一落地。

---

## § 9 状态与持久化

### 持久化字段（写入 conversation）

| 字段 | 类型 | 说明 |
|------|------|------|
| `workspaceId` | `string` | ProjectPill |
| `worktreePath` | `string?` | LaunchMode = worktree 时存在 |
| `reasoningEffort` | `"low" \| "medium" \| "high" \| "max"?` | ModelPill |
| `chatMode` | `"direct" \| "agent" \| "plan"` | ChatMode 扩展 plan |
| `persistentGoal` | `string?` | + 菜单 Goal（顶层字段，非 metadata 容器） |

### 仅渲染态（不持久化）

- 各 Pill 的 popover 开合
- 当前 cwd 的分支列表（按 cwd 缓存于 GitInfoService 2s）

---

## § 10 国际化

新增 / 修改 i18n key（`zh/chat.json` 与 `en/chat.json`）：

```
chat.composer.projectPill.search    → 搜索项目 / Search projects
chat.composer.projectPill.addNew    → 添加新项目 / Add new project
chat.composer.projectPill.none      → 不使用项目 / No project
chat.composer.launchMode.local      → 在本地处理 / Process locally
chat.composer.launchMode.worktree   → 新工作树 / New worktree
chat.composer.branchPill.search     → 搜索分支 / Search branches
chat.composer.branchPill.create     → 创建并检出新分支... / Create new branch...
chat.composer.branchPill.uncommitted → 未提交：{{count}} 个文件 / Uncommitted: {{count}} files
chat.composer.approval.title        → 应如何批准 Codex 操作? / How should Codex approve actions?
chat.composer.approval.learnMore    → 了解更多 / Learn more
chat.composer.approval.request.desc → 编辑外部文件和使用互联网时始终询问 / ...
chat.composer.approval.autoSafe.desc → 仅对检测到的风险操作请求批准 / ...
chat.composer.approval.fullAccess.desc → 可不受限制地访问互联网和您电脑上的任何文件 / ...
chat.composer.model.reasoning.title → 推理 / Reasoning
chat.composer.model.reasoning.low   → 低 / Low
chat.composer.model.reasoning.medium → 中 / Medium
chat.composer.model.reasoning.high  → 高 / High
chat.composer.model.reasoning.max   → 超高 / Max
chat.composer.tools.planMode        → 计划模式 / Plan mode
chat.composer.tools.goal            → 指定目标 / Set goal
chat.composer.tools.goal.placeholder → Codex 将持续努力实现的目标 / What Codex should keep working towards
```

---

## § 11 实现阶段（按风险递增）

| Phase | 范围 | 依赖 | 可独立合并 |
|-------|------|------|-----------|
| **P1** | § 1 视觉重构 + 移除 mic + InfoBar 三 Pill 占位（先 disabled） | 0 | ✅ |
| **P2** | § 2 ProjectPill 完整功能 | P1 | ✅ |
| **P3** | § 5 ApprovalPill 视觉 + § 6 ModelPill 紧凑形态（reasoning 占位） | P1 | ✅ |
| **P4** | § 7 + 菜单 Plan / Goal | P1；ChatMode 扩展 | ✅ |
| **P5** | § 4 BranchPill + 4 个新 IPC（list-branches / switch-branch / create-branch / get-status） | P1；§ 8 IPC 落地 | ✅ |
| **P6a** | § 3 LaunchModePill 「新工作树」 | P5 不强依赖；只用既有 `createWorktree` | ✅ |
| **P6b** | reasoning 真实写回（拆出独立任务） | P3 占位 UI | ✅ |

每期通过后做一次手测：
- ClaudeEmptyChatHome 渲染对照截图
- ChatInputArea 渲染对照截图
- 切换 project / branch / worktree 后会话恢复正确

---

## § 12 测试策略

### 单元

- `ProjectPill.test.tsx`：搜索过滤、选中态、「不使用项目」写回
- `BranchPill.test.tsx`：分支列表渲染、未提交计数显示、新建分支调用
- `LaunchModePill.test.tsx`：worktree 推导、worktree 模式下 BranchPill 隐藏
- `ApprovalModePill.test.tsx`：三档切换 + i18n 描述渲染
- `ModelPill.test.tsx`：紧凑显示、reasoning 切换写回
- `ChatToolsMenu.test.tsx`：plan toggle 与 goal 弹层

### 集成（手测）

- 在 ClaudeEmptyChatHome 走完整流程：选项目 → 选分支 → 设目标 → 发送
- 在已有会话切换 worktree → 验证 conversation.worktreePath 持久化

---

## § 13 不在本 spec 范围

- Codex web 关联
- 云端额度查询、发送至云端
- 剩余用量显示
- Plugin 子系统（Documents / PDF / Spreadsheets / Presentations / 浏览器）
- worktree 列表管理（创建之外的 ls / rm / clean）
- 对 RemoteChatPane 的视觉同步

---

## 风险与备注

1. **simple-git 未引入**：本 spec 沿用既有 `execFile("git", ...)` 模式，无需新增依赖。
2. **plan 模式语义**：要求 LLMService / AgentSDKService 协同；若任一处尚未支持，先在 useChat 内做"前缀注入"降级实现，不阻塞 P4 合并。
3. **reasoning 字段透传**：仅对 OpenAI Responses 兼容 provider 生效；其他 provider 忽略不报错。
4. **CSS 双层粘连**：Ant Design Sender 自带圆角/阴影，可能需用 `:global` 或 `rootClassName` 覆写；若调试成本过高，可降级为 8px 间距并保持单层卡片视觉。
5. **i18n 文案**：表中文案是初稿，最终以 PR 中的 i18n review 为准。
