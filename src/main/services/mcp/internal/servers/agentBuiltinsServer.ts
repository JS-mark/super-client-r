/**
 * @scp/agent-builtins — built-in tools for the Claude-Code-style agent.
 *
 * Mirrors the canonical Claude Code tool set so any model with native
 * function calling can drive the same agent loop. Each handler delegates
 * to either Node fs / child_process or another internal MCP server.
 *
 * Host injection (toolExecutorFactory.injectBuiltinArgs, Task E2.10):
 *   - `_storageDir`: workspace storage subdir
 *   - `_cwd`: workspace cwd for path resolution
 *   - `_provider`: { baseUrl, apiKey, model, providerPreset, apiFormat }
 *     (for Task tool's HTTP recursion)
 *   - `_scpPort` / `_scpApiKey`: this server's HTTP port + Bearer key
 *   - `_parentRequestId`: parent's requestId (for trace correlation)
 *   - `_taskDepth`: current subagent nesting level (root = 0)
 *
 * Wire naming on the model side: `scp-agent-builtins__Read` (etc.) per
 * the project's MCP tool naming convention (see useChat.sanitizeServerId).
 */

import type {
	InternalMcpServer,
	InternalToolDefinition,
	InternalToolHandler,
	InternalToolResult,
} from "../types";

const toolDefs: InternalToolDefinition[] = [
	{
		name: "Read",
		description:
			"Read the contents of a file. Returns content with line numbers in cat -n format. Supports offset (1-indexed start line) and limit (count). Use Glob/Grep first to discover files.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative-to-cwd file path" },
				offset: { type: "number", description: "1-indexed starting line" },
				limit: { type: "number", description: "Max lines to return" },
			},
			required: ["path"],
		},
	},
	{
		name: "Write",
		description:
			"Write text to a file (UTF-8). Creates parent directories if they don't exist. Overwrites existing files. For partial edits prefer Edit.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Absolute or relative-to-cwd file path" },
				content: { type: "string", description: "Full file content to write" },
			},
			required: ["path", "content"],
		},
	},
	{
		name: "Edit",
		description:
			"Replace old_string with new_string inside a file. old_string must appear exactly once unless replace_all:true. If the anchor is ambiguous, narrow it by adding more surrounding context. Prefer Edit over Write for partial changes.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				old_string: { type: "string", description: "Exact substring to match" },
				new_string: { type: "string", description: "Replacement text" },
				replace_all: { type: "boolean", description: "Default false; replace every occurrence" },
			},
			required: ["path", "old_string", "new_string"],
		},
	},
	{
		name: "Bash",
		description:
			"Run a shell command in the current working directory. Returns stdout, stderr and exit code. Default 30s timeout, max 120s.",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string", description: "Shell command (bash/zsh/sh)" },
				timeout: { type: "number", description: "Optional ms timeout (default 30000, max 120000)" },
			},
			required: ["command"],
		},
	},
	{
		name: "Grep",
		description:
			"Search file contents using regex (ripgrep). Pass `glob` to filter included files (e.g. `*.ts`). Pass `filesOnly:true` to return only file paths.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string", description: "Regex pattern" },
				path: { type: "string", description: "Search root (default cwd)" },
				glob: { type: "string" },
				filesOnly: { type: "boolean" },
				ignoreCase: { type: "boolean" },
				contextLines: { type: "number", description: "0-5; default 0" },
				maxResults: { type: "number" },
			},
			required: ["pattern"],
		},
	},
	{
		name: "Glob",
		description:
			"List files matching a glob pattern. Examples: **/*.ts, src/**/index.{ts,tsx}. Default search root is cwd.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string" },
				path: { type: "string" },
			},
			required: ["pattern"],
		},
	},
	{
		name: "WebFetch",
		description:
			"Fetch a URL and return its text content (HTML stripped). Use for online docs, package READMEs, blog posts.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "HTTPS URL to fetch" },
			},
			required: ["url"],
		},
	},
	{
		name: "Task",
		description:
			"Spawn a focused subagent for a self-contained sub-problem. The subagent has access to the same workspace and built-in tools but starts with a fresh chat context. Use for: parallel exploration ('find all callers of X'), heavy multi-step analysis you want summarised back, isolating tool-noisy work. Max nesting depth: 3.",
		inputSchema: {
			type: "object",
			properties: {
				description: { type: "string", description: "Short label (3-5 words)" },
				prompt: { type: "string", description: "Detailed instructions" },
			},
			required: ["description", "prompt"],
		},
	},
];

export const AGENT_BUILTIN_TOOL_NAMES = toolDefs.map((t) => t.name);

function placeholder(name: string): InternalToolHandler {
	return async () => ({
		content: [{ type: "text" as const, text: `${name}: not implemented yet` }],
		isError: true,
	});
}

export function createAgentBuiltinsServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	for (const def of toolDefs) handlers.set(def.name, placeholder(def.name));
	return {
		id: "@scp/agent-builtins",
		name: "Agent Built-ins",
		description: "Built-in tool set for the ClaudeCodeAgentRuntime.",
		version: "1.0.0",
		tools: toolDefs,
		handlers,
	};
}

// Re-export the tool defs so ClaudeCodeAgentRuntime can build the OpenAI
// tools[] from the same source of truth.
export { toolDefs as AGENT_BUILTIN_TOOL_DEFS };

// Re-export the InternalToolResult helper alias for handler convenience.
export type AgentBuiltinResult = InternalToolResult;
