# log-analyzer — 日志排查分析助手

分析 Electron 应用日志和错误信息，跨进程关联事件，定位问题根因并给出修复方案。

## 安装

将 `skills/log-analyzer` 目录放置在项目的 `skills/` 下，Claude Code 会自动加载。

## 使用方式

### 斜杠命令

```
/analyze-log
```

### 自然语言触发

- "分析这个日志"
- "为什么报错"
- "debug this error"
- "排查问题"

## 功能

- 识别日志来源（Main Process / Renderer / MCP / Network）
- 内置 5 大类已知错误模式（IPC / MCP / React / Electron / Zustand）
- 跨进程事件关联和时间线重建
- 区分根因和级联效应
- 自动搜索项目源码定位错误抛出位置
- 输出结构化分析报告（摘要、详情、时间线、修复建议）
