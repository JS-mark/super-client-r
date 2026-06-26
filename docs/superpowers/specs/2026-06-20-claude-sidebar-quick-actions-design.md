# ClaudeSidebar 快捷入口扩展与字号调整

**日期**：2026-06-20
**状态**：spec
**关联**：用户标注的 sidebar 截图（"最近对话" / "项目" 标签字号偏小，缺少 会话搜索 / IM 机器人 / 扩展 入口）
**前置规划**：当前入口 `docs/refactor-plan.md`；历史参考 `docs/workspace-session-ui-plan.md` §3 主导航、§14 路由迁移表

## 目标

1. 把 `SectionHeader`（最近对话 / 项目）的字号从 `text-[11px]` 调大到更易读的尺寸。
2. 在 sidebar 顶部 quick action 区新增 3 个入口：会话搜索、IM 机器人、扩展。
3. **不**单独添加 mcp / 技能 / 插件入口——按既有规划，统一从 `扩展` 进入对应 tab。

## 范围

### 改造
- `src/renderer/src/components/layout/ClaudeSidebar.tsx`：
  - 调整 `SectionHeader` 字号。
  - 在现有 `QuickActionRow`（"新建对话" / "库"）下方追加 3 个新的 `QuickActionRow`。

### 新增
- `src/renderer/src/components/chat/GlobalSessionSearchModal.tsx`：跨会话搜索（按 conversation title + 内存里 chatStore 已加载的最后一条消息片段），结果点击跳转到对应 conversation。

### 不动
- `AppSidebar.tsx`（codex profile 用的另一个 sidebar；本次只动 Claude profile）。
- `MessageSearch.tsx`（单会话内消息搜索保留，与 GlobalSessionSearchModal 是两个层次）。

## 关键决策

| 决策点 | 选择 |
|---|---|
| mcp / 技能 / 插件 是否独立 sidebar 入口 | **独立入口保留**。最新 refactor 口径已取消 Extensions 聚合页；MCP、Skills、应用插件分别进入 `/mcp`、`/skills`、`/plugins`。 |
| 会话搜索的范围 | v1 搜 conversation title + 内存中已有的最后一条消息片段（chatStore 在 sidebar 已加载的字段，不读 messages.json 文件，IO 零成本）。匹配不区分大小写。结果项展示 title + 时间 + 命中片段（如有）。完整跨文件消息内容搜索留 v2。 |
| IM 机器人入口路由 | 跳 `/imbot`（DEFAULT_MENU_CONFIG 现有路由，对应 RemoteChatPane / IM 绑定页）。 |
| 扩展入口路由 | 不提供 Extensions 聚合入口；如需要 quick action，应分别跳 `/mcp`、`/skills`、`/plugins`。 |
| SectionHeader 新字号 | `text-[13px]` + 保留 `tracking-wide font-medium`。比当前 11px 增加 2px，与正文 conversation 行的 `text-sm` 拉开层次。 |
| 入口排序 | 现有：新建对话 / 库 → 新增：会话搜索 / IM 机器人；MCP / Skills / 应用插件按独立市场入口处理。 |
| 图标 | 会话搜索 → `SearchOutlined`；IM 机器人 → `ClusterOutlined`（沿用 menu.ts 中 imbot 的图标）。 |
| 快捷键 | 会话搜索：`mod+p`，与 implementation plan 的 `global-search` 默认键一致；保留 `quick-search` 原语义。IM 机器人暂不绑定快捷键。 |
| i18n | 沿用 ClaudeSidebar 现有"中文硬编码"风格（"新建对话" / "库" 都是中文常量）。后续整体 i18n 化时一并处理。 |

## 组件结构

### ClaudeSidebar 顶部 quick action 区（改后）

```
┌─────────────────────────────┐
│ + 新建对话              ⌘N  │  (现有)
│ 📚 库                       │  (现有)
│ 🔍 会话搜索             ⌘P  │  (新增，Windows/Linux 为 Ctrl+P)
│ 🛰️ IM 机器人                  │  (新增)
│ 🧩 扩展                      │  (新增)
├─────────────────────────────┤
│ 最近对话             ▾      │  (字号 11→13px)
│   · 新对话 11               │
│ 项目                  ▾  +  │  (字号 11→13px)
│   > 09.15_PixCake           │
└─────────────────────────────┘
```

### GlobalSessionSearchModal

