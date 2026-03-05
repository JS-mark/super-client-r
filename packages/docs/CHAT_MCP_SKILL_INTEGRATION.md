# Chat 系统中 MCP 与 Skill 的集成架构

本文档分析 super-client-r 项目中 Chat 功能如何通过 Anthropic SDK 调用 MCP 工具和 Skill 工具。

---

## 目录

- [整体数据流](#整体数据流)
- [1. Anthropic SDK 初始化与调用](#1-anthropic-sdk-初始化与调用)
- [2. MCP 工具集成](#2-mcp-工具集成)
  - [2.1 MCP 服务架构](#21-mcp-服务架构)
  - [2.2 工具发现](#22-工具发现)
  - [2.3 工具格式转换](#23-工具格式转换)
  - [2.4 工具执行路由](#24-工具执行路由)
- [3. Skill 系统集成](#3-skill-系统集成)
  - [3.1 Skill 加载流程](#31-skill-加载流程)
  - [3.2 Skill Prompt 注入](#32-skill-prompt-注入)
  - [3.3 Skill 工具执行](#33-skill-工具执行)
  - [3.4 Skill 工具与 MCP 工具的关系](#34-skill-工具与-mcp-工具的关系)
- [4. 系统提示词构建](#4-系统提示词构建)
- [5. Agentic Tool Loop](#5-agentic-tool-loop)
- [6. 关键文件索引](#6-关键文件索引)

---

## 整体数据流

```
┌─────────────────────────────────────────────────────────────────┐
│ Renderer Process (React)                                        │
│                                                                 │
│  useChat.ts                                                     │
│   ├── fetchMcpTools()                                           │
│   │    └── mcpClient.getAllTools()  ──IPC──►  McpService         │
│   │         返回: tools[] + toolMapping{}                       │
│   │                                                             │
│   ├── buildSystemPrompt() + toolHint                            │
│   │    (+ Skill systemPrompt if in skill mode)                  │
│   │                                                             │
│   └── modelService.chatCompletion({                             │
│            messages, tools, toolMapping, ...                     │
│        })  ──IPC──►                                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Main Process (Node.js)                                          │
│                                                                 │
│  modelHandlers.ts                                               │
│   ├── 构建 toolExecutor(name, args):                            │
│   │    mapping = toolMapping[name]                               │
│   │    → mcpService.callTool(mapping.serverId, mapping.toolName) │
│   │                                                             │
│   └── llmService.chatCompletion(request, toolExecutor)          │
│                                                                 │
│  LLMService.ts                                                  │
│   ├── new Anthropic({ apiKey, baseURL })                        │
│   ├── 转换 tools 为 Anthropic 格式                               │
│   └── client.messages.stream({ tools, messages })               │
│        │                                                        │
│        └── Agentic Loop:                                        │
│             收到 tool_use → toolExecutor(name, args)             │
│             → 结果写回 messages → 继续 stream                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Anthropic SDK 初始化与调用

**文件**: `src/main/services/llm/LLMService.ts:779-870`

LLMService 支持 OpenAI 兼容 API 和原生 Anthropic SDK 两种调用方式。Anthropic 路径核心逻辑：

```typescript
// 1. 初始化客户端（每次调用创建新实例）
const client = new Anthropic({
  apiKey: request.apiKey || "",
  baseURL: request.baseUrl,
});

// 2. 工具格式从 OpenAI format → Anthropic format
const anthropicTools: Anthropic.Tool[] = request.tools!.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
}));

// 3. Streaming 调用
const stream = client.messages.stream({
  model: request.model,
  max_tokens: request.maxTokens ?? 4096,
  messages: anthropicMessages,
  tools: anthropicTools,
  stream: true,
});
```

**注意**：系统消息中的 `system` role 消息被提取为 Anthropic 的 `system` 参数，不放在 `messages` 数组中。

---

## 2. MCP 工具集成

### 2.1 MCP 服务架构

**文件**: `src/main/services/mcp/McpService.ts`

MCP 服务管理 **4 种类型** 的服务器，使用不同的传输方式：

| 类型 | 传输方式 | 说明 | 示例 |
|------|----------|------|------|
| `internal` | 进程内直调 | 内置工具，无网络开销 | bash, grep, file-system, browser |
| `builtin` | stdio (子进程) | 预定义的 MCP 服务器 | filesystem, github, playwright |
| `market` | stdio (子进程) | 从 npm 市场安装的 MCP 服务器 | 用户安装的第三方包 |
| `third-party` | HTTP/SSE | 外部 HTTP MCP 服务器 | 远程 MCP 服务 |

**Internal 服务器列表** (`src/main/services/mcp/internal/InternalMcpService.ts:174-204`)：

```
@scp/fetch, @scp/file-system, @scp/python, @scp/javascript,
@scp/browser, @scp/image-gen, @scp/nodejs, @scp/bash, @scp/grep,
@scp/plan, @scp/task
```

### 2.2 工具发现

**聚合所有可用工具** (`McpService.ts:491-514`)：

```typescript
getAllAvailableTools(): Array<{ serverId: string; tool: McpTool }> {
  const tools = [];

  // 1. stdio 服务器（排除 internal 避免重复）
  for (const [id, status] of this.serverStatus.entries()) {
    if (status.status === "connected" && status.tools) {
      const config = this.servers.get(id);
      if (config?.type === "internal") continue;
      for (const tool of status.tools) {
        tools.push({ serverId: id, tool });
      }
    }
  }

  // 2. 第三方 HTTP/SSE 服务器
  tools.push(...thirdPartyMcpService.getAllAvailableTools());

  // 3. Internal 进程内服务器
  tools.push(...internalMcpService.getAllTools());

  return tools;
}
```

各类型服务器的工具发现机制：

| 类型 | 发现方式 | 调用 |
|------|----------|------|
| stdio | MCP SDK `client.listTools()` | 连接时自动获取 |
| third-party | HTTP GET `{url}/tools` | 连接时自动获取 |
| internal | 注册时静态声明 | `server.tools` 数组 |

### 2.3 工具格式转换

工具在传递过程中经历 3 次格式转换：

```
MCP 原始格式              OpenAI 兼容格式              Anthropic 格式
──────────────           ───────────────             ──────────────
{ name,            →     { type: "function",    →    { name,
  description,            function: {                  description,
  inputSchema }             name: prefixedName,        input_schema }
                            description,
                            parameters
                          } }
```

**关键：工具名加前缀**（`useChat.ts:84-94`）

```typescript
// MCP serverId 被清洗后作为前缀添加到工具名
const safePrefix = sanitizeServerId(serverId);  // "@scp/fetch" → "scp-fetch"
const prefixedName = `${safePrefix}__${tool.name}`;
// 例: "scp-fetch__fetch" 或 "scp-bash__execute_command"

// 同时建立反向映射表
toolMapping[prefixedName] = { serverId, toolName: tool.name };
```

`toolMapping` 的作用是在工具执行时将加了前缀的名称映射回原始 serverId + toolName。

### 2.4 工具执行路由

**入口**: `src/main/ipc/handlers/modelHandlers.ts:234-267`

当 Claude API 返回 `tool_use` block 时，toolExecutor 回调被触发：

```typescript
const toolExecutor = async (name: string, args: Record<string, unknown>) => {
  // 1. 从 mapping 反查原始 serverId 和 toolName
  const mapping = request.toolMapping![name];
  if (!mapping) throw new Error(`Unknown tool: ${name}`);

  // 2. 解析相对路径（基于 workspace 目录）
  const resolvedArgs = resolveToolPaths(mapping.serverId, args, workspaceDir);

  // 3. 通过 McpService 统一调用接口执行
  const result = await mcpService.callTool(
    mapping.serverId,
    mapping.toolName,
    resolvedArgs,
  );

  if (!result.success) throw new Error(result.error || "Tool call failed");
  return result.data;
};
```

**McpService.callTool 路由逻辑** (`McpService.ts:356-466`)：

```typescript
switch (config.type) {
  case "builtin":
  case "market":
    // stdio: 通过 MCP SDK client.callTool()
    result = await this.callStdioTool(serverId, toolName, args);
    break;
  case "third-party":
    // HTTP: POST {url}/tools/call
    result = await thirdPartyMcpService.callTool(serverId, toolName, args);
    break;
  case "internal":
    // 进程内: 直接调用 handler 函数
    result = await internalMcpService.callTool(serverId, toolName, args);
    break;
}
```

---

## 3. Skill 系统集成

### 3.1 Skill 加载流程

**文件**: `src/main/services/skill/SkillService.ts`

```
SkillService.initialize()
├── scanSkillsDir(~/.super-client-r/skills/)   ← 用户目录优先
└── scanSkillsDir(./skills/)                    ← 开发模式下内置目录
    │
    └── 对每个子目录:
        ├── findSkillMdPath()
        │   ├── 查找 skills/<id>/SKILL.md (Claude Code 布局)
        │   └── 查找 SKILL.md (根目录)
        │
        ├── buildManifestFromSkillMd()
        │   ├── 解析 YAML frontmatter → id, description, allowed-tools
        │   ├── 提取 body → systemPrompt
        │   └── 读取 .claude-plugin/plugin.json → 合并 tools, version, icon 等
        │
        ├── 追加 prompts/main.txt 到 systemPrompt (如存在)
        │
        └── discoverCommands(commands/*.md) → slash commands
```

**元数据合并策略**：

| 字段 | 来源优先级 |
|------|-----------|
| id | SKILL.md frontmatter `name` |
| name (显示名) | plugin.json `displayName` > `description` > SKILL.md `name` |
| description | plugin.json `description` > SKILL.md `description` |
| version / author / icon / category | plugin.json |
| tools | plugin.json `tools` 数组 |
| systemPrompt | SKILL.md body + prompts/main.txt |

### 3.2 Skill Prompt 注入

**文件**: `src/renderer/src/hooks/useChat.ts:782-908`

当 Chat 处于 Skill 模式时，`sendSkillMessage` 函数执行以下流程：

```typescript
// 1. 获取 skill/command 的提示词
let skillSystemPrompt = null;
if (commandName) {
  skillSystemPrompt = await skillClient.getCommandPrompt(skillId, commandName);
}
if (!skillSystemPrompt) {
  skillSystemPrompt = await skillClient.getSystemPrompt(skillId);
}

// 2. 拼接到基础系统提示词之后
const basePrompt = buildSystemPrompt(baseSkillPrompt, envInfo);
const systemPrompt = skillSystemPrompt
  ? `${basePrompt}\n\n--- Skill Context ---\n${skillSystemPrompt}`
  : basePrompt;

// 3. 注入为 messages[0]
history.unshift({ role: "system", content: systemPrompt });

// 4. 仍然加载 MCP 工具
const mcpResult = await fetchMcpTools();
if (mcpResult.toolHint) {
  history[0].content += mcpResult.toolHint;
}
```

**最终系统提示词结构**：

```
[全局默认提示词]
[环境上下文 (OS, runtime, cwd, ...)]
[会话/模型自定义提示词]

--- Skill Context ---
[SKILL.md body 全文]
[prompts/main.txt 内容 (如有)]

[MCP 工具提示 (可用工具列表)]
[内置工具使用指南]
[浏览器/知识库等专项指南 (按需)]
```

### 3.3 Skill 工具执行

**文件**: `src/main/services/skill/SkillService.ts:499-615`

Skill 工具通过独立的 IPC 通道 `skill:execute` 执行：

```typescript
async executeSkill(skillId, toolName, input): Promise<SkillExecutionResult> {
  // 1. 检查动态注册的 handlers（插件方式注册的 skill）
  const dynamicHandlerMap = this.dynamicHandlers.get(skillId);
  if (dynamicHandlerMap?.[toolName]) {
    return await dynamicHandlerMap[toolName](input);
  }

  // 2. 文件方式: 动态 import 实现文件
  //    查找顺序: index.js → index.ts → scripts/index.js → scripts/index.ts
  const modulePath = `file://${resolvedImplPath}`;
  const skillModule = await import(modulePath);

  // 3. 查找导出函数
  //    优先级: module[toolName] → module.default[toolName] → module.default
  const handler = skillModule[toolName] || skillModule.default?.[toolName];

  // 4. 执行
  return { success: true, output: await handler(input) };
}
```

### 3.4 Skill 工具与 MCP 工具的关系

**当前架构中，Skill 工具和 MCP 工具是两个独立的系统**：

| 维度 | MCP 工具 | Skill 工具 |
|------|---------|-----------|
| **注册来源** | McpService (internal + stdio + third-party) | SkillService (plugin.json tools) |
| **获取 API** | `mcp:get-all-tools` IPC | `skill:get-all-tools` IPC |
| **执行 API** | `mcpService.callTool()` | `skillService.executeSkill()` |
| **传给 Claude API** | ✅ 作为 `tools` 参数传入 | ❌ **不**直接传入 `tools` 参数 |
| **Claude 如何调用** | tool_use block → toolExecutor 回调 | 通过 system prompt 中的指令引导 |

**关键发现**：

在当前 `useChat.ts` 的 `sendSkillMessage` 中，`fetchMcpTools()` **只获取 MCP 工具**，Skill 的 `plugin.json` 中定义的工具 **并未被合并** 到 API 的 `tools` 数组中。

这意味着：
1. **Skill 的 systemPrompt 告诉 Claude 有哪些工具可用**（通过 SKILL.md body 中的工具规范描述）
2. **但这些工具不在 API `tools` 参数中**，Claude 无法通过标准的 `tool_use` 机制调用它们
3. **Skill 工具的执行路径** (`skill:execute` IPC) 存在，但未与 LLMService 的 agentic tool loop 打通

**例外情况** — Plugin API 注册的 Skill：
- 通过 `PluginAPIFactory.ts` 注册的插件可以同时注册 MCP 工具（`internalMcpService.registerDynamic`）和 Skill（`skillService.registerDynamic`），此时 MCP 工具会出现在 chat 的 tools 列表中

---

## 4. 系统提示词构建

**文件**: `src/renderer/src/prompt/index.ts`

```typescript
function buildSystemPrompt(modelSystemPrompt?, envInfo?): string {
  const parts = [DEFAULT_SYSTEM_PROMPT];    // 全局默认提示词
  if (envInfo) parts.push(buildEnvContext(envInfo));  // 环境上下文
  if (modelSystemPrompt) parts.push(modelSystemPrompt);  // 模型自定义
  return parts.join("\n\n");
}
```

**工具提示追加**（`useChat.ts:103-117`）：

```typescript
const hints = [
  `\n\nYou have access to the following tools...${toolNames}...`,
  CLEAR_INSTRUCTIONS,      // 清除上下文指令
  TOOLS_INSTRUCTIONS,      // 内置工具使用指南
];
if (serverIds.has("@scp/browser")) hints.push(BROWSER_INSTRUCTIONS);
if (allToolNames.has("knowledge_base_search")) hints.push(KNOWLEDGE_INSTRUCTIONS);
if (allToolNames.has("request_user_config")) hints.push(USER_CONFIG_INSTRUCTIONS);
```

---

## 5. Agentic Tool Loop

**文件**: `src/main/services/llm/LLMService.ts:837-1063`

LLMService 实现了一个最多 `MAX_TOOL_ROUNDS` 轮的 agentic loop：

```
for (round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    │
    ├── client.messages.stream({ messages, tools })
    │   └── 流式处理 events (text, tool_use blocks)
    │
    ├── if (toolUseBlocks.length > 0 && toolExecutor):
    │   │
    │   ├── 将 assistant 消息（含 text + tool_use blocks）推入 messages
    │   │
    │   ├── 逐个执行 tool call:
    │   │   ├── broadcast "tool_call" event → renderer 展示
    │   │   ├── checkToolPermission() → 用户审批（按权限模式）
    │   │   ├── toolExecutor(name, args) → McpService.callTool()
    │   │   └── broadcast "tool_result" event → renderer 展示
    │   │
    │   ├── 将 tool results 作为 user 消息推入 messages
    │   │   └── { role: "user", content: [{ type: "tool_result", ... }] }
    │   │
    │   └── continue (下一轮循环)
    │
    └── else (无 tool call):
        └── broadcast "done" event → 结束
```

**工具权限检查** (`LLMService.checkToolPermission`)：
- `auto` 模式: 所有工具自动通过
- `authorized` 模式: 仅授权列表中的工具自动通过，其他需用户确认
- `manual` 模式: 每次调用都需用户确认

---

## 6. 关键文件索引

| 文件 | 职责 | 关键行号 |
|------|------|---------|
| `src/main/services/llm/LLMService.ts` | Anthropic SDK 调用、agentic tool loop | 779-789 (SDK初始化), 823-830 (工具转换), 837-1063 (tool loop) |
| `src/main/ipc/handlers/modelHandlers.ts` | 构建 toolExecutor、桥接 MCP | 234-267 (toolExecutor) |
| `src/main/services/mcp/McpService.ts` | MCP 服务统一接口 | 356-466 (callTool), 491-514 (getAllAvailableTools) |
| `src/main/services/mcp/internal/InternalMcpService.ts` | 内置 MCP 工具管理 | 30-77 (callTool), 174-204 (initialize) |
| `src/main/services/mcp/ThirdPartyMcpService.ts` | HTTP/SSE MCP 服务器 | 262-276 (listTools), 322-360 (callTool) |
| `src/main/services/skill/SkillService.ts` | Skill 加载、执行、prompt 提取 | 180-268 (buildManifest), 499-615 (executeSkill), 620-636 (getSystemPrompt) |
| `src/main/services/plugin/PluginAPIFactory.ts` | 插件 API，桥接 MCP + Skill | 447-468 (registerMcpTools), 473-516 (registerSkill) |
| `src/renderer/src/hooks/useChat.ts` | Renderer 端 chat 逻辑 | 56-124 (fetchMcpTools), 472-631 (sendDirectMessage), 782-926 (sendSkillMessage) |
| `src/renderer/src/prompt/index.ts` | 系统提示词构建 | 91-114 (buildSystemPrompt) |
| `src/renderer/src/prompt/tools.ts` | 内置工具使用指南提示词 | 7-41 (TOOLS_INSTRUCTIONS) |
| `src/preload/index.ts` | IPC 安全桥接 | 985 (skill.getAllTools), 1009 (mcp.getAllTools) |
