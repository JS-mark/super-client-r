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
 *   - `_parentAssistantMessageId`: optional parent assistant message id for
 *     live SubagentMessagePart updates
 *   - `_taskDepth`: current subagent nesting level (root = 0)
 *
 * Wire naming on the model side: `scp-agent-builtins__Read` (etc.) per
 * the project's MCP tool naming convention (see useChat.sanitizeServerId).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseSSEStream } from "../../../llm/sseClient";
import { getSubagentEventBridge } from "../../../agent/runtime/subagentBridgeRegistry";
import {
	registerSubagentControl,
	unregisterSubagentControl,
} from "../../../agent/runtime/subagentControlRegistry";
import { mcpService } from "../../McpService";
import type {
	InternalMcpServer,
	InternalToolDefinition,
	InternalToolHandler,
	InternalToolResult,
} from "../types";

const MAX_TASK_DEPTH = 3;

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
	{
		// Interactive clarification tool. NOT dispatched through this MCP
		// server — `toolAdapter.ts` intercepts the call, emits a
		// `tool_approval_request` with `source:"ask-user-question"`, and
		// returns the user's answers as the tool_result. The def lives here
		// only so `ClaudeCodeAgentRuntime` advertises it in the OpenAI
		// tools[] list (same source of truth as the other facade tools).
		name: "AskUserQuestion",
		description:
			"Ask the user 1–4 multiple-choice clarifying questions when their request is ambiguous and you can enumerate distinct options. Use only when answers materially change what you do next (architecture, library, scope). Don't use for trivial yes/no, or when sensible defaults exist — pick the obvious option and proceed. Each question has a short `header` chip (≤12 chars), the full `question` text, and 2–4 mutually exclusive `options`. Set `multiSelect:true` only when choices are not mutually exclusive. Options may include a `description` and an optional `preview` (monospace mockup). Do NOT include an 'Other' option — the UI adds one automatically.",
		inputSchema: {
			type: "object",
			properties: {
				questions: {
					type: "array",
					minItems: 1,
					maxItems: 4,
					description: "1–4 questions to present together.",
					items: {
						type: "object",
						properties: {
							question: {
								type: "string",
								description:
									"Full question text, ending with a question mark.",
							},
							header: {
								type: "string",
								description: "Very short chip label, max 12 chars.",
							},
							multiSelect: {
								type: "boolean",
								description:
									"true if multiple options can be selected; default false.",
							},
							options: {
								type: "array",
								minItems: 2,
								maxItems: 4,
								items: {
									type: "object",
									properties: {
										label: { type: "string" },
										description: { type: "string" },
										preview: {
											type: "string",
											description:
												"Optional monospace mockup / code snippet for visual comparison.",
										},
									},
									required: ["label", "description"],
								},
							},
						},
						required: ["question", "header", "options"],
					},
				},
			},
			required: ["questions"],
		},
	},
];

export const AGENT_BUILTIN_TOOL_NAMES = toolDefs.map((t) => t.name);

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

// ── Task handler (HTTP recursion) ─────────────────────────────────────
// Reads the parent's provider/scp/port config from injected args and
// POSTs a fresh chat completion request back to the local HTTP server.
// The subagent has the same tool set (including Task itself, depth-bounded).
// Returns the accumulated assistant text as a single tool result.

