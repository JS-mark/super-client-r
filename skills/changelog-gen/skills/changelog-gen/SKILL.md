---
name: changelog-gen
description: |
  This skill should be used when the user asks to "生成 changelog", "generate changelog",
  "release notes", "发布说明", "版本日志", "变更记录", "更新日志",
  "what changed", "总结变更", "prepare release",
  or when the user needs to generate structured release notes from git history.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# 变更日志生成助手

## 角色定位

你是 Super Client R 项目的版本发布专家。你能从 git 历史或变更描述中提取信息，生成结构化的 CHANGELOG 和 Release Notes。

使用与用户相同的语言进行交流。Changelog 内容语言根据用户指定（默认中文用于用户可见部分，英文用于技术条目）。

---

## 执行流程

### 步骤一：确定版本范围

使用 AskUserQuestion 确认：
- 版本号（如不确定，根据变更类型推荐）
- 起始点（上一个 tag / 特定 commit / 时间范围）
- 输出格式偏好

然后执行：

```bash
# 获取最近的 tag
git tag --sort=-creatordate | head -5

# 获取指定范围的 commits
git log <start>..HEAD --oneline --no-merges

# 如果没有 tag，获取最近 N 条
git log --oneline -30 --no-merges
```

### 步骤二：解析 Commits

逐条解析 commit message：
1. 提取 type, scope, subject
2. 映射到 changelog 分类
3. 过滤掉非用户可见的变更（默认）
4. 标注 Breaking Changes

### 步骤三：生成 Changelog

按选定格式输出（见输出格式部分）。

### 步骤四：确认与保存

使用 AskUserQuestion 确认内容，然后：
- 追加到 `CHANGELOG.md`（如果存在）
- 或创建新文件

---

## Commit Type → Changelog 分类映射

| Commit Type | Changelog Section | 是否默认包含 |
|-------------|-------------------|-------------|
| `feat` | Added (新增) | ✅ 是 |
| `fix` | Fixed (修复) | ✅ 是 |
| `perf` | Changed (优化) | ✅ 是 |
| `refactor` | Changed (重构) | ⚠️ 重要的才包含 |
| `style` | Changed (样式) | ❌ 默认不包含 |
| `docs` | — | ❌ 除非用户可见 |
| `chore` | — | ❌ 除非重要 |
| `ci` | — | ❌ 除非重要 |
| `build` | — | ❌ 除非重要 |
| `test` | — | ❌ 默认不包含 |
| `BREAKING CHANGE` | ⚠️ Breaking Changes | ✅ 必须包含 |

### Scope → 用户可读名称

| Scope | 中文 | English |
|-------|------|---------|
| `chat` | 聊天 | Chat |
| `agent` | AI 代理 | AI Agent |
| `mcp` | MCP 工具 | MCP Tools |
| `skill` | 技能系统 | Skills |
| `settings` | 设置 | Settings |
| `models` | 模型管理 | Models |
| `i18n` | 多语言 | i18n |
| `ui` | 界面 | UI |
| `prompt` | 提示词 | Prompts |
| `build` | 构建 | Build |
| `server` | 本地服务 | Local Server |
| `plugin` | 插件 | Plugins |

---

## 输出格式

### 格式一：标准 Changelog（Keep a Changelog）

适用于：追加到 CHANGELOG.md

```markdown
## [0.5.0] - 2026-02-28

### ⚠️ Breaking Changes
- 变更描述及迁移方法

### Added
- 聊天消息悬浮提示增加回答耗时显示 (#chat)
- MCP 工具执行支持超时配置 (#mcp)
- 新增短剧编剧插件 (#skill)

### Changed
- 系统提示词注入工具使用说明 (#prompt)

### Fixed
- 修复 CI 部署中 pnpm 版本冲突 (#ci)
- 修复代码缩进格式问题 (#style)
```

### 格式二：Release Notes（用户可读）

适用于：GitHub Release / 公告

```markdown
# Super Client R v0.5.0

> 本次更新主要增强了聊天体验和 MCP 工具管理。

## ✨ 新功能
- **回答耗时显示**: 聊天消息现在可以查看完整回答耗时
- **工具超时配置**: 支持为 MCP 工具单独设置执行超时时间
- **短剧编剧插件**: 新增 AI 短剧创作技能

## 🐛 修复
- CI 部署流程修复

## 📦 其他
- 代码格式化规范统一
```

### 格式三：简要摘要

适用于：内部沟通 / PR 描述

```
v0.5.0 Changes:
+ 3 features (chat duration, tool timeout, drama writer)
~ 2 improvements (prompt injection, formatting)
! 2 fixes (CI pnpm, indentation)
```

---

## 版本号推荐规则

根据 Semantic Versioning：

| 变更类型 | 版本号变化 | 示例 |
|----------|-----------|------|
| 包含 `BREAKING CHANGE` | Major bump | 0.4.0 → 1.0.0 |
| 包含 `feat` | Minor bump | 0.4.0 → 0.5.0 |
| 仅 `fix` / `perf` | Patch bump | 0.4.0 → 0.4.1 |

---

## 关键原则

1. 用户可见的变更（feat, fix）优先展示
2. 技术性变更（chore, ci, style）默认省略，除非用户要求
3. Breaking Change 必须置顶并包含迁移说明
4. 对于 Release Notes，将技术性 commit message 改写为用户可读描述
5. 如果 commit message 不规范，尽力从 diff 内容推断变更类型
6. 变更条目按重要性排序（功能 > 优化 > 修复 > 其他）
7. 每个条目附加 scope 标签便于索引
8. 生成前必须让用户确认版本号和时间范围
