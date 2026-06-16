# Electron-tRPC 迁移方案

## 1. 现状分析

### 1.1 当前 IPC 架构

```
Renderer (React)
  └── services/ (17 files) ── window.electron.xxx()
        ↓
Preload (72.5 KB)
  └── contextBridge.exposeInMainWorld()
        ↓ ipcRenderer.invoke() / ipcRenderer.on()
Main Process
  └── ipc/handlers/ (22 files) ── ipcMain.handle() / webContents.send()
        ↓
  └── services/ (15+ services) ── 业务逻辑
```

**痛点**：每个功能需要修改 6 个文件（channel → type → handler → register → preload → service）

### 1.2 通信模式分类

| 模式 | 数量 | 示例 | tRPC 对应 |
|------|------|------|-----------|
| **Request/Response** | ~70% | CRUD、查询、配置 | `procedure.query()` / `.mutation()` |
| **Streaming（单向推送）** | ~20% | Agent stream、LLM chunk | `procedure.subscription()` |
| **Broadcasting（全窗口广播）** | ~10% | 主题变更、配置更新 | `subscription` + EventEmitter |

### 1.3 Handler 复杂度分层

| 复杂度 | Handler | 迁移难度 |
|--------|---------|----------|
| **简单 CRUD** | skill, file, search, window, auth, floatWidget, webhook, appConfig | 低 |
| **中等（CRUD + 事件）** | chat, network, log, imbot, remoteControl | 中 |
| **高（Streaming + 多 Provider）** | agent, agentSDK, model/llm, mcp, plugin, remoteDevice, remoteChat | 高 |

---

## 2. 目标架构

```
Renderer (React)
  └── trpc client (类型自动推导)
        ↓ IPC Link (electron-trpc)
Preload (极简，仅暴露 IPC 桥)
        ↓
Main Process
  └── trpc router (替代 handlers + channels + types)
        ↓
  └── services/ (不变)
```

### 2.1 关键变化

| 维度 | 现在 | 迁移后 |
|------|------|--------|
| **类型定义** | `shared-types/ipc.ts` + `channels.ts` + `types.ts` | tRPC router 自动推导 |
| **Handler** | 22 个文件 + 手动 try-catch | tRPC procedure + middleware |
| **Preload** | 72.5 KB，逐个暴露 API | < 1 KB，仅暴露 IPC transport |
| **Renderer Service** | 17 个文件，手动包装 | 直接 `trpc.xxx.query()` |
| **错误处理** | `{ success, data?, error? }` | tRPC Error + React Query |
| **输入验证** | 无 | Zod schema |
| **Streaming** | `webContents.send()` + `ipcRenderer.on()` | `subscription()` |

### 2.2 不迁移的部分

以下仍需原生 Electron IPC：

- **窗口控制**：minimize / maximize / close（需要 `BrowserWindow` API）
- **浮动窗口**：跨窗口通信
- **系统托盘**：Tray API
- **原生对话框**：dialog.showOpenDialog 等
- **应用更新**：autoUpdater

这些保留在一个精简的 `electron-native.ts` 中。

---

## 3. 技术选型

### 3.1 核心依赖

```json
{
  "dependencies": {
    "@trpc/server": "^11.x",
    "@trpc/client": "^11.x",
    "@trpc/react-query": "^11.x",
    "@tanstack/react-query": "^5.x",
    "electron-trpc": "^0.6.x",
    "zod": "^3.x"
  }
}
```

### 3.2 传输层：electron-trpc IPC Link

`electron-trpc` 提供了 Electron 专用的 IPC transport：

```typescript
// Main Process
import { createIPCHandler } from 'electron-trpc/main'

createIPCHandler({ router: appRouter, windows: [mainWindow] })

// Renderer (via Preload)
import { createTRPCProxyClient } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'

const trpc = createTRPCProxyClient<AppRouter>({
  links: [ipcLink()],
})
```

Preload 只需暴露 `electron-trpc` 的 IPC bridge（约 10 行代码）。

### 3.3 Streaming 方案

