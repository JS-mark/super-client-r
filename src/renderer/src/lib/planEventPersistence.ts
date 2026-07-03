import {
	createExecuteTurnCreatedProductEvent,
	createPlanDecisionProductEvent,
	type AgentProductEvent,
	type PlanProductEventContext,
} from "@super-client/shared-types/agent-product-events";
import type { SessionEvent } from "@super-client/shared-types/project";
import type {
	PlanDecisionRecord,
	PlanExecuteTurnLink,
} from "@super-client/shared-types/plan-execute";

export function createPlanDecisionSessionEvents(
	record: PlanDecisionRecord,
	context: PlanProductEventContext,
	link?: PlanExecuteTurnLink,
): SessionEvent[] {
	const events = [createPlanDecisionProductEvent(record, context)];
	if (link) {
		events.push(createExecuteTurnCreatedProductEvent(link, context));
	}
	return events.flatMap(materializePlanProductEvent);
}

function materializePlanProductEvent(event: AgentProductEvent): SessionEvent[] {
	const base = {
		eventId: event.eventId,
		ts: event.ts,
	};

	switch (event.type) {
		case "plan.decision":
			return [
				{
					...base,
					type: "session_marker",
					key: "plan.decision",
					value: {
						action: event.payload.record.action,
						sourcePlanId: event.payload.record.sourcePlanId,
						sourcePlanVersion: event.payload.record.sourcePlanVersion,
						sourcePlanTurnId: event.payload.record.sourcePlanTurnId,
						decision: event.payload.record.decision,
						record: event.payload.record,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
						turnId: event.turnId,
					},
				},
			];
		case "execute.turn.created":
			return [
				{
					...base,
					type: "session_marker",
					key: "execute.turn.created",
					value: {
						sourcePlanId: event.payload.link.sourcePlanId,
						sourcePlanVersion: event.payload.link.sourcePlanVersion,
						sourcePlanTurnId: event.payload.link.sourcePlanTurnId,
						decisionId: event.payload.link.decisionId,
						userMessageId: event.payload.link.userMessageId,
						assistantMessageId: event.payload.link.assistantMessageId,
						link: event.payload.link,
						status: event.status,
						runId: event.runId,
						requestId: event.requestId,
						turnId: event.turnId,
					},
				},
			];
		default:
			return [];
	}
}
