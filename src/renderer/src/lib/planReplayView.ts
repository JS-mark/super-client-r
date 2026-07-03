import type { PlanDecisionAction } from "@super-client/shared-types/plan-execute";

/**
 * Pure formatter that maps a replay-time plan decision back into a short
 * transcript label ("Plan cancelled", "Plan executed → turn ...", "Plan
 * regenerated (v2)"). Separated from the renderer so it can be exercised
 * without React and reused wherever the same phrasing is needed.
 */
export interface PlanDecisionSummaryInput {
	action: PlanDecisionAction;
	sourcePlanId: string;
	sourcePlanVersion?: number;
	executeTurnUserMessageId?: string;
}

export interface PlanDecisionSummary {
	label: string;
	detail?: string;
}

export function describePlanDecisionSummary(
	input: PlanDecisionSummaryInput,
): PlanDecisionSummary {
	const planRef = formatPlanRef(input.sourcePlanId, input.sourcePlanVersion);

	switch (input.action) {
		case "execute": {
			const parts = [planRef];
			if (input.executeTurnUserMessageId) {
				parts.push(`turn ${input.executeTurnUserMessageId}`);
			}
			return { label: "Plan executed", detail: parts.join(" · ") };
		}
		case "cancel":
			return { label: "Plan cancelled", detail: planRef };
		case "regenerate": {
			const versionPart =
				input.sourcePlanVersion != null
					? ` (v${input.sourcePlanVersion})`
					: "";
			return {
				label: `Plan regenerated${versionPart}`,
				detail: planRef,
			};
		}
	}
}

function formatPlanRef(planId: string, version?: number): string {
	return `plan ${planId}${version != null ? `#${version}` : ""}`;
}
