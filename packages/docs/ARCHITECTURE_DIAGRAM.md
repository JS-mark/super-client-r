# Super Client R - 架构设计图

本文档使用 Mermaid 语法描述系统架构，可在支持 Mermaid 的编辑器中渲染查看。

---

## 1. 整体系统架构

```mermaid
graph TB
    subgraph "桌面应用层"
        A[Electron Main Process<br/>Node.js 环境]
        B[Electron Renderer Process<br/>Chromium 环境]
        C[Preload Script<br/>安全桥梁]
    end

    subgraph "外部服务"
        D[Claude AI API<br/>Anthropic SDK]
        E[MCP Servers<br/>本地/远程工具]
        F[外部 HTTP API<br/>第三方服务]
    end

    subgraph "本地基础设施"
        G[Koa HTTP Server<br/>本地 API 服务]
        H[Electron Store<br/>持久化存储]
        I[文件系统<br/>技能/配置]
    end

    A <-->|IPC 通信| C
    C <-->|contextBridge| B
    A -->|调用| D
    A <-->|MCP 协议| E
    A -->|启动| G
    A -->|读写| H
    A -->|管理| I
    G -->|代理| F
```

---

## 2. 进程间通信 (IPC) 架构

```mermaid
sequenceDiagram
    participant R as Renderer Process
    participant P as Preload Script
    participant M as Main Process
    participant S as Service
    participant API as External API

    R->>P: window.electronAPI.agent.createSession()
    P->>M: ipcRenderer.invoke('agent:create-session')
    M->>S: agentService.createSession()
    S->>API: anthropic.messages.create()
    API-->>S: Stream response
    loop Stream Chunks
        S->>M: this.emit('stream-chunk')
        M->>P: win.webContents.send('agent:stream-chunk')
        P->>R: callback(chunk)
    end
    S-->>M: Session created
    M-->>P: { success: true, data: session }
    P-->>R: Promise<Session>
```

---

## 3. Main Process 服务架构

```mermaid
graph LR
    subgraph "Main Process 核心"
        M[main.ts<br/>应用生命周期管理]
    end

    subgraph "IPC 层"
        I[IPC Handlers<br/>6个处理器模块]
        C[Channel Definitions<br/>通道定义]
        T[Type Definitions<br/>类型定义]
    end

    subgraph "核心服务层"
        A[AgentService<br/>AI 对话管理]
        S[SkillService<br/>技能系统]
        MCP[McpService<br/>MCP 服务器管理]
        P[PathService<br/>路径管理]
        PR[ProtocolService<br/>协议处理]
    end

    subgraph "基础设施层"
        ST[StoreManager<br/>持久化存储]
        SV[Koa Server<br/>HTTP 服务]
        L[Logger<br/>日志系统]
    end

    M --> I
    I --> C
    I --> T
    I --> A
    I --> S
    I --> MCP
    A --> ST
    S --> ST
    MCP --> ST
    S --> P
    MCP --> P
    M --> SV
    M --> PR
    A --> L
    S --> L
    MCP --> L
```

---

## 4. Renderer Process 架构

```mermaid
graph TB
    subgraph "应用入口"
        M[main.tsx<br/>React 入口]
        A[App.tsx<br/>根组件]
        R[router.tsx<br/>路由配置]
    end

    subgraph "页面层 Pages"
        P1[Chat.tsx<br/>对话页面]
        P2[Settings.tsx<br/>设置页面]
        P3[Skills.tsx<br/>技能管理]
        P4[Home.tsx<br/>首页]
        P5[Models.tsx<br/>模型配置]
        P6[Login.tsx<br/>登录]
    end

    subgraph "组件层 Components"
        C1[ChatInput.tsx<br/>输入组件]
        C2[ModelList.tsx<br/>模型列表]
        C3[McpConfig.tsx<br/>MCP配置]
        C4[MainLayout.tsx<br/>布局组件]
        C5[Markdown.tsx<br/>渲染组件]
    end

    subgraph "状态管理层 Stores"
        S1[chatStore.ts<br/>对话状态]
        S2[agentStore.ts<br/>Agent状态]
        S3[skillStore.ts<br/>技能状态]
        S4[mcpStore.ts<br/>MCP状态]
        S5[userStore.ts<br/>用户状态]
    end

    subgraph "业务逻辑层 Hooks"
        H1[useChat.ts<br/>对话逻辑]
        H2[useAgent.ts<br/>Agent交互]
        H3[useMcp.ts<br/>MCP管理]
        H4[useSkill.ts<br/>技能执行]
    end

    subgraph "服务层 Services"
        SV1[agentService.ts<br/>Agent IPC]
        SV2[mcpService.ts<br/>MCP IPC]
        SV3[skillService.ts<br/>Skill IPC]
        SV4[claude.ts<br/>直接API]
    end

    M --> A
    A --> R
    R --> P1
    R --> P2
    R --> P3
    R --> P4
    R --> P5
    R --> P6

    P1 --> C1
    P1 --> C5
    P2 --> C2
    P2 --> C3
    P3 --> C4
    P4 --> C4
    P5 --> C2

    P1 --> H1
    P1 --> H2
    P3 --> H4
    P5 --> H3

    H1 --> S1
    H2 --> S2
    H4 --> S3
    H3 --> S4

    H1 --> SV1
    H1 --> SV4
    H2 --> SV1
    H3 --> SV2
    H4 --> SV3

    S1 -.->|persist| LS[(localStorage)]
```

