# 系统架构

Super Client R 采用 Electron 多进程架构，结合现代前端技术栈构建。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                     Electron App                         │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Main Process  │    │      Renderer Process       │ │
│  │   (Node.js)     │◄──►│      (React + Chromium)     │ │
│  │                 │IPC │                             │ │
│  │  ┌───────────┐  │    │  ┌─────────────────────┐    │ │
│  │  │ Services  │  │    │  │   React App         │    │ │
│  │  │ - Agent   │  │    │  │  ┌───────────────┐  │    │ │
│  │  │ - MCP     │  │    │  │  │  Pages        │  │    │ │
│  │  │ - Skill   │  │    │  │  │  - Chat       │  │    │ │
│  │  └───────────┘  │    │  │  │  - MCP        │  │    │ │
│  │                 │    │  │  │  - Skills     │  │    │ │
│  │  ┌───────────┐  │    │  │  └───────────────┘  │    │ │
│  │  │ Koa HTTP  │  │    │  │  ┌───────────────┐  │    │ │
│  │  │ Server    │  │    │  │  │  Stores       │  │    │ │
│  │  │ (Port     │  │    │  │  │  (Zustand)    │  │    │ │
│  │  │  3000)    │  │    │  │  └───────────────┘  │    │ │
│  │  └───────────┘  │    │  │                     │    │ │
│  └─────────────────┘    │  └─────────────────────┘    │ │
│                         │                             │ │
│  ┌─────────────────┐    │  ┌─────────────────────┐    │ │
│  │  Preload Script │◄───┼──┤  Context Bridge     │    │ │
│  │  (Security)     │    │  │  (Safe API)         │    │ │
│  └─────────────────┘    │  └─────────────────────┘    │ │
└─────────────────────────────────────────────────────────┘
```

## 主进程 (Main Process)

### 职责

- 应用生命周期管理
- 窗口管理
- 系统级 API 访问
- HTTP 服务器
- 业务服务

### 模块

```
main/
├── main.ts              # 应用入口
├── ipc/                 # IPC 通信层
│   ├── channels.ts     # 通道定义
│   ├── types.ts        # 类型定义
│   ├── index.ts        # 注册入口
│   └── handlers/       # 请求处理器
├── services/           # 业务服务
│   ├── agent/         # Agent 服务
│   ├── mcp/           # MCP 服务
│   ├── skill/         # 技能服务
│   └── index.ts       # 服务导出
├── server/            # HTTP 服务器
│   ├── app.ts        # Koa 应用
│   ├── routes/       # 路由定义
│   └── middlewares/  # 中间件
└── store/             # 数据持久化
    └── StoreManager.ts
```

### 服务架构

每个服务都是 EventEmitter 的子类：

```typescript
class AgentService extends EventEmitter {
  private sessions = new Map<string, Session>();

  async createSession(config: Config): Promise<Session> {
    const session = await this.doCreate(config);
    this.emit('session:created', session);
    return session;
  }
}
```

### HTTP 服务器

基于 Koa 的 RESTful API：

```typescript
const app = new Koa();

// 中间件
app.use(cors());
app.use(bodyParser());
app.use(errorHandler());

// 路由
app.use(chatRoutes.routes());
app.use(mcpRoutes.routes());
app.use(skillRoutes.routes());
```

## 渲染进程 (Renderer Process)

### 技术栈

- **React 19**: UI 框架
- **Ant Design 6**: 组件库
- **Tailwind CSS 4**: 样式系统
- **Zustand**: 状态管理
- **i18next**: 国际化

### 目录结构

```
renderer/src/
├── pages/              # 页面组件
│   ├── Chat.tsx       # 聊天页面
│   ├── MCP.tsx        # MCP 页面
│   ├── Skills.tsx     # 技能页面
│   └── Settings.tsx   # 设置页面
├── components/        # 可复用组件
│   ├── layout/       # 布局组件
│   ├── chat/         # 聊天组件
│   └── common/       # 通用组件
├── hooks/             # 自定义 Hooks
├── stores/            # Zustand Stores
├── services/          # 服务客户端
├── types/             # TypeScript 类型
└── i18n/              # 国际化
```

### 状态管理

使用 Zustand 进行跨组件状态管理：

```typescript
// stores/chatStore.ts
export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isStreaming: false,
      addMessage: (msg) => set((state) => ({
        messages: [...state.messages, msg]
      })),
    }),
    { name: 'chat-storage' }
  )
);
```

## IPC 通信

### 架构

```
Renderer                    Main
   │                         │
   │  ipcRenderer.invoke     │
   │ ──────────────────────► │
   │                         │
   │  ipcMain.handle         │
   │                         │
   │ ◄────────────────────── │
   │    {success, data}      │
   │                         │
   │  ipcRenderer.on         │
   │ ◄────────────────────── │
   │    push event           │
