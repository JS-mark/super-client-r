# Chat Composer 视觉与交互重设计

**日期**：2026-06-20
**状态**：spec
**关联**：用户参考截图（codex 风格，深色圆角 composer + 标题 + project/session context 信息行）

## 目标

把"新建会话欢迎页"和"会话内输入框"两处的 composer 在视觉与底部交互上统一为同一种设计语言：

- 大圆角深色容器，聚焦时浅边 + 微光晕
- 底部左侧：附件 + 模式胶囊 +（仅 agent 模式）权限胶囊 + 搜索引擎图标
- 底部右侧：模型胶囊 + 麦克风占位 + 发送按钮（流式中切换为 stop 形态）
- composer 下方：信息行（project/session context · 本地/远程 · 预留分支位）
- 欢迎页标题改为 project/session context 维度："我们应该在 X 中构建什么?"

## 范围

### 改造
- `src/renderer/src/components/chat/ChatInputArea.tsx`：替换底部 toolbar 为新结构。所有 interactionProfile 都生效。
- `src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx`：用统一 composer 替换内置 `TextArea`；标题改为 project/session context 风格；删除 chips 和 notice。仅 `claude-code` / `hybrid` profile。
- `src/renderer/src/components/chat/ComposerStatusBar.tsx`：**整组移除底部独立行**。剩余的 plan / sandbox / context / profile tag 折叠到 ChatComposerInfoBar 的 "更多" hover popup 里展示。

### 新增
- `src/renderer/src/components/chat/composer/ChatComposer.tsx`：共用 composer 组件，底层用 `@ant-design/x` 的 `Sender`。
- `src/renderer/src/components/chat/composer/ApprovalModePill.tsx`：权限胶囊。
- `src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx`：composer 下方信息行。
- `src/renderer/src/components/chat/composer/ChatToolsMenu.tsx`：`+` 弹出菜单，聚合附件/Prompt/引用/Tools 入口。

### 不动
- `src/renderer/src/components/chat/ChatNewSession.tsx`（无会话时的引导，下次迭代再加 composer）。
- `src/renderer/src/components/chat/ChatWelcomeScreen.tsx`（codex profile 欢迎页结构本身就不一样，本次不改）。

## 关键决策

| 决策点 | 选择 |
|---|---|
| 底层输入组件 | 统一用 `Sender`。`ClaudeEmptyChatHome` 跟着升级，欢迎页**获得 slash 命令支持**。 |
| 欢迎页标题 | project/session context 视角："我们应该在 {contextName} 中构建什么?"；普通对话显示通用版："今天想做什么?"。去掉时间问候。 |
| chips / notice | 全删，欢迎页只剩"标题 + composer + 信息行"。 |
| 模式按钮位置 | 胶囊样式，与权限胶囊并排。Agent 模式时同时显示两个胶囊。 |
| approval mode 语义 | project 级（来自 `projectSettings.runtimePolicy.approvalMode`，legacy workspace 作为兼容 fallback）。胶囊 tooltip 标注"项目级权限策略"。 |
| 普通对话时的 approval pill | 隐藏（无 project settings）。 |
| 信息行点击 project/context | v3 暂时**只读**，不弹切换面板。等 ProjectSwitcher / picker 重做后再接。 |
| 信息行的本地/远程项 | 数据来自 `currentConversation.remoteBinding`。`本地模式` / `已绑定 IM`。 |
| 信息行的 git 分支 | v3 不显示（需要 IPC 取分支，留到后续迭代）。 |
| 麦克风按钮 | 占位 `disabled` + tooltip "即将推出"。 |
| 模型胶囊 | 显示 `model.name`，长则 ellipsis（28 字符）。点击触发 `chat:open-model-switcher` window 事件。 |
| 搜索引擎入口 | 保留为 composer 底部独立图标（不收进 + 菜单），保持当前选中 engine 的可见性。 |
| stop 按钮形态 | 继承现有：`isStreaming === true` 时圆形红色 `PauseCircleOutlined`，调用 `onStopStream`。 |
| ComposerStatusBar 残留 tag 去向 | profile / plan / sandbox / context 不再独立成行。集成到 ChatComposerInfoBar 末尾的 "⋯ 更多" trigger，hover 弹 popup 显示。底部恢复单行。 |
| onSubmit 语义 | 由调用方注入。ChatComposer **不**做"创建会话 + 发送"的复合逻辑。欢迎页调用方负责"先创建 conversation、再 setInput、再 handleSend"；会话内调用方只调 handleSend。 |
| `hideToolbar` 模式 | ChatComposer 接 `hideToolbar?: boolean`。开启时仅渲染 textarea + 发送按钮，不渲染底部 footer 行（mode / approval / 搜索引擎 / 模型 / mic 全部隐藏）。IM remote 流程沿用。 |

