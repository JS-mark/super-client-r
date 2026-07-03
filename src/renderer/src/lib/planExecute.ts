import type {
	ExecuteTurnContext,
	PlanCard,
	PlanDecision,
	PlanDecisionAction,
	PlanDecisionRecord,
	PlanExpectedFileChange,
	PlanExecuteTurnLink,
	PlanExecuteDecision,
	PlanRegenerateDecision,
	PlanRequiredApproval,
	PlanSuggestedSubagent,
	PlanStep,
} from "@super-client/shared-types/plan-execute";
import type { Message } from "@super-client/shared-types/chat";

export interface PlanDecisionInput {
	action: PlanDecisionAction;
	editedSteps?: PlanStep[];
	reason?: string;
	instructions?: string;
	id?: string;
	createdAt?: string;
}

export interface ExecutePromptInput {
	editedSteps?: PlanStep[];
	instructions?: string;
	decisionId?: string;
	createdAt?: string;
}

export interface PlanExecuteTurnLinkInput {
	prompt?: string;
	context?: ExecuteTurnContext;
	userMessageId?: string;
	assistantMessageId?: string;
	createdAt?: string;
}

export interface PlanExecuteTurnMessageIds {
	userMessageId?: string;
	assistantMessageId?: string;
}

export function createPlanDecisionPayload(
	plan: PlanCard,
	input: PlanDecisionInput,
): PlanDecision {
	const base = {
		id: input.id,
		sourcePlanId: plan.id,
		sourcePlanVersion: plan.version,
		sourcePlanTurnId: plan.sourceTurnId,
		reason: input.reason,
		instructions: input.instructions,
		createdAt: input.createdAt,
	};

	switch (input.action) {
		case "execute":
			return {
				...base,
				action: "execute",
				editedSteps: cloneSteps(input.editedSteps),
			};
		case "cancel":
			return {
				...base,
				action: "cancel",
			};
		case "regenerate":
			return {
				...base,
				action: "regenerate",
				editedSteps: cloneSteps(input.editedSteps),
			};
	}
}

export function createPlanDecisionRecord(
	plan: PlanCard,
	decision: PlanDecision,
	createdAt = new Date().toISOString(),
): PlanDecisionRecord {
	return {
		kind: "plan.decision",
		action: decision.action,
		sourcePlanId: plan.id,
		sourcePlanVersion: plan.version,
		sourcePlanTurnId: plan.sourceTurnId,
		decision: cloneDecision(decision),
		createdAt,
	};
}

export function createExecuteTurnContext(
	plan: PlanCard,
	decisionOrEdit: PlanDecision | ExecutePromptInput = {},
): ExecuteTurnContext {
	const decision = normalizeExecuteDecision(plan, decisionOrEdit);
	const steps = cloneSteps(decision.editedSteps ?? plan.steps) ?? [];

	return {
		kind: "execute-from-plan",
		sourcePlanId: plan.id,
		sourcePlanVersion: plan.version,
		sourcePlanTurnId: plan.sourceTurnId,
		goal: plan.goal,
		summary: plan.summary,
		steps,
		risks: [...(plan.risks ?? [])],
		expectedChangedFiles: cloneExpectedFiles(plan.expectedChangedFiles),
		requiredApprovals: cloneRequiredApprovals(plan.requiredApprovals),
		requiredContext: [...(plan.requiredContext ?? [])],
		suggestedSubagents: cloneSuggestedSubagents(plan.suggestedSubagents),
		decision,
	};
}

export function createExecuteTurnPrompt(
	plan: PlanCard,
	decisionOrEdit: PlanDecision | ExecutePromptInput = {},
): string {
	const context = createExecuteTurnContext(plan, decisionOrEdit);
	const lines = [
		"Execute the approved plan as a new execute turn.",
		`Source plan: ${context.sourcePlanId} v${context.sourcePlanVersion}`,
		`Source plan turn: ${context.sourcePlanTurnId}`,
		"",
		`Goal: ${context.goal}`,
	];

	if (context.summary) {
		lines.push("", `Plan summary: ${context.summary}`);
	}

	lines.push("", "Steps to execute:");
	for (const [index, step] of context.steps.entries()) {
		lines.push(formatStep(index + 1, step));
	}

	if (context.expectedChangedFiles.length > 0) {
		lines.push("", "Expected changed files:");
		for (const file of context.expectedChangedFiles) {
			const reason = file.reason ? ` - ${file.reason}` : "";
			lines.push(`- ${file.operation}: ${file.path}${reason}`);
		}
	}

	if (context.risks.length > 0) {
		lines.push("", "Known risks:");
		for (const risk of context.risks) {
			lines.push(`- ${risk}`);
		}
	}

	if (context.requiredContext.length > 0) {
		lines.push("", "Required context:");
		for (const item of context.requiredContext) {
			lines.push(`- ${item}`);
		}
	}

	if (context.decision.instructions) {
		lines.push("", `User instructions: ${context.decision.instructions}`);
	}

	return lines.join("\n");
}

