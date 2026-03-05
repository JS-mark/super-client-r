# 项目结构规范

## 目录结构

```
super-client-r/
├── .claude/                    # Claude Code 配置
├── docs/                       # 项目文档
│   ├── ARCHITECTURE.md         # 架构设计
│   ├── PROJECT_STRUCTURE.md    # 本文件
│   ├── CODING_STANDARDS.md     # 代码规范
│   ├── DEVELOPMENT.md          # 开发指南
│   └── API.md                  # API 文档
├── out/                        # 构建输出 (gitignore)
│   ├── main/                   # 主进程构建输出
│   ├── preload/                # 预加载脚本输出
│   └── renderer/               # 渲染进程构建输出
├── dist/                       # 打包输出 (gitignore)
├── public/                     # 静态资源
├── scripts/                    # 构建脚本和工具
│   └── i18n/                   # 国际化脚本
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── ipc/                # IPC 通信
│   │   ├── services/           # 业务服务
│   │   ├── server/             # Koa HTTP 服务器
│   │   ├── store/              # 持久化存储
│   │   ├── utils/              # 工具函数
│   │   └── main.ts             # 主入口
│   ├── preload/                # 预加载脚本
│   │   └── index.ts
│   └── renderer/               # 渲染进程 (React)
│       ├── components/         # UI 组件
│       ├── hooks/              # 自定义 Hooks
│       ├── pages/              # 页面组件
│       ├── services/           # 服务客户端
│       ├── stores/             # 状态管理
│       ├── types/              # TypeScript 类型
│       ├── i18n/               # 国际化
│       ├── App.tsx             # 根组件
│       ├── router.tsx          # 路由配置
│       ├── main.tsx            # 渲染入口
│       └── index.css           # 全局样式
├── package.json
├── electron.vite.config.ts     # Electron Vite 配置
├── tsconfig.json               # 根 TypeScript 配置
├── tsconfig.node.json          # Node 配置
├── tsconfig.web.json           # Web 配置
├── biome.json                  # Biome 配置
└── pnpm-workspace.yaml         # PNPM 工作区
```

---

## 文件命名规范

### 1. 通用规则

| 类型 | 命名规范 | 示例 |
|------|----------|------|
| 组件文件 | PascalCase | `ChatInput.tsx`, `MainLayout.tsx` |
| 工具/服务文件 | camelCase | `useChat.ts`, `apiService.ts` |
| 类型定义文件 | camelCase | `types.ts`, `menu.ts` |
| 常量文件 | UPPER_SNAKE_CASE (导出) | `CHANNELS.ts` |
| 样式文件 | 同组件名 | `index.css` |

### 2. 目录命名

- 小写 + 连字符 (kebab-case): `src/main/ipc/handlers/`
- 复数形式: `components/`, `hooks/`, `services/`

### 3. 测试文件 (预留)

```
ComponentName.test.tsx        # 单元测试
ComponentName.stories.tsx     # Storybook
__tests__/                    # 测试目录
```

---

## 模块组织

### 1. 组件模块

```typescript
// 文件: src/renderer/src/components/chat/ChatInput.tsx

// 1. 导入 (按类型分组)
import { useState } from 'react';                    // React 内置
import { Button, Input } from 'antd';               // 第三方库
import { useChat } from '@/hooks/useChat';          // 本地模块
import type { ChatMessage } from '@/types';         // 类型

// 2. 类型定义
interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

// 3. 组件定义
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  // 实现
}

// 4. 默认导出 (可选)
export default ChatInput;
```

### 2. Hook 模块

```typescript
// 文件: src/renderer/src/hooks/useChat.ts

import { useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';

export function useChat() {
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);

  const sendMessage = useCallback((content: string) => {
    // 实现
  }, [addMessage]);

  return {
    messages,
    sendMessage,
  };
}
```

### 3. Store 模块

