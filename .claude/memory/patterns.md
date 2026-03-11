# 设计模式和最佳实践

## IPC 通信模式

### 请求-响应模式
```typescript
// Main Process
ipcMain.handle('data:fetch', async (event, { id }) => {
  try {
    const data = await database.get(id);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Renderer Process
const response = await window.electronAPI.data.fetch({ id: '123' });
if (response.success) {
  console.log(response.data);
} else {
  console.error(response.error);
}
```

### 事件广播模式
```typescript
// Main Process: 状态变化时广播
class DataService extends EventEmitter {
  async updateData(id: string, data: Data) {
    await this.save(id, data);

    // 广播到所有窗口
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('data:updated', { id, data });
    });
  }
}

// Renderer Process: 监听更新
useEffect(() => {
  const unsubscribe = window.electronAPI.data.onUpdated(({ id, data }) => {
    useDataStore.getState().updateItem(id, data);
  });
  return unsubscribe;
}, []);
```

### 流式传输模式
```typescript
// Main Process: 分块发送
async function streamLargeData(sessionId: string) {
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('data:chunk', {
        sessionId,
        chunk: chunk.toString(),
      });
    });
  }

  // 发送完成信号
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('data:complete', { sessionId });
  });
}

// Renderer Process: 累积数据
const [content, setContent] = useState('');
const [isComplete, setIsComplete] = useState(false);

useEffect(() => {
  const unsubChunk = window.electronAPI.data.onChunk(({ chunk }) => {
    setContent(prev => prev + chunk);
  });

  const unsubComplete = window.electronAPI.data.onComplete(() => {
    setIsComplete(true);
  });

  return () => {
    unsubChunk();
    unsubComplete();
  };
}, []);
```

## 状态管理模式

### 单一数据源模式
```typescript
// Main Process 是唯一的数据源
class SessionService extends EventEmitter {
  private sessions = new Map<string, Session>();

  async createSession(config: Config): Promise<Session> {
    const session = await this.doCreate(config);
    this.sessions.set(session.id, session);

    // 广播变化
    this.broadcastSessions();
    return session;
  }

  private broadcastSessions() {
    const sessions = Array.from(this.sessions.values());
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sessions:updated', sessions);
    });
  }
}

// Renderer Process 只是展示层
const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
}));

// 监听 Main Process 的更新
useEffect(() => {
  return window.electronAPI.sessions.onUpdated((sessions) => {
    useSessionStore.getState().setSessions(sessions);
  });
}, []);
```

### 乐观更新模式
```typescript
// Renderer: 立即更新 UI，然后同步到 Main
const deleteSession = useCallback(async (id: string) => {
  // 1. 乐观更新 UI
  useSessionStore.getState().removeSession(id);

  try {
    // 2. 同步到 Main Process
    const response = await window.electronAPI.sessions.delete({ id });

    if (!response.success) {
      // 3. 失败时回滚
      useSessionStore.getState().addSession(originalSession);
      showError(response.error);
    }
  } catch (error) {
    // 回滚
    useSessionStore.getState().addSession(originalSession);
    showError(error.message);
  }
}, []);
```

## 服务层模式

### EventEmitter 服务模式
```typescript
// 所有服务继承 EventEmitter
export class AgentService extends EventEmitter {
  async createSession(config: Config): Promise<Session> {
    this.emit('session:creating', config);

    try {
      const session = await this.doCreate(config);
      this.emit('session:created', session);
      return session;
    } catch (error) {
      this.emit('session:error', error);
      throw error;
    }
  }
}

// 其他服务可以监听事件
agentService.on('session:created', (session) => {
  logService.log(`Session created: ${session.id}`);
  analyticsService.track('session_created');
});
```

### 单例模式
```typescript
// 服务作为单例导出
class ConfigService {
  private static instance: ConfigService;
  private config: Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  getConfig(): Config {
    return this.config;
  }
}

// 导出单例
export const configService = ConfigService.getInstance();
```

### 依赖注入模式
```typescript
// 服务接受依赖作为构造函数参数
class AgentService {
  constructor(
    private config: ConfigService,
    private storage: StorageService,
    private logger: LoggerService
  ) {}

  async createSession(config: Config) {
    this.logger.info('Creating session');
    const session = await this.doCreate(config);
    await this.storage.save(session);
    return session;
  }
}

// 在 main.ts 中组装
const configService = new ConfigService();
const storageService = new StorageService();
const loggerService = new LoggerService();
const agentService = new AgentService(
  configService,
  storageService,
  loggerService
);
```

## React 组件模式

