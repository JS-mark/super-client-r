# Super Client R 功能开发路线图

> 最后更新：2026-03-18

## 概述

本文档定义 Super Client R 的功能开发计划和当前实现状态。

详细 PRD 和交互设计请参阅 [PRD.md](./PRD.md)。

> **注意**：本文档基于 2026-03-11 对实际代码库的全面审计更新，修正了此前多处与代码不符的状态标注。

---

## 功能完成度总览

| # | 功能模块 | 状态 | 完成度 | 阻塞项 |
|---|---------|------|--------|--------|
| 1 | 页面路由与导航 | ✅ 完成 | 100% | - |
| 2 | AI 对话（Chat） | ✅ 完成 | 98% | 工具栏功能 |
| 3 | MCP 服务器管理 | ✅ 完成 | 100% | - |
| 4 | Skill 系统 | 🟡 部分 | 70% | URL 下载、沙箱执行 |
| 5 | 插件系统 | 🟡 部分 | 85% | 远程下载、市场后端、沙箱 |
| 6 | 设置系统 | ✅ 完成 | 100% | - |
| 7 | 工作区管理 | ✅ 完成 | 95% | 导出消息关联 |
| 8 | 文件附件系统 | ✅ 完成 | 100% | - |
| 9 | 快捷键系统 | ✅ 完成 | 100% | - |
| 10 | HTTP API Server | 🟡 部分 | 50% | JWT 集成、业务端点 |
| 11 | 悬浮窗 | ✅ 完成 | 100% | - |
| 12 | 国际化 (i18n) | ✅ 完成 | 100% | - |
| 13 | 主题/暗色模式 | ✅ 完成 | 100% | - |
| 14 | 菜单自定义 | ✅ 完成 | 100% | - |
| 15 | 消息管理增强 | ✅ 完成 | 100% | - |
| 16 | OAuth 认证 | ✅ 完成 | 100% | - |
| 17 | IMBot 服务 | ✅ 完成 | 100% | - |
| 18 | 远程设备管理 | ✅ 完成 | 100% | - |
| 19 | 远程聊天桥接 | ✅ 完成 | 100% | - |
| 20 | Webhook 通知 | ✅ 完成 | 100% | - |
| 21 | LLM/模型管理 | ✅ 完成 | 100% | - |
| 22 | 应用初始化配置 | ✅ 完成 | 100% | - |

**整体完成度：约 93%**

---

## 已完成功能（Phase 0-2）

以下功能已实现并通过验收：

### 1. 消息管理增强 ✅ 已完成

- [x] 消息搜索（全文检索 + 高亮）
- [x] 消息收藏/书签 + 标签系统
- [x] 消息导出（Markdown/JSON）
- [x] 消息右键上下文菜单
- [x] 消息删除（`deleteMessage` + `deleteMessagesFrom`，持久化到磁盘）
- [x] 消息持久化（基于文件系统的 JSON 持久化，`ConversationStorageService`）

### 2. 会话管理 ✅ 已完成

- [x] 动态会话 ID（`conv_{timestamp}_{random}`）
- [x] 完整会话 CRUD（创建/切换/删除/重命名）
- [x] 多用户隔离（`{userData}/chats/{userId}/{conversationId}/`）
- [x] 会话侧边栏（搜索、日期分组、远程 IM 标签页）
- [x] 上次打开会话记忆
- [x] 旧版 `chat-history.json` 自动迁移

### 3. 快捷键系统 ✅ 已完成

- [x] 15+ 默认快捷键（全局/聊天/导航/输入）
- [x] 快捷键录制和自定义
- [x] 冲突检测
- [x] 启用/禁用/重置

### 4. 工作区管理 ✅ 已完成

- [x] CRUD + 类型（个人/工作/项目/临时）
- [x] 工作区级设置（模型/温度/系统提示词）
- [x] 导入/导出/复制
- [x] 切换器 UI
- [ ] 导出消息关联（需对接 ConversationStorageService）

### 5. 文件附件系统 ✅ 已完成

- [x] 拖拽上传 + 进度条
- [x] 类型分类（图片/文档/代码/音频/视频/压缩包）
- [x] 图片画廊预览
- [x] 多选/删除/系统打开

### 6. MCP 服务器管理 ✅ 已完成

- [x] 内置/第三方/市场三类 MCP
- [x] stdio/sse/http 三种传输
- [x] 连接状态监控 + 工具发现
- [x] 配置编辑 + 一键安装
- [x] 完整 HTTP API（17 个端点）