```typescript
// 文件: src/renderer/src/stores/chatStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '@/types';

interface ChatState {
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),
    }),
    {
      name: 'chat-storage',
    }
  )
);
```

### 4. Service 模块

```typescript
// 文件: src/main/services/agent/AgentService.ts

import { EventEmitter } from 'events';
import type { AgentSession, AgentMessage } from '@/ipc/types';

export class AgentService extends EventEmitter {
  private sessions = new Map<string, AgentSession>();

  async createSession(): Promise<AgentSession> {
    // 实现
  }

  async sendMessage(sessionId: string, content: string): Promise<void> {
    // 实现
  }
}

// 单例导出
export const agentService = new AgentService();
```

---

## 导入规范

### 1. 导入顺序

```typescript
// 1. 内置模块
import { join } from 'path';
import { EventEmitter } from 'events';

// 2. 第三方库
import { ipcMain } from 'electron';
import React from 'react';
import { Button } from 'antd';

// 3. 本地绝对导入 (@/ 别名)
import { useChatStore } from '@/stores/chatStore';
import type { ChatMessage } from '@/types';

// 4. 本地相对导入
import { formatMessage } from './utils';
import { MessageItem } from './MessageItem';
```

### 2. 路径别名

| 别名 | 指向 | 使用场景 |
|------|------|----------|
| `@/` | `src/renderer/src/` | Renderer 代码 |
| `@main/` | `src/main/` | Main 代码 |
| `@preload/` | `src/preload/` | Preload 代码 |

**注意**: 当前配置仅支持 `@/` 指向 renderer，main 和 preload 使用相对路径。

---

## 新增功能指南

### 1. 添加新页面

```
1. 创建页面组件: src/renderer/src/pages/NewPage.tsx
2. 添加路由: src/renderer/src/router.tsx
3. 添加到菜单: src/renderer/src/components/layout/MainLayout.tsx
4. 添加 i18n key: src/renderer/src/i18n/locales/*/common.json
```

### 2. 添加新 IPC 通道

```
1. 定义通道: src/main/ipc/channels.ts
   添加 CHANNEL_NAME 常量

2. 定义类型: src/main/ipc/types.ts
   添加请求/响应类型

3. 实现处理: src/main/ipc/handlers/newHandler.ts
   实现业务逻辑

4. 注册处理: src/main/ipc/index.ts
   导入并注册新处理器

5. 暴露 API: src/preload/index.ts
   添加到 contextBridge.exposeInMainWorld

6. 客户端封装: src/renderer/src/services/
   创建对应的服务客户端
```

### 3. 添加新 Store

```
1. 创建 Store: src/renderer/src/stores/newStore.ts
2. 定义类型: src/renderer/src/types/new.ts
3. 创建 Hook: src/renderer/src/hooks/useNew.ts
```

### 4. 添加新服务

```
Main Process:
1. 创建服务: src/main/services/new/NewService.ts
2. 导出服务: src/main/services/index.ts
3. 创建 IPC: src/main/ipc/handlers/newHandlers.ts

Renderer Process:
1. 创建客户端: src/renderer/src/services/new/
```

---

## 代码组织原则

### 1. 单一职责
- 一个文件只做一件事
- 一个组件只负责一个功能
- 一个 Hook 只封装一个逻辑

### 2. 分层清晰
```
Page → Component → Hook → Store → Service
  ↑        ↑          ↑       ↑        ↑
  └────────┴──────────┴───────┴────────┘
              依赖方向 (上层依赖下层)
```

### 3. 避免循环依赖
```
❌ 错误:
A.ts → B.ts → C.ts → A.ts

✅ 正确:
types.ts (仅类型)
  ↓
A.ts, B.ts, C.ts (独立依赖 types)
```

### 4. 公共代码抽取
- 重复 3 次以上的代码 → 抽取为工具函数
- 共享状态 → 抽取为 Store
- 通用 UI → 抽取为组件
