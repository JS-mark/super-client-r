# Super Client R - 产品需求文档（PRD）

> 最后更新：2026-02-12

---

## 目录

1. [产品概述](#1-产品概述)
2. [功能完成度总览](#2-功能完成度总览)
3. [代码架构治理：组件拆分计划](#3-代码架构治理组件拆分计划)
4. [各功能模块详细 PRD](#4-各功能模块详细-prd)
5. [未完成功能及后续计划](#5-未完成功能及后续计划)
6. [交互设计规范](#6-交互设计规范)
7. [资源统一管理](#7-资源统一管理)

---

## 1. 产品概述

Super Client R 是一个基于 Electron 的桌面端 AI 客户端，集成 Claude SDK 对话、MCP 服务器管理、Skill 扩展系统、插件系统、本地 HTTP API Server 等功能。

**核心价值**：为用户提供统一的 AI 对话入口，可通过 MCP/Skill/Plugin 无限扩展能力。

---

## 2. 功能完成度总览

| # | 功能模块 | 状态 | 完成度 | 阻塞项 |
|---|---------|------|--------|--------|
| 1 | 页面路由与导航 | ✅ 完成 | 100% | - |
| 2 | AI 对话（Chat） | 🟡 部分 | 80% | 消息持久化、会话ID管理 |
| 3 | MCP 服务器管理 | ✅ 完成 | 100% | - |
| 4 | Skill 系统 | 🟡 部分 | 70% | Skill 下载执行未实现 |
| 5 | 插件系统 | 🟡 部分 | 60% | 远程下载、市场后端 |
| 6 | 设置系统 | ✅ 完成 | 100% | - |
| 7 | 工作区管理 | ✅ 完成 | 95% | 导出消息关联 |
| 8 | 文件附件系统 | ✅ 完成 | 100% | - |
| 9 | 快捷键系统 | ✅ 完成 | 100% | - |
| 10 | HTTP API Server | 🟡 部分 | 40% | 仅 health + MCP 端点 |
| 11 | 悬浮窗 | ✅ 完成 | 100% | - |
| 12 | 国际化 (i18n) | ✅ 完成 | 100% | - |
| 13 | 主题/暗色模式 | ✅ 完成 | 100% | - |
| 14 | 菜单自定义 | ✅ 完成 | 100% | - |
| 15 | 消息管理增强 | ✅ 完成 | 100% | - |

**整体完成度：约 87%**

---

## 3. 代码架构治理：组件拆分计划

### 3.1 问题概述

多个页面和组件文件过于臃肿，多个子组件、业务逻辑挤在单一文件中，导致：
- 可维护性差，改动风险高
- 代码复用困难
- 团队协作容易冲突

### 3.2 拆分标准

| 类别 | 行数阈值 | 处理方式 |
|------|---------|---------|
| 🔴 Critical | >800行 | 必须立即拆分 |
| 🟠 High | 500-800行 | 优先拆分 |
| 🟡 Medium | 300-500行 | 择机拆分 |
| ✅ Acceptable | <300行 | 保持现状 |

### 3.3 Priority 1：Critical（必须拆分）

#### 3.3.1 `Settings.tsx` (1,686行)

**当前问题**：11个子组件全部内嵌，从日志查看器到主题设置全塞在一个文件。

**拆分方案**：

```
src/renderer/src/pages/Settings.tsx          → 入口，Tab 路由 (~100行)
src/renderer/src/components/settings/
├── SettingSection.tsx                       → 通用设置区块组件
├── GeneralSettings.tsx                      → 通用设置 Tab（主题、语言、更新）
├── ApiKeysConfig.tsx                        → API Key 管理
├── ThemeSettings.tsx                        → 主题设置（已有但需从页面迁移逻辑）
├── FloatWidgetSettings.tsx                  → 悬浮窗设置
├── QuickActionsTab.tsx                      → 快捷操作
├── SystemInfoTab.tsx                        → 系统信息
├── PerformanceMonitorTab.tsx                → 性能监控
├── DebugTools.tsx                           → 调试工具
├── LogViewer.tsx                            → 日志查看器
├── MenuSettings.tsx                         → (已存在)
├── SearchSettings.tsx                       → (已存在)
└── ShortcutSettings.tsx                     → (已存在)
```

**入口文件 Settings.tsx 职责**：
- 仅负责 Tab 切换路由
- 加载对应 Tab 组件
- 传递必要 props

#### 3.3.2 `McpMarket.tsx` (1,095行)

**当前问题**：4个大型卡片/弹窗组件内嵌。

**拆分方案**：

```
src/renderer/src/pages/McpMarket.tsx         → 入口，列表布局 (~150行)
src/renderer/src/components/mcp/
├── McpDetailModal.tsx                       → MCP 详情弹窗
├── McpMarketCard.tsx                        → 市场 MCP 卡片
├── ThirdPartyMcpCard.tsx                    → 第三方 MCP 卡片
├── InstalledMcpCard.tsx                     → 已安装 MCP 卡片
├── ThirdPartyMcpForm.tsx                    → 添加第三方 MCP 表单
└── McpConfig.tsx                            → (已存在)
```

#### 3.3.3 `Chat.tsx` (889行)

**当前问题**：ToolCallCard、搜索引擎面板等内嵌。

**拆分方案**：

```
src/renderer/src/pages/Chat.tsx              → 入口，消息列表 + 输入框布局 (~250行)
src/renderer/src/components/chat/
├── ToolCallCard.tsx                         → 工具调用卡片 (NEW)
├── MessageBubble.tsx                        → 消息气泡组件 (NEW)
├── SearchEnginePanel.tsx                    → 搜索引擎选择面板 (NEW)
├── ChatInput.tsx                            → 输入框组件 (NEW)
├── MessageSearch.tsx                        → (已存在)
├── MessageContextMenu.tsx                   → (已存在)
└── ChatExportDialog.tsx                     → (已存在)
```

#### 3.3.4 `MenuSettings.tsx` (802行)

**拆分方案**：

```
src/renderer/src/components/settings/
├── MenuSettings.tsx                         → 入口，菜单列表 (~200行)
├── menu/
│   ├── MenuItemEditor.tsx                   → 单个菜单项编辑器
│   ├── IconPicker.tsx                       → 图标选择器（预设/Emoji/图片）
│   └── MenuItemCard.tsx                     → 菜单项展示卡片
```

### 3.4 Priority 2：High（优先拆分）

| 文件 | 行数 | 拆分方案 |
|------|------|---------|
| `Workspaces.tsx` (693行) | 693 | 提取 `WorkspaceCard.tsx`, `EditWorkspaceModal.tsx` |
| `SearchSettings.tsx` (626行) | 626 | 提取 `SearchProviderCard.tsx`, `SearchProviderForm.tsx` |
| `Skills.tsx` (582行) | 582 | 提取 `SkillCard.tsx`, `SkillDetailModal.tsx` |
| `ShortcutSettings.tsx` (455行) | 455 | 提取 `ShortcutRecorder.tsx`, `ShortcutItemRow.tsx` |

### 3.5 Priority 3：Medium（择机拆分）

| 文件 | 行数 | 备注 |
|------|------|------|
| `AttachmentManager.tsx` (449行) | 449 | 可提取预览逻辑 |
| `WorkspaceSwitcher.tsx` (394行) | 394 | 可提取下拉面板 |
| `FileUpload.tsx` (382行) | 382 | 单一职责，可接受 |
| `Plugins.tsx` (412行) | 412 | 可提取 PluginCard |
| `AboutSection.tsx` (349行) | 349 | 可提取信息区块 |
| `Home.tsx` (363行) | 363 | 单一组件，可接受 |

### 3.6 拆分原则

1. **页面文件（pages/）只做入口**：负责路由参数解析、Tab切换、布局编排，不含业务子组件
2. **组件文件（components/）按模块分目录**：`chat/`, `settings/`, `mcp/`, `workspace/` 等
3. **每个组件文件 < 300行**：超过则考虑进一步拆分
4. **共享状态通过 Store**：组件间不传递深层 props，通过 Zustand store 共享
5. **抽取可复用逻辑到 hooks**：如 `useMenuEditor`, `useShortcutRecorder`

---

## 4. 各功能模块详细 PRD

### 4.1 AI 对话（Chat）

#### 功能需求

| 需求 | 状态 | 说明 |
|------|------|------|
| 基本对话发送/接收 | ✅ | Claude SDK 流式对话 |
| 流式响应显示 | ✅ | 逐块渲染 |
| 多会话管理 | ✅ | 创建/切换/删除/重命名 |
| 消息搜索 | ✅ | 全文检索 + 高亮 |
| 消息收藏/书签 | ✅ | 收藏 + 标签系统 |
| 消息导出 | ✅ | Markdown/JSON |
| 右键上下文菜单 | ✅ | 复制/收藏/删除 |
| 工具调用渲染 | ✅ | ToolCallCard 展示 |
| 附件集成 | 🟡 | UI 存在，消息关联未完成 |
| 消息持久化 | 🔴 | 当前仅内存，重启丢失 |
| 会话ID管理 | 🔴 | 硬编码为 "default" |
| 消息删除 | 🔴 | TODO 未实现 |
| 滚动到指定消息 | 🔴 | TODO 未实现 |

#### 交互设计要点

- 消息气泡：用户右侧蓝色，AI 左侧灰色
- 流式输出：打字机效果，光标闪烁
- 工具调用：折叠卡片，展开显示参数和结果
- 搜索：顶部搜索栏，关键词高亮，上下导航
- 输入框：底部固定，支持多行、附件按钮、@提及

#### 待完成事项

1. **消息持久化**：接入 IndexedDB 或 SQLite（通过 MCP），确保消息重启不丢失
2. **会话ID**：每次新建会话生成唯一 UUID，关联到工作区
3. **消息删除**：实现 `deleteMessage` 方法，带确认弹窗
4. **附件消息关联**：发送消息时将 attachmentIds 写入消息 metadata
5. **滚动定位**：实现 `scrollToMessage(messageId)` 方法

---

### 4.2 MCP 服务器管理

#### 功能需求

| 需求 | 状态 | 说明 |
|------|------|------|
| 内置 MCP 管理 | ✅ | 启停控制 |
| 第三方 MCP 添加 | ✅ | stdio/sse/http 三种传输 |
| MCP 市场浏览 | ✅ | 分页、搜索、筛选 |
| 连接状态监控 | ✅ | 实时状态 |
| 工具发现 | ✅ | 列出可用工具 |
| 工具调用 | ✅ | 通过 IPC 调用 |
| MCP 配置编辑 | ✅ | JSON 配置 |

**状态**：功能完整，无阻塞项。

---

### 4.3 Skill 系统

#### 功能需求

| 需求 | 状态 | 说明 |
|------|------|------|
| Skill 市场浏览 | ✅ | 列表、搜索、筛选 |
| Skill 安装/卸载 | ✅ | 本地管理 |
| Skill 更新检查 | ✅ | 版本对比 |
| Skill 详情展示 | ✅ | 弹窗详情 |
| Skill URL 下载 | 🔴 | TODO 未实现 |
| Skill 动态加载执行 | 🔴 | TODO 未实现 |
| Skill 沙箱隔离 | 🔴 | 未实现 |
| Skill 权限管理 | 🔴 | 未实现 |

#### 待完成事项

1. **下载执行**：实现从 URL 下载 Skill 包，解压到本地目录
2. **动态加载**：使用 `vm2` 或 `quickjs` 沙箱执行 Skill 脚本
3. **权限系统**：声明式权限列表，安装时提示用户授权
4. **版本对比**：使用 semver 库代替字符串比较

---

### 4.4 插件系统

#### 功能需求

| 需求 | 状态 | 说明 |
|------|------|------|
| 插件架构 (PluginManager) | ✅ | 生命周期管理 |
| 插件扫描发现 | ✅ | 本地目录扫描 |
| 启用/禁用 | ✅ | IPC 控制 |
| 插件存储 API | ✅ | 隔离存储 |
| 插件市场 UI | 🟡 | 基础列表，mock 数据 |
| 远程下载安装 | 🔴 | TODO 未实现 |
| 插件解压安装 | 🔴 | TODO 未实现 |
| 插件市场后端 | 🔴 | 无后端服务 |
| 插件权限沙箱 | 🔴 | 未实现 |

#### 待完成事项

1. **远程安装**：实现从 URL 下载 zip/tgz 插件包
2. **解压安装**：解压到 `plugins/` 目录，校验 manifest.json
3. **市场后端**：对接 npm registry 或自建市场服务
4. **沙箱执行**：插件在隔离环境中运行，限制 API 访问

---

### 4.5 HTTP API Server

#### 功能需求

| 需求 | 状态 | 说明 |
|------|------|------|
| Koa Server 框架 | ✅ | 端口自动检测 |
| Health Check | ✅ | GET /health |
| MCP API 端点 | ✅ | CRUD |
| Swagger 文档 | ✅ | 自动生成 |
| CORS 中间件 | ✅ | - |
| JWT 认证 | 🔴 | 未实现 |
| API Key 管理 | 🔴 | 未实现 |
| Chat API | 🔴 | 未实现 |
| Agent API | 🔴 | 未实现 |
| Skill API | 🔴 | 未实现 |
| 代理转发 | 🔴 | 未实现 |

#### 待完成事项

1. **JWT 认证**：集成 `koa-jwt`，实现 token 签发和验证
2. **API Key**：生成、撤销、权限管理
3. **业务端点**：
   - `POST /api/v1/chat` - 发送消息并返回流式响应
   - `POST /api/v1/agent/execute` - 执行 Agent 任务
   - `POST /api/v1/skill/execute` - 执行 Skill
   - `GET /api/v1/sessions` - 会话管理
4. **代理转发**：将外部 API 请求转发到内部 Claude SDK

---

### 4.6 工作区管理

#### 功能需求

全部已实现。

#### 待优化

1. **导出完整数据**：导出时包含工作区关联的消息记录（依赖消息持久化完成）
2. **统计数据**：`totalMessages` 当前为 0，需从 chatStore 计算真实值

---

### 4.7 其他已完成功能

以下功能已完整实现，无阻塞项：

- **文件附件系统**：上传/预览/删除/分类，完成度 100%
- **快捷键系统**：录制/冲突检测/自定义，完成度 100%
- **国际化**：中英双语 16 个命名空间，完成度 100%
- **主题系统**：亮/暗/跟随系统，完成度 100%
- **菜单自定义**：图标/排序/显隐，完成度 100%
- **悬浮窗**：可拖拽/展开收起，完成度 100%

---

## 5. 未完成功能及后续计划

### 5.1 已发现 TODO/FIXME 清单

| 位置 | 描述 | 优先级 |
|------|------|--------|
| `Chat.tsx:382` | `conversationId = "default"` 硬编码 | P0 |
| `Chat.tsx:609` | 附件与消息关联未完成 | P1 |
| `Chat.tsx:729` | 消息删除功能缺失 | P1 |
| `Chat.tsx:873` | 滚动到指定消息未实现 | P2 |
| `SkillService.ts:117` | URL 下载未实现 | P1 |
| `SkillService.ts:299` | 动态加载执行未实现 | P1 |
| `pluginHandlers.ts:367` | 远程插件下载未实现 | P1 |
| `pluginHandlers.ts:377` | 插件解压未实现 | P1 |

### 5.2 开发阶段规划

#### Phase 1：架构治理

**目标**：组件拆分，消除臃肿文件

- [ ] 拆分 `Settings.tsx` → 11 个独立组件
- [ ] 拆分 `McpMarket.tsx` → 5 个独立组件
- [ ] 拆分 `Chat.tsx` → 5 个独立组件
- [ ] 拆分 `MenuSettings.tsx` → 3 个独立组件
- [ ] 拆分 Priority 2 文件
- [ ] Logo/Icon 统一管理

#### Phase 2：核心功能补全

**目标**：消除所有 P0/P1 TODO

- [ ] 实现消息持久化（IndexedDB / better-sqlite3）
- [ ] 会话 ID 管理（UUID 生成 + 工作区关联）
- [ ] 消息删除功能
- [ ] 附件与消息关联
- [ ] Skill 下载和执行引擎
- [ ] 插件远程安装流程

#### Phase 3：API Server 完善

**目标**：HTTP API 达到可用状态

- [ ] JWT 认证中间件
- [ ] API Key CRUD
- [ ] Chat/Agent/Skill API 端点
- [ ] 请求速率限制
- [ ] API 文档完善

#### Phase 4：高级功能

**目标**：增强型功能

- [ ] 命令面板（Cmd+Shift+P）
- [ ] 全局搜索（跨会话搜索消息）
- [ ] 插件市场后端对接
- [ ] 性能监控仪表盘
- [ ] 自动更新机制

#### Phase 5：质量保障

**目标**：生产级质量

- [ ] 单元测试覆盖率 > 80%
- [ ] E2E 测试关键流程
- [ ] 性能优化（虚拟列表、懒加载）
- [ ] 安全审计
- [ ] 文档完善

---

## 6. 交互设计规范

### 6.1 通用规范

| 规范 | 说明 |
|------|------|
| 主色调 | `#1890ff`（Ant Design Blue） |
| 圆角 | 小组件 `6px`，卡片 `8px`，弹窗 `12px` |
| 间距系统 | 基于 `4px` 倍数：4/8/12/16/24/32 |
| 字体 | 系统字体栈，代码用等宽字体 |
| 动画 | 过渡 `0.2-0.3s ease`，禁用突变 |

### 6.2 侧边栏导航

- 固定宽度 60px（图标模式）或 200px（展开模式）
- 当前页面高亮显示
- 图标支持自定义（emoji/图片/预设）
- 拖拽排序

### 6.3 弹窗规范

| 类型 | 宽度 | 场景 |
|------|------|------|
| 确认弹窗 | 420px | 删除、重置等确认操作 |
| 表单弹窗 | 520px | 编辑、创建表单 |
| 详情弹窗 | 680px | 详情展示、预览 |
| 全屏弹窗 | 90vw | 复杂编辑、多步骤 |

### 6.4 列表页面规范

- 顶部：标题 + 搜索 + 筛选 + 操作按钮
- 中间：卡片网格或列表
- 底部：分页（超过 20 条时显示）
- 空状态：居中图标 + 提示文案 + 操作引导

### 6.5 表单规范

- 标签在上，输入框在下
- 必填字段标 `*`
- 实时校验 + 提交校验
- 提交按钮在右下角
- 取消按钮在提交按钮左侧

---

## 7. 资源统一管理

### 7.1 Logo/Icon 统一方案

**源文件**：`build/icons/icon.svg`（唯一真实来源）

| 用途 | 引用路径 | 说明 |
|------|---------|------|
| HTML Favicon | `/icon.svg`（public 目录） | 从 build 复制 |
| Electron 窗口图标 | `build/icons/icon.png` | 脚本从 SVG 生成 |
| macOS App Icon | `build/icons/icon.icns` | 脚本从 SVG 生成 |
| 系统托盘图标 | `build/icons/tray-icon.png` | 脚本从 SVG 生成 |
| About 弹窗 Logo | `/icon.svg` | 引用 public 目录 |
| DMG 安装器 | `build/icons/icon.icns` | 脚本从 SVG 生成 |

**规则**：
1. 所有图标从 `build/icons/icon.svg` 生成，通过 `pnpm build:icons` 脚本
2. 渲染进程统一引用 `/icon.svg`（public 目录下）
3. 主进程统一通过 `getAppIconPath()` 函数获取
4. 禁止在代码中硬编码其他 logo 路径

---

*文档版本：v1.0*
*创建日期：2026-02-12*
