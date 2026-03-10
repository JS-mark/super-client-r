# 应用初始化配置下发方案

本文档定义通过服务端接口下发的应用初始化配置，解决敏感信息（如 OAuth 密钥）硬编码和配置难以动态更新的问题。

## 设计目标

1. **安全性** - OAuth client_secret 等敏感信息不在客户端存储
2. **可维护性** - 配置变更无需发版，服务端即时生效
3. **灵活性** - 支持功能开关、公告通知、A/B 测试等运营能力
4. **离线兼容** - 客户端缓存配置，离线时使用本地缓存

---

## API 设计

### 接口地址

```
GET https://api.nexo-ai.top/v1/app/init-config
```

### 请求头

```http
X-App-Version: 1.0.0
X-Platform: darwin | win32 | linux
X-Locale: zh-CN | en-US
```

### 响应结构

```typescript
interface AppInitConfig {
  version: string;              // 配置版本号，用于缓存校验
  updatedAt: number;            // 配置更新时间戳

  // OAuth 配置
  oauth: OAuthConfig;

  // 模型提供商预设列表
  modelProviders: ModelProviderPreset[];

  // 搜索提供商预设列表
  searchProviders: SearchProviderPreset[];

  // MCP 市场源列表
  mcpMarketSources: McpMarketSource[];

  // 功能开关
  featureFlags: FeatureFlags;

  // 公告通知
  announcements: Announcement[];

  // 应用更新配置
  update: UpdateConfig;

  // 其他元数据
  meta: AppMeta;
}
```

---

## 配置分类详解

### 1. OAuth 配置 (oauth)

**解决问题**: GitHub OAuth 需要 client_secret，直接存储在客户端有泄露风险。

**方案**: 客户端只获取 client_id，token exchange 通过代理服务完成。

```typescript
interface OAuthConfig {
  google: {
    clientId: string;
    // 无需 secret，使用 PKCE 流程
  };
  github: {
    clientId: string;
    // secret 不下发，token exchange 走代理
    tokenExchangeUrl: string;  // 代理服务地址
  };
  // 未来扩展
  apple?: {
    clientId: string;
    tokenExchangeUrl: string;
  };
}
```

**示例**:

```json
{
  "oauth": {
    "google": {
      "clientId": "123456789.apps.googleusercontent.com"
    },
    "github": {
      "clientId": "Iv1.abc123def456",
      "tokenExchangeUrl": "https://api.nexo-ai.top/v1/auth/github/token"
    }
  }
}
```

---

### 2. 模型提供商预设 (modelProviders)

**解决问题**: 当前 `ModelProviders.ts` 硬编码了 20+ 个提供商的 API 地址，新增/修改需要发版。

**当前硬编码位置**: `src/renderer/src/components/models/ModelProviders.ts`

```typescript
interface ModelProviderPreset {
  id: string;                  // 唯一标识: deepseek, openai, anthropic...
  name: string;                // 英文名称
  nameZh: string;              // 中文名称
  defaultBaseUrl: string;      // 默认 API 地址
  requiresApiKey: boolean;     // 是否需要 API Key
  helpUrl?: string;            // 帮助文档链接
  enabled: boolean;            // 是否启用（可动态禁用故障提供商）
  priority?: number;           // 排序优先级
  tags?: string[];             // 标签: ["recommended", "free-tier", "chinese"]
}
```

**示例**:

```json
{
  "modelProviders": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "nameZh": "DeepSeek",
      "defaultBaseUrl": "https://api.deepseek.com/v1",
      "requiresApiKey": true,
      "helpUrl": "https://platform.deepseek.com/",
      "enabled": true,
      "priority": 1,
      "tags": ["recommended", "chinese"]
    },
    {
      "id": "openai",
      "name": "OpenAI",
      "nameZh": "OpenAI",
      "defaultBaseUrl": "https://api.openai.com/v1",
      "requiresApiKey": true,
      "helpUrl": "https://platform.openai.com/api-keys",
      "enabled": true,
      "priority": 2
    }
  ]
}
```

---

### 3. 搜索提供商预设 (searchProviders)

**解决问题**: 搜索 API 地址硬编码在 `SearchService.ts` 和 `SearchProviders.ts`。

