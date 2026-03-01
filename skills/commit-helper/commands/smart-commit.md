---
description: 分析变更并生成规范 commit message，确认后自动提交
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

<smart-commit>

## 执行步骤

### 步骤一：收集变更信息

并行执行以下 Bash 命令：

```bash
git status
```

```bash
git diff --staged
```

```bash
git diff
```

```bash
git log --oneline -10
```

### 步骤二：判断变更状态

- 如果没有任何变更（工作区干净），告知用户没有可提交的内容，结束。
- 如果有未 staged 的变更但没有 staged 的变更，使用 AskUserQuestion 询问用户：
  - 是否需要 stage 全部变更？
  - 还是选择性 stage 特定文件？
- 根据用户选择执行 `git add`。

### 步骤三：分析变更内容

1. 阅读 staged diff，理解变更的本质
2. 确定 type（feat/fix/docs/style/refactor/perf/test/chore/ci/build）
3. 确定 scope（chat/agent/mcp/skill/settings/models/i18n/ui/prompt/build/ci/server/store/plugin）
4. 如果变更涉及多个不相关的改动，建议拆分提交

### 步骤四：生成 Commit Message

生成英文 commit message，格式：

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

规则：
- 标题行不超过 72 字符
- subject 小写动词开头，祈使语气，不加句号
- body 解释 what 和 why
- Breaking Change 必须在 footer 标注

### 步骤五：确认并提交

使用 AskUserQuestion 展示生成的 commit message，选项：
- 确认提交 (Recommended)
- 修改后提交
- 取消

如果用户确认，执行：
```bash
git commit -m "<message>"
```

如果用户选择修改，接收修改后的内容再执行 commit。

最后执行 `git status` 确认提交成功。

</smart-commit>
