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
import { RuntimeApprovalRequiredError, type ToolExecutor } from "./LLMService";

const log = logger.withContext("ToolExecutorFactory");

const SERVERS_WITH_PATH_ARGS = new Set([
	"@scp/file-system",
	"@scp/grep",
	"@scp/agent-builtins", // Read/Write/Edit/Glob need cwd-relative path resolution
]);
const PATH_ARG_KEYS = ["path", "source", "destination"];
const SERVERS_WITH_STORAGE = new Set(["@scp/plan", "@scp/task"]);
const AGENT_BUILTINS_SERVER = "@scp/agent-builtins";

/**
 * Extra context the agent-builtins server's Task tool needs. The HTTP route
 * (server/routes/llm.ts) and IPC handler (modelHandlers.ts) populate this
 * from the inbound request + LocalServer + getOrCreateApiKey so the Task
 * handler can HTTP-recurse into a subagent.
 */
export interface AgentBuiltinsContext {
	provider?: {
		baseUrl?: string;
		apiKey?: string;
		model?: string;
		providerPreset?: string;
		apiFormat?: string;
	};
	scpPort?: number;
	scpApiKey?: string;
	parentRequestId?: string;
	taskDepth?: number;
	/**
	 * Multi-Agent Round 6: parent session (aka the outer chat's
	 * conversationId). Passed to the `Task` tool so subagent lifecycle
	 * events can be routed to the parent's JSONL / renderer via the
	 * SubagentEventBridge module registry. Optional for backward
	 * compatibility with callers that don't know the conversation.
	 */
	parentConversationId?: string;
	parentAssistantMessageId?: string;
}

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
 * directory and inject host-side context blobs (_storageDir for stores,
 * _cwd + _provider + _scpPort + _scpApiKey for the agent-builtins Task tool).
 *
 * Exported for unit testing.
 */
export function injectBuiltinArgs(
	serverId: string,
	args: Record<string, unknown>,
	workspaceDir?: string,
	agentBuiltinsCtx?: AgentBuiltinsContext,
): Record<string, unknown> {
	// Servers that get a per-workspace storage dir (plan/todo).
	if (SERVERS_WITH_STORAGE.has(serverId)) {
		if (!workspaceDir) return args;
		return { ...args, _storageDir: path.join(workspaceDir, "todo") };
	}

	// Servers that take file-path-like arguments — resolve relative to cwd.
	const wantsPathArgs = SERVERS_WITH_PATH_ARGS.has(serverId);
	if (!wantsPathArgs && serverId !== AGENT_BUILTINS_SERVER) return args;

	const resolved: Record<string, unknown> = { ...args };

	if (workspaceDir) {
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
	}

	// agent-builtins gets workspace cwd + Task recursion context.
	if (serverId === AGENT_BUILTINS_SERVER) {
		if (workspaceDir) resolved._cwd = workspaceDir;
		if (agentBuiltinsCtx?.provider) resolved._provider = agentBuiltinsCtx.provider;
		if (agentBuiltinsCtx?.scpPort) resolved._scpPort = agentBuiltinsCtx.scpPort;
		if (agentBuiltinsCtx?.scpApiKey)
			resolved._scpApiKey = agentBuiltinsCtx.scpApiKey;
		if (agentBuiltinsCtx?.parentRequestId)
			resolved._parentRequestId = agentBuiltinsCtx.parentRequestId;
		if (
			agentBuiltinsCtx?.taskDepth !== undefined &&
			resolved._taskDepth === undefined
		) {
			resolved._taskDepth = agentBuiltinsCtx.taskDepth;
		}
		if (agentBuiltinsCtx?.parentConversationId)
			resolved._parentConversationId = agentBuiltinsCtx.parentConversationId;
		if (agentBuiltinsCtx?.parentAssistantMessageId)
			resolved._parentAssistantMessageId =
				agentBuiltinsCtx.parentAssistantMessageId;
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
	extras?: {
		scpPort?: number;
		scpApiKey?: string;
	},
): ToolExecutor | undefined {
	if (!request.toolMapping) return undefined;

	const workspaceDir = getConversationCwd(request.conversationId);
	const toolTimeoutMs = (request.toolTimeout ?? 180) * 1000;
	const agentBuiltinsCtx: AgentBuiltinsContext = {
		provider: {
			baseUrl: request.baseUrl,
			apiKey: request.apiKey,
			model: request.model,
			providerPreset: request.providerPreset,
			apiFormat: request.apiFormat,
		},
		scpPort: extras?.scpPort,
		scpApiKey: extras?.scpApiKey,
		parentRequestId: request.requestId,
		parentConversationId:
			request.agentBuiltins?.parentConversationId ?? request.conversationId,
		...(request.agentBuiltins?.taskDepth !== undefined
			? { taskDepth: request.agentBuiltins.taskDepth }
			: {}),
		...(request.agentBuiltins?.parentAssistantMessageId
			? {
					parentAssistantMessageId:
						request.agentBuiltins.parentAssistantMessageId,
				}
			: {}),
	};

	return async (
		name: string,
		args: Record<string, unknown>,
		execOptions?: { approvalGranted?: boolean },
	) => {
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
		const resolvedArgs = injectBuiltinArgs(
			mapping.serverId,
			args,
			workspaceDir,
			agentBuiltinsCtx,
		);
		const callPromise = mcpService.callTool(
			mapping.serverId,
			mapping.toolName,
			resolvedArgs,
			{
				conversationId: request.conversationId,
				approvalGranted: execOptions?.approvalGranted,
			},
		);
		const result = await Promise.race([callPromise, timeoutPromise]);
		if (!result.success) {
			// Preserve the runtime-policy needs-approval signal as a typed
			// error so `toolAdapter` can route it through the inline
			// approval UI instead of treating it as a generic tool failure.
			if (result.errorCode === "runtime.needsApproval") {
				throw new RuntimeApprovalRequiredError(
					result.error || "runtime-policy-needs-approval",
					result.errorCode,
				);
			}
			throw new Error(result.error || "Tool call failed");
		}
		return result.data;
	};
}
