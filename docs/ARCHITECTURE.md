# Super Client R - 架构设计文档

## 1. 项目概述

**Super Client R** 是一个基于 Electron 的 AI 客户端桌面应用，集成了 Claude AI、MCP (Model Context Protocol)、Skill 系统等能力，提供智能对话、工具调用、插件扩展等功能。

### 1.1 核心特性
- **AI 对话**: 基于 Claude SDK 的智能对话系统
- **MCP 支持**: Model Context Protocol 服务器管理
- **Skill 系统**: 可扩展的工具和插件体系
- **本地 API**: 内置 Koa HTTP 服务器
- **多语言**: i18n 国际化支持
- **浮动组件**: 悬浮窗交互支持

### 1.2 技术栈
| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron | ^38.7.2 |
| UI | React + Ant Design | ^19.2.3 / ^6.2.1 |
| 构建 | Vite + electron-vite | ^7.3.1 / ^5.0.0 |
| 状态 | Zustand | ^5.0.10 |
| 样式 | Tailwind CSS | ^4.1.18 |
| 语言 | TypeScript | ~5.8.3 |
| 服务器 | Koa | ^3.1.1 |

---

## 2. 整体架构

### 2.1 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                        表现层 (Renderer)                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │   Pages     │ │ Components  │ │    Hooks    │ │   Stores   │ │
│  │  (页面路由)  │ │  (UI组件)   │ │  (业务逻辑)  │ │  (状态管理) │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      通信层 (Preload + IPC)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Preload Script (安全桥梁)  ↔  IPC Channels (通道定义)      │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        服务层 (Main)                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │   Window    │ │    IPC      │ │  Services   │ │   Server   │ │
│  │  (窗口管理)  │ │  (处理程序)  │ │  (业务服务)  │ │  (本地API)  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      数据层 (Store + Utils)                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ Electron    │ │   Logger    │ │    Path     │ │    i18n    │ │
│  │   Store     │ │  (日志系统)  │ │  (路径服务)  │ │  (国际化)   │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 进程架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Main Window (BrowserWindow)                              │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Renderer Process (Chromium)             │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │  │
│  │  │  │  React App                                    │  │  │  │
│  │  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │  │  │
│  │  │  │  │  Chat   │ │  Agent  │ │  Skill  │ ...    │  │  │  │
│  │  │  │  └─────────┘ └─────────┘ └─────────┘        │  │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Floating Widget Window                                    │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Renderer Process (Chromium)             │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │  │
│  │  │  │  FloatWidget Component                        │  │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │  Koa Server │ │   Tray      │ │ IPC Handlers│               │
│  │  (localhost)│ │  (系统托盘)  │ │ (事件处理)   │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 模块架构

### 3.1 模块依赖关系

```
                    ┌─────────────┐
                    │   Chat      │
                    │   Module    │
                    └──────┬──────┘
                           │ uses
                           ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Skill     │◄────►│   Agent     │◄────►│    MCP      │
│   Module    │      │   Module    │      │   Module    │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │ depends on
                            ▼
                    ┌─────────────┐
                    │  Anthropic  │
                    │  Claude SDK │
                    └─────────────┘
```

### 3.2 核心模块职责

| 模块 | 职责 | 关键服务 |
|------|------|----------|
| **Agent** | AI 会话管理、消息流、工具调用 | AgentService |
| **Skill** | 技能安装/卸载/执行 | SkillService |
| **MCP** | MCP 服务器管理、工具发现 | McpService |
| **Chat** | 消息历史、界面交互 | ChatStore |
| **API** | HTTP 服务、代理转发 | Koa Server |

---

## 4. 详细设计

### 4.1 主进程架构 (Main Process)

```
src/main/
├── main.ts                 # 入口：窗口管理、生命周期
├── ipc/
│   ├── channels.ts         # IPC 通道定义
│   ├── types.ts            # IPC 类型定义
│   ├── index.ts            # IPC 注册入口
│   └── handlers/           # IPC 处理器
│       ├── agentHandlers.ts
│       ├── skillHandlers.ts
│       ├── mcpHandlers.ts
│       ├── appHandlers.ts
│       └── apiHandlers.ts
├── services/               # 业务服务层
│   ├── agent/
│   │   └── AgentService.ts
│   ├── mcp/
│   │   └── McpService.ts
│   ├── skill/
│   │   └── SkillService.ts
│   ├── index.ts
│   ├── agent.ts
│   └── pathService.ts
├── server/                 # Koa HTTP 服务器
│   ├── index.ts
│   ├── app.ts
│   ├── config.ts
│   ├── middlewares/
│   └── routes/
├── store/                  # 持久化存储
│   └── StoreManager.ts
└── utils/                  # 工具函数
    └── logger.ts
```

### 4.2 渲染进程架构 (Renderer Process)

