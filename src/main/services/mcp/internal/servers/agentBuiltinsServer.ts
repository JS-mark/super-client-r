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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { mcpService } from "../../McpService";
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

function textOk(text: string): InternalToolResult {
	return { content: [{ type: "text", text }], isError: false };
}

function textErr(text: string): InternalToolResult {
	return { content: [{ type: "text", text }], isError: true };
}

function resolveCwd(args: Record<string, unknown>): string {
	const cwd = args._cwd;
	return typeof cwd === "string" && cwd.length > 0 ? cwd : process.cwd();
}

function resolvePath(args: Record<string, unknown>, key: string): string {
	const raw = String(args[key] ?? "");
	if (!raw) throw new Error(`${key} is required`);
	return isAbsolute(raw) ? raw : resolve(resolveCwd(args), raw);
}

// ── Handlers ──────────────────────────────────────────────────────────

const readHandler: InternalToolHandler = async (args) => {
	try {
		const abs = resolvePath(args, "path");
		const offset = Math.max(1, Number(args.offset ?? 1) | 0);
		const limit = Number(args.limit ?? 0) | 0;
		const content = await readFile(abs, "utf-8");
		const lines = content.split("\n");
		const start = offset - 1;
		const end = limit > 0 ? start + limit : lines.length;
		const view = lines.slice(start, end);
		const text = view
			.map((l, i) => `${(start + i + 1).toString().padStart(4)}\t${l}`)
			.join("\n");
		return textOk(text);
	} catch (err) {
		return textErr(`Read: ${(err as Error).message}`);
	}
};

const writeHandler: InternalToolHandler = async (args) => {
	try {
		const abs = resolvePath(args, "path");
		const content = String(args.content ?? "");
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf-8");
		return textOk(`Wrote ${content.length} bytes to ${abs}`);
	} catch (err) {
		return textErr(`Write: ${(err as Error).message}`);
	}
};

const editHandler: InternalToolHandler = async (args) => {
	try {
		const abs = resolvePath(args, "path");
		const oldStr = String(args.old_string ?? "");
		const newStr = String(args.new_string ?? "");
		const replaceAll = Boolean(args.replace_all);
		if (!oldStr) throw new Error("old_string must be non-empty");
		if (oldStr === newStr) {
			throw new Error("old_string and new_string are identical — no-op");
		}
		const content = await readFile(abs, "utf-8");
		let count = 0;
		let idx = -1;
		while ((idx = content.indexOf(oldStr, idx + 1)) !== -1) count++;
		if (count === 0) {
			throw new Error(
				`anchor not found in ${abs}. Read the file and pick a substring that appears verbatim.`,
			);
		}
		if (count > 1 && !replaceAll) {
			throw new Error(
				`anchor matches ${count} times in ${abs}; pass replace_all:true OR include more surrounding context to make old_string unique.`,
			);
		}
		const next = replaceAll
			? content.split(oldStr).join(newStr)
			: content.replace(oldStr, newStr);
		await writeFile(abs, next, "utf-8");
		const replaced = replaceAll ? count : 1;
		return textOk(
			`Edited ${abs}: ${replaced} replacement${replaced === 1 ? "" : "s"}`,
		);
	} catch (err) {
		return textErr(`Edit: ${(err as Error).message}`);
	}
};

// ── MCP-delegating handlers ──────────────────────────────────────────
// Bash/Grep/Glob/WebFetch all forward to an existing internal MCP server.
// We unwrap the inner envelope and rethrow as our InternalToolResult.

async function delegate(
	serverId: string,
	toolName: string,
	args: Record<string, unknown>,
	options: Record<string, unknown> = {},
): Promise<InternalToolResult> {
	const result = await mcpService.callTool(serverId, toolName, args, options);
	if (!result.success) {
		return textErr(result.error ?? `${toolName}: ${serverId} failed`);
	}
	const data = result.data as
		| { content?: InternalToolResult["content"]; isError?: boolean }
		| undefined;
	if (data?.isError) {
		const text =
			data.content?.map((c) => ("text" in c ? c.text : "")).join("") ?? "";
		return textErr(text || `${toolName}: tool returned isError`);
	}
	return {
		content: data?.content ?? [],
		isError: false,
	};
}

const bashHandler: InternalToolHandler = async (args) => {
	try {
		const command = String(args.command ?? "");
		if (!command) throw new Error("command is required");
		const cwd = resolveCwd(args);
		const timeout = Number(args.timeout) || undefined;
		return await delegate("@scp/bash", "execute_command", {
			command,
			workingDir: cwd,
			timeout,
			confirmed: true,
		});
	} catch (err) {
		return textErr(`Bash: ${(err as Error).message}`);
	}
};

const grepHandler: InternalToolHandler = async (args) => {
	try {
		const pattern = String(args.pattern ?? "");
		if (!pattern) throw new Error("pattern is required");
		const path = String(args.path ?? resolveCwd(args));
		const searchPath = isAbsolute(path) ? path : resolve(resolveCwd(args), path);
		const delegateArgs: Record<string, unknown> = {
			pattern,
			path: searchPath,
			ignoreCase: Boolean(args.ignoreCase),
			filesOnly: Boolean(args.filesOnly),
		};
		if (typeof args.glob === "string") delegateArgs.include = args.glob;
		if (typeof args.contextLines === "number") {
			delegateArgs.contextLines = Math.max(0, Math.min(5, args.contextLines));
		}
		if (typeof args.maxResults === "number") {
			delegateArgs.maxResults = Math.max(1, Math.min(1000, args.maxResults));
		}
		return await delegate("@scp/grep", "grep", delegateArgs);
	} catch (err) {
		return textErr(`Grep: ${(err as Error).message}`);
	}
};

const globHandler: InternalToolHandler = async (args) => {
	try {
		const pattern = String(args.pattern ?? "");
		if (!pattern) throw new Error("pattern is required");
		const path = String(args.path ?? resolveCwd(args));
		const searchPath = isAbsolute(path) ? path : resolve(resolveCwd(args), path);
		return await delegate("@scp/file-system", "search_files", {
			pattern,
			path: searchPath,
		});
	} catch (err) {
		return textErr(`Glob: ${(err as Error).message}`);
	}
};

const webfetchHandler: InternalToolHandler = async (args) => {
	try {
		const url = String(args.url ?? "");
		if (!url) throw new Error("url is required");
		return await delegate("@scp/fetch", "fetch_html", { url });
	} catch (err) {
		return textErr(`WebFetch: ${(err as Error).message}`);
	}
};

export function createAgentBuiltinsServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("Read", readHandler);
	handlers.set("Write", writeHandler);
	handlers.set("Edit", editHandler);
	handlers.set("Bash", bashHandler);
	handlers.set("Grep", grepHandler);
	handlers.set("Glob", globHandler);
	handlers.set("WebFetch", webfetchHandler);
	handlers.set("Task", placeholder("Task"));
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
