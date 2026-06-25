# Refactor Progress

> 入口：[refactor-plan](./refactor-plan.md) ·
> 覆盖矩阵：[refactor-traceability-matrix](./refactor-traceability-matrix.md) ·
> 执行门禁：[refactor-execution-gates](./refactor-execution-gates.md)
>
> 本文只记录当前实现进度和证据，不替代功能 plan。状态更新日期：2026-06-24。

## Current Status

**In progress.** 当前代码已经进入分批实现和验证阶段，但整体重构还不能标记为完成。P0 主线已经覆盖 Agent-only、JSONL structured parts、核心 runtime gate、项目/会话基础存储和对话展示骨架；P1/P2 的 recovery、remote、privacy/export、完整 structured renderer 和 cleanup 仍需继续收口。

## Latest Verified Commands

本次更新验证记录：

- `pnpm test:run src/renderer/src/components/chat/__tests__/StreamPartRenderer.test.tsx`：通过，1 个测试文件 / 4 个测试。
- `pnpm check`：通过。
- `pnpm lint`：通过，33 个 warning / 0 个 error；warning 为既有未清理项。
- `pnpm i18n:check`：通过。

上一轮完整验证记录：

- `pnpm check`：通过。
- `pnpm test:run`：通过，36 个测试文件 / 321 个测试。
- `pnpm lint`：通过，30 个 warning / 0 个 error。
- `pnpm i18n:check`：通过。
- `pnpm dev`：本轮未验证，因运行环境限制未继续拉起 dev server。

后续每次完成一个批次，应在这里追加新的 focused test / check 证据。

## Implemented With Evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Agent-only active path | Implemented | 新建、欢迎页发送、active send/storage 路径按 Agent runtime 收口；direct/chat 模式仅保留 compatibility type 读取。 |
| JSONL event storage | Implemented / partial | `SessionStorageService.appendEvent()` 分配 `eventId + seq + writtenAt`；JSONL parser 覆盖半行恢复、malformed middle corrupted、duplicate eventId、meta repair。 |
| Structured message parts | Implemented / partial | `MessagePart` / `AssistantPartEvent` 已进入 shared types；JSONL replay 可恢复 `Message.parts`；legacy fenced code/diff adapter 已接入。 |
| Agent streaming text | Implemented / partial | Agent SDK text delta 已转换为 `assistant.part_*`，并保留 legacy chunk 兼容。 |
| Prompt context | Implemented | Agent prompt 注入附件 resolver 结果、search context、skill/system prompt context。 |
| Tool approval foundation | Implemented / partial | `tool_call` / `permission_request` / `tool_error` 可 upsert 到统一 tool message；composer pending surface 已承接 active approval/ask。 |
| Runtime enforcement core | Implemented / partial | file open、attachment read、git worktree、legacy LLM tool executor、Agent SDK `canUseTool`、MCP unified `callTool()` 已接入 `RuntimePolicyService.evaluate()`。 |
| Project path policy | Implemented / partial | symlink 独立 project、hash collision fallback、中文/空格路径、settings deep merge/null clear/undefined no-op 有测试覆盖。 |
| Legacy import Option A | Implemented | 旧 chats 保守导入 casual session；invalid JSON/partial failure/rerun/no silent done flag 有测试覆盖。 |
| Session deletion | Implemented / partial | session delete tombstone、restoreDeleted、deleted append blocking 有测试覆盖。 |
| Message list virtualization | Implemented / partial | `ChatMessageList` 已按 turn 构建并在大列表走 virtual list；仍需性能证据和 pending interaction 行高回归。 |

## In Progress

| Area | Current work | Next evidence |
| --- | --- | --- |
| Structured code block UI | `code_block` part 已改为专用白底代码卡片：语言 badge、wrap/copy 图标、无内层 Markdown chrome；普通 Markdown `SyntaxHighlighter` 保持兼容路径。 | large mode / 视觉手测 / 长代码滚动性能。 |
| Tool / approval UI | composer pending surface 已接入；历史 transcript 摘要仍需进一步统一 tool state、折叠输入/结果和结构化错误。 | `ToolCallCard` / `ApprovalDecisionCard` tests。 |
| MCP runtime regression | unified `callTool()` 已接入；browser/third-party proxy 仍缺 per-server deny/approval 回归。 | MCP per-server tests。 |
| Structured renderer coverage | text/code/diff/data/table/tree/sources/artifact 基础 renderer 已有；large code mode、diff hunk collapse、artifact actions 未完成。 | renderer tests + long content performance check。 |

## Remaining Gaps

| Gap | Why it remains open |
| --- | --- |
| Remote lifecycle | remote-bound delete/unbind、bot offline、webhook replay、archived receive 状态机还没有实现证据。 |
| Settings recovery UI | tombstone/orphan/archive/relink/import wizard 仍停留在 IA / plan 层。 |
| Privacy/export/backup | redaction、diagnostic export、JSONL backup manifest 未实现。 |
| Full structured event stream | native code/diff/data/table/tree/source/artifact 专用 stream event 和 delta batching 尚未完成。 |
| Compatibility cleanup | 旧 workspace/chatMode/direct 文档示例、兼容 API/type 还需要最后清理或明确 compatibility 标注。 |
| Dev runtime smoke | 当前环境未成功完成 `pnpm dev` 手动验证；不能把真实运行体验标成 verified。 |

## Update Rules

1. 新实现只在有代码 diff 和测试证据后从 `In Progress` 移到 `Implemented With Evidence`。
2. `verified` 必须有用户路径或自动化路径证据；不能只凭 plan checkbox。
3. 不把功能任务细节写进本文；细节继续放在对应功能 plan。
4. 不运行打包命令作为常规进度验证；本阶段以 dev 可运行、类型检查、测试和 lint 为准。