**当前硬编码位置**:

- `src/main/services/search/SearchService.ts`
- `src/renderer/src/components/settings/SearchProviders.ts`

```typescript
interface SearchProviderPreset {
  id: string;                  // zhipu, tavily, exa, google, bing...
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  icon: string;
  apiUrl?: string;             // API 地址（部分需要）
  requiresApiKey: boolean;
  requiresApiUrl: boolean;
  helpUrl?: string;
  enabled: boolean;
}
```

**示例**:

```json
{
  "searchProviders": [
    {
      "id": "tavily",
      "name": "Tavily",
      "nameZh": "Tavily",
      "description": "Tavily AI Search Engine",
      "descriptionZh": "Tavily AI 搜索引擎",
      "icon": "🔍",
      "apiUrl": "https://api.tavily.com/search",
      "requiresApiKey": true,
      "requiresApiUrl": false,
      "helpUrl": "https://tavily.com/",
      "enabled": true
    }
  ]
}
```

---

### 4. MCP 市场源 (mcpMarketSources)

**解决问题**: MCP 市场源列表硬编码在 `McpMarketSources.ts`。

**当前硬编码位置**: `src/renderer/src/components/mcp/McpMarketSources.ts`

```typescript
interface McpMarketSource {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  url: string;
  official?: boolean;
  enabled: boolean;
}
```

**示例**:

```json
{
  "mcpMarketSources": [
    {
      "id": "official",
      "name": "MCP Official",
      "nameZh": "MCP 官方",
      "description": "Official MCP server registry by Anthropic",
      "descriptionZh": "Anthropic 官方 MCP 服务注册中心",
      "url": "https://github.com/modelcontextprotocol/servers",
      "official": true,
      "enabled": true
    },
    {
      "id": "bailian",
      "name": "Alibaba Cloud Bailian",
      "nameZh": "阿里云百炼",
      "description": "Alibaba Cloud Bailian MCP marketplace",
      "descriptionZh": "阿里云百炼 MCP 服务市场",
      "url": "https://bailian.console.aliyun.com/",
      "enabled": true
    }
  ]
}
```

---

### 5. 功能开关 (featureFlags)

**解决问题**: 动态控制功能启用/禁用，支持灰度发布和紧急下线。

```typescript
interface FeatureFlags {
  // 核心功能开关
  enableOAuth: boolean;              // OAuth 登录功能
  enableFloatWidget: boolean;        // 悬浮窗功能
  enableIMBot: boolean;              // IM Bot 功能
  enableRemoteDevice: boolean;       // 远程设备功能
  enableMcpMarket: boolean;          // MCP 市场
  enableSkillMarket: boolean;        // Skill 市场
  enablePlugins: boolean;            // 插件系统

  // 实验性功能
  enableImageGeneration: boolean;    // AI 图片生成
  enableVoiceInput: boolean;         // 语音输入
  enableWebSearch: boolean;          // 网页搜索

  // 调试功能
  enableDebugTools: boolean;         // 调试工具
  enableDevMode: boolean;            // 开发者模式

  // 自定义开关 (用于 A/B 测试等)
  custom?: Record<string, boolean>;
}
```

**示例**:

```json
{
  "featureFlags": {
    "enableOAuth": true,
    "enableFloatWidget": true,
    "enableIMBot": true,
    "enableRemoteDevice": true,
    "enableMcpMarket": true,
    "enableSkillMarket": true,
    "enablePlugins": true,
    "enableImageGeneration": true,
    "enableVoiceInput": false,
    "enableWebSearch": true,
    "enableDebugTools": false,
    "enableDevMode": false,
    "custom": {
      "newChatUI": false,
      "betaModelSelector": true
    }
  }
}
```

---

### 6. 公告通知 (announcements)

**解决问题**: 应用内公告、维护通知、新功能介绍等运营需求。

```typescript
interface Announcement {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'maintenance';
  title: string;
  titleZh: string;
  content: string;
  contentZh: string;
  link?: string;                     // 详情链接
  linkText?: string;
  dismissible: boolean;              // 是否可关闭
  startAt: number;                   // 开始展示时间
  endAt: number;                     // 结束展示时间
  targetVersions?: string[];         // 目标版本范围 [">=1.0.0", "<2.0.0"]
  targetPlatforms?: string[];        // 目标平台 ["darwin", "win32"]
  priority: number;                  // 优先级，数字越大越靠前
}
```