## 组件结构

### ChatComposer（共用）

```
Props:
  value, onChange, onSubmit  // 调用方负责 submit 语义；ChatComposer 不做创建会话
  isStreaming, onStopStream
  chatMode, isModeLocked, onModeSelect
  approvalMode (project 级，可能 undefined)
  onApprovalModeChange
  selectedSearchEngineId, onSelectSearchEngine, searchEngines
  modelLabel, onOpenModelSwitcher
  selectedSkillId, onClearSkill
  conversationId  // 透传给 ChatToolsMenu 子面板
  placeholder
  hideInfoBar?: boolean    // ChatNewSession 后续可能复用时关掉
  hideToolbar?: boolean    // IM remote 模式：仅 textarea + send，不渲染 footer 行

Layout:
  +───────────────────────────────────────────────+
  │ Sender (圆角 18，深色容器)                       │
  │ ┌ TextArea ────────────────────────────────┐  │
  │ │ placeholder=随心输入                       │  │
  │ └────────────────────────────────────────────┘ │
  │ ┌ Footer ───────────────────────────────────┐  │
  │ │ + | [Mode] [审批胶囊] [搜索引擎]   M🎙️  ↑ │  │
  │ └────────────────────────────────────────────┘ │
  +───────────────────────────────────────────────+
  ChatComposerInfoBar (在 Sender 外、composer 容器下方)
```

底层：`Sender` + `footer` slot 自定义。`Sender` 的 keydown 注册、isStreaming/cancel、流式 stop 全部继承现有实现。

### ApprovalModePill

仅当 `chatMode === "agent"` 且 `approvalMode !== undefined` 时渲染。

```
States:
  request      → 文案 "按需审批"，普通色
  auto-safe    → 文案 "替我审批"，蓝色 (主色)
  full-access  → 文案 "完全放行"，橙色

Trigger: 点击展开 Popover，Radio 选择三态。
Persistence: 调用现有 useProjectSettings.update 写入 runtimePolicy.approvalMode。
Tooltip: "项目级权限策略，影响该项目下的会话；普通对话不显示"
```

### ChatComposerInfoBar

```
Layout (一行排布):
  左：📁 {contextName}   🖥️ {本地模式 | 已绑定 IM}   🌿 (v3 hidden)
  右：⋯  (hover popup → profile / plan / sandbox / context tag 全集)

行为:
  - project/context 项：v3 只读
  - 本地/远程项：远程模式点击打开 RemoteBindModal
  - ⋯ 触发 popup：复用 ComposerStatusBar 现有的 Popover/Radio 交互（plan mode 选择等）

Style: text-xs, text-tertiary, hover 时浅高亮。整行 line-height 24。
```

### ChatToolsMenu

`+` 按钮触发 Popover，菜单项：
- 附件（沿用现有 FileUpload 流程）
- Prompt 模板（沿用 PromptTemplatePanel）
- 引用消息（沿用 QuotePanel）
- Tools（沿用 ToolsPanel）

搜索引擎**不**进此菜单——保留为独立图标（决策见上）。

## 数据流

```
ChatInputArea / ClaudeEmptyChatHome
  └─ ChatComposer
       ├─ Sender (textarea + footer slot)
       │    ├─ + button → ChatToolsMenu (Popover)
       │    ├─ ChatModePanel trigger (胶囊样式)
       │    ├─ ApprovalModePill (agent only)
       │    ├─ SearchEnginePanel trigger (icon)
       │    ├─ Model pill → window.dispatchEvent('chat:open-model-switcher')
       │    ├─ Mic (disabled placeholder)
       │    └─ SendButton / StopButton
       └─ ChatComposerInfoBar (容器外)
            ├─ project/session context name (read-only)
            └─ local/remote indicator
```

ApprovalModePill 写回 projectSettings 的路径：

```
ApprovalModePill.onChange(next)
  └─ useProjectSettings(projectId) 的写入入口
     // 实际方法名/签名以代码为准（见"风险与未决"）
```

