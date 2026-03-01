# Skill 校验机制整改方案：从 manifest.json 迁移到 Claude Code 规范

> **目标**：将 Skill 校验的核心依据从 `manifest.json` 切换为 Claude Code 标准规范（`SKILL.md` + `plugin.json` + `commands/*.md`），使校验逻辑与项目实际的双运行时 Skill 体系对齐。

---

## 1. 现状分析

### 1.1 当前 Skill 体系（双运行时）

项目中每个 Skill 同时服务两个运行时：

| 运行时 | 入口文件 | 元数据来源 | 加载方式 |
|--------|----------|-----------|---------|
| Electron App | `manifest.json` | id/name/description/version/author/tools/systemPrompt | SkillService 扫描目录 |
| Claude Code | `SKILL.md` + `plugin.json` + `commands/*.md` | name/description/allowed-tools/version/author | Claude Code 自动发现 |

### 1.2 当前 SkillValidator 的问题

刚实现的 `SkillValidator.ts` 仅以 `manifest.json` 为校验核心：

- **L1 结构校验**：检查 manifest.json 的存在性和字段
- **L2 内容校验**：检查 manifest.json 中的 tools 声明
- **L3 兼容性校验**：仅作为 warning 检查 `.claude-plugin/plugin.json` 存在性
- **L4 安全校验**：无需改动（与元数据格式无关）

**核心矛盾**：项目中 12 个 skill 有 9 个以 Claude Code 三件套为核心规范，`manifest.json` 仅是为 Electron App 运行时的补充配置。校验的主体应该反过来。

### 1.3 项目中 3 类 Skill 的文件分布

