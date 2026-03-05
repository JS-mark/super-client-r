# 开发指南

欢迎参与 Super Client R 的开发！本指南将帮助你快速搭建开发环境并了解项目架构。

## 前置要求

- **Node.js** >= 22
- **pnpm** >= 10
- **Git** 任何最新版本
- **VS Code**（推荐）

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/js-mark/super-client-r.git
cd super-client-r

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 添加 API Key

# 4. 启动开发服务器
pnpm dev
```

## 开发工作流

### 分支管理

```bash
# 创建功能分支
git checkout -b feature/my-feature

# 提交更改
git add .
git commit -m "feat: add new feature"

# 推送分支
git push origin feature/my-feature
```

### 代码检查

```bash
# 类型检查
pnpm check

# 代码检查
pnpm lint

# 格式化
pnpm format
```

### 提交前检查

```bash
# 运行所有检查
pnpm check && pnpm lint
```

## 项目结构

```
src/
├── main/                   # Electron 主进程 (Node.js)
│   ├── ipc/               # IPC 通信
│   ├── services/          # 业务服务
│   ├── server/            # Koa HTTP 服务器
│   └── store/             # Electron store
├── preload/               # 预加载脚本
└── renderer/              # 渲染进程 (React)
    ├── pages/             # 页面组件
    ├── components/        # UI 组件
    ├── hooks/             # 自定义 hooks
    └── stores/            # Zustand stores
```

## 调试

### 主进程调试

1. 在 VS Code 中按 `F5`
2. 或使用 `pnpm dev` 后查看终端输出

### 渲染进程调试

1. 按 `Cmd/Ctrl + Shift + I` 打开 DevTools
2. 或使用 VS Code 调试配置

### 常见问题

- **IPC 无响应**：检查通道定义和处理器注册
- **类型错误**：运行 `pnpm check` 查看详情
- **样式不生效**：检查 Tailwind 配置

## 下一步

- [环境搭建](./setup) - 详细的开发环境配置
- [项目结构](./structure) - 深入了解代码组织
- [代码规范](./coding-standards) - 编写一致的代码
- [系统架构](./architecture) - 理解整体架构
- [IPC 通信](./ipc) - 进程间通信机制
- [状态管理](./state) - Zustand 状态管理
- [贡献指南](./contributing) - 参与项目贡献
- [插件开发](../PLUGIN_DEVELOPMENT.md) - 开发自定义插件
