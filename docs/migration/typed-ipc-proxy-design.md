# 方案 B：Typed IPC Proxy 详细设计

## 1. 设计思路

### 核心观察

当前项目的 `window.electron` API 表面已经设计得很好：
- **RPC 方法**：`window.electron.skill.list()` → `ipcRenderer.invoke`
- **事件监听**：`window.electron.agentSDK.onStreamEvent(cb)` → `ipcRenderer.on`

区分规则：**方法名以 `on` 开头 + 参数是 callback → 事件监听，其余 → RPC 调用。**

### 设计目标

```
现在：6 个文件 × 每个功能
       channels.ts → types.ts → handler.ts → ipc/index.ts → preload.ts → service.ts

目标：2 个文件 × 每个功能
       contract.ts（类型契约）→ impl.ts（实现）
       其余全部自动生成
```

### 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  shared-types/electron-api.ts                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  ElectronAPI  (单一类型契约，定义全部 API 表面)    │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────┬───────────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌────────▼─────────┐
    │  Main Process       │  │  Renderer        │
    │  registerAPI(impl)  │  │  window.electron │
    │  (自动注册 handler) │  │  (自动类型推导)   │
    └──────────┬──────────┘  └────────▲─────────┘
               │                      │
    ┌──────────▼──────────────────────┤
    │  Preload                        │
    │  createBridge<ElectronAPI>()    │
    │  (Proxy 自动桥接，< 50 行)     │
    └─────────────────────────────────┘
```

---

## 2. 核心基础设施

### 2.1 类型工具

```typescript
// packages/shared-types/src/ipc-proxy.ts

/**
 * 标记一个属性为事件监听器
 * 使用方式：onStreamEvent: Listener<AgentSDKStreamEvent>
 */
export type Listener<T> = (callback: (data: T) => void) => () => void

/**
 * 从 ElectronAPI 类型中提取 RPC 方法（非 on* 开头的）
 */
export type ExtractRPC<NS> = {
  [K in keyof NS as K extends `on${string}` ? never : K]: NS[K]
}

/**
 * 从 ElectronAPI 类型中提取事件监听器（on* 开头的）
 */
export type ExtractListeners<NS> = {
  [K in keyof NS as K extends `on${string}` ? K : never]: NS[K]
}

/**
 * RPC 实现类型：把 Promise<T> 展开为 T（实现不需要返回 IPCResponse 包装）
 */
