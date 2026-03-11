# Super Client R - Memory

> 📍 位置：`.claude/memory/` - 项目内的持久化记忆目录，可以通过 git 版本控制

## 项目概览

**Super Client R** 是一个基于 Electron 的桌面 AI 客户端应用，主要特性：
- AI 对话（Claude SDK）
- MCP 服务器管理
- 技能系统（Skill system）
- 本地 HTTP API 服务器
- 浮动小部件
- 国际化支持

## 技术栈核心

- **框架**: Electron ^38.7.2 + React ^19.2.3
- **构建**: Vite + electron-vite
- **状态管理**: Zustand ^5.0.10
- **样式**: Tailwind CSS ^4.1.18
- **语言**: TypeScript ~5.8.3
- **包管理**: pnpm

## 架构关键点

### 1. IPC 通信模式（6步法）
添加 IPC 功能必须按顺序完成：
1. `channels.ts` - 定义 channel（kebab-case）
2. `types.ts` - 定义类型
3. `handlers/` - 实现 handler
4. `ipc/index.ts` - 注册 handler
5. `preload/index.ts` - 暴露 API
6. `renderer/services/` - 创建客户端

### 2. 进程隔离原则
- **Main Process**: 单一数据源，使用 EventEmitter
- **Renderer Process**: 通过 IPC 同步状态，禁止直接使用 Node API
- **Preload**: 安全桥接，只暴露最小 API

### 3. 状态同步模式
Main Process 是真相源 → 通过 `webContents.send()` 广播 → Renderer 监听更新 Zustand store

## 开发规范

### 命名约定
- Components: `PascalCase` (ChatInput.tsx)
- Hooks: `camelCase` (useChat.ts)
- IPC Channels: `kebab-case` (agent:create-session)
- Services: `PascalCase` (AgentService.ts)

### 必须遵守
- IPC handler 返回 `{ success, data?, error? }` 格式
- React 组件使用 `useCallback` 处理事件
- 所有异步操作包裹 try-catch
- 使用 `cn()` 合并 Tailwind 类名
- 事件监听器必须在 useEffect 中返回清理函数

## 常用命令

```bash
pnpm dev      # 开发服务器
pnpm check    # 类型检查
pnpm lint     # 代码检查
pnpm build    # 生产构建
```

## 项目结构要点

```
src/
├── main/          # Node.js 环境，可用所有 Node API
│   ├── ipc/       # IPC 通信层
│   ├── services/  # 业务服务（EventEmitter）
│   └── server/    # Koa HTTP 服务器
├── preload/       # 安全桥接层
└── renderer/      # 浏览器环境，禁用 Node API
    ├── stores/    # Zustand 状态
    └── services/  # IPC 客户端
```

## 最近工作记录

### 环境配置改进（2026-03-07）
- 将 API base_url 移至环境变量
- 创建 `AppConfigService` 管理应用初始化配置
- node-auth 和 super-client-r 都使用环境变量配置
- 文档：`packages/docs/APP_INIT_CONFIG.md`

### Monorepo 重构（2026-03-04）
- 轻量级 workspace 结构
- 共享类型包：`packages/shared-types`
- 文档迁移：`packages/docs`
- 使用 pnpm workspace

## 详细文档链接

- [架构设计](./architecture.md) - 详细架构说明
- [开发规范](./coding-standards.md) - 完整代码规范
- [调试指南](./debugging.md) - 常见问题排查
