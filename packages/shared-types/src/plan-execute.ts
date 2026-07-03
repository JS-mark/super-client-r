import type { ApprovalMode, SandboxMode } from "./chat";

export type PlanStepStatus =
	| "pending"
	| "in_progress"
	| "completed"
	| "skipped"
	| "blocked";

export interface PlanStep {
	id: string;
	title: string;
	description?: string;
	status?: PlanStepStatus;
	expectedFiles?: string[];
}

export interface PlanExpectedFileChange {
	path: string;
	operation: "create" | "modify" | "delete" | "rename" | "unknown";
	reason?: string;
}

export interface PlanRequiredApproval {
	id: string;
	title: string;
	reason?: string;
	riskLevel?: "low" | "medium" | "high";
}

export interface PlanSuggestedSubagent {
	id: string;
	name: string;
	task: string;
	reason?: string;
}

export interface PlanCard {
	id: string;
	version: number;
	sourceTurnId: string;
	goal: string;
	summary?: string;
	steps: PlanStep[];
	risks?: string[];
	expectedChangedFiles?: PlanExpectedFileChange[];
	requiredApprovals?: PlanRequiredApproval[];
	requiredContext?: string[];
	suggestedSubagents?: PlanSuggestedSubagent[];
	createdAt?: string;
	updatedAt?: string;
}

export type PlanDecisionAction = "execute" | "cancel" | "regenerate";

interface PlanDecisionBase {
	id?: string;
	sourcePlanId: string;
	sourcePlanVersion: number;
	sourcePlanTurnId: string;
	reason?: string;
	instructions?: string;
	createdAt?: string;
}

export interface PlanExecuteDecision extends PlanDecisionBase {
	action: "execute";
	editedSteps?: PlanStep[];
}

export interface PlanCancelDecision extends PlanDecisionBase {
	action: "cancel";
}

export interface PlanRegenerateDecision extends PlanDecisionBase {
	action: "regenerate";
	editedSteps?: PlanStep[];
}

export type PlanDecision =
	| PlanExecuteDecision
	| PlanCancelDecision
	| PlanRegenerateDecision;

export interface PlanDecisionRecord {
	kind: "plan.decision";
	action: PlanDecisionAction;
	sourcePlanId: string;
	sourcePlanVersion: number;
	sourcePlanTurnId: string;
	decision: PlanDecision;
	createdAt: string;
}

export interface ExecuteTurnContext {
	kind: "execute-from-plan";
	sourcePlanId: string;
	sourcePlanVersion: number;
	sourcePlanTurnId: string;
	goal: string;
	summary?: string;
	steps: PlanStep[];
	risks: string[];
	expectedChangedFiles: PlanExpectedFileChange[];
	requiredApprovals: PlanRequiredApproval[];
	requiredContext: string[];
	suggestedSubagents: PlanSuggestedSubagent[];
	decision: PlanExecuteDecision;
	approvalMode?: ApprovalMode;
	sandboxMode?: SandboxMode;
}

export interface PlanExecuteTurnLink {
	kind: "plan.execute-turn-link";
	sourcePlanId: string;
	sourcePlanVersion: number;
	sourcePlanTurnId: string;
	decisionId?: string;
	userMessageId?: string;
	assistantMessageId?: string;
	prompt: string;
	context: ExecuteTurnContext;
	createdAt: string;
}
