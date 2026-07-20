export type RecoveryWizardStepId =
	| "refresh"
	| "archived"
	| "orphans"
	| "legacy"
	| "exports";

export type RecoveryWizardStepStatus = "ready" | "action" | "done";

/**
 * What the wizard panel should do when the user clicks the current step's
 * action button. `"none"` = the step is informational only (no action
 * button rendered). Kept in the model so the panel stays a dumb view that
 * switches on `actionKind` rather than re-deriving per-step behavior.
 */
export type RecoveryWizardActionKind =
	| "none"
	| "refresh"
	| "restore-archived"
	| "restore-orphan"
	| "import-legacy"
	| "export-diagnostics";

export interface RecoveryWizardStep {
	id: RecoveryWizardStepId;
	status: RecoveryWizardStepStatus;
	count?: number;
	actionKind: RecoveryWizardActionKind;
	/** Optional explicit action-button label; falls back to a default per kind. */
	actionLabel?: string;
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
		{ id: "refresh", status: "ready", actionKind: "refresh" },
		{
			id: "archived",
			status: input.archivedCount > 0 ? "action" : "done",
			count: input.archivedCount,
			actionKind: "restore-archived",
		},
		{
			id: "orphans",
			status: input.orphanCount > 0 ? "action" : "done",
			count: input.orphanCount,
			actionKind: "restore-orphan",
		},
		{
			id: "legacy",
			status: hasLegacyToImport ? "action" : "done",
			count: input.legacyCount,
			actionKind: "import-legacy",
		},
		{
			id: "exports",
			status: hasExportable ? "action" : "ready",
			count: input.exportableProjectCount + input.exportableSessionCount,
			actionKind: "export-diagnostics",
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
