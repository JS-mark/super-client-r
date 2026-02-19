# 快速开始

本指南将帮助你在几分钟内启动并运行 Super Client R。

## 环境要求

- **Node.js**: >= 22
- **pnpm**: >= 10
- **Git**: 任何最新版本

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/js-mark/super-client-r.git
cd super-client-r
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

复制环境变量示例文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，添加你的 API 密钥：

```bash
# Anthropic API Key（用于 Claude）
ANTHROPIC_API_KEY=your_api_key_here

# 其他可选配置
VITE_DEV_SERVER_PORT=5173
```

### 4. 启动开发服务器

```bash
pnpm dev
```

这将启动 Electron 应用，并启用热重载（HMR）功能。

## 首次使用

### 1. 配置 AI 模型

首次启动后，你需要配置 AI 模型：

1. 打开**设置**页面
2. 进入**模型**选项卡
3. 点击**添加模型**
4. 输入你的 API 密钥
5. 选择模型类型（Claude、OpenAI 等）

### 2. 开始聊天

1. 返回**聊天**页面
2. 选择聊天模式：
   - **Direct**: 直接与 AI 对话
   - **Agent**: 使用 Agent 模式，支持工具调用
   - **Skill**: 使用已安装的技能
   - **MCP**: 连接 MCP 服务器
3. 在输入框中输入消息，按 Enter 发送

### 3. 安装插件

1. 进入**插件**页面
2. 在**插件市场**标签页浏览可用插件
3. 点击**安装**按钮（如 Prompt Templates 插件）
4. 切换到**已安装**标签页，启用插件
5. 插件激活后可执行命令，结果可复制或直接用于聊天

### 4. 安装技能

1. 进入**技能**页面
2. 浏览技能市场
3. 点击**安装**按钮安装感兴趣的技能
4. 安装后可在聊天中使用

## 常用命令

```bash
# 开发
pnpm dev                  # 启动开发服务器

# 代码质量
pnpm check               # TypeScript 类型检查
pnpm lint                # 代码检查
pnpm format              # 格式化代码

# 构建
pnpm build               # 构建生产版本
pnpm build:mac           # 构建 macOS 版本
```

## 项目结构

```
super-client-r/
├── src/
│   ├── main/              # Electron 主进程
│   ├── preload/           # 预加载脚本
│   └── renderer/          # 渲染进程 (React)
├── docs/                  # 文档
├── build/                 # 构建资源
└── out/                   # 输出目录
```

## 故障排除

### 启动失败

如果应用无法启动，请检查：

1. Node.js 版本是否 >= 22
2. pnpm 是否正确安装
3. 依赖是否完整安装（删除 `node_modules` 重新安装）

### IPC 通信问题

如果主进程和渲染进程通信异常：

1. 检查 `src/main/ipc/channels.ts` 中的通道定义
2. 确认处理器已正确注册
3. 查看主进程控制台错误日志

### 构建错误

1. 运行 `pnpm check` 检查类型错误
2. 清除 `out/` 目录后重试
3. 检查是否有循环依赖

## 下一步

- [安装指南](./installation) - 更详细的安装说明
- [AI 聊天](./features/chat) - 了解聊天功能
- [MCP 服务器](./features/mcp) - 配置 MCP 连接
- [技能系统](./features/skills) - 开发自定义技能
- [插件开发](../PLUGIN_DEVELOPMENT.md) - 开发自定义插件