```
Trigger: ClaudeSidebar 的 "会话搜索" QuickActionRow + `mod+p` shortcut
Layout: Modal (Ant Design, width 600)
  ┌─ 搜索框 (Input.Search, autoFocus) ─┐
  │ 🔍 搜索会话…                        │
  └────────────────────────────────────┘
  ┌─ 结果列表 ──────────────────────────┐
  │ Conversation Title 1                │
  │ snippet of latest user message…     │
  │ ─────────────────────────────────── │
  │ Conversation Title 2                │
  │ ...                                 │
  └────────────────────────────────────┘

数据源:
  - useChatStore().conversations
  - 匹配范围：title + conversation 已挂载在 store 上的 lastMessagePreview / lastUserMessage（按当前数据 schema 取）
    · 不读 messages.json 文件 — IO 零成本
    · 字段缺失时降级为只搜 title
  - 不区分大小写
  - 结果项展示 title + 相对时间 + 高亮命中片段（如有）

行为:
  - 点击结果 →
      1. navigate("/chat")            // 必须，否则非 chat 页面下不切换
      2. useChatStore.setCurrentConversation(convId)
      3. close modal
  - Esc / 点击遮罩 → 关闭
  - 空结果 → Empty state
```

## 数据流

```
ClaudeSidebar
  └─ QuickActionRow "会话搜索"
       └─ onClick → setSearchModalOpen(true)
  └─ QuickActionRow "IM 机器人"
       └─ onClick → navigate("/imbot")

ClaudeSidebar
  └─ GlobalSessionSearchModal (open={searchModalOpen})
       └─ onSelect(convId) → navigate("/chat")
                          → useChatStore.setCurrentConversation(convId)
                          → close modal
```

`mod+p` 全局快捷键注册：复用 `useShortcutStore`，按下时 dispatch `chat:open-global-search` 并打开 modal。

## 受影响的现有行为

1. **sidebar 视觉密度变高**：从 2 个 quick action 变成 5 个，整体高度增加约 90px。需要确认在小屏（<800px 高）下 sidebar 滚动行为正常。
2. **字号增大可能影响 sidebar 总高度**：`SectionHeader` 高度 `h-7` (28px) 不变，只是字大一点，行高不变。
3. **mod+p 占用**：要确认 Electron menu / OS 没抢占。若被抢占，回退到 `mod+shift+p`。

## 实施批次

### 批次 A — 字号 + 静态入口（独立可合）
- `SectionHeader` 字号调整。
- 新增 1 个 `QuickActionRow`：IM 机器人（navigate `/imbot`）。
- 验收：3 个 quick action（新建对话 / 库 / IM 机器人）视觉正常，跳转正常。
- 注意：**会话搜索按钮不在批次 A**——避免合入后留一个无效按钮。统一在批次 B 一起做。

### 批次 B — 会话搜索 modal + 入口
- 新建 `GlobalSessionSearchModal`。
- 数据源接 useChatStore；匹配 title + 内存里已有的最后消息 preview 字段（按当前 schema 取，缺则降级只搜 title）。
- `global-search` 快捷键注册为 `mod+p`（先 grep 确认未占用）。
- 新增 `QuickActionRow "会话搜索"`，onClick → setSearchModalOpen(true)。
- 选中跳转：`navigate("/chat") + setCurrentConversation + close`。
- 验收：`mod+p` 与点击都能打开 modal；在非 chat 页面（如 settings）搜索后，点击结果会切到 chat 并定位到对应 conversation。

## 风险与未决

- **mod+p 是否被 Electron menu 抢占**：需要在批次 B 实施前验证。如果冲突，回退到 `mod+shift+p` 或不绑快捷键。
- **AppSidebar（codex profile）明确不在本次范围**：用户切到 codex profile 后看不到这 3 个入口，是已知缺口。后续做 codex sidebar 改造时同步 — 需开独立 spec 跟进。
- **会话数量很大时的搜索性能**：v1 在内存中搜 title + preview，linear scan 在万级会话也是毫秒级，不优化。v2 扩展到消息文件内容时再考虑索引或 worker。
- **IM 机器人入口名称**：`imbot` 这个 id 偏内部，UI 文案叫"IM 机器人"是否清晰？需要和后续 imbot 页面文案对齐。

## 测试

- 视觉回归：批次 A 完成后截图对比，确认字号变化、4 个入口排版；批次 B 完成后再确认 5 个入口排版。
- 功能回归：IM 机器人 / 扩展 导航跳转；不破坏现有"新建对话" / "库"。
- 搜索 modal：标题包含查询词的会话出现在结果；preview 命中也展示；点击跳转；Esc 关闭。
- **跨页面跳转**：在 `/settings` 页面用 `mod+p` 搜索并点击结果，应自动切到 `/chat` 并打开对应 conversation。
- 快捷键：`mod+p` 在 sidebar 之外（聚焦在 ChatInputArea）也能触发；与 send-message 等现有快捷键不冲突。
