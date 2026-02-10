# 安装指南

本文档详细介绍 Super Client R 的安装方法，包括开发环境搭建和生产构建。

## 系统要求

### 最低配置

- **操作系统**: macOS 10.15+ / Windows 10+ / Linux
- **内存**: 4 GB RAM
- **磁盘空间**: 500 MB 可用空间
- **Node.js**: >= 22
- **pnpm**: >= 10

### 推荐配置

- **内存**: 8 GB RAM 或更多
- **磁盘空间**: 1 GB 可用空间
- **网络**: 稳定的互联网连接（用于 AI API 调用）

## 开发环境安装

### 1. 安装 Node.js

使用 nvm（推荐）：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装 Node.js 22
nvm install 22
nvm use 22

# 验证
node --version  # v22.x.x
```

或从 [nodejs.org](https://nodejs.org/) 下载安装包。

### 2. 安装 pnpm

```bash
npm install -g pnpm

# 验证
pnpm --version  # 10.x.x
```

### 3. 克隆项目

```bash
git clone https://github.com/js-mark/super-client-r.git
cd super-client-r
```

### 4. 安装依赖

```bash
pnpm install
```

### 5. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# 必需：Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-...

# 可选：OpenAI API Key
OPENAI_API_KEY=sk-...

# 可选：开发服务器端口
VITE_DEV_SERVER_PORT=5173

# 可选：日志级别
LOG_LEVEL=info
```

### 6. 启动应用

```bash
pnpm dev
```

## 生产构建

### macOS

```bash
# 构建通用版本（Intel + Apple Silicon）
pnpm build:mac

# 输出位置
# dist/Super Client-0.0.1.dmg
# dist/Super Client-0.0.1-mac.zip
```

### Windows

```bash
# 构建 Windows 版本
pnpm build:win

# 输出位置
# dist/Super Client Setup 0.0.1.exe
```

### Linux

```bash
# 构建 Linux 版本
pnpm build:linux

# 输出位置
# dist/super-client-r_0.0.1_amd64.deb
```

## Docker 部署（可选）

虽然 Super Client R 主要是桌面应用，但 HTTP API 服务可以单独部署：

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["node", "out/main/main.js"]
```

构建和运行：

```bash
docker build -t super-client-r .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=xxx super-client-r
```

## 故障排除

### 安装依赖失败

**问题**: `pnpm install` 失败

**解决方案**:
```bash
# 清除缓存
pnpm store prune

# 删除 node_modules
rm -rf node_modules

# 重新安装
pnpm install
```

### 构建失败

**问题**: `pnpm build` 报错

**解决方案**:
```bash
# 检查类型错误
pnpm check

# 清除构建目录
rm -rf out dist

# 重新构建
pnpm build
```

### 启动白屏

**问题**: Electron 窗口显示空白

**解决方案**:
1. 检查开发服务器是否启动（端口 5173）
2. 查看主进程控制台错误
3. 检查 preload 脚本是否正确加载

### 图标显示异常

```bash
# 重新生成图标
pnpm build:icons
```

## 更新

### 更新到最新版本

```bash
# 拉取最新代码
git pull origin main

# 更新依赖
pnpm install

# 重新构建
pnpm build
```

### 清理旧版本

```bash
# 删除旧构建
rm -rf out dist

# 清除缓存
pnpm store prune
```

## 卸载

```bash
# 删除项目目录
rm -rf super-client-r

# 删除配置（macOS）
rm -rf ~/Library/Application\ Support/super-client-r

# 删除配置（Windows）
# %APPDATA%\super-client-r

# 删除配置（Linux）
rm -rf ~/.config/super-client-r
```

## 下一步

- [快速开始](./getting-started) - 开始使用应用
- [AI 聊天](./features/chat) - 了解聊天功能
- [开发指南](../development/) - 参与项目开发