| 类型 | 数量 | manifest.json | SKILL.md | plugin.json | commands/*.md | 代表 |
|------|------|:---:|:---:|:---:|:---:|------|
| 双运行时 | 9 | ✅ | ✅ | ✅ | ✅ | commit-helper, dev-standards |
| App-only Prompt | 2 | ✅ | ❌ | ❌ | ❌ | translator, code-reviewer |
| App-only Tool | 1 | ✅ | 📄(文档) | ❌ | ❌ | iconfont-downloader |

---

## 2. 整改目标

1. **以 Claude Code 规范为校验主线**：SKILL.md 前置解析，从中提取 `name`/`description`/`allowed-tools`
2. **plugin.json 为元数据补充**：从中提取 `version`/`author`/`description`
3. **manifest.json 降级为可选**：仅在声明 `tools` 的 Tool-based skill 中校验，不再作为必填项
4. **SkillService 加载逻辑适配**：支持无 manifest.json 的 skill 通过 SKILL.md + plugin.json 自动注册
5. **保持安全校验不变**：L4 安全校验与文件格式无关，无需改动

---

## 3. 新的校验层级设计

### L1: 结构校验（error 阻断）

**校验文件发现**：skill 目录中至少存在以下之一，否则拒绝：
- `skills/<id>/SKILL.md`（Claude Code 模式）
- `manifest.json`（App-only 模式）

**Claude Code 三件套校验**（当存在 `skills/*/SKILL.md` 时）：

| 检查项 | 编码 | 严重度 | 说明 |
|--------|------|--------|------|
| SKILL.md 存在性 | `SKILLMD_MISSING` | error | `skills/<id>/SKILL.md` 不存在 |
| SKILL.md frontmatter 存在性 | `SKILLMD_NO_FRONTMATTER` | error | 文件不以 `---` 开头，无 YAML frontmatter |
| SKILL.md frontmatter 合法性 | `SKILLMD_INVALID_FRONTMATTER` | error | YAML 解析失败 |
| name 字段 | `SKILLMD_MISSING_NAME` | error | frontmatter 缺少 `name` |
| name 格式 | `SKILLMD_NAME_NOT_KEBAB` | error | `name` 不是 kebab-case 或超 50 字符 |
| description 字段 | `SKILLMD_MISSING_DESCRIPTION` | error | frontmatter 缺少 `description` |
| allowed-tools 字段 | `SKILLMD_MISSING_TOOLS` | error | frontmatter 缺少 `allowed-tools` |
| allowed-tools 合法性 | `SKILLMD_INVALID_TOOL` | warning | 包含不在白名单中的工具名 |
| plugin.json 存在性 | `PLUGIN_JSON_MISSING` | error | `.claude-plugin/plugin.json` 不存在 |
| plugin.json 合法性 | `PLUGIN_JSON_INVALID` | error | JSON 解析失败或非对象 |
| plugin.json 必填字段 | `PLUGIN_JSON_FIELD_MISSING` | error | 缺少 name/description/version/author.name |
| version 格式 | `PLUGIN_VERSION_NOT_SEMVER` | error | version 不符合 semver |
| id 冲突 | `ID_CONFLICT` | error | 同 id skill 已安装 |

**App-only 模式校验**（仅存在 `manifest.json` 时）：

保留现有的 manifest.json 校验逻辑（作为降级路径），但 id 格式检查统一为 kebab-case。

### L2: 内容校验（error 阻断）

| 检查项 | 编码 | 严重度 | 说明 |
|--------|------|--------|------|
| commands/*.md frontmatter | `COMMAND_NO_FRONTMATTER` | error | 命令文件缺少 frontmatter |
| commands/*.md description | `COMMAND_MISSING_DESCRIPTION` | error | 命令 frontmatter 缺少 `description` |
| commands/*.md allowed-tools | `COMMAND_MISSING_TOOLS` | error | 命令 frontmatter 缺少 `allowed-tools` |
| commands/*.md 命令体 XML 标签 | `COMMAND_NO_XML_WRAPPER` | warning | 命令体未用 `<name>...</name>` 包裹 |
| SKILL.md body 非空 | `SKILLMD_EMPTY_BODY` | warning | frontmatter 后无正文内容 |
| manifest.json tools 声明（如存在） | 沿用已有编码 | error | tools 数组元素缺 name/description/inputSchema |
| tools 实现文件（如声明 tools） | `TOOLS_NO_IMPLEMENTATION` | error | 声明了 tools 但无实现文件 |

### L3: 一致性校验（warning）

| 检查项 | 编码 | 严重度 | 说明 |
|--------|------|--------|------|
| name 一致性 | `NAME_MISMATCH` | warning | SKILL.md name ≠ plugin.json name 或 ≠ 目录名 |
| description 一致性 | `DESC_MISMATCH` | warning | plugin.json description 与 SKILL.md description 差异过大 |
| 缺少 manifest.json | `MANIFEST_MISSING` | warning | 无 manifest.json，App 运行时不可用 |
| 缺少 prompts/main.txt | `NO_SYSTEM_PROMPT` | warning | 无 systemPrompt 且无 prompts/main.txt，App 聊天集成无提示词 |
| 缺少 commands/ | `NO_COMMANDS` | warning | 无 commands/ 目录，无斜杠命令可用 |
| 缺少 README.md | `NO_README` | warning | 无 README.md |

### L4: 安全校验（不变）

沿用现有实现：符号链接、文件大小、目录深度、危险文件、可执行文件。

---

## 4. SKILL.md Frontmatter 解析方案

### 4.1 解析逻辑

```
1. 读取 SKILL.md 文件全文
2. 检查是否以 "---" 开头
3. 找到第二个 "---" 的位置，提取中间的 YAML 文本
4. 使用简易 YAML 解析器解析为对象
5. 提取 name、description、allowed-tools 字段
```

### 4.2 不引入外部 YAML 库

项目中 SKILL.md 的 frontmatter 结构简单（仅 3 个字段，description 使用 `|` 多行），不需要完整的 YAML 解析器。自行实现一个轻量解析函数：

- 支持：简单 key: value、`|` 多行文本、字符串值（带/不带引号）
- 不支持：嵌套对象、数组、锚点等复杂 YAML 特性
- 足以覆盖所有现有 SKILL.md 的 frontmatter 格式

### 4.3 解析结果类型

```typescript
interface SkillMdFrontmatter {
  name: string;
  description: string;
  "allowed-tools": string;
}
```

### 4.4 allowed-tools 白名单

```typescript
const ALLOWED_TOOLS = new Set([
  "Read", "Write", "Edit", "Bash",
  "Glob", "Grep", "WebSearch", "WebFetch",
  "AskUserQuestion",
]);
```

---

## 5. Skill 元数据合并策略

一个 skill 的完整元数据可能分散在多个文件中。按以下优先级合并：

| 字段 | 主源 | 备源 | 说明 |
|------|------|------|------|
| `id` | SKILL.md `name` | plugin.json `name` → manifest.json `id` | 唯一标识 |
| `name`（显示名） | manifest.json `name` | plugin.json `description` | 应用内显示名 |
| `description` | SKILL.md `description` | plugin.json `description` → manifest.json `description` | 触发描述 |
| `version` | plugin.json `version` | manifest.json `version` | 版本号 |
| `author` | plugin.json `author.name` | manifest.json `author` | 作者 |
| `allowed-tools` | SKILL.md `allowed-tools` | — | Claude Code 专属 |
| `tools` | manifest.json `tools` | — | App 运行时专属 |
| `systemPrompt` | manifest.json `systemPrompt` → `prompts/main.txt` | — | App 运行时专属 |
| `icon` | manifest.json `icon` | — | 应用内显示图标 |
| `category` | manifest.json `category` | — | 应用内分类 |

---

## 6. SkillService 加载逻辑适配

### 6.1 现有加载流程

```
扫描目录 → 读取 manifest.json → isValidManifest() → 注册
```

### 6.2 新增加载路径

```
扫描目录 → 尝试发现 SKILL.md → 解析 frontmatter → 合并 plugin.json → 合并 manifest.json（可选）→ 注册
```

### 6.3 具体改动

在 `SkillService.scanSkillsDir()` 中：

1. 遍历子目录时，先尝试查找 `skills/<dir-name>/SKILL.md`
2. 如果存在 SKILL.md：
   - 解析 frontmatter 得到 `name`/`description`/`allowed-tools`
   - 读取 `.claude-plugin/plugin.json` 得到 `version`/`author`
   - 如果 `manifest.json` 也存在，合并其 `icon`/`category`/`tools`/`systemPrompt`
   - 如果 `manifest.json` 不存在，用 SKILL.md + plugin.json 组合生成 SkillManifest
3. 如果不存在 SKILL.md：
   - 回退到现有逻辑（纯 manifest.json 模式）

### 6.4 SkillManifest 构建

```typescript
// 从 SKILL.md + plugin.json 构建
const manifest: SkillManifest = {
  id: skillMdFrontmatter.name,                    // SKILL.md name
  name: manifestJson?.name ?? pluginJson.description, // 显示名
  description: pluginJson.description,              // 简短描述
  version: pluginJson.version,
  author: pluginJson.author.name,
  category: manifestJson?.category,
  icon: manifestJson?.icon,
  tools: manifestJson?.tools,
  systemPrompt: manifestJson?.systemPrompt,         // 后续还会尝试 prompts/main.txt
};
```

---

## 7. 文件变更清单

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/services/skill/SkillValidator.ts` | **重写**：新增 SKILL.md 解析、plugin.json 校验、commands/*.md 校验、一致性校验；manifest.json 降级为可选路径 |
| `src/main/services/skill/SkillService.ts` | `scanSkillsDir()` 新增 SKILL.md 发现和加载路径；抽取 `discoverSkillMetadata()` 方法 |
| `src/main/ipc/types.ts` | `ValidationCategory` 新增 `"consistency"` 值；`SkillValidationResult` 新增 `skillType` 字段 |
| `src/renderer/src/i18n/locales/en/skills.json` | 新增约 20 个校验码的英文翻译 |
| `src/renderer/src/i18n/locales/zh/skills.json` | 新增约 20 个校验码的中文翻译 |
| `src/renderer/src/components/skill/SkillValidationReportModal.tsx` | `CATEGORY_ORDER` 新增 `"consistency"` |

### 新增文件

无。所有改动在现有文件中完成。

### 不需要改动的文件

| 文件 | 原因 |
|------|------|
| `channels.ts` | `VALIDATE_SKILL` 通道已存在 |
| `skillHandlers.ts` | handler 调用签名不变 |
| `preload/index.ts` | IPC 接口不变 |
| `electron.d.ts` | 类型接口不变 |
| `SkillDetailModal.tsx` | 调用方式不变 |
| `SkillValidationReportModal.tsx` | 仅需新增 category 显示（改动极小） |

---

## 8. 校验流程图

```
validateSkill(sourcePath, installedIds)
  │
  ├─ 1. 目录发现
  │     ├─ 查找 skills/*/SKILL.md → 有 → Claude Code 模式
  │     ├─ 查找 manifest.json    → 有 → App-only 模式
  │     └─ 都没有               → error: NO_SKILL_ENTRY
  │
  ├─ 2. L1 结构校验
  │     ├─ [Claude Code 模式]
  │     │   ├─ 解析 SKILL.md frontmatter (name, description, allowed-tools)
  │     │   ├─ 解析 .claude-plugin/plugin.json (name, desc, version, author)
  │     │   ├─ id 格式 + 长度 + 冲突检查
  │     │   └─ version semver 检查
  │     │
  │     └─ [App-only 模式]
  │         └─ 现有 manifest.json 校验逻辑
  │
  ├─ 3. L4 安全校验（始终执行）
  │     └─ 符号链接 / 文件大小 / 目录深度 / 危险文件 / 可执行文件
  │
  ├─ 4. L2 内容校验（需要结构校验通过）
  │     ├─ commands/*.md frontmatter 校验
  │     ├─ manifest.json tools 校验（如存在）
  │     └─ tools 实现文件校验（如声明 tools）
  │
  └─ 5. L3 一致性校验（warning）
        ├─ name 跨文件一致性
        ├─ 缺少 manifest.json 提醒
        ├─ 缺少 prompts/main.txt 提醒
        ├─ 缺少 commands/ 提醒
        └─ 缺少 README.md 提醒
```

---

## 9. 向后兼容策略

| 场景 | 处理 |
|------|------|
| 仅有 manifest.json 的 skill（translator、code-reviewer） | 正常校验和加载，走 App-only 路径 |
| 仅有 SKILL.md + plugin.json 的 skill | 校验通过，加载时自动合成 SkillManifest |
| 两者都有的 skill（commit-helper 等） | 以 SKILL.md 为主，manifest.json 为补充 |
| 安装外部 skill 时 | 校验报告清晰提示属于哪种模式、缺什么文件 |

---

## 10. 实施顺序

1. **types.ts** — 扩展 `ValidationCategory`，新增 `SkillValidationResult.skillType`
2. **SkillValidator.ts** — 重写校验逻辑（SKILL.md 解析 + 新校验层级）
3. **SkillService.ts** — `scanSkillsDir()` 适配 SKILL.md 加载路径
4. **i18n** — 新增校验码翻译
5. **SkillValidationReportModal.tsx** — 新增 consistency 分类显示
6. `pnpm check` + `pnpm lint` 验证

---

## 11. 验证方式

| 测试场景 | 预期结果 |
|----------|----------|
| 完整双运行时 skill（如 commit-helper） | 校验通过，0 error，可能有 warning |
| App-only skill（如 translator） | 校验通过，warning: 缺少 SKILL.md/plugin.json/commands |
| 仅有 SKILL.md + plugin.json 的 skill | 校验通过，warning: 缺少 manifest.json |
| SKILL.md 无 frontmatter | L1 error: SKILLMD_NO_FRONTMATTER |
| SKILL.md name 非 kebab-case | L1 error: SKILLMD_NAME_NOT_KEBAB |
| plugin.json 缺 version | L1 error: PLUGIN_JSON_FIELD_MISSING |
| commands/xxx.md 无 frontmatter | L2 error: COMMAND_NO_FRONTMATTER |
| SKILL.md name ≠ plugin.json name | L3 warning: NAME_MISMATCH |
| 含 .env 的 skill | L4 error: DANGEROUS_FILE |
| `pnpm dev` 启动后 Skills 页面正常加载 | 所有已有 skill 正常显示 |
