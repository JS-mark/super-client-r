# 代码规范

Super Client R 使用严格的代码规范来保证代码质量和一致性。

## 工具链

- **TypeScript**: 类型检查
- **Biome**: 代码格式化和 linting
- **oxlint**: 额外的代码检查

## 代码风格

### 格式化

项目使用 Biome 进行代码格式化：

```bash
pnpm format        # 格式化所有文件
pnpm check:biome   # 检查并修复
```

### Lint 规则

```bash
pnpm lint          # oxlint 检查
pnpm lint:biome    # Biome lint
```

## TypeScript 规范

### 类型定义

**使用 interface 定义对象类型：**

```typescript
// ✅ 推荐
interface UserConfig {
  name: string;
  age: number;
  email?: string;
}

// ❌ 不推荐
type UserConfig = {
  name: string;
  age: number;
};
```

**使用 type 定义联合类型：**

```typescript
// ✅ 推荐
type Status = 'idle' | 'loading' | 'success' | 'error';
type Theme = 'light' | 'dark';
```

### 函数定义

**显式返回类型：**

```typescript
// ✅ 推荐
function formatDate(date: Date): string {
  return date.toISOString();
}

// 异步函数
async function fetchUser(id: string): Promise<User> {
  const response = await api.get(`/users/${id}`);
  return response.data;
}
```

**使用箭头函数：**

```typescript
// ✅ 推荐
const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};
```

### 避免 any

```typescript
// ❌ 避免
function process(data: any): any {
  return data.value;
}

// ✅ 推荐
function process<T extends { value: unknown }>(data: T): T['value'] {
  return data.value;
}

// 或使用 unknown
function process(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  return String(data);
}
```

## React 规范

### 组件定义

**函数组件：**

```tsx
// ✅ 推荐
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function Button({
  children,
  onClick,
  disabled = false,
}: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
```

**Props 解构：**

```tsx
// ✅ 推荐
export function UserCard({ user, showEmail }: UserCardProps) {
  return <div>{user.name}</div>;
}

// ❌ 避免
export function UserCard(props: UserCardProps) {
  return <div>{props.user.name}</div>;
}
```

### Hooks 使用

**useCallback：**

```tsx
// ✅ 推荐 - 事件处理器使用 useCallback
const handleClick = useCallback(() => {
  setCount(c => c + 1);
}, []);

// ✅ 推荐 - 依赖项正确
const handleSubmit = useCallback(() => {
  submitForm(data);
}, [data]);
```

**useEffect：**

```tsx
// ✅ 推荐 - 清理函数
useEffect(() => {
  const subscription = subscribe();
  return () => {
    subscription.unsubscribe();
  };
}, []);

// ✅ 推荐 - 依赖项完整
useEffect(() => {
  fetchData(id);
}, [id]);
```

**自定义 Hooks：**

```tsx
// ✅ 推荐 - 以 use 开头
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);

  const sendMessage = useCallback(async (content: string) => {
    // 实现
  }, []);

  return { messages, sendMessage };
}
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
| 常量 | UPPER_SNAKE | `API_ENDPOINTS.ts` |
| IPC 通道 | kebab-case | `agent:create-session` |

### 变量命名

```typescript
// ✅ 推荐
const userName = 'John';
const isLoading = false;
const messageList: Message[] = [];
const handleClick = () => {};

// ❌ 避免
const user_name = 'John';
const loading = false;  // 布尔值不以 is 开头
const messages = [];    // 数组不以 List 结尾
const clickHandler = () => {};  // 事件处理器不以 handle 开头
```

## 导入规范

### 导入顺序

```tsx
// 1. React/框架
import React, { useState, useCallback } from 'react';

// 2. 第三方库
import { Button, Modal } from 'antd';
import { useTranslation } from 'react-i18next';

// 3. 绝对路径导入 (@/)
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';

// 4. 相对路径导入 (./)
import { MessageBubble } from './MessageBubble';
import { useMessageActions } from './hooks';
```

### 类型导入

```typescript
// ✅ 推荐 - 显式类型导入
import type { Message, User } from '@/types';

// ✅ 推荐 - 值和类型分开导入
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
```

## 错误处理

### 异步操作

```typescript
// ✅ 推荐
try {
  const result = await fetchData();
  setData(result);
} catch (error) {
  console.error('Failed to fetch data:', error);
  message.error('Failed to load data');
} finally {
  setLoading(false);
}
```

### IPC 处理

```typescript
// ✅ 推荐
ipcMain.handle('channel', async (event, request) => {
  try {
    const result = await processRequest(request);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});
```

## 注释规范

### 文件头注释

```typescript
/**
 * Chat service for managing conversations
 * @module services/chat
 */
```

### 函数注释

```typescript
/**
 * Send a message to the AI
 * @param content - Message content
 * @param options - Send options
 * @returns Promise with message response
 * @throws Error if sending fails
 */
async function sendMessage(
  content: string,
  options?: SendOptions
): Promise<MessageResponse> {
  // 实现
}
```

### 内联注释

```typescript
// ✅ 推荐 - 解释为什么
// 需要延迟以等待动画完成
setTimeout(callback, 300);

// ❌ 避免 - 解释是什么
// 设置超时
setTimeout(callback, 300);
```

## 性能优化

### 避免不必要的渲染

```tsx
// ✅ 推荐 - 使用 useMemo
const expensiveValue = useMemo(() => {
  return data.filter(item => item.active).map(transform);
}, [data]);

// ✅ 推荐 - 使用 useCallback
const handleSubmit = useCallback(() => {
  submit(formData);
}, [formData]);

// ✅ 推荐 - 组件拆分
const MemoizedListItem = memo(ListItem);
```

### 状态选择器

```tsx
// ✅ 推荐 - 使用选择器
const messages = useChatStore(state => state.messages);

// ❌ 避免 - 解构整个状态
const { messages, addMessage } = useChatStore();
```

## 测试规范

### 测试文件

```typescript
// formatDate.test.ts
import { describe, it, expect } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate', () => {
  it('should format date to ISO string', () => {
    const date = new Date('2025-01-15');
    expect(formatDate(date)).toBe('2025-01-15T00:00:00.000Z');
  });

  it('should handle invalid date', () => {
    expect(() => formatDate(new Date('invalid'))).toThrow();
  });
});
```

## Git 提交规范

### 提交信息格式

```
<type>: <subject>

<body>

<footer>
```

### 类型

- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式调整
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建/工具

### 示例

```
feat: add MCP server management

- Add server list view
- Implement server connection
- Add tool execution

Closes #123
```

## 代码审查清单

- [ ] 类型定义完整
- [ ] 没有使用 `any`
- [ ] 错误处理完善
- [ ] 资源正确清理
- [ ] 命名符合规范
- [ ] 代码格式化通过
- [ ] 类型检查通过
- [ ] Lint 检查通过
