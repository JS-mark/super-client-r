# API 文档

## IPC 通信接口

### 概述

Super Client R 使用 Electron 的 IPC (Inter-Process Communication) 机制实现主进程与渲染进程的通信。

**安全设计**:

- Context Isolation 启用
- 通过 Preload 脚本暴露最小化 API
- 所有 IPC 通道严格类型化

---

## Agent 模块

### 创建会话

```typescript
// Channel: agent:create-session
// Direction: Renderer → Main

interface CreateSessionRequest {
  model?: string;
  name?: string;
}

interface CreateSessionResponse {
  success: boolean;
  data?: AgentSession;
  error?: string;
}

// 使用示例
const session = await window.electronAPI.agent.createSession({
  model: 'claude-3-opus-20240229',
  name: 'My Session'
});
```

### 发送消息

```typescript
// Channel: agent:send-message
// Direction: Renderer → Main

interface SendMessageRequest {
  sessionId: string;
  content: string;
}

interface SendMessageResponse {
  success: boolean;
  error?: string;
}

// 使用示例
await window.electronAPI.agent.sendMessage({
  sessionId: 'session-id',
  content: 'Hello, Claude!'
});
```

### 流式事件

```typescript
// Channel: agent:stream-event
// Direction: Main → Renderer (Event)

interface AgentStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done';
  sessionId: string;
  data: unknown;
}

// 使用示例
window.electronAPI.agent.onStreamEvent((event, data: AgentStreamEvent) => {
  switch (data.type) {
    case 'text':
      // 处理文本块
      break;
    case 'tool_use':
      // 处理工具调用
      break;
    case 'done':
      // 流结束
      break;
  }
});
```

### 获取状态

```typescript
// Channel: agent:get-status
// Direction: Renderer → Main

interface GetStatusResponse {
  success: boolean;
  data?: {
    status: 'idle' | 'running' | 'stopped' | 'error';
    sessionId: string;
  };
  error?: string;
}
```

### 停止 Agent

```typescript
// Channel: agent:stop
// Direction: Renderer → Main

interface StopAgentRequest {
  sessionId: string;
}

interface StopAgentResponse {
  success: boolean;
  error?: string;
}
```

### 列出会话

```typescript
// Channel: agent:list
// Direction: Renderer → Main

interface ListAgentsResponse {
  success: boolean;
  data?: AgentSession[];
  error?: string;
}
```

---

## Skill 模块

### 列出技能

```typescript
// Channel: skill:list
// Direction: Renderer → Main

interface ListSkillsResponse {
  success: boolean;
  data?: SkillManifest[];
  error?: string;
}

// 使用示例
const { success, data: skills } = await window.electronAPI.skill.list();
```

### 安装技能

```typescript
// Channel: skill:install
// Direction: Renderer → Main

interface InstallSkillRequest {
  source: string;  // 本地路径或远程 URL
}

interface InstallSkillResponse {
  success: boolean;
  data?: SkillManifest;
  error?: string;
}
```

### 卸载技能

```typescript
// Channel: skill:uninstall
// Direction: Renderer → Main

interface UninstallSkillRequest {
  skillId: string;
}

interface UninstallSkillResponse {
  success: boolean;
  error?: string;
}
```

### 获取技能详情

```typescript
// Channel: skill:get
// Direction: Renderer → Main

interface GetSkillRequest {
  skillId: string;
}

interface GetSkillResponse {
  success: boolean;
  data?: SkillManifest;
  error?: string;
}
```

### 执行技能

```typescript
// Channel: skill:execute
// Direction: Renderer → Main

interface ExecuteSkillRequest {
  skillId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ExecuteSkillResponse {
  success: boolean;
  data?: {
    output: unknown;
    executionTime: number;
  };
  error?: string;
}
```

---

## MCP 模块

### 连接服务器

```typescript
// Channel: mcp:connect
// Direction: Renderer → Main

interface McpConnectRequest {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConnectResponse {
  success: boolean;
  data?: McpServerStatus;
  error?: string;
}
```

### 断开连接

```typescript
// Channel: mcp:disconnect
// Direction: Renderer → Main

interface McpDisconnectRequest {
  serverId: string;
}

interface McpDisconnectResponse {
  success: boolean;
  error?: string;
}
```

### 列出服务器

```typescript
// Channel: mcp:list
// Direction: Renderer → Main

interface McpListResponse {
  success: boolean;
  data?: McpServerStatus[];
  error?: string;
}
```

### 获取工具列表

```typescript
// Channel: mcp:get-tools
// Direction: Renderer → Main

interface McpGetToolsRequest {
  serverId: string;
}

interface McpGetToolsResponse {
  success: boolean;
  data?: McpTool[];
  error?: string;
}
```

### 调用工具

```typescript
// Channel: mcp:call-tool
// Direction: Renderer → Main

interface McpCallToolRequest {
  serverId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface McpCallToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

---

## Chat 模块

### 发送消息

```typescript
// Channel: chat:send-message
// Direction: Renderer → Main

interface ChatSendRequest {
  sessionId?: string;
  content: string;
  model?: string;
}

