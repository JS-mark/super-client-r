# 代码规范详解

## TypeScript 规范

### 类型定义
```typescript
// ✅ 好：显式类型
function processData(input: string): Promise<Result> {
  return api.process(input);
}

// ❌ 差：隐式 any
function processData(input) {
  return api.process(input);
}
```

### 避免 any
```typescript
// ✅ 好：使用 unknown + 类型守卫
function handle(data: unknown) {
  if (typeof data === 'string') {
    return data.toUpperCase();
  }
}

// ❌ 差：使用 any
function handle(data: any) {
  return data.toUpperCase();
}
```

### Interface vs Type
```typescript
// ✅ 对象类型用 interface
interface User {
  id: string;
  name: string;
}

// ✅ 联合类型用 type
type Status = 'pending' | 'success' | 'error';

// ✅ 复杂类型用 type
type Result<T> = { success: true; data: T } | { success: false; error: string };
```

## React 规范

### 组件定义
```typescript
// ✅ 好：函数组件 + Props 接口
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

// ❌ 差：没有类型定义
export function Button({ label, onClick, disabled }) {
  // ...
}
```

### useCallback 使用
```typescript
// ✅ 好：传递给子组件的函数用 useCallback
const handleClick = useCallback((id: string) => {
  doSomething(id);
}, [doSomething]);

<ChildComponent onClick={handleClick} />

// ❌ 差：每次渲染创建新函数
<ChildComponent onClick={(id) => doSomething(id)} />
```

### 事件监听清理
```typescript
// ✅ 好：返回清理函数
useEffect(() => {
  const unsubscribe = window.electronAPI.onEvent((data) => {
    setState(data);
  });
  return unsubscribe;
}, []);

// ❌ 差：没有清理
useEffect(() => {
  window.electronAPI.onEvent((data) => {
    setState(data);
  });
}, []);
```

### Zustand 选择器
```typescript
// ✅ 好：使用选择器
const items = useStore(state => state.items);
const addItem = useStore(state => state.actions.addItem);

// ❌ 差：订阅整个 store
const store = useStore();
const items = store.items;
```

## IPC 规范

### Channel 命名
```typescript
// ✅ 好：kebab-case，模块:动作
export const AGENT_CHANNELS = {
  CREATE_SESSION: 'agent:create-session',
  DELETE_SESSION: 'agent:delete-session',
  SEND_MESSAGE: 'agent:send-message',
} as const;

// ❌ 差：不一致的命名
export const CHANNELS = {
  createSession: 'CreateSession',
  delete_session: 'agent_delete',
};
```

### Handler 返回格式
```typescript
// ✅ 好：统一的返回格式
ipcMain.handle('channel', async (event, request) => {
  try {
    const result = await process(request);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ❌ 差：不一致的返回
ipcMain.handle('channel', async (event, request) => {
  const result = await process(request);
  return result; // 错误时会抛出异常
});
```

### 类型安全的 IPC
```typescript
// ✅ 好：定义请求和响应类型
interface CreateSessionRequest {
  config: SessionConfig;
}

interface CreateSessionResponse {
  sessionId: string;
  createdAt: number;
}

// Handler
ipcMain.handle('agent:create-session',
  async (event, request: IPCRequest<CreateSessionRequest>) => {
    const result = await createSession(request.payload);
    return { success: true, data: result } as IPCResponse<CreateSessionResponse>;
  }
);

// Client
const response = await window.electronAPI.agent.createSession({ config });
if (response.success) {
  console.log(response.data.sessionId);
}
```

## 样式规范

### Tailwind CSS
```typescript
// ✅ 好：使用 Tailwind 工具类
<div className="flex items-center gap-2 p-4 rounded-lg bg-gray-100">
  <span className="text-sm font-medium">Label</span>
</div>

// ✅ 好：条件类名用 cn()
<div className={cn(
  "p-4 rounded",
  isActive && "bg-blue-100",
  isDisabled && "opacity-50 cursor-not-allowed"
)}>
  Content
</div>

// ❌ 差：内联样式
<div style={{ display: 'flex', padding: '16px' }}>
  Content
</div>
```

### CSS 变量
```typescript
// ✅ 好：使用主题变量
<div className="bg-primary text-primary-foreground">
  Content
</div>

// ❌ 差：硬编码颜色
<div className="bg-blue-500 text-white">
  Content
</div>
```

## 错误处理

### 异步操作
```typescript
// ✅ 好：完整的错误处理
async function fetchData() {
  try {
    const response = await api.fetch();
    return { success: true, data: response };
  } catch (error) {
    console.error('Failed to fetch:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ❌ 差：没有错误处理
async function fetchData() {
  const response = await api.fetch();
  return response;
}
```

### 用户友好的错误消息
```typescript
// ✅ 好：提供上下文
throw new Error(`Failed to load session ${sessionId}: ${error.message}`);

// ❌ 差：泛泛的错误
throw new Error('Error occurred');
```

## 国际化

### 使用 i18n
```typescript
// ✅ 好：使用翻译键
const { t } = useTranslation();
<button>{t('common.save')}</button>

// ❌ 差：硬编码文本
<button>Save</button>
```

### 翻译键命名
```typescript
// ✅ 好：层级结构
{
  "agent": {
    "session": {
      "create": "Create Session",
      "delete": "Delete Session"
    }
  }
}

// ❌ 差：扁平结构
{
  "agentSessionCreate": "Create Session",
  "agentSessionDelete": "Delete Session"
}
```

## 性能优化

### 避免不必要的重渲染
```typescript
// ✅ 好：memo + useCallback
const MemoizedChild = memo(ChildComponent);

function Parent() {
  const handleClick = useCallback(() => {
    doSomething();
  }, []);

  return <MemoizedChild onClick={handleClick} />;
}

// ❌ 差：每次都重新创建
function Parent() {
  return <ChildComponent onClick={() => doSomething()} />;
}
```

### 懒加载
```typescript
// ✅ 好：路由懒加载
const Settings = lazy(() => import('./pages/Settings'));

<Suspense fallback={<Loading />}>
  <Settings />
</Suspense>

// ❌ 差：全部导入
import Settings from './pages/Settings';
```

## 安全规范

### 输入验证
```typescript
// ✅ 好：验证所有输入
function validatePath(path: string): boolean {
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  return true;
}

// ❌ 差：直接使用用户输入
const content = await fs.readFile(userInput);
```

### XSS 防护
```typescript
// ✅ 好：使用 React 自动转义
<div>{userInput}</div>

// ❌ 差：dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

## 测试规范

### 单元测试
```typescript
// ✅ 好：清晰的测试结构
describe('AgentService', () => {
  describe('createSession', () => {
    it('should create session with valid config', async () => {
      const config = { model: 'claude-3' };
      const result = await service.createSession(config);
      expect(result.sessionId).toBeDefined();
    });

    it('should throw error with invalid config', async () => {
      const config = { model: '' };
      await expect(service.createSession(config)).rejects.toThrow();
    });
  });
});
```

## 文件组织

### 导入顺序
```typescript
// 1. React 相关
import { useState, useEffect } from 'react';

// 2. 第三方库
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

// 3. 内部模块
import { useAgentStore } from '@/stores/agentStore';
import { agentService } from '@/services/agentService';

// 4. 类型
import type { Session } from '@/types';

// 5. 样式
import './styles.css';
```

### 导出规范
```typescript
// ✅ 好：命名导出
export function Component() {}
export const constant = 'value';

// ✅ 好：默认导出（页面组件）
export default function Page() {}

// ❌ 差：混合使用容易混淆
export default function Component() {}
export const helper = () => {};
```
