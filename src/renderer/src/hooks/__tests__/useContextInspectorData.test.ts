import { describe, expect, it } from "vitest";
import type { Message } from "@super-client/shared-types/chat";
import {
	buildContextInspectorData,
	type BuildContextInspectorDataInput,
} from "../useContextInspectorData";
import type { Attachment } from "../../stores/attachmentStore";

function makeUser(
	id: string,
	attachmentIds?: string[],
	extraMetadata?: Record<string, unknown>,
): Message {
	return {
		id,
		role: "user",
		content: "hi",
		timestamp: 1,
		metadata: {
			...(attachmentIds ? { attachmentIds } : {}),
			...extraMetadata,
		},
	} as Message;
}

function makeAssistant(
	id: string,
	extraMetadata?: Record<string, unknown>,
): Message {
	return {
		id,
		role: "assistant",
		content: "hello",
		timestamp: 2,
		metadata: {
			...extraMetadata,
		},
	} as Message;
}

function makeAttachment(id: string, overrides: Partial<Attachment> = {}): Attachment {
	return {
		id,
		name: `${id}.txt`,
		originalName: `original-${id}.txt`,
		path: `/tmp/${id}.txt`,
		size: 512,
		mimeType: "text/plain",
		type: "document",
		createdAt: new Date(0).toISOString(),
		...overrides,
	};
}

function baseInput(
	overrides: Partial<BuildContextInspectorDataInput> = {},
): BuildContextInspectorDataInput {
	return {
		messages: [],
		attachments: [],
		hasProject: false,
		systemPromptLabel: "System prompt",
		projectRulesLabel: "Project rules: AGENTS.md",
		...overrides,
	};
}

describe("buildContextInspectorData", () => {
	it("always exposes the system-prompt chip even when nothing else is injected", () => {
		const data = buildContextInspectorData(baseInput());
		expect(data.sources).toHaveLength(1);
		expect(data.sources[0]).toMatchObject({
			id: "system-prompt",
			kind: "systemPrompt",
			label: "System prompt",
		});
		expect(data.compactEvents).toEqual([]);
		expect(data.hasProject).toBe(false);
	});

	it("adds a project-rules chip when the session is project-scoped", () => {
		const data = buildContextInspectorData(baseInput({ hasProject: true }));
		const kinds = data.sources.map((s) => s.kind);
		expect(kinds).toEqual(["systemPrompt", "projectRules"]);
		const projectChip = data.sources.find((s) => s.kind === "projectRules");
		expect(projectChip?.label).toBe("Project rules: AGENTS.md");
		expect(projectChip?.detail).toBe("AGENTS.md / CLAUDE.md");
	});

	it("does not add project-rules chip on casual sessions", () => {
		const data = buildContextInspectorData(baseInput({ hasProject: false }));
		expect(data.sources.some((s) => s.kind === "projectRules")).toBe(false);
	});

	it("surfaces attachments from the LATEST user message only", () => {
		const messages: Message[] = [
			makeUser("u1", ["att-old"]),
			makeAssistant("a1"),
			makeUser("u2", ["att-a", "att-b"]),
		];
		const attachments = [
			makeAttachment("att-a", { size: 1024, type: "code" }),
			makeAttachment("att-b", { size: 2048, type: "image" }),
			makeAttachment("att-old"),
		];
		const data = buildContextInspectorData(baseInput({ messages, attachments }));
		const labels = data.sources
			.filter((s) => s.kind === "attachment")
			.map((s) => s.label);
		expect(labels).toEqual(["original-att-a.txt", "original-att-b.txt"]);
		const first = data.sources.find((s) => s.id === "attachment:att-a");
		expect(first?.bytes).toBe(1024);
		expect(first?.detail).toBe("code");
	});

	it("still surfaces attachment ids when metadata is unresolved", () => {
		const messages: Message[] = [makeUser("u1", ["ghost"])];
		const data = buildContextInspectorData(baseInput({ messages }));
		const ghost = data.sources.find((s) => s.id === "attachment:ghost");
		expect(ghost).toBeDefined();
		expect(ghost?.label).toBe("ghost");
		expect(ghost?.bytes).toBeUndefined();
	});

	it("collects contextCompacted markers into compactEvents in chronological order", () => {
		const messages: Message[] = [
			{
				id: "m1",
				role: "assistant",
				content: "",
				timestamp: 100,
				metadata: { contextCompacted: { summary: "trim 1" } },
			} as unknown as Message,
			makeAssistant("m2"),
			{
				id: "m3",
				role: "assistant",
				content: "",
				timestamp: 200,
				metadata: { contextCompacted: {} },
			} as unknown as Message,
		];
		const data = buildContextInspectorData(baseInput({ messages }));
		expect(data.compactEvents).toEqual([
			{ id: "m1", timestamp: 100, summary: "trim 1" },
			{ id: "m3", timestamp: 200, summary: undefined },
		]);
	});

	it("returns an empty compact-event list when no markers exist", () => {
		const messages: Message[] = [makeUser("u1"), makeAssistant("a1")];
		const data = buildContextInspectorData(baseInput({ messages }));
		expect(data.compactEvents).toEqual([]);
	});
});
