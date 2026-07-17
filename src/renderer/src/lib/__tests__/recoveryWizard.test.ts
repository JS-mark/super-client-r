import { describe, expect, it } from "vitest";
import { buildRecoveryWizardModel } from "../recoveryWizard";

describe("buildRecoveryWizardModel", () => {
	it("recommends archived before orphan before legacy before exports", () => {
		const archived = buildRecoveryWizardModel({
			archivedCount: 1,
			orphanCount: 2,
			legacyCount: 3,
			legacyAlreadyImported: false,
			exportableProjectCount: 1,
			exportableSessionCount: 1,
		});
		expect(archived.recommendedStepId).toBe("archived");

		const orphan = buildRecoveryWizardModel({
			archivedCount: 0,
			orphanCount: 2,
			legacyCount: 3,
			legacyAlreadyImported: false,
			exportableProjectCount: 1,
			exportableSessionCount: 1,
		});
		expect(orphan.recommendedStepId).toBe("orphans");

		const legacy = buildRecoveryWizardModel({
			archivedCount: 0,
			orphanCount: 0,
			legacyCount: 3,
			legacyAlreadyImported: false,
			exportableProjectCount: 1,
			exportableSessionCount: 1,
		});
		expect(legacy.recommendedStepId).toBe("legacy");
	});

	it("recommends exports when there are no recoverable items", () => {
		const model = buildRecoveryWizardModel({
			archivedCount: 0,
			orphanCount: 0,
			legacyCount: 0,
			legacyAlreadyImported: false,
			exportableProjectCount: 1,
			exportableSessionCount: 2,
		});
		expect(model.hasRecoveryAction).toBe(false);
		expect(model.recommendedStepId).toBe("exports");
		expect(model.steps.find((step) => step.id === "exports")).toMatchObject({
			status: "action",
			count: 3,
		});
	});

	it("does not carry path-like data in the wizard model", () => {
		const model = buildRecoveryWizardModel({
			archivedCount: 0,
			orphanCount: 1,
			legacyCount: 0,
			legacyAlreadyImported: false,
			exportableProjectCount: 0,
			exportableSessionCount: 0,
		});
		expect(JSON.stringify(model)).not.toContain("/Users/");
		expect(JSON.stringify(model)).not.toContain("\\");
	});
});