---

## 5. 数据流架构

```mermaid
graph LR
    subgraph "数据源"
        API[Claude API]
        MCP[MCP Servers]
    end

    subgraph "Main Process"
        AS[AgentService]
        MS[McpService]
        IPC[IPC Broadcast]
    end

    subgraph "Renderer Process"
        R1[Window 1 Store]
        R2[Window 2 Store]
        C1[Component A]
        C2[Component B]
    end

    API -->|Stream| AS
    MCP -->|Tools| MS
    AS -->|Events| IPC
    MS -->|Events| IPC
    IPC -->|Push| R1
    IPC -->|Push| R2
    R1 --> C1
    R2 --> C2
```

---

## 6. 技能系统架构

```mermaid
graph TB
    subgraph "技能生命周期"
        I[安装 Install<br/>本地/远程/市场]
        L[加载 Load<br/>解析 manifest]
        E[启用 Enable<br/>注册工具]
        X[执行 Execute<br/>调用处理函数]
        D[禁用 Disable<br/>注销工具]
        U[卸载 Uninstall<br/>清理文件]
    end

    subgraph "技能组成"
        M[manifest.json<br/>元数据定义]
        C[代码逻辑<br/>TypeScript/JavaScript]
        A[资源文件<br/>图标/模板]
    end

    subgraph "技能类型"
        T1[内置技能<br/>Built-in]
        T2[本地技能<br/>Local]
        T3[远程技能<br/>Remote]
    end

    I --> L --> E --> X
    X --> D
    D --> U

    M --> C
    C --> A

    T1 --> M
    T2 --> M
    T3 --> M
```

---

## 7. MCP (Model Context Protocol) 架构

```mermaid
graph TB
    subgraph "MCP 客户端"
        MC[McpService<br/>主进程服务]
        CT[ClientTransport<br/>stdio/sse]
    end

    subgraph "MCP 服务器"
        S1[文件系统服务器<br/>filesystem]
        S2[Git 服务器<br/>git]
        S3[数据库服务器<br/>database]
        S4[自定义服务器<br/>custom]
    end

    subgraph "工具暴露"
        T1[read_file]
        T2[write_file]
        T3[git_commit]
        T4[sql_query]
    end

    MC --> CT
    CT -->|stdio| S1
    CT -->|stdio| S2
    CT -->|sse| S3
    CT -->|stdio| S4

    S1 --> T1
    S1 --> T2
    S2 --> T3
    S3 --> T4

    T1 -.->|JSON-RPC| MC
    T2 -.->|JSON-RPC| MC
    T3 -.->|JSON-RPC| MC
    T4 -.->|JSON-RPC| MC
```

---

## 8. 本地 HTTP API 架构

```mermaid
graph TB
    subgraph "Koa Server"
        M[Middleware Stack]
        R[Router]
    end

    subgraph "中间件"
        C[CORS<br/>跨域处理]
        A[Auth<br/>API Key 验证]
        E[Error<br/>错误处理]
        S[Swagger<br/>文档生成]
    end

    subgraph "路由"
        H[Health<br/>健康检查]
        P[Proxy<br/>API 代理]
        AP[Agent<br/>Agent 接口]
    end

    subgraph "外部调用"
        CL[CLI 工具]
        WEB[Web 应用]
        MO[移动应用]
    end

    M --> C
    M --> A
    M --> E
    M --> S
    M --> R

    R --> H
    R --> P
    R --> AP

    CL -->|HTTP| M
    WEB -->|HTTP| M
    MO -->|HTTP| M

    P -->|转发| Claude[Claude API]
```

