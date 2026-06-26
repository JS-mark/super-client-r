# Code Review — Super Client R · 2026-06-25

> 工具链：codebase-memory-mcp（`index_repository` → `get_architecture` → `search_graph` / `query_graph`）+ Grep / Read 校验。
> 索引规模：**511 TS 文件 / 6242 节点 / 15888 边 / 67 Class / 690 Interface**。
> 主要包：`main`(1387 节点) · `renderer`(1096) · `preload`(70) · `device-agent` · `relay-server` · `shared-types`。
> 整体评估：**REQUEST_CHANGES** —— 没有阻塞性 P0 bug，但存在多个 P1 级架构 / 安全可靠性问题，以及大量 P2 级"god module / god hook"维护性债务，建议分批修。

---

## 一、架构图谱（基于 MCP `get_architecture` + `query_graph`）

<style scoped>
.arch-wrapper{display:flex;gap:18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.arch-sidebar{width:220px;display:flex;flex-direction:column;gap:12px}
.arch-main{flex:1;display:flex;flex-direction:column;gap:14px}
.arch-layer{border-radius:12px;padding:14px;border:1px solid rgba(0,0,0,.08);background:#fff}
.arch-layer .arch-title{font-weight:700;font-size:13px;margin-bottom:10px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}
.arch-grid{display:grid;gap:8px}
.arch-grid-2{grid-template-columns:repeat(2,1fr)} .arch-grid-3{grid-template-columns:repeat(3,1fr)} .arch-grid-4{grid-template-columns:repeat(4,1fr)} .arch-grid-5{grid-template-columns:repeat(5,1fr)}
.arch-box{background:rgba(255,255,255,.7);border:1px solid rgba(0,0,0,.1);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.4}
.arch-box small{display:block;color:#64748b;font-size:10px;margin-top:2px}
.arch-box.highlight{border-color:#ef4444;background:#fef2f2}
.arch-box.tech{font-size:11px}
.arch-layer.user{background:linear-gradient(135deg,#eff6ff,#dbeafe);border-color:#bfdbfe}
.arch-layer.app{background:linear-gradient(135deg,#ecfeff,#cffafe);border-color:#a5f3fc}
.arch-layer.ai{background:linear-gradient(135deg,#fdf4ff,#fae8ff);border-color:#f0abfc}
.arch-layer.data{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-color:#bbf7d0}
.arch-layer.infra{background:linear-gradient(135deg,#fff7ed,#ffedd5);border-color:#fed7aa}
.arch-layer.external{background:#f8fafc;border-style:dashed;border-color:#cbd5e1}
.arch-sidebar-panel{border-radius:10px;padding:12px;background:#0f172a;color:#e2e8f0}
.arch-sidebar-panel .arch-title{font-weight:700;font-size:12px;margin-bottom:8px;color:#94a3b8}
.arch-sidebar-item{font-size:11px;background:rgba(255,255,255,.06);padding:6px 8px;border-radius:6px;margin-bottom:6px}
.arch-sidebar-item.metric{background:#1e293b;color:#fbbf24;font-weight:700}
.arch-sidebar-item.hot{background:#7f1d1d;color:#fee2e2}
</style><div class="arch-wrapper"><div class="arch-sidebar"><div class="arch-sidebar-panel"><div class="arch-title">📊 SCALE</div><div class="arch-sidebar-item metric">511 TS files</div><div class="arch-sidebar-item metric">6242 nodes</div><div class="arch-sidebar-item metric">15888 edges</div><div class="arch-sidebar-item">main: 1387 nodes</div><div class="arch-sidebar-item">renderer: 1096 nodes</div><div class="arch-sidebar-item">preload: 70 nodes</div></div><div class="arch-sidebar-panel"><div class="arch-title">🔥 HOT FILES</div><div class="arch-sidebar-item hot">useChat.ts · 1812L · cc=144</div><div class="arch-sidebar-item hot">api-impl.ts · 1796L</div><div class="arch-sidebar-item hot">preload/index.ts · 2124L</div><div class="arch-sidebar-item hot">Plugins.tsx · 1197L · cc=42</div><div class="arch-sidebar-item hot">IMBot/index.tsx · 1118L</div><div class="arch-sidebar-item hot">ModelList · 765L · cc=30</div><div class="arch-sidebar-item hot">ChatMessageList · 742L</div><div class="arch-sidebar-item hot">AppSidebar · 655L · cc=27</div></div><div class="arch-sidebar-panel"><div class="arch-title">⚠️ BOUNDARIES</div><div class="arch-sidebar-item">renderer→main: 99 calls</div><div class="arch-sidebar-item">main→renderer: 97 calls</div><div class="arch-sidebar-item">renderer→preload: 70</div><div class="arch-sidebar-item">main→preload: 32 (反向!)</div></div></div><div class="arch-main"><div class="arch-layer user"><div class="arch-title">👤 Renderer (React 19 + Antd 6 + Zustand 5)</div><div class="arch-grid arch-grid-5"><div class="arch-box">Chat<br><small>Chat.tsx · 521L</small></div><div class="arch-box highlight">useChat<br><small>1812L · cc=144 ⚠️</small></div><div class="arch-box">ChatMessageList<br><small>742L · cc=27</small></div><div class="arch-box highlight">AppSidebar<br><small>655L · cc=27 ⚠️</small></div><div class="arch-box">ChatInputArea<br><small>590L</small></div><div class="arch-box highlight">Plugins<br><small>1197L · cc=42 ⚠️</small></div><div class="arch-box highlight">RemoteControlPage<br><small>1118L · cc=29 ⚠️</small></div><div class="arch-box">ModelList<br><small>765L · cc=30</small></div><div class="arch-box">McpMarket<br><small>472L · cc=28</small></div><div class="arch-box">Stores (Zustand)<br><small>chat/mcp/project/skin…</small></div></div></div><div class="arch-layer app"><div class="arch-title">🔌 Preload Bridge · contextIsolation:true</div><div class="arch-grid arch-grid-3"><div class="arch-box highlight">preload/index.ts<br><small>2124L · 单文件巨型 contextBridge ⚠️</small></div><div class="arch-box">bridge.ts<br><small>87L</small></div><div class="arch-box">5 IPC Channels<br><small>kebab-case</small></div></div></div><div class="arch-layer ai"><div class="arch-title">🧠 Main · IPC + Agent Runtime</div><div class="arch-grid arch-grid-4"><div class="arch-box highlight">ipc/api-impl.ts<br><small>1796L · 20+ entry points ⚠️</small></div><div class="arch-box">register.ts / events.ts<br><small>broadcastEvent / forwardEvents</small></div><div class="arch-box">handlers/<br><small>agentRuntime / pty / streaming…</small></div><div class="arch-box">service-holders.ts<br><small>singletons</small></div><div class="arch-box">AgentService<br><small>EventEmitter</small></div><div class="arch-box">LLMService<br><small>统一 chatCompletion</small></div><div class="arch-box">streamEventTranslator<br><small>cc=20</small></div><div class="arch-box">AgentTraceCollector<br><small>13 methods</small></div></div></div><div class="arch-layer data"><div class="arch-title">💾 Services & Storage</div><div class="arch-grid arch-grid-5"><div class="arch-box tech">McpService<br><small>24 methods</small></div><div class="arch-box tech">SkillService<br><small>22</small></div><div class="arch-box tech highlight">PluginManager<br><small>48 methods ⚠️</small></div><div class="arch-box tech">SessionStorage<br><small>39</small></div><div class="arch-box tech highlight">StoreManager<br><small>69 methods ⚠️</small></div><div class="arch-box tech">ProjectStorage<br><small>24</small></div><div class="arch-box tech">ConversationStorage<br><small>28</small></div><div class="arch-box tech">RemoteDeviceSvc<br><small>30</small></div><div class="arch-box tech">SearchService<br><small>15</small></div><div class="arch-box tech">McpClient<br><small>23</small></div></div></div><div class="arch-layer infra"><div class="arch-title">🛠 HTTP Server (Koa) + Built-in MCP Tools</div><div class="arch-grid arch-grid-4"><div class="arch-box">LocalServer<br><small>app.ts · 628L</small></div><div class="arch-box highlight">middlewares/auth<br><small>静态 Bearer 单 key ⚠️</small></div><div class="arch-box">server/auth.ts<br><small>JWT + ApiKeyManager (未挂载?)</small></div><div class="arch-box">routes/<br><small>chat/mcp/skill/proxy…</small></div><div class="arch-box highlight">@scp/bash<br><small>exec/execFile · 仅黑名单 ⚠️</small></div><div class="arch-box">@scp/grep<br><small>rg + readline</small></div><div class="arch-box">@scp/browser<br><small>BrowserWindow</small></div><div class="arch-box">pathSafety<br><small>BLOCKED_PATHS</small></div></div></div><div class="arch-layer external"><div class="arch-title">🌐 External / Packages</div><div class="arch-grid arch-grid-5"><div class="arch-box tech">shared-types<br><small>messageConverter</small></div><div class="arch-box tech">device-agent</div><div class="arch-box tech">relay-server</div><div class="arch-box tech">IM Bots<br><small>DingTalk/Lark/TG</small></div><div class="arch-box tech">DingTalk/Lark/TG APIs</div></div></div></div></div>

---

## 二、Findings

### 🔴 P1 — High（建议本轮或下一轮修）

1. **`src/main/server/middlewares/cors.ts:23`** — CORS 在缺失 Origin 时回退到 `*` 且仍设置 `Access-Control-Allow-Credentials:true`
   - 现状：`ctx.set("Access-Control-Allow-Origin", origin || "*")`。虽然浏览器对 `* + credentials` 组合通常拒收，但任何手写 fetch / curl 都能命中本地 API。本地 server 暴露的是 chat / agent / mcp 全量能力，加上认证只用单一静态 API Key（见 P1#2），一旦同机有恶意进程发起 file://、空 Origin、或自定义 Origin（开发模式额外白名单 `localhost:5173`），就能直接拿到完整 LLM/MCP 执行权限。
   - 建议：默认拒绝未知 Origin；只对显式白名单返回 ACAO；保留 `credentials=true` 时强制具体 Origin。

2. **`src/main/server/middlewares/auth.ts:27`** — 单一静态 Key + 非常量时间比较
   - `if (token !== apiKey)` 使用 `!==` 字符串比较，理论上存在时序侧信道；更关键的是 `getOrCreateApiKey()` 在 store 里永久存一个 key，没有轮换 / 多 key / 权限粒度。
   - 与此并存的 `src/main/server/auth.ts`（JWT + ApiKeyManager + 权限矩阵）几乎完整实现了正确方案，但 **从未挂载到 `setupMiddleware()`**（grep 确认 `app.ts` 用的是 `middlewares/auth`）。这导致：① 死代码 ② 想升级权限模型时容易踩坑选错文件。
   - 建议：`crypto.timingSafeEqual`；或干脆切换到 `server/auth.ts` 那套，删除 `middlewares/auth.ts`。

3. **`src/main/server/auth.ts:11`** — JWT secret 每次启动重生成
   - `process.env.JWT_secret || crypto.randomBytes(64).toString("hex")` —— 应用重启即令所有 token 失效。当前因为该模块未被 mount 不会爆，但启用后会变成 P0。

4. **`src/main/services/mcp/internal/servers/bashServer.ts:44-71`** — 危险命令黑名单覆盖面过窄
   - 仅命中 `rm -rf /` 等"教科书"案例。`rm -rf ~/Documents`、`rm -rf $HOME`、`rm -rf .` 全部放行。`execute_script` 还会自动注入 `set -e`，便于"一脚到位"。
   - 同文件 `get_env` 默认返回 **整个 `process.env`**，会把 OPENAI_API_KEY 等同进程读到的所有 secret 喂给 LLM。
   - 现有缓解（用户审批 + path 黑名单）是对的，但应在工具层显式：(a) 默认 `get_env` 必须传 `names`；(b) 文档明确"shell 命令依赖用户审批，不是沙箱"；(c) 把 BLOCKED_PATHS 校验也插到 cwd 上。

5. **`src/renderer/src/hooks/useChat.ts`** —— God Hook（1812 行 / cc=144 / cognitive=363）
   - 图谱里最显著的复杂度极值。所有 chat 行为（mode 协商、SDK pre-flight、MCP 注入、artifact 捕获、stream 处理、stop、retry、edit）全在一个 hook。改一个 bug 就连带影响 N 个状态，且很难写单测。
   - 建议：按职责切分为 `useChatSession` / `useChatStream` / `useChatTools` / `useChatArtifacts`，并把纯函数逻辑（`resolveAgentSdkIntent`、`sanitizeServerId`、`sanitizeAssistantContent` 等）抽到 `lib/chat/`。

6. **`src/main/ipc/api-impl.ts`** —— God Module（1796 行 + 20+ entry points）
   - 这一个文件同时承载：proxy / plugin / agent / runtime grant / runtime audit / mcp / events / archive / append 等。与 AGENTS.md 模板里的"按模块切分 `handlers/featureHandler.ts`"明显冲突。`handlers/` 目录已经有 5 个分文件，应把 api-impl.ts 里残留的实现也拆过去。

7. **`src/preload/index.ts`** —— 2124 行单文件 contextBridge
   - 单文件巨量 namespace 表面。一旦类型漂移会 silent；并且违反"最小暴露面"建议（虽然 contextIsolation 已开）。
   - 建议：按 namespace 拆 `preload/api/agent.ts`、`api/mcp.ts`、`api/skill.ts` …，在 `index.ts` 仅 compose。

### 🟡 P2 — Medium

1. **重复 / 平行实现**
   - `server/auth.ts`（JWT 全功能）与 `middlewares/auth.ts`（静态 Bearer）—— 二选一，删另一个。
   - 多处出现的 `getAllAvailableTools`（图谱里 3 处同名函数），`addServer` 也在 `api-impl.ts` / `mcpService.ts` / `mcpStore.ts` 各有一份。考虑统一在 service 层、其它仅作 client transport。

2. **State Duplication 反模式（AGENTS.md 明确禁止）**
   - `mcpStore.addServer` / `runtimeService.addGrant` 等出现在 renderer 与 main 同名同语义。验证它们都只是 client wrapper，否则属于明确禁止的"两边维护"。

3. **可达性极高的 hub 函数 fan-in 过载**
   - `StoreManager.get` fan_in=133, `PluginAPIFactory.set` fan_in=128, `stringify` fan_in=99（streamEventTranslator）。其中 `StoreManager.get`/`set` 几乎成了全局可变状态出口，会阻碍重构。建议 facade 化：`AppConfigService` / `WorkspaceConfigService` 等只暴露语义化 API，禁止业务代码直接 import `storeManager`。

4. **大型 Page 组件**
   - `Plugins.tsx`(1197L, cc=42, cog=75) / `IMBot/index.tsx`(1118L, cc=29) / `ModelList.tsx`(765L, cc=30) —— 这些复杂度数字通常意味着 effects、表单、modals、tabs 混在同一 component。按 Tab 拆 subcomponent，或者 `ProjectSettingsModal` 已经在做的"内部 sub-modal"模式可作为参照。

5. **`@scp/grep` ReDoS 风险**
   - `new RegExp(pattern, …)` 接受任意用户输入，`grepWithNodejs` 会在每行执行 `regex.test()`。在大型仓库下，恶意正则（如 `(a+)+b`）可阻塞 30s 直到 timeout。建议：① 强制超时；② 用 `re2`（如可用）；③ 对 pattern 长度/层级简单 sanity check。

6. **75 处 `: any` / `<any>` 显式 any** + 50 处 `as any`：违反 AGENTS.md 的 "Avoid any". 集中在 `service-holders.ts`、`api-impl.ts`、preload。可借由 shared-types 已有的 `ElectronAPIMigrated` 推进收敛。

7. **`StoreManager` 69 个方法 + `PluginManager` 48 个 + `RemoteDeviceService` 30 个** —— 典型 god class。`PluginManager` 33 处 `console.*`（grep 计数），说明它还兼任"日志通道"。建议把 PluginManager 切成 PluginRegistry / PluginLifecycle / PluginUpdater / PluginPermissionBridge 4 个 class。

8. **`app.ts:190` 未捕获的 server.error 已 reject**
   - start() 内 `this.server.on('error', reject)` 在 listen 成功 resolve 后 reject 会触发未处理 promise rejection。改 `once('error', …)` 并在 listen callback 里 `removeListener`。

### 🟢 P3 — Low

1. `App.tsx:39` 用 `dangerouslySetInnerHTML` 注入 `markdown-theme-css`（受控来源），`MermaidChart.tsx:134` 注入 SVG（依赖 mermaid 输出，理论上是受控的）。两处都标注下"信任域"来源，便于后续审计。
2. 17 处空 catch（`grep` 计数），其中 `bashServer.ts` / `MainLayout.tsx` 等是合理"best-effort cleanup"，但 `useChat.ts` 里的 3 处空 catch 容易吃掉错误，建议至少 `agentLog.debug(err)`。
3. 29 处 TODO/FIXME 集中在 `todoServer.ts`(16)、`tools.ts`(4)、`ApprovalGrantStore.ts`(3)，建议建一个 TODO Issue 票统一跟踪。
4. `regex = new RegExp(pattern, ignoreCase ? "i" : undefined)`（grepServer.ts:121）—— 第二参数传 `undefined` 行为是 OK 的，但语义最好写成 `ignoreCase ? "i" : ""`。
5. `CORS` 中 `Access-Control-Allow-Headers` 缺 `X-Requested-With`/自定义请求 id；如果未来加 trace header 会忘。

---

## 三、Removal / Iteration Plan

### 可安全删除（评估后）

- `src/main/server/auth.ts` **或** `src/main/server/middlewares/auth.ts` 二选一（取决于团队走 JWT 还是单 Key 模式）。
- 因 `useChat`/`api-impl.ts` 拆分而搬走后，原文件本身可缩容。

### 建议的渐进重构（一个 PR 一件事）

| # | 任务 | 预计 | 风险面 |
|---|---|---|---|
| 1 | **Server 安全收敛**：合并/选定 auth 实现；CORS 改严格白名单；JWT secret 持久化或彻底删 server/auth.ts | 0.5d | 本地 server 鉴权 |
| 2 | **拆 `preload/index.ts`** 为按 namespace 的多文件，types 引共享 ElectronAPI | 0.5d | renderer/main 双侧类型对齐 |
| 3 | **拆 `api-impl.ts`** 到 `handlers/*Handler.ts`（按 6-step 模板） | 1d | IPC 注册顺序 |
| 4 | **拆 `useChat.ts`** 为 4 个职责 hook，纯函数下沉 `lib/chat/` | 1-1.5d | chat 主流程回归 |
| 5 | **拆大 Page**（Plugins / IMBot / ModelList）按 Tab/Section 子组件化 | 每个 0.5d | UI 局部 |
| 6 | **MCP Bash 工具加固**：`get_env` 默认要求 `names`；cwd 走 `isBlockedPath`；危险模式正则覆盖 `~` / `$HOME` / 通配 | 0.5d | 工具行为兼容 |
| 7 | **`StoreManager` facade 化**：业务代码不再 import `storeManager`，通过 `AppConfigService` 等读写 | 1.5d | 高影响面 |

---

## 四、Additional Suggestions

- 把 `loop_depth>=2 && alloc_in_loop>0` 的函数（图谱里 ~33 个，含 `ChatMessageList`、`McpMarket`、`stripNakedToolCallEnvelopes`）做一次性能复盘；React 列表里循环内 alloc 通常是 stale memoization。
- 用 `manage_adr(mode='update')` 把 "Main 是唯一 source of truth / IPC 6 步骤模板 / 不允许业务直读 StoreManager" 沉淀成 ADR，便于后续 review 自动对齐。
- 在 CI 增加：`oxlint` 上规则 `no-explicit-any`、对 `src/main/services/**` 加单文件最大行 600 的 lint 阈值。
- 用 codebase-memory-mcp 的 `detect_changes` 在 PR 流水线里输出"本次改动影响到的高 fan-in 节点"，可挡掉 god module 持续膨胀。

---

## 五、问题计数

| 级别 | 数量 | 主类型 |
|---|---|---|
| P0 Critical | 0 | — |
| P1 High | 7 | CORS 放行 / 静态 Key / 死 JWT 模块 / Bash 黑名单 / God Hook / God IPC Module / Preload 巨文件 |
| P2 Medium | 8 | 平行实现 / 状态重复 / Hub 函数 / 大 Page / ReDoS / any 滥用 / God Class / Server 错误处理 |
| P3 Low | 5 | dangerouslySetInnerHTML 标注 / 空 catch / TODO / 微小风格 / 多余 header |

---

## 六、复现命令

```ts
// 1. 索引
mcp.codebase_memory.index_repository({ repo_path: ".", mode: "moderate" });

// 2. 架构概览
mcp.codebase_memory.get_architecture({ project: "Users-mark-myself-code-super-client-r", aspects: ["all"] });

// 3. 找 hotspot
mcp.codebase_memory.query_graph({
  project: "Users-mark-myself-code-super-client-r",
  query: `
    MATCH (f) WHERE (f:Function OR f:Method) AND f.complexity =~ '[2-9][0-9]+'
    RETURN f.name, f.complexity AS cc, f.cognitive, f.lines, f.file_path
  `
});

// 4. 找 god class
mcp.codebase_memory.query_graph({
  project: "Users-mark-myself-code-super-client-r",
  query: `
    MATCH (c:Class) OPTIONAL MATCH (c)-[:DEFINES_METHOD]->(m:Method)
    WITH c, count(m) AS methods RETURN c.name, methods ORDER BY methods DESC
  `
});
```

</content>
</invoke>