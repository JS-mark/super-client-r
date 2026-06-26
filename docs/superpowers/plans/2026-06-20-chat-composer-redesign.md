# Chat Composer Redesign Implementation Plan

> 重构总入口：[../../refactor-plan.md](../../refactor-plan.md)。
>
> 本文是功能级 plan，只维护 Chat Composer 的实现步骤；主线优先级与跨功能决策以总入口为准。
>
> 历史说明：本文早期包含 `ChatModePill` 和 direct/chat 切换设计。当前产品已固定 Agent-only，相关任务和代码片段只作为历史记录，不得按原样实现。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"会话内输入框"和"欢迎页"两个 composer 视觉与底部交互统一为同一种深色圆角 + 胶囊化设计；新增权限胶囊（Agent 模式 + 工作区 approval 策略）；toolbar 子功能收敛进 `+` 菜单；信息行替代旧 ComposerStatusBar。

**Architecture:** 分 4 批次（A 视觉骨架 / B 胶囊 / C `+` 菜单 / D 欢迎页迁移），每批次独立合入。共用 `ChatComposer` 包装 `@ant-design/x` 的 `Sender`，保留 slash 命令、isStreaming/cancel、keydown registry。`ChatComposerInfoBar` 接管旧 ComposerStatusBar 的 status tag（折叠到 ⋯ popup）。

**Tech Stack:** React + TypeScript + Ant Design + `@ant-design/x` + Zustand。

**前置 spec:** `docs/superpowers/specs/2026-06-20-chat-composer-redesign-design.md`

---

## File Structure

| 路径 | 操作 | 责任 |
|---|---|---|
| `src/renderer/src/components/chat/composer/ChatComposer.tsx` | 新建 | 共用 composer：包装 Sender、暴露 footer/info-bar 插槽、支持 hideToolbar |
| `src/renderer/src/components/chat/composer/ApprovalModePill.tsx` | 新建 | 权限胶囊（Agent-only 路径渲染） |
| `src/renderer/src/components/chat/composer/ChatModePill.tsx` | 废弃 | 历史模式胶囊；当前固定 Agent-only，不新增用户可切换模式 |
| `src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx` | 新建 | composer 下方信息行 + ⋯ popup 容纳 plan/sandbox/context |
| `src/renderer/src/components/chat/composer/ChatToolsMenu.tsx` | 新建 | `+` 弹出菜单，聚合附件 / Prompt / 引用 / Tools 入口 |
| `src/renderer/src/components/chat/ChatInputArea.tsx` | 修改 | 切换到 ChatComposer 渲染；移除直接渲染的 ChatToolbar / ComposerStatusBar |
| `src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx` | 修改 | 替换内置 TextArea 为 ChatComposer；标题改 workspace 风格；删 chips + notice + greeting |
| `src/renderer/src/pages/Chat.tsx` | 修改 | 移除 ChatInputArea 后挂的 ComposerStatusBar 渲染 |
| `src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts` | 新建 | 文案/颜色映射纯函数测试 |
| `src/renderer/src/components/chat/composer/__tests__/ChatComposerInfoBar.test.ts` | 新建 | 本地/远程 label 决策纯函数测试 |
| `src/renderer/src/i18n/locales/zh/chat.json` | 修改 | approvalMode 相关 key |
| `src/renderer/src/i18n/locales/en/chat.json` | 修改 | approvalMode 相关 key |

---

## 批次 A：视觉骨架（Tasks 1-3）

### Task 1: 新建 ChatComposer 骨架（先包装 Sender，保留 footer 注入接口）

**Files:**
- Create: `src/renderer/src/components/chat/composer/ChatComposer.tsx`

- [ ] **Step 1: 创建组件骨架**

Create `src/renderer/src/components/chat/composer/ChatComposer.tsx`:

