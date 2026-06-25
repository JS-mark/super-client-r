/**
 * BuiltinToolRegistry — read-only metadata view of the 8 Claude-Code-style
 * facade tools (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task).
 *
 * After the HTTP-proxy refactor (see commit d18b351), the per-request
 * `getBuiltinTools(ctx)` factory and its module `runtime/tools/index.ts`
 * are gone — the 8 tools now live in the @scp/agent-builtins internal
 * MCP server (`agentBuiltinsServer.ts`) as static `InternalToolDefinition`
 * entries. Their `{name, description, inputSchema}` shape already matches
 * what the renderer needs for the settings → 预授权工具 panel, so this
 * module is now a thin re-export with caching for reference equality.
 *
 * Wire naming on the model side: the agent runtime sends these by their
 * bare names (e.g. `Read`), not the MCP-prefixed `scp-agent-builtins__Read`,
 * because the runtime injects them as facade tools at the OpenAI
 * function-calling layer (see ClaudeCodeAgentRuntime). The renderer's
 * pre-authorization UI matches on the bare name as well.
 */

import {
	AGENT_BUILTIN_TOOL_DEFS,
	AGENT_BUILTIN_TOOL_NAMES,
} from "../../../mcp/internal/servers/agentBuiltinsServer";

export type BuiltinToolName = (typeof AGENT_BUILTIN_TOOL_NAMES)[number];

export interface BuiltinToolMetadata {
	name: BuiltinToolName;
	description: string;
	inputSchema: Record<string, unknown>;
}

let cache: BuiltinToolMetadata[] | null = null;

/**
 * Returns the static metadata for all 8 builtin facade tools. Cached after
 * the first call; the returned array (and its entries) are referentially
 * stable across calls so consumers can rely on `===`.
 */
export function listBuiltinTools(): BuiltinToolMetadata[] {
	if (!cache) {
		cache = AGENT_BUILTIN_TOOL_DEFS.map((d) => ({
			name: d.name as BuiltinToolName,
			description: d.description,
			inputSchema: d.inputSchema,
		}));
	}
	return cache;
}

/**
 * Stable name list re-exported under the legacy symbol so existing
 * call-sites (renderer settings, tests) don't have to learn the new
 * `AGENT_BUILTIN_TOOL_NAMES` alias.
 */
export const BUILTIN_TOOL_NAMES = AGENT_BUILTIN_TOOL_NAMES;
