---
date: 2026-06-21
status: accepted (v2.1)
owners: [TheMark]
revision_history:
  - v1 (2026-06-21): 初稿
  - v2 (2026-06-21): 自评后修订；关闭 nativeMcp 后门、IPC broker 契约、runtimeId 归属、tool result 类型化、planMode 三态、Phase 拆分；新增 §17 AgentTrace 调试页
  - v2.1 (2026-06-21): Open questions 裁决；trace 默认采样/持久化/redact 策略锁定；status=accepted；进入 Phase 1 实施
related:
  - src/main/services/agent/AgentSDKService.ts
  - src/main/services/llm/LLMService.ts
  - src/main/services/runtime/SessionRuntimeResolver.ts
  - src/main/services/runtime/ApprovalGrantStore.ts
  - packages/shared-types/src/agent-sdk.ts
  - packages/shared-types/src/chat.ts
---

# AgentRuntime 适配层接口设计 (v2)

在 `AgentSDKService` / `LLMService` 之上引入项目内部契约 `AgentRuntime`，让上层（renderer / IPC / store）只面向统一接口；每个具体后端（Claude Agent SDK、LLM 手写循环、Codex、OpenAI Agents SDK …）实现一个 adapter；并提供 `AgentTrace` 调试页方便追查问题。

> 不是再造 SDK——是收口现有两条流式管道，给后续接入留口子，并把"看不见的东西"变可观测。

---

## 1. 目标与非目标

### 目标
- 统一 agent 执行入口，删除 `isAgentSDKRequestRef` 二态分支
- 统一流式事件 schema：`AgentStreamEvent`
- `EffectiveSessionRuntime` / `SessionMeta` 真正驱动 runtime 选择
- 工具执行 / 审批 / Session 持久化的接缝清晰化、可单测
- **新增**：`AgentTrace` 调试页，每次 query 全程可回放
- 对老路径零回归（Phase 1 仅 wrap）

### 非目标
- 不修改 SessionStorage / JSONL 落盘格式
- 不替换 `ApprovalGrantStore` 的持久化语义
- 不发明跨语言 agent 协议（不是 MCP 的替代）
- 第一阶段不重写 Claude SDK 鉴权 / settings 屏蔽逻辑（仍封在 adapter 内）
- 不强求所有 adapter 都支持 sub-agent；以 capabilities 位标识

---

## 2. 总体架构

```
┌─────────────────────── Renderer ─────────────────────────┐
│  useChat → window.electronAPI.agent.createQuery(req)     │
│           ← onStreamEvent(AgentStreamEvent)              │
│  /debug/agent-traces  ← AgentTrace IPC                   │
└────────────────────────────┬─────────────────────────────┘
                             │ IPC: agent:create-query
                             │      agent:resolve-permission
                             │      agent:interrupt
                             │      debug:agent-traces:*
┌────────────────────────────▼─────────────────────────────┐
│            AgentRuntimeIpcBroker (main IPC)              │
│  - 消费 adapter 的 AsyncIterable<AgentStreamEvent>       │
│  - per-window event.sender.send                          │
│  - requestId → AbortController 管理                      │
│  - 串接 AgentTraceCollector                              │
└────────────────────────────┬─────────────────────────────┘
                             │
                  AgentRuntimeRegistry.resolve(SessionMeta)
                             │
        ┌────────────────────┼────────────────────────┐
        │                    │                        │
┌───────▼──────┐    ┌────────▼────────┐     ┌─────────▼────────┐
│ ClaudeSdk    │    │ LlmLoop         │     │ Codex (future)   │
│ Runtime      │    │ Runtime         │     │ Runtime          │
└───────┬──────┘    └────────┬────────┘     └─────────┬────────┘
        │                    │                       │
        ▼                    ▼                       ▼
              ┌──────────────────────────────┐
              │ HostToolDispatcher           │
              │  ↳ checkApproval (grant 缓存)│
              │  ↳ execute (MCP/Skill/Builtin│
              │      cwd 解析、_storageDir)  │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ AgentTraceCollector          │
              │ - in-memory ring buffer      │
              │ - optional jsonl persistence │
              └──────────────────────────────┘
```

**核心原则**（v2 强化）：
1. **工具一律 host 执行**——adapter 不允许走"native MCP 后门"。dispatcher 是 audit/approval/artifact 的唯一咽喉
2. **Adapter 不直接接触 IPC**——broker 负责跨进程
3. **每条事件都进 trace**——broker 同步分流到 `AgentTraceCollector`

---

## 3. 核心类型

新建 `packages/shared-types/src/agent-runtime.ts`。

### 3.1 Runtime 标识

```ts
/** 内置 runtime id 集合（窄类型，IPC 安全） */
export type AgentRuntimeId =
  | 'claude-sdk'
  | 'llm-loop'
  | 'codex'
  | 'openai-agents'

/** 第三方注册的自定义 id；与 AgentRuntimeId 隔离避免类型推断坑 */
export type CustomAgentRuntimeId = string

export interface AgentRuntimeDescriptor {
  id: AgentRuntimeId | CustomAgentRuntimeId
  displayName: string
  capabilities: AgentRuntimeCapabilities
  schemaVersion: 1
}
```

### 3.2 Capabilities（v2 修订）

```ts
export interface AgentRuntimeCapabilities {
  /** 是否流式 */
  streaming: boolean

  /** 是否输出 reasoning（thinking / chain-of-thought delta） */
  reasoning: boolean

  /** Plan-mode 实现方式：
   *   native       - SDK 原生支持（Claude Agent SDK）
   *   host-strip   - host 在 plan 模式下不下发工具
   *   unsupported  - 不支持
   */
  planMode: 'native' | 'host-strip' | 'unsupported'

  /** 自带 session 持久化（如 Claude SDK 的 session 文件） */
  nativeSession: boolean

  /** 沙箱强度（仅描述，决策由上层做） */
  sandbox: 'none' | 'workspace-write' | 'os-level'

  /** 工具 schema */
  toolSchema: 'json-schema' | 'xml-blocks'

  /** 多模态输入 */
  multimodalInput: ('text' | 'image' | 'file')[]
}

// v2 删除：subAgents（Phase 5 才考虑，提前留位会引诱半成品）
// v2 删除：nativeMcp（强制走 dispatcher，不留后门，见 §4）
```