### 7. 设置系统 ✅ 已完成

- [x] 11+ 标签页（通用/菜单/模型/默认模型/API/搜索/密钥/快捷键/通知/调试/关于）
- [x] 20 个子组件
- [x] 插件贡献设置面板（动态扩展）
- [x] URL 深度链接（`?tab=xxx`）

### 8. 菜单自定义 ✅ 已完成

- [x] 图标类型（预设/Emoji/图片）
- [x] 拖拽排序 + 显隐控制
- [x] 标签自定义

### 9. 国际化 ✅ 已完成

- [x] 中英双语 16 个命名空间
- [x] 所有页面覆盖

### 10. 主题系统 ✅ 已完成

- [x] 亮色/暗色/跟随系统
- [x] Ant Design + Tailwind 双系统集成

### 11. OAuth 认证 ✅ 已完成

- [x] Google OAuth（PKCE 流程）
- [x] GitHub OAuth（代理 token 交换）
- [x] 用户信息存储
- [x] 登录/登出流程（独立 BrowserWindow）

### 12. IMBot 服务 ✅ 已完成

- [x] Telegram Bot
- [x] 钉钉 Bot
- [x] 飞书 Bot
- [x] 完整生命周期管理（启动/停止）
- [x] 命令系统（`/command` 语法，内置 `/help`, `/device list`, `/exec` 等）
- [x] 权限系统（管理员 + 白名单）
- [x] 设备事件转发到 IM

### 13. 远程设备管理 ✅ 已完成

- [x] WebSocket 双模式（局域网直连 + 公网中继）
- [x] 设备注册（token 认证）
- [x] 远程命令执行（流式输出）
- [x] Tab 补全、cwd 追踪
- [x] 心跳监控
- [x] 设备上线/下线事件

### 14. 远程聊天桥接 ✅ 已完成

- [x] 会话绑定到 Telegram/钉钉/飞书
- [x] 双向消息路由
- [x] 持久化消息存储
- [x] 平台感知消息分割

### 15. Webhook 通知 ✅ 已完成

- [x] IPC 通道 + handler
- [x] 设置 UI

### 16. LLM/模型管理 ✅ 已完成

- [x] 模型 Provider CRUD
- [x] 模型列表获取
- [x] 活跃模型管理
- [x] 流式聊天完成
- [x] 工具审批

### 17. 应用初始化配置 ✅ 已完成

- [x] `AppConfigService` 环境变量配置
- [x] IPC 通道 + handler
- [x] HTTP 路由代理（`/v1/app/init-config`）
- [x] 环境变量 `CONFIG_API_BASE_URL`

---

## 进行中功能

### 18. 插件系统 🟡 85% 完成 ⭐ 优先级：高

**已完成：**
- [x] PluginManager 生命周期管理
- [x] 插件扫描/发现/启停
- [x] 插件隔离存储 API（Memento）
- [x] 命令注册系统（`context.commands.registerCommand()`）
- [x] 命令执行 IPC + UI 展示
- [x] 内置插件市场（Prompt Templates 插件，一键安装）
- [x] 插件市场 UI（市场 + 已安装 + 命令执行）
- [x] 插件持久化（重启后自动恢复）
- [x] 插件开发文档（[PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md)）
- [x] 权限管理（`PermissionService.ts` + `GRANT_PERMISSIONS`/`GET_PERMISSIONS` IPC）
- [x] 更新检查（`CHECK_UPDATES`/`UPDATE_PLUGIN` IPC）

**待完成：**
- [ ] 远程 zip/tgz 插件包下载
- [ ] 市场后端服务对接
- [ ] 插件沙箱执行环境

### 19. Skill 系统 🟡 70% 完成 ⭐ 优先级：高

**已完成：**
- [x] 市场浏览/搜索/筛选
- [x] 安装/卸载/更新检查
- [x] 详情弹窗
- [x] Skill 验证器（`SkillValidator.ts`）

**待完成：**
- [ ] URL 下载 Skill 包（`SkillService.ts:381` — `// TODO: 实现从 URL 下载`）
- [ ] 动态加载和沙箱执行
- [ ] 权限声明和授权
- [ ] semver 版本对比

### 20. HTTP API Server 🟡 50% 完成 ⭐ 优先级：中

**已完成：**
- [x] Koa 框架 + 端口自动检测
- [x] Health Check 端点
- [x] MCP API 端点（17 个端点，完整 CRUD）
- [x] Skills Proxy 端点（代理到 skillsmp.com）
- [x] AppConfig Proxy 端点（代理到 node-auth）
- [x] Swagger 文档 + CORS
- [x] Bearer Token 认证中间件（简单模式）
- [x] JWT 认证模块（`server/auth.ts`，代码已写但未集成到路由）