tRPC v11 支持 `subscription` + async generator：

```typescript
// Main
streamChat: procedure
  .input(z.object({ sessionId: z.string(), prompt: z.string() }))
  .subscription(async function* ({ input }) {
    const stream = agentSDKService.createStream(input)
    for await (const chunk of stream) {
      yield chunk
    }
  })

// Renderer
trpc.agentSDK.streamChat.subscribe(input, {
  onData: (chunk) => { /* handle chunk */ },
  onComplete: () => { /* done */ },
  onError: (err) => { /* error */ },
})
```

### 3.4 Broadcasting 方案

全窗口广播（主题变更、配置更新）通过 EventEmitter + subscription：

```typescript
// Main
const ee = new EventEmitter()

onThemeChange: procedure.subscription(async function* () {
  const queue: ThemeEvent[] = []
  let resolve: (() => void) | null = null

  const handler = (event: ThemeEvent) => {
    queue.push(event)
    resolve?.()
  }
  ee.on('theme-changed', handler)

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>(r => { resolve = r })
      }
      yield queue.shift()!
    }
  } finally {
    ee.off('theme-changed', handler)
  }
})
```

---

## 4. Router 结构设计

```typescript
// src/main/trpc/router.ts
export const appRouter = router({
  // Agent SDK
  agentSDK: agentSDKRouter,    // createQuery, stopQuery, sendPermission...

  // Core Features
  chat: chatRouter,            // conversations CRUD, messages CRUD
  skill: skillRouter,          // list, install, uninstall, execute
  mcp: mcpRouter,              // servers, market, builtin, tools
  llm: llmRouter,              // chatCompletion (streaming)
  model: modelRouter,          // providers CRUD, test, fetchModels

  // Configuration
  search: searchRouter,        // providers CRUD, execute
  network: networkRouter,      // proxy config, request log stream
  plugin: pluginRouter,        // list, install, permissions, themes
  webhook: webhookRouter,      // config CRUD, test

  // System
  app: appRouter,              // info, paths, openExternal, logs
  auth: authRouter,            // login, logout, getUser
  log: logRouter,              // query, export, stats
  appConfig: appConfigRouter,  // get, update, onChange

  // Advanced
  remote: remoteRouter,        // devices, execute, relay
  imbot: imbotRouter,          // config, start, stop
})

export type AppRouter = typeof appRouter
```

每个子 router 对应一个文件：

```
src/main/trpc/
├── trpc.ts                 # tRPC 实例 + middleware
├── router.ts               # 根 router（聚合）
└── routers/
    ├── agentSDK.ts
    ├── chat.ts
    ├── skill.ts
    ├── mcp.ts
    ├── llm.ts
    ├── model.ts
    ├── search.ts
    ├── network.ts
    ├── plugin.ts
    ├── webhook.ts
    ├── app.ts
    ├── auth.ts
    ├── log.ts
    ├── appConfig.ts
    ├── remote.ts
    └── imbot.ts
```

---

## 5. 迁移策略：渐进式双轨并行

### 核心原则

**不一刀切**。新旧两套 IPC 共存，逐模块迁移，每迁完一个模块验证后再删旧代码。

### 5.1 Phase 0：基础设施搭建（1-2 天）

**目标**：tRPC 基础设施就位，新旧共存。

- [ ] 安装依赖：`@trpc/server`, `@trpc/client`, `electron-trpc`, `zod`, `@tanstack/react-query`, `@trpc/react-query`
- [ ] 创建 `src/main/trpc/trpc.ts`（tRPC 实例 + 通用 middleware）
- [ ] 创建 `src/main/trpc/router.ts`（空 router 骨架）
- [ ] Main Process 集成：`createIPCHandler()` 在 `main.ts` 中注册
- [ ] Preload 添加 electron-trpc IPC bridge（与现有 API 共存）
- [ ] Renderer 创建 tRPC client + React Query Provider
- [ ] 写一个 smoke test procedure 验证端到端通信

**验证标准**：Renderer 能成功调用 `trpc.health.query()` 返回 `{ ok: true }`。

