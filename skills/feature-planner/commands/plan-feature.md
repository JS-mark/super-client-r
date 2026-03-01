---
description: 分析新功能需求，设计实现方案，拆解 TODO 任务
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
---

<plan-feature>

## 执行步骤

### 步骤一：收集需求

使用 AskUserQuestion 向用户确认：

- 功能的具体描述和用户场景
- 是否有参考实现或设计稿
- 优先级和时间约束

### 步骤二：加载项目上下文

1. 读取 `CLAUDE.md` 获取项目架构和模板规范
2. 使用 Glob 和 Grep 搜索与功能相关的现有代码：
   - 搜索相似功能的实现模式
   - 搜索可能需要修改的文件
   - 搜索可复用的组件、服务、类型
3. 读取关键文件了解当前实现

### 步骤三：架构分析

确定以下架构要素：

- **涉及进程**: Main / Renderer / 两者
- **IPC 通信**: 是否需要新增 IPC channel（如是，必须遵循 6 步模板）
- **状态管理**: 是否需要新建/扩展 Zustand store
- **持久化**: 是否需要 Electron store 存储
- **i18n**: 是否需要新增翻译 key（en + zh）
- **流式数据**: 是否涉及流式传输（EventEmitter + webContents.send）

### 步骤四：设计技术方案

输出：
- 数据流向图
- 关键接口/类型定义
- 需要的架构决策及推荐方案
- 可复用的现有组件/服务

### 步骤五：拆解 TODO

生成分阶段的任务清单：

```
Phase 1: 基础设施
  - [ ] P0 任务描述（具体可执行）

Phase 2: 集成层
  - [ ] P1 任务描述

Phase 3: UI 层
  - [ ] P1 任务描述

Phase 4: 收尾
  - [ ] P2 任务描述
```

每个 TODO 必须：
- 具体可执行（不能是「实现功能」这样笼统的描述）
- 标注优先级（P0/P1/P2）
- 标注涉及的文件路径

### 步骤六：保存方案

使用 AskUserQuestion 确认是否将方案保存到文件：
- 保存到 `docs/plans/<feature-name>.md`
- 或仅在对话中展示

</plan-feature>