### 3.3 请求

```ts
import type { EffectiveSessionRuntime, ToolCallApprovalScope } from './chat'

/**
 * 注意：本类型用于 main 内部传递。
 * IPC 边界传递的是 AgentQueryRequestPayload（见 §6.1），不含 signal。
 */
export interface AgentQueryRequest {
  /** Renderer 生成；用于 IPC 过滤、interrupt 定位 */
  requestId: string
  /** Super Client R 自己的 session id */
  conversationId: string
  /** 当前轮输入 */
  prompt: AgentPromptInput
  /** 历史消息：
   *   - 当 capabilities.nativeSession=true 且 resume.nativeSessionId 存在时，adapter 必须忽略 history
   *   - 否则 adapter 必须使用完整 history（缺失则抛 ConfigurationError）
   */
  history?: ReadonlyArray<AgentHistoryMessage>
  /** 已解析的运行时配置 */
  runtime: EffectiveSessionRuntime
  /** Host 已聚合的工具清单（前缀已加） */
  tools: ReadonlyArray<AgentToolBinding>
  /** 工作目录 */
  cwd?: string
  /** 恢复目标（仅 nativeSession=true 的 adapter 解释） */
  resume?: { nativeSessionId?: string }
  /** 取消信号：由 broker 注入，renderer 不传 */
  signal: AbortSignal
}

export type AgentPromptInput =
  | { kind: 'text'; text: string; attachments?: AttachmentRef[] }
  | { kind: 'parts'; parts: PromptPart[] }

export interface AttachmentRef {
  id: string
  mime: string
  /** file:// 或 internal:// 协议 URI */
  uri: string
}

export type PromptPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: AttachmentRef }
  | { type: 'tool_result'; callId: string; content: ToolResultContent }

export interface AgentHistoryMessage {
  role: 'user' | 'assistant' | 'tool'
  content: PromptPart[]
  toolCallId?: string
}

export interface AgentToolBinding {
  /** 给 LLM 看的工具名（已加前缀） */
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema
  origin: {
    kind: 'mcp' | 'skill' | 'builtin'
    serverId: string
    realName: string
  }
}
```

### 3.4 工具结果（v2 新增类型化）

```ts
/** 工具结果内容；adapter 必须归一为 union 之一，UI 才能正确渲染 */
export type ToolResultContent =
  | TextResult
  | ImageResult
  | StructuredResult
  | ErrorResult
  | MixedResult

export interface TextResult {
  kind: 'text'
  text: string
}

export interface ImageResult {
  kind: 'image'
  /** base64 或 file:// URI */
  source: string
  mime: string
}

export interface StructuredResult {
  kind: 'structured'
  /** 任意 JSON；UI 用 JSON viewer 展示 */
  data: unknown
  /** 可选：抽取出的 file artifact */
  artifacts?: Array<{ kind: string; data: unknown }>
}

export interface ErrorResult {
  kind: 'error'
  message: string
  /** 原始错误（去敏后） */
  raw?: unknown
}

export interface MixedResult {
  kind: 'mixed'
  parts: Array<TextResult | ImageResult | StructuredResult>
}
```

### 3.5 统一事件（v2 修订）

```ts
export type AgentStreamEvent =
  | AgentInitEvent
  | AgentTextDeltaEvent
  | AgentReasoningDeltaEvent
  | AgentMessageFinalEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentPermissionRequestEvent
  | AgentPermissionResolvedEvent
  | AgentStatusEvent
  | AgentUsageEvent
  | AgentRateLimitEvent
  | AgentResultEvent
  | AgentErrorEvent

export interface AgentEventBase {
  /** v2 新增：schema 版本，便于跨进程协商 */
  v: 1
  requestId: string
  conversationId: string
  /** 同一 requestId 内单调递增，由 adapter 维护 counter，从 0 起 */
  seq: number
  runtime: AgentRuntimeId | CustomAgentRuntimeId
  timestamp: number
  /** Adapter 自留扩展（仅 trace 显示，业务逻辑不依赖） */
  extra?: Record<string, unknown>
}

export interface AgentInitEvent extends AgentEventBase {
  type: 'init'
  /** Adapter 拿到的原生 session id，renderer 应回写到 SessionMeta.nativeSessionId */
  nativeSessionId?: string
  model?: string
}

export interface AgentTextDeltaEvent extends AgentEventBase {
  type: 'text.delta'
  /** 同一消息内稳定；reasoning 与 text 共享 messageId */
  messageId: string
  delta: string
}

export interface AgentReasoningDeltaEvent extends AgentEventBase {
  type: 'reasoning.delta'
  /** 与 text.delta 共享 messageId；UI 按到达顺序渲染（一般 reasoning 在前） */
  messageId: string
  delta: string
}

export interface AgentMessageFinalEvent extends AgentEventBase {
  type: 'message.final'
  messageId: string
  text: string
  reasoning?: string
}

export interface AgentToolCallEvent extends AgentEventBase {
  type: 'tool.call'
  callId: string
  /** Host 前缀名（与 AgentToolBinding.name 一致） */
  toolName: string
  input: unknown
}

export interface AgentToolResultEvent extends AgentEventBase {
  type: 'tool.result'
  callId: string
  /** v2 类型化 union */
  content: ToolResultContent
  /** 是否错误（content.kind==='error' 时必为 true） */
  isError: boolean
}

export interface AgentPermissionRequestEvent extends AgentEventBase {
  type: 'permission.request'
  approvalId: string
  toolName: string
  input: unknown
}

export interface AgentPermissionResolvedEvent extends AgentEventBase {
  type: 'permission.resolved'
  approvalId: string
  decision: PermissionDecision
  /** v2 新增：是 grant 缓存自动放行还是用户决定（UI 据此区分显示） */
  source: 'user' | 'auto-grant' | 'auto-policy'
}

export interface AgentStatusEvent extends AgentEventBase {
  type: 'status'
  status: 'preparing' | 'streaming' | 'tool_calling' | 'idle'
}

export interface AgentUsageEvent extends AgentEventBase {
  type: 'usage'
  /** v2：只发 token，价格在 host UsageService 一处算 */
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface AgentRateLimitEvent extends AgentEventBase {
  type: 'rate_limit'
  retryAfterMs?: number
  message?: string
}

export interface AgentResultEvent extends AgentEventBase {
  type: 'result'
  reason: 'completed' | 'cancelled' | 'error' | 'max_turns'
  finalMessageId?: string
}

export interface AgentErrorEvent extends AgentEventBase {
  type: 'error'
  fatal: boolean
  code: string
  message: string
}

export interface PermissionDecision {
  approved: boolean
  scope: ToolCallApprovalScope  // once | session | workspace | global
  reason?: string
}
```

