import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildAgentDefinitionsFromTeam,
	buildAgentSystemPromptWithSkillContext,
} from "../usePromptContextBuilder";
import type {
	AgentProfile,
	AgentTeam,
} from "@super-client/shared-types/agent-sdk";

describe("prompt context builder helpers", () => {
	beforeEach(() => {
		window.electron = {
			...window.electron,
			log: {
				...window.electron?.log,
				rendererLog: vi.fn(),
			},
		} as typeof window.electron;
	});

	it("uses session system prompt before model system prompt", () => {
		const prompt = buildAgentSystemPromptWithSkillContext({
			sessionSystemPrompt: "session rules",
			modelSystemPrompt: "model rules",
			modelIdentity: { name: "Agent Model", id: "agent-model" },
		});

		expect(prompt).toContain("session rules");
		expect(prompt).not.toContain("model rules");
		expect(prompt).toContain("Agent Model");
	});

	it("appends trimmed skill context after the base system prompt", () => {
		const prompt = buildAgentSystemPromptWithSkillContext({
			modelSystemPrompt: "base rules",
			skillContext: "  skill-specific rules  ",
		});

		expect(prompt).toContain("base rules");
		expect(prompt).toContain("--- Skill Context ---\nskill-specific rules");
		expect(prompt).not.toContain("  skill-specific rules  ");
	});

	it("maps selected team profile ids to Agent SDK agent definitions in order", () => {
		const profiles: AgentProfile[] = [
			{
				id: "reviewer",
				name: "Reviewer",
				description: "reviews code",
				prompt: "review prompt",
				tools: ["read"],
				disallowedTools: ["write"],
				model: "model-a",
				maxTurns: 3,
			},
			{
				id: "tester",
				name: "Tester",
				description: "tests code",
				prompt: "test prompt",
			},
		];
		const team: AgentTeam = {
			id: "team",
			name: "Team",
			description: "A team",
			agents: ["tester", "missing", "reviewer"],
		};

		const agents = buildAgentDefinitionsFromTeam(profiles, team);

		expect(Object.keys(agents ?? {})).toEqual(["Tester", "Reviewer"]);
		expect(agents?.Tester).toMatchObject({
			description: "tests code",
			prompt: "test prompt",
		});
		expect(agents?.Reviewer).toMatchObject({
			description: "reviews code",
			prompt: "review prompt",
			tools: ["read"],
			disallowedTools: ["write"],
			model: "model-a",
			maxTurns: 3,
		});
	});

	it("returns undefined when no selected team profiles can be resolved", () => {
		expect(
			buildAgentDefinitionsFromTeam([], {
				id: "team",
				name: "Team",
				description: "A team",
				agents: ["missing"],
			}),
		).toBeUndefined();
		expect(buildAgentDefinitionsFromTeam([], undefined)).toBeUndefined();
	});
});