```tsx
import { Sender } from "@ant-design/x";
import type * as React from "react";
import { useRef, useEffect } from "react";

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isStreaming: boolean;
  onStopStream?: () => void;
  placeholder?: string;
  /** IM remote 模式：仅 textarea + send，不渲染底部 footer 行 */
  hideToolbar?: boolean;
  /** Composer 下方信息行（容器外渲染） */
  infoBar?: React.ReactNode;
  /** Footer 自定义渲染。返回 ReactNode；输入参数与 Sender footer 一致。 */
  renderFooter?: Parameters<typeof Sender>[0]["footer"];
  /** 注册 capture-phase keydown handler（slash 等用） */
  registerKeydownHandler?: (el: HTMLElement | null) => () => void;
  /** 上方覆盖渲染（slash panel 等） */
  topOverlay?: React.ReactNode;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * 共用 composer：包装 @ant-design/x 的 Sender，统一视觉与行为。
 *
 * - onSubmit 由调用方负责语义；ChatComposer 不做"创建会话 + 发送"的复合逻辑。
 * - hideToolbar=true 时仅渲染 textarea + 发送按钮（IM remote 流程）。
 * - infoBar 在容器外渲染（Sender 卡片下方）。
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  isStreaming,
  onStopStream,
  placeholder,
  hideToolbar = false,
  infoBar,
  renderFooter,
  registerKeydownHandler,
  topOverlay,
  onKeyDown,
}: ChatComposerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!registerKeydownHandler) return;
    return registerKeydownHandler(wrapperRef.current);
  }, [registerKeydownHandler]);

  return (
    <div ref={wrapperRef} className="chat-composer relative w-full mx-auto max-w-4xl">
      {topOverlay}
      <Sender
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onCancel={isStreaming ? onStopStream : undefined}
        loading={isStreaming}
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 6 }}
        onKeyDown={onKeyDown}
        suffix={() => null}
        footer={hideToolbar ? undefined : renderFooter}
        styles={{ input: { fontSize: 14 } }}
      />
      {infoBar && <div className="mt-2">{infoBar}</div>}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm check`

Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/chat/composer/ChatComposer.tsx
git commit -m "feat(composer): add ChatComposer scaffold wrapping Sender"
```

---

### Task 2: ChatInputArea 切换到 ChatComposer（保留现有 toolbar）

**Files:**
- Modify: `src/renderer/src/components/chat/ChatInputArea.tsx`

> 目标：`ChatInputArea` 继续渲染原 ChatToolbar / 模式按钮，只是把外层 Sender 换成 ChatComposer。视觉无变化，但为后续批次铺路。

- [ ] **Step 1: 重写 ChatInputArea 使用 ChatComposer**

Open `src/renderer/src/components/chat/ChatInputArea.tsx`. 把原本直接渲染 `<Sender ...>` 的代码块换成调用 `<ChatComposer ...>`，把现有的 `slash panel / mode panel / search panel` 通过 `topOverlay` prop 传入，把 `footer` 函数赋给 `renderFooter`。

具体做法：

1. 顶部 import 新增：
   ```tsx
   import { ChatComposer } from "./composer/ChatComposer";
   ```
2. 把现有 `return (...)` 中包住所有 panel 的 wrapper div 拿出来作为 `topOverlay`：

   ```tsx
   const topOverlay = (
     <>
      {/* Agent-only: do not render ChatModePanel / mode switch UI. */}
       {!hideToolbar && slashPanelOpen && (
         <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
           <SlashCommandPanel
             items={slashFilteredItems}
             highlightIndex={slashHighlight}
             onSelect={onSlashSelect}
             onHighlightChange={onSlashHighlightChange}
             onClose={onSlashPanelClose}
           />
         </div>
       )}
       {!hideToolbar && searchPopoverOpen && (
         <div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
           <SearchEnginePanel
             selectedEngine={selectedEngine}
             onSelectEngine={onSelectEngine}
             onClose={() => setSearchPopoverOpen(false)}
           />
         </div>
       )}
       {attachedFiles.length > 0 && (
         <div className="mb-2">
           <AttachmentList
             attachments={attachedFiles}
             onRemove={(id) =>
               setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
             }
           />
         </div>
       )}
     </>
   );
   ```

3. 把现有 `<Sender ... footer={...}>` 整段替换为：

   ```tsx
   return (
     <div className="chat-input-shell px-6 py-4">
       <ChatComposer
         value={input}
         onChange={handleSenderChange}
         onSubmit={handleSend}
         isStreaming={isStreaming}
         onStopStream={onStopStream}
         placeholder={placeholderProp ?? t("chat.placeholder", "在这里输入消息，按 Enter 发送")}
         hideToolbar={hideToolbar}
         topOverlay={topOverlay}
         registerKeydownHandler={registerKeydownHandler}
         onKeyDown={(e) => {
           if (e.nativeEvent.isComposing) return;
           const { getShortcut } = useShortcutStore.getState();
           const sendShortcut = getShortcut("send-message");
           const newLineShortcut = getShortcut("new-line");
           const pressed = normalizeShortcut(getShortcutFromEvent(e.nativeEvent));
           if (newLineShortcut?.enabled && normalizeShortcut(newLineShortcut.currentKey) === pressed) {
             return;
           }
           if (sendShortcut?.enabled && normalizeShortcut(sendShortcut.currentKey) === pressed) {
             e.preventDefault();
             handleSend(input);
           }
         }}
         renderFooter={existingFooterFn}
       />
     </div>
   );
   ```

4. **关键**：把 `ChatInputArea.tsx` 现有 `<Sender ... footer={(_footerNode, { components }) => { ... }}>` 中的 `footer` 函数本体**原样保留**，提取为函数体内的 `existingFooterFn`，例如：

   ```tsx
   const existingFooterFn = useCallback(
     (_footerNode: React.ReactNode, opts: { components: { SendButton: React.ComponentType<unknown> } }) => {
       const { SendButton } = opts.components;
       // 此处粘贴原 footer 函数返回的 JSX 整块（即原来的 `<Flex justify="space-between">...</Flex>`）
       // 不做任何修改 — 批次 A 视觉零变化。
       return /* 原 footer return 表达式 */;
     },
     [/* 原 footer 闭包内引用的所有变量 */],
   );
   ```

   然后在 ChatComposer 上用 `renderFooter={existingFooterFn}`。视觉零变化。

   > 实施时直接从原文件（git status 中的 working copy）剪切 `<Sender>` footer prop 函数体，不要重写。

- [ ] **Step 2: 类型检查 + 跑应用**

Run: `pnpm check && pnpm dev`

Expected: PASS；应用启动后 ChatInputArea 视觉与改前一致；slash 命令仍可用；发送/取消正常。

- [ ] **Step 3: 验收**

手动验证：
1. 输入消息 → Enter 发送（不换行）
2. Shift+Enter 换行
3. 输入 `/` 弹 slash panel
4. 确认没有 chat / agent 模式切换入口
5. 流式中按 stop 按钮中止

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/chat/ChatInputArea.tsx
git commit -m "refactor(chat): switch ChatInputArea to ChatComposer wrapper"
```

---

