# 调试指南

## 常见问题排查

### IPC 通信问题

#### 问题：IPC 调用没有响应
**排查步骤**：
1. 检查 channel 是否在 `channels.ts` 中定义
2. 检查 handler 是否在 `handlers/` 中实现
3. 检查 handler 是否在 `ipc/index.ts` 中注册
4. 检查 API 是否在 `preload/index.ts` 中暴露
5. 查看 Main Process 控制台是否有错误

**调试方法**：
```typescript
// 在 handler 中添加日志
ipcMain.handle('channel', async (event, request) => {
  console.log('[IPC] Received:', request);
  try {
    const result = await process(request);
    console.log('[IPC] Success:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error('[IPC] Error:', error);
    return { success: false, error: error.message };
  }
});

// 在 renderer 中添加日志
const response = await window.electronAPI.someAction(data);
console.log('[Renderer] Response:', response);
```

#### 问题：类型错误 - electronAPI 不存在
**原因**：TypeScript 类型定义未更新

**解决方法**：
```typescript
// 更新 src/renderer/src/types/electron.d.ts
interface ElectronAPI {
  newFeature: {
    action: (data: Data) => Promise<Response>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### 构建问题

#### 问题：构建失败 - 循环依赖
**排查**：
```bash
# 使用 madge 检测循环依赖
npx madge --circular src/
```

**解决方法**：
- 提取共享类型到单独文件
- 使用依赖注入打破循环
- 重新组织模块结构

#### 问题：HMR 不工作
**解决方法**：
```bash
# 清理构建缓存
rm -rf out/
rm -rf node_modules/.vite/

# 重新启动
pnpm dev
```

### 类型检查问题

#### 问题：tsconfig paths 不工作
**检查**：
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/renderer/src/*"],
      "@main/*": ["./src/main/*"]
    }
  }
}

// electron.vite.config.ts
export default defineConfig({
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@main': resolve('src/main')
      }
    }
  }
})
```

#### 问题：类型错误但代码正常运行
**原因**：类型定义过时

**解决方法**：
```bash
# 重新生成类型
pnpm check

# 重启 TypeScript 服务器（VSCode）
Cmd+Shift+P → "TypeScript: Restart TS Server"
```

### 运行时问题

#### 问题：Cannot find module
**原因**：
1. 路径别名配置错误
2. 依赖未安装
3. 打包配置问题

**解决方法**：
```bash
# 检查依赖
pnpm install

# 检查别名配置
# tsconfig.json + electron.vite.config.ts

# 清理重建
rm -rf out/
pnpm build
```

#### 问题：Main Process 崩溃
**调试方法**：
```typescript
// 添加全局错误处理
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // 可选：写入日志文件
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
```

#### 问题：Renderer Process 白屏
**排查步骤**：
1. 打开 DevTools 查看控制台错误
2. 检查 React 组件是否有错误
3. 检查路由配置
4. 检查是否有未捕获的异常

**调试方法**：
```typescript
// 添加 Error Boundary
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error('React Error:', error, errorInfo);
  }

  render() {
    return this.props.children;
  }
}
```

### 状态管理问题

#### 问题：Zustand store 不更新
**原因**：
1. 没有使用选择器
2. 状态更新不是 immutable
3. 组件没有订阅正确的状态

**解决方法**：
```typescript
// ✅ 正确：使用选择器
const items = useStore(state => state.items);

// ❌ 错误：直接修改状态
set((state) => {
  state.items.push(newItem); // 不会触发更新
  return state;
});

// ✅ 正确：immutable 更新
set((state) => ({
  items: [...state.items, newItem]
}));
```

#### 问题：状态在多窗口间不同步
**原因**：Renderer 状态没有监听 Main Process 事件

**解决方法**：
```typescript
// Renderer: 监听 Main Process 广播
useEffect(() => {
  const unsubscribe = window.electronAPI.onStateChanged((newState) => {
    useStore.setState(newState);
  });
  return unsubscribe;
}, []);
```

### 性能问题

#### 问题：组件频繁重渲染
**诊断**：
```typescript
// 使用 React DevTools Profiler
// 或添加日志
function Component(props) {
  console.log('Component rendered', props);
  // ...
}
```