**示例**:

```json
{
  "announcements": [
    {
      "id": "maintenance-20260310",
      "type": "maintenance",
      "title": "Scheduled Maintenance",
      "titleZh": "计划维护通知",
      "content": "We will perform system maintenance on March 10, 2026 from 2:00 AM to 4:00 AM UTC.",
      "contentZh": "我们将于 2026 年 3 月 10 日凌晨 2:00 至 4:00 (UTC) 进行系统维护。",
      "dismissible": true,
      "startAt": 1741564800000,
      "endAt": 1741651200000,
      "priority": 100
    },
    {
      "id": "new-feature-mcp",
      "type": "info",
      "title": "New: MCP Marketplace",
      "titleZh": "新功能：MCP 市场",
      "content": "Discover and install MCP servers from our new marketplace!",
      "contentZh": "从全新的 MCP 市场发现和安装 MCP 服务！",
      "link": "https://docs.nexo-ai.top/mcp-market",
      "linkText": "Learn more",
      "dismissible": true,
      "startAt": 1740000000000,
      "endAt": 1742592000000,
      "targetVersions": [">=1.2.0"],
      "priority": 50
    }
  ]
}
```

---

### 7. 应用更新配置 (update)

**解决问题**: 动态配置更新服务器、强制更新版本等。

```typescript
interface UpdateConfig {
  // 更新服务器地址（支持多个备用）
  servers: string[];

  // 强制更新的最低版本（低于此版本必须更新）
  minRequiredVersion: string;

  // 最新稳定版本
  latestStableVersion: string;

  // 更新频道
  channels: {
    stable: string;   // 稳定版 feed URL
    beta?: string;    // 测试版 feed URL
  };

  // 更新检查间隔（毫秒）
  checkInterval: number;

  // 是否允许自动下载
  autoDownload: boolean;
}
```

**示例**:

```json
{
  "update": {
    "servers": [
      "https://releases.nexo-ai.top",
      "https://github.com/js-mark/super-client-r/releases"
    ],
    "minRequiredVersion": "1.0.0",
    "latestStableVersion": "1.3.2",
    "channels": {
      "stable": "https://releases.nexo-ai.top/stable/latest.yml",
      "beta": "https://releases.nexo-ai.top/beta/latest.yml"
    },
    "checkInterval": 3600000,
    "autoDownload": false
  }
}
```

---

### 8. 应用元数据 (meta)

**解决问题**: 链接、联系方式等易变信息集中管理。

```typescript
interface AppMeta {
  // 官方链接
  links: {
    homepage: string;
    docs: string;
    changelog: string;
    feedback: string;
    github: string;
    discord?: string;
    twitter?: string;
  };

  // 支持信息
  support: {
    email: string;
    qq?: string;
  };

  // 服务端点
  endpoints: {
    api: string;
    skillsMarket: string;
    telemetry?: string;
  };

  // 法律文档
  legal: {
    terms: string;
    privacy: string;
  };
}
```

**示例**:

```json
{
  "meta": {
    "links": {
      "homepage": "https://nexo-ai.top",
      "docs": "https://docs.nexo-ai.top",
      "changelog": "https://github.com/js-mark/super-client-r/releases",
      "feedback": "https://github.com/js-mark/super-client-r/issues",
      "github": "https://github.com/js-mark/super-client-r",
      "discord": "https://discord.gg/nexo-ai"
    },
    "support": {
      "email": "support@nexo-ai.top"
    },
    "endpoints": {
      "api": "https://api.nexo-ai.top",
      "skillsMarket": "https://skillsmp.com/api/v1"
    },
    "legal": {
      "terms": "https://nexo-ai.top/terms",
      "privacy": "https://nexo-ai.top/privacy"
    }
  }
}
```

---

## 客户端实现建议

### 1. 配置加载流程

```
应用启动
    │
    ▼
读取本地缓存配置
    │
    ▼
使用缓存配置初始化 UI
    │
    ▼
后台请求远程配置 ──┬── 成功 → 更新缓存 → 通知 UI 更新
                   │
                   └── 失败 → 继续使用缓存（离线模式）
```