### Task 3: 创建 ChatComposerInfoBar（先只渲染静态信息，无 ⋯ popup）

**Files:**
- Create: `src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx`
- Create: `src/renderer/src/components/chat/composer/__tests__/ChatComposerInfoBar.test.ts`
- Modify: `src/renderer/src/components/chat/ChatInputArea.tsx`（挂载到 ChatComposer 的 infoBar prop）

- [ ] **Step 1: 写 deriveLocalRemoteLabel 测试**

Create `src/renderer/src/components/chat/composer/__tests__/ChatComposerInfoBar.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { deriveLocalRemoteLabel } from "../ChatComposerInfoBar";

describe("deriveLocalRemoteLabel", () => {
  it("returns 本地模式 when conversation has no remote binding", () => {
    expect(deriveLocalRemoteLabel(undefined)).toBe("本地模式");
    expect(deriveLocalRemoteLabel(null)).toBe("本地模式");
  });

  it("returns 已绑定 IM when conversation.remote is set", () => {
    expect(deriveLocalRemoteLabel({ platform: "wechat" } as never)).toBe("已绑定 IM");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/renderer/src/components/chat/composer/__tests__/ChatComposerInfoBar.test.ts`

Expected: FAIL — module not found。

- [ ] **Step 3: 创建组件**

Create `src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx`:

```tsx
import { DesktopOutlined, FolderOutlined } from "@ant-design/icons";
import { theme } from "antd";

const { useToken } = theme;

export function deriveLocalRemoteLabel(
  remote: unknown | null | undefined,
): string {
  return remote ? "已绑定 IM" : "本地模式";
}

export interface ChatComposerInfoBarProps {
  workspaceName: string;
  remoteBinding: unknown | null | undefined;
  onClickWorkspace?: () => void;
  onClickLocalRemote?: () => void;
  /** Trailing slot — 用于挂 ⋯ popup（批次 B 后接入） */
  trailing?: React.ReactNode;
}

export function ChatComposerInfoBar({
  workspaceName,
  remoteBinding,
  onClickWorkspace,
  onClickLocalRemote,
  trailing,
}: ChatComposerInfoBarProps) {
  const { token } = useToken();
  const localRemoteLabel = deriveLocalRemoteLabel(remoteBinding);

  return (
    <div
      className="w-full mx-auto max-w-4xl flex items-center justify-between"
      style={{
        fontSize: 12,
        color: token.colorTextTertiary,
        lineHeight: "24px",
      }}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onClickWorkspace}
          disabled={!onClickWorkspace}
          className="flex items-center gap-1"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: onClickWorkspace ? "pointer" : "default",
          }}
        >
          <FolderOutlined style={{ fontSize: 12 }} />
          <span>{workspaceName}</span>
        </button>
        <button
          type="button"
          onClick={onClickLocalRemote}
          disabled={!onClickLocalRemote}
          className="flex items-center gap-1"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: onClickLocalRemote ? "pointer" : "default",
          }}
        >
          <DesktopOutlined style={{ fontSize: 12 }} />
          <span>{localRemoteLabel}</span>
        </button>
      </div>
      {trailing && <div>{trailing}</div>}
    </div>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/renderer/src/components/chat/composer/__tests__/ChatComposerInfoBar.test.ts`

Expected: PASS — 2 tests passed.

- [ ] **Step 5: 在 ChatInputArea 把 InfoBar 接入 ChatComposer**

Modify `ChatInputArea.tsx`:

1. 顶部 import：

   ```tsx
   import { ChatComposerInfoBar } from "./composer/ChatComposerInfoBar";
   import { useChatStore } from "../../stores/chatStore";
   import { useProjectStore } from "../../stores/projectStore";
   ```

2. 在组件函数体内，先派生数据：

   ```tsx
   const currentConversation = useChatStore((s) =>
     s.conversations.find((c) => c.id === conversationId),
   );
   const projectId = currentConversation?.workspaceId &&
     currentConversation.workspaceId !== "default"
     ? currentConversation.workspaceId
     : null;
   const project = useProjectStore((s) =>
     projectId ? s.projects.find((p) => p.id === projectId) : null,
   );
   const workspaceName = project?.name ?? "未指定工作区";
   const remoteBinding = currentConversation?.remote;
   ```

3. 把 `<ChatComposer ...>` 上加 `infoBar` prop（仅当 `!hideToolbar` 时挂）:

   ```tsx
   infoBar={
     hideToolbar ? null : (
       <ChatComposerInfoBar
         workspaceName={workspaceName}
         remoteBinding={remoteBinding}
       />
     )
   }
   ```

- [ ] **Step 6: 类型检查**

Run: `pnpm check`

Expected: PASS。

- [ ] **Step 7: dev 视觉确认**

Run: `pnpm dev`

Expected：composer 下方多出一行小字："📁 {项目名}   🖥️ 本地模式"。点击不响应（Step 5 没传 onClick handler，按钮禁用）。

- [ ] **Step 8: 提交**

```bash
git add src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx \
        src/renderer/src/components/chat/composer/__tests__/ChatComposerInfoBar.test.ts \
        src/renderer/src/components/chat/ChatInputArea.tsx
git commit -m "feat(composer): add ChatComposerInfoBar below ChatComposer"
```

---

## 批次 B：胶囊 + 信息行折叠（Tasks 4-7）

### Task 4: ApprovalModePill 组件 + 文案/颜色映射测试

