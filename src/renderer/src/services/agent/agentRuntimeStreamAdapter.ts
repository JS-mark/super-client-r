import type { AgentRuntimeStreamEvent } from "@super-client/shared-types/agent-runtime";
import type { AgentToolBinding } from "@super-client/shared-types/agent-runtime";
import {
	reduceAgentRuntimeStreamEvent,
	type AgentEventReducerAction,
	type AgentEventReducerContext,
} from "../../hooks/useAgentEventReducer";

export type AgentRuntimeEventAdapterContext = AgentEventReducerContext;
export type AgentRuntimeEventReducerAction = AgentEventReducerAction;

export interface AgentRuntimeMcpToolSource {
	serverId: string;
	tool: {
		name: string;
		description: string;
		inputSchema: Record<string, unknown>;
	};
}

export interface AgentRuntimeSkillToolSource {
	skillId: string;
	tool: {
		name: string;
		description: string;
		inputSchema: Record<string, unknown>;
	};
}

export interface BuildAgentRuntimeToolBindingsInput {
	mcpTools: AgentRuntimeMcpToolSource[];
	connectedMcpServerIds: string[];
	skillTools?: AgentRuntimeSkillToolSource[];
	activeSkillId?: string;
}

function sanitizeToolPrefix(id: string): string {
	return id.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function buildAgentRuntimePromptText(
	prompt: string,
	customSystemPrompt?: string,
): string {
	const trimmedSystemPrompt = customSystemPrompt?.trim();
	if (!trimmedSystemPrompt) return prompt;
	return `${trimmedSystemPrompt}\n\n--- User Request ---\n${prompt}`;
}

export function buildAgentRuntimeToolBindings({
	mcpTools,
	connectedMcpServerIds,
	skillTools = [],
	activeSkillId,
}: BuildAgentRuntimeToolBindingsInput): AgentToolBinding[] {
	const connected = new Set(connectedMcpServerIds);
	const bindings: AgentToolBinding[] = [];

	for (const { serverId, tool } of mcpTools) {
		if (!connected.has(serverId)) continue;
		bindings.push({
			name: `${sanitizeToolPrefix(serverId)}__${tool.name}`,
			description: tool.description,
			inputSchema: tool.inputSchema,
			origin: {
				kind: "mcp",
				serverId,
				realName: tool.name,
			},
		});
	}

	if (activeSkillId) {
		for (const { skillId, tool } of skillTools) {
			if (skillId !== activeSkillId) continue;
			bindings.push({
				name: `skill-${sanitizeToolPrefix(skillId)}__${tool.name}`,
				description: tool.description,
				inputSchema: tool.inputSchema,
				origin: {
					kind: "skill",
					serverId: skillId,
					realName: tool.name,
				},
			});
		}
	}

	return bindings;
}

/**
 * Service-layer alias kept for the runtime client migration.
 * The reducer itself lives in `useAgentEventReducer` so SDK and runtime
 * stream mappings cannot drift.
 */
export function adaptAgentRuntimeStreamEventToReducerActions(
	event: AgentRuntimeStreamEvent,
	context: AgentRuntimeEventAdapterContext,
): AgentRuntimeEventReducerAction[] {
	return reduceAgentRuntimeStreamEvent(event, context);
}