export type RPCImpl<NS> = {
  [K in keyof ExtractRPC<NS>]: NS[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<R> | R
    : never
}

/**
 * IPCResponse 包装（保持向后兼容）
 */
export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
```

### 2.2 API 契约（核心文件）

```typescript
// packages/shared-types/src/electron-api.ts
import type { Listener } from './ipc-proxy'
import type {
  Skill, SkillManifest, SkillExecutionResult,
  McpServer, McpServerConfig, McpTool,
  AgentSDKQueryRequest, AgentSDKStreamEvent, AgentSDKConfig,
  ChatStreamEvent, ChatCompletionRequest,
  // ... 其他已有类型
} from './index'

/**
 * 完整的 Electron API 契约
 * 这是跨进程通信的唯一真相源
 *
 * 规则：
 * - 普通方法 → ipcRenderer.invoke / ipcMain.handle
 * - on* 方法 (Listener<T>) → ipcRenderer.on / webContents.send
 */
export interface ElectronAPI {
  // ─── Agent SDK ───────────────────────────
  agentSDK: {
    createQuery(params: {
      requestId: string
      request: AgentSDKQueryRequest
    }): Promise<{ requestId: string }>
    stopQuery(requestId: string): Promise<void>
    interruptQuery(requestId: string): Promise<void>
    sendPermissionResponse(params: {
      toolUseId: string
      allowed: boolean
      updatedInput?: Record<string, unknown>
    }): Promise<void>
    getConfig(): Promise<AgentSDKConfig>
    updateConfig(config: Partial<AgentSDKConfig>): Promise<void>
    // Listeners
    onStreamEvent: Listener<AgentSDKStreamEvent>
  }

  // ─── LLM ────────────────────────────────
  llm: {
    chatCompletion(request: ChatCompletionRequest): Promise<{ requestId: string }>
    stopStream(requestId: string): Promise<{ stopped: boolean }>
    sendToolApproval(params: {
      requestId: string
      toolCallId: string
      approved: boolean
    }): Promise<void>
    // Listeners
    onStreamEvent: Listener<ChatStreamEvent>
  }

  // ─── Skill ──────────────────────────────
  skill: {
    list(): Promise<SkillManifest[]>
    install(path: string): Promise<SkillManifest>
    uninstall(id: string): Promise<void>
    execute(id: string, params: unknown): Promise<SkillExecutionResult>
    validate(path: string): Promise<{ valid: boolean; errors?: string[] }>
    getSystemPrompt(): Promise<string>
    getCommandPrompt(command: string): Promise<string>
    reloadAll(): Promise<void>
  }

  // ─── MCP ────────────────────────────────
  mcp: {
    listServers(): Promise<McpServer[]>
    addServer(config: McpServerConfig): Promise<void>
    removeServer(id: string): Promise<void>
    connectServer(id: string): Promise<void>
    disconnectServer(id: string): Promise<void>
    listTools(serverId: string): Promise<McpTool[]>
    getServerStatus(serverId: string): Promise<string>
  }

  // ─── Chat ───────────────────────────────
  chat: {
    listConversations(): Promise<ConversationSummary[]>
    createConversation(title: string): Promise<string>
    deleteConversation(id: string): Promise<void>
    getMessages(conversationId: string): Promise<ChatMessage[]>
    addMessage(conversationId: string, message: ChatMessage): Promise<void>
    deleteMessage(conversationId: string, messageId: string): Promise<void>
    updateTitle(conversationId: string, title: string): Promise<void>
    getWorkspaceDir(conversationId: string): Promise<string>
  }

  // ─── Model ──────────────────────────────
  model: {
    listProviders(): Promise<ModelProvider[]>
    getProvider(id: string): Promise<ModelProvider>
    saveProvider(provider: ModelProvider): Promise<void>
    deleteProvider(id: string): Promise<void>
    testConnection(id: string): Promise<{ ok: boolean; error?: string }>
    fetchModels(providerId: string): Promise<string[]>
    getActiveModel(): Promise<ActiveModel | null>
    setActiveModel(model: ActiveModel): Promise<void>
    getRecentModels(): Promise<ActiveModel[]>
  }

  // ─── Theme ──────────────────────────────
  theme: {
    get(): Promise<string>
    set(mode: string): Promise<void>
    onChange: Listener<string>
  }

  // ─── Auth ───────────────────────────────
  auth: {
    login(provider: string): Promise<AuthUser>
    logout(): Promise<void>
    getUser(): Promise<AuthUser | null>
  }

  // ─── Search ─────────────────────────────
  search: {
    listConfigs(): Promise<SearchConfig[]>
    saveConfig(config: SearchConfig): Promise<void>
    deleteConfig(id: string): Promise<void>
    execute(query: string, configId: string): Promise<SearchResult[]>
    validate(config: SearchConfig): Promise<{ valid: boolean }>
  }

  // ─── File ───────────────────────────────
  file: {
    selectFiles(options?: FileSelectOptions): Promise<string[]>
    readFile(path: string): Promise<Buffer>
    saveAttachment(conversationId: string, file: AttachmentInput): Promise<AttachmentInfo>
    deleteAttachment(conversationId: string, attachmentId: string): Promise<void>
    listAttachments(conversationId: string): Promise<AttachmentInfo[]>
    openAttachment(path: string): Promise<void>
  }

  // ─── Log ────────────────────────────────
  log: {
    query(params: LogQueryParams): Promise<LogQueryResult>
    getStats(): Promise<LogStats>
    export(params: LogExportParams): Promise<string>
    openViewer(): Promise<void>
  }

  // ─── Network ────────────────────────────
  network: {
    getProxyConfig(): Promise<ProxyConfig>
    setProxyConfig(config: ProxyConfig): Promise<void>
    getRequestLog(): Promise<RequestLogEntry[]>
    clearRequestLog(): Promise<void>
    onRequestLogEntry: Listener<RequestLogEntry>
  }

  // ─── Plugin ─────────────────────────────
  plugin: {
    list(): Promise<PluginInfo[]>
    grantPermission(pluginId: string, permission: string): Promise<void>
    getUIContributions(): Promise<UIContributions>
    installDev(path: string): Promise<void>
    reloadDev(pluginId: string): Promise<void>
    onUIContributionsChanged: Listener<UIContributions>
  }

  // ─── Webhook ────────────────────────────
  webhook: {
    getConfigs(): Promise<WebhookConfig[]>
    saveConfig(config: WebhookConfig): Promise<void>
    deleteConfig(id: string): Promise<void>
    test(config: WebhookConfig): Promise<{ ok: boolean; error?: string }>
  }

  // ─── App ────────────────────────────────
  app: {
    getInfo(): Promise<AppInfo>
    getPaths(): Promise<AppPaths>
    openExternal(url: string): Promise<void>
    openPath(path: string): Promise<void>
    getSystemInfo(): Promise<SystemInfo>
    getEnvInfo(): Promise<EnvInfo>
  }

  // ─── AppConfig ──────────────────────────
  appConfig: {
    get(): Promise<AppInitConfig>
    refresh(): Promise<AppInitConfig>
    onUpdated: Listener<AppInitConfig>
  }

  // ─── Update ─────────────────────────────
  update: {
    check(): Promise<UpdateInfo | null>
    download(): Promise<void>
    install(): Promise<void>
    onChecking: Listener<void>
    onAvailable: Listener<UpdateInfo>
    onProgress: Listener<UpdateProgress>
    onDownloaded: Listener<UpdateInfo>
    onError: Listener<string>
  }

  // ─── IM Bot ─────────────────────────────
  imbot: {
    getConfigs(): Promise<IMBotConfig[]>
    saveConfig(config: IMBotConfig): Promise<void>
    start(id: string): Promise<void>
    stop(id: string): Promise<void>
    sendMessage(botId: string, message: IMMessage): Promise<void>
  }

  // ─── Remote Device ──────────────────────
  remote: {
    listDevices(): Promise<RemoteDevice[]>
    registerDevice(params: RegisterDeviceRequest): Promise<RemoteDevice>
    executeCommand(params: RemoteCommandRequest): Promise<void>
    getRelayConfig(): Promise<RelayConfig>
    setRelayConfig(config: RelayConfig): Promise<void>
    onCommandOutput: Listener<RemoteCommandOutput>
  }

  // ─── Remote Chat ────────────────────────
  remoteChat: {
    bindConversation(params: { botId: string; conversationId: string }): Promise<void>
    unbindConversation(botId: string): Promise<void>
    getBindings(): Promise<ChatBotBinding[]>
    sendMessage(params: { botId: string; message: string }): Promise<void>
    onIMMessage: Listener<RemoteIMMessage>
  }

  // ─── Window (保留原生 IPC) ──────────────
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximizeChange: Listener<boolean>
  }
}
```

### 2.3 Main Process — 自动注册

```typescript
// src/main/ipc/register.ts
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ElectronAPI } from '@super-client/shared-types'