### 3.6 Runtime 接口

```ts
export interface AgentRuntime {
  readonly descriptor: AgentRuntimeDescriptor

  /**
   * 启动一次查询。返回 async iterable。
   * - Adapter 必须监听 req.signal 并在中止时正确清理
   * - Adapter 必须为 seq 维护单调 counter
   * - 工具执行通过构造期注入的 ToolDispatcher 完成（见 §4）
   */
  createQuery(req: AgentQueryRequest): AsyncIterable<AgentStreamEvent>

  /** 用户裁决审批 */
  resolvePermission(approvalId: string, decision: PermissionDecision): Promise<void>

  /** 终止某次请求 */
  interrupt(requestId: string): Promise<void>

  /** Optional：仅 capabilities.nativeSession=true 时实现 */
  listNativeSessions?(): Promise<NativeSessionInfo[]>
  forkNativeSession?(sessionId: string, atMessageId?: string): Promise<string>
  renameNativeSession?(sessionId: string, name: string): Promise<void>
  deleteNativeSession?(sessionId: string): Promise<void>

  /** App quit 时调用 */
  dispose?(): Promise<void>
}

export interface NativeSessionInfo {
  id: string
  title?: string
  updatedAt: number
}
```

---

## 4. ToolDispatcher（v2：唯一执行通道）

**v2 决策**：所有 adapter 必须把工具调用走 `HostToolDispatcher`，不再保留"nativeMcp 后门"。这一条牺牲了 Claude SDK 子进程内 MCP 的部分性能，但换来：

- 唯一的审批 / audit / artifact 抽取入口
- ApprovalGrantStore 缓存语义全 runtime 一致
- Codex / 自定义 runtime 接入时不需要重复写工具路由

### 4.1 接口

```ts
export interface ToolDispatcher {
  /** 检查审批；可能立即放行 / 拒绝 / 需要用户裁决 */
  checkApproval(call: ToolCallContext): Promise<ApprovalCheckResult>

  /** 执行工具（已通过审批） */
  execute(call: ToolCallContext): Promise<ToolExecutionResult>
}

export interface ToolCallContext {
  conversationId: string
  requestId: string
  callId: string
  toolName: string
  input: unknown
  origin: AgentToolBinding['origin']
  runtime: EffectiveSessionRuntime
  /** 用于路径解析 / `_storageDir` 注入 */
  cwd?: string
}

export type ApprovalCheckResult =
  | { kind: 'allow'; source: 'auto-grant' | 'auto-policy' }
  | { kind: 'deny'; reason: string; source: 'auto-policy' }
  | { kind: 'ask'; approvalId: string }

export interface ToolExecutionResult {
  content: ToolResultContent
  isError: boolean
  durationMs: number
}
```

### 4.2 Adapter 工具调用流程（**强制**）

```
adapter 收到模型的 tool 决策
  ↓
emit AgentToolCallEvent (tool.call)
  ↓
const check = await dispatcher.checkApproval(ctx)
  ↓
switch check.kind
  case 'allow' → emit permission.resolved (source=check.source) → 跳到 execute
  case 'deny'  → emit permission.resolved (denied) → emit tool.result (kind=error)
  case 'ask'   → emit permission.request → 等待 resolvePermission → 收到后再判断
  ↓
const result = await dispatcher.execute(ctx)
  ↓
emit AgentToolResultEvent (tool.result, content=result.content, isError=result.isError)
  ↓
把结果喂回模型
```

### 4.3 ClaudeSdkRuntime 的特殊处理

Claude Agent SDK 提供 `canUseTool` 回调，但默认 MCP 调用在子进程内完成。**v2 strategy**：

- 不在 `options.mcpServers` 里给 SDK 注册 MCP server
- 把所有 host 的 `tools` 编译成普通 tool definitions 透传给 SDK
- 在 `canUseTool` 里调 `dispatcher.checkApproval`
- SDK 调起 tool 时不会自己执行，回到我们这边——**走 dispatcher.execute**
- result 通过 SDK 的 tool result API 喂回

> 这是 Phase 1 实现的最大风险点（与现行行为不同）。Phase 1 spec 必须为 ClaudeSdkRuntime 的内置 MCP 通路写**端到端回归套件**（`@scp/file-system` 读写、`@scp/grep`、`@scp/plan`、`@scp/todo`（原 `@scp/task`）全覆盖），并由 `AgentTraceCollector` 验证。

---

## 5. AgentRuntimeRegistry

```ts
export class AgentRuntimeRegistry {
  private byId = new Map<string, AgentRuntime>()

  register(rt: AgentRuntime): void
  get(id: string): AgentRuntime
  list(): AgentRuntimeDescriptor[]

  /** 选择 runtime（v2：runtimeId 来自 SessionMeta，会话生命周期不可变） */
  resolveForSession(sessionMeta: SessionMeta, fallbackProfile?: InteractionProfile): AgentRuntime
}
```

### 5.1 选择决策

`SessionMeta` **新增**字段 `runtimeId: AgentRuntimeId`，**会话创建后不可变**。新建会话时按下表派生默认值（用户可显式覆盖）：

