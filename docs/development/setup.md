# 环境搭建

本指南详细介绍如何配置 Super Client R 的开发环境。

## 系统要求

### macOS

- macOS 10.15 (Catalina) 或更高版本
- Xcode Command Line Tools

```bash
# 安装 Xcode Command Line Tools
xcode-select --install
```

### Windows

- Windows 10 版本 1903 或更高
- Visual Studio 2022 或 Build Tools
- Python 3.x（用于 node-gyp）

### Linux

- Ubuntu 20.04+ / Debian 10+ / Fedora 32+
- build-essential
- Python 3.x

```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# Fedora
sudo dnf install make gcc gcc-c++ python3
```

## 安装 Node.js

推荐使用 nvm 管理 Node.js 版本：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重启终端或加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 安装 Node.js 22
nvm install 22
nvm use 22
nvm alias default 22

# 验证
node --version  # v22.x.x
npm --version   # 10.x.x
```

## 安装 pnpm

```bash
npm install -g pnpm

# 验证
pnpm --version  # 10.x.x
```

## 配置开发环境

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

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
# 必需：API Keys
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# 可选：开发配置
VITE_DEV_SERVER_PORT=5173
LOG_LEVEL=debug
```

### 4. 配置 VS Code

安装推荐扩展：

- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **Tailwind CSS IntelliSense** - CSS 提示
- **TypeScript Importer** - 自动导入
- **Biome** - 代码质量

创建工作区设置 `.vscode/settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "'"([^'"]+)'""]
  ]
}
```

### 5. 配置调试

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": ["."],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Renderer Process",
      "type": "chrome",
      "request": "attach",
      "port": 9223,
      "webRoot": "${workspaceFolder}",
      "timeout": 30000
    }
  ]
}
```

## 启动开发

### 基本启动

```bash
pnpm dev
```

这将启动：
- Vite 开发服务器（端口 5173）
- Electron 应用
- 热重载（HMR）

### 调试模式

```bash
# 启用详细日志
DEBUG=* pnpm dev

# 仅主进程日志
DEBUG=main:* pnpm dev
```

### 检查代码

```bash
# 类型检查
pnpm check

# 代码检查
pnpm lint

# 格式化
pnpm format

# 全部检查
pnpm check && pnpm lint && pnpm format
```

## 常见问题

### 安装依赖失败

**问题**: `pnpm install` 报错

**解决**:
```bash
# 清除缓存
pnpm store prune
rm -rf node_modules

# 重新安装
pnpm install
```

### 构建失败

**问题**: 缺少构建工具

**解决**:
```bash
# macOS
xcode-select --install

# Windows
# 安装 Visual Studio Build Tools

# Linux
sudo apt-get install build-essential
```

### 端口被占用

**问题**: 端口 5173 被占用

**解决**:
```bash
# 修改 .env
VITE_DEV_SERVER_PORT=5174
```

### Electron 启动白屏

**问题**: 窗口显示空白

**解决**:
1. 检查 Vite 服务器是否启动
2. 查看主进程控制台错误
3. 清除缓存：`rm -rf out node_modules/.vite`

## 高级配置

### 使用代理

```bash
# .env
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
```

### 自定义数据目录

```bash
# macOS
export SUPER_CLIENT_DATA_DIR=/path/to/data

# 或在 .env 中
DATA_DIR=/path/to/data
```

### 禁用 GPU 加速

如果遇到图形问题：

```bash
# .env
ELECTRON_DISABLE_GPU=1
```

## 下一步

- [项目结构](./structure) - 了解代码组织
- [代码规范](./coding-standards) - 编写一致的代码
- [系统架构](./architecture) - 理解整体架构
