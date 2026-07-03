import { describe, expect, it } from "vitest";
import {
	AGENT_COMPOSER_MODE_LABEL,
	toAgentComposerMode,
	toPlanModeFromAgentComposerMode,
} from "../planModePresentation";
import type { PlanMode } from "@super-client/shared-types/chat";

describe("plan mode presentation", () => {
	it("presents legacy/internal execute modes as Execute", () => {
		const executeModes: PlanMode[] = [
			"chat",
			"auto-execute-safe",
			"full-agent",
		];

		for (const mode of executeModes) {
			expect(toAgentComposerMode(mode)).toBe("execute");
		}
		expect(AGENT_COMPOSER_MODE_LABEL.execute).toBe("Execute");
	});

	it("presents planning modes as Plan", () => {
		expect(toAgentComposerMode("plan-only")).toBe("plan");
		expect(toAgentComposerMode("plan-then-ask")).toBe("plan");
		expect(AGENT_COMPOSER_MODE_LABEL.plan).toBe("Plan");
	});

	it("maps UI choices back to compatibility PlanMode values", () => {
		expect(toPlanModeFromAgentComposerMode("plan")).toBe("plan-then-ask");
		expect(toPlanModeFromAgentComposerMode("execute")).toBe("chat");
	});
});