| interactionProfile | model.provider | 默认 runtimeId |
|---|---|---|
| `claude-code`        | 任意                 | `claude-sdk` |
| `codex`              | 任意                 | `codex`（未注册 → fallback `llm-loop` + 警告） |
| `hybrid`             | `anthropic`-原生     | `claude-sdk` |
| `hybrid`             | OpenAI / DS / OR / … | `llm-loop` |

派生函数 `pickDefaultRuntimeId(profile, modelMeta)` 单测覆盖。

> v1 误把 `runtimeId` 放进 `EffectiveSessionRuntime`——v2 移除。`EffectiveSessionRuntime` 在解析时**只读取** `SessionMeta.runtimeId`、不参与覆盖链。

---

## 6. IPC 收口与 Broker 契约（v2 新增）

### 6.1 IPC 通道

| Channel | 类型 | 说明 |
|---|---|---|
| `agent:create-query` | `handle` | 参数 `AgentQueryRequestPayload` = `Omit<AgentQueryRequest, 'signal'>` |
| `agent:stream-event` | `send` | main → renderer，per-window `event.sender.send` |
| `agent:resolve-permission` | `handle` | 用户裁决 |
| `agent:interrupt` | `handle` | 取消 |
| `agent:list-native-sessions` | `handle` | optional, capabilities-gated |
| `agent:fork-native-session` | `handle` | optional |

### 6.2 Broker 契约

新建 `src/main/services/agent/runtime/AgentRuntimeIpcBroker.ts`：

```ts
class AgentRuntimeIpcBroker {
  private inflight = new Map<string, {
    controller: AbortController
    sender: WebContents
  }>()

  async handleCreateQuery(event: IpcMainInvokeEvent, payload: AgentQueryRequestPayload) {
    const controller = new AbortController()
    this.inflight.set(payload.requestId, { controller, sender: event.sender })

    const runtime = this.registry.resolveForSession(/* ... */)
    const req: AgentQueryRequest = { ...payload, signal: controller.signal }

    // 不 await——立刻返回 ack
    void this.pump(runtime, req, event.sender)
    return { ok: true }
  }

  private async pump(runtime: AgentRuntime, req: AgentQueryRequest, sender: WebContents) {
    try {
      for await (const ev of runtime.createQuery(req)) {
        this.trace.record(req.requestId, { kind: 'event', payload: ev })
        if (sender.isDestroyed()) {
          // 渲染端已关闭，但仍需让 trace 完整跑完——继续 drain
          continue
        }
        sender.send('agent:stream-event', ev)
      }
    } catch (err) {
      // adapter 内未捕获的异常 → 转 error 事件
      const ev = makeErrorEvent(req, err)
      this.trace.record(req.requestId, { kind: 'event', payload: ev })
      if (!sender.isDestroyed()) sender.send('agent:stream-event', ev)
    } finally {
      this.inflight.delete(req.requestId)
      this.trace.finish(req.requestId)
    }
  }

  async handleInterrupt(requestId: string) {
    const entry = this.inflight.get(requestId)
    entry?.controller.abort()
    return { ok: true }
  }
}
```

**契约要点**：
- Adapter 永远不直接接触 `event.sender` / `BrowserWindow`
- `AbortSignal` 来自 broker 自建的 `AbortController`，renderer 仅传 `requestId` 调 `agent:interrupt`
- Adapter 抛出未捕获异常 → broker 转 `AgentErrorEvent(fatal=true)`，不允许静默
- `sender.isDestroyed()` 时仍把事件 drain 到 trace（保证调试完整）
- `seq` 由 adapter 内维护；broker 不重排

### 6.3 Preload

```ts
contextBridge.exposeInMainWorld('electronAPI', {
  agent: {
    createQuery: (req: AgentQueryRequestPayload) =>
      ipcRenderer.invoke('agent:create-query', req),
    onStreamEvent: (cb: (e: AgentStreamEvent) => void) => {
      const listener = (_: unknown, e: AgentStreamEvent) => cb(e)
      ipcRenderer.on('agent:stream-event', listener)
      return () => ipcRenderer.off('agent:stream-event', listener)
    },
    resolvePermission: (id: string, decision: PermissionDecision) =>
      ipcRenderer.invoke('agent:resolve-permission', { id, decision }),
    interrupt: (requestId: string) =>
      ipcRenderer.invoke('agent:interrupt', { requestId }),
    listNativeSessions: () => ipcRenderer.invoke('agent:list-native-sessions'),
    forkNativeSession: (sessionId: string, atMessageId?: string) =>
      ipcRenderer.invoke('agent:fork-native-session', { sessionId, atMessageId }),
  },
  agentDebug: {  // §17
    listTraces: (filter?: AgentTraceFilter) =>
      ipcRenderer.invoke('debug:agent-traces:list', filter),
    getTrace: (requestId: string) =>
      ipcRenderer.invoke('debug:agent-traces:get', requestId),
    clearTraces: () => ipcRenderer.invoke('debug:agent-traces:clear'),
    exportTrace: (requestId: string) =>
      ipcRenderer.invoke('debug:agent-traces:export', requestId),
    onTraceUpdated: (cb: (summary: AgentTraceSummary) => void) => { /* ... */ },
    setConfig: (config: AgentTraceConfig) =>
      ipcRenderer.invoke('debug:agent-traces:set-config', config),
  },
})
```

---

## 7. Renderer 集成

### 7.1 useChat 改造

- 删除 `isAgentSDKRequestRef`，单一调度入口 `window.electronAPI.agent.createQuery`
- 事件分发改为 reducer：`handleAgentEvent(state, event)`
- `init.nativeSessionId` → 写回 `SessionMeta.nativeSessionId`（旧 `agentSDKSessionId` 字段保留读，新写仅写新字段）
- 审批统一走 `agent.resolvePermission`

### 7.2 store 收敛

- `chatMessageStore` 暴露 `applyAgentEvent(event)`，吸收当前 useChat 内的事件→message 转换
- `featureFlagsStore` 加 `agentRuntimeUnified` 灰度开关
- 新建 `agentTraceStore`（§17）

### 7.3 file artifact 抽取

