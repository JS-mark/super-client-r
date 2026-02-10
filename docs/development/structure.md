# 项目结构

深入了解 Super Client R 的代码组织和文件结构。

## 目录概览

```
super-client-r/
├── src/                      # 源代码
│   ├── main/                # Electron 主进程
│   ├── preload/             # 预加载脚本
│   └── renderer/            # 渲染进程
├── docs/                     # 文档
├── build/                    # 构建资源
├── scripts/                  # 脚本工具
├── out/                      # 编译输出（开发）
├── dist/                     # 打包输出（生产）
├── electron.vite.config.ts   # Electron Vite 配置
├── tsconfig.*.json          # TypeScript 配置
└── package.json             # 项目配置
```

## 主进程 (src/main/)

```
main/
├── main.ts                  # 主入口
├── ipc/                     # IPC 通信
│   ├── channels.ts         # 通道定义
│   ├── types.ts            # 类型定义
│   ├── index.ts            # 注册入口
│   └── handlers/           # 处理器
│       ├── appHandlers.ts
│       ├── chatHandlers.ts
│       ├── mcpHandlers.ts
│       └── skillHandlers.ts
├── services/               # 业务服务
│   ├── agent/             # Agent 服务
│   ├── mcp/               # MCP 服务
│   ├── skill/             # 技能服务
│   └── index.ts           # 服务导出
├── server/                # HTTP 服务器
│   ├── app.ts            # Koa 应用
│   ├── routes/           # 路由
│   └── middlewares/      # 中间件
├── store/                 # 数据存储
│   └── StoreManager.ts
└── utils/                 # 工具函数
    └── logger.ts
```

### 关键文件

**main.ts**
- 应用生命周期管理
- 窗口创建
- 服务初始化

**ipc/channels.ts**
- 定义所有 IPC 通道名称
- 确保主进程和渲染进程使用相同通道

**services/**
- EventEmitter 模式
- 业务逻辑封装
- 状态管理

## 预加载脚本 (src/preload/)

```
preload/
└── index.ts                # 预加载入口
```

预加载脚本负责：
- 安全地暴露主进程 API
- 定义 `window.electronAPI` 接口
- 桥接主进程和渲染进程

## 渲染进程 (src/renderer/)

```
renderer/
├── index.html             # HTML 模板
├── main.tsx              # React 入口
├── src/
│   ├── pages/            # 页面组件
│   │   ├── Chat.tsx
│   │   ├── MCP.tsx
│   │   ├── Skills.tsx
│   │   └── Settings.tsx
│   ├── components/       # 可复用组件
│   │   ├── layout/      # 布局组件
│   │   ├── chat/        # 聊天相关
│   │   └── common/      # 通用组件
│   ├── hooks/            # 自定义 Hooks
│   │   ├── useChat.ts
│   │   ├── useMCP.ts
│   │   └── useSkill.ts
│   ├── stores/           # Zustand 状态
│   │   ├── chatStore.ts
│   │   ├── mcpStore.ts
│   │   └── skillStore.ts
│   ├── services/         # 服务客户端
│   │   ├── api.ts
│   │   └── ipc.ts
│   ├── types/            # TypeScript 类型
│   │   ├── chat.ts
│   │   ├── mcp.ts
│   │   └── skill.ts
│   ├── i18n/             # 国际化
│   │   ├── index.ts
│   │   └── locales/
│   ├── lib/              # 工具库
│   │   └── utils.ts
│   └── styles/           # 样式文件
│       └── index.css
```

### 页面组件 (pages/)

每个页面对应一个路由：

```tsx
// Chat.tsx
export default function ChatPage() {
  return (
    <MainLayout>
      <ChatContainer />
    </MainLayout>
  );
}
```

### 组件 (components/)

按功能分组：

```
components/
├── layout/
│   ├── MainLayout.tsx    # 主布局
│   ├── Sidebar.tsx       # 侧边栏
│   └── Header.tsx        # 顶部导航
├── chat/
│   ├── ChatInput.tsx     # 聊天输入
│   ├── MessageList.tsx   # 消息列表
│   └── MessageBubble.tsx # 消息气泡
└── common/
    ├── Button.tsx        # 按钮
    ├── Modal.tsx         # 弹窗
    └── Loading.tsx       # 加载
```

### Hooks (hooks/)

业务逻辑封装：

```typescript
// useChat.ts
export function useChat() {
  const [messages, setMessages] = useState([]);
  const sendMessage = useCallback(async (content: string) => {
    // 实现
  }, []);
  return { messages, sendMessage };
}
```

### 状态管理 (stores/)

Zustand store：

```typescript
// chatStore.ts
export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      addMessage: (msg) => set((state) => ({
        messages: [...state.messages, msg]
      })),
    }),
    { name: 'chat-storage' }
  )
);
```

## 配置文件

### TypeScript 配置

```
tsconfig.json              # 根配置
tsconfig.node.json        # Node 进程配置
tsconfig.web.json         # 渲染进程配置
```

### Vite 配置

```
electron.vite.config.ts   # Electron Vite 配置
```

关键配置：
- 主进程入口
- 预加载脚本入口
- 渲染进程入口
- 别名配置

### 构建配置

```
package.json              # electron-builder 配置
```

## 命名规范

### 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `ChatInput.tsx` |
| Hooks | camelCase | `useChat.ts` |
| Stores | camelCase | `useChatStore.ts` |
| 工具 | camelCase | `formatDate.ts` |
| 类型 | PascalCase | `chat.types.ts` |
| 常量 | UPPER_SNAKE | `CONSTANTS.ts` |

### 代码组织

**导入顺序：**

```tsx
// 1. React/框架
import React, { useState } from 'react';

// 2. 第三方库
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

// 3. 绝对路径导入
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/lib/utils';

// 4. 相对路径导入
import { MessageBubble } from './MessageBubble';

// 5. 类型导入
import type { Message } from '@/types/chat';
```

## 模块依赖

```
main/
  ├── services/     (无依赖，最底层)
  ├── store/
  ├── ipc/         (依赖 services)
  └── main.ts      (依赖所有)

renderer/
  ├── lib/         (无依赖)
  ├── types/
  ├── i18n/
  ├── services/    (依赖 lib)
  ├── stores/      (依赖 services)
  ├── hooks/       (依赖 stores)
  ├── components/  (依赖 hooks, stores)
  └── pages/       (依赖 components)
```

## 添加新功能

### 添加 IPC 功能

1. `ipc/channels.ts` - 定义通道
2. `ipc/types.ts` - 定义类型
3. `ipc/handlers/` - 实现处理器
4. `ipc/index.ts` - 注册处理器
5. `preload/index.ts` - 暴露 API
6. `renderer/services/` - 创建客户端

### 添加页面

1. `renderer/src/pages/NewPage.tsx`
2. 添加路由配置
3. 添加到导航菜单
4. 添加 i18n 翻译

### 添加组件

1. `renderer/src/components/category/ComponentName.tsx`
2. 定义 Props 接口
3. 使用 useCallback 处理事件
4. 使用 useTranslation 支持 i18n
5. 导出组件

## 最佳实践

1. **单一职责**：每个文件只做一件事
2. **依赖注入**：通过参数传递依赖
3. **类型安全**：所有函数都有类型定义
4. **错误处理**：所有异步操作都有 try-catch
5. **资源清理**：useEffect 返回清理函数
