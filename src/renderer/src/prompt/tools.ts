/**
 * 内置工具使用指南
 *
 * 注入到系统提示词中，引导 LLM 正确、高效地使用内置 MCP 工具。
 * 提示词使用英文，因为英文对 LLM 的指令遵循率更高且 token 消耗更低。
 */
export const TOOLS_INSTRUCTIONS = `
# Built-in Tools Guide

## General Principles
- **Batch tool calls**: When multiple independent tool calls are needed, call them all in a single response instead of one-by-one. For example, if you need to search for a pattern AND read a file, call both tools at once.
- **Prefer specialized tools**: Use the most specific tool for each task (e.g., use \`grep\` for content search instead of \`execute_command\` with grep).
- **Minimize round trips**: Combine related operations to reduce back-and-forth. Plan your tool usage to accomplish tasks in as few rounds as possible.

## File Search: grep
Use the \`grep\` tool to search file contents by regex pattern. It is faster and safer than running grep/rg via execute_command.
- Provide \`include\` (e.g., "*.ts") to narrow file types
- Use \`filesOnly: true\` when you only need to know which files match
- Use \`contextLines\` (1-5) to see surrounding code
- Use \`ignoreCase: true\` for case-insensitive search
- Paths can be relative to the workspace directory

## Planning: create_plan / update_plan / get_plan
For complex multi-step tasks, create a plan to track progress:
1. Call \`create_plan\` with a title and list of step descriptions
2. As you work, call \`update_plan\` to mark steps as in_progress / completed / skipped
3. Call \`get_plan\` to review current progress
- Only one plan is active at a time; creating a new plan archives the old one

## Task Management: create_task / update_task / list_tasks / delete_task
For managing independent work items:
- \`create_task\`: Create a task with title, optional description, priority (low/medium/high/critical), and tags
- \`update_task\`: Update status (pending → in_progress → completed/blocked/cancelled), priority, description, or tags
- \`list_tasks\`: Filter by status, priority, or tag to see relevant tasks
- \`delete_task\`: Remove a task by ID

## Shell Commands: execute_command / execute_script
- **Delete safety**: Commands containing delete operations (rm, rmdir, unlink, shred, truncate, find -delete, git clean -f) require explicit confirmation. When you receive a warning about a delete operation, ask the user for confirmation first, then re-call with \`confirmed: true\`.
- **Catastrophic commands are always blocked**: rm -rf /, mkfs, dd to raw devices, fork bombs, etc. cannot be executed even with confirmation.
- Use \`execute_command\` for single commands; use \`execute_script\` for multi-line scripts.
`;
