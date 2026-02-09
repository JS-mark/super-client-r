# 代码规范

本规范基于 Biome 和 oxlint 配置，结合团队最佳实践。

---

## 1. TypeScript 规范

### 1.1 类型定义

```typescript
// ✅ 正确: 使用 interface 定义对象类型
interface User {
  id: string;
  name: string;
  email?: string;  // 可选属性
}

// ✅ 正确: 使用 type 定义联合类型或复杂类型
type Status = 'idle' | 'loading' | 'success' | 'error';
type Callback = (data: User) => void;

// ❌ 错误: 避免使用 any
function process(data: any) { }

// ✅ 正确: 使用 unknown 后类型断言
function process(data: unknown) {
  const user = data as User;
}
```

### 1.2 函数定义

```typescript
// ✅ 正确: 显式返回类型 (公共 API)
export function formatDate(date: Date): string {
  return date.toISOString();
}

// ✅ 正确: 箭头函数类型推断 (简单场景)
const double = (x: number) => x * 2;

// ✅ 正确: 异步函数
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// ❌ 错误: 不要在参数后使用多余空格
function bad( x: string ) { }

// ✅ 正确: 参数紧凑
function good(x: string) { }
```

### 1.3 枚举与常量

```typescript
// ❌ 避免: 传统枚举
enum Color {
  Red = 'red',
  Green = 'green',
}

// ✅ 推荐: 常量对象 (更好的类型推断)
const Color = {
  Red: 'red',
  Green: 'green',
} as const;

type Color = typeof Color[keyof typeof Color];

// ✅ 推荐: 联合类型
-type Status = 'active' | 'inactive' | 'pending';
```

### 1.4 类型导出

```typescript
// ✅ 正确: 类型单独导出
export type { User, Status };
export { UserCard };

// ✅ 正确: 组件和类型一起导出
export interface ButtonProps {
  variant: 'primary' | 'secondary';
}

export function Button({ variant }: ButtonProps) {
  // ...
}
```

---

## 2. React 规范

### 2.1 组件定义

```typescript
// ✅ 正确: 函数组件
import { useState } from 'react';

interface GreetingProps {
  name: string;
}

export function Greeting({ name }: GreetingProps) {
  return <h1>Hello, {name}</h1>;
}

// ✅ 正确: 默认导出
export default function HomePage() {
  return <div>Home</div>;
}
```

### 2.2 Hooks 使用

```typescript
// ✅ 正确: Hooks 在顶部调用
function useUser(id: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchUser(id)
      .then(setUser)
      .finally(() => setLoading(false));
  }, [id]);

  return { user, loading };
}

// ❌ 错误: 条件调用 Hooks
function bad(condition: boolean) {
  if (condition) {
    useState();  // 错误!
  }
}

// ❌ 错误: 循环中调用 Hooks
function bad(items: string[]) {
  items.forEach(() => {
    useState();  // 错误!
  });
}
```

### 2.3 事件处理

```typescript
// ✅ 正确: 使用 useCallback 缓存事件处理
import { useCallback } from 'react';

function Form() {
  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    // 处理提交
  }, []);

  return <form onSubmit={handleSubmit}>...</form>;
}

// ✅ 正确: 内联事件 (简单场景)
<button onClick={() => setCount(c => c + 1)}>+</button>
```

### 2.4 条件渲染

```typescript
// ✅ 正确: 逻辑与运算符
function Message({ count }: { count: number }) {
  return (
    <div>
      {count > 0 && <span>You have {count} messages</span>}
    </div>
  );
}

// ✅ 正确: 三元运算符
function Status({ isOnline }: { isOnline: boolean }) {
  return (
    <span className={isOnline ? 'online' : 'offline'}>
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}

// ✅ 正确: 提前返回
function Profile({ user }: { user?: User }) {
  if (!user) return <div>Not logged in</div>;

  return <div>{user.name}</div>;
}
```

---

## 3. 样式规范

### 3.1 Tailwind CSS

```tsx
// ✅ 正确: 使用 clsx 和 tailwind-merge 处理类名
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 使用
<button className={cn(
  'px-4 py-2 rounded',
  isPrimary && 'bg-blue-500 text-white',
  isDisabled && 'opacity-50 cursor-not-allowed'
)}>
  Click
</button>

// ❌ 错误: 不要直接拼接可能有冲突的类名
<button className={`px-4 py-2 ${isRed ? 'text-red-500' : 'text-blue-500'}`}>
```

### 3.2 CSS 变量

```css
/* ✅ 正确: 使用 CSS 变量定义主题 */
:root {
  --color-primary: #1890ff;
  --color-success: #52c41a;
  --color-warning: #faad14;
  --color-error: #f5222d;
}

/* 使用 */
.button-primary {
  background-color: var(--color-primary);
}
```

---

## 4. 命名规范

### 4.1 变量命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量/函数 | camelCase | `userName`, `getUser()` |
| 组件/类 | PascalCase | `UserCard`, `UserService` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE_URL` |
| 类型/接口 | PascalCase | `User`, `UserProps` |
| 枚举成员 | PascalCase | `Status.Success` |
| 私有属性 | _camelCase | `_internalValue` |

### 4.2 布尔变量

```typescript
// ✅ 正确: 使用 is/has/should/can 前缀
const isLoading = true;
const hasError = false;
const shouldRetry = true;
const canEdit = false;

