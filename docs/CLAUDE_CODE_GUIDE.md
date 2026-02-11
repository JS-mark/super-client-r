# Claude Code 开发指南

本文档为使用 Claude Code (claude.ai/code) 开发 Super Client R 项目的最佳实践指南。

---

## 1. 项目认知

### 1.1 项目类型识别

**项目性质**: Electron + React + TypeScript 桌面应用
**核心功能**: AI 客户端（Claude SDK + MCP + Skill 系统）
**架构模式**: 主进程-渲染进程分离架构

**关键文件位置**:

- 主进程入口: `src/main/main.ts`
- 渲染进程入口: `src/renderer/src/main.tsx`
- IPC 定义: `src/main/ipc/channels.ts`, `src/main/ipc/types.ts`
- 预加载脚本: `src/preload/index.ts`

### 1.2 开发约束

```
进程边界（不可跨越）:
┌─────────────────┐         ┌─────────────────┐
│   Main Process  │ ◄────► │ Renderer Process│
│   (Node.js)     │   IPC   │   (Chromium)    │
└─────────────────┘         └─────────────────┘
     ↓                            ↓
 可以访问 Node API            不能访问 Node API
 可以访问系统资源             通过 Preload 暴露的 API 通信
```

**AI 开发时必须注意**:

- 不能在渲染进程直接使用 Node.js API（如 `fs`, `path`）
- 跨进程通信必须通过 IPC 通道
- 所有 IPC 调用必须是异步的

---

## 2. 代码生成最佳实践

### 2.1 IPC 通信代码生成

**场景**: 添加新的主进程-渲染进程通信功能

**步骤**（按顺序执行）:

```typescript
// Step 1: 定义通道（channels.ts）
export const NEW_CHANNELS = {
  ACTION: 'module:action',
} as const;

// Step 2: 定义类型（types.ts）
export interface NewRequest {
  data: string;
}

export interface NewResponse {
  result: string;
}

// Step 3: 实现处理器（handlers/newHandler.ts）
export function registerNewHandlers() {
  ipcMain.handle(NEW_CHANNELS.ACTION, async (event, request: IPCRequest<NewRequest>) => {
    try {
      const result = await processAction(request.payload);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// Step 4: 注册处理器（index.ts）
import { registerNewHandlers } from './handlers/newHandler';
export function registerIpcHandlers() {
  registerNewHandlers(); // 添加到注册列表
}

// Step 5: 暴露 API（preload/index.ts）
contextBridge.exposeInMainWorld('electronAPI', {
  newAction: (request: NewRequest) =>
    ipcRenderer.invoke(NEW_CHANNELS.ACTION, request),
});

// Step 6: 客户端封装（services/newService.ts）
export const newService = {
  action: (data: string) => window.electronAPI.newAction({ data }),
};
```

**验证清单**:

- [ ] 通道名称使用 `kebab-case` 格式（`module:action`）
- [ ] 请求/响应类型定义完整
- [ ] 处理器返回 `{ success, data?, error? }` 格式
- [ ] 预加载脚本正确暴露 API
- [ ] 客户端封装提供类型安全的调用

### 2.2 Store 代码生成

**场景**: 添加新的状态管理模块

**模板**:

```typescript
// stores/featureStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FeatureState {
  items: string[];
  isLoading: boolean;
  addItem: (item: string) => void;
  removeItem: (id: string) => void;
  fetchItems: () => Promise<void>;
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      addItem: (item) => set((state) => ({
        items: [...state.items, item]
      })),
      removeItem: (id) => set((state) => ({
        items: state.items.filter((item) => item.id !== id)
      })),
      fetchItems: async () => {
        set({ isLoading: true });
        try {
          const items = await api.fetchItems();
          set({ items, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
    }),
    {
      name: 'feature-storage',
      partialize: (state) => ({ items: state.items }), // 只持久化 items
    }
  )
);
```

**关键决策点**:

- 是否需要持久化？→ 使用 `persist` 中间件
- 哪些状态需要持久化？→ 使用 `partialize` 选择
- 是否需要异步操作？→ 在 store 中直接定义 async 方法

