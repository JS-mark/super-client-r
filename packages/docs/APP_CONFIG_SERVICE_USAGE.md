# AppConfigService 使用指南

## 概述

`AppConfigService` 是应用初始化配置服务，负责从服务端获取应用配置，包括 OAuth、功能开关、公告等。

## 新增功能

### 1. 强制更新字段（forceUpdate）

服务端可以指定哪些字段必须强制更新，即使客户端有缓存也会被覆盖。

**服务端响应示例**：

```json
{
  "version": "1.0.1",
  "updatedAt": 1741305600000,
  "forceUpdate": {
    "fields": ["oauth.github.clientId", "oauth.github.tokenExchangeUrl"],
    "reason": "GitHub OAuth 配置更新"
  },
  "oauth": {
    "google": {
      "clientId": "new-google-client-id"
    },
    "github": {
      "clientId": "new-github-client-id",
      "tokenExchangeUrl": "https://app.nexo-ai.top/auth/github/token"
    }
  },
  "featureFlags": {},
  "announcements": [],
  "meta": {
    "links": {},
    "endpoints": {}
  }
}
```

**工作原理**：

1. 客户端获取服务端配置
2. 检查 `forceUpdate.fields` 字段
3. 如果存在强制更新字段，则：
   - 使用缓存配置作为基础
   - 将服务端指定的字段覆盖到缓存配置中
   - 保存合并后的配置
4. 如果没有强制更新字段，则：
   - 如果版本相同，使用缓存配置
   - 如果版本不同，使用服务端配置

**字段路径格式**：

使用点号分隔的路径，例如：
- `oauth.github.clientId` - 更新 GitHub OAuth client ID
- `oauth.google.clientId` - 更新 Google OAuth client ID
- `featureFlags.enableOAuth` - 更新功能开关

### 2. 定期检查更新

应用会每小时自动检查配置更新，无需手动刷新。

**配置参数**：

```typescript
// 定期检查间隔（1 小时）
const CHECK_INTERVAL = 60 * 60 * 1000;
```

**工作流程**：

1. 应用启动时初始化配置服务
2. 启动定期检查定时器
3. 每小时自动调用 `refresh()` 方法
4. 应用退出时清理定时器

**日志输出**：

```
[AppConfigService] Starting periodic check (interval: 60 minutes)
[AppConfigService] Periodic check triggered
[AppConfigService] Fetching config from server...
[AppConfigService] Fetched config successfully (version: 1.0.1)
[AppConfigService] Merging configs with force update fields: ["oauth.github.clientId"]
[AppConfigService] Force updated field: oauth.github.clientId
[AppConfigService] Refresh completed successfully
```

## API 使用

### 初始化配置服务

```typescript
import { appConfigService } from './services/config/AppConfigService';

// 应用启动时调用
await appConfigService.initialize();
```

### 获取当前配置

```typescript
const config = appConfigService.getConfig();

if (config) {
  console.log('OAuth config:', config.oauth);
  console.log('Feature flags:', config.featureFlags);
}
```

### 手动刷新配置

```typescript
const newConfig = await appConfigService.refresh();
```

### 停止定期检查

```typescript
// 应用退出时调用
appConfigService.stopPeriodicCheck();
```

## 配置合并策略

### 场景 1: 没有缓存或版本不同

**结果**: 直接使用服务端配置

```
[AppConfigService] Using server config (no cache or version mismatch)
```

### 场景 2: 有缓存且版本相同，但没有强制更新字段

**结果**: 使用缓存配置

```
[AppConfigService] Using cached config (no force update)
```

### 场景 3: 有缓存且版本相同，有强制更新字段

**结果**: 合并配置，强制更新指定字段

```
[AppConfigService] Merging configs with force update fields: ["oauth.github.clientId"]
[AppConfigService] Force update reason: GitHub OAuth 配置更新
[AppConfigService] Force updated field: oauth.github.clientId
```

## 降级策略

如果服务端不可用，应用会自动降级到本地缓存：

