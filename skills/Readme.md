# Skills 系统

> `skills/` 目录包含 Super Client R 项目的技能集。每个 Skill 同时服务于两个运行时：
>
> 1. **应用内运行时**（Electron App）—— 通过 `manifest.json` 被 SkillService 加载，在聊天中提供 System Prompt 引导或可执行工具
> 2. **开发时运行时**（Claude Code）—— 通过 `.claude-plugin/` + `commands/` + `SKILL.md` 被 Claude Code 加载，提供斜杠命令和脚本执行能力
>
> 新建 Skill 时应同时实现两套规范，使其在两个运行时中都可用。

---

## 目录结构总览

```
skills/
├── Readme.md
│
├── translator/                     # 纯 Prompt skill（仅应用内）
│   ├── manifest.json
│   └── prompts/main.txt
│
├── commit-helper/                  # 双运行时 skill（完整示例）
│   ├── manifest.json               # ← 应用内：SkillService 加载入口
│   ├── .claude-plugin/
│   │   └── plugin.json             # ← Claude Code：插件元数据
│   ├── commands/
│   │   └── smart-commit.md         # ← Claude Code：/smart-commit 斜杠命令
│   └── skills/
│       └── commit-helper/
│           └── SKILL.md            # ← Claude Code：技能定义与触发规则
│
├── drama-writer/                   # 带参考资料的 skill
│   ├── manifest.json
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   │   └── drama.md
│   └── skills/
│       └── drama-writer/
│           ├── SKILL.md
│           └── references/         # ← 参考文档（模板、指南等）
│               ├── genre-templates.md
│               ├── script-format.md
│               └── ...
│
└── iconfont-downloader/            # Tool-based skill（应用内可执行工具）
    ├── manifest.json
    ├── scripts/
    │   └── index.ts
    └── SKILL.md
```

---

## 第一部分：Claude Code 技能规范

Claude Code 技能使 Skill 能够在开发环境中作为 AI 编程助手的扩展，支持斜杠命令触发和脚本执行。

### 三件套结构

每个 Claude Code 兼容的 Skill 由三部分组成：

```
my-skill/
├── .claude-plugin/
│   └── plugin.json          # 1. 插件元数据
├── commands/
│   └── my-command.md        # 2. 斜杠命令定义
└── skills/
    └── my-skill/
        ├── SKILL.md         # 3. 技能定义（自动触发规则 + 完整指令）
        └── references/      #    可选：参考文档
            └── *.md
```

### 1. `.claude-plugin/plugin.json`

插件元数据，Claude Code 用于发现和注册插件。

```json
{
  "name": "commit-helper",
  "description": "规范提交助手，基于 Conventional Commits 规范生成英文 commit message",
  "version": "1.0.0",
  "author": {
    "name": "super-client"
  }
}
```

| 字段          | 类型     | 必填 | 说明             |
|---------------|----------|------|------------------|
| `name`        | `string` | 是   | 插件名称（kebab-case） |
| `description` | `string` | 是   | 功能描述         |
| `version`     | `string` | 是   | 语义化版本号     |
| `author.name` | `string` | 是   | 作者名称         |

### 2. `commands/<command-name>.md`

定义斜杠命令（如 `/smart-commit`），用户在 Claude Code 中输入该命令时触发执行。

**格式**：

```markdown
---
description: 命令的简短描述
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

<command-name>

## 执行步骤

### 步骤一：...
（具体操作指令，可包含 bash 代码块）

### 步骤二：...

</command-name>
```

**Frontmatter 字段**：

| 字段            | 类型     | 必填 | 说明                                       |
|-----------------|----------|------|--------------------------------------------|
| `description`   | `string` | 是   | 命令描述，显示在 Claude Code 命令列表中    |
| `allowed-tools` | `string` | 是   | 逗号分隔的工具白名单                       |

**可用工具列表**：

