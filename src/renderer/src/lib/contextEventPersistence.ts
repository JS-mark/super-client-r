import {
	createContextCompactedProductEvent,
	type ContextCompactedProductEventContext,
	type ContextCompactedProductEventInput,
} from "@super-client/shared-types/agent-product-events";
import type { SessionEvent } from "@super-client/shared-types/project";

export function createContextCompactedSessionEvents(
	input: ContextCompactedProductEventInput,
	context: ContextCompactedProductEventContext,
): SessionEvent[] {
	const event = createContextCompactedProductEvent(input, context);
	if (event.type !== "context.compacted") return [];
	const { payload } = event;
	return [
		{
			eventId: event.eventId,
			ts: event.ts,
			type: "assistant_message",
			id: payload.summaryMessageId,
			content: payload.summary,
			metadata: {
				contextCompacted: {
					compacted: true,
					summary: payload.summary,
					originalCount: payload.originalCount,
					compactedAt: payload.compactedAt,
				},
				contextStrategy: payload.strategy,
			},
		},
	];
}
