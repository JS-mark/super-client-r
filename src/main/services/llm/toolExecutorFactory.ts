/**
 * Tool Executor Factory
 *
 * Builds a `ToolExecutor` closure from a `ChatCompletionRequest` that maps
 * prefixed tool names back to MCP servers / built-in skills, resolves relative
 * file paths against the conversation cwd, and enforces a per-call timeout.
 *
 * The same closure is used by:
 *   - `src/main/ipc/handlers/modelHandlers.ts` (IPC entry from renderer)
 *   - `src/main/server/routes/llm.ts` (HTTP entry for external clients)
 *
 * Keeping a single source of truth avoids the two entry points drifting on
 * tool-arg resolution / timeout semantics / skill-vs-MCP dispatch.
 */

import * as path from "path";
import { mcpService } from "../mcp/McpService";
import { getSkillService } from "../skill/SkillService";
import { resolveConversationCwd } from "../runtime/conversationCwd";
import { logger } from "../../utils/logger";
import type { ChatCompletionRequest } from "../../ipc/types";
import type { ToolExecutor } from "./LLMService";

const log = logger.withContext("ToolExecutorFactory");

const SERVERS_WITH_PATH_ARGS = new Set(["@scp/file-system", "@scp/grep"]);
const PATH_ARG_KEYS = ["path", "source", "destination"];
const SERVERS_WITH_STORAGE = new Set(["@scp/plan", "@scp/task"]);

/**
 * Get the working directory used as `cwd` for tools in a chat completion.
 * Routes through `resolveConversationCwd` which prefers `WorkspaceConfig.path`
 * (the user's project dir) when set, else falls back to the per-conversation
 * sandbox dir.
 */
function getConversationCwd(conversationId?: string): string | undefined {
	if (!conversationId) return undefined;
	try {
		return resolveConversationCwd(conversationId);
	} catch {
		return undefined;
	}
}

/**
 * Resolve relative file paths in tool arguments against the workspace
 * directory. Also injects `_storageDir` for servers that need persistent
 * storage.
 */
function resolveToolPaths(
	serverId: string,
	args: Record<string, unknown>,
	workspaceDir?: string,
): Record<string, unknown> {
	if (!workspaceDir) return args;

	if (SERVERS_WITH_STORAGE.has(serverId)) {
		return { ...args, _storageDir: path.join(workspaceDir, "todo") };
	}

	if (!SERVERS_WITH_PATH_ARGS.has(serverId)) return args;

	const resolved: Record<string, unknown> = { ...args };
	for (const key of PATH_ARG_KEYS) {
		const val = resolved[key];
		if (typeof val === "string" && val && !path.isAbsolute(val)) {
			resolved[key] = path.resolve(workspaceDir, val);
			log.debug("Resolved relative path", {
				key,
				original: val,
				resolved: resolved[key],
				workspaceDir,
			});
		}
	}
	return resolved;
}

function resolveToolMapping(
	toolMapping: NonNullable<ChatCompletionRequest["toolMapping"]>,
	name: string,
): { serverId: string; toolName: string } | undefined {
	const exact = toolMapping[name];
	if (exact) return exact;

	const matches = Object.entries(toolMapping).filter(
		([prefixedName, mapping]) =>
			mapping.toolName === name || prefixedName.endsWith(`__${name}`),
	);
	return matches.length === 1 ? matches[0][1] : undefined;
}

/**
 * Build a `ToolExecutor` for the given chat completion request, or `undefined`
 * if no `toolMapping` was provided (i.e. the caller does not want tools).
 */
export function buildToolExecutorFromRequest(
	request: ChatCompletionRequest,
): ToolExecutor | undefined {
	if (!request.toolMapping) return undefined;

	const workspaceDir = getConversationCwd(request.conversationId);
	const toolTimeoutMs = (request.toolTimeout ?? 180) * 1000;

	return async (name: string, args: Record<string, unknown>) => {
		const mapping = resolveToolMapping(request.toolMapping!, name);
		if (!mapping) throw new Error(`Unknown tool: ${name}`);

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(
				() =>
					reject(
						new Error(
							`Tool "${name}" timed out after ${request.toolTimeout ?? 180}s`,
						),
					),
				toolTimeoutMs,
			);
		});

		// Skill tool dispatch
		if (mapping.serverId.startsWith("skill:")) {
			const skillId = mapping.serverId.slice("skill:".length);
			const skillService = getSkillService();
			const callPromise = skillService.executeSkill(
				skillId,
				mapping.toolName,
				args,
			);
			const result = await Promise.race([callPromise, timeoutPromise]);
			if (!result.success) {
				throw new Error(result.error || "Skill tool call failed");
			}
			return result.output;
		}

		// MCP tool dispatch
		const resolvedArgs = resolveToolPaths(
			mapping.serverId,
			args,
			workspaceDir,
		);
		const callPromise = mcpService.callTool(
			mapping.serverId,
			mapping.toolName,
			resolvedArgs,
			{ conversationId: request.conversationId },
		);
		const result = await Promise.race([callPromise, timeoutPromise]);
		if (!result.success) {
			throw new Error(result.error || "Tool call failed");
		}
		return result.data;
	};
}