`tool.result.content.kind === 'structured'` 且 `artifacts` 非空时调 `fileArtifactStore.captureFromArtifacts(...)`。原 `captureFileArtifactsFromToolResult` 拆为两步：分类 + 入库。

---

## 8. Adapter 实现骨架

### 8.1 ClaudeSdkRuntime（Phase 1）

```ts
export class ClaudeSdkRuntime implements AgentRuntime {
  readonly descriptor = {
    id: 'claude-sdk' as const,
    displayName: 'Claude Agent SDK',
    schemaVersion: 1 as const,
    capabilities: {
      streaming: true,
      reasoning: true,
      planMode: 'native',
      nativeSession: true,
      sandbox: 'workspace-write',
      toolSchema: 'json-schema',
      multimodalInput: ['text', 'image', 'file'],
    },
  }

  constructor(
    private readonly inner: AgentSDKService,
    private readonly dispatcher: ToolDispatcher,
  ) {}

  async *createQuery(req: AgentQueryRequest): AsyncIterable<AgentStreamEvent> {
    let seq = 0
    const make = <T extends AgentStreamEvent>(e: Omit<T, 'v' | 'seq' | 'runtime' | 'requestId' | 'conversationId' | 'timestamp'>) =>
      ({ v: 1, seq: seq++, runtime: 'claude-sdk', requestId: req.requestId, conversationId: req.conversationId, timestamp: Date.now(), ...e }) as T

    // …用 inner 的 query()，把 SDK 事件 normalize 成 AgentStreamEvent
    // canUseTool 回调里调 dispatcher.checkApproval，按 §4.2 流程发事件
    // tool 执行真正交给 dispatcher.execute（v2）
  }

  async resolvePermission(id, decision) { return this.inner.resolvePermission(id, decision) }
  async interrupt(requestId)          { return this.inner.interrupt(requestId) }
  async listNativeSessions()          { return this.inner.listSessions() }
  async forkNativeSession(s, m?)      { return this.inner.forkSession(s, m) }
  // …
}
```

### 8.2 LlmLoopRuntime（Phase 2）

```ts
export class LlmLoopRuntime implements AgentRuntime {
  readonly descriptor = {
    id: 'llm-loop' as const,
    displayName: 'Generic LLM (manual loop)',
    schemaVersion: 1,
    capabilities: {
      streaming: true,
      reasoning: false,  // 多数 OpenAI 兼容 provider 没有；DeepSeek-R1 单独走 extra
      planMode: 'host-strip',
      nativeSession: false,
      sandbox: 'workspace-write',
      toolSchema: 'json-schema',
      multimodalInput: ['text', 'image'],
    },
  }
  // …
}
```

### 8.3 CodexRuntime（Phase 4）

```ts
export class CodexRuntime implements AgentRuntime {
  readonly descriptor = {
    id: 'codex' as const,
    schemaVersion: 1,
    capabilities: {
      streaming: true,
      reasoning: false,
      planMode: 'unsupported',
      nativeSession: true,
      sandbox: 'os-level',
      toolSchema: 'json-schema',
      multimodalInput: ['text', 'image', 'file'],
    },
  }
  // spawn('codex', ['exec','--json',...])，stdout JSONL 解析
}
```

### 8.4 事件归一化映射

| Claude SDK 事件 | LLM loop 事件 | Codex 事件 | 统一事件 |
|---|---|---|---|
| `init` (system) | `stream_start` | `session_configured` | `init` |
| `chunk` (text) | `content_chunk` | `agent_message_delta` | `text.delta` |
| `chunk` (thinking) | — | — | `reasoning.delta` |
| `assistant` (final) | （aggregate） | `task_complete.message` | `message.final` |
| `tool_call`(decision) | `tool_call` | `exec_command_begin` | `tool.call` |
| `tool_use_summary` | `tool_result` | `exec_command_end` | `tool.result` |
| `permission_request` | `tool_approval_request` | `approval_request` | `permission.request` |
| `permission_denied` | — | — | `permission.resolved` (denied) |
| `status` | — | — | `status` |
| `result.usage` | usage | `task_complete.usage` | `usage` |
| `rate_limit_event` | rate_limit error | `rate_limit` | `rate_limit` |
| `result` | `done` | `task_complete` | `result` |
| `error` | `error` | `error` | `error` |

---

## 9. 与 EffectiveSessionRuntime / Storage 的关系（v2 修订）

- **`SessionMeta`** 新增字段：
  - `runtimeId: AgentRuntimeId | CustomAgentRuntimeId` —— **不可变**
  - `nativeSessionId?: string` —— 取代 `agentSDKSessionId`（旧字段保留读，写一律走新字段；N 个版本后删除）
- **`EffectiveSessionRuntime`** 不引入 `runtimeId`；解析器在生成 runtime 时把 `sessionMeta.runtimeId` 注入 `AgentRuntimeRegistry.resolveForSession`
- JSONL 落盘形态不变；renderer 把 `AgentStreamEvent` → chat event 的转换继续在 store 里做
- `RuntimePolicyService` 的审计调用点从 `LLMService` / `AgentSDKService` 迁到 `HostToolDispatcher.execute` 内部

### 9.1 字段迁移路径

| 阶段 | 读 | 写 |
|---|---|---|
| Phase 1 | 同时读 `nativeSessionId` 与 `agentSDKSessionId`（前者优先） | 双写 |
| Phase 3 | 同上 | 仅写新字段 |
| Phase 4+N（≥1 release）| 仅读新字段 | 仅写新字段 |
| Phase 4+N+1 | 删 `agentSDKSessionId` 字段 | — |

---

## 10. 迁移分阶段（v2 拆分）