> 实施前必须读 `src/renderer/src/stores/projectStore.ts` 验证 useProjectSettings 暴露的写入 API；spec 这里只描述意图，不锁定方法名。

## 受影响的现有行为

1. **ClaudeEmptyChatHome 获得 slash 命令**：因为底层换成 Sender，欢迎页里输入 `/` 也会弹 slash 面板。视为副作用，可接受（功能扩展）。
2. **ChatToolbar 不再单独显示**：所有子功能入口收敛到 `+`（除搜索引擎）。
3. **ComposerStatusBar 整组消失**：原 6 个 tag 中：model 与 approval 移到新胶囊；profile / plan / sandbox / context 折叠进信息行末尾的 ⋯ popup。底部不再有独立 status bar 行。
4. **欢迎页 chips / notice 消失**：用户失去预设快捷输入入口。

## 实施批次

### 批次 A — 视觉骨架（独立可合）
- 新建 `ChatComposer`、`ChatComposerInfoBar`。
- `ChatInputArea` 切换到 ChatComposer，但 footer 仍渲染**现有 ChatToolbar**（不收敛 +）。
- `ClaudeEmptyChatHome` 不动。
- 验收：视觉上接近图，但保留所有原 toolbar 入口。

### 批次 B — 权限胶囊 + 模式胶囊 + 信息行折叠
- 新建 `ApprovalModePill`。
- `ChatComposer` 底部行替换为新胶囊布局（mode 胶囊 + approval 胶囊 + search engine icon），原 ChatToolbar 暂留在右侧或下方。
- `ChatComposerInfoBar` 末尾加 ⋯ trigger，迁入 ComposerStatusBar 的 profile / plan / sandbox / context 交互（不复制代码，直接复用现有 Popover/Radio 内容）。
- 移除 `ChatInputArea` 渲染 ComposerStatusBar 的代码路径。
- 验收：胶囊功能完整；底部不再有独立 status bar 行；⋯ popup 可调 plan mode 等。

### 批次 C — `+` 菜单收敛
- 新建 `ChatToolsMenu`。
- ChatToolbar 拆解：附件 / Prompt / 引用 / Tools 入口移入菜单；搜索引擎独立图标保留。
- 删除 ChatToolbar 旧顶层位置。
- 验收：所有功能仍可达，视觉精简到图水平。

### 批次 D — 欢迎页迁移
- `ClaudeEmptyChatHome` 替换内置 TextArea 为 ChatComposer。
- 标题改为 project/session context 风格。
- 删除 chips、notice、greeting。
- 验收：欢迎页贴合图。

## 风险与未决

- **Sender 在欢迎页的行为差异**：欢迎页的 `onSend` 需要触发 `setInput + handleSend`（现有 prop pattern），需验证 Sender 的 `onSubmit` 与 ClaudeEmptyChatHome 现有 `onSend` 接口对齐。
- **useProjectSettings 写入 API 待校验**：spec 假设有"update / set / mutate"类方法可写 runtimePolicy，但未读源码确认。批次 B 第一步必须先 grep `projectStore.ts` 确认 API 形态，否则 spec 的 ApprovalModePill 数据流会卡住。
- **ApprovalMode hover 文案的 i18n**：需要新增 `chat.approvalMode.label.{request|auto-safe|full-access}` 三个 key（中英文）。
- **普通对话时的体验**：approval pill 隐藏 + context 名显示友好名（如"普通对话"）。
- **欢迎页失去 chips 后**：用户首次冷启动可能不知道能做什么。可在 placeholder 里加更具体的引导文案，如 `"随心输入，或按 / 调用技能"`。
- **`+` 菜单触发子 panel 的 UX**：菜单项点击后**先关闭菜单，再弹原 panel（如 QuotePanel）**。引入一层中间点击是有意识的取舍——用菜单换可见区域。批次 C 实施时确认动画/聚焦顺序流畅。

## 测试

- 视觉回归：批次 A、D 完成后各截图对比图。
- 功能回归：slash 命令在会话内仍可用；批次 D 完成后欢迎页也支持 slash。
- 流式控制：发送→stop 切换在两处都正常。
- agent 模式切换：approval pill 显隐符合预期。
- project 切换：信息行 context 名实时更新。
- 普通对话：approval pill 隐藏。