### 2.3 组件代码生成

**场景**: 添加新的 React 组件

**函数组件模板**:

```typescript
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { useFeatureStore } from '@/stores/featureStore';
import type { FeatureItem } from '@/types';

interface FeatureComponentProps {
  items: FeatureItem[];
  onSelect: (item: FeatureItem) => void;
  loading?: boolean;
}

export function FeatureComponent({
  items,
  onSelect,
  loading = false
}: FeatureComponentProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = useCallback((item: FeatureItem) => {
    setSelectedId(item.id);
    onSelect(item);
  }, [onSelect]);

  return (
    <div className="p-4">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'p-2 rounded cursor-pointer',
            selectedId === item.id && 'bg-blue-100'
          )}
          onClick={() => handleSelect(item)}
        >
          {item.name}
        </div>
      ))}
    </div>
  );
}
```

**AI 生成组件时必须**:

1. 定义 Props 接口
2. 使用 `useCallback` 缓存事件处理器
3. 使用 `useTranslation` 支持国际化
4. 使用 Tailwind CSS 工具类
5. 使用 `cn()` 合并类名

### 2.4 Service 代码生成

**场景**: 添加新的业务服务（Main Process）

**模板**:

```typescript
// services/feature/FeatureService.ts
import { EventEmitter } from 'events';
import type { FeatureConfig, FeatureResult } from '@/ipc/types';

interface FeatureServiceEvents {
  started: (id: string) => void;
  completed: (id: string, result: FeatureResult) => void;
  error: (id: string, error: Error) => void;
}

export declare interface FeatureService {
  on<U extends keyof FeatureServiceEvents>(
    event: U,
    listener: FeatureServiceEvents[U]
  ): this;
  emit<U extends keyof FeatureServiceEvents>(
    event: U,
    ...args: Parameters<FeatureServiceEvents[U]>
  ): boolean;
}

export class FeatureService extends EventEmitter {
  private features = new Map<string, FeatureConfig>();

  async initialize(config: FeatureConfig): Promise<void> {
    this.features.set(config.id, config);
    this.emit('started', config.id);

    try {
      const result = await this.processFeature(config);
      this.emit('completed', config.id, result);
    } catch (error) {
      this.emit('error', config.id, error);
      throw error;
    }
  }

  private async processFeature(config: FeatureConfig): Promise<FeatureResult> {
    // 实现业务逻辑
  }
}

// 单例导出
export const featureService = new FeatureService();
```

---

## 3. 常见模式与反模式

### 3.1 正确模式

#### 模式 1: 跨进程状态同步

```typescript
// Main Process: 服务层维护状态，通过 IPC 通知 Renderer
class AgentService extends EventEmitter {
  private sessions = new Map<string, Session>();

  async createSession(config: Config) {
    const session = await this.doCreate(config);
    this.sessions.set(session.id, session);

    // 广播给所有窗口
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent:session-created', session);
    });

    return session;
  }
}

// Renderer Process: 监听事件更新 Store
useEffect(() => {
  const unsubscribe = window.electronAPI.agent.onSessionCreated((session) => {
    useAgentStore.getState().addSession(session);
  });
  return unsubscribe;
}, []);
```

#### 模式 2: 流式数据处理

```typescript
// Main Process: 逐块发送数据
async function streamResponse(sessionId: string, prompt: string) {
  const stream = await anthropic.messages.create({
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('agent:stream-chunk', {
          sessionId,
          content: chunk.delta.text,
        });
      });
    }
  }
}

// Renderer Process: 累积更新
const [content, setContent] = useState('');

useEffect(() => {
  return window.electronAPI.agent.onStreamChunk(({ content: chunk }) => {
    setContent((prev) => prev + chunk);
  });
}, []);
```

#### 模式 3: 错误边界处理

```typescript
// 组件级错误边界
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('React Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

// IPC 错误处理
ipcMain.handle('channel', async () => {
  try {
    const result = await operation();
    return { success: true, data: result };
  } catch (error) {
    logger.error('IPC handler error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    };
  }
});
```

