# 状态管理

Super Client R 使用 Zustand 进行状态管理，配合持久化中间件实现数据保存。

## 架构

```
┌─────────────────────────────────────────┐
│           Zustand Stores                │
├─────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │  Chat   │ │   MCP   │ │  Skill   │  │
│  │  Store  │ │  Store  │ │  Store   │  │
│  └────┬────┘ └────┬────┘ └────┬─────┘  │
│       └─────────────┬──────────┘        │
│                     ▼                   │
│            ┌─────────────────┐          │
│            │  Persist Middleware│        │
│            └─────────────────┘          │
│                     │                   │
│                     ▼                   │
│            ┌─────────────────┐          │
│            │  Electron Store │          │
│            └─────────────────┘          │
└─────────────────────────────────────────┘
```

## Store 结构

### Chat Store

```typescript
// stores/chatStore.ts
interface ChatState {
  // 状态
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;

  // 动作
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isStreaming: false,
      streamingContent: '',

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message]
        })),

      updateLastMessage: (content) =>
        set((state) => ({
          messages: state.messages.map((msg, idx) =>
            idx === state.messages.length - 1
              ? { ...msg, content }
              : msg
          )
        })),

      setStreaming: (streaming) =>
        set({ isStreaming: streaming }),

      clearMessages: () =>
        set({ messages: [], streamingContent: '' }),
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        messages: state.messages
      })
    }
  )
);
```

### MCP Store

```typescript
// stores/mcpStore.ts
interface MCPState {
  servers: MCPServer[];
  selectedServerId: string | null;
  tools: MCPTool[];

  addServer: (server: MCPServer) => void;
  removeServer: (id: string) => void;
  updateServerStatus: (id: string, status: ServerStatus) => void;
  selectServer: (id: string | null) => void;
  setTools: (tools: MCPTool[]) => void;
}

export const useMcpStore = create<MCPState>()(
  persist(
    (set) => ({
      servers: [],
      selectedServerId: null,
      tools: [],

      addServer: (server) =>
        set((state) => ({
          servers: [...state.servers, server]
        })),

      removeServer: (id) =>
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id)
        })),

      updateServerStatus: (id, status) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, status } : s
          )
        })),

      selectServer: (id) =>
        set({ selectedServerId: id }),

      setTools: (tools) =>
        set({ tools })
    }),
    {
      name: 'mcp-storage',
      partialize: (state) => ({
        servers: state.servers
      })
    }
  )
);
```

### Skill Store

```typescript
// stores/skillStore.ts
interface SkillState {
  installedSkills: Skill[];
  marketSkills: Skill[];
  isLoading: boolean;

  installSkill: (skill: Skill) => void;
  uninstallSkill: (id: string) => void;
  updateSkill: (id: string, updates: Partial<Skill>) => void;
  setMarketSkills: (skills: Skill[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      installedSkills: [],
      marketSkills: [],
      isLoading: false,

      installSkill: (skill) =>
        set((state) => ({
          installedSkills: [...state.installedSkills, skill]
        })),

      uninstallSkill: (id) =>
        set((state) => ({
          installedSkills: state.installedSkills.filter(
            (s) => s.id !== id
          )
        })),

      updateSkill: (id, updates) =>
        set((state) => ({
          installedSkills: state.installedSkills.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          )
        })),

      setMarketSkills: (skills) =>
        set({ marketSkills: skills }),

      setLoading: (loading) =>
        set({ isLoading: loading })
    }),
    {
      name: 'skill-storage',
      partialize: (state) => ({
        installedSkills: state.installedSkills
      })
    }
  )
);
```

## 使用 Store

### 基础使用

```tsx
// 获取状态
const messages = useChatStore((state) => state.messages);

// 获取动作
const addMessage = useChatStore((state) => state.addMessage);

// 同时获取多个
const { messages, isStreaming } = useChatStore(
  (state) => ({
    messages: state.messages,
    isStreaming: state.isStreaming
  })
);
```