**Files:**
- Create: `src/renderer/src/components/chat/composer/ApprovalModePill.tsx`
- Create: `src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts`
- Modify: `src/renderer/src/i18n/locales/zh/chat.json`
- Modify: `src/renderer/src/i18n/locales/en/chat.json`

- [ ] **Step 1: 写 mapping 测试**

Create `src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { approvalModeLabel, approvalModeColor } from "../ApprovalModePill";

describe("approvalModeLabel", () => {
  it("maps each ApprovalMode to its Chinese label", () => {
    expect(approvalModeLabel("request")).toBe("按需审批");
    expect(approvalModeLabel("auto-safe")).toBe("替我审批");
    expect(approvalModeLabel("full-access")).toBe("完全放行");
  });
});

describe("approvalModeColor", () => {
  it("maps each ApprovalMode to its Tag color", () => {
    expect(approvalModeColor("request")).toBe("default");
    expect(approvalModeColor("auto-safe")).toBe("blue");
    expect(approvalModeColor("full-access")).toBe("orange");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts`

Expected: FAIL — module not found。

- [ ] **Step 3: 创建组件**

Create `src/renderer/src/components/chat/composer/ApprovalModePill.tsx`:

```tsx
import { DownOutlined, SafetyOutlined } from "@ant-design/icons";
import { Popover, Radio, Space, Tooltip } from "antd";
import { useState } from "react";
import { useProjectStore } from "../../../stores/projectStore";
import type { ApprovalMode } from "@super-client/shared-types/chat";

export function approvalModeLabel(mode: ApprovalMode): string {
  switch (mode) {
    case "request":
      return "按需审批";
    case "auto-safe":
      return "替我审批";
    case "full-access":
      return "完全放行";
  }
}

export function approvalModeColor(mode: ApprovalMode): string {
  switch (mode) {
    case "request":
      return "default";
    case "auto-safe":
      return "blue";
    case "full-access":
      return "orange";
  }
}

const APPROVAL_MODES: ApprovalMode[] = ["request", "auto-safe", "full-access"];

export interface ApprovalModePillProps {
  projectId: string | null;
  approvalMode: ApprovalMode | undefined;
}

/**
 * 项目级权限胶囊。Agent-only 路径下由调用方根据 projectId 和 approvalMode 决定渲染。
 * 写回路径：useProjectStore.saveSettings(projectId, { runtimePolicy: { approvalMode } })。
 */
export function ApprovalModePill({ projectId, approvalMode }: ApprovalModePillProps) {
  const [open, setOpen] = useState(false);

  if (!projectId || !approvalMode) return null;

  const handleChange = async (next: ApprovalMode) => {
    if (next === approvalMode) {
      setOpen(false);
      return;
    }
    await useProjectStore.getState().saveSettings(projectId, {
      runtimePolicy: { approvalMode: next },
    });
    setOpen(false);
  };

  const popoverContent = (
    <Radio.Group
      value={approvalMode}
      onChange={(e) => void handleChange(e.target.value as ApprovalMode)}
    >
      <Space direction="vertical" size={4}>
        {APPROVAL_MODES.map((mode) => (
          <Radio key={mode} value={mode}>
            {approvalModeLabel(mode)}
          </Radio>
        ))}
      </Space>
    </Radio.Group>
  );

  const color = approvalModeColor(approvalMode);

  return (
    <Tooltip title="工作区级权限策略，影响该工作区所有会话">
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        content={popoverContent}
        placement="top"
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
          style={{
            background:
              color === "blue"
                ? "rgba(22,119,255,0.12)"
                : color === "orange"
                  ? "rgba(250,140,22,0.14)"
                  : "rgba(0,0,0,0.06)",
            color:
              color === "blue"
                ? "#1677ff"
                : color === "orange"
                  ? "#fa8c16"
                  : "inherit",
            border: "none",
            cursor: "pointer",
          }}
        >
          <SafetyOutlined style={{ fontSize: 12 }} />
          <span>{approvalModeLabel(approvalMode)}</span>
          <DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />
        </button>
      </Popover>
    </Tooltip>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts`

Expected: PASS — 2 tests passed。

- [ ] **Step 5: 类型检查**

Run: `pnpm check`

Expected: PASS。如果 ApprovalMode 类型导入失败，确认 `@super-client/shared-types/chat` 是否暴露该类型；alternatively import from local `src/renderer/src/types`。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/chat/composer/ApprovalModePill.tsx \
        src/renderer/src/components/chat/composer/__tests__/ApprovalModePill.test.ts