### 3.2 反模式（避免）

#### 反模式 1: 在渲染进程直接使用 Node API

```typescript
// ❌ 错误：渲染进程中直接使用 fs
import { readFile } from 'fs'; // 这会在渲染进程报错！

// ✅ 正确：通过 IPC 调用主进程
const content = await window.electronAPI.file.read(path);
```

#### 反模式 2: 同步 IPC 调用

```typescript
// ❌ 错误：Electron 已移除同步 IPC
const result = ipcRenderer.sendSync('channel', data);

// ✅ 正确：使用异步 IPC
const result = await ipcRenderer.invoke('channel', data);
```

#### 反模式 3: 状态管理不一致

```typescript
// ❌ 错误：多处维护相同状态
// Main Process 维护一份 sessions
// Renderer Process 又维护一份 sessions
// 容易不一致

// ✅ 正确：Main Process 为数据源，Renderer 通过 IPC 同步
// Main: 唯一状态源
// Renderer: Store 通过 IPC 事件更新，保持同步
```

#### 反模式 4: 内存泄漏

```typescript
// ❌ 错误：未清理事件监听
useEffect(() => {
  window.electronAPI.onEvent((data) => {
    setState(data);
  });
}, []); // 组件卸载时未移除监听！

// ✅ 正确：返回清理函数
useEffect(() => {
  const unsubscribe = window.electronAPI.onEvent((data) => {
    setState(data);
  });
  return unsubscribe; // 组件卸载时自动清理
}, []);
```

---

## 4. 调试与诊断

### 4.1 常见问题诊断

#### 问题 1: IPC 调用无响应

```
症状：调用 window.electronAPI.xxx() 后没有任何反应

排查步骤：
1. 检查 channels.ts 中是否定义了通道
2. 检查 handlers/xxx.ts 是否实现了处理器
3. 检查 index.ts 是否注册了处理器
4. 检查 preload/index.ts 是否暴露了 API
5. 检查主进程控制台是否有错误
6. 使用 console.log 在 handler 中验证是否被调用
```

#### 问题 2: 类型错误

```
症状：TypeScript 报错 "Property does not exist on type"

排查步骤：
1. 检查类型定义是否导入正确
2. 检查 tsconfig.json paths 配置
3. 检查是否使用了正确的类型（Main/Renderer 类型不通用）
4. 运行 pnpm check 查看详细错误
```

#### 问题 3: 构建失败

```
症状：pnpm build 报错

排查步骤：
1. 检查是否存在循环依赖
2. 检查是否使用了平台特定 API 但未做判断
3. 检查 vite.config.ts 配置
4. 清除 out/ 目录后重试
5. 检查 Node 版本是否符合要求（>=22）
```

### 4.2 日志调试

```typescript
// Main Process: 使用结构化日志
import { logger } from '@/utils/logger';

logger.info('Operation started', { sessionId, model });
logger.debug('Request payload', payload);
logger.error('Operation failed', error, { context: 'additional info' });

// Renderer Process: 使用 console，在 DevTools 查看
console.log('[Feature]', 'Debug message', data);
console.group('Feature Flow');
console.log('Step 1:', data1);
console.log('Step 2:', data2);
console.groupEnd();
```

### 4.3 性能分析

```typescript
// 测量函数执行时间
function measurePerformance<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    const duration = performance.now() - start;
    console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
  }
}

// React 渲染性能
import { Profiler } from 'react';

<Profiler
  id="ChatComponent"
  onRender={(id, phase, actualDuration) => {
    console.log(`[Profiler] ${id} ${phase}: ${actualDuration}ms`);
  }}
>
  <ChatComponent />
</Profiler>
```

---

## 5. 安全开发准则

### 5.1 IPC 安全

