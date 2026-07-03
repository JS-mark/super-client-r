/**
 * useAvailableToolsCatalog — loads the "available tools" list used by the
 * session-settings panel (builtin facade + connected MCP + active skill).
 *
 * Extracted from `useChat.ts` (Phase 0b hook slim-down). Previously an
 * inline `useState + useEffect` at the top of `useChat`; the effect refetched
 * on `selectedSkillId` change and set local state.
 *
 * Contract:
 *   1. Fetches builtin tools, all MCP tools, and (if a skill is active) the
 *      active skill's tools — merges into a single flat list keyed by
 *      `prefixedName`.
 *   2. Each subsource failure is non-fatal (returns `[]`); the effect
 *      NEVER throws.
 *   3. When `selectedSkillId` is `null`/`undefined`/empty, skill tools are
 *      skipped entirely.
 *   4. Deduplicates by `prefixedName` — first source wins.
 *   5. If `selectedSkillId` changes while a fetch is in flight, the stale
 *      result is discarded (no writes to state).
 */
import { useEffect, useState } from "react";
import { agentRuntimeClient } from "../services/agent/agentRuntimeClient";
import { mcpClient } from "../services/mcp/mcpService";
import { skillClient } from "../services/skill/skillService";

export type AvailableToolSource = "builtin" | "mcp" | "skill";

export interface AvailableToolEntry {
	prefixedName: string;
	displayName: string;
	source: AvailableToolSource;
}

/**
 * Convert an MCP serverId to a legal OpenAI function-name prefix.
 * OpenAI requires `^[a-zA-Z0-9_-]+$`; e.g. `@scp/fetch` → `scp-fetch`.
 * Kept in this module so `useChat` no longer needs to own the helper.
 */
export function sanitizeServerId(serverId: string): string {
	return serverId.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export interface AvailableToolsCatalogSources {
	listBuiltinTools: () => Promise<Array<{ name: string }>>;
	listMcpTools: () => Promise<Array<{ serverId: string; tool: { name: string } }>>;
	listSkillTools: () => Promise<Array<{ skillId: string; tool: { name: string } }>>;
}

const defaultSources: AvailableToolsCatalogSources = {
	listBuiltinTools: () => agentRuntimeClient.listBuiltinTools(),
	listMcpTools: () => mcpClient.getAllTools(),
	listSkillTools: () => skillClient.getAllTools(),
};

/**
 * Pure loader — deterministic given a set of sources. Tests target this
 * function directly; the React hook is a thin wrapper.
 */
export async function loadAvailableToolsCatalog(
	selectedSkillId: string | null | undefined,
	sources: AvailableToolsCatalogSources = defaultSources,
): Promise<AvailableToolEntry[]> {
	const tools: AvailableToolEntry[] = [];
	const seen = new Set<string>();

	const push = (entry: AvailableToolEntry): void => {
		if (seen.has(entry.prefixedName)) return;
		seen.add(entry.prefixedName);
		tools.push(entry);
	};

	// 1) Builtin facade tools (Read/Write/Edit/Bash/Grep/Glob/WebFetch/Task)
	//    injected by ClaudeCodeAgentRuntime. The LLM calls these by their bare
	//    facade name (e.g. "Read"), so authorizedTools[] also stores the bare
	//    name — no `serverId__tool` prefix.
	try {
		const builtinTools = await sources.listBuiltinTools();
		for (const bt of builtinTools) {
			push({ prefixedName: bt.name, displayName: bt.name, source: "builtin" });
		}
	} catch {
		// Builtin tools loading failure is non-fatal.
	}

	// 2) MCP tools (prefixed by sanitized serverId).
	try {
		const mcpTools = await sources.listMcpTools();
		for (const { serverId, tool } of mcpTools) {
			const safePrefix = sanitizeServerId(serverId);
			push({
				prefixedName: `${safePrefix}__${tool.name}`,
				displayName: tool.name,
				source: "mcp",
			});
		}
	} catch {
		// MCP tool loading failure is non-fatal.
	}

	// 3) Active skill's tools (prefixed by `skill-{skillId}__`).
	if (selectedSkillId) {
		try {
			const skillTools = await sources.listSkillTools();
			const filtered = skillTools.filter((t) => t.skillId === selectedSkillId);
			for (const { skillId, tool } of filtered) {
				push({
					prefixedName: `skill-${skillId}__${tool.name}`,
					displayName: `${skillId}/${tool.name}`,
					source: "skill",
				});
			}
		} catch {
			// Skill tools loading failure is non-fatal.
		}
	}

	return tools;
}

export interface UseAvailableToolsCatalogOptions {
	/** Override tool sources — primarily for tests. */
	sources?: AvailableToolsCatalogSources;
}

export interface UseAvailableToolsCatalogResult {
	availableTools: AvailableToolEntry[];
}

/**
 * React hook: refetches whenever `selectedSkillId` changes. Late results
 * from a superseded fetch are discarded.
 */
export function useAvailableToolsCatalog(
	selectedSkillId: string | null | undefined,
	options?: UseAvailableToolsCatalogOptions,
): UseAvailableToolsCatalogResult {
	const [availableTools, setAvailableTools] = useState<AvailableToolEntry[]>([]);

	useEffect(() => {
		let cancelled = false;
		const sources = options?.sources ?? defaultSources;
		loadAvailableToolsCatalog(selectedSkillId, sources).then((tools) => {
			if (cancelled) return;
			setAvailableTools(tools);
		});
		return () => {
			cancelled = true;
		};
		// options.sources is expected to be stable; consumers pass a memoised
		// object or omit it entirely (defaults to the singleton clients).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedSkillId]);

	return { availableTools };
}
