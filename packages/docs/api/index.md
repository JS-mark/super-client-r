# API 文档

Super Client R 提供多种 API 接口，包括 HTTP REST API 和 IPC 接口。

## API 类型

| API 类型 | 用途 | 文档 |
|----------|------|------|
| HTTP API | 外部集成 | [查看](./http) |
| IPC API | 主进程通信 | [查看](./ipc) |
| 类型定义 | TypeScript 类型 | [查看](./types) |

## 快速开始

### HTTP API

```bash
# 启动应用后，API 服务运行在
http://localhost:3000

# 健康检查
curl http://localhost:3000/health
```

### IPC API

```typescript
// 渲染进程中使用
const result = await window.electronAPI.chat.sendMessage({
  content: 'Hello'
});
```

## 认证

### HTTP API

```bash
# 在请求头中添加 Token
curl http://localhost:3000/api/chat/send \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### IPC API

IPC 通信在应用内部进行，无需额外认证。

## 错误处理

### 错误格式

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### 常见错误码

| 错误码 | 说明 |
|--------|------|
| `INVALID_REQUEST` | 请求参数无效 |
| `UNAUTHORIZED` | 未授权 |
| `NOT_FOUND` | 资源不存在 |
| `INTERNAL_ERROR` | 内部错误 |

## 限流

HTTP API 默认启用速率限制：

- 每 IP：100 请求/分钟
- 超出限制返回 429 状态码

## 版本控制

API 版本通过 URL 路径指定：

```
/api/v1/chat/send
```

当前版本：v1
