import { describe, expect, it } from "vitest";
import type { PlanCard } from "@super-client/shared-types/plan-execute";
import {
	createPlanDecisionRecord,
	createPlanDecisionPayload,
	createPlanExecuteTurnLink,
} from "../planExecute";
import { createPlanDecisionSessionEvents } from "../planEventPersistence";

const plan: PlanCard = {
	id: "plan-1",
	version: 3,
	sourceTurnId: "assistant-plan-1",
	goal: "Refactor agent run state",
	steps: [{ id: "s1", title: "Extract controller" }],
};

describe("plan event persistence", () => {
	it("materializes a plan decision as a replayable session marker", () => {
		const decision = createPlanDecisionPayload(plan, {
			action: "cancel",
			id: "decision-cancel-1",
			reason: "Not now",
		});
		const record = createPlanDecisionRecord(
			plan,
			decision,
			"2026-06-30T00:00:00.000Z",
		);

		const events = createPlanDecisionSessionEvents(record, {
			sessionId: "session-1",
			eventIdPrefix: "plan-test",
		});

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "session_marker",
			key: "plan.decision",
			eventId:
				"plan-test:plan.decision:plan-1:3:cancel:decision-cancel-1",
			value: {
				action: "cancel",
				sourcePlanId: "plan-1",
				sourcePlanVersion: 3,
				sourcePlanTurnId: "assistant-plan-1",
				status: "stopped",
			},
		});
	});

	it("materializes an execute decision and execute turn link", () => {
		const decision = createPlanDecisionPayload(plan, {
			action: "execute",
			id: "decision-execute-1",
		});
		expect(decision.action).toBe("execute");
		if (decision.action !== "execute") return;

		const record = createPlanDecisionRecord(
			plan,
			decision,
			"2026-06-30T00:00:00.000Z",
		);
		const link = createPlanExecuteTurnLink(plan, decision, {
			prompt: "Execute prompt",
			userMessageId: "user-execute-1",
			assistantMessageId: "assistant-execute-1",
			createdAt: record.createdAt,
		});

		const events = createPlanDecisionSessionEvents(
			record,
			{
				sessionId: "session-1",
				eventIdPrefix: "plan-test",
			},
			link,
		);

		expect(events.map((event) => event.type)).toEqual([
			"session_marker",
			"session_marker",
		]);
		expect(events.map((event) => "key" in event && event.key)).toEqual([
			"plan.decision",
			"execute.turn.created",
		]);
		expect(events[1]).toMatchObject({
			eventId:
				"plan-test:execute.turn.created:plan-1:3:decision-execute-1:user-execute-1:assistant-execute-1",
			value: {
				sourcePlanId: "plan-1",
				sourcePlanVersion: 3,
				sourcePlanTurnId: "assistant-plan-1",
				decisionId: "decision-execute-1",
				userMessageId: "user-execute-1",
				assistantMessageId: "assistant-execute-1",
			},
		});
	});
});