### 5.2 Phase 1：简单 CRUD 模块迁移（3-5 天）

**目标**：迁移所有简单 Request/Response 模块。

按顺序迁移（从低风险到高风险）：

| 序号 | 模块 | Channels 数 | 类型 | 迁移内容 |
|------|------|-------------|------|----------|
| 1 | appConfig | 3 | R/R | get, update, onChange |
| 2 | webhook | 4 | R/R | CRUD + test |
| 3 | auth | 3 | R/R | login, logout, getUser |
| 4 | search | 7 | R/R | provider CRUD + execute |
| 5 | file | 8 | R/R | select, read, save, attachments |
| 6 | skill | 8 | R/R | list, install, execute |
| 7 | log | 7 | R/R | query, export, stats |
| 8 | app/system | 15 | R/R | info, paths, theme, openExternal |

**每个模块迁移步骤**：
1. 在 `src/main/trpc/routers/xxx.ts` 创建 tRPC router
2. 添加 Zod input schema
3. 将现有 handler 逻辑复制到 procedure 中
4. 在 Renderer 中切换调用：`window.electron.xxx` → `trpc.xxx`
5. 验证功能正常
6. 删除旧 handler + channel + preload 暴露 + renderer service
7. 如果出问题，回退到旧 IPC（双轨安全网）

### 5.3 Phase 2：中等模块迁移（3-5 天）

**目标**：迁移带事件推送的模块。

| 序号 | 模块 | 难点 | 方案 |
|------|------|------|------|
| 1 | chat | 文件持久化 + 分页 | query + mutation |
| 2 | model | Provider CRUD + 连接测试 | query + mutation |
| 3 | network | 代理配置 + 请求日志流 | mutation + subscription |
| 4 | imbot | 多 Provider + 生命周期 | mutation + subscription |
| 5 | remoteControl | 事件追踪 | subscription |

### 5.4 Phase 3：复杂 Streaming 模块迁移（5-7 天）

**目标**：迁移核心 AI 功能。

| 序号 | 模块 | 难点 | 方案 |
|------|------|------|------|
| 1 | llm | 流式输出 + tool calling | subscription (async generator) |
| 2 | agentSDK | 多事件类型 + 权限交互 | subscription + mutation |
| 3 | mcp | 3 个子服务 + market | nested router |
| 4 | plugin | 复杂生命周期 + 权限 | nested router + middleware |
| 5 | remote | WebSocket + 命令流 | subscription |
| 6 | remoteChat | IM 消息中继 | subscription |

### 5.5 Phase 4：清理（1-2 天）

- [ ] 删除 `src/main/ipc/channels.ts`
- [ ] 删除 `src/main/ipc/types.ts`（IPC 相关类型移到 trpc router 内联或 Zod schema）
- [ ] 删除 `src/main/ipc/handlers/`（全部 22 个文件）
- [ ] 删除 `src/main/ipc/index.ts`
- [ ] 精简 `src/preload/index.ts`（从 72.5 KB → < 1 KB）
- [ ] 删除 `src/renderer/src/services/` 中的 IPC wrapper（保留非 IPC 服务）
- [ ] 清理 `shared-types` 中的 IPC 类型
- [ ] 更新 CLAUDE.md 中的 IPC 6 步法文档

---

## 6. 迁移点详细评估

### 6.1 按模块评估

#### appConfig（3 channels → 1 router，难度：⭐）

```typescript
// 现在
CHANNELS: GET_CONFIG, UPDATE_CONFIG, ON_CONFIG_CHANGE
Handler: appConfigHandler.ts
Preload: 3 methods
Service: appConfigService.ts

// 迁移后
export const appConfigRouter = router({
  get: procedure.query(async () => {
    return appConfigService.getConfig()
  }),
  update: procedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ input }) => {
      return appConfigService.update(input.key, input.value)
    }),
  onChange: procedure.subscription(async function* () {
    // EventEmitter → async generator
  }),
})
```

**影响文件**：5 个（handler + channel + preload + renderer service + 组件调用处）

---