| Phase | 工作 | 风险 |
|---|---|---|
| **1. Bootstrap** | shared-types 上线；`HostToolDispatcher` + `AgentTraceCollector` 上线；`ClaudeSdkRuntime` 包 `AgentSDKService`，**关闭 SDK 内置 MCP 改走 dispatcher**（§4.3）；新 IPC 通道；旧 `agent-sdk:*` 内部转调；`/debug/agent-traces` 页 v0 | **高**（dispatcher 路径替换；要全工具回归套件） |
| **2a. LLM 适配** | `LlmLoopRuntime` 包 `LLMService`，但保留旧 `modelHandlers` 工具路径；renderer 灰度开关 `agentRuntimeUnified`；trace 页加 LLM 数据 | 中 |
| **2b. LLM 工具切 dispatcher** | `LlmLoopRuntime` 工具调用切 `HostToolDispatcher`；删旧 `modelHandlers.ts:22-75` 路径；逐工具回归 | **高** |
| **3. 清理** | 删 `agent-sdk:*` / `llm:stream-event` 旧通道；`useChat` 内分支删尽；老 `agentStore` 退役 | 低 |
| **4. Codex** | `CodexRuntime` 落地；profile=codex 名实相符；trace 支持 Codex 字段 | 中 |
| **5. Sub-agent** | `capabilities.subAgents` 重新引入；事件加 `parentRequestId` / `agentLabel` | 高 |

---

## 11. 测试策略

- **`FakeRuntime`**（test 工具包）：脚本化 yield 一组 `AgentStreamEvent`；用于 useChat reducer 单测、e2e
- **`AgentRuntimeRegistry`** 选择决策表驱动测试
- **`HostToolDispatcher`** 隔离测试：mock `McpService` / `SkillService` / `ApprovalGrantStore`
- **真实 adapter 集成**：录制 SDK 响应 fixture（vitest + fs fixture）
- **事件归一化对照**：每个 adapter 提供 `normalize.test.ts`
- **Phase 1 内置 MCP 回归套件**：`@scp/file-system` 读 / 写 / 列、`@scp/grep` 查找、`@scp/plan` 增删改、`@scp/todo` 流程（前身 `@scp/task`）——全部走 ClaudeSdkRuntime 端到端，结果用 `AgentTraceCollector` 验证事件序列

---

## 12. Open questions（v2 已部分裁决）

| # | 问题 | v2 裁决 |
|---|---|---|
| 1 | Auto-grant 是否 emit `permission.resolved`？ | ✅ 是。`source` 字段区分（§3.5） |
| 2 | `runtimeId` 归属？ | ✅ `SessionMeta`，会话生命周期不可变（§5.1, §9） |
| 3 | 多模态输入 Phase 1 范围？ | ✅ text + image；attachment URI 协议（`file://` / `internal://`） |
| 4 | Sub-agent 接口提前留？ | ✅ 不留，Phase 5 再加（§3.2 capabilities 已删） |
| 5 | `agent:retry` 通道？ | ⏸ Phase 2 再议；v2 暂不引入 |
| 6 | Trace 默认采样率？持久化默认开/关？ | ✅ dev=on（ring buffer + jsonl 持久化）；prod=ring buffer only（无持久化）；用户可在设置内手动开 prod 持久化 |
| 7 | Trace 隐私 redact 默认策略？ | ✅ 默认 `loose`（API key 仍 mask，但 prompt / attachment 完整保留，调试体验优先）；用户可调高到 `strict` |

---

## 13. 文件落地清单

```
packages/shared-types/src/
  agent-runtime.ts                              # §3 全部类型
  agent-trace.ts                                # §17 类型

src/main/services/agent/runtime/
  AgentRuntime.ts                               # 接口 re-export + helpers
  AgentRuntimeRegistry.ts
  HostToolDispatcher.ts
  AgentRuntimeIpcBroker.ts                      # §6.2
  ClaudeSdkRuntime.ts
  LlmLoopRuntime.ts                             # Phase 2
  CodexRuntime.ts                               # Phase 4 占位

src/main/services/agent/trace/
  AgentTraceCollector.ts                        # §17 主体
  AgentTracePersister.ts                        # §17 jsonl 落盘
  redact.ts                                     # §17.6 脱敏

src/main/ipc/handlers/
  agentRuntimeHandlers.ts                       # 新通道注册
  agentTraceHandlers.ts                         # debug:agent-traces:*
  streamingHandlers.ts                          # 旧 agent-sdk:* 转调

src/main/ipc/channels.ts
  AGENT_RUNTIME_CHANNELS
  AGENT_TRACE_CHANNELS

src/preload/index.ts
  electronAPI.agent
  electronAPI.agentDebug

src/renderer/src/services/agent/
  agentRuntimeClient.ts

src/renderer/src/hooks/
  useChat.ts                                    # 砍 isAgentSDKRequestRef

src/renderer/src/stores/
  chatMessageStore.ts                           # +applyAgentEvent
  agentTraceStore.ts                            # 新增

src/renderer/src/pages/debug/
  AgentTracesPage.tsx                           # §17 UI
  components/TraceList.tsx
  components/TraceDetail.tsx
  components/EventTimeline.tsx
  components/EventInspector.tsx

docs/superpowers/specs/
  2026-06-21-agent-runtime-adapter-design.md    # 本文档
```

---

## 14. Adapter 生命周期（v2 新增）

- Adapter 是 **main 进程单例**：在 app `ready` 后由 `bootstrap.ts` 实例化并 `registry.register(...)`
- 同一 adapter 处理多 conversation 并发：内部按 `requestId` 维护 per-request 状态（active subprocess、resolver map）
- 子进程 / 网络连接生命周期由 adapter 自管：
  - ClaudeSdkRuntime：每次 query spawn 一次（沿用现行）
  - CodexRuntime：可选长驻进程池（Phase 4 决定）
- `dispose()` 在 app `before-quit` 时调用：等待 inflight queries 完成或强制中止（10s 超时）
- adapter 内部抛出未捕获异常 → broker 兜底转 `AgentErrorEvent(fatal=true)` 并 `dispose()` 重启

---

## 15. 错误处理 / 取消语义

- `req.signal.aborted` → adapter 立刻 emit `result(reason='cancelled')` 并清理；不再 emit 后续事件
- adapter 的工具调用过程中收到 abort：必须 emit `tool.result(content=ErrorResult{message:'cancelled'})` 让 UI 状态闭环
- `dispatcher.execute` 抛错 → adapter emit `tool.result(content=ErrorResult, isError=true)`，**不**抛到 broker
- adapter 内部 fatal 错误（无法恢复）→ 抛到 broker → broker emit `error(fatal=true)` + `result(reason='error')`

