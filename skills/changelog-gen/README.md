# changelog-gen — 变更日志生成助手

从 git 历史自动生成结构化的 CHANGELOG 和 Release Notes，支持 Keep a Changelog 格式。

## 安装

将 `skills/changelog-gen` 目录放置在项目的 `skills/` 下，Claude Code 会自动加载。

## 使用方式

### 斜杠命令

```
/changelog
```

### 自然语言触发

- "生成 changelog"
- "release notes"
- "总结变更"
- "准备发版"

## 功能

- 自动读取 git tag 和 commit 历史
- 解析 Conventional Commits 格式
- 按 Keep a Changelog 分类（Added / Changed / Fixed / Removed）
- 三种输出格式：标准 Changelog、Release Notes、简要摘要
- 智能版本号推荐（feat→minor, fix→patch, breaking→major）
- 过滤非用户可见变更（chore, ci, style 等默认不包含）
- 可直接追加到 CHANGELOG.md