#### agentSDK（18 channels → 1 router，难度：⭐⭐⭐⭐⭐）

最复杂的模块，涉及：
- 创建查询 + 流式事件（text, tool_use, permission_request, error, done）
- 权限交互（renderer 发 permission response → main 处理）
- 中止 / 暂停
- 配置管理

```typescript
export const agentSDKRouter = router({
  createQuery: procedure
    .input(agentSDKQuerySchema)
    .mutation(async ({ input }) => {
      return agentSDKService.createQuery(input)
    }),

  streamEvents: procedure
    .input(z.object({ queryId: z.string() }))
    .subscription(async function* ({ input }) {
      const stream = agentSDKService.getEventStream(input.queryId)
      for await (const event of stream) {
        yield event  // AgentSDKStreamEvent
      }
    }),

  sendPermissionResponse: procedure
    .input(z.object({ queryId: z.string(), allowed: z.boolean() }))
    .mutation(async ({ input }) => {
      return agentSDKService.respondPermission(input)
    }),

  stopQuery: procedure
    .input(z.object({ queryId: z.string() }))
    .mutation(async ({ input }) => {
      return agentSDKService.stop(input.queryId)
    }),

  // config
  getConfig: procedure.query(() => agentSDKService.getConfig()),
  updateConfig: procedure
    .input(agentSDKConfigSchema)
    .mutation(({ input }) => agentSDKService.updateConfig(input)),
})
```

**主要挑战**：
1. 多种事件类型的 subscription 需要 discriminated union
2. 权限交互是双向通信（renderer → main → renderer）
3. 并发查询的事件隔离

---

#### llm（4 channels → 1 router，难度：⭐⭐⭐⭐）

```typescript
export const llmRouter = router({
  chatCompletion: procedure
    .input(chatCompletionSchema)
    .subscription(async function* ({ input }) {
      const stream = await llmService.createStream(input)
      for await (const chunk of stream) {
        yield chunk  // ChatStreamEvent
      }
    }),

  stopGeneration: procedure
    .input(z.object({ requestId: z.string() }))
    .mutation(({ input }) => llmService.stop(input.requestId)),
})
```

**主要挑战**：Tool calling 的流式处理 + abort 控制。

---

#### mcp（7 channels → 1 nested router，难度：⭐⭐⭐⭐）

```typescript
export const mcpRouter = router({
  // 服务器管理
  listServers: procedure.query(() => mcpService.list()),
  addServer: procedure.input(mcpServerSchema).mutation(({ input }) => mcpService.add(input)),
  removeServer: procedure.input(z.object({ id: z.string() })).mutation(({ input }) => mcpService.remove(input.id)),

  // 工具
  listTools: procedure.input(z.object({ serverId: z.string() })).query(({ input }) => mcpService.listTools(input.serverId)),

  // Market
  market: router({
    list: procedure.query(() => mcpMarketService.list()),
    install: procedure.input(z.object({ id: z.string() })).mutation(({ input }) => mcpMarketService.install(input.id)),
  }),

  // Builtin
  builtin: router({
    list: procedure.query(() => mcpBuiltinService.list()),
  }),
})
```

**主要挑战**：3 个子服务的整合 + 连接状态管理。

---

### 6.2 全局迁移点

#### A. 错误处理模式变更

```typescript
// 现在：每个 handler 手动 try-catch
ipcMain.handle(channel, async (event, request) => {
  try {
    const result = await service.action(request.payload)
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 迁移后：tRPC middleware 统一处理
const errorMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    })
  }
})
```

**影响**：Renderer 所有错误处理逻辑需要从 `if (!result.success)` 改为 `try-catch` 或 React Query 的 `error` 状态。

#### B. Renderer 调用方式变更

```typescript
// 现在
const result = await window.electron.skill.list()
if (result.success) {
  setSkills(result.data)
}

// 迁移后（直接调用）
const skills = await trpc.skill.list.query()
setSkills(skills)

// 或者用 React Query hook
const { data: skills, isLoading } = trpc.skill.list.useQuery()
```

**影响**：所有调用 `window.electron.*` 的组件都需要修改。