| 工具              | 说明                     |
|-------------------|--------------------------|
| `Read`            | 读取文件内容             |
| `Write`           | 写入/创建文件            |
| `Edit`            | 编辑已有文件             |
| `Bash`            | 执行 shell 命令/脚本     |
| `Glob`            | 按模式搜索文件           |
| `Grep`            | 按内容搜索文件           |
| `WebSearch`       | 搜索互联网               |
| `WebFetch`        | 抓取网页内容             |
| `AskUserQuestion` | 向用户提问并等待回答     |

**命令体规则**：

- 用 `<command-name>` ... `</command-name>` XML 标签包裹命令体
- 内容为 Markdown 格式的分步指令
- 可包含 `bash` 代码块，Claude Code 会实际执行
- 使用 `AskUserQuestion` 在关键节点让用户确认或选择

**示例**（`commands/smart-commit.md`）：

```markdown
---
description: 分析变更并生成规范 commit message，确认后自动提交
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

<smart-commit>

## 执行步骤

### 步骤一：收集变更信息

并行执行以下 Bash 命令：

\```bash
git status
\```

\```bash
git diff --staged
\```

### 步骤二：分析变更内容

1. 阅读 staged diff，理解变更的本质
2. 确定 type 和 scope
3. 如果变更涉及多个不相关的改动，建议拆分提交

### 步骤三：生成并确认

使用 AskUserQuestion 展示生成的 commit message，让用户确认后执行 git commit。

</smart-commit>
```

### 3. `skills/<skill-id>/SKILL.md`

技能定义文件，包含自动触发规则和完整的行为指令。与命令文件不同，SKILL.md 会在 Claude Code 检测到匹配的用户意图时**自动激活**。

**格式**：

```markdown
---
name: my-skill
description: |
  This skill should be used when the user asks to "做某事",
  "do something", "关键短语", or related requests.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# 技能标题

## 角色定位

你是...（角色描述和行为准则）

---

## 执行流程

### 步骤一：...

### 步骤二：...

---

## 输出格式

（定义结构化输出模板）

---

## 关键原则

1. ...
2. ...
```

**Frontmatter 字段**：

| 字段            | 类型     | 必填 | 说明                                                     |
|-----------------|----------|------|----------------------------------------------------------|
| `name`          | `string` | 是   | 技能标识                                                 |
| `description`   | `string` | 是   | 触发描述——列出会激活此技能的用户表达（中英文关键短语）   |
| `allowed-tools` | `string` | 是   | 逗号分隔的工具白名单                                     |

**description 写法要点**：

- 列出尽可能多的触发短语（中英文混合）
- 使用 `|` 多行格式保持可读性
- 短语应覆盖用户可能的各种表达方式

### 4. `references/` 参考文档（可选）

存放技能执行过程中需要参考的模板、指南等文档。SKILL.md 或 command 中通过相对路径引用。

```
references/
├── outline-template.md      # 大纲模板
├── character-template.md    # 角色模板
├── genre-templates.md       # 题材模板集
└── script-format.md         # 格式规范
```

在 SKILL.md 中引用：

```markdown
### 步骤三：生成大纲
- 参照 `references/outline-template.md` 模板
- 参照 `references/genre-templates.md` 中对应类型的结构
```

---

## 第二部分：应用内技能规范（Electron App）

应用内技能由 SkillService 在 Main Process 中加载，通过 IPC 暴露给 Renderer，在聊天中使用。

### Skill 类型

#### Type 1: Prompt-based Skill（提示词型）

仅通过 System Prompt 改变 AI 行为模式，不执行代码。

**文件结构**：

```
my-skill/
├── manifest.json           # 必须
└── prompts/
    └── main.txt            # 系统提示词（manifest 中未内联时自动读取）
```

**示例**：`translator`、`code-reviewer`

#### Type 2: Tool-based Skill（工具型）

提供可执行的工具函数，AI 在对话中调用完成实际操作。

**文件结构**：

```
my-skill/
├── manifest.json           # 必须，包含 tools 定义
├── index.ts                # 工具实现（或 scripts/index.ts）
├── index.js                # 编译后的实现
├── prompts/
│   └── main.txt            # 可选的系统提示词
└── SKILL.md                # 可选的文档
```

