# commit-helper — 规范提交助手

分析 git 变更，生成符合 Conventional Commits 规范的英文 commit message，确认后自动提交。

## 安装

将 `skills/commit-helper` 目录放置在项目的 `skills/` 下，Claude Code 会自动加载。

## 使用方式

### 斜杠命令

```
/smart-commit
```

### 自然语言触发

- "帮我提交"
- "commit"
- "生成 commit message"

## 功能

- 自动读取 `git diff` 分析变更内容
- 智能判断 type（feat/fix/docs/style/refactor 等 10 种）
- 智能判断 scope（chat/agent/mcp/skill 等 14 种）
- 检测混合变更，建议拆分提交
- 自动标注 Breaking Change
- 参考项目历史 commit 风格
- 确认后自动执行 `git commit`
