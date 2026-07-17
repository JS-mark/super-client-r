import { describe, expect, it } from "vitest";
import { createContextCompactedSessionEvents } from "../contextEventPersistence";

describe("context event persistence", () => {
	it("materializes context.compacted into a replayable assistant message", () => {
		const events = createContextCompactedSessionEvents(
			{
				summaryMessageId: "context-summary-1",
				summary: "Summary of older context",
				originalCount: 4,
				compactedAt: 1782100001000,
				estimatedTokens: 700,
				summarySource: "fallback",
				strategy: {
					mode: "compact",
					strategy: "compact",
					historyCount: 5,
					omittedCount: 4,
					estimatedTokens: 700,
					availableForMessages: 1200,
					compacted: true,
				},
			},
			{
				sessionId: "session-1",
				requestId: "req-1",
				runId: "run-1",
				eventIdPrefix: "context-test",
			},
		);

		expect(events).toEqual([
			{
				type: "assistant_message",
				id: "context-summary-1",
				ts: 1782100001000,
				eventId:
					"context-test:context.compacted:context-summary-1:1782100001000:4",
				content: "Summary of older context",
				metadata: {
					contextCompacted: {
						compacted: true,
						summary: "Summary of older context",
						originalCount: 4,
						compactedAt: 1782100001000,
					},
					contextStrategy: {
						mode: "compact",
						strategy: "compact",
						historyCount: 5,
						omittedCount: 4,
						estimatedTokens: 700,
						availableForMessages: 1200,
						compacted: true,
					},
				},
			},
		]);
	});
});
