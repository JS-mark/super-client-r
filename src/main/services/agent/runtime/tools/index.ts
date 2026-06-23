import { createBashTool } from "./bash";
import { createEditTool } from "./edit";
import { createGlobTool } from "./glob";
import { createGrepTool } from "./grep";
import { createReadTool } from "./read";
import { createWebFetchTool } from "./webfetch";
import { createWriteTool } from "./write";

/**
 * Built-in tool registry for ClaudeCodeAgentRuntime.
 *
 * The 8 canonical Claude-Code-style tools (Read/Write/Edit/Bash/Grep/Glob/
 * WebFetch/Task). Each tool is a small adapter on top of either an existing
 * MCP server (@scp/file-system, @scp/bash, @scp/grep, @scp/fetch) or a
 * net-new implementation (Edit, Task).
 *
 * `getBuiltinTools(ctx)` returns 8 `BuiltinToolDef` objects. The runtime
 * adds them to the tools[] list that goes to LLMService.chatCompletion,
 * and routes tool calls back to the matching `execute()` here.
 *
 * During implementation, tools start as placeholders and are filled in one
 * task per tool (see docs/superpowers/plans/2026-06-23-claude-code-agent.md).
 */

export interface BuiltinToolContext {
	cwd: string;
	signal: AbortSignal;
	/** Depth inside Task recursion; root call = 0, first subagent = 1, … */
	taskDepth?: number;
	/**
	 * Provided by ClaudeCodeAgentRuntime so the Task tool can recurse into
	 * a fresh subagent. Receives `prompt` + abort signal + new depth.
	 */
	dispatchSubagent?: (
		prompt: string,
		opts: { signal: AbortSignal; depth: number },
	) => Promise<string>;
}

export interface BuiltinToolDef {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	execute: (input: Record<string, unknown>) => Promise<string>;
}

export const BUILTIN_TOOL_NAMES = [
	"Read",
	"Write",
	"Edit",
	"Bash",
	"Grep",
	"Glob",
	"WebFetch",
	"Task",
] as const;

export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[number];

function placeholder(name: BuiltinToolName): BuiltinToolDef {
	return {
		name,
		description: `${name} (not yet implemented)`,
		inputSchema: { type: "object" },
		execute: async () => {
			throw new Error(`${name}: not implemented`);
		},
	};
}

export function getBuiltinTools(ctx: BuiltinToolContext): BuiltinToolDef[] {
	return [
		createReadTool(ctx),
		createWriteTool(ctx),
		createEditTool(ctx),
		createBashTool(ctx),
		createGrepTool(ctx),
		createGlobTool(ctx),
		createWebFetchTool(ctx),
		placeholder("Task"),
	];
}
