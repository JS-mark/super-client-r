import { describe, expect, it } from "vitest";
import type { Message } from "@super-client/shared-types/chat";
import type { PlanCard } from "@super-client/shared-types/plan-execute";
import {
	createExecuteTurnContext,
	createExecuteTurnPrompt,
	createPlanDecisionRecord,
	createPlanDecisionPayload,
	createPlanExecuteTurnLink,
	createRegeneratePlanPrompt,
	findPlanExecuteTurnMessageIds,
} from "../planExecute";

const basePlan: PlanCard = {
	id: "plan-123",
	version: 2,
	sourceTurnId: "turn-plan-1",
	goal: "Add keyboard support to the approval area",
	summary: "Wire accessible keyboard handling without changing the composer.",
	steps: [
		{
			id: "step-1",
			title: "Read existing approval components",
			description: "Confirm current blocking composer behavior.",
		},
		{
			id: "step-2",
			title: "Add focused tests",
			description: "Cover keyboard decisions.",
		},
	],
	risks: ["Do not regress AskUserQuestion input handling."],
	expectedChangedFiles: [
		{
			path: "src/renderer/src/components/chat/ApprovalDecisionCard.tsx",
			operation: "modify",
			reason: "Keyboard handling belongs near approval controls.",
		},
	],
	requiredApprovals: [
		{
			id: "approval-1",
			title: "Run renderer tests",
			riskLevel: "low",
		},
	],
	requiredContext: ["Current pending approval state"],
	suggestedSubagents: [
		{
			id: "subagent-1",
			name: "QA",
			task: "Review keyboard coverage",
		},
	],
};