export const buildExecutePromptFromPlan = createExecuteTurnPrompt;

export function createRegeneratePlanPrompt(
	plan: PlanCard,
	decision: PlanRegenerateDecision,
): string {
	const lines = [
		"Regenerate the plan as a new plan turn.",
		`Source plan: ${plan.id} v${plan.version}`,
		`Source plan turn: ${plan.sourceTurnId}`,
		"",
		`Goal: ${plan.goal}`,
	];

	if (plan.summary) lines.push("", `Previous summary: ${plan.summary}`);
	if (decision.editedSteps?.length) {
		lines.push("", "User-edited steps to consider:");
		for (const [index, step] of decision.editedSteps.entries()) {
			lines.push(formatStep(index + 1, step));
		}
	}

	if (decision.instructions) {
		lines.push("", `User instructions: ${decision.instructions}`);
	}

	return lines.join("\n");
}

export function createPlanExecuteTurnLink(
	plan: PlanCard,
	decision: PlanExecuteDecision,
	input: PlanExecuteTurnLinkInput = {},
): PlanExecuteTurnLink {
	const context = input.context ?? createExecuteTurnContext(plan, decision);
	const prompt = input.prompt ?? createExecuteTurnPrompt(plan, decision);

	return {
		kind: "plan.execute-turn-link",
		sourcePlanId: plan.id,
		sourcePlanVersion: plan.version,
		sourcePlanTurnId: plan.sourceTurnId,
		...(decision.id ? { decisionId: decision.id } : {}),
		...(input.userMessageId ? { userMessageId: input.userMessageId } : {}),
		...(input.assistantMessageId
			? { assistantMessageId: input.assistantMessageId }
			: {}),
		prompt,
		context,
		createdAt: input.createdAt ?? new Date().toISOString(),
	};
}

export function findPlanExecuteTurnMessageIds(
	before: Message[],
	after: Message[],
): PlanExecuteTurnMessageIds {
	const previousIds = new Set(before.map((message) => message.id));
	const added = after.filter((message) => !previousIds.has(message.id));
	const userMessage = added.find((message) => message.role === "user");
	const assistantMessage = added.find((message) => message.role === "assistant");

	return {
		...(userMessage ? { userMessageId: userMessage.id } : {}),
		...(assistantMessage ? { assistantMessageId: assistantMessage.id } : {}),
	};
}

function normalizeExecuteDecision(
	plan: PlanCard,
	decisionOrEdit: PlanDecision | ExecutePromptInput,
): PlanExecuteDecision {
	if ("action" in decisionOrEdit) {
		if (decisionOrEdit.action !== "execute") {
			throw new Error(
				`Cannot create an execute turn from a ${decisionOrEdit.action} decision.`,
			);
		}

		return {
			...decisionOrEdit,
			sourcePlanId: plan.id,
			sourcePlanVersion: plan.version,
			sourcePlanTurnId: plan.sourceTurnId,
			editedSteps: cloneSteps(decisionOrEdit.editedSteps),
		};
	}

	return {
		id: decisionOrEdit.decisionId,
		action: "execute",
		sourcePlanId: plan.id,
		sourcePlanVersion: plan.version,
		sourcePlanTurnId: plan.sourceTurnId,
		editedSteps: cloneSteps(decisionOrEdit.editedSteps),
		instructions: decisionOrEdit.instructions,
		createdAt: decisionOrEdit.createdAt,
	};
}

function formatStep(index: number, step: PlanStep): string {
	const description = step.description ? ` - ${step.description}` : "";
	return `${index}. ${step.title}${description}`;
}

function cloneSteps(steps: PlanStep[] | undefined): PlanStep[] | undefined {
	return steps?.map((step) => ({
		...step,
		expectedFiles: step.expectedFiles ? [...step.expectedFiles] : undefined,
	}));
}

function cloneDecision(decision: PlanDecision): PlanDecision {
	switch (decision.action) {
		case "execute":
			return {
				...decision,
				editedSteps: cloneSteps(decision.editedSteps),
			};
		case "regenerate":
			return {
				...decision,
				editedSteps: cloneSteps(decision.editedSteps),
			};
		case "cancel":
			return { ...decision };
	}
}

function cloneExpectedFiles(
	files: PlanExpectedFileChange[] | undefined,
): PlanExpectedFileChange[] {
	return files?.map((file) => ({ ...file })) ?? [];
}

function cloneRequiredApprovals(
	approvals: PlanRequiredApproval[] | undefined,
): PlanRequiredApproval[] {
	return approvals?.map((approval) => ({ ...approval })) ?? [];
}

function cloneSuggestedSubagents(
	subagents: PlanSuggestedSubagent[] | undefined,
): PlanSuggestedSubagent[] {
	return subagents?.map((subagent) => ({ ...subagent })) ?? [];
}
