# 插件开发指南

本文档面向 Super Client R 插件开发者，涵盖插件系统架构、权限模型、完整 API 参考和示例。

---

## 目录

- [快速开始](#快速开始)
- [插件架构](#插件架构)
- [插件清单 (package.json)](#插件清单-packagejson)
- [权限系统](#权限系统)
- [插件生命周期](#插件生命周期)
- [Plugin Context API](#plugin-context-api)
- [Plugin API 完整参考](#plugin-api-完整参考)
  - [commands — 命令](#commands--命令)
  - [events — 事件](#events--事件)
  - [storage — 存储](#storage--存储)
  - [window — 窗口交互](#window--窗口交互)
  - [network — 网络请求](#network--网络请求)
  - [fs — 文件系统](#fs--文件系统)
  - [logger — 日志](#logger--日志)
  - [chat — 聊天钩子](#chat--聊天钩子)
  - [mcp — MCP 工具注册](#mcp--mcp-工具注册)
  - [skills — Skill 注册](#skills--skill-注册)
  - [ui — UI 扩展](#ui--ui-扩展)
- [贡献点 (Contributes)](#贡献点-contributes)
- [插件编写规范](#插件编写规范)
- [开发者模式](#开发者模式)
- [内置插件开发](#内置插件开发)
- [调试与测试](#调试与测试)
- [完整示例](#完整示例)
- [IPC 通道参考](#ipc-通道参考)

---

## 快速开始

### 最小插件结构

```
my-plugin/
├── package.json    # 插件清单（必需）
└── index.js        # 入口文件（必需）
```

### package.json

```json
{
  "name": "my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "description": "A simple plugin",
  "main": "index.js",
  "engines": {
    "super-client-r": "^1.0.0"
  },
  "permissions": ["commands"]
}
```

### index.js

```javascript
"use strict";

module.exports = {
  activate(context) {
    console.log("[My Plugin] Activated!");

    // 使用基础 context API
    context.commands.registerCommand("my-plugin.hello", function () {
      return { message: "Hello from My Plugin!" };
    });

    // 使用完整 PluginAPI（需要对应权限）
    const api = context.api;
    if (api) {
      api.logger.info("Plugin activated with full API access");
    }
  },
  deactivate() {
    console.log("[My Plugin] Deactivated");
  }
};
```

### 安装

打开应用 → 插件中心 → "安装本地插件" → 选择插件目录。

---

## 插件架构

```
┌──────────────────────────────────────────────────────────────┐
│                      Renderer Process                        │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Plugins    │  │pluginService │  │ UIContribution 渲染   │ │
│  │ Settings   │──│  (IPC calls) │  │ (侧边栏/设置/页面)    │ │
│  │ PluginPage │  └──────┬───────┘  └──────────────────────┘ │
│  └────────────┘         │ IPC                                │
├─────────────────────────┼────────────────────────────────────┤
│                      Main Process                            │
│  ┌──────────────────────┴────────────────────────────────┐   │
│  │              pluginHandlers (IPC)                      │   │
│  │  plugin:getAll / plugin:enable / plugin:grantPerms    │   │
│  │  plugin:getUIContributions / plugin:getPluginPageHTML  │   │
│  └──────────────────────┬────────────────────────────────┘   │
│  ┌──────────────────────┴────────────────────────────────┐   │
│  │                  PluginManager                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │PermissionSvc │  │PluginAPIFact │  │ChatHookReg  │ │   │
│  │  │(权限管控)     │  │(沙箱化 API)  │  │(聊天管道)   │ │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │   │
│  │  ┌──────────────┐  ┌──────────────┐                   │   │
│  │  │UIContribReg  │  │PluginContext │                   │   │
│  │  │(UI 贡献注册) │  │(每插件实例)  │                   │   │
│  │  └──────────────┘  └──────────────┘                   │   │
│  └───────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  InternalMcpService    │  SkillService                │   │
│  │  (动态 MCP 工具注册)    │  (动态 Skill 注册)          │   │
│  └───────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────┐   │
│  │           electron-store (持久化)                      │   │
│  │  config.plugins / config.pluginsData                  │   │
│  │  config.pluginPermissions                             │   │
│  └───────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────┐   │
│  │      <userData>/plugins/ (插件文件)                    │   │
│  │      <userData>/plugin-storage/ (插件存储)             │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 关键路径

| 路径                                     | 说明                            |
|------------------------------------------|---------------------------------|
| `<userData>/plugins/<plugin-id>/`        | 插件安装目录                    |
| `<userData>/plugin-storage/<plugin-id>/` | 插件专用存储目录                |
| `config.plugins`                         | electron-store 中的插件元数据   |
| `config.pluginsData`                     | electron-store 中的插件键值存储 |
| `config.pluginPermissions`               | 插件权限授予数据                |

> `<userData>` 开发环境为 `~/.scr-data-dev`，生产环境由 Electron 管理。

### 核心服务

| 服务                   | 文件                                      | 职责                            |
|------------------------|-------------------------------------------|---------------------------------|
| PluginManager          | `services/plugin/PluginManager.ts`        | 插件生命周期管理核心            |
| PermissionService      | `services/plugin/PermissionService.ts`    | 权限授予/撤销/检查              |
| PluginAPIFactory       | `services/plugin/PluginAPIFactory.ts`     | 为每个插件创建沙箱化 API 实例   |
| ChatHookRegistry       | `services/plugin/hooks/ChatHooks.ts`      | 聊天管道钩子注册和执行          |
| UIContributionRegistry | `services/plugin/UIContributionRegistry.ts`| UI 贡献（侧边栏/设置/页面）注册 |

---

## 插件清单 (package.json)

### 完整字段说明

```typescript
interface PluginManifest {
  // ═══ 必需字段 ═══
  name: string;          // 插件 ID（唯一标识，kebab-case）
  displayName: string;   // 显示名称
  version: string;       // 语义化版本号 (semver)
  main: string;          // 入口文件路径（相对于插件根目录）

  // ═══ 描述信息 ═══
  description?: string;
  author?: string | { name: string; email?: string };
  license?: string;
  keywords?: string[];
  categories?: string[]; // 分类标签，如 ["productivity", "tools"]
  icon?: string;         // 图标（emoji 或图片路径）

  // ═══ 链接 ═══
  repository?: { type: string; url: string };
  homepage?: string;
  bugs?: { url: string; email?: string };

  // ═══ 引擎要求 ═══
  engines: {
    "super-client-r": string; // 必需，支持的 App 版本范围
    node?: string;
  };

  // ═══ 权限声明 ═══
  permissions?: PluginPermission[];  // 插件所需权限列表

  // ═══ 激活事件 ═══
  activationEvents?: ActivationEvent[];

  // ═══ 贡献点 ═══
  contributes?: PluginContributions;

  // ═══ 依赖 ═══
  dependencies?: Record<string, string>;
}
```

### 激活事件类型

| 事件               | 说明               | 示例                        |
|--------------------|--------------------|-----------------------------|
| `"onStartup"`      | 应用启动时自动激活 | 常驻类插件                  |
| `"onCommand"`      | 任意命令被调用时   | 按需加载                    |
| `"onCommand:<id>"` | 特定命令被调用时   | `"onCommand:my-plugin.run"` |
| `"onView"`         | 视图打开时         | UI 相关插件                 |
| `"onView:<id>"`    | 特定视图打开时     | `"onView:my-plugin.panel"`  |

### 示例

```json
{
  "name": "smart-chat-enhancer",
  "displayName": "Smart Chat Enhancer",
  "version": "1.0.0",
  "description": "增强 AI 聊天体验，自动翻译、知识检索",
  "author": "Super Client Team",
  "main": "index.js",
  "icon": "🧠",
  "categories": ["ai", "productivity"],
  "engines": { "super-client-r": "^1.0.0" },
  "activationEvents": ["onStartup"],
  "permissions": [
    "commands",
    "chat.hooks",
    "mcp.tools",
    "ui.sidebar",
    "ui.settings",
    "network",
    "storage"
  ],
  "contributes": {
    "commands": [
      {
        "command": "smart-chat-enhancer.toggle",
        "title": "Toggle Enhancement",
        "category": "Smart Chat"
      }
    ],
    "configuration": {
      "title": "Smart Chat Enhancer",
      "properties": {
        "smart-chat-enhancer.autoTranslate": {
          "type": "boolean",
          "default": false,
          "description": "自动翻译非中文消息"
        },
        "smart-chat-enhancer.targetLang": {
          "type": "string",
          "default": "zh",
          "description": "目标语言",
          "enum": ["zh", "en", "ja", "ko"],
          "enumDescriptions": ["中文", "English", "日本語", "한국어"]
        }
      }
    }
  }
}
```

---

## 权限系统

插件通过声明式权限模型获得对应的 API 能力。用户在安装第三方插件时需要确认所请求的权限。内置插件自动获授所有声明的权限。

### 权限类型一览

| 权限标识           | 说明                         | 控制的 API                      |
|--------------------|------------------------------|---------------------------------|
| `fs.read`          | 读取**插件目录内**文件        | `api.fs.readFile()` 等          |
| `fs.write`         | 写入**插件目录内**文件        | `api.fs.writeFile()` 等         |
| `fs.readExternal`  | 读取插件目录**外**文件        | `api.fs.readFile()` (外部路径)  |
| `fs.writeExternal` | 写入插件目录**外**文件        | `api.fs.writeFile()` (外部路径) |
| `network`          | 发送 HTTP 请求               | `api.network.fetch()`           |
| `window.notify`    | 显示通知和消息对话框          | `api.window.show*Message()`     |
| `window.input`     | 显示输入和选择对话框          | `api.window.showInputBox()` 等  |
| `storage`          | 持久化存储数据               | `api.storage.get/set/delete()`  |
| `commands`         | 注册和执行命令               | `api.commands.*`                |
| `events`           | 订阅应用事件                 | `api.events.*`                  |
| `chat.hooks`       | 介入 AI 聊天流程             | `api.chat.*`                    |
| `mcp.tools`        | 注册 MCP 工具（AI 可调用）   | `api.mcp.registerTools()`       |
| `skills.create`    | 创建 Skill 技能              | `api.skills.registerSkill()`    |
| `ui.sidebar`       | 在侧边栏添加菜单项          | `api.ui.registerSidebarItem()`  |
| `ui.settings`      | 在设置中添加配置面板         | 通过 `contributes.configuration`|
| `ui.pages`         | 注册自定义页面               | `api.ui.registerPage()`         |

### 权限声明

在 `package.json` 中声明所需权限：

```json
{
  "permissions": ["commands", "storage", "chat.hooks", "network"]
}
```

### 安全模型

| 插件类型 | 权限处理方式 |
|----------|-------------|
| 内置插件 | 自动授予所有声明的权限 |
| 第三方插件 | 安装时弹窗要求用户确认 |

### 路径沙箱

文件系统 API 实施路径沙箱检查：

- `fs.read` / `fs.write` 权限仅允许访问 `context.extensionPath`（插件安装目录）和插件存储目录
- 访问以上范围之外的路径需要 `fs.readExternal` / `fs.writeExternal` 权限
- 路径会自动规范化，防止 `../` 越权访问

---

## 插件生命周期

```
安装 ──→ installed ──→ 启用 ──→ activating ──→ active
                          │                       │
                    权限确认(第三方)          禁用 ←──┘
                                               │
                                        deactivating ──→ inactive
                                          (清理所有注册:             │
                                           钩子/MCP/Skill/UI)  卸载 ←┘
                                                                 │
                                                            uninstalling ──→ 已移除
                                                              (撤销所有权限)
```

### 状态说明

| 状态           | 说明                      |
|----------------|---------------------------|
| `installing`   | 文件复制中（含 npm install）|
| `installed`    | 已安装但未启用            |
| `activating`   | `activate()` 执行中       |
| `active`       | 运行中，所有注册生效      |
| `deactivating` | `deactivate()` 执行中     |
| `inactive`     | 已停用，所有注册已清理    |
| `error`        | 激活或运行时出错          |
| `uninstalling` | 卸载中（先停用，再删除文件）|

### 停用时自动清理

插件停用（`deactivatePlugin()`）时，系统自动执行以下清理：

1. 调用插件的 `deactivate()` 函数
2. 调用 `context.subscriptions` 中所有 `dispose()`
3. 注销所有聊天钩子 (`chatHookRegistry.unregisterAll()`)
4. 注销所有动态 MCP 工具 (`internalMcpService.unregisterDynamic()`)
5. 注销所有动态 Skill (`skillService.unregisterDynamic()`)
6. 移除所有 UI 贡献 (`uiContributionRegistry.unregisterAll()`)

开发者**不需要**在 `deactivate()` 中手动清理通过 `api` 注册的资源，系统会自动处理。

### 重启恢复

应用重启时，PluginManager 按以下顺序恢复：

1. `loadPluginsFromStorage()` — 从 electron-store 读取插件列表
2. `scanPluginsDirectory()` — 扫描磁盘目录，校验文件完整性
3. `autoActivatePlugins()` — 对 `enabled: true` 的插件调用 `activatePlugin()`

启用过的插件在重启后会自动恢复到 `active` 状态。

---

## Plugin Context API

`activate(context)` 接收的 `context` 对象：

```typescript
interface PluginContext {
  // ═══ 路径 ═══
  readonly extensionPath: string;     // 插件安装目录的绝对路径
  readonly extensionUri: string;      // file:// URI
  readonly storageUri: string;        // 插件专用存储目录 URI
  readonly globalStorageUri: string;  // 全局插件存储目录 URI
  readonly logUri: string;            // 日志目录 URI

  // ═══ 订阅管理 ═══
  readonly subscriptions: { dispose(): void }[];

  // ═══ 状态存储 ═══
  readonly workspaceState: Memento;
  readonly globalState: Memento;

  // ═══ 命令注册 ═══
  readonly commands: {
    registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown
    ): { dispose(): void };
  };

  // ═══ 完整 Plugin API（需权限） ═══
  readonly api?: PluginAPI;
}
```

`context.api` 是完整的 `PluginAPI` 实例，**每个 API 调用都会检查对应权限**。无权限时抛出错误。

---

## Plugin API 完整参考

通过 `context.api` 访问。以下按命名空间分组说明。

### commands — 命令

**权限**: `commands`

```javascript
activate(context) {
  const api = context.api;

  // 注册命令
  const disposable = api.commands.registerCommand(
    "my-plugin.greet",
    function (name) {
      return { greeting: "Hello, " + (name || "World") + "!" };
    }
  );

  // 执行其他插件的命令
  const result = await api.commands.executeCommand("other-plugin.action", arg1, arg2);
}
```

**命名规范**: 命令 ID 必须以插件 ID 为前缀（`my-plugin.doSomething`）。

### events — 事件

**权限**: `events`

```javascript
// 监听配置变更
const unsub = api.events.onDidChangeConfiguration.event(function (e) {
  if (e.affectsConfiguration("my-plugin.language")) {
    // 配置项变更，重新加载
  }
});

// 监听窗口状态变更
api.events.onDidChangeWindowState.event(function (state) {
  console.log("Window focused:", state.focused);
});
```

### storage — 存储

**权限**: `storage`

```javascript
// 写入
await api.storage.set("lastSync", Date.now());
await api.storage.set("preferences", { theme: "dark", lang: "zh" });

// 读取
const lastSync = await api.storage.get("lastSync");
const prefs = await api.storage.get("preferences", { theme: "light", lang: "en" });

// 删除
await api.storage.delete("lastSync");
```

存储数据以 `{pluginId}.{key}` 为前缀隔离，不同插件之间互不影响。

### window — 窗口交互

**权限**: `window.notify`（消息对话框）、`window.input`（输入/选择对话框）

```javascript
// 显示信息消息（可带按钮）
const choice = await api.window.showInformationMessage(
  "操作完成！",
  "查看详情", "关闭"
);
if (choice === "查看详情") {
  // 用户点击了"查看详情"
}

// 显示警告
await api.window.showWarningMessage("配置可能有误，请检查");

// 显示错误
await api.window.showErrorMessage("连接失败: " + err.message);

// 输入框
const name = await api.window.showInputBox({
  prompt: "请输入你的名字",
  placeHolder: "名字...",
  value: "默认值",
});

// 快速选择
const selected = await api.window.showQuickPick(
  [
    { label: "选项 A", description: "第一个选项" },
    { label: "选项 B", description: "第二个选项" },
  ],
  { placeHolder: "请选择一个选项" }
);
```

对话框通过 IPC 在渲染进程中以 Ant Design Modal 形式展示，等待用户交互后返回结果。

### network — 网络请求

**权限**: `network`

```javascript
const response = await api.network.fetch("https://api.example.com/data", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "test" }),
});
const data = await response.json();
```

底层使用 Node.js 的 `globalThis.fetch`，请求自动标记插件来源。

### fs — 文件系统

**权限**: `fs.read` / `fs.write`（插件目录内）、`fs.readExternal` / `fs.writeExternal`（插件目录外）

```javascript
// 读取插件目录内文件（相对路径自动解析为插件目录）
const content = await api.fs.readTextFile("config.json");
const bytes = await api.fs.readFile("data.bin");

// 写入
await api.fs.writeTextFile("output.txt", "Hello World");
await api.fs.writeFile("data.bin", new Uint8Array([1, 2, 3]));

// 文件操作
const exists = await api.fs.exists("config.json");
await api.fs.mkdir("data/cache", { recursive: true });
const files = await api.fs.readdir("data");
const stat = await api.fs.stat("config.json");
// stat = { type: "file", size: 1234, ctime: 1700000000, mtime: 1700000100 }

// 删除
await api.fs.delete("temp.txt");
await api.fs.delete("data/cache", { recursive: true });
```

**路径规则**:
- 相对路径自动解析为 `context.extensionPath` 下的绝对路径
- 绝对路径根据是否在插件目录内检查不同权限
- 访问插件目录外的绝对路径需要 `fs.readExternal` / `fs.writeExternal`

### logger — 日志

**无需权限**

```javascript
api.logger.trace("详细追踪信息");
api.logger.debug("调试信息");
api.logger.info("一般信息");
api.logger.warn("警告信息");
api.logger.error("错误信息");
```

日志自动加上 `[Plugin:{pluginId}]` 前缀，可在日志查看器 (`/log-viewer`) 中按模块过滤。

### chat — 聊天钩子

**权限**: `chat.hooks`

聊天钩子允许插件介入 AI 聊天管道的 4 个阶段：

```
┌─────────────┐    ┌──────────────────┐    ┌──────────────┐    ┌────────────────┐
│  preSend     │ →  │  systemPrompt    │ →  │  LLM 调用     │ →  │  postResponse  │
│  修改/拦截   │    │  注入/修改 prompt │    │  (流式中       │    │  后处理响应     │
│  用户消息    │    │                  │    │  postStream)  │    │                │
└─────────────┘    └──────────────────┘    └──────────────┘    └────────────────┘
```

#### preSend — 发送前拦截

用户消息发送到 LLM 之前，可修改消息内容或阻止发送：

```javascript
const hook = api.chat.onPreSend(async function (ctx) {
  // ctx.messages — 消息数组 [{ role, content }]
  // 修改最后一条用户消息
  const lastMsg = ctx.messages[ctx.messages.length - 1];
  if (lastMsg && lastMsg.role === "user") {
    lastMsg.content = "[Enhanced] " + lastMsg.content;
  }

  // 或者阻止发送
  // ctx.cancelled = true;
});

// 手动注销（通常不需要，停用时自动清理）
// hook.dispose();
```

#### systemPrompt — 系统提示词修改

在 system prompt 构建完成后、发送到 LLM 之前修改：

```javascript
api.chat.onSystemPrompt(function (ctx) {
  // ctx.systemPrompt — 当前 system prompt 字符串
  ctx.systemPrompt += "\n\n你是一个专业的翻译助手。";
});
```

#### postStream — 流式响应过滤

每个流式响应 chunk 到达时触发（轻量操作）：

```javascript
api.chat.onPostStream(function (ctx) {
  // ctx.chunk — 当前 chunk 文本
  // 可修改 chunk 内容
  ctx.chunk = ctx.chunk.replace(/badword/g, "***");
});
```

#### postResponse — 响应完成后处理

完整响应生成后、显示给用户之前：

```javascript
api.chat.onPostResponse(async function (ctx) {
  // ctx.response — 完整响应文本
  // 在末尾追加翻译
  const translation = await translate(ctx.response);
  ctx.response += "\n\n---\n翻译：" + translation;
});
```

**钩子执行规则**:
- 同类钩子按注册顺序串行执行
- 单个钩子抛出异常时跳过该钩子并打警告日志，不影响其他钩子

### mcp — MCP 工具注册

**权限**: `mcp.tools`

插件可以注册 MCP 工具，让 AI 在聊天中调用：

```javascript
const tools = api.mcp.registerTools({
  id: "web-tools",           // 服务器 ID（会加上 plugin:{pluginId}/ 前缀）
  name: "Web Tools",
  description: "网页操作工具集",
  tools: [
    {
      name: "fetch_url",
      description: "获取指定 URL 的网页内容",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "要获取的 URL" },
          format: { type: "string", enum: ["text", "html", "markdown"], default: "text" },
        },
        required: ["url"],
      },
      handler: async function (args) {
        const response = await fetch(args.url);
        const text = await response.text();
        return {
          content: [{ type: "text", text: text }],
        };
      },
    },
  ],
});

// 手动注销
// tools.dispose();
```

注册的工具会自动出现在 AI 的可用工具列表中，AI 可以在聊天中调用。插件停用时自动注销。

### skills — Skill 注册

**权限**: `skills.create`

插件可以动态创建 Skill（完整 AI 能力单元）：

```javascript
const skill = api.skills.registerSkill({
  id: "code-analyzer",       // Skill ID（会加上 plugin:{pluginId}/ 前缀）
  name: "Code Analyzer",
  description: "分析代码质量并给出改进建议",
  icon: "🔍",
  category: "development",
  systemPrompt: "你是一个专业的代码分析师...",
  tools: [
    {
      name: "analyze",
      description: "分析代码文件",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "要分析的代码" },
          language: { type: "string", description: "编程语言" },
        },
        required: ["code"],
      },
      handler: async function (input) {
        // 执行分析逻辑
        return {
          issues: [],
          suggestions: [],
          score: 85,
        };
      },
    },
  ],
});
```

### ui — UI 扩展

#### 侧边栏项

**权限**: `ui.sidebar`

```javascript
api.ui.registerSidebarItem({
  id: "dashboard",
  label: "数据面板",
  icon: "📊",
  iconType: "emoji",    // "default" | "emoji"
  path: "/plugin/my-plugin/dashboard",  // 可选，默认自动生成
  order: 100,           // 排序权重，可选
});
```

注册后，侧边栏底部会出现该菜单项（与内置菜单项之间有分割线）。点击导航到指定路由。

#### 自定义页面

**权限**: `ui.pages`

```javascript
api.ui.registerPage({
  id: "dashboard",
  path: "/plugin/my-plugin/dashboard",
  title: "数据面板",
  htmlFile: "pages/dashboard.html",  // 相对于插件目录的 HTML 文件路径
});
```

页面在沙箱化的 iframe 中渲染（`sandbox="allow-scripts allow-forms"`），与宿主应用隔离。

**插件 HTML 页面示例** (`pages/dashboard.html`):

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 20px; }
    .card { background: #f5f5f5; border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <h1>数据面板</h1>
  <div class="card">
    <p>这是插件自定义页面的内容</p>
  </div>
</body>
</html>
```

#### 设置面板

**权限**: `ui.settings`

设置面板通过 `contributes.configuration` 声明，**无需手动注册**。系统会根据声明自动生成配置表单并添加到设置页面中：

```json
{
  "contributes": {
    "configuration": {
      "title": "My Plugin Settings",
      "properties": {
        "my-plugin.apiUrl": {
          "type": "string",
          "default": "https://api.example.com",
          "description": "API 服务器地址"
        },
        "my-plugin.maxRetries": {
          "type": "number",
          "default": 3,
          "description": "最大重试次数"
        },
        "my-plugin.enabled": {
          "type": "boolean",
          "default": true,
          "description": "启用增强功能"
        },
        "my-plugin.theme": {
          "type": "string",
          "default": "auto",
          "description": "界面主题",
          "enum": ["auto", "light", "dark"],
          "enumDescriptions": ["跟随系统", "浅色", "深色"]
        }
      }
    }
  }
}
```

自动生成的表单控件映射：

| `type` 值                  | 控件类型         |
|---------------------------|-----------------|
| `"string"`                | `<Input />`     |
| `"number"`                | `<InputNumber />`|
| `"boolean"`               | `<Switch />`    |
| `"string"` + `enum`       | `<Select />`    |

配置值通过 `pluginService.getStorage()` / `setStorage()` 持久化，key 格式为 `config.{属性名}`。

---

## 贡献点 (Contributes)

贡献点声明插件向应用提供的功能扩展，在 `package.json` 的 `contributes` 字段中定义。

### commands

声明命令（必须在 `activate()` 中实际注册才生效）：

```json
{
  "contributes": {
    "commands": [
      {
        "command": "my-plugin.action",
        "title": "Execute Action",
        "category": "My Plugin",
        "icon": "▶️"
      }
    ]
  }
}
```

| 字段       | 必需 | 说明                                        |
|------------|------|---------------------------------------------|
| `command`  | 是   | 命令 ID，必须与 `registerCommand` 的 ID 一致 |
| `title`    | 是   | 在 UI 中显示的标题                          |
| `category` | 否   | 分组标签                                    |
| `icon`     | 否   | 图标                                        |
| `when`     | 否   | 可见性条件表达式                            |

### keybindings

为命令绑定快捷键：

```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "my-plugin.action",
        "key": "ctrl+shift+p",
        "mac": "cmd+shift+p"
      }
    ]
  }
}
```

### configuration

声明插件配置项（详见 [UI 扩展 - 设置面板](#设置面板)）。

### themes

提供自定义主题/皮肤：

```json
{
  "contributes": {
    "themes": [
      {
        "id": "dark-purple",
        "label": "暗紫主题",
        "style": "themes/dark-purple.css",
        "antdTokens": "themes/dark-purple-tokens.json"
      }
    ]
  }
}
```

---

## 插件编写规范

### 1. 模块格式

**必须使用 CommonJS**（`module.exports`），不支持 ES Module。

```javascript
// ✅ 正确
module.exports = {
  activate(context) { /* ... */ },
  deactivate() { /* ... */ }
};

// ❌ 错误
export default {
  activate(context) { /* ... */ },
  deactivate() { /* ... */ }
};
```

### 2. 入口导出

必须导出 `activate` 函数，`deactivate` 可选但建议提供：

```javascript
module.exports = {
  activate(context) {
    const api = context.api;
    // 使用 api 注册各种功能
  },
  deactivate() {
    // 清理非 subscriptions/api 管理的资源（定时器等）
  }
};
```

### 3. 利用 PluginAPI 而非 console

推荐使用 `api.logger` 代替 `console`：

```javascript
// 推荐
api.logger.info("操作完成", { duration: 123 });
api.logger.error("操作失败", { error: err.message });

// 也可以（但不推荐）
console.log("[My Plugin] 操作完成");
```

### 4. Dispose 模式

所有 `api` 注册方法都返回 `{ dispose() }` 对象。通常不需要手动调用，停用时自动清理：

```javascript
activate(context) {
  const api = context.api;

  // 这些注册在插件停用时自动清理
  api.chat.onPreSend(async (ctx) => { /* ... */ });
  api.mcp.registerTools({ /* ... */ });
  api.skills.registerSkill({ /* ... */ });
  api.ui.registerSidebarItem({ /* ... */ });

  // 如需提前注销：
  const hook = api.chat.onPreSend(handler);
  // ... 稍后
  hook.dispose();
}
```

### 5. 错误处理

```javascript
activate(context) {
  const api = context.api;

  api.commands.registerCommand("my-plugin.riskyAction", async function () {
    try {
      const result = await doSomething();
      return { success: true, data: result };
    } catch (error) {
      api.logger.error("riskyAction failed", { error: error.message });
      return { success: false, error: error.message };
    }
  });
}
```

### 6. 避免的做法

| 做法                     | 原因                                        |
|--------------------------|---------------------------------------------|
| 使用全局变量污染         | 影响其他插件                                |
| 修改 `process.env`       | 影响主进程                                  |
| `require` 主进程模块     | 安全隔离                                    |
| 同步阻塞操作             | 阻塞主进程事件循环                          |
| 使用 `eval` / `Function` | 安全风险                                    |
| 依赖绝对路径             | 使用 `context.extensionPath` 和 `api.fs`    |
| 在 `deactivate` 中手动注销 API 注册 | 系统自动清理，避免重复 |

---

## 开发者模式

开发者模式方便插件开发和调试，特性包括：

### 开发模式安装

```
应用 → 插件中心 → 开发者安装
```

或通过代码调用：

```typescript
await pluginService.installDev("/path/to/my-plugin-source");
```

开发模式安装使用 **符号链接（symlink）** 代替文件复制，使得源代码的修改立即生效。

### 热重载

开发模式下修改代码后，可通过以下方式重新加载：

1. 手动触发：`pluginService.reloadDev(pluginId)` 或在插件管理页面点击"重载"按钮
2. 系统执行：停用 → 重新激活

### 依赖自动安装

安装包含 `dependencies` 的插件时，系统自动在插件目录中执行 `npm install --production`。

---

## 内置插件开发

内置插件的代码以字符串形式维护在 `src/main/services/plugin/builtinPlugins.ts` 中。

### 添加内置插件的步骤

#### 1. 定义市场元数据

```typescript
export const BUILTIN_MARKET_PLUGINS: BuiltinMarketPlugin[] = [
  {
    id: "my-builtin-plugin",
    name: "my-builtin-plugin",
    displayName: "My Builtin Plugin",
    description: "Description here",
    version: "1.0.0",
    author: "Super Client Team",
    icon: "🔧",
    categories: ["tools"],
    downloads: 0,
    rating: 5.0,
  },
];
```

#### 2. 定义清单

```typescript
export const MY_PLUGIN_MANIFEST = {
  name: "my-builtin-plugin",
  displayName: "My Builtin Plugin",
  version: "1.0.0",
  main: "index.js",
  engines: { "super-client-r": "^1.0.0" },
  activationEvents: ["onStartup"],
  permissions: ["commands", "chat.hooks"],
  contributes: { /* ... */ },
};
```

#### 3. 编写源代码字符串

```typescript
export const MY_PLUGIN_SOURCE = `"use strict";
module.exports = {
  activate(context) {
    const api = context.api;
    api.commands.registerCommand("my-builtin-plugin.action", function() {
      return { result: "done" };
    });
  },
  deactivate() {}
};
`;
```

#### 4. 注册到映射表

```typescript
export const BUILTIN_PLUGIN_SOURCES = {
  "my-builtin-plugin": { manifest: MY_PLUGIN_MANIFEST, source: MY_PLUGIN_SOURCE },
};
```

---

## 调试与测试

### 开发环境调试

1. 创建插件目录，包含 `package.json` 和 `index.js`
2. 使用"开发者安装"加载插件（symlink 模式）
3. 打开开发者工具（`Alt+Cmd+I`），查看主进程控制台输出
4. 修改代码后，点击"重载"或禁用再启用插件
5. 在日志查看器 (`/log-viewer`) 中按 `Plugin:{id}` 模块过滤日志

### 常见问题排查

| 问题                     | 排查方法                                                         |
|--------------------------|------------------------------------------------------------------|
| 安装后无反应             | 检查 `package.json` 是否有 `name`、`version`、`main`             |
| 启用后状态变 error       | 查看主进程控制台，检查 `activate()` 是否抛异常                    |
| API 调用报权限错误        | 检查 `permissions` 字段是否声明了对应权限                         |
| 命令未出现               | 确认命令在 `contributes.commands` 中声明且在 `activate()` 中注册 |
| 聊天钩子无效果           | 确认 `permissions` 包含 `chat.hooks`                              |
| MCP 工具 AI 看不到        | 确认 `permissions` 包含 `mcp.tools`，检查工具名和 inputSchema    |
| 侧边栏项未出现           | 确认 `permissions` 包含 `ui.sidebar`                              |
| 设置面板未出现           | 确认 `contributes.configuration` 格式正确                        |
| 重启后消失               | 确认 `initializePluginManager()` 在 `main.ts` 中被调用           |

---

## 完整示例

### 示例 1：聊天增强插件

一个展示聊天钩子 + MCP 工具 + 设置面板的综合插件：

#### package.json

```json
{
  "name": "chat-enhancer",
  "displayName": "Chat Enhancer",
  "version": "1.0.0",
  "description": "增强 AI 聊天体验",
  "author": "Developer",
  "main": "index.js",
  "icon": "✨",
  "engines": { "super-client-r": "^1.0.0" },
  "activationEvents": ["onStartup"],
  "permissions": [
    "commands",
    "chat.hooks",
    "mcp.tools",
    "storage",
    "ui.settings",
    "network"
  ],
  "contributes": {
    "commands": [
      { "command": "chat-enhancer.toggle", "title": "Toggle Enhancement" }
    ],
    "configuration": {
      "title": "Chat Enhancer",
      "properties": {
        "chat-enhancer.enabled": {
          "type": "boolean",
          "default": true,
          "description": "启用聊天增强"
        },
        "chat-enhancer.language": {
          "type": "string",
          "default": "zh",
          "description": "自动翻译目标语言",
          "enum": ["zh", "en", "ja"],
          "enumDescriptions": ["中文", "English", "日本語"]
        }
      }
    }
  }
}
```

#### index.js

```javascript
"use strict";

module.exports = {
  activate(context) {
    var api = context.api;
    var enabled = true;

    api.logger.info("Chat Enhancer activating...");

    // 命令: 切换开关
    api.commands.registerCommand("chat-enhancer.toggle", function () {
      enabled = !enabled;
      api.logger.info("Enhancement " + (enabled ? "enabled" : "disabled"));
      return { enabled: enabled };
    });

    // 聊天钩子: 在 system prompt 中注入增强指令
    api.chat.onSystemPrompt(function (ctx) {
      if (!enabled) return;
      ctx.systemPrompt += "\n\n请用简洁、专业的方式回答问题。";
    });

    // 聊天钩子: 响应后追加来源提示
    api.chat.onPostResponse(function (ctx) {
      if (!enabled) return;
      ctx.response += "\n\n---\n_由 Chat Enhancer 增强_";
    });

    // MCP 工具: 提供网页摘要能力
    api.mcp.registerTools({
      id: "web-summary",
      name: "Web Summary",
      description: "获取网页摘要",
      tools: [
        {
          name: "summarize_url",
          description: "获取指定 URL 的网页内容摘要",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "网页 URL" },
            },
            required: ["url"],
          },
          handler: async function (args) {
            try {
              var resp = await api.network.fetch(args.url);
              var text = await resp.text();
              // 简单截取前 2000 字符作为摘要
              var summary = text.replace(/<[^>]*>/g, "").slice(0, 2000);
              return {
                content: [{ type: "text", text: summary }],
              };
            } catch (err) {
              return {
                content: [{ type: "text", text: "获取失败: " + err.message }],
                isError: true,
              };
            }
          },
        },
      ],
    });

    api.logger.info("Chat Enhancer activated");
  },

  deactivate() {
    // 所有 api 注册在停用时自动清理
  },
};
```

### 示例 2：UI 扩展插件

展示侧边栏 + 自定义页面功能：

#### package.json

```json
{
  "name": "analytics-dashboard",
  "displayName": "Analytics Dashboard",
  "version": "1.0.0",
  "description": "聊天数据分析面板",
  "main": "index.js",
  "engines": { "super-client-r": "^1.0.0" },
  "activationEvents": ["onStartup"],
  "permissions": ["ui.sidebar", "ui.pages"]
}
```

#### index.js

```javascript
"use strict";

module.exports = {
  activate(context) {
    var api = context.api;

    // 注册侧边栏菜单项
    api.ui.registerSidebarItem({
      id: "dashboard",
      label: "数据分析",
      icon: "📊",
      iconType: "emoji",
    });

    // 注册自定义页面
    api.ui.registerPage({
      id: "dashboard",
      path: "/plugin/analytics-dashboard/dashboard",
      title: "Analytics Dashboard",
      htmlFile: "pages/dashboard.html",
    });
  },
};
```

### 示例 3：综合测试插件（Hello World）

一个覆盖所有插件 API 能力的综合测试插件，适合作为开发参考。涵盖：Commands、Storage、Chat Hooks、MCP Tools、Skills、UI 扩展、文件系统、Logger、Window 对话框、Configuration。

#### package.json

```json
{
  "name": "hello-world",
  "displayName": "Hello World Test",
  "version": "1.0.0",
  "description": "A comprehensive test plugin that exercises all plugin API capabilities",
  "author": "Super Client Team",
  "main": "index.js",
  "icon": "🧪",
  "categories": ["test", "development"],
  "license": "MIT",
  "engines": {
    "super-client-r": "^1.0.0"
  },
  "activationEvents": ["onStartup"],
  "permissions": [
    "commands",
    "storage",
    "chat.hooks",
    "mcp.tools",
    "skills.create",
    "ui.sidebar",
    "ui.pages",
    "window.notify",
    "fs.read",
    "fs.write"
  ],
  "contributes": {
    "commands": [
      {
        "command": "hello-world.greet",
        "title": "Say Hello",
        "category": "Hello World"
      },
      {
        "command": "hello-world.counter",
        "title": "Show Counter",
        "category": "Hello World"
      },
      {
        "command": "hello-world.status",
        "title": "Plugin Status",
        "category": "Hello World"
      }
    ],
    "configuration": {
      "title": "Hello World Settings",
      "properties": {
        "greeting": {
          "type": "string",
          "default": "Hello",
          "description": "The greeting prefix to use"
        },
        "enableChatHook": {
          "type": "boolean",
          "default": true,
          "description": "Enable chat message hook (adds timestamp to messages)"
        },
        "hookPosition": {
          "type": "string",
          "default": "prefix",
          "description": "Where to add the hook content",
          "enum": ["prefix", "suffix", "none"],
          "enumDescriptions": [
            "Add before message",
            "Add after message",
            "Disable hook"
          ]
        },
        "counterStep": {
          "type": "number",
          "default": 1,
          "description": "Counter increment step size"
        }
      }
    }
  }
}
```

#### index.js

```javascript
/**
 * Hello World Test Plugin
 *
 * 综合测试插件，验证插件系统的各项能力：
 * - Commands: 注册命令
 * - Storage: 持久化存储
 * - Chat Hooks: 聊天管道钩子（preSend / postResponse）
 * - MCP Tools: 注册 AI 可调用的工具
 * - Skills: 注册 Skill 技能
 * - UI: 侧边栏项 + 自定义页面
 * - Logger: 日志输出
 * - FS: 文件读写
 * - Window: 消息对话框
 */

let api;
let disposables = [];

/**
 * 插件激活入口
 */
async function activate(context) {
  api = context.api;
  if (!api) {
    console.error("[HelloWorld] PluginAPI not available!");
    return;
  }

  api.logger.info("=== Hello World Plugin Activating ===");

  // ---- 1. Commands ----
  testCommands(context);

  // ---- 2. Storage ----
  await testStorage();

  // ---- 3. Chat Hooks ----
  testChatHooks();

  // ---- 4. MCP Tools ----
  testMcpTools();

  // ---- 5. Skills ----
  testSkills();

  // ---- 6. UI Extensions ----
  testUI();

  // ---- 7. File System ----
  await testFileSystem();

  api.logger.info("=== Hello World Plugin Activated Successfully ===");
  api.logger.info(
    `Registered ${disposables.length} disposables for cleanup`,
  );
}

// =====================================================
// 1. Commands
// =====================================================
function testCommands(_context) {
  // 注册 greet 命令
  const d1 = api.commands.registerCommand("hello-world.greet", async () => {
    const greeting = (await api.storage.get("config.greeting")) || "Hello";
    const count = ((await api.storage.get("greetCount")) || 0) + 1;
    await api.storage.set("greetCount", count);

    const message = `${greeting}, World! (greeted ${count} times)`;
    api.logger.info("Greet command executed", { message });

    // 显示消息对话框
    const choice = await api.window.showInformationMessage(
      message,
      "OK",
      "Reset Counter",
    );
    if (choice === "Reset Counter") {
      await api.storage.set("greetCount", 0);
      api.logger.info("Greet counter reset");
    }

    return message;
  });
  disposables.push({ dispose: d1 });

  // 注册 counter 命令
  const d2 = api.commands.registerCommand(
    "hello-world.counter",
    async () => {
      const step =
        (await api.storage.get("config.counterStep")) || 1;
      const current = ((await api.storage.get("counter")) || 0) + step;
      await api.storage.set("counter", current);

      api.logger.info(`Counter: ${current} (step: ${step})`);
      return { counter: current, step };
    },
  );
  disposables.push({ dispose: d2 });

  // 注册 status 命令
  const d3 = api.commands.registerCommand(
    "hello-world.status",
    async () => {
      const greetCount = (await api.storage.get("greetCount")) || 0;
      const counter = (await api.storage.get("counter")) || 0;
      const enableChatHook =
        (await api.storage.get("config.enableChatHook")) ?? true;
      const logContent = await readLogSafe();

      const status = {
        plugin: "hello-world",
        version: "1.0.0",
        greetCount,
        counter,
        chatHookEnabled: enableChatHook,
        logLines: logContent ? logContent.split("\n").length : 0,
        timestamp: new Date().toISOString(),
      };

      api.logger.info("Status check", status);
      return status;
    },
  );
  disposables.push({ dispose: d3 });

  api.logger.info("Commands registered: greet, counter, status");
}

// =====================================================
// 2. Storage
// =====================================================
async function testStorage() {
  // 写入测试值
  await api.storage.set("testKey", "testValue");
  const val = await api.storage.get("testKey");

  if (val === "testValue") {
    api.logger.info("Storage: read/write test PASSED");
  } else {
    api.logger.error(`Storage: read/write test FAILED (got: ${val})`);
  }

  // 删除测试
  await api.storage.delete("testKey");
  const deleted = await api.storage.get("testKey");
  if (deleted === undefined) {
    api.logger.info("Storage: delete test PASSED");
  } else {
    api.logger.error(
      `Storage: delete test FAILED (got: ${deleted})`,
    );
  }

  // 初始化激活计数
  const activationCount =
    ((await api.storage.get("activationCount")) || 0) + 1;
  await api.storage.set("activationCount", activationCount);
  api.logger.info(`Storage: activation count = ${activationCount}`);
}

// =====================================================
// 3. Chat Hooks
// =====================================================
function testChatHooks() {
  // preSend 钩子：在消息中注入时间戳标记
  const d1 = api.chat.onPreSend(async (ctx) => {
    const enabled = (await api.storage.get("config.enableChatHook")) ?? true;
    if (!enabled) return;

    const position =
      (await api.storage.get("config.hookPosition")) || "prefix";
    if (position === "none") return;

    const timestamp = new Date().toLocaleTimeString();
    const lastMsg = ctx.messages[ctx.messages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      if (position === "prefix") {
        lastMsg.content = `[${timestamp}] ${lastMsg.content}`;
      } else {
        lastMsg.content = `${lastMsg.content} [sent at ${timestamp}]`;
      }
      api.logger.debug("PreSend hook: added timestamp to message");
    }
  });
  disposables.push(d1);

  // postResponse 钩子：记录 AI 响应长度
  const d2 = api.chat.onPostResponse(async (ctx) => {
    const len = ctx.response ? ctx.response.length : 0;
    api.logger.info(`PostResponse hook: response length = ${len}`);

    // 记录响应统计
    const stats = (await api.storage.get("responseStats")) || {
      count: 0,
      totalLength: 0,
    };
    stats.count += 1;
    stats.totalLength += len;
    await api.storage.set("responseStats", stats);
  });
  disposables.push(d2);

  api.logger.info("Chat hooks registered: preSend, postResponse");
}

// =====================================================
// 4. MCP Tools
// =====================================================
function testMcpTools() {
  const d = api.mcp.registerTools({
    id: "hello-tools",
    name: "Hello World Tools",
    description: "Test MCP tools from the hello-world plugin",
    tools: [
      {
        name: "hello_greet",
        description:
          "Generate a greeting message. Use this tool when the user asks to say hello or greet someone.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the person to greet",
            },
            language: {
              type: "string",
              description: "Language for greeting (en/zh/ja)",
              enum: ["en", "zh", "ja"],
            },
          },
          required: ["name"],
        },
        handler: async (args) => {
          const name = args.name || "World";
          const lang = args.language || "en";

          const greetings = {
            en: `Hello, ${name}! Welcome!`,
            zh: `你好，${name}！欢迎！`,
            ja: `こんにちは、${name}！ようこそ！`,
          };

          const message = greetings[lang] || greetings.en;
          api.logger.info("MCP tool hello_greet called", {
            name,
            lang,
          });

          return {
            content: [{ type: "text", text: message }],
          };
        },
      },
      {
        name: "hello_stats",
        description:
          "Get statistics from the hello-world test plugin. Use this tool to check plugin health and usage stats.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        handler: async () => {
          const greetCount =
            (await api.storage.get("greetCount")) || 0;
          const counter =
            (await api.storage.get("counter")) || 0;
          const activationCount =
            (await api.storage.get("activationCount")) || 0;
          const responseStats =
            (await api.storage.get("responseStats")) || {
              count: 0,
              totalLength: 0,
            };

          const stats = {
            greetCount,
            counter,
            activationCount,
            responseStats,
            uptime: process.uptime().toFixed(1) + "s",
            timestamp: new Date().toISOString(),
          };

          api.logger.info("MCP tool hello_stats called");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(stats, null, 2),
              },
            ],
          };
        },
      },
    ],
  });
  disposables.push(d);

  api.logger.info("MCP tools registered: hello_greet, hello_stats");
}

// =====================================================
// 5. Skills
// =====================================================
function testSkills() {
  const d = api.skills.registerSkill({
    id: "greeting-assistant",
    name: "Greeting Assistant",
    description:
      "A friendly greeting assistant that can generate personalized greetings in multiple languages",
    icon: "👋",
    category: "test",
    systemPrompt: [
      "You are a friendly greeting assistant.",
      "You can generate personalized greetings in multiple languages.",
      "Use the available tools to create and manage greetings.",
      "Always be cheerful and welcoming!",
    ].join("\n"),
    tools: [
      {
        name: "generate_greeting",
        description: "Generate a personalized greeting card",
        inputSchema: {
          type: "object",
          properties: {
            recipient: {
              type: "string",
              description: "Name of the recipient",
            },
            occasion: {
              type: "string",
              description:
                "The occasion (birthday, new_year, thanks, general)",
              enum: [
                "birthday",
                "new_year",
                "thanks",
                "general",
              ],
            },
            style: {
              type: "string",
              description:
                "Style of greeting (formal, casual, funny)",
              enum: ["formal", "casual", "funny"],
            },
          },
          required: ["recipient"],
        },
        handler: async (input) => {
          const recipient = input.recipient || "Friend";
          const occasion = input.occasion || "general";
          const style = input.style || "casual";

          const templates = {
            birthday: {
              formal: `Dear ${recipient}, wishing you a wonderful birthday filled with joy and prosperity.`,
              casual: `Happy Birthday, ${recipient}! Hope your day is awesome! 🎂`,
              funny: `Another year older, ${recipient}? Don't worry, you don't look a day over fabulous! 🎉`,
            },
            new_year: {
              formal: `Dear ${recipient}, may the New Year bring you success and happiness.`,
              casual: `Happy New Year, ${recipient}! Let's make it a great one! 🎊`,
              funny: `New year, new ${recipient}... who are we kidding, same awesome you! 🥳`,
            },
            thanks: {
              formal: `Dear ${recipient}, I extend my sincere gratitude for your kindness.`,
              casual: `Thanks so much, ${recipient}! You're the best! 🙏`,
              funny: `${recipient}, you're so helpful, I'm starting to think you might be a robot (the good kind)! 🤖`,
            },
            general: {
              formal: `Dear ${recipient}, I hope this message finds you well.`,
              casual: `Hey ${recipient}! Hope you're doing great! 👋`,
              funny: `${recipient}! I was just thinking about you... and then I got distracted. But now I'm back! 😄`,
            },
          };

          const message =
            templates[occasion]?.[style] ||
            templates.general.casual;

          api.logger.info("Skill generate_greeting called", {
            recipient,
            occasion,
            style,
          });

          return {
            greeting: message,
            occasion,
            style,
            generated_at: new Date().toISOString(),
          };
        },
      },
    ],
  });
  disposables.push(d);

  api.logger.info("Skill registered: greeting-assistant");
}

// =====================================================
// 6. UI Extensions
// =====================================================
function testUI() {
  // 侧边栏项 — path 必须与 registerPage 的 path 一致
  const pagePath = "/plugin/hello-world/dashboard";
  const d1 = api.ui.registerSidebarItem({
    id: "hello-world-page",
    label: "Hello World",
    icon: "🧪",
    iconType: "emoji",
    path: pagePath,
    order: 100,
  });
  disposables.push(d1);

  // 自定义页面
  const d2 = api.ui.registerPage({
    id: "hello-dashboard",
    path: pagePath,
    title: "Hello World Dashboard",
    htmlFile: "page.html",
  });
  disposables.push(d2);

  api.logger.info("UI extensions registered: sidebar item, custom page");
}

// =====================================================
// 7. File System
// =====================================================
async function testFileSystem() {
  try {
    // 写入测试文件
    const testContent = JSON.stringify(
      {
        plugin: "hello-world",
        test: "fs-write",
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    );
    await api.fs.writeTextFile("test-output.json", testContent);

    // 读取测试文件
    const readBack = await api.fs.readTextFile("test-output.json");
    const parsed = JSON.parse(readBack);

    if (parsed.plugin === "hello-world" && parsed.test === "fs-write") {
      api.logger.info("FS: write/read test PASSED");
    } else {
      api.logger.error("FS: write/read test FAILED (content mismatch)");
    }

    // 检查文件是否存在
    const exists = await api.fs.exists("test-output.json");
    if (exists) {
      api.logger.info("FS: exists test PASSED");
    } else {
      api.logger.error("FS: exists test FAILED");
    }

    // 获取文件信息
    const stat = await api.fs.stat("test-output.json");
    api.logger.info("FS: stat test", {
      type: stat.type,
      size: stat.size,
    });

    // 清理测试文件
    await api.fs.delete("test-output.json");
    const afterDelete = await api.fs.exists("test-output.json");
    if (!afterDelete) {
      api.logger.info("FS: delete test PASSED");
    } else {
      api.logger.error("FS: delete test FAILED");
    }
  } catch (error) {
    api.logger.error("FS: test error", error);
  }
}

// =====================================================
// Helper
// =====================================================
async function readLogSafe() {
  try {
    const exists = await api.fs.exists("plugin.log");
    if (exists) {
      return await api.fs.readTextFile("plugin.log");
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 插件停用
 */
function deactivate() {
  if (api) {
    api.logger.info("=== Hello World Plugin Deactivating ===");
    api.logger.info(`Cleaning up ${disposables.length} disposables`);
  }

  for (const d of disposables) {
    try {
      if (typeof d.dispose === "function") {
        d.dispose();
      } else if (typeof d === "function") {
        d();
      }
    } catch (error) {
      console.error("[HelloWorld] Dispose error:", error);
    }
  }
  disposables = [];
  api = null;
}

module.exports = { activate, deactivate };
```

#### page.html

自定义页面，在 iframe 沙箱中渲染，展示插件测试仪表盘：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hello World Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 24px;
      min-height: 100vh;
    }

    .dashboard {
      max-width: 800px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .header h1 {
      font-size: 28px;
      color: #00d2ff;
      margin-bottom: 8px;
    }

    .header p {
      color: #888;
      font-size: 14px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .card {
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #0f3460;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0, 210, 255, 0.1);
    }

    .card-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }

    .card-title {
      font-size: 13px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .card-value {
      font-size: 24px;
      font-weight: 700;
      color: #00d2ff;
    }

    .section {
      background: #16213e;
      border-radius: 12px;
      padding: 24px;
      border: 1px solid #0f3460;
      margin-bottom: 24px;
    }

    .section h2 {
      font-size: 18px;
      color: #e0e0e0;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .test-list {
      list-style: none;
    }

    .test-item {
      display: flex;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #0f3460;
      gap: 12px;
    }

    .test-item:last-child {
      border-bottom: none;
    }

    .test-status {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }

    .test-status.pass {
      background: rgba(0, 200, 83, 0.15);
      color: #00c853;
    }

    .test-name {
      flex: 1;
      font-size: 14px;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-success {
      background: rgba(0, 200, 83, 0.15);
      color: #00c853;
    }

    .badge-info {
      background: rgba(0, 210, 255, 0.15);
      color: #00d2ff;
    }

    .footer {
      text-align: center;
      color: #555;
      font-size: 12px;
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>Hello World Plugin</h1>
      <p>Plugin System Comprehensive Test Dashboard</p>
    </div>

    <div class="cards">
      <div class="card">
        <div class="card-icon">📊</div>
        <div class="card-title">API Namespaces</div>
        <div class="card-value">12</div>
      </div>
      <div class="card">
        <div class="card-icon">🔧</div>
        <div class="card-title">MCP Tools</div>
        <div class="card-value">2</div>
      </div>
      <div class="card">
        <div class="card-icon">⚡</div>
        <div class="card-title">Commands</div>
        <div class="card-value">3</div>
      </div>
      <div class="card">
        <div class="card-icon">🪝</div>
        <div class="card-title">Chat Hooks</div>
        <div class="card-value">2</div>
      </div>
    </div>

    <div class="section">
      <h2>Feature Test Results</h2>
      <ul class="test-list">
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">Commands (registerCommand)</span>
          <span class="badge badge-success">3 registered</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">Storage (get / set / delete)</span>
          <span class="badge badge-success">CRUD working</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">Chat Hooks (preSend + postResponse)</span>
          <span class="badge badge-info">2 hooks</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">MCP Tools (hello_greet + hello_stats)</span>
          <span class="badge badge-info">2 tools</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">Skills (greeting-assistant)</span>
          <span class="badge badge-info">1 skill</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">UI Sidebar Item</span>
          <span class="badge badge-success">registered</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">UI Custom Page</span>
          <span class="badge badge-success">this page!</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">File System (write / read / stat / delete)</span>
          <span class="badge badge-success">all passed</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">Logger (info / debug / warn / error)</span>
          <span class="badge badge-success">working</span>
        </li>
        <li class="test-item">
          <span class="test-status pass">✓</span>
          <span class="test-name">Configuration (4 settings declared)</span>
          <span class="badge badge-info">auto-generated UI</span>
        </li>
      </ul>
    </div>

    <div class="section">
      <h2>Capabilities Covered</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
        <div>✅ api.commands.registerCommand</div>
        <div>✅ api.commands.executeCommand</div>
        <div>✅ api.storage.get / set / delete</div>
        <div>✅ api.window.showInformationMessage</div>
        <div>✅ api.chat.onPreSend</div>
        <div>✅ api.chat.onPostResponse</div>
        <div>✅ api.mcp.registerTools</div>
        <div>✅ api.skills.registerSkill</div>
        <div>✅ api.ui.registerSidebarItem</div>
        <div>✅ api.ui.registerPage</div>
        <div>✅ api.fs.writeTextFile / readTextFile</div>
        <div>✅ api.fs.exists / stat / delete</div>
        <div>✅ api.logger.info / debug / error</div>
        <div>✅ contributes.configuration</div>
      </div>
    </div>

    <div class="section">
      <h2>Permissions Required</h2>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px;">
        <span class="badge badge-info">commands</span>
        <span class="badge badge-info">storage</span>
        <span class="badge badge-info">chat.hooks</span>
        <span class="badge badge-info">mcp.tools</span>
        <span class="badge badge-info">skills.create</span>
        <span class="badge badge-info">ui.sidebar</span>
        <span class="badge badge-info">ui.pages</span>
        <span class="badge badge-info">window.notify</span>
        <span class="badge badge-info">fs.read</span>
        <span class="badge badge-info">fs.write</span>
      </div>
    </div>

    <div class="footer">
      <p>Hello World Test Plugin v1.0.0 — Super Client R Plugin System</p>
    </div>
  </div>
</body>
</html>
```

#### 目录结构

```
hello-world/
├── package.json    # 插件清单：元信息、权限、命令、配置
├── index.js        # 主入口：activate / deactivate
└── page.html       # 自定义页面（在 iframe 中渲染）
```

#### 关键要点

1. **权限声明**: `package.json` 中的 `permissions` 数组必须列出所有用到的能力，安装时用户需确认
2. **侧边栏与页面关联**: `registerSidebarItem` 的 `path` 必须与 `registerPage` 的 `path` 完全一致
3. **页面路径格式**: 路径必须是 `/plugin/{pluginName}/{pageId}` 格式
4. **disposable 管理**: 所有注册操作返回的 disposable 应保存，在 `deactivate()` 中统一清理
5. **Window API 异步**: `api.window.showInformationMessage()` 返回 Promise，等待用户交互后 resolve

---

## IPC 通道参考

插件系统使用的 IPC 通道：

### 基础管理通道

| 通道                       | 方向            | 说明                       |
|----------------------------|-----------------|----------------------------|
| `plugin:getAll`            | Renderer → Main | 获取所有已安装插件         |
| `plugin:get`               | Renderer → Main | 获取单个插件信息           |
| `plugin:install`           | Renderer → Main | 打开目录选择器安装本地插件 |
| `plugin:uninstall`         | Renderer → Main | 卸载插件                   |
| `plugin:enable`            | Renderer → Main | 启用插件（触发激活）       |
| `plugin:disable`           | Renderer → Main | 禁用插件（触发停用）       |
| `plugin:searchMarket`      | Renderer → Main | 搜索插件市场               |
| `plugin:download`          | Renderer → Main | 从市场下载安装插件         |
| `plugin:getCommands`       | Renderer → Main | 获取已注册命令列表         |
| `plugin:executeCommand`    | Renderer → Main | 执行命令                   |
| `plugin:getStorage`        | Renderer → Main | 读取插件存储               |
| `plugin:setStorage`        | Renderer → Main | 写入插件存储               |
| `plugin:deleteStorage`     | Renderer → Main | 删除插件存储               |

### 权限管理通道

| 通道                       | 方向            | 说明                       |
|----------------------------|-----------------|----------------------------|
| `plugin:grantPermissions`  | Renderer → Main | 授予插件权限               |
| `plugin:getPermissions`    | Renderer → Main | 查询插件已授权权限         |

### UI 扩展通道

| 通道                             | 方向            | 说明                       |
|----------------------------------|-----------------|----------------------------|
| `plugin:getUIContributions`      | Renderer → Main | 获取所有 UI 贡献           |
| `plugin:ui-contributions-changed`| Main → Renderer | UI 贡献变更广播            |
| `plugin:getPluginPageHTML`       | Renderer → Main | 获取插件页面 HTML          |

### 窗口对话框通道

| 通道                      | 方向                  | 说明                       |
|---------------------------|-----------------------|----------------------------|
| `plugin:showMessage`      | Main → Renderer → Main| PluginAPI.window 消息框    |
| `plugin:showInputBox`     | Main → Renderer → Main| PluginAPI.window 输入框    |
| `plugin:showQuickPick`    | Main → Renderer → Main| PluginAPI.window 选择框    |

### 开发者/更新通道

| 通道                      | 方向            | 说明                       |
|---------------------------|-----------------|----------------------------|
| `plugin:installDev`       | Renderer → Main | 开发模式安装（symlink）    |
| `plugin:reloadDev`        | Renderer → Main | 重载开发插件               |
| `plugin:checkUpdates`     | Renderer → Main | 检查插件更新               |
| `plugin:updatePlugin`     | Renderer → Main | 更新指定插件               |

所有 IPC 响应格式统一为：

```typescript
{ success: boolean; data?: T; error?: string }
```