### 在组件中

```tsx
function ChatInput() {
  const [input, setInput] = useState('');
  const addMessage = useChatStore((state) => state.addMessage);
  const isStreaming = useChatStore((state) => state.isStreaming);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;

    addMessage({
      id: generateId(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    });

    setInput('');
  }, [input, isStreaming, addMessage]);

  return (
    <input
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
    />
  );
}
```

### 选择器优化

```tsx
// ✅ 推荐 - 使用选择器
const messages = useChatStore((state) => state.messages);

// ❌ 避免 - 解构整个状态
const { messages } = useChatStore();

// ✅ 推荐 - 组合选择器
const chatInfo = useChatStore(
  (state) => ({
    messageCount: state.messages.length,
    lastMessage: state.messages[state.messages.length - 1]
  }),
  shallow // 浅比较
);
```

## 持久化

### 配置

```typescript
persist(store, {
  name: 'storage-key',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    // 只持久化部分状态
    items: state.items
  }),
  onRehydrateStorage: () => (state) => {
    console.log('State rehydrated:', state);
  }
});
```

### 自定义存储

```typescript
import { StoreManager } from '@/main/store/StoreManager';

const electronStorage = {
  getItem: (name: string) => {
    return StoreManager.get(name);
  },
  setItem: (name: string, value: string) => {
    StoreManager.set(name, value);
  },
  removeItem: (name: string) => {
    StoreManager.delete(name);
  }
};

persist(store, {
  storage: createJSONStorage(() => electronStorage)
});
```

## 跨进程状态同步

### 主进程更新

```typescript
// main/services/AgentService.ts
class AgentService extends EventEmitter {
  async createSession(config: Config) {
    const session = await this.doCreate(config);

    // 广播到所有窗口
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent:session-created', session);
    });

    return session;
  }
}
```

### 渲染进程监听

```tsx
// hooks/useAgent.ts
useEffect(() => {
  const unsubscribe = window.electronAPI.agent.onSessionCreated(
    (session) => {
      useAgentStore.getState().addSession(session);
    }
  );

  return unsubscribe;
}, []);
```

## 最佳实践

### 1. 状态最小化

```typescript
// ✅ 推荐 - 存储最小状态
interface State {
  items: Item[];
  selectedId: string | null;
}

// 计算属性在 selector 中
const selectedItem = useStore((state) =>
  state.items.find((i) => i.id === state.selectedId)
);
```

### 2. 动作封装

```typescript
// ✅ 推荐 - 复杂逻辑在 store 中
const useStore = create((set, get) => ({
  items: [],

  // 复杂动作
  async fetchItems() {
    set({ isLoading: true });
    try {
      const items = await api.fetchItems();
      set({ items, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error });
    }
  }
}));
```

### 3. 避免循环依赖

```typescript
// ❌ 避免 - Store 间直接依赖
const useStoreA = create(() => ({
  value: useStoreB.getState().value // 错误！
}));

// ✅ 推荐 - 通过参数传递
const useStoreA = create(() => ({
  process: (valueFromB: string) => {
    // 处理
  }
}));
```

### 4. TypeScript 类型

```typescript
// ✅ 推荐 - 完整类型定义
interface State {
  count: number;
  increment: () => void;
}

const useStore = create<State>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 }))
}));
```

## 调试

### DevTools

```bash
# 安装扩展
pnpm add -D zustand-devtools
```

```typescript
import { devtools } from 'zustand/middleware';

const useStore = create(
  devtools(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 }))
    }),
    { name: 'MyStore' }
  )
);
```

### 日志中间件

```typescript
const logMiddleware = (config) => (set, get, api) =>
  config(
    (args) => {
      console.log('Applying:', args);
      set(args);
      console.log('New state:', get());
    },
    get,
    api
  );

const useStore = create(
  logMiddleware((set) => ({
    count: 0
  }))
);
```
