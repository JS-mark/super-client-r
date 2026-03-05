# HTTP API

Super Client R 内置 HTTP 服务器，提供 RESTful API 接口。

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **认证**: Bearer Token（可选）

## 接口列表

### 系统接口

#### 健康检查

```http
GET /health
```

**响应：**

```json
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
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

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 消息内容 |
| mode | string | 否 | 聊天模式：direct/agent/skill/mcp |
| sessionId | string | 否 | 会话 ID |

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

data: {"type": "end", "messageId": "msg_124"}
```

#### 获取历史记录

```http
GET /api/chat/history?sessionId={sessionId}&limit=50
```

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 否 | 会话 ID |
| limit | number | 否 | 返回数量，默认 50 |

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
      }
    ],
    "total": 1
  }
}
```

#### 清空对话

```http
POST /api/chat/clear
Content-Type: application/json

{
  "sessionId": "optional-session-id"
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

#### 添加服务器

```http
POST /api/mcp/servers
Content-Type: application/json

{
  "id": "my-server",
  "name": "My Server",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"]
}
```

#### 删除服务器

```http
DELETE /api/mcp/servers/{serverId}
```

#### 连接服务器

```http
POST /api/mcp/servers/{serverId}/connect
```

#### 断开服务器

```http
POST /api/mcp/servers/{serverId}/disconnect
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

**响应：**

```json
{
  "success": true,
  "data": {
    "content": "File content here..."
  }
}
```

#### 列出工具

```http
GET /api/mcp/servers/{serverId}/tools
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

#### 安装技能

```http
POST /api/skills/install
Content-Type: application/json

{
  "id": "skill-id",
  "source": "market"
}
```

#### 卸载技能

```http
POST /api/skills/uninstall
Content-Type: application/json

{
  "id": "skill-id"
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

#### 添加模型

```http
POST /api/models
Content-Type: application/json

{
  "id": "my-model",
  "name": "My Model",
  "provider": "openai",
  "config": {
    "apiKey": "sk-xxx",
    "baseUrl": "https://api.openai.com"
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

## 错误响应

```json
{
  "success": false,
  "error": "Invalid API key",
  "code": "INVALID_API_KEY",
  "statusCode": 401
}
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
response = requests.post(
    f"{base_url}/api/chat/send",
    json={"message": "Hello", "mode": "direct"}
)
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

// 流式响应
const eventSource = new EventSource(
  'http://localhost:3000/api/chat/stream?message=Hello'
);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.content);
};
```