```
src/renderer/src/
├── main.tsx                # React 入口
├── App.tsx                 # 根组件
├── router.tsx              # 路由配置
├── index.css               # 全局样式
├── pages/                  # 页面组件
│   ├── Chat.tsx
│   ├── Skills.tsx
│   ├── Models.tsx
│   ├── Settings.tsx
│   ├── Login.tsx
│   ├── Home.tsx
│   └── FloatWidget.tsx
├── components/             # UI 组件
│   ├── layout/
│   │   └── MainLayout.tsx
│   ├── chat/
│   │   └── ChatInput.tsx
│   ├── models/
│   │   ├── ModelList.tsx
│   │   └── McpConfig.tsx
│   ├── settings/
│   │   └── MenuSettings.tsx
│   ├── Empty.tsx
│   ├── ErrorBoundary.tsx
│   └── Markdown.tsx
├── hooks/                  # 自定义 Hooks
│   ├── useChat.ts
│   ├── useAgent.ts
│   ├── useSkill.ts
│   ├── useMcp.ts
│   └── useTheme.ts
├── stores/                 # Zustand 状态管理
│   ├── chatStore.ts
│   ├── agentStore.ts
│   ├── skillStore.ts
│   ├── mcpStore.ts
│   └── modelStore.ts
├── services/               # 服务客户端
│   ├── agent/
│   ├── mcp/
│   ├── skill/
│   ├── llm/
│   ├── apiService.ts
│   ├── appService.ts
│   └── agentClient.ts
├── types/                  # TypeScript 类型
│   ├── index.ts
│   ├── mcp.ts
│   ├── models.ts
│   ├── skills.ts
│   └── menu.ts
└── i18n/                   # 国际化
    ├── index.ts
    └── locales/
```

### 4.3 预加载脚本 (Preload)

```
src/preload/
└── index.ts                # 暴露安全 API 到渲染进程
```

**设计原则**: Context Isolation 启用，通过 `contextBridge` 暴露最小化的 API。

---

## 5. 通信机制

### 5.1 IPC 通道分类

```typescript
// Agent 通道
agent:create-session      // 创建会话
agent:send-message        // 发送消息
agent:stream-event        // 流式事件

// Skill 通道
skill:list                // 列出技能
skill:install             // 安装技能
skill:execute             // 执行技能

// MCP 通道
mcp:connect               // 连接服务器
mcp:disconnect            // 断开连接
mcp:get-tools             // 获取工具

// App 通道
app:get-info              // 应用信息
app:open-dev-tools        // 开发者工具

// API Server 通道
api:get-status            // 服务器状态
api:start                 // 启动服务器
```

### 5.2 通信模式

| 模式 | 使用场景 | 实现方式 |
|------|----------|----------|
| **Request/Response** | 同步调用 | `ipcRenderer.invoke` + `ipcMain.handle` |
| **Event (Main→Renderer)** | 服务端推送 | `webContents.send` + `ipcRenderer.on` |
| **Event (Renderer→Main)** | 单向通知 | `ipcRenderer.send` + `ipcMain.on` |
| **Stream** | 流式数据 (AI 响应) | EventEmitter + 逐块传输 |

---

## 6. 状态管理

### 6.1 Zustand Store 设计

```typescript
// 每个模块独立 Store，支持持久化
interface ChatStore {
  messages: ChatMessage[];
  currentSession: string | null;
  addMessage: (msg: ChatMessage) => void;
  clearSession: () => void;
}

interface AgentStore {
  sessions: AgentSession[];
  currentSession: string | null;
  streamingContent: Record<string, string>;
}
```

### 6.2 持久化策略

| 数据类型 | 存储位置 | 持久化方式 |
|----------|----------|------------|
| 用户配置 | electron-store | 自动保存 |
| 聊天记录 | electron-store | 手动触发 |
| 会话状态 | Memory | 不持久化 |
| Skill 数据 | File System | 安装时保存 |

---

## 7. 扩展机制

### 7.1 Skill 系统架构

```
Skill Package Structure:
skill-name/
├── manifest.json           # 技能元数据
├── index.js                # 入口文件
├── tools/
│   └── tool-definitions    # 工具定义
└── assets/
    └── icons/              # 图标资源
```

### 7.2 MCP 集成

```
MCP Server Config:
{
  id: string;
  name: string;
  command: string;          // 启动命令
  args?: string[];          // 启动参数
  env?: Record<string, string>;
}
```

---

## 8. 安全设计

### 8.1 进程隔离
- Context Isolation: **启用**
- Node Integration: **禁用** (Renderer)
- Sandbox: **生产环境启用**

### 8.2 代码安全
- Preload 脚本是最小化暴露的 API 边界
- IPC 通道严格类型化
- 用户输入验证在服务层进行

### 8.3 数据安全
- 敏感配置使用 electron-store 加密存储
- 日志脱敏处理
- 本地服务器使用 Token 认证

---

## 9. 构建与部署

### 9.1 构建流程

```
1. TypeScript 编译 (tsc -b)
   ├── tsconfig.node.json  → Main/Preload
   └── tsconfig.web.json   → Renderer

2. Vite 构建 (electron-vite build)
   ├── Main Process        → out/main/
   ├── Preload             → out/preload/
   └── Renderer            → out/renderer/

3. 打包 (electron-builder)
   └── dist/               → 可执行文件
```

### 9.2 开发工作流

```bash
# 开发模式
pnpm dev                  # 启动热重载开发

# 代码检查
pnpm lint                 # oxlint 检查
pnpm lint:biome           # Biome 检查
pnpm check                # TypeScript 类型检查

# 构建
pnpm build                # 完整构建

# i18n
pnpm i18n:check           # 检查翻译完整性
pnpm i18n:translate       # 自动翻译
```

---

## 10. 性能优化

### 10.1 启动优化
- 使用 Vite 快速 HMR
- 延迟加载非核心模块
- 主窗口与浮动窗口按需创建

### 10.2 运行时优化
- Zustand 选择性订阅
- 大列表虚拟化
- 图片懒加载
- Markdown 渲染优化

### 10.3 内存管理
- 及时清理会话数据
- 限制历史消息数量
- 定期垃圾回收

---

## 11. 扩展阅读

- [开发指南](./DEVELOPMENT.md)
- [代码规范](./CODING_STANDARDS.md)
- [API 文档](./API.md)
- [项目结构](./PROJECT_STRUCTURE.md)
