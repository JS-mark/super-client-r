# Skills 设计方案：项目开发辅助技能集

> 本文档描述为 Super Client R 项目设计的一组开发辅助 Skills，采用 Claude Code 插件规范（`.claude-plugin/` + `SKILL.md` + `commands/`），用于在项目开发过程中提供标准化的工作流支持。

---

## 总览

| # | Skill ID          | 名称         | 斜杠命令           | 说明                                  |
|---|-------------------|--------------|--------------------|---------------------------------------|
| 1 | `dev-standards`   | 开发规范助手 | `/check-standards` | 基于 CLAUDE.md 的 10 类规则合规检查   |
| 2 | `commit-helper`   | 规范提交助手 | `/smart-commit`    | Conventional Commits 英文 commit 生成 |
| 3 | `feature-planner` | 功能开发规划 | `/plan-feature`    | 上下文分析、方案设计、TODO 拆解         |
| 4 | `log-analyzer`    | 日志排查分析 | `/analyze-log`     | 多进程日志关联、根因定位               |
| 5 | `changelog-gen`   | 变更日志生成 | `/changelog`       | Keep a Changelog 格式的 Release Notes |
| 6 | `pr-reviewer`     | PR 审查助手  | `/review`          | 项目专属 10 维度 PR 审查              |

---

## 文件结构（每个 Skill）

```
skills/{skill-id}/
├── .claude-plugin/
│   └── plugin.json           # 插件元数据
├── commands/
│   └── {command}.md           # 斜杠命令定义（frontmatter + 步骤）
├── skills/
│   └── {skill-id}/
│       └── SKILL.md           # 核心技能定义（frontmatter + 完整规则/流程）
└── README.md                  # 安装和使用说明
```

### 文件职责

| 文件            | 职责                                                     |
|-----------------|----------------------------------------------------------|
| `plugin.json`   | 插件名称、描述、版本、作者                                  |
| `SKILL.md`      | 触发关键词、allowed-tools、角色定义、完整规则/流程/输出格式 |
| `commands/*.md` | 斜杠命令的 allowed-tools 和分步执行流程                  |
| `README.md`     | 安装方式、使用方法、功能概览                               |

---

## Skill 详情

### 1. dev-standards — 开发规范检查助手

**命令**: `/check-standards`
**触发词**: "检查代码规范", "check standards", "规范检查"

**10 类检查规则**:

- R1: IPC 6 步模板完整性
- R2: TypeScript 规范（禁 any、interface vs type）
- R3: React 组件规范（useCallback、useTranslation、Zustand 选择器）
- R4: 命名约定（PascalCase/camelCase/kebab-case）
- R5: 反模式检测（Node API 入侵 Renderer、同步 IPC、内存泄漏）
- R6: 样式规范（Tailwind、cn()）
- R7: 错误处理（try-catch、IPC 返回格式）
- R8: 状态管理（Zustand 规范）
- R9: 导入顺序
- R10: 安全规范

**输出**: 结构化合规报告（❌ 违规 / ⚠️ 建议 / ✅ 符合 + 得分）

---

### 2. commit-helper — 规范提交助手

**命令**: `/smart-commit`
**触发词**: "帮我提交", "commit", "规范提交"

**执行流程**:

1. 读取 `git status` + `git diff` 收集变更
2. 分析变更确定 type（10 种）和 scope（14 种）
3. 生成英文 commit message
4. 用户确认后自动执行 `git commit`

**特色**: 检测混合变更建议拆分、自动标注 Breaking Change、参考项目历史风格

---

### 3. feature-planner — 功能开发规划

**命令**: `/plan-feature`
**触发词**: "规划功能", "plan feature", "怎么实现", "拆解任务"

**执行流程**:

1. 收集需求 → 2. 搜索现有代码 → 3. 架构分析 → 4. 技术方案 → 5. TODO 拆解 → 6. 保存方案

**输出**: 需求分析 + 架构影响 + 文件影响 + 技术方案 + 分阶段 TODO（P0/P1/P2）+ 风险提示

---

### 4. log-analyzer — 日志排查分析

**命令**: `/analyze-log`
**触发词**: "分析日志", "为什么报错", "debug error", "排查问题"

**内置错误模式库**: IPC 错误、MCP 错误、React/Renderer 错误、Electron 错误、Zustand 错误、网络错误

**输出**: 摘要 + 错误详情（根因+修复） + 事件时间线 + 修复建议（立即/防御/诊断）

---

### 5. changelog-gen — 变更日志生成

**命令**: `/changelog`
**触发词**: "生成 changelog", "release notes", "准备发版"

**三种输出格式**:

1. 标准 Changelog（Keep a Changelog，追加到 CHANGELOG.md）
2. Release Notes（用户可读，用于 GitHub Release）
3. 简要摘要（内部沟通用）

**特色**: 自动读 git tag/log、智能版本号推荐、scope 转用户可读名称

---

### 6. pr-reviewer — PR 审查助手

**命令**: `/review`
**触发词**: "审查 PR", "review changes", "代码审查"

**10 维度审查清单**: C1 架构 / C2 类型 / C3 React / C4 i18n / C5 样式 / C6 安全 / C7 错误 / C8 命名 / C9 性能 / C10 质量

**三级严重度**: ❌ 必须修复 / ⚠️ 建议修复 / 💡 可以改进

**与 code-reviewer 区别**: PR 级别 + 项目特定规范 + 架构合规

---

## 安装

所有 skill 已放置在 `skills/` 目录下，Claude Code 启动时会自动扫描加载。无需额外配置。

## 使用

在 Claude Code 中：

- 使用斜杠命令：`/check-standards`, `/smart-commit`, `/plan-feature`, `/analyze-log`, `/changelog`, `/review`
- 或使用自然语言触发（每个 SKILL.md 的 description 中定义了触发关键词）
