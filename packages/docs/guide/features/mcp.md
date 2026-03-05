# MCP 服务器

Model Context Protocol (MCP) 是 Super Client R 的核心功能之一，允许你连接各种 AI 模型和工具。

## 什么是 MCP？

MCP（Model Context Protocol）是一个开放的协议标准，用于标准化 AI 模型与外部工具、数据源之间的通信。

```
┌─────────────┐      MCP       ┌─────────────┐
│   Super     │ ◄────────────► │   External  │
│   Client R  │   Protocol     │   Service   │
└─────────────┘                └─────────────┘
```

## 核心概念

### Server（服务器）

提供 AI 功能的外部服务，可以是：
- 本地运行的服务
- 远程 API
- 第三方 SaaS

### Tool（工具）

服务器提供的可调用功能，例如：
- 文件搜索
- 数据分析
- 代码执行

### Resource（资源）

服务器管理的上下文数据，例如：
- 文档集合
- 数据库
- 配置文件

## 添加 MCP 服务器

### 通过界面添加

1. 打开 **MCP** 页面
2. 点击 **添加服务器**
3. 填写配置信息：
   - 名称：服务器显示名称
   - 类型：stdio / sse / http
   - 命令/URL：启动命令或服务端点
   - 参数：可选的启动参数

### 配置示例

#### Stdio 类型

```json
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]
}
```

#### SSE 类型

```json
{
  "name": "remote-server",
  "type": "sse",
  "url": "https://api.example.com/mcp",
  "headers": {
    "Authorization": "Bearer token"
  }
}
```

#### HTTP 类型

```json
{
  "name": "http-server",
  "type": "http",
  "url": "http://localhost:3000/mcp",
  "timeout": 30000
}
```

## 使用 MCP 服务器

### 在聊天中使用

1. 切换到 **MCP** 聊天模式
2. 选择已连接的 MCP 服务器
3. 发送消息，AI 会自动调用可用工具

### 工具调用流程

```
User: 搜索项目中的 TODO 注释

AI: [调用 filesystem/search 工具]

     Input: {
       "pattern": "TODO|FIXME",
       "path": "/project"
     }

[显示工具调用状态]

AI: 找到以下 TODO 项：
    - src/main.ts:42: TODO: 优化性能
    - src/utils.ts:15: FIXME: 处理边界情况
```

## 内置 MCP 服务器

### Filesystem

文件系统访问服务器。

**功能：**
- 读取文件
- 写入文件
- 搜索文件
- 目录列表

**配置：**
```json
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"]
}
```

### Git

Git 操作服务器。

**功能：**
- 查看状态
- 提交更改
- 查看日志
- 分支管理

### SQLite

SQLite 数据库服务器。

**功能：**
- 执行查询
- 查看表结构
- 数据导出

## 开发自定义 MCP 服务器

### 基础结构

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'my-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
    resources: {},
  },
});

// 定义工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'my_tool',
        description: 'My custom tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'my_tool') {
    const { query } = request.params.arguments;
    return {
      content: [
        {
          type: 'text',
          text: `Result for: ${query}`,
        },
      ],
    };
  }
  throw new Error('Unknown tool');
});

// 启动服务器
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 发布到市场

1. 开发完成后，打包为 npm 包
2. 提交到 MCP 服务器市场
3. 用户可以通过名称直接安装

## 故障排除

### 连接失败

**症状**: 服务器状态显示 "disconnected"

**检查项：**
1. 命令是否正确安装
2. 参数是否正确
3. 端口是否被占用
4. 防火墙设置

### 工具调用超时

**解决方案：**
```json
{
  "timeout": 60000,
  "retries": 3
}
```

### 权限问题

**文件系统访问：**
- macOS: 授予"文件和文件夹"权限
- Windows: 以管理员身份运行

## 最佳实践

### 1. 安全性

- 仅连接可信的服务器
- 使用环境变量存储敏感信息
- 定期更新服务器版本

### 2. 性能

- 本地优先：优先使用本地服务器
- 连接池：复用长连接
- 缓存：缓存频繁访问的资源

### 3. 组织

- 按项目分组服务器
- 使用描述性命名
- 文档化自定义服务器

## 参考资源

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [服务器示例](https://github.com/modelcontextprotocol/servers)
