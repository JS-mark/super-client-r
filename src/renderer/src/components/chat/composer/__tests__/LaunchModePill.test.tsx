import { describe, expect, it } from "vitest";
import { launchModeFromPlanMode } from "../LaunchModePill";

describe("launchModeFromPlanMode", () => {
	it("maps plan planModes to 'plan'", () => {
		expect(launchModeFromPlanMode("plan-then-ask")).toBe("plan");
		expect(launchModeFromPlanMode("plan-only")).toBe("plan");
	});

	it("maps execute-like planModes to 'execute'", () => {
		expect(launchModeFromPlanMode("chat")).toBe("execute");
		expect(launchModeFromPlanMode("auto-execute-safe")).toBe("execute");
		expect(launchModeFromPlanMode("full-agent")).toBe("execute");
	});

	it("defaults to 'execute' when planMode is missing", () => {
		expect(launchModeFromPlanMode(undefined)).toBe("execute");
		expect(launchModeFromPlanMode(null)).toBe("execute");
	});
});