```typescript
// ✅ 正确：验证所有输入
ipcMain.handle('file:read', async (event, request) => {
  const { path } = request.payload;

  // 验证路径不在敏感目录
  if (path.includes('..') || path.startsWith('/etc')) {
    return { success: false, error: 'Invalid path' };
  }

  // 验证路径在用户数据目录下
  const fullPath = path.join(userDataPath, path);
  if (!fullPath.startsWith(userDataPath)) {
    return { success: false, error: 'Path outside allowed directory' };
  }

  // 执行操作
  const content = await fs.readFile(fullPath);
  return { success: true, data: content };
});

// ❌ 错误：直接执行用户输入
ipcMain.handle('file:read', async (event, { path }) => {
  return fs.readFile(path); // 危险！路径遍历攻击
});
```

### 5.2 预加载脚本安全

```typescript
// ✅ 正确：暴露最小化 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 只暴露必要的方法
  file: {
    read: (path: string) => ipcRenderer.invoke('file:read', { path }),
    write: (path: string, content: string) =>
      ipcRenderer.invoke('file:write', { path, content }),
  },
});

// ❌ 错误：暴露原始 ipcRenderer
contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer);
// 这会让渲染进程可以发送任意 IPC 消息！
```

---

## 6. AI 辅助开发检查清单

使用 Claude Code 生成代码后，对照以下清单验证：

### IPC 相关

- [ ] 通道名称使用 `module:action` 格式
- [ ] 请求/响应类型定义在 `types.ts`
- [ ] Handler 返回 `{ success, data?, error? }` 格式
- [ ] 所有 async 操作有 try-catch
- [ ] Preload 脚本正确暴露 API

### Store 相关

- [ ] 使用 `persist` 时指定 `partialize` 避免持久化过多数据
- [ ] 异步方法正确处理 loading 状态
- [ ] 导出 hook 使用 selector 避免重渲染

### 组件相关

- [ ] Props 接口定义完整
- [ ] 使用 `useCallback` 缓存事件处理器
- [ ] 使用 `useTranslation` 支持 i18n
- [ ] 复杂逻辑抽取到自定义 hook

### 安全相关

- [ ] 不暴露 `ipcRenderer` 对象
- [ ] 验证所有用户输入
- [ ] 文件操作限制在用户数据目录
- [ ] 敏感信息不存储在代码中

### 性能相关

- [ ] 事件监听有清理函数
- [ ] 大数据使用虚拟化
- [ ] 避免不必要的重渲染

---

## 7. 快速参考

### 常用命令

```bash
# 开发
pnpm dev                  # 启动开发服务器

# 检查
pnpm check               # TypeScript 类型检查
pnpm lint                # 代码检查

# 调试
pnpm dev                 # 然后在 DevTools 中调试
```

### 文件模板位置

```
组件: src/renderer/src/components/
页面: src/renderer/src/pages/
Store: src/renderer/src/stores/
Hook: src/renderer/src/hooks/
IPC Handler: src/main/ipc/handlers/
Service: src/main/services/
类型: src/renderer/src/types/ 或 src/main/ipc/types.ts
```

### 命名规范速查

| 类型         | 规范       | 示例                   |
|--------------|------------|------------------------|
| 组件         | PascalCase | `ChatInput.tsx`        |
| Hooks        | camelCase  | `useChat.ts`           |
| IPC Channels | kebab-case | `agent:create-session` |
| Store        | camelCase  | `useChatStore.ts`      |
| Services     | PascalCase | `AgentService.ts`      |

---

## 8. 故障排除速查

| 问题         | 可能原因          | 解决方案                      |
|--------------|-------------------|-------------------------------|
| IPC 无响应   | Handler 未注册    | 检查 index.ts 是否导入        |
| 类型错误     | 路径别名错误      | 检查 tsconfig paths           |
| 样式不生效   | Tailwind 未扫描   | 检查文件路径包含在 content 中 |
| 构建失败     | 循环依赖          | 检查导入关系                  |
| 热重载失效   | 缓存问题          | 删除 out/ 重试                |
| Preload 报错 | Context Isolation | 使用 contextBridge            |

---

*本文档与 CLAUDE.md 配合使用，为 AI 辅助开发提供具体指导。*
