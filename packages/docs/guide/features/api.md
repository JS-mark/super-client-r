# HTTP API

Super Client R 内置 Koa HTTP 服务器，提供 RESTful API 接口，方便与其他应用集成。

## 概述

HTTP API 服务运行在本地，默认端口为 `3000`（可配置）。

```
┌─────────────┐      HTTP       ┌─────────────┐
│   External  │ ◄─────────────► │   Super     │
│   App       │    REST API     │   Client R  │
└─────────────┘                 └─────────────┘
```

## 启动 API 服务

### 自动启动

应用启动时，API 服务会自动启动（可在设置中关闭）。

### 手动控制

```bash
# 通过设置页面
设置 → HTTP API → 启用/禁用

# 配置端口
设置 → HTTP API → 端口号
```

### 验证服务状态

```bash
curl http://localhost:3000/health

# 响应
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## API 端点

### 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **认证**: Bearer Token（可选，可在设置中配置）

### 聊天接口

#### 发送消息

```http
POST /api/chat/send
Content-Type: application/json
Authorization: Bearer {token}

{
  "message": "Hello, how are you?",
  "mode": "direct",
  "sessionId": "optional-session-id"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "messageId": "msg_123",
    "content": "I'm doing well, thank you!",
    "role": "assistant",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

#### 流式响应

```http
POST /api/chat/stream
Content-Type: application/json

{
  "message": "Tell me a story",
  "mode": "agent"
}
```

**响应：** SSE (Server-Sent Events)

```
data: {"type": "start", "messageId": "msg_124"}

data: {"type": "chunk", "content": "Once"}

data: {"type": "chunk", "content": " upon"}

data: {"type": "chunk", "content": " a time..."}

data: {"type": "end", "messageId": "msg_124"}
```

#### 获取历史记录

```http
GET /api/chat/history?sessionId={sessionId}&limit=50
```

**响应：**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg_1",
        "role": "user",
        "content": "Hello",
        "timestamp": "2025-01-15T10:00:00.000Z"
      },
      {
        "id": "msg_2",
        "role": "assistant",
        "content": "Hi there!",
        "timestamp": "2025-01-15T10:00:05.000Z"
      }
    ],
    "total": 2
  }
}
```

### MCP 接口

#### 列出服务器

```http
GET /api/mcp/servers
```

**响应：**

```json
{
  "success": true,
  "data": {
    "servers": [
      {
        "id": "filesystem",
        "name": "File System",
        "status": "connected",
        "type": "stdio"
      }
    ]
  }
}
```

#### 调用工具

```http
POST /api/mcp/tools/call
Content-Type: application/json

{
  "serverId": "filesystem",
  "toolName": "read_file",
  "parameters": {
    "path": "/path/to/file.txt"
  }
}
```

### 技能接口

#### 列出技能

```http
GET /api/skills
```

**响应：**

```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "id": "translator",
        "name": "Translator",
        "version": "1.0.0",
        "enabled": true
      }
    ]
  }
}
```

#### 执行技能

```http
POST /api/skills/{skillId}/execute
Content-Type: application/json

{
  "toolName": "translate",
  "parameters": {
    "text": "Hello",
    "targetLang": "zh"
  }
}
```

### 模型接口

#### 列出模型

```http
GET /api/models
```

**响应：**

```json
{
  "success": true,
  "data": {
    "models": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "provider": "anthropic",
        "enabled": true
      }
    ]
  }
}
```

#### 切换模型

```http
POST /api/models/switch
Content-Type: application/json

{
  "modelId": "claude-3-5-sonnet"
}
```

### 系统接口

#### 健康检查

```http
GET /health
```

#### 获取版本

```http
GET /api/version
```

**响应：**

```json
{
  "success": true,
  "data": {
    "version": "0.0.1",
    "electron": "28.0.0",
    "node": "22.0.0"
  }
}
```

#### 获取配置

```http
GET /api/config
Authorization: Bearer {token}
```

## 使用示例

### cURL

```bash
# 发送消息
curl -X POST http://localhost:3000/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# 流式响应
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi"}' \
  --no-buffer

# 获取历史
curl http://localhost:3000/api/chat/history?limit=10
```

### Python

```python
import requests

base_url = "http://localhost:3000"

# 发送消息
response = requests.post(f"{base_url}/api/chat/send", json={
    "message": "Hello",
    "mode": "direct"
})
print(response.json())

# 流式响应
import sseclient

response = requests.post(
    f"{base_url}/api/chat/stream",
    json={"message": "Tell me a story"},
    stream=True
)
client = sseclient.SSEClient(response)
for event in client.events():
    print(event.data)
```

### JavaScript

```javascript
// 发送消息
const response = await fetch('http://localhost:3000/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello', mode: 'direct' })
});
const data = await response.json();
console.log(data);

// 流式响应
const eventSource = new EventSource(
  'http://localhost:3000/api/chat/stream?message=Hello'
);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.content);
};
eventSource.onerror = () => {
  eventSource.close();
};
```

## 配置

### 启用 CORS

```json
// settings.json
{
  "httpApi": {
    "enabled": true,
    "port": 3000,
    "cors": {
      "enabled": true,
      "origins": ["http://localhost:8080", "https://your-app.com"]
    }
  }
}
```

### 认证配置

```json
{
  "httpApi": {
    "auth": {
      "enabled": true,
      "token": "your-secret-token"
    }
  }
}
```

### 速率限制

```json
{
  "httpApi": {
    "rateLimit": {
      "enabled": true,
      "maxRequests": 100,
      "windowMs": 60000
    }
  }
}
```

## Swagger 文档

API 文档可通过 Swagger UI 访问：

```
http://localhost:3000/swagger
```

## 故障排除

### 端口被占用

```bash
# 查找占用端口的进程
lsof -i :3000

# 更换端口
# 设置 → HTTP API → 端口号 → 3001
```

### 连接被拒绝

1. 检查 API 服务是否启用
2. 验证端口号是否正确
3. 检查防火墙设置

### 认证失败

1. 确认 Token 是否正确
2. 检查认证是否启用
3. 验证请求头格式

## 安全建议

1. **使用认证**：生产环境启用 Token 认证
2. **限制 CORS**：只允许可信域名
3. **启用 HTTPS**：使用反向代理
4. **监控日志**：定期检查访问日志
5. **速率限制**：防止滥用

## 集成示例

### VS Code 扩展

```typescript
// 在 VS Code 中调用 Super Client R
const response = await fetch('http://localhost:3000/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: `Explain this code: ${selectedCode}`,
    mode: 'agent'
  })
});
```

### Alfred Workflow

```bash
# 创建 Alfred Workflow，调用 API
curl -s http://localhost:3000/api/chat/send \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"{query}\", \"mode\": \"direct\"}" \
  | jq -r '.data.content'
```

### Raycast Extension

```typescript
// Raycast 扩展调用 API
export default async function Command() {
  const result = await fetch('http://localhost:3000/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello' })
  });
  // 显示结果
}
```
