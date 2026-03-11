# 架构设计详解

## 进程架构

### Main Process（主进程）
- **环境**: Node.js 完整环境
- **职责**:
  - 窗口管理
  - 系统资源访问
  - 业务逻辑处理
  - 数据持久化
- **模式**: EventEmitter-based services

### Renderer Process（渲染进程）
- **环境**: Chromium 浏览器环境
- **职责**:
  - UI 渲染
  - 用户交互
  - 状态展示
- **限制**: 不能直接访问 Node API

### Preload Script（预加载脚本）
- **环境**: 特权环境（同时访问 Node 和 DOM）
- **职责**: 安全桥接 Main 和 Renderer
- **原则**: 最小暴露原则

## 数据流模式

### 单向数据流
```
User Action → Renderer → IPC → Main Process
                                    ↓
                              Process Data
                                    ↓
                         Broadcast via webContents
                                    ↓
                    All Renderer Windows Update
```

### 流式数据处理
```
Main: Stream API → Chunk by Chunk → webContents.send()
Renderer: Accumulate chunks → Update UI progressively
```

## 服务层设计

### EventEmitter 模式
所有 Main Process 服务继承 EventEmitter：

```typescript
class AgentService extends EventEmitter {
  async createSession(config) {
    const session = await this.doCreate(config);
    this.emit('session-created', session);
    return session;
  }
}
```

### 事件广播
```typescript
// Main Process
this.emit('event-name', data);
BrowserWindow.getAllWindows().forEach(win => {
  win.webContents.send('ipc-channel', data);
});

// Renderer Process
window.electronAPI.onEvent((data) => {
  store.update(data);
});
```

## 安全模型

### Context Isolation
- 启用 `contextIsolation: true`
- 禁用 `nodeIntegration: false`
- 使用 `contextBridge` 暴露 API

### IPC 安全
- 输入验证：所有 IPC 参数必须验证
- 路径检查：文件路径必须在允许范围内
- 最小权限：只暴露必需的功能

### 示例：安全的文件读取
```typescript
ipcMain.handle('file:read', async (event, { path }) => {
  // 1. 验证路径格式
  if (path.includes('..')) {
    return { success: false, error: 'Invalid path' };
  }

  // 2. 确保在允许目录内
  const fullPath = join(userDataPath, path);
  if (!fullPath.startsWith(userDataPath)) {
    return { success: false, error: 'Access denied' };
  }

  // 3. 读取文件
  const content = await fs.readFile(fullPath);
  return { success: true, data: content };
});
```

## 状态管理

### Zustand Store 模式
```typescript
// 1. 定义接口
interface Store {
  data: Data[];
  actions: {
    add: (item: Data) => void;
    remove: (id: string) => void;
  };
}

// 2. 创建 store
const useStore = create<Store>((set) => ({
  data: [],
  actions: {
    add: (item) => set((state) => ({
      data: [...state.data, item]
    })),
    remove: (id) => set((state) => ({
      data: state.data.filter(d => d.id !== id)
    })),
  },
}));

// 3. 使用选择器避免重渲染
const data = useStore(state => state.data);
const add = useStore(state => state.actions.add);
```

### 持久化
```typescript
persist(
  (set, get) => ({ /* store */ }),
  {
    name: 'storage-key',
    partialize: (state) => ({
      // 只持久化需要的字段
      data: state.data
    }),
  }
)
```

## HTTP Server 架构

### Koa 服务器
- 端口: 动态分配（避免冲突）
- 中间件: CORS, body parser, error handler
- 路由: 模块化注册

### 用途
- 本地 API 服务
- Webhook 接收
- 第三方集成回调

## MCP 集成

### 服务器管理
- 动态启动/停止 MCP 服务器
- stdio 通信
- 工具发现和调用

### 生命周期
```
Start → Connect → Discover Tools → Ready
                                    ↓
                              Use Tools
                                    ↓
                    Disconnect → Cleanup
```

## 技能系统

### 技能结构
```
skills/
├── skill-name/
│   ├── manifest.json    # 元数据
│   ├── prompt.md        # 提示词
│   └── tools/           # 可选工具
```

### 执行流程
```
User invokes skill → Load manifest → Inject prompt
                                          ↓
                                    Execute with AI
                                          ↓
                                    Return result
```