/**
 * camelCase → kebab-case
 * 'agentSDK' → 'agent-sdk'
 * 'createQuery' → 'create-query'
 */
function toKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * 生成 IPC channel 名称
 * ('agentSDK', 'createQuery') → 'agent-sdk:create-query'
 */
function toChannel(ns: string, method: string): string {
  return `${toKebab(ns)}:${toKebab(method)}`
}

/**
 * 判断方法是否为事件监听器
 * on* 开头的方法是事件监听器，不注册为 handle
 */
function isListener(method: string): boolean {
  return /^on[A-Z]/.test(method)
}

/**
 * 从实现对象自动注册所有 IPC handlers
 *
 * 只注册非 on* 方法（RPC）
 * on* 方法通过 broadcastEvent / unicastEvent 手动触发
 */
export function registerAPI<T extends Record<string, Record<string, unknown>>>(
  impl: T
): void {
  for (const [ns, methods] of Object.entries(impl)) {
    for (const [method, fn] of Object.entries(methods)) {
      if (isListener(method) || typeof fn !== 'function') continue

      const channel = toChannel(ns, method)

      ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
        try {
          const result = await (fn as Function)(...args)
          return { success: true, data: result }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { success: false, error: message }
        }
      })
    }
  }
}

/**
 * 反注册所有 IPC handlers（用于 HMR / 测试）
 */
