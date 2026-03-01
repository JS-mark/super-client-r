# feature-planner — 功能开发规划助手

新功能开发的上下文分析、方案设计与 TODO 任务拆解，基于项目 Electron + React + IPC 架构自动生成实现计划。

## 安装

将 `skills/feature-planner` 目录放置在项目的 `skills/` 下，Claude Code 会自动加载。

## 使用方式

### 斜杠命令

```
/plan-feature
```

### 自然语言触发

- "规划一个新功能"
- "怎么实现 XXX"
- "plan feature"
- "拆解任务"

## 功能

- 自动搜索项目代码发现可复用实现
- 分析架构影响（涉及哪些进程、是否需要 IPC）
- 识别需要新增/修改的文件
- 基于 IPC 6 步模板生成完整任务清单
- 分阶段 TODO（基础设施 → 集成层 → UI 层 → 收尾）
- 带优先级（P0/P1/P2）和依赖关系
- 风险提示和反模式预警
- 可选保存方案到 `docs/plans/`