git commit -m "feat(composer): add ApprovalModePill with workspace-level write-back"
```

---

### Task 5: ChatModePill（superseded，不再实现 chat / agent 切换）

> 当前产品固定 Agent-only。本任务废弃，不创建 `ChatModePill.tsx`，不新增 direct/chat 用户切换入口。
> 如需要展示运行状态，使用只读 Agent 状态/审批控件，并把 legacy `chatMode` 当作 compatibility metadata。

---

### Task 6: ChatInputArea footer 替换为新胶囊布局

**Files:**
- Modify: `src/renderer/src/components/chat/ChatInputArea.tsx`

> 目标：把 Task 2 中保留的旧 footer JSX 替换为：左侧 [+] [Agent/Approval 状态] [搜索引擎 icon]，右侧 [模型胶囊] [mic placeholder] [发送/stop]。
> ChatToolbar 的子功能（附件 / Prompt / 引用 / Tools）批次 C 才收敛到 +；本任务暂保留 ChatToolbar 在右侧，作为过渡。

- [ ] **Step 1: 把 useProjectSettings + ApprovalModePill 接入**

In `ChatInputArea.tsx` 顶部 import：

```tsx
import { ApprovalModePill } from "./composer/ApprovalModePill";
import { useProjectSettings } from "../../stores/projectStore";
```

In 组件函数体（紧接在 Task 3 添加的 currentConversation/projectId 之后）：

```tsx
const projectSettings = useProjectSettings(projectId);
const approvalMode = projectSettings?.runtimePolicy?.approvalMode;
```

- [ ] **Step 2: 替换 renderFooter**

Find the `renderFooter={(_footerNode, { components }) => { ... }}` block. Replace its body with:

```tsx
renderFooter={(_footerNode, { components }) => {
  const { SendButton } = components;
  if (hideToolbar) {
    return (
      <Flex justify="end" align="center">
        {isStreaming ? (
          <Tooltip title={t("actions.stop", "Stop", { ns: "chat" })}>
            <Button
              className="chat-stop-btn"
              type="primary"
              danger
              shape="circle"
              icon={<PauseCircleOutlined />}
              onClick={onStopStream}
            />
          </Tooltip>
        ) : (
          <SendButton className="chat-send-btn" type="primary" shape="circle" />
        )}
      </Flex>
    );
  }
  return (
    <Flex justify="space-between" align="center">
      <Flex align="center" gap={8}>
        {/* + 入口（批次 C 之前先复用 ChatToolbar 第一个图标的逻辑；过渡期保留原 ChatToolbar 在右侧；这里先放占位的 + 按钮，仅打开附件入口） */}
        {/* 批次 C 把 ChatToolsMenu 接到这个位置 */}
        <ApprovalModePill projectId={projectId} approvalMode={approvalMode} />
        {selectedSkillId && (
          <Tag
            color="green"
            className="text-xs flex items-center gap-0.5 m-0"
            closeIcon={<CloseOutlined className="text-[10px]" />}
            onClose={(e) => {
              e.preventDefault();
              onClearSkill();
            }}
          >
            <ThunderboltOutlined className="text-[10px]" />
            <span className="ml-0.5">{t("chatMode.skillActive", "Skill", { ns: "chat" })}</span>
          </Tag>
        )}
        {/* 过渡期保留 ChatToolbar 在右侧 — 批次 C 替换为 ChatToolsMenu */}
        <ChatToolbar
          conversationId={conversationId}
          selectedEngine={selectedEngine}
          onSelectEngine={onSelectEngine}
          hasSearchEngines={hasSearchEngines}
          currentEngine={currentEngine}
          searchPopoverOpen={searchPopoverOpen}
          onSearchPopoverToggle={() => setSearchPopoverOpen(!searchPopoverOpen)}
          onUploadComplete={(attachments) => {
            setAttachedFiles((prev) => [...prev, ...attachments]);
          }}
          onPromptSelect={handlePromptSelect}
          onQuoteSelect={handleQuoteSelect}
          onToolSelect={handleToolSelect}
        />
      </Flex>
      <Flex align="center" gap={8}>
        {isStreaming ? (
          <Tooltip title={t("actions.stop", "终止", { ns: "chat" })}>
            <Button
              className="chat-stop-btn"
              type="primary"
              danger
              shape="circle"
              icon={<PauseCircleOutlined />}
              onClick={onStopStream}
            />
          </Tooltip>
        ) : (
          <SendButton className="chat-send-btn" type="primary" shape="circle" />
        )}
      </Flex>
    </Flex>
  );
}}
```

> 把原本独立的 ChatModePanel button block（Tooltip 包着 Button 的那段）整段移除；不要用新的模式切换控件替代。

- [ ] **Step 3: 类型检查**

Run: `pnpm check`

Expected: PASS。

- [ ] **Step 4: dev 视觉与功能验证**

Run: `pnpm dev`

Expected：
1. 底部不出现 chat / agent 模式切换；项目会话可看到 ApprovalModePill。
2. ApprovalModePill 点击弹 popover，选另一个值 → ProjectSettings 变更（短暂等待后 popover 关闭，下次点击显示新值）。
3. 普通 casual 会话没有项目级 approval settings 时不渲染 ApprovalModePill。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/chat/ChatInputArea.tsx
git commit -m "feat(composer): replace footer with approval controls"
```

---

### Task 7: 信息行 ⋯ popup 接管 plan/sandbox/context；移除 ComposerStatusBar 渲染

**Files:**
- Modify: `src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx`（加 ⋯ trailing popup）
- Modify: `src/renderer/src/components/chat/ChatInputArea.tsx`（注入 trailing）
- Modify: `src/renderer/src/pages/Chat.tsx`（删除 `<ComposerStatusBar />` 渲染）

> 策略：把 ComposerStatusBar 现有渲染逻辑（plan/sandbox/context tag + plan mode popover）整段抽出为 `ComposerStatusBar` 仍可被 import 的 React 函数（不删文件，删除"审批"和"模型"两个 tag）。把它作为 `trailing` prop 注入 InfoBar 末尾的 ⋯ popup 内。

- [ ] **Step 1: ComposerStatusBar 内部精简：删除 model 和 approval 两个 tag**

Open `src/renderer/src/components/chat/ComposerStatusBar.tsx`. 删除：
- 整个 `Tooltip title="点击切换模型"` 包着的 `<Tag ...>` 块（model tag）。
- 整个 `Tooltip title="审批模式（来自工作区策略）"` 包着的 `<Tag ...>` 块（approval tag）。

