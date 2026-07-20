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

	it("assigns a distinct actionKind to every step so the panel can render per-step actions", () => {
		const model = buildRecoveryWizardModel({
			archivedCount: 1,
			orphanCount: 1,
			legacyCount: 1,
			legacyAlreadyImported: false,
			exportableProjectCount: 1,
			exportableSessionCount: 1,
		});
		const byId = Object.fromEntries(model.steps.map((step) => [step.id, step]));
		expect(byId.refresh.actionKind).toBe("refresh");
		expect(byId.archived.actionKind).toBe("restore-archived");
		expect(byId.orphans.actionKind).toBe("restore-orphan");
		expect(byId.legacy.actionKind).toBe("import-legacy");
		expect(byId.exports.actionKind).toBe("export-diagnostics");
		// No step carries the "none" sentinel in this model (all have a real action).
		expect(model.steps.every((step) => step.actionKind !== "none")).toBe(true);
	});

	it("keeps actionKind stable regardless of step status (done steps still declare their action)", () => {
		// A "done" archived step (count 0) still carries actionKind so the panel
		// can show what action *would* apply if items reappeared after a refresh.
		const model = buildRecoveryWizardModel({
			archivedCount: 0,
			orphanCount: 0,
			legacyCount: 0,
			legacyAlreadyImported: false,
			exportableProjectCount: 0,
			exportableSessionCount: 0,
		});
		const archived = model.steps.find((step) => step.id === "archived");
		expect(archived?.status).toBe("done");
		expect(archived?.actionKind).toBe("restore-archived");
	});
});