interface ChatSendResponse {
  success: boolean;
  data?: {
    messageId: string;
    timestamp: number;
  };
  error?: string;
}
```

### 获取历史

```typescript
// Channel: chat:get-history
// Direction: Renderer → Main

interface ChatGetHistoryRequest {
  sessionId?: string;
  limit?: number;
  offset?: number;
}

interface ChatGetHistoryResponse {
  success: boolean;
  data?: {
    messages: ChatMessage[];
    total: number;
  };
  error?: string;
}
```

### 清除历史

```typescript
// Channel: chat:clear
// Direction: Renderer → Main

interface ChatClearRequest {
  sessionId?: string;
}

interface ChatClearResponse {
  success: boolean;
  error?: string;
}
```

---

## App 模块

### 获取应用信息

```typescript
// Channel: app:get-info
// Direction: Renderer → Main

interface AppInfoResponse {
  success: boolean;
  data?: {
    name: string;
    version: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  error?: string;
}
```

### 获取用户数据路径

```typescript
// Channel: app:get-user-data-path
// Direction: Renderer → Main

interface UserDataPathResponse {
  success: boolean;
  data?: {
    userData: string;
    temp: string;
    logs: string;
  };
  error?: string;
}
```

### 打开路径

```typescript
// Channel: app:open-path
// Direction: Renderer → Main

interface OpenPathRequest {
  path: string;
}

interface OpenPathResponse {
  success: boolean;
  error?: string;
}
```

### 打开开发者工具

```typescript
// Channel: app:open-dev-tools
// Direction: Renderer → Main

interface OpenDevToolsResponse {
  success: boolean;
  error?: string;
}
```

### 退出应用

```typescript
// Channel: app:quit
// Direction: Renderer → Main

interface QuitResponse {
  success: boolean;
  error?: string;
}
```

### 重启应用

```typescript
// Channel: app:relaunch
// Direction: Renderer → Main

interface RelaunchResponse {
  success: boolean;
  error?: string;
}
```

### 日志相关

```typescript
// Channel: app:get-logs
interface GetLogsResponse {
  success: boolean;
  data?: string;
  error?: string;
}

// Channel: app:list-log-files
interface ListLogFilesResponse {
  success: boolean;
  data?: { name: string; size: number; modified: number }[];
  error?: string;
}

// Channel: app:clear-logs
interface ClearLogsResponse {
  success: boolean;
  error?: string;
}
```

---

## API Server 模块

### 获取服务器状态

```typescript
// Channel: api:get-status
// Direction: Renderer → Main

interface ApiStatusResponse {
  success: boolean;
  data?: {
    running: boolean;
    port: number;
    url: string;
    startTime?: number;
  };
  error?: string;
}
```

### 启动服务器

```typescript
// Channel: api:start
// Direction: Renderer → Main

interface ApiStartRequest {
  port?: number;
}

interface ApiStartResponse {
  success: boolean;
  data?: {
    port: number;
    url: string;
  };
  error?: string;
}
```

### 停止服务器

```typescript
// Channel: api:stop
// Direction: Renderer → Main

interface ApiStopResponse {
  success: boolean;
  error?: string;
}
```

### 重启服务器

```typescript
// Channel: api:restart
// Direction: Renderer → Main

interface ApiRestartResponse {
  success: boolean;
  data?: {
    port: number;
    url: string;
  };
  error?: string;
}
```

### 设置端口

```typescript
// Channel: api:set-port
// Direction: Renderer → Main

interface ApiSetPortRequest {
  port: number;
}

interface ApiSetPortResponse {
  success: boolean;
  error?: string;
}
```

---

## HTTP API (Koa Server)

当本地 API 服务器启动时，以下 HTTP 端点可用。

### 基础信息

- **Base URL**: `http://localhost:{port}`
- **认证**: Bearer Token (通过配置设置)

### 健康检查

```http
GET /health

Response:
{
  "status": "ok",
  "timestamp": 1704067200000,
  "version": "0.0.1"
}
```

### 代理转发

```http
POST /proxy/:target

Headers:
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  // 转发到目标服务的请求体
}

Response:
{
  "success": true,
  "data": { ... }
}
```

---

## 错误处理

### 错误码规范

| 错误码            | 说明            |
|-------------------|-----------------|
| `INVALID_REQUEST` | 请求参数无效    |
| `NOT_FOUND`       | 资源不存在      |
| `ALREADY_EXISTS`  | 资源已存在      |
| `NOT_CONNECTED`   | 未连接/未初始化 |
| `EXECUTION_ERROR` | 执行出错        |
| `TIMEOUT`         | 操作超时        |
| `INTERNAL_ERROR`  | 内部错误        |

### 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}
```

---

## 类型定义

完整类型定义见 `src/main/ipc/types.ts` 和 `src/renderer/src/types/`。

### 核心类型

```typescript
// Agent
interface AgentSession {
  id: string;
  name: string;
  model: string;
  createdAt: number;
  status: 'idle' | 'running' | 'stopped' | 'error';
}

interface AgentMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolUse?: ToolUse[];
}

// Skill
interface SkillManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category?: string;
  icon?: string;
  permissions?: string[];
  tools?: SkillTool[];
}

// MCP
interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Chat
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
}
```
