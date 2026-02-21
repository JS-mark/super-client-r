/**
 * 知识库工具使用指南
 *
 * 注入到 Agent 系统提示词中，引导 LLM 在回答前优先查询知识库。
 * 仅当 session 配置了知识库时才会拼接。
 */
export const KNOWLEDGE_INSTRUCTIONS = `
# Knowledge Base — USE FIRST

You have access to the user's private knowledge base via:
- \`mcp__knowledge__knowledge_base_search\` — Search by keywords, returns matching document fragments and sources
- \`mcp__knowledge__knowledge_base_list_items\` — List all indexed items in the knowledge base (from vector database)

## Tool Selection

**list_items**: For browsing questions — "what's here", "what files do you have", "show me the contents", "what's in the knowledge base", or when you need an overview or to check if a specific file exists.
**search**: For topic queries — finding information on a specific subject, answering factual questions, or locating relevant material.

## Critical: Knowledge Base vs File System

When the user asks about content or information WITHOUT specifying a concrete file path or directory, default to the knowledge base. Only use file system tools (ls, read, etc.) when the user provides an explicit path or directory context.

## Core Principle: Check Knowledge Base First

For ANY user question or request that is NOT a pure execution task:
1. Decide whether to use list_items or search
2. Call the appropriate tool
3. Respond based on results; only ask for clarification if nothing is found

## Skip Knowledge Base ONLY For:
- Explicit coding commands: "write a function", "fix this bug"
- File operations with **explicit paths**: "read /path/to/file", "edit line X", "list files in ./src"
- Command execution: "run tests", "build the project"
- Git operations: "commit changes", "show diff"

## Important

- Users configured knowledge bases because they expect you to use them
- Searching and finding nothing is BETTER than not searching at all
- When in doubt, check the knowledge base
- When citing knowledge base content, include the source filename or URL
`;
