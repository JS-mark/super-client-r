# IPC 接口

IPC（进程间通信）接口用于渲染进程与主进程之间的通信。

## 概述

```typescript
// 渲染进程中通过 window.electronAPI 访问
const result = await window.electronAPI.chat.sendMessage({
  content: 'Hello'
});
```

## 接口列表

### App 接口

#### 获取应用信息

```typescript
window.electronAPI.app.getInfo(): Promise<{
  version: string;
  platform: string;
}>
```

#### 检查更新

```typescript
window.electronAPI.app.checkUpdate(): Promise<{
  hasUpdate: boolean;
  version?: string;
}>
```

### 聊天接口

#### 发送消息

```typescript
window.electronAPI.chat.sendMessage(request: {
  content: string;
  mode?: 'direct' | 'agent' | 'skill' | 'mcp';
  sessionId?: string;
}): Promise<IPCResponse<Message>>
```

#### 流式消息

```typescript
window.electronAPI.chat.streamMessage(request: {
  content: string;
  mode?: ChatMode;
}): void

// 监听流式响应
window.electronAPI.chat.onStreamChunk(
  callback: (data: { content: string; done: boolean }) => void
): () => void
```

#### 获取历史记录

```typescript
window.electronAPI.chat.getHistory(sessionId?: string): Promise<{
  messages: Message[];
  total: number;
}>
```

#### 清空对话

```typescript
window.electronAPI.chat.clearHistory(sessionId?: string): Promise<void>
```

### MCP 接口

#### 列出服务器

```typescript
window.electronAPI.mcp.listServers(): Promise<{
  servers: MCPServer[];
}>
```

#### 添加服务器

```typescript
window.electronAPI.mcp.addServer(server: {
  id: string;
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
}): Promise<void>
```

#### 删除服务器

```typescript
window.electronAPI.mcp.removeServer(id: string): Promise<void>
```

#### 连接服务器

```typescript
window.electronAPI.mcp.connectServer(id: string): Promise<void>
```

#### 断开服务器

```typescript
window.electronAPI.mcp.disconnectServer(id: string): Promise<void>
```

#### 调用工具

```typescript
window.electronAPI.mcp.callTool(request: {
  serverId: string;
  toolName: string;
  parameters: Record<string, unknown>;
}): Promise<IPCResponse<unknown>>
```

#### 获取工具列表

```typescript
window.electronAPI.mcp.getTools(serverId: string): Promise<{
  tools: MCPTool[];
}>
```

### 技能接口

#### 列出已安装技能

```typescript
window.electronAPI.skill.listInstalled(): Promise<{
  skills: Skill[];
}>
```

#### 从市场获取技能

```typescript
window.electronAPI.skill.getMarketSkills(params: {
  page?: number;
  limit?: number;
  category?: string;
}): Promise<{
  skills: Skill[];
  total: number;
}>
```

#### 安装技能

```typescript
window.electronAPI.skill.install(skillId: string): Promise<void>
```

#### 卸载技能

```typescript
window.electronAPI.skill.uninstall(skillId: string): Promise<void>
```

#### 执行技能

```typescript
window.electronAPI.skill.execute(request: {
  skillId: string;
  toolName: string;
  parameters: Record<string, unknown>;
}): Promise<IPCResponse<unknown>>
```

### 存储接口

#### 获取数据

```typescript
window.electronAPI.store.get<T>(key: string): Promise<T | undefined>
```

#### 设置数据

```typescript
window.electronAPI.store.set<T>(key: string, value: T): Promise<void>
```

#### 删除数据

```typescript
window.electronAPI.store.delete(key: string): Promise<void>
```

### 窗口接口

#### 最小化

```typescript
window.electronAPI.window.minimize(): void
```

#### 最大化

```typescript
window.electronAPI.window.maximize(): void
```

#### 关闭

```typescript
window.electronAPI.window.close(): void
```

## 类型定义

### IPCRequest

```typescript
interface IPCRequest<T> {
  payload: T;
  timestamp: number;
}
```

### IPCResponse

```typescript
interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### 使用示例

```typescript
// 发送消息
const result = await window.electronAPI.chat.sendMessage({
  content: 'Hello',
  mode: 'direct'
});

if (result.success) {
  console.log('Message sent:', result.data);
} else {
  console.error('Failed:', result.error);
}

// 监听流式响应
const unsubscribe = window.electronAPI.chat.onStreamChunk(
  ({ content, done }) => {
    if (done) {
      console.log('Stream complete');
      unsubscribe();
    } else {
      console.log('Chunk:', content);
    }
  }
);
```
