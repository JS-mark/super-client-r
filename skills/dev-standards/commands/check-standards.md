---
description: 检查代码是否符合项目开发规范
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
---

<check-standards>

## 执行步骤

### 步骤一：加载规范基线

使用 Read 工具读取项目规范文件：

1. 读取 `CLAUDE.md` — 获取 IPC 模板、反模式、安全规则
2. 读取 `docs/CODING_STANDARDS.md` — 获取详细编码规范

### 步骤二：确定检查范围

使用 AskUserQuestion 询问用户：

- **检查范围**: 具体文件路径 / 最近的 git 变更 / 整个模块
- **检查重点**: 全面检查(Recommended) / 仅架构 / 仅样式 / 仅安全

如果用户选择最近的 git 变更，执行：
```bash
git diff --name-only
```

### 步骤三：读取并检查代码

1. 使用 Read 读取目标文件
2. 使用 Grep 搜索相关的配套文件（如 IPC 相关的 channels.ts, types.ts 等）
3. 逐条对照规则检查：
   - R1: IPC 6 步完整性
   - R2: TypeScript 规范
   - R3: React 组件规范
   - R4: 命名约定
   - R5: 反模式检测
   - R6: 样式规范
   - R7: 错误处理
   - R8: 状态管理
   - R9: 导入顺序
   - R10: 安全规范

### 步骤四：输出报告

按以下格式输出结构化报告：

```
📏 规范检查报告

━━━ 检查范围 ━━━
文件: <file list>
规则: R1-R10

❌ 违规 (必须修复)
  1. [RULE-ID] 描述
     位置: file:line
     修复: 具体修正方案

⚠️ 建议 (推荐改进)
  1. [RULE-ID] 描述
     位置: file:line
     建议: 改进方案

✅ 符合项
  - 通过的规则列表

📊 结果: X/Y 条规则通过
```

</check-standards>
