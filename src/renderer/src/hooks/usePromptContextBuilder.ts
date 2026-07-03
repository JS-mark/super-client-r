import { useCallback } from "react";
import type {
	AgentSDKAgentDefinition,
	AgentProfile,
	AgentTeam,
} from "@super-client/shared-types/agent-sdk";
import { buildSystemPrompt, type EnvInfo } from "../prompt";
import { agentSDKClient } from "../services/agent/agentSDKService";
import { useChatStore } from "../stores/chatStore";
import { useMcpStore } from "../stores/mcpStore";
import type { SearchConfig } from "../types/search";
import { buildAgentPromptWithContext } from "./agentPromptContext";
import type { ProviderModelResolution } from "./useMessageModelResolution";

let cachedEnvInfo: EnvInfo | undefined;

async function getEnvInfo(): Promise<EnvInfo | undefined> {
	if (cachedEnvInfo) return cachedEnvInfo;
	try {
		const res = await window.electron.system.getEnvInfo();
		if (res.success && res.data) {
			cachedEnvInfo = res.data;
			return cachedEnvInfo;
		}
	} catch (err) {
		console.warn("[usePromptContextBuilder] Failed to fetch env info:", err);
	}
	return undefined;
}

async function getEnvInfoForPrompt(
	conversationId: string,
): Promise<EnvInfo | undefined> {
	const envInfo = await getEnvInfo();
	if (!envInfo) return undefined;

	let workspaceDir: string | undefined;
	let projectRoot: string | undefined;

	try {
		const res = await window.electron.cwd.resolveSessionCwd(conversationId);
		if (res.success && res.data) workspaceDir = res.data;
	} catch (err) {
		console.warn("[usePromptContextBuilder] resolveSessionCwd failed:", err);
	}

	try {
		const res = await window.electron.cwd.resolveProjectRoot(conversationId);
		if (res.success && res.data) projectRoot = res.data;
	} catch (err) {
		console.warn("[usePromptContextBuilder] resolveProjectRoot failed:", err);
	}

	return {
		...envInfo,
		...(workspaceDir && { workspaceDir }),
		...(projectRoot && { projectRoot }),
	};
}

export function buildAgentSystemPromptWithSkillContext(input: {
	sessionSystemPrompt?: string;
	modelSystemPrompt?: string;
	envInfo?: EnvInfo;
	modelIdentity?: { name?: string; id?: string };
	skillContext?: string;
}): string {
	const baseSystemPrompt = input.sessionSystemPrompt
		? input.sessionSystemPrompt
		: input.modelSystemPrompt;
	const baseAgentSystemPrompt = buildSystemPrompt(
		baseSystemPrompt,
		input.envInfo,
		input.modelIdentity,
	);
	const skillContext = input.skillContext?.trim();
	return skillContext
		? `${baseAgentSystemPrompt}\n\n--- Skill Context ---\n${skillContext}`
		: baseAgentSystemPrompt;
}

export function buildAgentDefinitionsFromTeam(
	profiles: AgentProfile[],
	team: AgentTeam | undefined,
): Record<string, AgentSDKAgentDefinition> | undefined {
	if (!team || team.agents.length === 0) return undefined;

	const agents: Record<string, AgentSDKAgentDefinition> = {};
	for (const profileId of team.agents) {
		const profile = profiles.find((p) => p.id === profileId);
		if (!profile) continue;
		agents[profile.name] = {
			description: profile.description,
			prompt: profile.prompt,
			tools: profile.tools,
			disallowedTools: profile.disallowedTools,
			model: profile.model,
			maxTurns: profile.maxTurns,
		};
	}
	return Object.keys(agents).length > 0 ? agents : undefined;
}

export interface BuildPromptContextInput {
	requestId: string;
	conversationId?: string | null;
	content: string;
	effective?: ProviderModelResolution;
	sessionSystemPrompt?: string;
	skillContext?: string;
	attachmentIds?: string[];
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
}

export interface BuildPromptContextOutput {
	cwd?: string;
	mcpServerNames: string[];
	customSystemPrompt: string;
	prompt: string;
	attachmentCount: number;
	searchResultCount: number;
	warnings: string[];
	agents?: Record<string, AgentSDKAgentDefinition>;
}

async function resolveTeamAgents(): Promise<
	Record<string, AgentSDKAgentDefinition> | undefined
> {
	const teamId = useChatStore.getState().selectedTeamId;
	if (!teamId) return undefined;

	try {
		const [profiles, teams] = await Promise.all([
			agentSDKClient.getAgentProfiles(),
			agentSDKClient.getAgentTeams(),
		]);
		const team = teams.find((t) => t.id === teamId);
		return buildAgentDefinitionsFromTeam(profiles, team);
	} catch {
		return undefined;
	}
}

export function usePromptContextBuilder() {
	const buildPromptContext = useCallback(
		async (input: BuildPromptContextInput): Promise<BuildPromptContextOutput> => {
			let cwd: string | undefined;
			let envInfo: EnvInfo | undefined;
			if (input.conversationId) {
				try {
					envInfo = await getEnvInfoForPrompt(input.conversationId);
					cwd = envInfo?.workspaceDir;
				} catch {
					// non-fatal
				}
			}

			const connectedServers = useMcpStore.getState().getConnectedServers();
			const mcpServerNames = connectedServers.map((s) => s.id);
			const customSystemPrompt = buildAgentSystemPromptWithSkillContext({
				sessionSystemPrompt: input.sessionSystemPrompt,
				modelSystemPrompt: input.effective?.model.systemPrompt,
				envInfo,
				modelIdentity: {
					name: input.effective?.model.name,
					id: input.effective?.model.id,
				},
				skillContext: input.skillContext,
			});
			const agents = await resolveTeamAgents();
			const promptContext = await buildAgentPromptWithContext({
				conversationId: input.conversationId,
				content: input.content,
				attachmentIds: input.attachmentIds,
				searchEngine: input.searchEngine,
				searchConfigs: input.searchConfigs,
			});

			return {
				cwd,
				mcpServerNames,
				customSystemPrompt,
				prompt: promptContext.prompt,
				attachmentCount: promptContext.attachmentCount,
				searchResultCount: promptContext.searchResultCount,
				warnings: promptContext.warnings,
				agents,
			};
		},
		[],
	);

	return { buildPromptContext };
}
