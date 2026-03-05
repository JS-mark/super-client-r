# 类型定义

Super Client R 使用 TypeScript 进行类型定义。

## 核心类型

### 聊天类型

```typescript
// 消息角色
type MessageRole = 'user' | 'assistant' | 'tool';

// 聊天模式
type ChatMode = 'direct' | 'agent' | 'skill' | 'mcp';

// 消息
interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  type?: 'text' | 'tool_use' | 'tool_result';
  toolCall?: ToolCall;
}

// 工具调用
interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  result?: unknown;
  error?: string;
  duration?: number;
}

// 聊天会话
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  mode: ChatMode;
  createdAt: number;
  updatedAt: number;
}
```

### MCP 类型

```typescript
// MCP 服务器类型
type MCPServerType = 'stdio' | 'sse' | 'http';

// MCP 服务器状态
type MCPServerStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// MCP 服务器
interface MCPServer {
  id: string;
  name: string;
  type: MCPServerType;
  status: MCPServerStatus;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  config?: Record<string, unknown>;
}

// MCP 工具
interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// MCP 资源
interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}
```

### 技能类型

```typescript
// 技能
interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  installed: boolean;
  category?: string;
  icon?: string;
  homepage?: string;
  repository?: string;
  readme?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 技能工具
interface SkillTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
}

// 技能配置
interface SkillConfig {
  [key: string]: unknown;
}

// 技能清单
interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  icon?: string;
  entry: string;
  minAppVersion: string;
  permissions: string[];
}
```

### 模型类型

```typescript
// 模型提供商
type ModelProvider = 'anthropic' | 'openai' | 'google' | 'custom';

// AI 模型
interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  enabled: boolean;
  config: ModelConfig;
}

// 模型配置
interface ModelConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}
```

### IPC 类型

```typescript
// IPC 请求
interface IPCRequest<T> {
  payload: T;
  timestamp: number;
}

// IPC 响应
interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// IPC 通道
interface IPCChannels {
  chat: {
    sendMessage: 'chat:send-message';
    streamMessage: 'chat:stream-message';
    onStreamChunk: 'chat:stream-chunk';
  };
  mcp: {
    connectServer: 'mcp:connect-server';
    callTool: 'mcp:call-tool';
  };
  skill: {
    executeSkill: 'skill:execute-skill';
  };
}
```

### 设置类型

```typescript
// 应用设置
interface AppSettings {
  general: GeneralSettings;
  models: AIModel[];
  chat: ChatSettings;
  mcp: MCPSettings;
  httpApi: HttpApiSettings;
  shortcuts: ShortcutSettings;
}

// 通用设置
interface GeneralSettings {
  language: string;
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  autoStart: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
}

// 聊天设置
interface ChatSettings {
  defaultMode: ChatMode;
  saveHistory: boolean;
  historyLimit: number;
  enableMarkdown: boolean;
  enableCodeHighlight: boolean;
  streamingEnabled: boolean;
}

// MCP 设置
interface MCPSettings {
  servers: MCPServer[];
  autoConnect: boolean;
  timeout: number;
}

// HTTP API 设置
interface HttpApiSettings {
  enabled: boolean;
  port: number;
  host: string;
  cors: {
    enabled: boolean;
    origins: string[];
  };
  auth: {
    enabled: boolean;
    token: string;
  };
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
}

// 快捷键设置
interface ShortcutSettings {
  newChat: string;
  sendMessage: string;
  newLine: string;
  clearChat: string;
  focusInput: string;
  toggleSidebar: string;
  openSettings: string;
  quit: string;
}
```

## 工具类型

```typescript
// 深度部分类型
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 可空类型
type Nullable<T> = T | null | undefined;

// API 响应
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// 分页参数
interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// 分页结果
interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

## 使用示例

```typescript
import type { Message, MCPServer, Skill } from '@/types';

// 使用类型
const message: Message = {
  id: 'msg_1',
  role: 'user',
  content: 'Hello',
  timestamp: Date.now()
};

// 泛型函数
async function fetchAPI<T>(url: string): Promise<APIResponse<T>> {
  const response = await fetch(url);
  return response.json();
}

// 类型守卫
function isMCPServer(obj: unknown): obj is MCPServer {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'type' in obj
  );
}
```