---

## 16. 渲染端事件处理样例

```ts
function handleAgentEvent(e: AgentStreamEvent) {
  switch (e.type) {
    case 'init':
      if (e.nativeSessionId) {
        sessionStore.updateMeta(e.conversationId, {
          nativeSessionId: e.nativeSessionId,
        })
      }
      break
    case 'text.delta':
      chatMessageStore.appendDelta(e.messageId, e.delta)
      break
    case 'reasoning.delta':
      chatMessageStore.appendReasoning(e.messageId, e.delta)
      break
    case 'message.final':
      chatMessageStore.commitMessage(e.messageId, e.text, e.reasoning)
      break
    case 'tool.call':
      chatMessageStore.recordToolCall(e.callId, e.toolName, e.input)
      break
    case 'tool.result':
      chatMessageStore.recordToolResult(e.callId, e.content, e.isError)
      if (e.content.kind === 'structured' && e.content.artifacts?.length) {
        fileArtifactStore.captureFromArtifacts(e.callId, e.content.artifacts)
      }
      break
    case 'permission.request':
      uiStore.showApprovalDialog(e)
      break
    case 'permission.resolved':
      uiStore.markApproval(e.approvalId, e.decision, e.source)
      // source==='auto-grant' 时 UI 显示一个轻量"已自动允许"提示
      break
    case 'status':
      chatMessageStore.setStatus(e.status)
      break
    case 'usage':
      usageStore.add(e)  // Host 在 store 内根据 model price 表算费用
      break
    case 'result':
      chatMessageStore.setStatus('idle')
      if (e.reason === 'error') uiStore.toast.error('对话出错')
      break
    case 'error':
      uiStore.toast.error(`${e.code}: ${e.message}`)
      if (e.fatal) chatMessageStore.setStatus('idle')
      break
  }
}
```

---

## 17. AgentTrace 调试页（v2 新增）

> 目标：每次 `agent:create-query` 全程可回放，便于追查"为什么这次工具被自动允许了"、"事件流为啥卡了 5 秒"、"模型为什么走 fallback"。

### 17.1 数据模型

```ts
// packages/shared-types/src/agent-trace.ts

export interface AgentTraceSummary {
  requestId: string
  conversationId: string
  runtimeId: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'completed' | 'cancelled' | 'errored'
  model?: string
  /** 摘要字段，避免每次列表都加载 events */
  totals: {
    events: number
    textDeltas: number
    toolCalls: number
    permissions: number
    errors: number
  }
  /** 用户输入摘要（前 80 字 + 是否含图） */
  promptPreview: string
}

export interface AgentTraceEntry extends AgentTraceSummary {
  events: AgentTraceRecord[]
  /** Adapter 给出的 schemaVersion */
  schemaVersion: number
}

export interface AgentTraceRecord {
  ts: number
  /** 事件分类 */
  kind:
    | 'event'              // AgentStreamEvent
    | 'dispatcher.call'    // 进 dispatcher
    | 'dispatcher.result'  // 出 dispatcher
    | 'permission'         // 用户裁决落地
    | 'native.log'         // adapter 内部日志（SDK stderr 等）
  payload: unknown
  /** 单步耗时；同一 callId 的两次记录之差 */
  durationMs?: number
  /** 关联键 */
  callId?: string
  approvalId?: string
  messageId?: string
  /** 自标记，用于诊断（如 "auto-grant by ApprovalGrantStore"） */
  tag?: string
}

export interface AgentTraceFilter {
  runtimeId?: string
  status?: AgentTraceSummary['status']
  conversationId?: string
  /** 文本模糊匹配（prompt / tool name / error message） */
  q?: string
  since?: number
  until?: number
  limit?: number  // default 50
}

export interface AgentTraceConfig {
  /** 内存 ring buffer 上限 */
  ringBufferSize: number     // default 50
  /** 是否同时落盘 */
  persist: boolean           // default false（开发模式默认 true）
  /** 落盘保留天数 */
  retentionDays: number      // default 7
  /** redact 模式 */
  redactionMode: 'strict' | 'loose' | 'off'  // default loose（v2.1）
  /** 单条 trace 的最大事件数（超过后只记摘要） */
  maxEventsPerTrace: number  // default 5000
}
```

### 17.2 收集器

```ts
// src/main/services/agent/trace/AgentTraceCollector.ts

export class AgentTraceCollector {
  private ring: AgentTraceEntry[] = []
  private active = new Map<string, AgentTraceEntry>()
  private listeners = new Set<(s: AgentTraceSummary) => void>()

  begin(req: AgentQueryRequest): void {
    const entry: AgentTraceEntry = {
      requestId: req.requestId,
      conversationId: req.conversationId,
      runtimeId: '<resolved>',
      startedAt: Date.now(),
      status: 'running',
      totals: { events: 0, textDeltas: 0, toolCalls: 0, permissions: 0, errors: 0 },
      promptPreview: previewPrompt(req.prompt),
      events: [],
      schemaVersion: 1,
    }
    this.active.set(req.requestId, entry)
    this.emitSummary(entry)
  }

  record(requestId: string, rec: Omit<AgentTraceRecord, 'ts'>): void
  finish(requestId: string, reason: AgentTraceSummary['status']): void

  /** Renderer 查询 */
  list(filter?: AgentTraceFilter): AgentTraceSummary[]
  get(requestId: string): AgentTraceEntry | null
  clear(): void
  export(requestId: string): Promise<string>  // 返回 jsonl 文件路径
  
  setConfig(c: Partial<AgentTraceConfig>): void
  getConfig(): AgentTraceConfig

  subscribe(cb: (s: AgentTraceSummary) => void): () => void
}
```

### 17.3 接入点（broker / dispatcher / adapter）