保留：profile / plan / sandbox / context 四个 tag。

- [ ] **Step 2: 把 ComposerStatusBar 输出去掉外层 padding 容器**

Find the return JSX:
```tsx
return (
  <div className="px-6 pb-2 -mt-2">
    <div className="mx-auto max-w-4xl">
      <Space size={4} wrap className="text-xs">
        ...
      </Space>
    </div>
  </div>
);
```

Replace with：

```tsx
return (
  <Space size={4} wrap className="text-xs">
    ...
  </Space>
);
```

> 现在 ComposerStatusBar 是一个不带容器的 inline 内容块，可被 InfoBar 嵌入到 popup 里。

- [ ] **Step 3: 在 InfoBar 中支持 ⋯ trailing popup**

Modify `src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx`. 在 import 加：

```tsx
import { MoreOutlined } from "@ant-design/icons";
import { Popover } from "antd";
```

Replace the existing `{trailing && <div>{trailing}</div>}` block with：

```tsx
{trailing && (
  <Popover
    content={<div className="max-w-[420px]">{trailing}</div>}
    trigger="click"
    placement="topRight"
  >
    <button
      type="button"
      className="inline-flex items-center justify-center w-5 h-5 rounded"
      style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}
      aria-label="更多状态"
    >
      <MoreOutlined style={{ fontSize: 14 }} />
    </button>
  </Popover>
)}
```

- [ ] **Step 4: ChatInputArea 把 ComposerStatusBar 作为 InfoBar trailing 注入**

In `ChatInputArea.tsx`:

```tsx
import { ComposerStatusBar } from "./ComposerStatusBar";
```

把 InfoBar 的 prop 改为：

```tsx
infoBar={
  hideToolbar ? null : (
    <ChatComposerInfoBar
      workspaceName={workspaceName}
      remoteBinding={remoteBinding}
      trailing={<ComposerStatusBar />}
    />
  )
}
```

- [ ] **Step 5: 删除 Chat.tsx 中独立渲染 ComposerStatusBar**

Open `src/renderer/src/pages/Chat.tsx`. Find the JSX block：

```tsx
<>
  <ChatInputArea ... />
  <ComposerStatusBar />
</>
```

Replace 为单独的 `<ChatInputArea ... />`（去掉 fragment 和 ComposerStatusBar）：

```tsx
<ChatInputArea ... />
```

如果 `<ComposerStatusBar />` import 在 Chat.tsx 顶部不再被引用，删除该 import。

- [ ] **Step 6: 类型检查 + dev 验证**

Run: `pnpm check && pnpm dev`

Expected：
1. ChatInputArea 下方只有一行 InfoBar：📁 项目名 · 🖥️ 本地模式 · ⋯
2. 点击 ⋯ 弹出 popup，里面是 profile / plan / sandbox / context tags（plan mode 仍可点开切换）。
3. 旧的 ComposerStatusBar 独立行不再出现。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/components/chat/ComposerStatusBar.tsx \
        src/renderer/src/components/chat/composer/ChatComposerInfoBar.tsx \
        src/renderer/src/components/chat/ChatInputArea.tsx \
        src/renderer/src/pages/Chat.tsx
git commit -m "refactor(composer): collapse status bar tags into info bar popup"
```

---

## 批次 C：+ 菜单收敛（Tasks 8-9）

### Task 8: 创建 ChatToolsMenu

**Files:**
- Create: `src/renderer/src/components/chat/composer/ChatToolsMenu.tsx`

- [ ] **Step 1: 创建组件**

Create `src/renderer/src/components/chat/composer/ChatToolsMenu.tsx`:

```tsx
import { FileTextOutlined, MessageOutlined, PaperClipOutlined, PlusOutlined, ToolOutlined } from "@ant-design/icons";
import { Popover } from "antd";
import { useState } from "react";