export function unregisterAPI<T extends Record<string, Record<string, unknown>>>(
  impl: T
): void {
  for (const [ns, methods] of Object.entries(impl)) {
    for (const method of Object.keys(methods)) {
      if (isListener(method)) continue
      ipcMain.removeHandler(toChannel(ns, method))
    }
  }
}
```

### 2.4 Main Process — 事件工具

```typescript
// src/main/ipc/events.ts
import { BrowserWindow, type WebContents } from 'electron'
import type { EventEmitter } from 'events'

/**
 * 广播事件到所有窗口
 * 用于：主题变更、配置更新等全局事件
 */
export function broadcastEvent(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  })
}

/**
 * 单播事件到指定窗口
 * 用于：Agent SDK stream 等针对特定请求的事件
 */
export function unicastEvent(sender: WebContents, channel: string, data: unknown): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, data)
  }
}

/**
 * 将 EventEmitter 事件转发到渲染进程
 *
 * 用法：
 *   const cleanup = forwardEvents(agentSDKService, 'stream-event', sender, 'agent-sdk:stream-event')
 *   // ... 操作完成后
 *   cleanup()
 */
export function forwardEvents(
  emitter: EventEmitter,
  sourceEvent: string,
  target: WebContents | 'broadcast',
  targetChannel: string,
  filter?: (data: unknown) => boolean
): () => void {
  const listener = (data: unknown) => {
    if (filter && !filter(data)) return

    if (target === 'broadcast') {
      broadcastEvent(targetChannel, data)
    } else {
      unicastEvent(target, targetChannel, data)
    }
  }

  emitter.on(sourceEvent, listener)
  return () => emitter.off(sourceEvent, listener)
}
```

### 2.5 Main Process — API 实现

```typescript
// src/main/ipc/api-impl.ts
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { registerAPI } from './register'
import { forwardEvents, broadcastEvent } from './events'
import { agentSDKService } from '../services/agent/AgentSDKService'
import { llmService } from '../services/llm/LLMService'
import { skillService } from '../services/skill/SkillService'
import { mcpService } from '../services/mcp/McpService'
// ... 其他 service imports