describe("plan execute helpers", () => {
	it("builds an execute turn from edited steps without mutating the source plan", () => {
		const editedSteps = [
			basePlan.steps[0],
			{
				id: "step-2",
				title: "Add focused renderer helper tests",
				description: "Cover edited step execution.",
			},
		];

		const context = createExecuteTurnContext(basePlan, {
			editedSteps,
			instructions: "Keep the change out of useChat.",
		});
		const prompt = createExecuteTurnPrompt(basePlan, {
			editedSteps,
			instructions: "Keep the change out of useChat.",
		});

		expect(context).toMatchObject({
			kind: "execute-from-plan",
			sourcePlanId: "plan-123",
			sourcePlanVersion: 2,
			sourcePlanTurnId: "turn-plan-1",
		});
		expect(context.steps).toHaveLength(2);
		expect(context.steps[1]?.title).toBe("Add focused renderer helper tests");
		expect(basePlan.steps[1]?.title).toBe("Add focused tests");
		expect(context.steps).not.toBe(basePlan.steps);
		expect(prompt).toContain("Source plan: plan-123 v2");
		expect(prompt).toContain("2. Add focused renderer helper tests");
		expect(prompt).toContain("User instructions: Keep the change out of useChat.");
	});

	it("creates a cancel decision payload that preserves the source plan identity", () => {
		const decision = createPlanDecisionPayload(basePlan, {
			action: "cancel",
			reason: "User decided not to proceed.",
			id: "decision-cancel-1",
		});

		expect(decision).toEqual({
			id: "decision-cancel-1",
			action: "cancel",
			sourcePlanId: "plan-123",
			sourcePlanVersion: 2,
			sourcePlanTurnId: "turn-plan-1",
			reason: "User decided not to proceed.",
			instructions: undefined,
			createdAt: undefined,
		});
	});

	it("creates a regenerate decision payload that preserves sourcePlanId and version", () => {
		const decision = createPlanDecisionPayload(basePlan, {
			action: "regenerate",
			instructions: "Split tests and implementation into separate steps.",
		});

		expect(decision.action).toBe("regenerate");
		expect(decision.sourcePlanId).toBe("plan-123");
		expect(decision.sourcePlanVersion).toBe(2);
		expect(decision.sourcePlanTurnId).toBe("turn-plan-1");
		expect(decision.instructions).toBe(
			"Split tests and implementation into separate steps.",
		);
	});

	it("rejects cancel and regenerate decisions when creating an execute prompt", () => {
		const cancelDecision = createPlanDecisionPayload(basePlan, {
			action: "cancel",
		});
		const regenerateDecision = createPlanDecisionPayload(basePlan, {
			action: "regenerate",
		});

		expect(() => createExecuteTurnPrompt(basePlan, cancelDecision)).toThrow(
			"Cannot create an execute turn from a cancel decision.",
		);
		expect(() => createExecuteTurnContext(basePlan, regenerateDecision)).toThrow(
			"Cannot create an execute turn from a regenerate decision.",
		);
	});

	it("creates a replayable decision record and execute turn link", () => {
		const decision = createPlanDecisionPayload(basePlan, {
			action: "execute",
			id: "decision-execute-1",
			editedSteps: [
				{
					id: "step-1",
					title: "Read current PlanCard wiring",
				},
			],
		});
		expect(decision.action).toBe("execute");
		if (decision.action !== "execute") return;

		const record = createPlanDecisionRecord(
			basePlan,
			decision,
			"2026-06-30T00:00:00.000Z",
		);
		const link = createPlanExecuteTurnLink(basePlan, decision, {
			prompt: "Execute prompt",
			userMessageId: "user-execute-1",
			assistantMessageId: "assistant-execute-1",
			createdAt: record.createdAt,
		});

		expect(record).toMatchObject({
			kind: "plan.decision",
			action: "execute",
			sourcePlanId: "plan-123",
			sourcePlanVersion: 2,
			sourcePlanTurnId: "turn-plan-1",
			createdAt: "2026-06-30T00:00:00.000Z",
		});
		expect(link).toMatchObject({
			kind: "plan.execute-turn-link",
			sourcePlanId: "plan-123",
			sourcePlanVersion: 2,
			sourcePlanTurnId: "turn-plan-1",
			decisionId: "decision-execute-1",
			userMessageId: "user-execute-1",
			assistantMessageId: "assistant-execute-1",
			prompt: "Execute prompt",
			createdAt: "2026-06-30T00:00:00.000Z",
		});
		expect(link.context).toMatchObject({
			kind: "execute-from-plan",
			decision: {
				id: "decision-execute-1",
				action: "execute",
			},
		});
	});

	it("builds a regenerate prompt from the formal decision payload", () => {
		const decision = createPlanDecisionPayload(basePlan, {
			action: "regenerate",
			editedSteps: [
				{
					id: "step-1",
					title: "Split the execute contract and UI wiring",
					description: "Keep useChat changes out of scope.",
				},
			],
			instructions: "Make the new plan smaller.",
		});
		expect(decision.action).toBe("regenerate");
		if (decision.action !== "regenerate") return;

		const prompt = createRegeneratePlanPrompt(basePlan, decision);

		expect(prompt).toContain("Regenerate the plan as a new plan turn.");
		expect(prompt).toContain("Source plan: plan-123 v2");
		expect(prompt).toContain(
			"1. Split the execute contract and UI wiring - Keep useChat changes out of scope.",
		);
		expect(prompt).toContain("User instructions: Make the new plan smaller.");
	});

	it("finds the message ids created for a plan execute turn", () => {
		const before: Message[] = [
			{
				id: "assistant-plan",
				role: "assistant",
				content: "",
				timestamp: 1000,
			},
		];
		const after: Message[] = [
			...before,
			{
				id: "user-execute-1",
				role: "user",
				content: "Execute prompt",
				timestamp: 1001,
			},
			{
				id: "assistant-execute-1",
				role: "assistant",
				content: "",
				timestamp: 1002,
			},
		];

		expect(findPlanExecuteTurnMessageIds(before, after)).toEqual({
			userMessageId: "user-execute-1",
			assistantMessageId: "assistant-execute-1",
		});
	});
});