### 容器/展示组件模式
```typescript
// 展示组件：只负责 UI
interface SessionListProps {
  sessions: Session[];
  onSelect: (session: Session) => void;
  onDelete: (id: string) => void;
}

function SessionList({ sessions, onSelect, onDelete }: SessionListProps) {
  return (
    <div>
      {sessions.map(session => (
        <SessionItem
          key={session.id}
          session={session}
          onSelect={() => onSelect(session)}
          onDelete={() => onDelete(session.id)}
        />
      ))}
    </div>
  );
}

// 容器组件：负责数据和逻辑
function SessionListContainer() {
  const sessions = useSessionStore(state => state.sessions);

  const handleSelect = useCallback((session: Session) => {
    useSessionStore.getState().setActive(session.id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await window.electronAPI.sessions.delete({ id });
  }, []);

  return (
    <SessionList
      sessions={sessions}
      onSelect={handleSelect}
      onDelete={handleDelete}
    />
  );
}
```

### Compound Components 模式
```typescript
// 父组件提供上下文
const SessionContext = createContext<SessionContextValue>(null);

function Session({ children, session }: SessionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <SessionContext.Provider value={{ session, isExpanded, setIsExpanded }}>
      <div className="session">
        {children}
      </div>
    </SessionContext.Provider>
  );
}

// 子组件使用上下文
Session.Header = function SessionHeader() {
  const { session, isExpanded, setIsExpanded } = useContext(SessionContext);
  return (
    <div onClick={() => setIsExpanded(!isExpanded)}>
      {session.name}
    </div>
  );
};

Session.Content = function SessionContent() {
  const { session, isExpanded } = useContext(SessionContext);
  if (!isExpanded) return null;
  return <div>{session.content}</div>;
};

// 使用
<Session session={session}>
  <Session.Header />
  <Session.Content />
</Session>
```

### Custom Hook 模式
```typescript
// 封装复杂逻辑到自定义 hook
function useSession(sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      try {
        setIsLoading(true);
        const response = await window.electronAPI.sessions.get({ id: sessionId });

        if (!cancelled && response.success) {
          setSession(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const updateSession = useCallback(async (updates: Partial<Session>) => {
    const response = await window.electronAPI.sessions.update({
      id: sessionId,
      updates,
    });

    if (response.success) {
      setSession(response.data);
    }
  }, [sessionId]);

  return { session, isLoading, error, updateSession };
}

// 使用
function SessionDetail({ sessionId }: Props) {
  const { session, isLoading, error, updateSession } = useSession(sessionId);

  if (isLoading) return <Loading />;
  if (error) return <Error message={error} />;
  if (!session) return <NotFound />;

  return <SessionView session={session} onUpdate={updateSession} />;
}
```

## 错误处理模式

### 统一错误处理
```typescript
// 定义错误类型
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Main Process: 统一错误处理
function handleError(error: unknown): IPCResponse<never> {
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: false,
    error: 'Unknown error occurred',
  };
}

// 在 handler 中使用
ipcMain.handle('action', async (event, request) => {
  try {
    const result = await process(request);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
});
```

### React Error Boundary
```typescript
class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React Error:', error, errorInfo);
    // 可选：发送到错误追踪服务
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <details>
            <summary>Error details</summary>
            <pre>{this.state.error?.message}</pre>
          </details>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## 性能优化模式

### 虚拟滚动
```typescript
// 使用 react-window 处理大列表
import { FixedSizeList } from 'react-window';

function LargeList({ items }: Props) {
  const Row = ({ index, style }: RowProps) => (
    <div style={style}>
      <Item data={items[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

### 防抖和节流
```typescript
// 防抖：延迟执行
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// 使用
function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}

// 节流：限制执行频率
function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();

    if (now - lastUpdated.current >= interval) {
      setThrottledValue(value);
      lastUpdated.current = now;
    } else {
      const timer = setTimeout(() => {
        setThrottledValue(value);
        lastUpdated.current = Date.now();
      }, interval - (now - lastUpdated.current));

      return () => clearTimeout(timer);
    }
  }, [value, interval]);

  return throttledValue;
}
```

## 测试模式

### Mock IPC
```typescript
// 测试中 mock electronAPI
const mockElectronAPI = {
  sessions: {
    get: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
});

test('should fetch session', async () => {
  mockElectronAPI.sessions.get.mockResolvedValue({
    success: true,
    data: { id: '1', name: 'Test' },
  });

  const { result } = renderHook(() => useSession('1'));

  await waitFor(() => {
    expect(result.current.session).toEqual({ id: '1', name: 'Test' });
  });
});
```

### 集成测试
```typescript
// 测试完整的 IPC 流程
describe('Session IPC', () => {
  let mainWindow: BrowserWindow;

  beforeEach(async () => {
    mainWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
      },
    });

    await mainWindow.loadFile('index.html');
  });

  test('should create session via IPC', async () => {
    const result = await mainWindow.webContents.executeJavaScript(`
      window.electronAPI.sessions.create({ name: 'Test' })
    `);

    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Test');
  });
});
```
