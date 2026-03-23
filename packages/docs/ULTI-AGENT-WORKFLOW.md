# Claude Code CLI 多 Agent 协作开发工作流

## 概述

本文档描述如何在 Claude Code CLI 中使用多个 Agent 角色协作开发前端项目。通过为不同职责定义独立的角色提示文件，实现产品经理、架构师、UI 设计师、全栈工程师、测试工程师、代码审查员的分工协作。

## 角色定义

| 角色       | 配置文件                       | 职责                         | 产出目录                                |
|------------|--------------------------------|------------------------------|-----------------------------------------|
| 产品经理   | `.claude/roles/pm.md`          | 需求分析、PRD 编写、验收标准   | `docs/prd/`                             |
| 架构设计师 | `.claude/roles/architect.md`   | 技术方案、模块设计、接口定义   | `docs/architecture/`                    |
| UI 设计师  | `.claude/roles/ui-designer.md` | 界面设计、交互规范、组件规划   | `docs/ui-design/`                       |
| 全栈工程师 | `.claude/roles/fullstack.md`   | 功能实现、代码编写            | `src/`                                  |
| 测试工程师 | `.claude/roles/tester.md`      | 测试计划、用例编写、自动化测试 | `docs/test-plans/`, `src/**/__tests__/` |
| 代码审查员 | `.claude/roles/reviewer.md`    | 代码审查、质量把控、改进建议   | `docs/reviews/`                         |

## 协作目录结构

```txt
docs/
├── prd/                # 产品经理 → 需求文档
│   └── feature-xxx.md
├── architecture/       # 架构师 → 技术设计
│   └── feature-xxx.md
├── ui-design/          # UI 设计师 → 界面设计
│   └── feature-xxx.md
├── test-plans/         # 测试工程师 → 测试计划
│   └── feature-xxx.md
└── reviews/            # 代码审查员 → 审查报告
    └── feature-xxx.md
```

## 使用方式

### 方式一：多终端并行（交互式）

为每个角色开一个终端，用 `--system-prompt` 加载对应角色：

```bash
# 终端 1 — 产品经理
claude --system-prompt .claude/roles/pm.md

# 终端 2 — 架构设计师
claude --system-prompt .claude/roles/architect.md

# 终端 3 — UI 设计师
claude --system-prompt .claude/roles/ui-designer.md

# 终端 4 — 全栈工程师（建议使用 worktree 隔离）
claude --system-prompt .claude/roles/fullstack.md

# 终端 5 — 测试工程师
claude --system-prompt .claude/roles/tester.md

# 终端 6 — 代码审查员
claude --system-prompt .claude/roles/reviewer.md
```

### 方式二：流水线自动化（非交互式）

使用 `scripts/dev-pipeline.sh` 脚本按阶段自动执行：

```bash
# 执行完整流水线
./scripts/dev-pipeline.sh <功能名称>

# 示例
./scripts/dev-pipeline.sh user-login
```

### 方式三：单会话角色切换（轻量）

在单个 Claude Code 会话中按需切换角色：

```
> 现在请以产品经理的身份，分析登录功能的需求，输出 PRD 到 docs/prd/login.md
> 现在切换到架构师角色，阅读 PRD 设计技术方案
> 现在作为全栈工程师，按照方案实现代码
> 现在作为测试工程师，编写测试用例
> 现在作为代码审查员，review 所有变更
```

## 标准开发流程

```txt
┌──────────────────────────────────────────────────────┐
│                    开发流水线                          │
│                                                       │
│  ┌──────┐    ┌──────┐    ┌──────┐                    │
│  │  PM  │───▶│架构师 │───▶│UI设计│                    │
│  └──────┘    └──────┘    └──────┘                    │
│      │           │           │                        │
│      ▼           ▼           ▼                        │
│  docs/prd/   docs/arch/  docs/ui/                    │
│      │           │           │                        │
│      └───────────┼───────────┘                        │
│                  ▼                                     │
│            ┌──────────┐                               │
│            │ 全栈工程师 │ ◀── git worktree 隔离开发    │
│            └──────────┘                               │
│                  │                                     │
│          ┌───────┼───────┐                            │
│          ▼               ▼                            │
│    ┌──────────┐   ┌──────────┐                       │
│    │ 测试工程师 │   │ 代码审查 │                       │
│    └──────────┘   └──────────┘                       │
│          │               │                            │
│          └───────┬───────┘                            │
│                  ▼                                     │
│           合并到主分支                                  │
└──────────────────────────────────────────────────────┘
```

### 阶段说明

#### 阶段 1：需求分析（PM）

产品经理阅读需求描述，输出标准化 PRD 文档：

- 功能概述与目标
- 用户故事（User Stories）
- 验收标准（Acceptance Criteria）
- 优先级与迭代规划

#### 阶段 2：技术设计（架构师）

架构师基于 PRD 输出技术方案：

- 模块划分与职责
- 接口定义（API / 组件 Props）
- 数据流设计
- 技术选型与风险评估

#### 阶段 3：界面设计（UI 设计师）

UI 设计师基于 PRD 输出界面规范：

- 页面布局与交互流程
- 组件拆分与复用规划
- 响应式适配方案
- 设计 Token 与样式规范

#### 阶段 4：功能实现（全栈工程师）

全栈工程师在 worktree 中实现功能：

- 按技术方案编写代码
- 遵循项目编码规范
- 完成基本的自测

#### 阶段 5：测试验证（测试工程师）

测试工程师编写和执行测试：

- 单元测试
- 集成测试
- 基于验收标准的功能验证

#### 阶段 6：代码审查（审查员）

审查员对变更进行全面审查：

- 代码质量与规范
- 安全性检查
- 性能评估
- 改进建议

## 角色间通信规范

各角色通过文件系统交换信息，遵循以下约定：

1. **文件命名**：统一使用 `feature-<功能名>.md`
2. **文档格式**：所有产出使用 Markdown
3. **引用规范**：后续角色在文档开头标注依赖的上游文档
4. **状态标记**：文档头部标注状态（`draft` / `review` / `approved` / `done`）

文档头部模板：

```markdown
---
feature: user-login
role: pm | architect | ui-designer | tester | reviewer
status: draft | review | approved | done
depends_on:
  - docs/prd/feature-xxx.md
date: 2026-03-23
---
```

## 注意事项

- **全栈工程师** 建议使用 `worktree` 进行隔离开发，避免与其他角色产生文件冲突
- **测试工程师** 应在工程师完成后再启动，确保代码已就绪
- **代码审查** 是最后一个环节，在测试通过后执行
- 所有角色的产出应提交到版本控制，形成可追溯的开发记录
- 使用 `-p` 非交互模式时，建议加 `--max-turns` 限制最大轮次，避免过度消耗 Token