**待完成：**
- [ ] 集成 JWT 认证中间件到路由
- [ ] API Key CRUD 端点
- [ ] Chat API 端点
- [ ] Agent API 端点
- [ ] Skill API 端点
- [ ] 速率限制

---

## 具体未完成项清单

### 代码中明确标记为未实现的

| 位置 | 描述 | 优先级 |
|------|------|--------|
| `SkillService.ts:381` | `// TODO: 实现从 URL 下载` + throw | P1 |
| `ChatInputArea.tsx` | 文档功能仅显示 "coming soon" toast | P2 |
| `ChatInputArea.tsx` | 工具栏 tags/translate 仍为 toast 占位（prompt/quote/tools 已实现） | P3 |

### 架构层面缺失

| 功能 | 状态 | 优先级 | 备注 |
|------|------|--------|------|
| 沙箱执行环境 | 仅设计文档 | P1 | `SANDBOX_SOLUTION.md` 有详细方案，零代码实现 |
| JWT 认证集成 | 代码已写未接入 | P1 | `server/auth.ts` 完整 JWT 实现，路由仍用简单 Bearer 比对 |

---

## 未来功能（Phase 4+）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 命令面板 | 中 | Cmd+Shift+P 全局命令入口 |
| 全局搜索 | 中 | 跨会话搜索消息 |
| 自动更新 | 高 | electron-updater 集成 |
| 性能监控仪表盘 | 低 | 内存/CPU 可视化 |
| 多语言扩展 | 低 | 日语/韩语等更多语言 |
| 团队协作 | 低 | 共享工作区/消息 |

---

## 代码质量与技术债务

### 测试覆盖（严重不足）

当前仅 **2 个测试文件**：
- `src/renderer/src/stores/__tests__/chatStore.test.ts`
- `src/renderer/src/stores/__tests__/skillStore.test.ts`

以下模块 **零测试**：
- 所有 Main Process 服务（AgentService、McpService、SkillService、PluginManager、AuthService、IMBotService、RemoteDeviceService 等）
- 所有 IPC Handlers（21 个 handler 模块）
- 所有 HTTP 路由
- 所有 React 组件
- 所有自定义 Hooks

### 代码清理

- 生产代码中有 **30+ 个 `console.log`** 未清理（集中在 proxy.ts、RemoteDeviceService、IMBotService、pluginHandlers）
- 4 个 `@ts-expect-error`（合理，用于 `WebkitAppRegion` CSS 属性）
- 3 个 ESLint 抑制

### 代码架构治理

详见 [PRD.md - 第3节](./PRD.md#3-代码架构治理组件拆分计划)。

| 文件 | 行数 | 优先级 |
|------|------|--------|
| Settings.tsx | 1,686 | 🔴 Critical |
| McpMarket.tsx | 1,095 | 🔴 Critical |
| Chat.tsx | 889 | 🔴 Critical |
| MenuSettings.tsx | 802 | 🔴 Critical |
| Workspaces.tsx | 693 | 🟠 High |
| SearchSettings.tsx | 626 | 🟠 High |
| Skills.tsx | 582 | 🟠 High |
| ShortcutSettings.tsx | 455 | 🟠 High |

---

## 建议执行顺序

### 第一优先：快速补全（投入小、价值大）

1. ~~快捷键 handler 补全（Cmd+K 搜索、Cmd+B 侧边栏）~~ ✅ 2026-03-18 完成
2. 集成已有的 JWT 认证到 HTTP 路由
3. 清理生产代码中的 console.log

### 第二优先：功能补全

4. 聊天工具栏功能（quote/prompt/tools 等）
5. Skill URL 安装
6. HTTP API 扩展（Chat/Agent 端点）
7. 附件与消息关联

### 第三优先：质量提升

8. 核心服务单元测试
9. 大文件拆分重构
10. 沙箱执行环境实现

---

## 验收标准

每个功能完成后需要满足：

- [ ] 功能实现完整
- [ ] 代码通过 TypeScript 检查 (`pnpm check`)
- [ ] UI/UX 符合设计规范
- [ ] 添加必要的国际化
- [ ] 页面文件 < 300行，组件文件 < 300行
- [ ] 自测通过
- [ ] 按功能拆分 Git commit

---

*创建日期：2026-02-11*
*最后更新：2026-03-18*