**示例**：`iconfont-downloader`

### manifest.json 规范

每个 Skill **必须**在根目录包含 `manifest.json`，这是 SkillService 识别和加载 Skill 的唯一入口。

```jsonc
{
  // === 必填字段 ===
  "id": "my-skill",              // 唯一标识符，kebab-case
  "name": "我的技能",             // 显示名称
  "description": "一句话描述",     // 功能简介
  "version": "1.0.0",            // 语义化版本号
  "author": "super-client",      // 作者

  // === 可选字段 ===
  "category": "development",     // 分类：development | language | design | ...
  "icon": "🔧",                  // 展示图标（emoji）
  "permissions": [],             // 预留：权限声明

  // === Prompt（二选一） ===
  "systemPrompt": "...",         // 内联系统提示词

  // === Tool-based skill 专用 ===
  "tools": [                     // 工具列表
    {
      "name": "toolFunctionName",      // 工具名称，对应导出的函数名
      "description": "工具描述",        // 展示给 AI 的工具说明
      "inputSchema": {                  // JSON Schema，定义输入参数
        "type": "object",
        "properties": {
          "keyword": {
            "type": "string",
            "description": "搜索关键词"
          }
        },
        "required": ["keyword"]
      }
    }
  ]
}
```

**必填字段验证规则**（缺少任一将被跳过）：

| 字段          | 类型     | 说明         |
|---------------|----------|--------------|
| `id`          | `string` | 全局唯一标识 |
| `name`        | `string` | 显示名称     |
| `description` | `string` | 功能描述     |
| `version`     | `string` | 版本号       |
| `author`      | `string` | 作者         |

### System Prompt 加载优先级

1. **manifest.json 中的 `systemPrompt` 字段** —— 内联写法，优先级最高
2. **`prompts/main.txt` 文件** —— 外部文件写法，`systemPrompt` 为空时自动读取

### Tool-based Skill 实现规范

SkillService 通过 `import()` 动态加载 `index.js`，按以下顺序匹配导出：

```
1. module.toolName        → 命名导出（推荐）
2. module.default.toolName → default 对象上的属性
3. module.default          → default 函数（兜底）
```

所有工具函数必须返回 `SkillExecutionResult`：

```typescript
interface SkillExecutionResult {
  success: boolean;
  output?: unknown;    // 成功时的返回数据
  error?: string;      // 失败时的错误信息
}
```

实现示例：

```typescript
// index.ts — 命名导出（推荐）
export async function search(input: { keyword: string }): Promise<SkillExecutionResult> {
  const results = await doSearch(input.keyword);
  return { success: true, output: results };
}

export async function download(input: { id: string }): Promise<SkillExecutionResult> {
  await doDownload(input.id);
  return { success: true, output: { message: "下载完成" } };
}
```

### 应用内加载流程

```
应用启动 (main.ts)
  │
  ├─ 初始化 SkillService(userSkillsDir)
  │    │
  │    ├─ 扫描用户数据目录: ~/.super-client-r/skills/
  │    │    └─ 遍历子目录 → 读取 manifest.json → 验证 → 注册
  │    │
  │    └─ 开发模式追加扫描: ./skills/（本目录）
  │         └─ 同上流程，跳过已注册的同 ID skill
  │
  ├─ 注册 IPC Handlers
  │
  └─ Renderer 就绪后
       └─ useSkill() hook → IPC 调用 → 获取 skill 列表 → 更新 UI
```

**加载优先级**：用户安装的 skill 优先于内置 skill。同 ID 的 skill 不会重复加载。

### IPC 通信

| Channel                   | 说明                    |
|---------------------------|-------------------------|
| `skill:list`              | 列出所有已启用的 skill  |
| `skill:get`               | 获取单个 skill 详情     |
| `skill:install`           | 安装 skill（本地路径）  |
| `skill:uninstall`         | 卸载 skill              |
| `skill:enable`            | 启用 skill              |
| `skill:disable`           | 禁用 skill              |
| `skill:execute`           | 执行 skill 工具         |
| `skill:get-system-prompt` | 获取 skill 的系统提示词 |
| `skill:get-all-tools`     | 获取所有可用工具列表    |