const taskHandler: InternalToolHandler = async (args) => {
	// Multi-Agent Round 6: capture the bridge + parent identifiers up-front
	// so both the happy path and any early throw can emit a `subagent.failed`
	// event without duplicating branching. Bridge may be null (bootstrap
	// disabled it or tests skipped registration) — every emit call becomes
	// a no-op in that case, preserving backward compat.
	const bridge = getSubagentEventBridge();
	const parentRequestId = String(args._parentRequestId ?? "");
	const parentConversationId = String(args._parentConversationId ?? "");
	const parentAssistantMessageId = String(args._parentAssistantMessageId ?? "");
	// Deterministic subagentRunId — includes crypto UUID so parallel Task
	// calls in the same tick don't collide, and echoes parent request id
	// for trace correlation.
	const subagentRunId = `sub_${parentRequestId || "root"}_${randomUUID()}`;
	let spawned = false;
	// SUP-16 stop: abort handle for the in-flight sub-stream. `cancelled`
	// flips to true only on a user-initiated stop so the catch block can tell
	// a deliberate cancel apart from a genuine failure (and skip emitting a
	// `subagent.failed` on top of the already-emitted `cancelled`).
	const abortController = new AbortController();
	let cancelled = false;
	let subRequestId = "";
	try {
		const description = String(args.description ?? "").trim();
		const prompt = String(args.prompt ?? "").trim();
		if (!description) throw new Error("description is required");
		if (!prompt) throw new Error("prompt is required");

		const depth = Number(args._taskDepth ?? 0);
		if (depth >= MAX_TASK_DEPTH) {
			throw new Error(
				`max nesting depth (${MAX_TASK_DEPTH}) reached; inline this work instead`,
			);
		}

		const provider = args._provider as
			| {
					baseUrl?: string;
					apiKey?: string;
					model?: string;
					providerPreset?: string;
					apiFormat?: string;
			  }
			| undefined;
		if (!provider || !provider.baseUrl || !provider.model) {
			throw new Error("_provider is required (host injection failed)");
		}

		const scpPort = Number(args._scpPort ?? 0);
		const scpApiKey = String(args._scpApiKey ?? "");
		if (!scpPort || !scpApiKey) {
			throw new Error("_scpPort/_scpApiKey required for HTTP recursion");
		}

		// Emit spawn AFTER argument validation — a validation error should
		// surface as a plain tool error, not a subagent.failed lifecycle. The
		// bridge is only consulted when parentConversationId is known;
		// otherwise the outer session id is unknown so we can't route.
		if (bridge && parentConversationId) {
			bridge.spawn({
				parentRunId: parentRequestId,
				subagentRunId,
				sessionId: parentConversationId,
				...(parentAssistantMessageId ? { parentAssistantMessageId } : {}),
				taskGoal: `${description}: ${prompt}`,
			});
			spawned = true;
		}

		subRequestId = `${parentRequestId || "task"}_d${depth + 1}_${Date.now()}`;

		// SUP-16 stop: register a cancel handle so an IPC `stop-subagent` can
		// tear this run down. `cancel()` is idempotent — it aborts the local
		// fetch (which trips the HTTP route's `req.on("close")` →
		// `llmService.stopStream(subRequestId)`, releasing tool approvals and
		// killing any child process, i.e. no residual work) and best-effort
		// POSTs /v1/llm/stop so the sub-stream is torn down even if the abort
		// races the socket. Emitting the `cancelled` lifecycle event is the
		// bridge's job (see the IPC handler); here we only stop the work.
		if (spawned) {
			registerSubagentControl({
				subagentRunId,
				sessionId: parentConversationId || undefined,
				cancel: () => {
					cancelled = true;
					try {
						abortController.abort();
					} catch {
						// abort never throws in practice; guard defensively.
					}
					// Belt-and-suspenders: also ask the server to stop the
					// sub-stream by id in case the socket close didn't propagate.
					void fetch(`http://127.0.0.1:${scpPort}/v1/llm/stop`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${scpApiKey}`,
						},
						body: JSON.stringify({ requestId: subRequestId }),
					}).catch(() => {
						// best-effort; the abort above is the primary path.
					});
				},
			});
		}

		const subRequest = {
			requestId: subRequestId,
			conversationId: parentConversationId || subRequestId,
			baseUrl: provider.baseUrl,
			apiKey: provider.apiKey,
			model: provider.model,
			providerPreset: provider.providerPreset,
			apiFormat: provider.apiFormat,
			agentBuiltins: {
				taskDepth: depth + 1,
				...(parentConversationId ? { parentConversationId } : {}),
				...(parentAssistantMessageId ? { parentAssistantMessageId } : {}),
			},
			messages: [
				{
					role: "system" as const,
					content:
						`You are a focused subagent. Task: ${description}\n` +
						`Return a concise summary of your findings. ` +
						`You have access to the same built-in tools as the parent agent.`,
				},
				{ role: "user" as const, content: prompt },
			],
			tools: toolDefs.map((t) => ({
				type: "function" as const,
				function: {
					name: `scp-agent-builtins__${t.name}`,
					description: t.description,
					parameters: t.inputSchema,
				},
			})),
			toolMapping: Object.fromEntries(
				toolDefs.map((t) => [
					`scp-agent-builtins__${t.name}`,
					{ serverId: "@scp/agent-builtins", toolName: t.name },
				]),
			),
		};

		const res = await fetch(
			`http://127.0.0.1:${scpPort}/v1/llm/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${scpApiKey}`,
				},
				body: JSON.stringify(subRequest),
				signal: abortController.signal,
			},
		);
		if (!res.ok || !res.body) {
			throw new Error(`subagent HTTP ${res.status}`);
		}

		let accumulated = "";
		let toolCallCount = 0;
		for await (const frame of parseSSEStream(res.body)) {
			if (frame.event === "chunk") {
				const c = (frame.data as { content?: string }).content;
				if (c) accumulated += c;
			} else if (isToolCallSseFrame(frame.event)) {
				toolCallCount += 1;
				if (spawned && bridge) {
					bridge.update(subagentRunId, {
						status: "running",
						toolCallCount,
					});
				}
			} else if (frame.event === "error") {
				const e = (frame.data as { error?: string }).error ?? "unknown";
				throw new Error(`subagent error: ${e}`);
			}
		}

		if (spawned && bridge) {
			bridge.complete(subagentRunId, {
				summary: accumulated || undefined,
				toolCallCount,
			});
		}
		return textOk(accumulated || "(subagent returned no text)");
	} catch (err) {
		// User-initiated stop: the `cancelled` lifecycle event was already
		// emitted by the IPC handler via `bridge.cancel()`. Do NOT emit a
		// `subagent.failed` on top of it — just surface a plain tool error so
		// the parent transcript shows the tool call ended.
		if (cancelled) {
			return textErr("Task: stopped by user");
		}
		if (spawned && bridge) {
			bridge.fail(subagentRunId, (err as Error).message);
		}
		return textErr(`Task: ${(err as Error).message}`);
	} finally {
		// Always drop the control handle so a finished run can't be "stopped".
		if (spawned) unregisterSubagentControl(subagentRunId);
	}
};

function isToolCallSseFrame(eventName: string): boolean {
	return eventName === "tool_call" || eventName === "tool.call";
}

// AskUserQuestion is intercepted by `toolAdapter.ts` before reaching this MCP
// server. If it ever falls through (e.g. a future code path forgets the
// interception), surface a clear error rather than silently returning empty.
const askUserQuestionFallthroughHandler: InternalToolHandler = async () => {
	return textErr(
		"AskUserQuestion must be handled by the LLM tool adapter (toolAdapter.ts). " +
			"Reaching the MCP dispatch path means the interception was bypassed.",
	);
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
	handlers.set("Task", taskHandler);
	handlers.set("AskUserQuestion", askUserQuestionFallthroughHandler);
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