```

### 通道定义

```typescript
// channels.ts
export const IPC_CHANNELS = {
  CHAT: {
    SEND_MESSAGE: 'chat:send-message',
    STREAM_MESSAGE: 'chat:stream-message',
  },
  MCP: {
    CONNECT_SERVER: 'mcp:connect-server',
    CALL_TOOL: 'mcp:call-tool',
  },
} as const;
```

### 类型安全

```typescript
// types.ts
export interface IPCRequest<T> {
  payload: T;
  timestamp: number;
}

export interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## 安全架构

### 预加载脚本

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  chat: {
    sendMessage: (request) =>
      ipcRenderer.invoke('chat:send-message', request),
    onStreamChunk: (callback) =>
      ipcRenderer.on('chat:stream-chunk', callback),
  },
});
```

### 安全原则

1. **最小权限**: 只暴露必要的 API
2. **输入验证**: 所有输入都经过验证
3. **上下文隔离**: 使用 contextIsolation
4. **安全策略**: 配置 CSP

## 数据流

### 聊天流程

```
User Input
    │
    ▼
┌─────────────┐
│  ChatInput  │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  useChat    │────►│  IPC Call   │
│   Hook      │     │             │
└─────────────┘     └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Agent     │
                    │  Service    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐   ┌────────┐   ┌────────┐
         │ Claude │   │  MCP   │   │ Skill  │
         │  API   │   │ Server │   │ Tool   │
         └────────┘   └────────┘   └────────┘
```

### 状态同步

```
Main Process (Source of Truth)
    │
    │  BrowserWindow.webContents.send()
    ▼
Renderer Process
    │
    │  window.electronAPI.onEvent()
    ▼
Zustand Store
    │
    ▼
React Components
```

## 扩展架构

### 技能系统

```
Skill Package
    │
    ├── manifest.json      # 元数据
    ├── index.ts          # 入口
    ├── prompts/          # 提示词
    ├── tools/            # 工具函数
    └── config/           # 配置
```

### MCP 协议

```
Super Client R ◄──MCP──► MCP Server
                    │
                    ├── Stdio
                    ├── SSE
                    └── HTTP
```

## 性能优化

### 渲染优化

- 使用 `React.memo` 避免不必要渲染
- 使用 `useMemo` 缓存计算结果
- 使用 `useCallback` 缓存回调函数
- 虚拟列表处理大量数据

### 主进程优化

- 服务懒加载
- 缓存频繁访问数据
- 使用 Worker 处理耗时任务

### 通信优化

- 批量发送消息
- 使用二进制数据
- 避免频繁同步调用

## 部署架构

### 开发环境

```
Vite Dev Server (5173)
    │
Electron Main
    │
Renderer (HMR)
```

### 生产环境

```
Electron App
    │
├── Main Process
│   ├── Services
│   └── HTTP Server
│
└── Renderer Process
    └── Static Files
```

## 监控与日志

### 日志系统

```typescript
// utils/logger.ts
export const logger = {
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] ${msg}`, ...args);
    }
  },
  info: (msg: string, ...args: unknown[]) => {
    console.log(`[INFO] ${msg}`, ...args);
  },
  error: (msg: string, error: Error) => {
    console.error(`[ERROR] ${msg}`, error);
    // 上报到监控服务
  },
};
```

### 性能监控

- 主进程内存使用
- 渲染进程 FPS
- IPC 调用延迟
- HTTP API 响应时间