### 2. 缓存策略

```typescript
interface CachedConfig {
  config: AppInitConfig;
  cachedAt: number;
  expiresAt: number;  // 建议 24 小时
}

// 缓存存储位置
// electron-store: config-cache
```

### 3. 配置更新时机

- 应用启动时
- 应用从后台恢复到前台
- 每隔 1 小时自动检查（可配置）
- 用户手动刷新设置页

### 4. 兼容性处理

```typescript
// 配置合并策略：远程配置优先，本地硬编码作为 fallback
function mergeConfig(remote: Partial<AppInitConfig>, local: AppInitConfig): AppInitConfig {
  return {
    ...local,
    ...remote,
    modelProviders: remote.modelProviders ?? local.modelProviders,
    searchProviders: remote.searchProviders ?? local.searchProviders,
    // ...
  };
}
```

---

## 完整响应示例

```json
{
  "version": "1.0.0",
  "updatedAt": 1741305600000,

  "oauth": {
    "google": {
      "clientId": "123456789.apps.googleusercontent.com"
    },
    "github": {
      "clientId": "Iv1.abc123def456",
      "tokenExchangeUrl": "https://api.nexo-ai.top/v1/auth/github/token"
    }
  },

  "modelProviders": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "nameZh": "DeepSeek",
      "defaultBaseUrl": "https://api.deepseek.com/v1",
      "requiresApiKey": true,
      "helpUrl": "https://platform.deepseek.com/",
      "enabled": true,
      "priority": 1,
      "tags": ["recommended", "chinese"]
    }
  ],

  "searchProviders": [
    {
      "id": "tavily",
      "name": "Tavily",
      "nameZh": "Tavily",
      "apiUrl": "https://api.tavily.com/search",
      "requiresApiKey": true,
      "enabled": true
    }
  ],

  "mcpMarketSources": [
    {
      "id": "official",
      "name": "MCP Official",
      "nameZh": "MCP 官方",
      "url": "https://github.com/modelcontextprotocol/servers",
      "official": true,
      "enabled": true
    }
  ],

  "featureFlags": {
    "enableOAuth": true,
    "enableFloatWidget": true,
    "enableIMBot": true,
    "enableMcpMarket": true,
    "enablePlugins": true,
    "enableDebugTools": false
  },

  "announcements": [],

  "update": {
    "servers": ["https://releases.nexo-ai.top"],
    "minRequiredVersion": "1.0.0",
    "latestStableVersion": "1.3.2",
    "checkInterval": 3600000,
    "autoDownload": false
  },

  "meta": {
    "links": {
      "homepage": "https://nexo-ai.top",
      "docs": "https://docs.nexo-ai.top",
      "github": "https://github.com/js-mark/super-client-r"
    },
    "endpoints": {
      "api": "https://api.nexo-ai.top",
      "skillsMarket": "https://skillsmp.com/api/v1"
    }
  }
}
```

---

## 安全考虑

| 配置项              | 敏感级别 | 处理方式                    |
|---------------------|----------|-----------------------------|
| OAuth client_id     | 低       | 可公开下发                  |
| OAuth client_secret | **高**   | **不下发**，通过代理服务处理 |
| API endpoints       | 低       | 可公开下发                  |
| Feature flags       | 中       | 可下发，但不影响核心安全     |
| 用户 API keys       | **高**   | 仅存储在客户端本地          |

---

## 实现状态

### 已完成 ✅

#### 服务端 (node-auth)

| 文件 | 说明 |
|------|------|
| `src/types/app-config.ts` | 完整的 TypeScript 类型定义 |
| `src/services/app-config.ts` | 配置数据（24 个模型提供商、8 个搜索提供商、6 个 MCP 市场源） |
| `src/routes/app-config.ts` | 配置下发 API 路由 |
| `src/routes/auth.ts` | OAuth token exchange 代理接口 |

**API 端点：**

```
GET  /v1/app/init-config   # 获取应用初始化配置
GET  /v1/app/health        # 配置服务健康检查
POST /auth/github/token    # GitHub token exchange 代理
POST /auth/google/token    # Google token exchange 代理
```

