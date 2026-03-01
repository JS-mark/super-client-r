---
description: 从 git 历史生成结构化的 CHANGELOG 或 Release Notes
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

<changelog>

## 执行步骤

### 步骤一：确定版本范围

执行以下命令获取当前状态：

```bash
git tag --sort=-creatordate | head -5
```

```bash
git log --oneline -20 --no-merges
```

使用 AskUserQuestion 确认：

- **版本号**: 新版本号（如不确定，根据变更类型推荐：feat→minor, fix→patch, breaking→major）
- **起始点**: 从哪个 tag 或 commit 开始（默认上一个 tag）
- **输出格式**: 标准 Changelog(Recommended) / Release Notes / 简要摘要
- **输出语言**: 中文(Recommended) / 英文 / 双语

### 步骤二：获取 Commits

根据确认的范围执行：

```bash
git log <start>..HEAD --oneline --no-merges
```

如果没有 tag，获取所有 commits 或用户指定数量。

### 步骤三：解析与分类

逐条解析 commit message：

1. 提取 type, scope, subject
2. 映射到 changelog 分类：
   - `feat` → Added
   - `fix` → Fixed
   - `perf` / `refactor` → Changed
   - `BREAKING CHANGE` → ⚠️ Breaking Changes（置顶）
3. 过滤非用户可见变更（`chore`, `ci`, `style`, `test`, `docs` 默认不包含）
4. 将 scope 转换为用户可读名称

### 步骤四：生成输出

按用户选择的格式生成内容。

**标准 Changelog 格式**:
```markdown
## [version] - date

### Added
- 条目 (#scope)

### Fixed
- 条目 (#scope)
```

**Release Notes 格式**:
```markdown
# Super Client R vX.Y.Z

> 一句话总结

## ✨ 新功能
- **功能名**: 用户可读描述

## 🐛 修复
- 描述
```

### 步骤五：确认与保存

使用 AskUserQuestion 展示生成内容，选项：
- 保存到 CHANGELOG.md(Recommended)
- 仅复制到剪贴板
- 修改后保存

如果选择保存，检查 CHANGELOG.md 是否存在：
- 存在：使用 Edit 在文件顶部（标题之后）插入新版本内容
- 不存在：使用 Write 创建新文件

</changelog>
