# Super Client R 文档

## 文档索引

| 文档                                           | 说明                 |
|------------------------------------------------|----------------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md)           | 系统架构设计文档     |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | 项目结构规范         |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md)   | 代码规范             |
| [DEVELOPMENT.md](./DEVELOPMENT.md)             | 开发指南             |
| [API.md](./API.md)                             | IPC 和 HTTP API 文档 |
| [CLAUDE_CODE_GUIDE.md](./CLAUDE_CODE_GUIDE.md) | Claude Code 开发指南 |

## 快速导航

### 如果你是新开发者

1. 先阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解系统架构
2. 查看 [DEVELOPMENT.md](./DEVELOPMENT.md) 配置开发环境
3. 遵循 [CODING_STANDARDS.md](./CODING_STANDARDS.md) 编写代码

### 如果你要添加新功能

1. 参考 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) 确定文件位置
2. 查看 [API.md](./API.md) 了解通信接口
3. 遵循 [CODING_STANDARDS.md](./CODING_STANDARDS.md) 代码规范

### 如果你要调试问题

1. 查看 [DEVELOPMENT.md](./DEVELOPMENT.md) 的"常见问题"章节
2. 参考 [ARCHITECTURE.md](./ARCHITECTURE.md) 的模块关系图
3. 使用 [API.md](./API.md) 验证接口调用

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

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feat/amazing-feature`)
5. 创建 Pull Request

## 许可证

MIT License