// ─── 1. 注册 RPC 方法（自动） ───────────────
const apiImpl = {
  agentSDK: {
    // createQuery 需要特殊处理（streaming），见下方手动注册
    stopQuery: (requestId: string) => agentSDKService.stop(requestId),
    interruptQuery: (requestId: string) => agentSDKService.interrupt(requestId),
    sendPermissionResponse: (params: { toolUseId: string; allowed: boolean; updatedInput?: Record<string, unknown> }) =>
      agentSDKService.resolvePermission(params.toolUseId, params.allowed, params.updatedInput),
    getConfig: () => agentSDKService.getConfig(),
    updateConfig: (config: unknown) => agentSDKService.updateConfig(config),
  },

  llm: {
    // chatCompletion 需要特殊处理（streaming），见下方手动注册
    stopStream: (requestId: string) => ({ stopped: llmService.stopStream(requestId) }),
    sendToolApproval: (params: { requestId: string; toolCallId: string; approved: boolean }) =>
      llmService.handleToolApproval(params),
  },

  skill: {
    list: () => skillService.list(),
    install: (path: string) => skillService.install(path),
    uninstall: (id: string) => skillService.uninstall(id),
    execute: (id: string, params: unknown) => skillService.execute(id, params),
    validate: (path: string) => skillService.validate(path),
    getSystemPrompt: () => skillService.getSystemPrompt(),
    getCommandPrompt: (command: string) => skillService.getCommandPrompt(command),
    reloadAll: () => skillService.reloadAll(),
  },

  mcp: {
    listServers: () => mcpService.list(),
    addServer: (config: unknown) => mcpService.add(config),
    removeServer: (id: string) => mcpService.remove(id),
    connectServer: (id: string) => mcpService.connect(id),
    disconnectServer: (id: string) => mcpService.disconnect(id),
    listTools: (serverId: string) => mcpService.listTools(serverId),
    getServerStatus: (serverId: string) => mcpService.getStatus(serverId),
  },

  chat: {
    listConversations: () => chatService.listConversations(),
    createConversation: (title: string) => chatService.create(title),
    deleteConversation: (id: string) => chatService.delete(id),
    getMessages: (conversationId: string) => chatService.getMessages(conversationId),
    addMessage: (conversationId: string, message: unknown) => chatService.addMessage(conversationId, message),
    deleteMessage: (conversationId: string, messageId: string) => chatService.deleteMessage(conversationId, messageId),
    updateTitle: (conversationId: string, title: string) => chatService.updateTitle(conversationId, title),
    getWorkspaceDir: (conversationId: string) => chatService.getWorkspaceDir(conversationId),
  },

  theme: {
    get: () => storeManager.getConfig('theme'),
    set: (mode: string) => {
      storeManager.setConfig('theme', mode)
      broadcastEvent('theme:on-change', mode) // 广播
    },
  },

  // ... 其他模块类似，省略
}

registerAPI(apiImpl)

// ─── 2. 手动注册 Streaming handlers ───────────
// 这些需要访问 event.sender（单播）或特殊流程控制