| 调用点 | 记录 |
|---|---|
| `broker.handleCreateQuery` | `collector.begin(req)` |
| `broker.pump` 每条事件 | `collector.record(reqId, { kind:'event', payload:ev })` |
| `dispatcher.checkApproval` 入 / 出 | 两条记录，`kind='dispatcher.call' / 'dispatcher.result'`，标 `tag='checkApproval'` |
| `dispatcher.execute` 入 / 出 | 同上，`tag='execute'`；记录 `durationMs` |
| `agent:resolve-permission` 接到 | `kind='permission'`，记录 decision + source |
| Adapter 内部诊断（e.g. SDK stderr）| `kind='native.log'` |
| `broker.pump` finally | `collector.finish(reqId, status)` |

### 17.4 IPC 通道

| Channel | 类型 | 说明 |
|---|---|---|
| `debug:agent-traces:list` | `handle` | 参数 `AgentTraceFilter`，返回 `AgentTraceSummary[]` |
| `debug:agent-traces:get` | `handle` | 完整 `AgentTraceEntry` |
| `debug:agent-traces:updated` | `send` | 新 trace 摘要更新（实时） |
| `debug:agent-traces:clear` | `handle` | 清空内存 + 可选清落盘 |
| `debug:agent-traces:export` | `handle` | 返回导出 jsonl 路径，供 shell.openPath |
| `debug:agent-traces:set-config` | `handle` | 调整采样 / 持久化 |

### 17.5 渲染端 UI

新路由 `/debug/agent-traces`（页面）+ 内嵌面板（`Cmd+Shift+T` 唤起浮层）。

**布局**（左右分栏）：

```
┌─ Header: [Live ●] [filter: runtime ▾] [status ▾] [search] [config ⚙] ─┐
├─ Left: TraceList (virtualized) ─────────┬─ Right: TraceDetail ────────┤
│  [● claude-sdk] req_abc · 12s · 14ev   │  Header                     │
│  [✓ llm-loop ] req_def · 4s  · 8ev    │   req_abc                   │
│  [✗ codex   ] req_ghi · 2s  · ERR    │   conversation: chat_xxx    │
│  ...                                   │   runtime: claude-sdk       │
│                                        │   model: claude-3-7-sonnet  │
│                                        │   prompt: "Refactor..."     │
│                                        │  ─────────────────────────  │
│                                        │  Tabs: Timeline | Events    │
│                                        │        | Tools | JSON       │
│                                        │  ─────────────────────────  │
│                                        │  Timeline (ms 标尺):        │
│                                        │  0ms ▼ init                 │
│                                        │  120ms ▼ text.delta ×8      │
│                                        │  890ms ▼ tool.call read_file│
│                                        │   1.1s ▼ dispatcher.execute │
│                                        │   1.4s ▼ tool.result        │
│                                        │   ... (点击展开 inspector) │
└────────────────────────────────────────┴─────────────────────────────┘
```

**核心组件**：
- `TraceList`：虚拟列表 + 实时新条目（订阅 `traces:updated`）
- `EventTimeline`：以时间轴展开 events，支持折叠 `text.delta` 连续段（避免 200 条占屏）
- `EventInspector`：选中事件后显示完整 JSON（react-json-view）
- `ToolsTab`：聚合所有 `tool.call/result` 为表格（name / duration / status）
- `JSONTab`：完整 raw `AgentTraceEntry`，可一键复制

**操作**：
- 复制单事件 / 整个 trace 为 JSON
- "Re-emit" 调试按钮：dev 环境下把 trace 注入 `FakeRuntime` 重放（用于复现 UI bug）
- 跳转：从 trace 跳到对应 conversation，反之亦然

### 17.6 隐私 / Redact

`AgentTraceConfig.redactionMode`：

| 模式 | 行为 |
|---|---|
| `strict` | API key 全 mask；attachment 内容只留 mime+size；prompt 截断 200 字 |
| `loose`（v2.1 默认） | API key 仍 mask；prompt / attachment 完整保留——调试体验优先 |
| `off` | 完全不脱敏（仅开发模式可选；UI 二次确认） |

实现：`src/main/services/agent/trace/redact.ts` 在 `collector.record` 入口统一做。

### 17.7 入口

- 开发模式：菜单 → 调试 → Agent Traces，默认 `persist: true` + `redactionMode: 'loose'`
- 生产模式：藏在 设置 → 高级 → 调试模式 开关；默认 `persist: false`、ring buffer 仍开（便于线上 bug 现场抓取），用户可手动开 persist；`redactionMode: 'loose'`

### 17.8 性能预算

- 单事件入 collector ≤ 50 µs（内存追加 + listener 分发）
- ring buffer 50 条 × 5000 事件 / 条 × 平均 200 字节 ≈ 50 MB；超出时按 trace 整条 evict
- 落盘：buffered writer，flush 间隔 500ms
- IPC：`traces:list` 只发 summary（不带 events）；用户点击才拉 `get`

---

## 18. 后续讨论项（不阻塞 Phase 1）

- Sub-agent 事件嵌套渲染（Phase 5）
- `agent:retry` 通道与 streaming 续传（Phase 2 再议）
- Trace 持久化迁移到 sqlite（如果 jsonl 不够查）
- Trace 与 OpenTelemetry 对接（导出 OTLP）

---

## 附录 A：Phase 1 Definition of Done

1. `packages/shared-types/src/agent-runtime.ts` + `agent-trace.ts` 上线
2. `HostToolDispatcher` 单测通过（mock MCP/Skill/Approval）
3. `ClaudeSdkRuntime` 关闭 SDK 内置 MCP，工具走 dispatcher，**§11 内置 MCP 回归套件**全绿
4. `AgentRuntimeIpcBroker` 接收新通道；旧 `agent-sdk:*` 通道转调（功能等价回归）
5. `AgentTraceCollector` 工作；`/debug/agent-traces` 页 v0 可看 trace 列表 + timeline + JSON
6. Renderer `useChat` 改造：单一入口；`isAgentSDKRequestRef` 删除
7. 灰度：`agentRuntimeUnified` flag 默认开（dev）/ 关（prod），prod 上线后 1 个 release 全开
8. 文档：本 spec 升 status=accepted；CHANGELOG 标注
