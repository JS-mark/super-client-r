export type RecoveryWizardStepId =
	| "refresh"
	| "archived"
	| "orphans"
	| "legacy"
	| "exports";

export type RecoveryWizardStepStatus = "ready" | "action" | "done";

export interface RecoveryWizardStep {
	id: RecoveryWizardStepId;
	status: RecoveryWizardStepStatus;
	count?: number;
}

export interface RecoveryWizardModel {
	steps: RecoveryWizardStep[];
	recommendedStepId: RecoveryWizardStepId;
	hasRecoveryAction: boolean;
}

export function buildRecoveryWizardModel(input: {
	archivedCount: number;
	orphanCount: number;
	legacyCount: number;
	legacyAlreadyImported: boolean;
	exportableProjectCount: number;
	exportableSessionCount: number;
}): RecoveryWizardModel {
	const hasLegacyToImport =
		input.legacyCount > 0 && !input.legacyAlreadyImported;
	const hasExportable =
		input.exportableProjectCount > 0 || input.exportableSessionCount > 0;
	const steps: RecoveryWizardStep[] = [
		{ id: "refresh", status: "ready" },
		{
			id: "archived",
			status: input.archivedCount > 0 ? "action" : "done",
			count: input.archivedCount,
		},
		{
			id: "orphans",
			status: input.orphanCount > 0 ? "action" : "done",
			count: input.orphanCount,
		},
		{
			id: "legacy",
			status: hasLegacyToImport ? "action" : "done",
			count: input.legacyCount,
		},
		{
			id: "exports",
			status: hasExportable ? "action" : "ready",
			count: input.exportableProjectCount + input.exportableSessionCount,
		},
	];
	const recommended =
		steps.find((step) => step.status === "action") ??
		steps.find((step) => step.id === "exports") ??
		steps[0];
	return {
		steps,
		recommendedStepId: recommended.id,
		hasRecoveryAction: steps.some(
			(step) =>
				step.status === "action" &&
				(step.id === "archived" ||
					step.id === "orphans" ||
					step.id === "legacy"),
		),
	};
}