**解决方法**：
```typescript
// 1. 使用 memo
const MemoizedComponent = memo(Component);

// 2. 使用 useCallback
const handleClick = useCallback(() => {
  doSomething();
}, [dependencies]);

// 3. 使用 Zustand 选择器
const specificData = useStore(state => state.specificData);
```

#### 问题：IPC 调用慢
**优化方法**：
```typescript
// 1. 批量处理
const results = await window.electronAPI.batchProcess(items);

// 2. 使用流式传输
window.electronAPI.onStreamChunk((chunk) => {
  processChunk(chunk);
});

// 3. 缓存结果
const cache = new Map();
async function getCached(key) {
  if (cache.has(key)) return cache.get(key);
  const result = await fetch(key);
  cache.set(key, result);
  return result;
}
```

### 样式问题

#### 问题：Tailwind 类不生效
**检查**：
```javascript
// tailwind.config.js
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  // ...
}
```

#### 问题：样式在生产环境不同
**原因**：开发环境和生产环境的 CSS 处理不同

**解决方法**：
```bash
# 测试生产构建
pnpm build
# 运行生产版本测试
```

## 调试工具

### Chrome DevTools
```typescript
// Main Process 调试
app.whenReady().then(() => {
  // 启用 DevTools
  mainWindow.webContents.openDevTools();
});

// Renderer Process 调试
// 自动打开 DevTools（开发环境）
```

### VSCode 调试配置
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron-vite",
      "args": ["--sourcemap"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"]
    }
  ]
}
```

### 日志系统
```typescript
// 使用 electron-log
import log from 'electron-log';

log.info('Application started');
log.error('Error occurred:', error);

// 日志文件位置
// macOS: ~/Library/Logs/super-client-r/
// Windows: %USERPROFILE%\AppData\Roaming\super-client-r\logs\
// Linux: ~/.config/super-client-r/logs/
```

## 常用调试命令

```bash
# 类型检查
pnpm check

# 查看详细错误
pnpm check --pretty

# 代码检查
pnpm lint

# 清理缓存
rm -rf out/ node_modules/.vite/

# 重新安装依赖
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 查看进程
ps aux | grep electron

# 查看端口占用
lsof -i :3000
```

## 错误代码速查

| 错误 | 原因 | 解决方法 |
|------|------|----------|
| `Cannot find module '@/...'` | 路径别名未配置 | 检查 tsconfig.json 和 vite.config |
| `ipcRenderer is not defined` | 在 renderer 直接使用 | 使用 preload 暴露的 API |
| `contextBridge is not defined` | contextIsolation 未启用 | 检查 BrowserWindow 配置 |
| `Module not found` | 依赖未安装 | `pnpm install` |
| `Type error: Property does not exist` | 类型定义缺失 | 更新 .d.ts 文件 |
| `Circular dependency` | 循环引用 | 重构模块结构 |

## 性能分析

### React Profiler
```typescript
import { Profiler } from 'react';

<Profiler id="Component" onRender={(id, phase, actualDuration) => {
  console.log(`${id} (${phase}) took ${actualDuration}ms`);
}}>
  <Component />
</Profiler>
```

### Electron Performance
```typescript
// 测量启动时间
const startTime = Date.now();
app.on('ready', () => {
  console.log(`App ready in ${Date.now() - startTime}ms`);
});

// 测量窗口加载时间
mainWindow.webContents.on('did-finish-load', () => {
  console.log(`Window loaded in ${Date.now() - startTime}ms`);
});
```

## 生产环境调试

### 启用远程调试
```typescript
// 生产环境保留 DevTools（谨慎使用）
if (process.env.DEBUG === 'true') {
  mainWindow.webContents.openDevTools();
}
```

### 错误报告
```typescript
// 收集错误信息
process.on('uncaughtException', (error) => {
  // 发送到错误追踪服务
  reportError({
    type: 'uncaughtException',
    error: error.message,
    stack: error.stack,
    version: app.getVersion(),
    platform: process.platform,
  });
});
```