export interface ChatToolsMenuProps {
  onAttachment: () => void;
  onPromptTemplate: () => void;
  onQuote: () => void;
  onTools: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export function ChatToolsMenu({
  onAttachment,
  onPromptTemplate,
  onQuote,
  onTools,
}: ChatToolsMenuProps) {
  const [open, setOpen] = useState(false);

  const items: MenuItem[] = [
    { key: "attach", label: "附件", icon: <PaperClipOutlined />, onClick: onAttachment },
    { key: "prompt", label: "Prompt 模板", icon: <FileTextOutlined />, onClick: onPromptTemplate },
    { key: "quote", label: "引用消息", icon: <MessageOutlined />, onClick: onQuote },
    { key: "tools", label: "Tools", icon: <ToolOutlined />, onClick: onTools },
  ];

  const handleItem = (item: MenuItem) => {
    setOpen(false);
    // 让 Popover 先关闭，再触发原 panel — 避免动画/焦点冲突
    requestAnimationFrame(() => item.onClick());
  };

  const content = (
    <div className="flex flex-col" style={{ minWidth: 160 }}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => handleItem(item)}
          className="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0,0,0,0.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <span className="w-4 flex items-center justify-center">{item.icon}</span>
          <span className="flex-1 text-left">{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} content={content} trigger="click" placement="topLeft">
      <button
        type="button"
        className="inline-flex items-center justify-center w-7 h-7 rounded transition-colors"
        style={{ background: open ? "rgba(0,0,0,0.06)" : "transparent", border: "none", cursor: "pointer", color: "inherit" }}
        aria-label="工具"
      >
        <PlusOutlined style={{ fontSize: 14 }} />
      </button>
    </Popover>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm check`

Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/chat/composer/ChatToolsMenu.tsx
git commit -m "feat(composer): add ChatToolsMenu (+ button popover)"
```

---

### Task 9: 用 ChatToolsMenu 替换 ChatToolbar 在 footer 中的位置

**Files:**
- Modify: `src/renderer/src/components/chat/ChatInputArea.tsx`

> 策略：原 ChatToolbar 接收 5 个 callback（upload / prompt / quote / tool / search engine），其中 search engine 保留为独立图标。本任务把"附件 / prompt / quote / tools"挪到 ChatToolsMenu，搜索引擎拆出来成独立按钮。

- [ ] **Step 1: 在 ChatInputArea 加状态来控制各 panel 的显隐**

ChatToolbar 内部本来管理这些 panel 的开关。把它们提到 ChatInputArea：

```tsx
const [promptPanelOpen, setPromptPanelOpen] = useState(false);
const [quotePanelOpen, setQuotePanelOpen] = useState(false);
const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
const [filePickerOpen, setFilePickerOpen] = useState(false);
```

> 实施前必须先读 `src/renderer/src/components/chat/toolbar/ChatToolbar.tsx` 看 prompt / quote / tools / upload 各自的 panel 触发模式。如果 ChatToolbar 内部用 Popover trigger="click" 包子按钮，可能要把 panel 组件直接 import 到 ChatInputArea 自己控制。

- [ ] **Step 2: 替换 footer 左侧第一个位置（占位 + 注释处）**

In `renderFooter` 中，把现有 `<ChatToolbar ... />` 整块替换为：

```tsx
<ChatToolsMenu
  onAttachment={() => setFilePickerOpen(true)}
  onPromptTemplate={() => setPromptPanelOpen(true)}
  onQuote={() => setQuotePanelOpen(true)}
  onTools={() => setToolsPanelOpen(true)}
/>
{/* 搜索引擎图标 — 单独保留可见性 */}
<Tooltip title={currentEngine?.name ?? "选择搜索引擎"}>
  <button
    type="button"
    onClick={() => setSearchPopoverOpen(!searchPopoverOpen)}
    className="inline-flex items-center justify-center w-7 h-7 rounded transition-colors"
    style={{
      background: searchPopoverOpen ? "rgba(0,0,0,0.06)" : "transparent",
      border: "none",
      cursor: "pointer",
      color: "inherit",
    }}
    aria-label="搜索引擎"
    disabled={!hasSearchEngines}
  >
    {currentEngine?.icon ?? <SearchOutlined style={{ fontSize: 14 }} />}
  </button>
</Tooltip>
```

加 import：

```tsx
import { SearchOutlined } from "@ant-design/icons";
import { ChatToolsMenu } from "./composer/ChatToolsMenu";
```

- [ ] **Step 3: 把原 ChatToolbar 内部的子 panel 渲染挪到 ChatInputArea 的 topOverlay**

把现有 topOverlay 中追加 PromptTemplatePanel / QuotePanel / ToolsPanel / FileUpload 组件的渲染（使用对应 isOpen state 控制）。具体 props 参考 `ChatToolbar` 内部的用法。

> 如果各子 panel 现在是绝对定位在 toolbar 上方，挪到 topOverlay 后位置应该一样。注意 z-index 与现有 slash panel 一致。

- [ ] **Step 4: 类型检查 + dev 验证**

Run: `pnpm check && pnpm dev`

Expected：
1. composer 底部左侧只有 + 按钮、搜索引擎图标和可用时的 ApprovalModePill；没有模式切换控件。
2. 点击 + 弹菜单：附件 / Prompt / 引用 / Tools 四项。
3. 选其中任何一项，菜单关闭，对应 panel 弹出。
4. 搜索引擎图标点击 → SearchEnginePanel 打开。
5. 旧的 ChatToolbar 不再显示。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/chat/ChatInputArea.tsx
git commit -m "feat(composer): replace ChatToolbar with ChatToolsMenu + search icon"
```

---

## 批次 D：欢迎页迁移（Tasks 10-12）

### Task 10: ClaudeEmptyChatHome 切换到 ChatComposer

**Files:**
- Modify: `src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx`

> 目标：替换现有 `<TextArea ...>` + 内置 footer 为 `<ChatComposer ...>`。先保留 chips / notice / greeting，下一个 task 删除。

- [ ] **Step 1: 替换核心 composer**

Open `src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx`. 替换 `<div style={composerStyle}>...</div>` 整块（包含 TextArea + 自定义 footer）为：

```tsx
<ChatComposer
  value={text}
  onChange={setText}
  onSubmit={(value) => {
    if (!value.trim() || isStreaming) return;
    onSend(value.trim());
    setText("");
  }}
  isStreaming={isStreaming}
  placeholder="想做什么？"
  renderFooter={(_footerNode, { components }) => {
    const { SendButton } = components;
    return (
      <div className="flex items-center justify-between">
        <div />
        <SendButton type="primary" shape="circle" />
      </div>
    );
  }}
/>
```

加 import：

```tsx
import { ChatComposer } from "./composer/ChatComposer";
```

> 批次 D 第一步只是切换底层。chips / notice / greeting 仍保留。

- [ ] **Step 2: 类型检查 + dev 验证**

Run: `pnpm check && pnpm dev`

Expected：欢迎页 composer 视觉与会话内 composer 一致；输入消息按 Enter 能正常发送。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx
git commit -m "refactor(welcome): switch ClaudeEmptyChatHome to ChatComposer"
```

---

### Task 11: 欢迎页标题改为 workspace 风格

**Files:**
- Modify: `src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx`

- [ ] **Step 1: 加 workspace 数据派生**

In `ClaudeEmptyChatHome.tsx` 顶部 imports 加：

```tsx
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";
```

In 函数体内（`getTimeGreeting` 调用前后）：

```tsx
const currentConvId = useChatStore((s) => s.currentConversationId);
const conversation = useChatStore((s) =>
  s.conversations.find((c) => c.id === currentConvId),
);
const projectId =
  conversation?.workspaceId && conversation.workspaceId !== "default"
    ? conversation.workspaceId
    : null;
const project = useProjectStore((s) =>
  projectId ? s.projects.find((p) => p.id === projectId) : null,
);

const titleText = project
  ? `我们应该在 ${project.name} 中构建什么?`
  : "今天想做什么?";
```

- [ ] **Step 2: 替换 `<h1>` 内容**

Find the existing `<h1 className="m-0" ...>` block. Replace its inner JSX with:

```tsx
<h1
  className="m-0"
  style={{
    fontWeight: 400,
    fontSize: 30,
    letterSpacing: "-0.01em",
    color: token.colorTextHeading,
    opacity: 0.88,
    marginBottom: 44,
    textAlign: "center",
  }}
>
  {titleText}
</h1>
```

> 注意：移除原来的 `<span fontFamily=SERIF_FONT_FAMILY ...>` 双 span 结构；新标题是单段纯文本。`SERIF_FONT_FAMILY` 与 `getTimeGreeting` 现在 dead code，会在 Task 12 清理。

- [ ] **Step 3: dev 视觉验证**

Run: `pnpm dev`

Expected：
1. 进入项目会话，欢迎页标题显示"我们应该在 {项目名} 中构建什么?"。
2. casual 会话标题显示"今天想做什么?"。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx
git commit -m "feat(welcome): use workspace-aware title"
```

---

### Task 12: 删除 chips / notice / greeting 余孽

**Files:**
- Modify: `src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx`

- [ ] **Step 1: 删除 QUICK_CHIPS / ChipButton / 相关 state 与渲染**

In `ClaudeEmptyChatHome.tsx`：

1. 删除 `QUICK_CHIPS` 常量（顶部）。
2. 删除 `interface QuickChip`。
3. 删除组件函数底部 `<div className="flex flex-wrap items-center justify-center" ...>` 内 `QUICK_CHIPS.map(...)` 整块。
4. 删除 `ChipButton` 函数定义（文件底部）。
5. 删除 `handleChipClick` callback。

- [ ] **Step 2: 删除 noticeVisible / 提示条**

1. 删除 `const [noticeVisible, setNoticeVisible] = useState(true);`。
2. 删除底部 `{noticeVisible && (...)}` 整块。

- [ ] **Step 3: 删除 timeWord / SERIF_FONT_FAMILY / getTimeGreeting**

1. 删除 `const SERIF_FONT_FAMILY = ...`。
2. 删除 `function getTimeGreeting(hour) { ... }`。
3. 删除 `const timeWord = useMemo(...)`。
4. 删除 `userName` / `displayName` 的派生（如果不再使用）。

- [ ] **Step 4: 类型检查（Unused 警告处理）**

Run: `pnpm check`

如果有 unused import / variable 报错，按报错位置删除：常见是 `useUserStore` / `Tooltip` / 等。

- [ ] **Step 5: dev 验证最终视觉**

Run: `pnpm dev`

Expected：欢迎页只剩：
1. 顶部 workspace 标题
2. 中部 ChatComposer（带 InfoBar）
3. 没有 chips、notice、greeting

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/chat/ClaudeEmptyChatHome.tsx
git commit -m "refactor(welcome): remove chips, notice, and time greeting"
```

---

## 风险与未决（来自 spec）

- **Sender 在欢迎页对 onSubmit 的契约**：批次 D 验证 `Sender.onSubmit` 接受 `(value: string) => void`；目前 `@ant-design/x` 的 Sender 文档与现有 ChatInputArea 用法一致，应无问题。
- **useProjectSettings 写入 API**：已确认 `useProjectStore.getState().saveSettings(projectId, patch)` 是写入路径，patch 用 `Partial<ProjectSettings>`。Task 4 已用此 API。
- **ApprovalMode 类型导入路径**：Task 4 假设 `@super-client/shared-types/chat` 暴露。如果路径不对，类型检查会立刻报错；候选路径：直接从 `src/renderer/src/types/chat.ts` 或主进程 types 取。
- **batches 间的视觉过渡**：批次 A 完成后视觉零变化；批次 B 完成后底部多两个胶囊但旧 ChatToolbar 仍显示（一个过渡态，可接受合入）；批次 C 完成后视觉接近图；批次 D 后欢迎页统一。
- **`+` 菜单子 panel 的渲染位置**：Task 9 Step 3 需要把 PromptTemplatePanel / QuotePanel / ToolsPanel / FileUpload 的渲染挪进 topOverlay。如果原 ChatToolbar 内部 panel 用了相对/绝对定位需要确认 z-index 与 slash panel 一致。

---

## 完成判定

- 12 个 task 全部完成 + 各自验收清单通过
- `pnpm check` 全绿
- `pnpm vitest run` 全绿
- 截图对比图：composer 视觉与图基本一致；欢迎页标题、composer、信息行三段式

合入策略：每个批次（A/B/C/D）作为独立 PR，按顺序合入。
