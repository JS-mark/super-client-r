import { describe, expect, it } from "vitest";
import type { Message, SubagentMessagePart } from "@super-client/shared-types/chat";
import type {
	SubagentRunSummary,
	SubagentTaskStatus,
} from "@super-client/shared-types/subagent";
import { buildSubagentsInspectorData } from "../useSubagentsInspectorData";

function makeSubagentPart(
	run: Partial<SubagentRunSummary> &
		Pick<SubagentRunSummary, "subagentRunId" | "taskGoal" | "status" | "startedAt">,
): SubagentMessagePart {
	return {
		id: `part-${run.subagentRunId}`,
		type: "subagent",
		run: {
			parentRunId: "parent-1",
			...run,
		},
	} as SubagentMessagePart;
}

function makeAssistantWithParts(
	id: string,
	parts: SubagentMessagePart[],
	timestamp = 0,
): Message {
	return {
		id,
		role: "assistant",
		content: "",
		timestamp,
		parts,
	} as unknown as Message;
}

describe("buildSubagentsInspectorData", () => {
	it("returns an empty list when there are no messages", () => {
		expect(buildSubagentsInspectorData([])).toEqual([]);
	});

	it("returns an empty list when no assistant message has subagent parts", () => {
		const messages: Message[] = [
			{ id: "u1", role: "user", content: "hi", timestamp: 1 } as Message,
			{ id: "a1", role: "assistant", content: "hello", timestamp: 2 } as Message,
		];
		expect(buildSubagentsInspectorData(messages)).toEqual([]);
	});

	it("extracts a single subagent part into a single entry with correct fields", () => {
		const parts = [
			makeSubagentPart({
				subagentRunId: "sr-1",
				profileName: "researcher",
				taskGoal: "Investigate the crash",
				status: "running" as SubagentTaskStatus,
				startedAt: 100,
				toolCallCount: 3,
			}),
		];
		const messages = [makeAssistantWithParts("a1", parts)];
		const entries = buildSubagentsInspectorData(messages);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			subagentRunId: "sr-1",
			profileName: "researcher",
			taskGoal: "Investigate the crash",
			status: "running",
			toolCallCount: 3,
			startedAt: 100,
			endedAt: undefined,
			hasError: false,
		});
	});

	it("sorts multiple entries across messages by startedAt desc", () => {
		const messages: Message[] = [
			makeAssistantWithParts("a1", [
				makeSubagentPart({
					subagentRunId: "sr-old",
					taskGoal: "old",
					status: "completed",
					startedAt: 100,
					endedAt: 200,
				}),
			]),
			makeAssistantWithParts("a2", [
				makeSubagentPart({
					subagentRunId: "sr-new",
					taskGoal: "new",
					status: "running",
					startedAt: 500,
				}),
				makeSubagentPart({
					subagentRunId: "sr-mid",
					taskGoal: "mid",
					status: "spawned",
					startedAt: 300,
				}),
			]),
		];
		const entries = buildSubagentsInspectorData(messages);
		expect(entries.map((e) => e.subagentRunId)).toEqual([
			"sr-new",
			"sr-mid",
			"sr-old",
		]);
	});

	it("marks failed status as hasError:true", () => {
		const parts = [
			makeSubagentPart({
				subagentRunId: "sr-fail",
				taskGoal: "Boom",
				status: "failed",
				startedAt: 42,
				endedAt: 60,
			}),
		];
		const entries = buildSubagentsInspectorData([
			makeAssistantWithParts("a1", parts),
		]);
		expect(entries).toHaveLength(1);
		expect(entries[0].hasError).toBe(true);
		expect(entries[0].endedAt).toBe(60);
	});
});
