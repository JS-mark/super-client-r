# Super Client R 文档

## 文档索引

| 文档                                           | 说明                 |
|------------------------------------------------|----------------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md)           | 系统架构设计文档     |
| [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) | 项目结构规范         |
| [CODING_STANDARDS.md](./docs/CODING_STANDARDS.md)   | 代码规范             |
| [DEVELOPMENT.md](./docs/DEVELOPMENT.md)             | 开发指南             |
| [API.md](./docs/API.md)                             | IPC 和 HTTP API 文档 |
| [CLAUDE_CODE_GUIDE.md](./docs/CLAUDE_CODE_GUIDE.md) | Claude Code 开发指南 |

## 快速导航

### 如果你是新开发者

1. 先阅读 [ARCHITECTURE.md](./docs/ARCHITECTURE.md) 了解系统架构
2. 查看 [DEVELOPMENT.md](./docs/DEVELOPMENT.md) 配置开发环境
3. 遵循 [CODING_STANDARDS.md](./docs/CODING_STANDARDS.md) 编写代码

### 如果你要添加新功能

1. 参考 [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) 确定文件位置
2. 查看 [API.md](./docs/API.md) 了解通信接口
3. 遵循 [CODING_STANDARDS.md](./docs/CODING_STANDARDS.md) 代码规范

### 如果你要调试问题

1. 查看 [DEVELOPMENT.md](./docs/DEVELOPMENT.md) 的"常见问题"章节
2. 参考 [ARCHITECTURE.md](./docs/ARCHITECTURE.md) 的模块关系图
3. 使用 [API.md](./docs/API.md) 验证接口调用

---

## 项目概述

**Super Client R** 是一个基于 Electron 的 AI 客户端桌面应用，主要功能包括：

- **AI 对话**: 基于 Claude SDK 的智能对话
- **Agent 系统**: 支持工具调用的 AI 代理
- **Skill 系统**: 可扩展的工具和插件体系
- **MCP 支持**: Model Context Protocol 服务器管理
- **本地 API**: 内置 HTTP 服务器供外部调用

## 技术栈

- **框架**: Electron + React + TypeScript
- **UI**: Ant Design + Tailwind CSS
- **构建**: Vite + electron-vite
- **状态**: Zustand
- **服务器**: Koa

## 安装与运行（macOS）

> ⚠️ 内测版本尚未进行代码签名与公证，macOS 首次启动会被 Gatekeeper 拦截，提示「应用已损坏」或「无法打开，因为无法验证开发者」。这是未签名应用的正常现象，可按下面任一方式放行。

### 方式一：命令行移除隔离属性（推荐）

将应用拖入「应用程序」后，在终端执行（`.app` 名称以实际打包产物为准，内测产物为 `Super Client.app`）：

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Super Client.app"
```

执行后重新双击图标即可正常打开。

### 方式二：图形界面放行

1. 双击应用，出现拦截提示后点「完成 / 取消」；
2. 打开「系统设置」→「隐私与安全性」；
3. 在页面底部找到被拦截的「Super Client」，点击「仍要打开」；
4. 在弹出的确认框中再次点「打开」即可。

> ❌ 请勿使用 `sudo spctl --master-disable` 全局关闭 Gatekeeper。该命令会关闭整个系统的应用来源校验，带来安全风险；上面两种方式只针对本应用放行，更安全。
>
> 正式签名版本发布后无需以上任何步骤，可直接双击运行。

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feat/amazing-feature`)
5. 创建 Pull Request

## 许可证

GPL-2.0 License