```typescript
try {
  // 尝试获取服务端配置
  const serverConfig = await this.fetchConfig();
  // ...
} catch (error) {
  logger.error("[AppConfigService] Failed to fetch server config", error);

  // 降级：使用本地缓存
  const cached = this.loadCachedConfig();
  if (cached) {
    logger.info("[AppConfigService] Using cached config as fallback");
    this.config = cached.config;
    this.applyConfig(cached.config);

    // 即使使用缓存，也启动定期检查
    this.startPeriodicCheck();
  }
}
```

## 缓存策略

- **缓存位置**: electron-store (`appInitConfigCache`)
- **缓存有效期**: 24 小时
- **缓存内容**: 完整的配置对象 + 缓存时间 + 版本号

```typescript
interface CachedConfig {
  config: AppInitConfig;
  cachedAt: number;
  version: string;
}
```

## 日志说明

所有日志都带有 `[AppConfigService]` 前缀，便于过滤和调试：

```
[AppConfigService] Initializing...
[AppConfigService] Fetching config from server...
[AppConfigService] Fetched config successfully (version: 1.0.1)
[AppConfigService] Loaded cached config (version: 1.0.0, age: 30 minutes)
[AppConfigService] Using server config (no cache or version mismatch)
[AppConfigService] Merging configs with force update fields: ["oauth.github.clientId"]
[AppConfigService] Force updated field: oauth.github.clientId
[AppConfigService] Applied Google OAuth client ID: xxx
[AppConfigService] Applied GitHub OAuth client ID: xxx
[AppConfigService] Applied GitHub token exchange URL: https://app.nexo-ai.top/auth/github/token
[AppConfigService] Config applied successfully
[AppConfigService] Initialized successfully
[AppConfigService] Starting periodic check (interval: 60 minutes)
[AppConfigService] Periodic check triggered
[AppConfigService] Manual refresh triggered
[AppConfigService] Refresh completed successfully
[AppConfigService] Periodic check stopped
```

## 测试

### 测试强制更新功能

1. 启动应用，等待配置加载
2. 修改服务端配置，添加 `forceUpdate` 字段
3. 等待定期检查触发（或手动调用 `refresh()`）
4. 查看日志，确认强制更新字段被应用

### 测试定期检查功能

1. 启动应用
2. 查看日志，确认定期检查已启动
3. 等待 1 小时，查看日志确认定期检查被触发
4. 或者修改 `CHECK_INTERVAL` 为较短时间（如 1 分钟）进行测试

### 测试降级策略

1. 断开网络连接
2. 启动应用
3. 查看日志，确认使用缓存配置
4. 恢复网络连接
5. 等待定期检查触发，确认配置更新

## 故障排查

### 配置没有更新

1. 检查服务端是否返回了新的配置
2. 检查 `version` 字段是否变化
3. 检查是否有 `forceUpdate` 字段
4. 查看日志，确认配置合并策略

### 定期检查没有触发

1. 检查日志，确认定期检查已启动
2. 检查 `CHECK_INTERVAL` 配置
3. 检查应用是否在后台运行

### 缓存没有生效

1. 检查 electron-store 是否正常工作
2. 检查缓存是否过期（24 小时）
3. 查看日志，确认缓存加载情况

## 未来扩展

### 支持更多配置字段

可以在 `AppInitConfig` 接口中添加更多字段：

```typescript
export interface AppInitConfig {
  version: string;
  updatedAt: number;
  forceUpdate?: {
    fields: string[];
    reason?: string;
  };
  oauth: { /* ... */ };
  featureFlags: Record<string, boolean>;
  announcements: Array<{ /* ... */ }>;
  meta: { /* ... */ };

  // 新增字段
  modelProviders?: ModelProviderPreset[];
  searchProviders?: SearchProviderPreset[];
  mcpMarketSources?: McpMarketSource[];
}
```

### 支持条件更新

可以根据应用版本、平台等条件决定是否应用更新：

```typescript
forceUpdate: {
  fields: ["oauth.github.clientId"],
  reason: "GitHub OAuth 配置更新",
  conditions: {
    minVersion: "1.0.0",
    platforms: ["darwin", "win32"]
  }
}
```

### 支持配置回滚

可以保存多个历史版本的配置，支持回滚：

```typescript
interface ConfigHistory {
  configs: Array<{
    version: string;
    config: AppInitConfig;
    appliedAt: number;
  }>;
}
```
