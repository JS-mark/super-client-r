---
description: 审查当前变更，基于项目架构规范进行 PR 级别代码审查
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
---

<review>

## 执行步骤

### 步骤一：确定审查范围

使用 AskUserQuestion 确认：

- **对比基准**: main 分支(Recommended) / 上一个 commit / 指定 commit
- **审查重点**: 全面审查(Recommended) / 仅架构 / 仅安全 / 仅 i18n

### 步骤二：收集变更

根据确认的基准执行：

```bash
git diff --stat <base>...HEAD
```

```bash
git diff --name-status <base>...HEAD
```

```bash
git log --oneline <base>...HEAD
```

```bash
git diff <base>...HEAD
```

### 步骤三：加载规范基线

读取 `CLAUDE.md` 获取项目规范，重点关注：
- IPC 6 步模板
- 反模式列表
- 安全规则

### 步骤四：逐项审查

按变更文件分组，逐条检查：

**C1: 架构合规** — IPC 6 步完整性、进程边界、状态管理模式
**C2: 类型安全** — 无 any、显式返回类型、IPC 返回格式
**C3: React 模式** — useCallback、useEffect 清理、Zustand 选择器
**C4: i18n 完整性** — 新文案是否有 en+zh 翻译
**C5: 样式规范** — Tailwind、cn()、CSS 变量
**C6: 安全性** — 路径校验、敏感数据、输入验证
**C7: 错误处理** — try-catch、非静默吞错
**C8: 命名规范** — PascalCase/camelCase/kebab-case
**C9: 性能** — 重渲染、虚拟化、useMemo
**C10: 代码质量** — 循环依赖、单一职责、导入顺序

对于 IPC 相关变更，使用 Grep 验证 6 步是否全部完成：
```bash
grep -r "new-channel-name" src/main/ipc/ src/preload/ src/renderer/src/services/
```

### 步骤五：输出审查报告

```
👁️ PR 审查报告

━━━ 概览 ━━━
变更: +N -N, M 个文件
模块: 涉及的模块
风险: 低/中/高
结论: ✅ 通过 / ⚠️ 有建议 / ❌ 需要修改

━━━ 各维度检查 ━━━
[逐项 ✅/⚠️/❌]

━━━ 问题清单 ━━━
❌ [必须修复] ...
⚠️ [建议修复] ...
💡 [可以改进] ...

━━━ 做得好的地方 ━━━
- ...

━━━ 统计 ━━━
- 必须修复: N 项
- 建议修复: N 项
- 可以改进: N 项
```

</review>