#### C. 事件监听模式变更

```typescript
// 现在：useEffect + cleanup
useEffect(() => {
  const unsub = window.electron.network.onRequestLogEntry((entry) => {
    addEntry(entry)
  })
  return unsub
}, [])

// 迁移后：tRPC subscription
trpc.network.onRequestLog.subscribe(undefined, {
  onData: (entry) => addEntry(entry),
})
// 或封装成 hook
```

**影响**：所有 `on*` 监听器需要改为 subscription。

#### D. Preload 脚本重构

```typescript
// 现在：72.5 KB，逐个暴露 200+ 方法
contextBridge.exposeInMainWorld('electron', {
  agent: { ... },
  skill: { ... },
  mcp: { ... },
  // ...26 个 namespace
})

// 迁移后：仅暴露 electron-trpc bridge + 少量原生 API
import { exposeElectronTRPC } from 'electron-trpc/main'
exposeElectronTRPC()

contextBridge.exposeInMainWorld('electronNative', {
  window: { minimize, maximize, close, isMaximized, onMaximizeChange },
  dialog: { showOpen, showSave },
  shell: { openExternal },
  app: { getVersion },
})
```

---

## 7. 工作量估算

| Phase | 模块数 | 预估天数 | 说明 |
|-------|--------|----------|------|
| Phase 0 基础设施 | - | 1-2 | tRPC + electron-trpc 集成 |
| Phase 1 简单 CRUD | 8 | 3-5 | 低风险，快速推进 |
| Phase 2 中等模块 | 5 | 3-5 | 带事件推送 |
| Phase 3 复杂 Streaming | 6 | 5-7 | 核心 AI 功能 |
| Phase 4 清理 | - | 1-2 | 删旧代码、更新文档 |
| **合计** | **19 模块** | **13-21 天** | |

### 影响文件统计

| 类别 | 文件数 | 操作 |
|------|--------|------|
| 新建 tRPC routers | ~16 | 新建 |
| 新建基础设施 | ~4 | trpc.ts, router.ts, client, provider |
| 删除 IPC handlers | 22 | 删除 |
| 删除/精简 channels.ts | 1 | 删除 |
| 删除/精简 types.ts | 1 | 部分保留 |
| 重写 preload/index.ts | 1 | 从 72.5 KB → < 1 KB |
| 删除 renderer services | ~15 | 删除 |
| 修改 React 组件（调用处） | ~50-80 | 修改调用方式 |
| 修改 Zustand stores | ~10 | 修改数据获取方式 |
| **合计** | **~120-150 文件** | |

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| electron-trpc subscription 不稳定 | 中 | 高 | Phase 0 先验证 streaming 可行性 |
| 迁移过程中功能回归 | 中 | 中 | 双轨并行，逐模块迁移 + 测试 |
| React Query 缓存与 Zustand 冲突 | 低 | 中 | 明确划分：服务端状态用 RQ，客户端状态用 Zustand |
| Electron 版本升级导致 electron-trpc 不兼容 | 低 | 高 | 锁定 electron-trpc 版本，关注上游 |
| 性能回归（tRPC overhead） | 低 | 低 | IPC Link 开销可忽略 |

---

## 9. 决策点（需用户确认）

1. **React Query 引入**：是否接受用 `@trpc/react-query` 替代部分 Zustand 的服务端状态？
   - 方案 A：全面使用 React Query（推荐，减少手动状态同步）
   - 方案 B：仅用 vanilla tRPC client，保留 Zustand（改动更小）

2. **迁移节奏**：
   - 方案 A：全量迁移（13-21 天集中完成）
   - 方案 B：按需迁移（只迁高频修改的模块，旧模块保留）

3. **Zod Schema 复用**：
   - 方案 A：Schema 定义在 tRPC router 文件内（简单）
   - 方案 B：Schema 抽到 `shared-types` 包（跨进程复用）

4. **保留哪些原生 IPC**：
   - 窗口控制、对话框、shell、autoUpdater — 这些保留原生 IPC 是否 OK？