// ❌ 错误: 不明确的前缀
const loading = true;  // 可以是函数或状态
const error = false;   // 可以是对象或布尔值
```

### 4.3 事件处理

```typescript
// ✅ 正确: handle + 事件名
const handleClick = () => { };
const handleSubmit = () => { };
const handleInputChange = () => { };

// ✅ 正确: on + 事件名 (props)
<Button onClick={handleClick} />
<Input onChange={handleInputChange} />

// ❌ 错误: 不一致的命名
const clickHandler = () => { };
const onBtnClick = () => { };
```

---

## 5. 注释规范

### 5.1 文件头注释

```typescript
/**
 * AgentService - AI 代理服务
 *
 * 管理 Claude Agent 会话，处理消息收发和流式响应
 */
```

### 5.2 函数注释 (复杂逻辑)

```typescript
/**
 * 创建新的 Agent 会话
 * @param model - 使用的 AI 模型
 * @param name - 会话名称 (可选)
 * @returns 创建的会话对象
 * @throws {Error} 当模型不可用时抛出
 */
async function createSession(model: string, name?: string): Promise<Session> {
  // 实现
}
```

### 5.3 行内注释

```typescript
// ✅ 正确: 解释为什么这样做
// 使用指数退避避免频繁重试
const delay = Math.pow(2, retryCount) * 1000;

// ❌ 错误: 描述显而易见的代码
// 增加计数器
count++;
```

---

## 6. 错误处理

### 6.1 同步错误

```typescript
// ✅ 正确: 使用 try-catch
function parseConfig(json: string): Config {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to parse config:', error);
    return defaultConfig;
  }
}
```

### 6.2 异步错误

```typescript
// ✅ 正确: async/await + try-catch
async function loadUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to load user:', error);
    return null;
  }
}

// ✅ 正确: Promise 链式处理
fetchUser(id)
  .then(user => console.log(user))
  .catch(error => console.error(error));
```

---

## 7. IPC 通信规范

### 7.1 通道命名

```typescript
// ✅ 正确: 使用命名空间前缀
const CHANNELS = {
  // 模块:动作
  AGENT_CREATE: 'agent:create',
  AGENT_SEND: 'agent:send',
  SKILL_INSTALL: 'skill:install',
  SKILL_EXECUTE: 'skill:execute',
};

// ❌ 错误: 没有命名空间
const BAD = {
  CREATE: 'create',
  SEND: 'send',
};
```

### 7.2 类型安全

```typescript
// ✅ 正确: 完整的类型定义
interface IPCRequest<T = unknown> {
  id?: string;
  payload?: T;
}

interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// 处理器
type Handler<T, R> = (
  event: IpcMainInvokeEvent,
  request: IPCRequest<T>
) => Promise<IPCResponse<R>>;
```

---

## 8. 状态管理规范

### 8.1 Zustand Store

```typescript
// ✅ 正确: 按功能拆分 Store
// stores/userStore.ts
interface UserState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  fetchUser: (id: string) => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      fetchUser: async (id) => {
        set({ isLoading: true });
        const user = await fetchUserApi(id);
        set({ user, isLoading: false });
      },
    }),
    { name: 'user-storage' }
  )
);
```

### 8.2 选择器优化

```typescript
// ✅ 正确: 细粒度订阅
const userName = useUserStore((state) => state.user?.name);

// ❌ 错误: 订阅整个 Store
const { user, orders, settings } = useUserStore();  // 导致不必要的重渲染
```

---

## 9. 测试规范 (预留)

```typescript
// ✅ 正确: 测试文件命名
ComponentName.test.tsx
useHook.test.ts

// ✅ 正确: 测试结构
describe('AgentService', () => {
  describe('createSession', () => {
    it('should create a new session with valid model', async () => {
      // 测试代码
    });

    it('should throw error when model is invalid', async () => {
      // 测试代码
    });
  });
});
```

---

## 10. Git 提交规范

### 10.1 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 10.2 类型 (type)

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档更新 |
| `style` | 代码格式 (不影响功能) |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具链 |

### 10.3 示例

```
feat(agent): add streaming message support

- Implement Server-Sent Events for real-time updates
- Add buffering for partial message handling
- Update UI to show typing indicators

fix(mcp): resolve connection timeout issue

Refs: #123
```

---

## 11. Biome 配置

```json
{
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "tab",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "organizeImports": {
    "enabled": true
  }
}
```

---

## 12. 代码审查清单

### 功能完整性
- [ ] 功能按预期工作
- [ ] 错误处理完善
- [ ] 边界条件处理

### 代码质量
- [ ] TypeScript 类型完整
- [ ] 无 console.log (或已标记 TODO)
- [ ] 无未使用的变量/导入
- [ ] 函数复杂度合理

### 性能
- [ ] 避免不必要的重渲染
- [ ] 大数据量使用虚拟化
- [ ] 图片/资源懒加载

### 安全
- [ ] 无敏感信息硬编码
- [ ] 用户输入已验证
- [ ] IPC 通信类型安全

### 可维护性
- [ ] 代码自解释 (必要时加注释)
- [ ] 遵循命名规范
- [ ] 单一职责原则