---

## 9. 窗口管理架构

```mermaid
graph TB
    subgraph "窗口类型"
        M[MainWindow<br/>主窗口]
        F[FloatWidget<br/>悬浮窗]
    end

    subgraph "窗口状态"
        N[Normal<br/>正常]
        MI[Minimized<br/>最小化]
        MA[Maximized<br/>最大化]
        FS[FullScreen<br/>全屏]
        H[Hidden<br/>隐藏]
    end

    subgraph "通信方式"
        I[IPC 调用]
        E[Event 广播]
    end

    M --> N
    M --> MI
    M --> MA
    M --> FS
    F --> H
    F --> N

    M <-->|窗口控制| I
    F <-->|窗口控制| I
    M <-->|状态同步| E
    F <-->|状态同步| E
```

---

## 10. 安全架构

```mermaid
graph TB
    subgraph "安全层"
        P[Preload Script<br/>上下文隔离]
        C[Context Bridge<br/>受控暴露]
    end

    subgraph "验证机制"
        I[Input Validation<br/>输入验证]
        A[API Key 管理<br/>加密存储]
        S[Session 隔离<br/>会话隔离]
    end

    subgraph "权限控制"
        F[文件系统<br/>沙箱访问]
        N[网络请求<br/>CORS限制]
        M[Main Process<br/>Node 权限]
    end

    P --> C
    C --> I
    I --> A
    A --> S
    S --> F
    S --> N
    S --> M
```

---

## 11. 模块依赖关系

```mermaid
graph TD
    subgraph "依赖层级"
        L1[基础设施层<br/>Utils, Config]
        L2[服务层<br/>Services]
        L3[业务层<br/>Handlers, Hooks]
        L4[表现层<br/>Components, Pages]
    end

    subgraph "具体模块"
        U[utils/]
        S[services/]
        H[handlers/]
        ST[stores/]
        C[components/]
        P[pages/]
    end

    L1 --> U
    L2 --> S
    L3 --> H
    L3 --> ST
    L4 --> C
    L4 --> P

    U --> S
    S --> H
    H --> ST
    ST --> C
    C --> P

    style L1 fill:#e1f5fe
    style L2 fill:#fff3e0
    style L3 fill:#f3e5f5
    style L4 fill:#e8f5e9
```

---

## 12. 部署架构

```mermaid
graph TB
    subgraph "开发环境"
        DEV[Dev Server<br/>Vite HMR]
        TSC[TypeScript<br/>类型检查]
        LINT[Lint<br/>代码检查]
    end

    subgraph "构建流程"
        BUILD[Vite Build<br/>打包]
        ELECTRON[Electron Builder<br/>应用打包]
    end

    subgraph "目标平台"
        W[Windows<br/>.exe/.msi]
        M[macOS<br/>.dmg/.zip]
        L[Linux<br/>.AppImage/.deb]
    end

    subgraph "分发渠道"
        G[GitHub Releases]
        U[自动更新<br/>electron-updater]
    end

    DEV --> BUILD
    TSC --> BUILD
    LINT --> BUILD
    BUILD --> ELECTRON
    ELECTRON --> W
    ELECTRON --> M
    ELECTRON --> L
    W --> G
    M --> G
    L --> G
    G --> U
```

---

## 如何查看这些图表

1. **VS Code**: 安装 "Markdown Preview Mermaid Support" 插件
2. **GitHub**: 原生支持 Mermaid 渲染
3. **在线工具**: 使用 https://mermaid.live 粘贴代码查看
4. **Claude Artifacts**: 在 Claude 中直接渲染

---

## 架构设计原则

| 原则 | 说明 |
|------|------|
| **单一职责** | 每个模块只负责一个功能领域 |
| **依赖倒置** | 高层模块不依赖低层模块，都依赖抽象 |
| **IPC 隔离** | 主进程与渲染进程通过明确定义的通道通信 |
| **状态集中** | Main Process 作为状态的唯一真实来源 |
| **类型安全** | 全链路 TypeScript 类型覆盖 |
| **安全优先** | 最小权限原则，输入验证，上下文隔离 |
