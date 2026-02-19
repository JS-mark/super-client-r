# 插件开发指南

本文档面向 Super Client R 插件开发者，涵盖插件系统架构、开发规范、API 参考和完整示例。

---

## 目录

- [快速开始](#快速开始)
- [插件架构](#插件架构)
- [插件清单 (package.json)](#插件清单-packagejson)
- [插件生命周期](#插件生命周期)
- [Plugin Context API](#plugin-context-api)
- [贡献点 (Contributes)](#贡献点-contributes)
- [插件编写规范](#插件编写规范)
- [内置插件开发](#内置插件开发)
- [调试与测试](#调试与测试)
- [发布到插件市场](#发布到插件市场)
- [完整示例](#完整示例)

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
  }
}
```

### index.js

```javascript
"use strict";

module.exports = {
  activate(context) {
    console.log("[My Plugin] Activated!");

    context.commands.registerCommand("my-plugin.hello", function () {
      return { message: "Hello from My Plugin!" };
    });
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
┌─────────────────────────────────────────────────┐
│                  Renderer Process                │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Plugins  │──│pluginService │──│  chatStore │  │
│  │  Page    │  │  (IPC calls) │  │(pendingIn) │  │
│  └──────────┘  └──────┬───────┘  └───────────┘  │
│                       │ IPC                      │
├───────────────────────┼─────────────────────────┤
│                  Main Process                    │
│  ┌────────────────────┴──────────────────────┐  │
│  │          pluginHandlers (IPC)             │  │
│  │  plugin:getAll / plugin:enable / ...      │  │
│  │  plugin:getCommands / plugin:executeCommand│  │
│  └────────────────────┬──────────────────────┘  │
│  ┌────────────────────┴──────────────────────┐  │
│  │            PluginManager                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ │  │
│  │  │ plugins  │ │ active   │ │ command   │ │  │
│  │  │  Map     │ │ Plugins  │ │ Registry  │ │  │
│  │  └──────────┘ └──────────┘ └───────────┘ │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │         electron-store (持久化)            │  │
│  │  config.plugins / config.pluginsData      │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │      <userData>/plugins/ (插件文件)        │  │
│  │      <userData>/plugin-storage/ (存储)     │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 关键路径

| 路径                                     | 说明                            |
|------------------------------------------|---------------------------------|
| `<userData>/plugins/<plugin-id>/`        | 插件安装目录                    |
| `<userData>/plugin-storage/<plugin-id>/` | 插件专用存储目录                |
| `config.plugins`                         | electron-store 中的插件元数据   |
| `config.pluginsData`                     | electron-store 中的插件键值存储 |

> `<userData>` 开发环境为 `~/.scr-data-dev`，生产环境由 Electron 管理。

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
  "name": "prompt-templates",
  "displayName": "Prompt Templates",
  "version": "1.0.0",
  "description": "Curated AI prompt templates for common tasks",
  "author": "Super Client Team",
  "main": "index.js",
  "icon": "📝",
  "categories": ["productivity", "prompts"],
  "engines": { "super-client-r": "^1.0.0" },
  "activationEvents": ["onStartup"],
  "contributes": {
    "commands": [
      {
        "command": "prompt-templates.translate",
        "title": "Translate",
        "category": "Prompt Templates"
      }
    ]
  }
}
```

---

## 插件生命周期

```
安装 ──→ installed ──→ 启用 ──→ activating ──→ active
                                                  │
                                          禁用 ←──┘
                                            │
                                     deactivating ──→ inactive
                                                        │
                                                  卸载 ←┘
                                                    │
                                               uninstalling ──→ 已移除
```

### 状态说明

| 状态           | 说明                      |
|----------------|---------------------------|
| `installing`   | 文件复制中                |
| `installed`    | 已安装但未启用            |
| `activating`   | `activate()` 执行中       |
| `active`       | 运行中，命令可用           |
| `deactivating` | `deactivate()` 执行中     |
| `inactive`     | 已停用                    |
| `error`        | 激活或运行时出错          |
| `uninstalling` | 卸载中（先停用，再删除文件） |

### 重启恢复

应用重启时，PluginManager 按以下顺序恢复：

1. `loadPluginsFromStorage()` — 从 electron-store 读取插件列表
2. `scanPluginsDirectory()` — 扫描磁盘目录，校验文件完整性
3. `autoActivatePlugins()` — 对 `enabled: true` 的插件调用 `activatePlugin()`

因此，启用过的插件在重启后会自动恢复到 `active` 状态。

---

## Plugin Context API

`activate(context)` 接收的 `context` 对象提供以下 API：

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
  // 通过 registerCommand 注册的命令会自动加入 subscriptions
  // 插件停用时自动调用所有 dispose()

  // ═══ 状态存储 ═══
  readonly workspaceState: Memento;   // 工作区级别键值存储
  readonly globalState: Memento;      // 全局级别键值存储

  // ═══ 命令注册 ═══
  readonly commands: {
    registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown
    ): { dispose(): void };
  };
}

interface Memento {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}
```

### commands.registerCommand

注册一个可被执行的命令。

```javascript
// 注册命令
const disposable = context.commands.registerCommand(
  "my-plugin.greet",
  function (name) {
    return { greeting: `Hello, ${name || "World"}!` };
  }
);

// 命令自动加入 context.subscriptions，停用时自动清理
// 也可手动注销：
// disposable.dispose();
```

**命名规范**: 命令 ID 必须以插件 ID 为前缀，使用 `.` 分隔。

```
✅ "my-plugin.doSomething"
✅ "my-plugin.sub.action"
❌ "doSomething"           // 缺少前缀
❌ "other-plugin.action"   // 使用了其他插件前缀
```

### workspaceState / globalState

持久化键值存储，数据保存在 electron-store 中，跨重启保留。

```javascript
activate(context) {
  // 读取
  const count = context.globalState.get("runCount", 0);

  // 写入
  context.globalState.update("runCount", count + 1);

  // workspaceState 用法相同，作用域为工作区级别
  context.workspaceState.update("lastRun", Date.now());
}
```

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
| `when`     | 否   | 可见性条件表达式（暂未实现）                  |

### keybindings

为命令绑定快捷键（规划中）：

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

声明插件配置项（规划中）：

```json
{
  "contributes": {
    "configuration": {
      "title": "My Plugin Settings",
      "properties": {
        "my-plugin.language": {
          "type": "string",
          "default": "en",
          "description": "Default language",
          "enum": ["en", "zh", "ja"]
        }
      }
    }
  }
}
```

---

## 插件编写规范

### 1. 模块格式

**必须使用 CommonJS**（`module.exports`），不支持 ES Module（`export default`）。

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

原因：插件运行在 Electron 主进程（Node.js 环境），通过 `require()` 加载。

### 2. 入口导出

必须导出 `activate` 函数，`deactivate` 可选但建议提供：

```javascript
module.exports = {
  /**
   * 插件激活入口（必需）
   * @param {PluginContext} context - 插件上下文
   */
  activate(context) {
    // 初始化逻辑
    // 注册命令
    // 设置事件监听
  },

  /**
   * 插件停用（可选，建议提供）
   * 用于清理非 subscriptions 管理的资源
   */
  deactivate() {
    // 清理定时器、关闭连接等
  }
};
```

### 3. 命令规范

#### 命令 ID 命名

```
<plugin-id>.<action>
```

- 前缀必须是 `package.json` 的 `name` 字段
- 使用 camelCase 命名动作部分
- 可有多级：`my-plugin.sub.action`

#### 命令返回值

命令应返回可序列化的值（经 IPC 传递到渲染进程）：

```javascript
// ✅ 返回可序列化对象
context.commands.registerCommand("my-plugin.getData", function () {
  return { id: "1", name: "test", items: [1, 2, 3] };
});

// ❌ 返回不可序列化的值
context.commands.registerCommand("my-plugin.bad", function () {
  return function () { /* ... */ };  // 函数无法序列化
});
```

#### contributes.commands 与 registerCommand 对应

`package.json` 中声明的每个命令都应在 `activate()` 中注册：

```json
// package.json
{
  "contributes": {
    "commands": [
      { "command": "my-plugin.hello", "title": "Say Hello" },
      { "command": "my-plugin.bye", "title": "Say Bye" }
    ]
  }
}
```

```javascript
// index.js
module.exports = {
  activate(context) {
    // 与 package.json 中声明的命令一一对应
    context.commands.registerCommand("my-plugin.hello", function () {
      return { message: "Hello!" };
    });
    context.commands.registerCommand("my-plugin.bye", function () {
      return { message: "Bye!" };
    });
  }
};
```

### 4. 错误处理

```javascript
activate(context) {
  context.commands.registerCommand("my-plugin.riskyAction", function () {
    try {
      // 可能失败的操作
      const result = doSomething();
      return { success: true, data: result };
    } catch (error) {
      console.error("[My Plugin] riskyAction failed:", error);
      return { success: false, error: error.message };
    }
  });
}
```

### 5. 资源清理

通过 `subscriptions` 管理的资源在停用时自动清理。其他资源需在 `deactivate()` 中手动清理：

```javascript
let intervalId = null;

module.exports = {
  activate(context) {
    // 命令通过 registerCommand 注册，自动管理
    context.commands.registerCommand("my-plugin.start", function () {
      intervalId = setInterval(() => {
        console.log("tick");
      }, 1000);
      return { started: true };
    });
  },
  deactivate() {
    // 手动清理非 subscriptions 管理的资源
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
```

### 6. 日志规范

使用 `console` API，统一前缀格式：

```javascript
console.log("[Plugin Name] message");
console.warn("[Plugin Name] warning");
console.error("[Plugin Name] error:", error);
```

### 7. 避免的做法

| 做法                     | 原因                                        |
|--------------------------|---------------------------------------------|
| 使用全局变量污染         | 影响其他插件                                |
| 修改 `process.env`       | 影响主进程                                  |
| `require` 主进程模块     | 安全隔离，未来可能变化                       |
| 同步阻塞操作             | 阻塞主进程事件循环                          |
| 使用 `eval` / `Function` | 安全风险                                    |
| 依赖文件系统绝对路径     | 跨平台兼容问题，使用 `context.extensionPath` |

---

## 内置插件开发

内置插件的代码以字符串形式维护在 `src/main/services/plugin/builtinPlugins.ts` 中，避免生产环境的模块加载问题。

### 添加内置插件的步骤

#### 1. 定义市场元数据

```typescript
// builtinPlugins.ts
export const BUILTIN_MARKET_PLUGINS: BuiltinMarketPlugin[] = [
  // ... 已有插件
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
  description: "Description here",
  author: "Super Client Team",
  main: "index.js",
  icon: "🔧",
  categories: ["tools"],
  engines: { "super-client-r": "^1.0.0" },
  activationEvents: ["onStartup"],
  contributes: {
    commands: [
      {
        command: "my-builtin-plugin.action",
        title: "Do Action",
        category: "My Plugin",
      },
    ],
  },
};
```

#### 3. 编写源代码字符串

```typescript
export const MY_PLUGIN_SOURCE = `"use strict";

module.exports = {
  activate(context) {
    context.commands.registerCommand("my-builtin-plugin.action", function() {
      return { result: "done" };
    });
  },
  deactivate() {}
};
`;
```

#### 4. 注册到映射表

```typescript
export const BUILTIN_PLUGIN_SOURCES: Record<string, { manifest: Record<string, unknown>; source: string }> = {
  "prompt-templates": { manifest: PROMPT_TEMPLATES_MANIFEST, source: PROMPT_TEMPLATES_SOURCE },
  "my-builtin-plugin": { manifest: MY_PLUGIN_MANIFEST, source: MY_PLUGIN_SOURCE },  // 新增
};
```

安装时，`pluginHandlers.ts` 的 `DOWNLOAD_PLUGIN` 处理器会检查 `BUILTIN_PLUGIN_SOURCES`，写入真实的清单和源代码。

---

## 调试与测试

### 开发环境调试

1. 创建插件目录，包含 `package.json` 和 `index.js`
2. 在应用中安装本地插件
3. 打开开发者工具（`Alt+Cmd+I`），查看主进程控制台输出
4. 修改代码后，禁用再启用插件即可重新加载

### 常见问题排查

| 问题               | 排查方法                                                         |
|--------------------|------------------------------------------------------------------|
| 安装后无反应       | 检查 `package.json` 是否有 `name`、`version`、`main`               |
| 启用后状态变 error | 查看主进程控制台，检查 `activate()` 是否抛异常                    |
| 命令未出现         | 确认命令在 `contributes.commands` 中声明且在 `activate()` 中注册 |
| 命令执行无结果     | 确认 `registerCommand` 回调返回了可序列化的值                    |
| 重启后消失         | 确认 `initializePluginManager()` 在 `main.ts` 中被调用           |

---

## 发布到插件市场

当前插件市场为内置数据，第三方插件通过本地安装。后续将支持：

1. 远程插件仓库
2. 版本更新检查
3. 插件签名验证

---

## 完整示例

### Prompt Templates 插件

这是一个真实可用的内置插件，提供 8 个 AI 提示词模板。

#### package.json

```json
{
  "name": "prompt-templates",
  "displayName": "Prompt Templates",
  "version": "1.0.0",
  "description": "Curated AI prompt templates for common tasks",
  "author": "Super Client Team",
  "main": "index.js",
  "icon": "📝",
  "categories": ["productivity", "prompts"],
  "engines": { "super-client-r": "^1.0.0" },
  "activationEvents": ["onStartup"],
  "contributes": {
    "commands": [
      { "command": "prompt-templates.list", "title": "List Templates", "category": "Prompt Templates" },
      { "command": "prompt-templates.translate", "title": "Translate", "category": "Prompt Templates" },
      { "command": "prompt-templates.summarize", "title": "Summarize", "category": "Prompt Templates" },
      { "command": "prompt-templates.codeReview", "title": "Code Review", "category": "Prompt Templates" },
      { "command": "prompt-templates.explain", "title": "Explain", "category": "Prompt Templates" },
      { "command": "prompt-templates.fixGrammar", "title": "Fix Grammar", "category": "Prompt Templates" },
      { "command": "prompt-templates.writeEmail", "title": "Write Email", "category": "Prompt Templates" },
      { "command": "prompt-templates.brainstorm", "title": "Brainstorm", "category": "Prompt Templates" },
      { "command": "prompt-templates.refactorCode", "title": "Refactor Code", "category": "Prompt Templates" }
    ]
  }
}
```

#### index.js

```javascript
"use strict";

const TEMPLATES = [
  {
    id: "translate",
    command: "prompt-templates.translate",
    name: "Translate",
    description: "Translate text to a specified language",
    template: "Please translate the following text to {{language}}:\n\n{{text}}"
  },
  {
    id: "summarize",
    command: "prompt-templates.summarize",
    name: "Summarize",
    description: "Summarize content concisely",
    template: "Please summarize the following content in a concise manner, highlighting the key points:\n\n{{text}}"
  },
  {
    id: "codeReview",
    command: "prompt-templates.codeReview",
    name: "Code Review",
    description: "Review code for issues and improvements",
    template: "Please review the following code. Point out any bugs, security issues, performance problems, and suggest improvements:\n\n```\n{{code}}\n```"
  },
  {
    id: "explain",
    command: "prompt-templates.explain",
    name: "Explain",
    description: "Explain a concept or code in simple terms",
    template: "Please explain the following in simple, easy-to-understand terms:\n\n{{text}}"
  },
  {
    id: "fixGrammar",
    command: "prompt-templates.fixGrammar",
    name: "Fix Grammar",
    description: "Fix grammar and spelling errors",
    template: "Please fix any grammar, spelling, and punctuation errors in the following text. Only return the corrected text without explanations:\n\n{{text}}"
  },
  {
    id: "writeEmail",
    command: "prompt-templates.writeEmail",
    name: "Write Email",
    description: "Draft a professional email",
    template: "Please write a professional email with the following details:\n\nRecipient: {{recipient}}\nSubject: {{subject}}\nKey points: {{points}}"
  },
  {
    id: "brainstorm",
    command: "prompt-templates.brainstorm",
    name: "Brainstorm",
    description: "Brainstorm ideas on a topic",
    template: "Please brainstorm 10 creative ideas about the following topic. For each idea, provide a brief description:\n\nTopic: {{topic}}"
  },
  {
    id: "refactorCode",
    command: "prompt-templates.refactorCode",
    name: "Refactor Code",
    description: "Refactor code for better quality",
    template: "Please refactor the following code to improve readability, maintainability, and performance. Explain the changes you made:\n\n```\n{{code}}\n```"
  }
];

module.exports = {
  activate(context) {
    console.log("[Prompt Templates] Activating...");

    // Register list command — returns all templates
    context.commands.registerCommand("prompt-templates.list", function () {
      return TEMPLATES.map(function (t) {
        return { id: t.id, name: t.name, description: t.description, template: t.template };
      });
    });

    // Register individual template commands
    TEMPLATES.forEach(function (tmpl) {
      context.commands.registerCommand(tmpl.command, function () {
        return { id: tmpl.id, name: tmpl.name, description: tmpl.description, template: tmpl.template };
      });
    });

    console.log("[Prompt Templates] Activated with " + TEMPLATES.length + " templates");
  },

  deactivate() {
    console.log("[Prompt Templates] Deactivated");
  }
};
```

### 用户交互流程

1. 插件市场 → 安装 Prompt Templates
2. 已安装 tab → 启用开关打开 → 状态变为"运行中"
3. 卡片中出现命令按钮（Translate、Summarize 等）
4. 点击命令 → 弹出模板预览 Modal
5. 点击"复制"→ 模板复制到剪贴板
6. 点击"在聊天中使用"→ 跳转聊天页，模板自动填入输入框

---

## IPC 通道参考

插件系统使用的 IPC 通道：

| 通道                    | 方向            | 说明                       |
|-------------------------|-----------------|----------------------------|
| `plugin:getAll`         | Renderer → Main | 获取所有已安装插件         |
| `plugin:get`            | Renderer → Main | 获取单个插件信息           |
| `plugin:install`        | Renderer → Main | 打开目录选择器安装本地插件 |
| `plugin:uninstall`      | Renderer → Main | 卸载插件                   |
| `plugin:enable`         | Renderer → Main | 启用插件（触发激活）         |
| `plugin:disable`        | Renderer → Main | 禁用插件（触发停用）         |
| `plugin:searchMarket`   | Renderer → Main | 搜索插件市场               |
| `plugin:download`       | Renderer → Main | 从市场下载安装插件         |
| `plugin:getCommands`    | Renderer → Main | 获取已注册命令列表         |
| `plugin:executeCommand` | Renderer → Main | 执行命令                   |
| `plugin:getStorage`     | Renderer → Main | 读取插件存储               |
| `plugin:setStorage`     | Renderer → Main | 写入插件存储               |
| `plugin:deleteStorage`  | Renderer → Main | 删除插件存储               |

所有 IPC 响应格式统一为：

```typescript
{ success: boolean; data?: T; error?: string }
```
