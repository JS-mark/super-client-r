# 贡献指南

感谢你对 Super Client R 的兴趣！本文档将指导你如何参与项目开发。

## 行为准则

- 尊重所有参与者
- 接受建设性批评
- 关注对社区最有利的事情

## 如何贡献

### 报告问题

如果你发现了 bug 或有功能建议：

1. 搜索现有 issues，避免重复
2. 使用 issue 模板创建新 issue
3. 提供详细的信息：
   - 问题描述
   - 复现步骤
   - 期望行为
   - 实际行为
   - 环境信息（OS、Node 版本等）
   - 截图或日志（如有）

### 提交代码

#### 1. Fork 项目

```bash
# 点击 GitHub 上的 Fork 按钮
# 然后克隆你的 fork
git clone https://github.com/YOUR_USERNAME/super-client-r.git
cd super-client-r
```

#### 2. 创建分支

```bash
# 基于 main 创建功能分支
git checkout -b feature/my-feature

# 或修复分支
git checkout -b fix/issue-number
```

#### 3. 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 编写代码...
```

#### 4. 提交更改

```bash
# 检查代码
pnpm check
pnpm lint

# 提交
git add .
git commit -m "feat: add new feature"
```

#### 5. 推送并创建 PR

```bash
git push origin feature/my-feature
```

然后在 GitHub 上创建 Pull Request。

## 开发规范

### 提交信息格式

```
<type>: <subject>

<body>

<footer>
```

**类型：**

- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式调整（不影响代码逻辑）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建/工具

**示例：**

```
feat: add MCP server management UI

- Add server list view with status indicators
- Implement server connection dialog
- Add tool execution interface

Closes #123
```

### 代码规范

- 遵循现有代码风格
- 所有代码必须通过类型检查：`pnpm check`
- 所有代码必须通过 lint：`pnpm lint`
- 添加必要的测试
- 更新相关文档

### PR 规范

1. **标题**：简洁描述更改
2. **描述**：
   - 更改内容
   - 原因/动机
   - 测试方法
   - 截图（UI 更改）
3. **检查清单**：
   - [ ] 代码通过类型检查
   - [ ] 代码通过 lint
   - [ ] 添加了测试
   - [ ] 更新了文档
   - [ ] 本地测试通过

## 开发流程

### 设置开发环境

```bash
# 1. 克隆项目
git clone https://github.com/js-mark/super-client-r.git
cd super-client-r

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 添加必要的 API Key

# 4. 启动开发
pnpm dev
```

### 添加新功能

#### 添加 IPC 功能

1. `src/main/ipc/channels.ts` - 定义通道
2. `src/main/ipc/types.ts` - 定义类型
3. `src/main/ipc/handlers/` - 实现处理器
4. `src/main/ipc/index.ts` - 注册处理器
5. `src/preload/index.ts` - 暴露 API
6. `src/renderer/src/services/` - 创建客户端

#### 添加页面

1. `src/renderer/src/pages/NewPage.tsx`
2. 添加路由配置
3. 添加到导航菜单
4. 添加 i18n 翻译
5. 更新文档

#### 添加组件

1. `src/renderer/src/components/category/ComponentName.tsx`
2. 定义 Props 接口
3. 使用 useCallback 处理事件
4. 使用 useTranslation 支持 i18n
5. 添加 Storybook 故事（可选）

### 测试

```bash
# 运行测试
pnpm test

# 运行特定测试
pnpm test -- ChatInput

# 运行测试并生成覆盖率报告
pnpm test --coverage
```

### 文档

更新相关文档：

- 代码注释
- README.md
- docs/ 目录下的文档
- CHANGELOG.md

## 发布流程

### 版本号规则

使用语义化版本（SemVer）：

- `MAJOR.MINOR.PATCH`
- MAJOR：不兼容的 API 更改
- MINOR：向后兼容的功能添加
- PATCH：向后兼容的问题修复

### 发布步骤

1. 更新版本号
2. 更新 CHANGELOG.md
3. 创建发布 PR
4. 合并到 main
5. 创建 GitHub Release
6. CI 自动构建并上传

## 获取帮助

- 查看 [文档](../guide/getting-started)
- 加入 [Discord](https://discord.gg/your-server)
- 发送邮件至：support@superclient.dev

## 致谢

感谢所有贡献者！

<a href="https://github.com/your-org/super-client-r/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=your-org/super-client-r" />
</a>