#### 客户端 (super-client-r)

| 文件 | 说明 |
|------|------|
| `src/main/services/config/AppConfigService.ts` | 配置加载服务（本地缓存 + 远程获取） |
| `src/main/services/auth/AuthService.ts` | OAuth 服务（已移除 client_secret） |
| `src/main/main.ts` | 启动时初始化配置服务 |

**关键改动：**

1. **GitHub OAuth 安全改造**
   - 移除 `githubClientSecret` 存储
   - Token exchange 改为通过服务端代理
   - 新增 `setTokenExchangeUrl()` 动态配置

2. **配置加载流程**
   - 启动时先加载本地缓存（24 小时有效）
   - 后台异步获取最新配置
   - 自动应用 OAuth client_id 和 token exchange URL

---

## 部署说明

### 服务端部署 (node-auth)

1. 配置环境变量：

```bash
# .env
PORT=3001

# API Base URL（用于生成 tokenExchangeUrl，生产环境填写实际域名）
API_BASE_URL=https://api.nexo-ai.top

# OAuth credentials (存储在服务端，不下发)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

2. 构建和启动：

```bash
cd node-auth
pnpm install
pnpm build
pnpm start
```

3. 验证接口：

```bash
# 验证配置下发
curl https://api.nexo-ai.top/v1/app/init-config | jq '.oauth'

# 预期输出
{
  "google": { "clientId": "xxx.apps.googleusercontent.com" },
  "github": {
    "clientId": "Ov23lixxx",
    "tokenExchangeUrl": "https://api.nexo-ai.top/auth/github/token"
  }
}
```

### 客户端配置 (super-client-r)

1. 配置环境变量：

```bash
# .env
# App Config API 基础地址（用于获取初始化配置）
# 开发环境可指向本地: http://localhost:3001
# 生产环境: https://api.nexo-ai.top
MAIN_VITE_CONFIG_API_BASE_URL=https://api.nexo-ai.top
```

2. 环境变量说明：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MAIN_VITE_CONFIG_API_BASE_URL` | 配置 API 基础地址 | `https://api.nexo-ai.top` |

3. 工作流程：

```
┌──────────────────────────────────────────────────────────────┐
│                      应用启动                                 │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  AppConfigService.initialize()                               │
│  1. 加载本地缓存配置                                          │
│  2. 应用缓存配置（OAuth client_id, tokenExchangeUrl）         │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼ (后台异步)
┌──────────────────────────────────────────────────────────────┐
│  GET ${MAIN_VITE_CONFIG_API_BASE_URL}/v1/app/init-config     │
│  Headers:                                                     │
│    X-App-Version: 1.0.0                                       │
│    X-Platform: darwin                                         │
│    X-Locale: zh-CN                                            │
└──────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              成功获取配置          获取失败
                    │                   │
                    ▼                   ▼
              更新本地缓存         继续使用缓存
              应用新配置           （离线模式）
```

4. 关键文件：

| 文件 | 说明 |
|------|------|
| `src/main/env.d.ts` | 主进程环境变量类型声明 |
| `src/main/services/config/AppConfigService.ts` | 配置加载服务 |
| `src/main/services/auth/AuthService.ts` | OAuth 服务（使用代理） |
| `.env` / `.env.example` | 环境变量配置 |

---

## 迁移计划

### Phase 1: OAuth 安全改造 ✅ 已完成

- [x] 部署 GitHub token exchange 代理服务
- [x] 服务端配置 OAuth client credentials
- [x] 客户端移除 client_secret 存储

### Phase 2: 配置下发基础设施 ✅ 已完成

- [x] 实现 `/v1/app/init-config` 接口
- [x] 客户端实现配置加载和缓存
- [x] 保留本地硬编码作为 fallback

### Phase 3: 配置迁移（待实施）

- [ ] 客户端 modelProviders 使用远程配置
- [ ] 客户端 searchProviders 使用远程配置
- [ ] 客户端 mcpMarketSources 使用远程配置

### Phase 4: 运营能力（待实施）

- [ ] 实现 featureFlags 控制逻辑
- [ ] 实现 announcements 展示组件
- [ ] 管理后台开发