### 与聊天的集成

1. 用户在 Skills 页面选择一个 skill
2. `chatStore.pendingSkillId` 记录选中的 skill ID
3. 跳转到 Chat 页面
4. Chat 加载该 skill 的 `systemPrompt` 注入对话上下文
5. AI 在该 system prompt 的引导下响应用户

对于 Tool-based skill，AI 还可以在对话过程中调用声明的工具函数。

### 动态注册（插件集成）

插件（Plugin）可以通过 SkillService 动态注册 skill，无需文件系统：

```typescript
skillService.registerDynamic(
  {
    id: "plugin-skill",
    manifest: { id: "plugin-skill", name: "...", ... },
    path: "",
    enabled: true,
    handlers: {
      myTool: async (input) => { /* 实现 */ },
    },
  },
  "plugin-owner-id"
);

// 插件停用时清理
skillService.unregisterDynamic("plugin-owner-id");
```

---

## 第三部分：创建新 Skill

### 完整 Skill（双运行时）检查清单

同时兼容应用内和 Claude Code 两个运行时：

- [ ] 创建 `skills/<skill-id>/manifest.json`（应用内所需，包含必填字段）
- [ ] 创建 `skills/<skill-id>/.claude-plugin/plugin.json`（Claude Code 插件元数据）
- [ ] 创建 `skills/<skill-id>/commands/<command>.md`（Claude Code 斜杠命令）
- [ ] 创建 `skills/<skill-id>/skills/<skill-id>/SKILL.md`（Claude Code 技能定义 + 触发规则）
- [ ] 如需参考文档，放入 `skills/<skill-id>/skills/<skill-id>/references/`
- [ ] 如需应用内可执行工具，在 manifest.json 中声明 `tools` 并实现 `index.ts`
- [ ] 如需 System Prompt，写入 `prompts/main.txt` 或内联到 manifest.json

### 仅应用内的 Prompt Skill

- [ ] 创建 `skills/<skill-id>/manifest.json`
- [ ] 创建 `skills/<skill-id>/prompts/main.txt`（或在 manifest 中内联 `systemPrompt`）

### 仅 Claude Code 的 Skill

- [ ] 创建 `.claude-plugin/plugin.json`
- [ ] 创建 `commands/<command>.md`
- [ ] 创建 `skills/<skill-id>/SKILL.md`

---

## 现有 Skills

| Skill ID              | 名称            | 应用内类型 | Claude Code 命令    | 说明                              |
|-----------------------|-----------------|------------|---------------------|-----------------------------------|
| `translator`          | 翻译助手        | Prompt     | -                   | 自动检测语言，中英互译           |
| `code-reviewer`       | 代码审查        | Prompt     | -                   | 代码质量审查与改进建议           |
| `iconfont-downloader` | Iconfont 下载器 | Tool       | -                   | 搜索/下载 iconfont.cn 的 SVG 图标 |
| `dev-standards`       | 开发规范助手    | Prompt     | `/check-standards`  | 10 类规则的代码规范检查          |
| `commit-helper`       | 规范提交助手    | Prompt     | `/smart-commit`     | Conventional Commits 提交生成    |
| `feature-planner`     | 功能开发规划    | Prompt     | `/plan-feature`     | 上下文分析、方案设计、TODO 拆解  |
| `log-analyzer`        | 日志排查分析    | Prompt     | `/analyze-log`      | 多进程日志关联与根因分析         |
| `changelog-gen`       | 变更日志生成    | Prompt     | `/changelog`        | Keep a Changelog 格式生成        |
| `pr-reviewer`         | PR 审查助手     | Prompt     | `/review`           | 10 维度 PR 审查 + 架构合规检查   |
| `drama-writer`        | 短剧剧本创作    | -          | `/drama`            | 竖屏/横屏短剧全流程创作          |
| `novel-writer`        | 小说创作助手    | -          | `/write`            | 长篇小说全流程创作               |
