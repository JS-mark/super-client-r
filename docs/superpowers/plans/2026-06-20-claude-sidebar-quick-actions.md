# ClaudeSidebar Quick Actions Implementation Plan

> 重构总入口：[../../refactor-plan.md](../../refactor-plan.md)。
>
> 本文是功能级 plan，只维护 ClaudeSidebar quick actions / global search 的实现步骤；主线优先级与跨功能决策以总入口为准。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ClaudeSidebar 增加 3 个 quick action 入口（IM 机器人 / 扩展 / 会话搜索）+ 调大 SectionHeader 字号；新增跨会话搜索 modal 并接入快捷键。

**Architecture:** 在 `ClaudeSidebar` 现有 `QuickActionRow` 模式上追加 3 行；新建 `GlobalSessionSearchModal` 组件，靠 useChatStore 内存中的 conversations 做 in-memory 搜索（title + preview，零 IO）；快捷键复用现有 `useShortcutStore`，把 `quick-search` 的语义从"per-conversation message search"重定向为"global session search"是范围太大 — 改用新 shortcut id `global-search` (mod+p)，避开冲突。

**Tech Stack:** React + TypeScript + Ant Design + Zustand + react-router-dom + react-i18next。

**前置 spec:** `docs/superpowers/specs/2026-06-20-claude-sidebar-quick-actions-design.md`

---

## File Structure

| 路径 | 操作 | 责任 |
|---|---|---|
| `src/renderer/src/components/layout/ClaudeSidebar.tsx` | 修改 | SectionHeader 字号；追加 3 个 QuickActionRow；挂 modal state |
| `src/renderer/src/components/chat/GlobalSessionSearchModal.tsx` | 新建 | 跨会话搜索 modal，接 useChatStore conversations |
| `src/renderer/src/components/chat/__tests__/GlobalSessionSearchModal.test.ts` | 新建 | 搜索逻辑单元测试（filter 函数） |
| `src/renderer/src/stores/shortcutStore.ts` | 修改 | 新增 `global-search` shortcut id |
| `src/renderer/src/hooks/useAppShortcuts.ts` | 修改 | 处理 `global-search` shortcut，dispatch `chat:open-global-search` 事件 |
| `src/renderer/src/i18n/locales/zh/shortcuts.json` | 修改 | 添加 globalSearch 文案 |
| `src/renderer/src/i18n/locales/en/shortcuts.json` | 修改 | 添加 globalSearch 文案 |

---

### Task 1: 调大 SectionHeader 字号

**Files:**
- Modify: `src/renderer/src/components/layout/ClaudeSidebar.tsx:167`

- [ ] **Step 1: 修改字号 class**

Find this code in `ClaudeSidebar.tsx` (around line 167，`SectionHeader` 内部):

```tsx
<span className="text-[11px] tracking-wide font-medium">
  {title}
</span>
```

Replace with:

```tsx
<span className="text-[13px] tracking-wide font-medium">
  {title}
</span>
```

- [ ] **Step 2: 启动 dev server 验证视觉**

Run: `pnpm dev`

