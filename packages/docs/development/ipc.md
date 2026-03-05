# IPC 通信

Super Client R 使用 Electron 的 IPC（进程间通信）机制实现主进程和渲染进程的通信。

## 架构概述

```
┌─────────────────┐         ┌─────────────────┐
│  Renderer       │         │  Main           │
│  Process        │◄───────►│  Process        │
│                 │   IPC   │                 │
│  ┌───────────┐  │         │  ┌───────────┐  │
│  │  Service  │  │ invoke  │  │  Handler  │  │
│  │  Client   │──┼────────►│  │           │  │
│  └───────────┘  │         │  └───────────┘  │
│                 │         │                 │
│  ┌───────────┐  │  event  │  ┌───────────┐  │
│  │  Listener │◄─┼─────────│  │  Emitter  │  │
│  └───────────┘  │         │  └───────────┘  │
└─────────────────┘         └─────────────────┘
```

## IPC 模式

### 1. 请求-响应模式

渲染进程发送请求，主进程处理后返回结果：

```typescript
// Renderer
const result = await window.electronAPI.chat.sendMessage({
  content: 'Hello'
});

// Main
ipcMain.handle('chat:send-message', async (event, request) => {
  const result = await processMessage(request);
  return { success: true, data: result };
});
```

### 2. 事件推送模式

主进程主动向渲染进程推送事件：

```typescript
// Main
BrowserWindow.getAllWindows().forEach(win => {
  win.webContents.send('chat:stream-chunk', {
    sessionId,
    content: chunk
  });
});

// Renderer
window.electronAPI.chat.onStreamChunk((data) => {
  console.log(data.content);
});
```

## 添加 IPC 功能

按照以下 6 个步骤添加新的 IPC 功能：

### 步骤 1: 定义通道

```typescript
// src/main/ipc/channels.ts
export const FEATURE_CHANNELS = {
  ACTION: 'feature:action',
  EVENT: 'feature:event'
} as const;
```

### 步骤 2: 定义类型

```typescript
// src/main/ipc/types.ts
export interface FeatureRequest {
  data: string;
}

export interface FeatureResponse {
  result: string;
}
```

### 步骤 3: 实现处理器

```typescript
// src/main/ipc/handlers/featureHandler.ts
export function registerFeatureHandlers() {
  ipcMain.handle(
    FEATURE_CHANNELS.ACTION,
    async (event, request: IPCRequest<FeatureRequest>) => {
      try {
        const result = await processAction(request.payload);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );
}
```

### 步骤 4: 注册处理器

```typescript
// src/main/ipc/index.ts
import { registerFeatureHandlers } from './handlers/featureHandler';

export function registerIpcHandlers() {
  registerFeatureHandlers();
  // ... other handlers
}
```

### 步骤 5: 暴露 API

```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  feature: {
    action: (request: FeatureRequest) =>
      ipcRenderer.invoke(FEATURE_CHANNELS.ACTION, request),
    onEvent: (callback: (data: FeatureEvent) => void) => {
      const handler = (_: unknown, data: FeatureEvent) => callback(data);
      ipcRenderer.on(FEATURE_CHANNELS.EVENT, handler);
      return () => ipcRenderer.off(FEATURE_CHANNELS.EVENT, handler);
    }
  }
});
```

### 步骤 6: 创建客户端

```typescript
// src/renderer/src/services/featureService.ts
export const featureService = {
  action: (data: string) =>
    window.electronAPI.feature.action({ data }),

  onEvent: (callback: (data: FeatureEvent) => void) =>
    window.electronAPI.feature.onEvent(callback)
};
```

## 类型定义

### 请求类型

```typescript
interface IPCRequest<T> {
  payload: T;
  timestamp: number;
}
```

### 响应类型

```typescript
interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### 错误处理

```typescript
// 统一错误处理
try {
  const result = await window.electronAPI.feature.action(request);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
} catch (error) {
  message.error(`Operation failed: ${error.message}`);
  throw error;
}
```

## 最佳实践

### 1. 通道命名

使用 `模块:动作` 格式：

```typescript
// ✅ 推荐
'chat:send-message'
'mcp:connect-server'
'skill:execute-tool'

// ❌ 避免
'sendMessage'
'connectServer'
```

### 2. 返回值格式

始终返回 `{ success, data?, error? }`：

```typescript
// ✅ 推荐
return { success: true, data: result };
return { success: false, error: 'Invalid input' };

// ❌ 避免
return result;
throw new Error('error');
```

### 3. 事件清理

始终返回清理函数：

```typescript
// ✅ 推荐
const unsubscribe = window.electronAPI.onEvent((data) => {
  setState(data);
});

// 组件卸载时清理
useEffect(() => {
  return () => unsubscribe();
}, []);
```

### 4. 输入验证

验证所有输入参数：

```typescript
ipcMain.handle('file:read', async (event, request) => {
  const { path } = request.payload;

  // 验证路径
  if (path.includes('..') || path.startsWith('/etc')) {
    return { success: false, error: 'Invalid path' };
  }

  // 确保路径在允许目录内
  const fullPath = path.join(userDataPath, path);
  if (!fullPath.startsWith(userDataPath)) {
    return { success: false, error: 'Path outside allowed directory' };
  }

  // 执行操作
  const content = await fs.readFile(fullPath);
  return { success: true, data: content };
});
```

## 性能优化

### 批量处理

```typescript
// ✅ 推荐 - 批量发送
const chunks = [];
for await (const chunk of stream) {
  chunks.push(chunk);
  if (chunks.length >= 10) {
    window.webContents.send('batch', chunks);
    chunks.length = 0;
  }
}

// ❌ 避免 - 逐条发送
for await (const chunk of stream) {
  window.webContents.send('chunk', chunk);
}
```

### 防抖处理

```typescript
import { debounce } from 'lodash-es';

const debouncedUpdate = debounce((data) => {
  window.webContents.send('update', data);
}, 100);
```

## 调试

### 日志记录

```typescript
// 启用 IPC 日志
ipcMain.on('log', (event, ...args) => {
  console.log('[Renderer]', ...args);
});
```

### 性能监控

```typescript
const start = performance.now();
const result = await ipcRenderer.invoke('channel', data);
console.log(`IPC call took ${performance.now() - start}ms`);
```
