# dev-standards — 开发规范检查助手

基于项目 CLAUDE.md 和 CODING_STANDARDS.md 检查代码合规性，覆盖 IPC 模板、TypeScript 规范、React 模式、命名约定、安全规则等 10 大类规则。

## 安装

将 `skills/dev-standards` 目录放置在项目的 `skills/` 下，Claude Code 会自动加载。

## 使用方式

### 斜杠命令

```
/check-standards
```

### 自然语言触发

- "检查代码规范"
- "这段代码符合规范吗"
- "check my code against standards"

## 检查规则

| ID | 类别 | 说明 |
|----|------|------|
| R1 | IPC 通信 | 6 步模板完整性 |
| R2 | TypeScript | 类型安全、禁止 any |
| R3 | React | 组件规范、hooks 使用 |
| R4 | 命名 | PascalCase/camelCase/kebab-case |
| R5 | 反模式 | Node API 入侵、同步 IPC、内存泄漏 |
| R6 | 样式 | Tailwind、cn()、CSS 变量 |
| R7 | 错误处理 | try-catch、IPC 返回格式 |
| R8 | 状态管理 | Zustand 规范 |
| R9 | 导入顺序 | 分组排序 |
| R10 | 安全 | Preload 最小化、输入校验 |