Expected：sidebar 的"最近对话"和"项目"标签字号比原来明显加粗大一档，但仍小于会话条目的 `text-sm`。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/layout/ClaudeSidebar.tsx
git commit -m "feat(sidebar): bump section header font size to 13px"
```

---

### Task 2: 添加"IM 机器人"快捷入口

**Files:**
- Modify: `src/renderer/src/components/layout/ClaudeSidebar.tsx`（imports + handler + JSX）

- [ ] **Step 1: 加 ClusterOutlined import**

Find the import block at the top of `ClaudeSidebar.tsx`:

```tsx
import {
  DownOutlined,
  FolderAddOutlined,
  FolderOutlined,
  PlusOutlined,
  ReadOutlined,
  SettingOutlined,
  UpOutlined,
} from "@ant-design/icons";
```

Replace with（按字母顺序插入 ClusterOutlined）:

```tsx
import {
  ClusterOutlined,
  DownOutlined,
  FolderAddOutlined,
  FolderOutlined,
  PlusOutlined,
  ReadOutlined,
  SettingOutlined,
  UpOutlined,
} from "@ant-design/icons";
```

- [ ] **Step 2: 添加 handler**

Find `const handleLibrary = useCallback(...)` (around line 346) and add right below it:

```tsx
const handleImBot = useCallback(() => {
  navigate("/imbot");
}, [navigate]);
```

- [ ] **Step 3: 在 quick actions 区域追加 row**

Find the `{/* Quick actions */}` block (around line 519-543), specifically the existing `<QuickActionRow icon={<ReadOutlined />} label="库" .../>`. Insert a new QuickActionRow right after it:

```tsx
<QuickActionRow
  icon={<ClusterOutlined />}
  label="IM 机器人"
  onClick={handleImBot}
  hoverBg={hoverBg}
  textColor={textColor}
  mutedColor={mutedColor}
  chipBg={chipBg}
/>
```

- [ ] **Step 4: 验证跳转**

Run: `pnpm dev`

Expected: 点击 sidebar 的"IM 机器人"行，浏览器路由切到 `/imbot`，对应页面渲染。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/layout/ClaudeSidebar.tsx
git commit -m "feat(sidebar): add IM bot quick action"
```

---

### Task 3: 添加"扩展"快捷入口

**Files:**
- Modify: `src/renderer/src/components/layout/ClaudeSidebar.tsx`

- [ ] **Step 1: 加 AppstoreAddOutlined import**

Update the import block to include `AppstoreAddOutlined`（按字母顺序）:

```tsx
import {
  AppstoreAddOutlined,
  ClusterOutlined,
  DownOutlined,
  FolderAddOutlined,
  FolderOutlined,
  PlusOutlined,
  ReadOutlined,
  SettingOutlined,
  UpOutlined,
} from "@ant-design/icons";
```

- [ ] **Step 2: 添加 handler**

Right below `handleImBot`:

```tsx
const handleExtensions = useCallback(() => {
  navigate("/extensions");
}, [navigate]);
```

- [ ] **Step 3: 追加 QuickActionRow**

In the quick actions block, append after the IM 机器人 row:

```tsx
<QuickActionRow
  icon={<AppstoreAddOutlined />}
  label="扩展"
  onClick={handleExtensions}
  hoverBg={hoverBg}
  textColor={textColor}
  mutedColor={mutedColor}
  chipBg={chipBg}
/>
```

- [ ] **Step 4: 验证跳转**

Run: `pnpm dev`

Expected: 点击 sidebar 的"扩展"行，路由切到 `/extensions`。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/layout/ClaudeSidebar.tsx
git commit -m "feat(sidebar): add extensions quick action"
```

---

### Task 4: 实现 GlobalSessionSearchModal 的搜索过滤函数（先单独提取并测试）

**Files:**
- Create: `src/renderer/src/components/chat/GlobalSessionSearchModal.tsx`（先放纯函数）
- Create: `src/renderer/src/components/chat/__tests__/GlobalSessionSearchModal.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/renderer/src/components/chat/__tests__/GlobalSessionSearchModal.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ConversationSummary } from "../../../types/electron";
import { filterConversations } from "../GlobalSessionSearchModal";

function makeConv(
  overrides: Partial<ConversationSummary>,
): ConversationSummary {
  return {
    id: overrides.id ?? "c1",
    name: overrides.name ?? "Untitled",
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    messageCount: overrides.messageCount ?? 0,
    preview: overrides.preview ?? "",
    workspaceId: overrides.workspaceId ?? "default",
    chatMode: overrides.chatMode ?? "direct",
    remote: overrides.remote,
    session: overrides.session as ConversationSummary["session"],
  };
}

