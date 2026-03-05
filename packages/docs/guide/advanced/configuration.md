# 配置

Super Client R 提供灵活的配置系统，支持通过界面、配置文件和环境变量进行配置。

## 配置方式

### 1. 设置界面

最常用的配置方式，通过图形界面修改：

```
设置 → 通用 / 模型 / MCP / HTTP API
```

### 2. 配置文件

配置文件位于：

- **macOS**: `~/Library/Application Support/super-client-r/config.json`
- **Windows**: `%APPDATA%\super-client-r\config.json`
- **Linux**: `~/.config/super-client-r/config.json`

### 3. 环境变量

开发时可以使用 `.env` 文件：

```bash
ANTHROPIC_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
```

## 配置项

### 通用设置

```json
{
  "general": {
    "language": "zh-CN",
    "theme": "system",
    "fontSize": "medium",
    "autoStart": false,
    "minimizeToTray": true,
    "closeToTray": false
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `language` | string | "zh-CN" | 界面语言 |
| `theme` | string | "system" | 主题：light/dark/system |
| `fontSize` | string | "medium" | 字体大小：small/medium/large |
| `autoStart` | boolean | false | 开机自动启动 |
| `minimizeToTray` | boolean | true | 最小化到托盘 |
| `closeToTray` | boolean | false | 关闭到托盘 |

### 模型配置

```json
{
  "models": [
    {
      "id": "claude-3-5-sonnet",
      "name": "Claude 3.5 Sonnet",
      "provider": "anthropic",
      "enabled": true,
      "config": {
        "apiKey": "sk-ant-...",
        "baseUrl": "https://api.anthropic.com",
        "temperature": 0.7,
        "maxTokens": 4096
      }
    }
  ]
}
```

### 聊天设置

```json
{
  "chat": {
    "defaultMode": "direct",
    "saveHistory": true,
    "historyLimit": 100,
    "enableMarkdown": true,
    "enableCodeHighlight": true,
    "streamingEnabled": true
  }
}
```

### MCP 配置

```json
{
  "mcp": {
    "servers": [
      {
        "id": "filesystem",
        "name": "File System",
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem"],
        "enabled": true
      }
    ],
    "autoConnect": true,
    "timeout": 30000
  }
}
```

### HTTP API 配置

```json
{
  "httpApi": {
    "enabled": true,
    "port": 3000,
    "host": "127.0.0.1",
    "cors": {
      "enabled": true,
      "origins": ["*"]
    },
    "auth": {
      "enabled": false,
      "token": ""
    },
    "rateLimit": {
      "enabled": true,
      "maxRequests": 100,
      "windowMs": 60000
    }
  }
}
```

### 快捷键配置

```json
{
  "shortcuts": {
    "newChat": "Cmd+N",
    "sendMessage": "Enter",
    "newLine": "Shift+Enter",
    "clearChat": "Cmd+L",
    "focusInput": "Cmd+/",
    "toggleSidebar": "Cmd+B",
    "openSettings": "Cmd+,",
    "quit": "Cmd+Q"
  }
}
```

## 配置文件示例

### 完整配置

```json
{
  "version": "0.0.1",
  "general": {
    "language": "zh-CN",
    "theme": "system",
    "fontSize": "medium",
    "autoStart": false,
    "minimizeToTray": true,
    "closeToTray": false
  },
  "models": [
    {
      "id": "claude-3-5-sonnet",
      "name": "Claude 3.5 Sonnet",
      "provider": "anthropic",
      "enabled": true,
      "config": {
        "apiKey": "",
        "temperature": 0.7,
        "maxTokens": 4096
      }
    }
  ],
  "chat": {
    "defaultMode": "direct",
    "saveHistory": true,
    "historyLimit": 100,
    "enableMarkdown": true,
    "enableCodeHighlight": true,
    "streamingEnabled": true
  },
  "mcp": {
    "servers": [],
    "autoConnect": true,
    "timeout": 30000
  },
  "httpApi": {
    "enabled": true,
    "port": 3000,
    "cors": {
      "enabled": true,
      "origins": ["*"]
    },
    "auth": {
      "enabled": false
    }
  },
  "shortcuts": {
    "newChat": "Cmd+N",
    "sendMessage": "Enter",
    "clearChat": "Cmd+L"
  }
}
```

## 环境变量

### 开发环境

创建 `.env` 文件：

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-api03-xxx
OPENAI_API_KEY=sk-xxx

# Development
NODE_ENV=development
VITE_DEV_SERVER_PORT=5173
LOG_LEVEL=debug

# HTTP API
HTTP_API_PORT=3000
HTTP_API_TOKEN=your-secret-token

# MCP
MCP_DEFAULT_TIMEOUT=30000
```

### 生产环境

```bash
NODE_ENV=production
LOG_LEVEL=info
```

## 配置热重载

部分配置支持热重载，无需重启应用：

- ✅ 主题设置
- ✅ 字体大小
- ✅ 语言设置
- ✅ HTTP API 端口（需重启服务）
- ❌ 模型配置（需重新连接）

## 配置备份与恢复

### 手动备份

```bash
# macOS
cp ~/Library/Application\ Support/super-client-r/config.json ~/Desktop/config-backup.json

# Windows
copy %APPDATA%\super-client-r\config.json %USERPROFILE%\Desktop\config-backup.json

# Linux
cp ~/.config/super-client-r/config.json ~/config-backup.json
```

### 恢复配置

```bash
# macOS
cp ~/Desktop/config-backup.json ~/Library/Application\ Support/super-client-r/config.json

# 重启应用生效
```

## 故障排除

### 配置丢失

1. 检查配置文件权限
2. 验证 JSON 格式
3. 查看日志文件

### 配置不生效

1. 确认配置项名称正确
2. 检查配置层级
3. 重启应用

### 恢复默认配置

```bash
# 删除配置文件，应用会重新创建默认配置
rm ~/Library/Application\ Support/super-client-r/config.json
```

## 高级配置

### 自定义 CSS

```json
{
  "appearance": {
    "customCSS": "
      .chat-message {
        font-family: 'Fira Code', monospace;
      }
    "
  }
}
```

### 代理设置

```json
{
  "network": {
    "proxy": {
      "enabled": true,
      "protocol": "http",
      "host": "127.0.0.1",
      "port": 7890,
      "auth": {
        "enabled": false,
        "username": "",
        "password": ""
      }
    }
  }
}
```

### 日志配置

```json
{
  "logging": {
    "level": "info",
    "maxFiles": 5,
    "maxSize": "10m",
    "console": false
  }
}
```
