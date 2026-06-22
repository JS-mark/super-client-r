# MCP / Skill Redesign Plan

> 入口：[refactor-plan](./refactor-plan.md)
> 相关计划：[agent-runtime-and-project-cleanup-plan](./agent-runtime-and-project-cleanup-plan.md) ·
> [runtime-enforcement-matrix](./runtime-enforcement-matrix.md) ·
> [project-settings-overlay](./project-settings-overlay.md)

## Summary

MCP 和 Skill 需要重新设计，但不是删除市场，也不是合并进 Extensions 聚合页。新的方向是：MCP 市场、Skill 市场、应用插件中心保持独立入口；MCP / Skill / App Plugin 各自保留独立 domain model，避免把市场条目、已安装配置、运行时 capability、权限 grant 混成同一个对象。

本计划只定义产品结构、数据边界和执行阶段。底层服务重写需按阶段推进，不在一次改动里全量替换。

## Current Problems

- MCP 页面同时混合 market source、市场条目、内置 server、第三方 server、已安装配置、runtime tools 和连接状态。
- Skill 页面同时混合内置 skill、市场 skill、已安装 skill、聊天入口和使用动作。
- MCP / Skill 都没有清晰表达 scope：global、project、session、temporary grant。
- `market item`、`installed config`、`runtime capability`、`permission policy` 的状态混在一起，导致 UI 很难解释“已安装但不可用”“启用但无权限”“项目禁用但全局存在”。
- Extensions 聚合页取消；市场页应保持独立，但共享一致的信息架构和交互组件。

## Target Information Architecture

### Marketplace Entry Points

保留三个一级入口：

- `/mcp`：MCP market / sources / installed / runtime tools。
- `/skills`：built-in / market / installed / activation。
- `/plugins`：应用插件市场、已安装插件、命令、主题/UI 扩展。

不提供用户可见的 `/extensions` 聚合页。Agent-facing capability overview 后续如有需要，应作为调试/详情视图或 runtime 子视图，而不是替代三个市场入口。

### MCP Domain

MCP 拆为四层：

- Discover：市场、source、搜索、评分、安装入口。
- Installed：已安装或已配置 server，包括 builtin、market、third-party。
- Runtime Tools：当前可被 Agent 调用的 tools、连接状态、最后错误、schema、风险分类。
- Scope & Policy：global/project/session 启用状态、approval grant、network/command/file 风险。

建议核心类型：

```ts
type McpSourceKind = "market" | "builtin" | "third-party" | "internal";
type CapabilityScope = "global" | "project" | "session";
type CapabilityStatus =
  | "installed"
  | "enabled"
  | "available"
  | "error"
  | "needs-config"
  | "needs-approval";
```

### Skill Domain

Skill 拆为四层：

- Discover：Skill 市场、搜索、安装入口。
- Built-in：随应用提供、只读、无需安装的 skills。
- Installed：用户安装的 skills、版本、来源、校验状态。
- Activation：global/project/session 启用状态，以及当前聊天是否可用。

Skill 与 MCP 的差异：

- Skill 是 prompt / workflow / instruction package，不一定需要运行时连接。
- MCP 是 tool server，运行时状态和权限风险必须前置展示。
- Skill 校验失败应阻止启用，但不一定阻止市场/详情展示。

## Behavior Rules

- App Plugin 如果贡献 Agent capability，runtime 层显示贡献出的 capability；插件安装、权限和 UI 扩展仍在 App Plugins 页面管理。
- MCP/Skill 安装不等于启用；启用也不等于当前 session 可调用。
- Project session 读取 capability 时按 `session override -> project settings -> global defaults` 合并。
- Runtime approval 不写在 market item 上，只写在 scope/policy/grant 层。

## Phases

### P0: Restore Independent Marketplaces

- 删除用户可见的 `/extensions` 页面和菜单入口。
- 直接路由 `/mcp`、`/skills`、`/plugins` 保留。
- 应用插件不再归入 Agent capability descriptor 展示。

### P1: Domain Model Split

- 文档和类型层拆清：
  - `market item`
  - `installed config`
  - `runtime capability`
  - `scope activation`
  - `permission grant`
- 增加统一 status model：`installed/enabled/available/error/needs-config/needs-approval`。
- 不改变底层服务路径，只增加 adapter，避免一次性迁移风险。

### P2: MCP IA Redesign

- MCP 页面按 Discover / Installed / Runtime Tools / Policy 分区。
- Built-in/internal/third-party/market server 在 Installed 中统一展示，用 source badge 区分。
- Runtime Tools 展示工具 schema、风险分类、最后调用结果、approval 状态。
- 连接错误和配置缺失用结构化 status 展示，不再散落在卡片文案中。

### P3: Skill IA Redesign

- Skill 页面按 Built-in / Discover / Installed / Activation 分区。
- Built-in skill 和 installed skill 共享详情视图，但安装/卸载动作分离。
- Skill validation status 前置展示：valid、warning、invalid、needs-update。
- Project/session enablement 接入 project settings overlay。

### P4: Runtime Integration

- Agent capability resolver 只读取 runtime capability + activation + policy，不直接读市场 store。
- MCP tool execution、Skill injection、plugin capability contribution 统一进入 runtime policy / approval pipeline。
- Runtime capability 视图独立于市场 store，不通过 Extensions 聚合页拼接各 store。

## Validation

- Sidebar / quick menu 中可以分别进入 MCP 市场、Skill 市场、应用插件中心。
- `/extensions` 不作为用户可见页面或菜单入口。
- 旧路由 `/mcp`、`/skills`、`/plugins` 可继续打开。
- MCP server “安装 / 启用 / 可调用 / 需要审批 / 错误”状态可被明确区分。
- Skill “内置 / 市场 / 已安装 / 当前项目启用 / 当前会话可用”状态可被明确区分。
- 应用插件不会被错误归类为 Agent capability，但它贡献的能力可以显示在 Overview。