ipcMain.handle('agent-sdk:create-query', async (event: IpcMainInvokeEvent, params: {
  requestId: string
  request: unknown
}) => {
  try {
    const { requestId, request } = params

    // 转发 stream 事件到请求发起的窗口（单播）
    const cleanup = forwardEvents(
      agentSDKService,
      'stream-event',
      event.sender,
      'agent-sdk:stream-event',
      (data: any) => data.requestId === requestId // 过滤当前请求
    )

    // Fire-and-forget
    agentSDKService.createQuery(requestId, request).finally(cleanup)

    return { success: true, data: { requestId } }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('llm:chat-completion', async (event: IpcMainInvokeEvent, request: unknown) => {
  try {
    // LLM 使用广播模式（所有窗口都能看到对话）
    const cleanup = forwardEvents(
      llmService,
      'stream-event',
      'broadcast',
      'llm:stream-event'
    )

    llmService.chatCompletion(request).finally(cleanup)

    return { success: true, data: { requestId: (request as any).requestId } }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// ─── 3. 注册 Broadcasting 监听 ───────────────
// 这些是 Service 主动推送的事件，不是 handler 注册的

function registerBroadcastListeners() {
  // 网络请求日志
  requestLogService.on('entry', (entry: unknown) => {
    broadcastEvent('network:request-log-entry', entry)
  })

  // 配置更新
  appConfigService.on('updated', (config: unknown) => {
    broadcastEvent('app-config:on-updated', config)
  })

  // 插件 UI 变更
  pluginService.on('ui-contributions-changed', (contributions: unknown) => {
    broadcastEvent('plugin:on-u-i-contributions-changed', contributions)
  })
}

registerBroadcastListeners()
```

### 2.6 Preload — 自动桥接

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '@super-client/shared-types'

/**
 * camelCase → kebab-case（与 main 保持一致）
 */
function toKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function toChannel(ns: string, method: string): string {
  return `${toKebab(ns)}:${toKebab(method)}`
}

function isListener(method: string): boolean {
  return /^on[A-Z]/.test(method)
}

/**
 * 创建类型安全的 IPC 桥接
 *
 * 自动将 ElectronAPI 的方法映射为：
 * - 普通方法 → ipcRenderer.invoke
 * - on* 方法 → ipcRenderer.on + 返回 unsubscribe
 */
function createBridge<T extends Record<string, Record<string, unknown>>>(): T {
  return new Proxy({} as T, {
    get(_, ns: string) {
      return new Proxy({}, {
        get(_, method: string) {
          const channel = toChannel(ns, method)

          if (isListener(method)) {
            // 事件监听器：返回 (callback) => unsubscribe
            return (callback: (data: unknown) => void) => {
              const listener = (_event: unknown, data: unknown) => callback(data)
              ipcRenderer.on(channel, listener)
              return () => {
                ipcRenderer.removeListener(channel, listener)
              }
            }
          }

          // RPC 方法：返回 (...args) => Promise
          return (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)
        },
      })
    },
  })
}

// 暴露给 Renderer — 整个 API 只需这一行
contextBridge.exposeInMainWorld('electron', createBridge<ElectronAPI>())
```

**从 2132 行 → ~50 行。**

### 2.7 Renderer — 类型声明

```typescript
// src/renderer/src/types/electron.d.ts
import type { ElectronAPI } from '@super-client/shared-types'

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
```

### 2.8 Renderer — 使用方式

```typescript
// 调用方式完全不变！
const skills = await window.electron.skill.list()
//    ^? Promise<Skill[]>  ← 自动推导

const unsub = window.electron.agentSDK.onStreamEvent((event) => {
  //                                                   ^? AgentSDKStreamEvent
  if (event.type === 'chunk') {
    setContent(prev => prev + event.content)
  }
})

// cleanup
return () => unsub()
```

**Renderer 组件几乎零改动**（调用签名不变）。

---

## 3. 通信模式映射

### 3.1 Request/Response（~70% 的 channels）

```
              现在                                迁移后
┌─────────────────────────┐         ┌────────────────────────────┐
│ channels.ts (定义)       │         │                            │
│ types.ts (类型)          │         │ ElectronAPI 类型契约       │
│ handler.ts (实现)        │  ──→   │ api-impl.ts (实现)         │
│ ipc/index.ts (注册)      │         │ registerAPI() (自动注册)   │
│ preload.ts (暴露)        │         │ createBridge() (自动桥接)  │
│ service.ts (客户端)      │         │ 直接调用 (类型自动推导)    │
└─────────────────────────┘         └────────────────────────────┘
       6 个文件                            2 个文件
```

### 3.2 Streaming — 单播（Agent SDK）

```
Renderer                     Preload                    Main
   │                           │                          │
   │ agentSDK.createQuery()    │                          │
   │──────invoke──────────────>│──────invoke──────────────>│
   │                           │                          │ agentSDKService.createQuery()
   │                           │                          │ forwardEvents(service, sender)
   │                           │                          │
   │                           │    sender.send(event)    │
   │    callback(event)        │<─────────────────────────│
   │<──────────────────────────│                          │
   │                           │    sender.send(event)    │
   │    callback(event)        │<─────────────────────────│
   │<──────────────────────────│                          │
   │                           │    sender.send(done)     │
   │    callback(done)         │<─────────────────────────│ cleanup()
   │<──────────────────────────│                          │
```

**变化**：Handler 用 `forwardEvents()` 替代手动 `event.sender.send()`，其余不变。

### 3.3 Streaming — 广播（LLM, Theme, Config）

```
Any Window                   Main                     All Windows
   │                          │                          │
   │ theme.set('dark')        │                          │
   │────invoke───────────────>│                          │
   │                          │ storeManager.set()       │
   │                          │ broadcastEvent('theme:   │
   │                          │   on-change', 'dark')    │
   │    callback('dark')      │                          │
   │<──── send ───────────────│──── send ───────────────>│ callback('dark')
   │                          │                          │
```

**变化**：Handler 用 `broadcastEvent()` 替代 `BrowserWindow.getAllWindows().forEach()`。

### 3.4 Service 主动推送（Network Log, Plugin UI）

```
                              Main                     All Windows
                               │                          │
  requestLogService.emit()     │                          │
  ────────────────────────────>│                          │
                               │ broadcastEvent()         │
                               │                          │
                               │──── send ───────────────>│ callback(entry)
                               │                          │
```

**变化**：在 `registerBroadcastListeners()` 中统一注册，替代分散在各 handler 中的 `webContents.send`。

---

## 4. Channel 命名映射

自动转换规则：`camelCase namespace` + `camelCase method` → `kebab-case:kebab-case`

| ElectronAPI | 生成的 Channel | 现有 Channel |
|-------------|----------------|-------------|
| `agentSDK.createQuery` | `agent-sdk:create-query` | `agent-sdk:create-query` ✅ |
| `agentSDK.onStreamEvent` | `agent-sdk:on-stream-event` | `agent-sdk:stream-event` ⚠️ |
| `skill.list` | `skill:list` | `skill:list` ✅ |
| `theme.onChange` | `theme:on-change` | `theme:on-change` ✅ |
| `llm.chatCompletion` | `llm:chat-completion` | `llm:chat-completion` ✅ |
| `llm.onStreamEvent` | `llm:on-stream-event` | `llm:stream-event` ⚠️ |

**注意**：部分事件 channel 的现有命名没有 `on-` 前缀。有两个处理方式：

**方案 A（推荐）**：调整事件 channel 生成规则，`on*` 方法去掉 `on` 前缀再转换：

```typescript
function toEventChannel(ns: string, method: string): string {
  // onStreamEvent → stream-event
  const eventName = method.replace(/^on/, '')
  return `${toKebab(ns)}:${toKebab(eventName)}`
}
```

这样 `agentSDK.onStreamEvent` → `agent-sdk:stream-event`，与现有 channel 完全一致。

**方案 B**：保持新命名，迁移时统一更新。

---

## 5. 迁移步骤

### Phase 0：基础设施（0.5 天）

```
新建文件：
  packages/shared-types/src/ipc-proxy.ts    # 类型工具
  packages/shared-types/src/electron-api.ts # API 契约（先写 1-2 个模块）
  src/main/ipc/register.ts                  # registerAPI
  src/main/ipc/events.ts                    # broadcastEvent, forwardEvents

修改文件：
  src/main/main.ts                          # 调用 registerAPI
  src/preload/index.ts                      # 添加 createBridge（与旧代码共存）
  src/renderer/src/types/electron.d.ts      # 更新类型声明
```

验证：选一个最简单的模块（如 webhook）走通全链路。

### Phase 1：逐模块迁移（按风险排序）

每个模块迁移流程：

```
1. 在 ElectronAPI 中添加该模块的类型定义
2. 在 api-impl.ts 中添加该模块的实现
3. 验证：Renderer 调用走新链路
4. 删除：旧 handler + channels + preload 暴露
5. 提交
```

迁移顺序：

| 序号 | 模块 | 类型 | 预估 |
|------|------|------|------|
| 1 | webhook | 纯 RPC | 0.5h |
| 2 | auth | 纯 RPC | 0.5h |
| 3 | appConfig | RPC + 1 listener | 1h |
| 4 | theme | RPC + 1 listener | 0.5h |
| 5 | search | 纯 RPC | 1h |
| 6 | file | 纯 RPC | 1h |
| 7 | skill | 纯 RPC | 1h |
| 8 | log | 纯 RPC | 1h |
| 9 | app/system | 纯 RPC | 1h |
| 10 | chat | 纯 RPC (多方法) | 1.5h |
| 11 | model | 纯 RPC (多方法) | 1.5h |
| 12 | network | RPC + streaming | 2h |
| 13 | mcp | 纯 RPC (多子服务) | 2h |
| 14 | plugin | RPC + listener | 2h |
| 15 | imbot | RPC + 生命周期 | 1.5h |
| 16 | remote | RPC + streaming | 2h |
| 17 | remoteChat | RPC + listener | 1.5h |
| 18 | llm | Streaming 核心 | 3h |
| 19 | agentSDK | Streaming + 双向 | 4h |
| 20 | window | 保留原生 IPC | 0.5h |

### Phase 2：清理（0.5 天）

- 删除空的 `src/main/ipc/handlers/` 目录
- 删除 `src/main/ipc/channels.ts`
- 精简 `src/main/ipc/types.ts`
- 删除 `src/renderer/src/services/` 中的 IPC wrapper
- 更新 CLAUDE.md

---

## 6. 向后兼容策略

### 双轨共存

新旧两套 IPC 可以同时运行。Proxy 生成的 channel 名称与现有一致（采用方案 A 的命名规则），所以：

1. 可以先用 `registerAPI` 注册新模块
2. 旧模块的 `ipcMain.handle` 保持不动
3. Preload 中新旧 API 共存：
   ```typescript
   // 旧的 — 逐步删除
   contextBridge.exposeInMainWorld('electron', oldAPI)
   // 新的 — 逐步迁移
   contextBridge.exposeInMainWorld('electron2', createBridge<ElectronAPI>())
   ```
4. 迁移完成后，`electron2` → `electron`

或者更简单的方案：由于 channel 名完全一致，直接替换 Preload 即可，Renderer 无感。

### Renderer 零改动路径

由于 `window.electron.skill.list()` 的调用签名不变，Renderer 组件**不需要改调用代码**。

唯一变化：返回值从 `IPCResponse<T>` 变为直接 `T`（因为错误由 trycatch 处理）。

如果不想改 Renderer，可以让 Proxy 也包装 IPCResponse：

```typescript
// 保持 IPCResponse 兼容
return (...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args).then((response: IPCResponse) => response)
```

---

## 7. 最终文件结构

```
packages/shared-types/src/
├── electron-api.ts          # 新增：API 契约（唯一真相源）
├── ipc-proxy.ts             # 新增：Listener<T> 等类型工具
└── index.ts                 # 已有：重新 export

src/main/ipc/
├── register.ts              # 新增：registerAPI（~60 行）
├── events.ts                # 新增：broadcastEvent, forwardEvents（~50 行）
├── api-impl.ts              # 新增：全部 RPC 实现 + streaming handlers
└── index.ts                 # 已有：改为调用 registerAPI + streaming

src/preload/
└── index.ts                 # 重写：createBridge（~50 行）

src/renderer/src/types/
└── electron.d.ts            # 重写：声明 window.electron: ElectronAPI
```

**基础设施总计：~160 行新代码。**

---

## 8. 与 electron-trpc 最终对比

| 维度 | Typed IPC Proxy | electron-trpc |
|------|-----------------|---------------|
| 新增依赖 | **0** | 6 个 |
| 基础设施 | **~160 行** | ~200 行 + 配置 |
| Renderer 改动 | **几乎为零** | 全部组件改调用方式 |
| 学习成本 | **几乎为零** | 需学习 tRPC + React Query |
| 运行时验证 | 无（编译时保证） | Zod 运行时验证 |
| Streaming | forwardEvents 手动 | subscription 自动 |
| 错误处理 | 保持现有 IPCResponse | tRPC Error 体系 |
| 维护风险 | **零（自有代码）** | 依赖 electron-trpc 维护 |
| 迁移工期 | **5-8 天** | 13-21 天 |