describe("filterConversations", () => {
  it("returns all conversations when query is empty", () => {
    const list = [
      makeConv({ id: "a", name: "Alpha" }),
      makeConv({ id: "b", name: "Beta" }),
    ];
    expect(filterConversations(list, "")).toEqual(list);
  });

  it("matches by title (case-insensitive)", () => {
    const list = [
      makeConv({ id: "a", name: "PixCake Plan" }),
      makeConv({ id: "b", name: "Other" }),
    ];
    const result = filterConversations(list, "pixcake");
    expect(result.map((c) => c.id)).toEqual(["a"]);
  });

  it("matches by preview content", () => {
    const list = [
      makeConv({ id: "a", name: "X", preview: "讨论了部署方案" }),
      makeConv({ id: "b", name: "Y", preview: "无关内容" }),
    ];
    const result = filterConversations(list, "部署");
    expect(result.map((c) => c.id)).toEqual(["a"]);
  });

  it("trims whitespace from query", () => {
    const list = [makeConv({ id: "a", name: "Alpha" })];
    expect(filterConversations(list, "  alpha  ").length).toBe(1);
  });

  it("returns empty array when no match", () => {
    const list = [makeConv({ id: "a", name: "Alpha" })];
    expect(filterConversations(list, "nope")).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/renderer/src/components/chat/__tests__/GlobalSessionSearchModal.test.ts`

Expected: FAIL — `filterConversations` is not exported from a non-existent file.

- [ ] **Step 3: 创建组件文件，先只导出 filterConversations**

Create `src/renderer/src/components/chat/GlobalSessionSearchModal.tsx`:

```tsx
import type { ConversationSummary } from "../../types/electron";

/**
 * 过滤 conversation 列表：title + preview 包含 query（不区分大小写）。
 * 空 query 返回全部。
 */
export function filterConversations(
  list: ConversationSummary[],
  query: string,
): ConversationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((conv) => {
    const title = (conv.name ?? "").toLowerCase();
    const preview = (conv.preview ?? "").toLowerCase();
    return title.includes(q) || preview.includes(q);
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/renderer/src/components/chat/__tests__/GlobalSessionSearchModal.test.ts`

Expected: PASS — 5 tests passed.

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/chat/GlobalSessionSearchModal.tsx \
        src/renderer/src/components/chat/__tests__/GlobalSessionSearchModal.test.ts
git commit -m "feat(chat): add filterConversations pure function with tests"
```

---

### Task 5: 实现 GlobalSessionSearchModal UI

**Files:**
- Modify: `src/renderer/src/components/chat/GlobalSessionSearchModal.tsx`

- [ ] **Step 1: 扩展组件文件，加入 React UI**

Replace the entire content of `src/renderer/src/components/chat/GlobalSessionSearchModal.tsx` with:

```tsx
import { ClockCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { Empty, Input, List, Modal, theme } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../../stores/chatStore";
import type { ConversationSummary } from "../../types/electron";

const { useToken } = theme;

interface GlobalSessionSearchModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 过滤 conversation 列表：title + preview 包含 query（不区分大小写）。
 * 空 query 返回全部。
 */
export function filterConversations(
  list: ConversationSummary[],
  query: string,
): ConversationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((conv) => {
    const title = (conv.name ?? "").toLowerCase();
    const preview = (conv.preview ?? "").toLowerCase();
    return title.includes(q) || preview.includes(q);
  });
}

function formatRelativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月前`;
  const years = Math.floor(months / 12);
  return `${years}年前`;
}

export function GlobalSessionSearchModal({
  open,
  onClose,
}: GlobalSessionSearchModalProps) {
  const { token } = useToken();
  const navigate = useNavigate();
  const conversations = useChatStore((s) => s.conversations);
  const switchConversation = useChatStore((s) => s.switchConversation);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 重置 query 并 focus 输入框
  useEffect(() => {
    if (open) {
      setQuery("");
      // antd Input ref 通过 input prop 上的 ref 拿不到，改用 querySelector
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const results = useMemo(
    () => filterConversations(conversations, query),
    [conversations, query],
  );

  const handleSelect = async (convId: string) => {
    onClose();
    navigate("/chat");
    await switchConversation(convId);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnHidden
      title="搜索会话"
    >
      <Input
        ref={(el) => {
          // antd Input 暴露的是 InputRef，input DOM 取自 .input
          // 直接拿 underlying input
          if (el) {
            const dom = (el as unknown as { input?: HTMLInputElement }).input;
            inputRef.current = dom ?? null;
          }
        }}
        prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
        placeholder="按 title 或 preview 搜索…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        size="large"
        autoFocus
      />
      <div style={{ marginTop: 12, maxHeight: 400, overflowY: "auto" }}>
        {results.length === 0 ? (
          <Empty
            description={query ? "无匹配会话" : "暂无会话"}
            style={{ padding: "32px 0" }}
          />
        ) : (
          <List
            dataSource={results}
            renderItem={(conv) => (
              <List.Item
                onClick={() => handleSelect(conv.id)}
                style={{ cursor: "pointer", padding: "10px 12px" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    token.colorFillTertiary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <List.Item.Meta
                  title={conv.name || "未命名会话"}
                  description={
                    <div className="flex items-center gap-2 text-xs">
                      <ClockCircleOutlined
                        style={{ color: token.colorTextTertiary }}
                      />
                      <span style={{ color: token.colorTextTertiary }}>
                        {formatRelativeTime(conv.updatedAt)}
                      </span>
                      {conv.preview && (
                        <span
                          style={{
                            color: token.colorTextSecondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 360,
                          }}
                        >
                          · {conv.preview}
                        </span>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 跑一次类型检查**

Run: `pnpm check`

Expected: PASS（如果有 InputRef 类型问题，按 antd 文档调整 ref 用法；当前实现直接用 cast 拿底层 DOM）。

- [ ] **Step 3: 跑 vitest 确认 filterConversations 测试仍通过**

Run: `pnpm vitest run src/renderer/src/components/chat/__tests__/GlobalSessionSearchModal.test.ts`

Expected: PASS — 5 tests passed.

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/chat/GlobalSessionSearchModal.tsx
git commit -m "feat(chat): add GlobalSessionSearchModal UI"
```

---

### Task 6: 注册 `global-search` 快捷键

**Files:**
- Modify: `src/renderer/src/stores/shortcutStore.ts`
- Modify: `src/renderer/src/i18n/locales/zh/shortcuts.json`
- Modify: `src/renderer/src/i18n/locales/en/shortcuts.json`

- [ ] **Step 1: 添加 shortcut 定义**

Find `DEFAULT_SHORTCUTS` array in `shortcutStore.ts`（line 61）。Insert a new entry **right after** `quick-search`（约 line 82）:

```typescript
{
  id: "global-search",
  name: "全局会话搜索",
  nameKey: "globalSearch",
  description: "跨所有会话按 title 和 preview 搜索",
  descriptionKey: "globalSearchDesc",
  scope: "global",
  defaultKey: "mod+p",
  enabled: true,
},
```

> Schema 注意：DEFAULT_SHORTCUTS 类型是 `Omit<Shortcut, "currentKey">`，**不要**写 `currentKey` 字段，运行时由 `useShortcutStore` 初始化时填入。

- [ ] **Step 2: 添加 i18n 文案**

Edit `src/renderer/src/i18n/locales/zh/shortcuts.json`，在合适位置添加（参考 quickSearch 的格式）:

```json
"globalSearch": "全局会话搜索",
"globalSearchDesc": "跨所有会话按 title 和 preview 搜索"
```

Edit `src/renderer/src/i18n/locales/en/shortcuts.json`:

```json
"globalSearch": "Global Session Search",
"globalSearchDesc": "Search all conversations by title and preview"
```

- [ ] **Step 3: 类型检查**

Run: `pnpm check`

Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/stores/shortcutStore.ts \
        src/renderer/src/i18n/locales/zh/shortcuts.json \
        src/renderer/src/i18n/locales/en/shortcuts.json
git commit -m "feat(shortcut): register global-search (mod+p)"
```

---

### Task 7: 在 useAppShortcuts 接 global-search handler

**Files:**
- Modify: `src/renderer/src/hooks/useAppShortcuts.ts`

- [ ] **Step 1: 添加 handler**

Find the handlers map in `useAppShortcuts.ts`（contains `"quick-search": () => { window.dispatchEvent(new Event("chat:toggle-search")); }`）. Add a new entry alongside it:

```typescript
"global-search": () => {
  window.dispatchEvent(new Event("chat:open-global-search"));
},
```

- [ ] **Step 2: 类型检查**

Run: `pnpm check`

Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/hooks/useAppShortcuts.ts
git commit -m "feat(shortcut): wire global-search handler to chat:open-global-search event"
```

---

### Task 8: 在 ClaudeSidebar 挂 modal + 接事件 + 加"会话搜索" QuickActionRow

**Files:**
- Modify: `src/renderer/src/components/layout/ClaudeSidebar.tsx`

- [ ] **Step 1: 加 import**

Update import block to include `SearchOutlined`:

```tsx
import {
  AppstoreAddOutlined,
  ClusterOutlined,
  DownOutlined,
  FolderAddOutlined,
  FolderOutlined,
  PlusOutlined,
  ReadOutlined,
  SearchOutlined,
  SettingOutlined,
  UpOutlined,
} from "@ant-design/icons";
```

Add at the top imports section:

```tsx
import { GlobalSessionSearchModal } from "../chat/GlobalSessionSearchModal";
```

(`useEffect` 已经从 react 导入；如果没有，按需添加。)

- [ ] **Step 2: 添加 state + 事件 listener**

Inside `ClaudeSidebar` function body, near the existing `useState` calls (e.g., right after `const [projectsOpen, setProjectsOpen] = useState(true);`):

```tsx
const [searchModalOpen, setSearchModalOpen] = useState(false);

useEffect(() => {
  const handler = () => setSearchModalOpen(true);
  window.addEventListener("chat:open-global-search", handler);
  return () => {
    window.removeEventListener("chat:open-global-search", handler);
  };
}, []);
```

确保 `useEffect` 已 import：

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 3: 添加 handler**

Right below `handleExtensions`:

```tsx
const handleSessionSearch = useCallback(() => {
  setSearchModalOpen(true);
}, []);
```

- [ ] **Step 4: 在 quick actions 区域追加"会话搜索" row（排在"库"和"IM 机器人"之间）**

Modify the quick actions block to look like (top-down: 新建对话 / 库 / 会话搜索 / IM 机器人 / 扩展):

```tsx
<QuickActionRow
  icon={<PlusOutlined />}
  label="新建对话"
  shortcut={`${modKey()}N`}
  onClick={handleNewConversation}
  hoverBg={hoverBg}
  textColor={textColor}
  mutedColor={mutedColor}
  chipBg={chipBg}
/>
<QuickActionRow
  icon={<ReadOutlined />}
  label="库"
  onClick={handleLibrary}
  hoverBg={hoverBg}
  textColor={textColor}
  mutedColor={mutedColor}
  chipBg={chipBg}
/>
<QuickActionRow
  icon={<SearchOutlined />}
  label="会话搜索"
  shortcut={`${modKey()}P`}
  onClick={handleSessionSearch}
  hoverBg={hoverBg}
  textColor={textColor}
  mutedColor={mutedColor}
  chipBg={chipBg}
/>
<QuickActionRow
  icon={<ClusterOutlined />}
  label="IM 机器人"
  onClick={handleImBot}
  hoverBg={hoverBg}
  textColor={textColor}
  mutedColor={mutedColor}
  chipBg={chipBg}
/>
<QuickActionRow
  icon={<AppstoreAddOutlined />}
  label="扩展"
  onClick={handleExtensions}
  hoverBg={hoverBg}
  textColor={textColor}
  mutedColor={mutedColor}
  chipBg={chipBg}
/>
```

- [ ] **Step 5: 在 sidebar 渲染输出末尾挂 modal**

Find the closing `</aside>` tag in `ClaudeSidebar` 的 return JSX。In the same return（aside 之外，作为兄弟节点），用 React Fragment 包裹：

```tsx
return (
  <>
    <aside ...>
      ...existing sidebar content...
    </aside>
    <GlobalSessionSearchModal
      open={searchModalOpen}
      onClose={() => setSearchModalOpen(false)}
    />
  </>
);
```

> 实施时注意：现有 `return ( <aside ...>` 直接返回单个元素。本任务把它包进 fragment，并在末尾追加 modal。

- [ ] **Step 6: 启动 dev server 端到端验证**

Run: `pnpm dev`

验证清单：
1. sidebar 显示 5 个 quick action（新建对话 / 库 / 会话搜索 / IM 机器人 / 扩展），顺序正确。
2. 点击"会话搜索"——弹 modal，搜索框 autoFocus。
3. 在 `/chat` 页面按 ⌘P（macOS）——同样弹 modal。
4. 切到 `/settings` 页面，按 ⌘P——modal 打开。
5. 在 modal 中输入 conversation 名的部分字符——结果实时过滤。
6. 点击一条结果——modal 关闭，路由切到 `/chat`，对应 conversation 被选中。
7. 按 Esc——modal 关闭。
8. 不输入任何字符——展示所有 conversations。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/components/layout/ClaudeSidebar.tsx
git commit -m "feat(sidebar): add session search modal with mod+p shortcut"
```

---

### Task 9: 跨页面跳转回归测试

**Files:** 无新增/修改，纯手动验证 Task 8 验收清单第 4-6 项。

- [ ] **Step 1: 重启 dev**

Run: `pnpm dev`

- [ ] **Step 2: 手动测试跨页面跳转**

测试路径：
1. 打开应用，点击 sidebar 底部的"设置"图标，路由切到 `/settings`。
2. 按 ⌘P。
3. 期望：modal 打开，搜索框 autoFocus。
4. 输入一个已有 conversation 的 title 的子串。
5. 点击结果。
6. 期望：modal 关闭；URL 切到 `/chat`；ChatPage 已渲染并加载该 conversation 的消息。

如果 Step 6 没切到 `/chat`，检查 `handleSelect` 中 `navigate("/chat")` 的调用顺序是否在 `switchConversation` 之前——必须先 navigate 再 switch。

- [ ] **Step 3: 编辑 release notes（如适用）**

无 release notes 文件则跳过。

- [ ] **Step 4: 终验提交（如有调整）**

如果 Step 2 中需要调整 `handleSelect` 顺序：

```bash
git add src/renderer/src/components/chat/GlobalSessionSearchModal.tsx
git commit -m "fix(search): ensure navigate fires before switchConversation"
```

---

## 风险与未决（来自 spec）

- **AppSidebar（codex profile）不在范围**：本 plan 仅改 ClaudeSidebar。codex profile 用户切到这个 profile 时看不到新入口，需独立 spec 跟进。
- **mod+p 是否被 OS / 浏览器抢占**：在 Electron 内通常 mod+p（Cmd+P）默认是 print，但 Electron 内可被自定义 menu 拦截。如果 ⌘P 没有触发，检查 `menu` 配置是否抢占；可改用 `mod+shift+p`。
- **conversation.preview 字段缺失场景**：metaToConversation 已 fallback 到 `""`，filterConversations 用 `conv.preview ?? ""`，安全。
- **switchConversation 的 await 与 navigate 顺序**：plan 让 `navigate("/chat")` 先执行，再 `switchConversation`，让 ChatPage 在切换时已经挂载，避免在 settings 页面状态闪烁。

---

## 完成判定

所有 9 个 task 完成 + Task 8 验收清单全部勾选 + Task 9 跨页面跳转通过 = plan done。

PR 标题：`feat(sidebar): add quick action entries (IM bot, extensions, session search)`
