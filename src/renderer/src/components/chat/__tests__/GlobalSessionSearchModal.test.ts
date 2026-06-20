import { describe, expect, it } from "vitest";
import type { ConversationSummary } from "../../../types/electron";
import { filterConversations } from "../GlobalSessionSearchModal";

function makeConv(
	overrides: Partial<ConversationSummary>,
): ConversationSummary {
	return {
		id: overrides.id ?? "c1",
		name: overrides.name ?? "Untitled",
		createdAt: overrides.createdAt ?? 0,
		updatedAt: overrides.updatedAt ?? 0,
		messageCount: overrides.messageCount ?? 0,
		preview: overrides.preview ?? "",
		workspaceId: overrides.workspaceId ?? "default",
		chatMode: overrides.chatMode ?? "direct",
		remote: overrides.remote,
		session: overrides.session as ConversationSummary["session"],
	};
}

describe("filterConversations", () => {
	it("returns all conversations when query is empty", () => {
		const list = [
			makeConv({ id: "a", name: "Alpha" }),
			makeConv({ id: "b", name: "Beta" }),
		];
		expect(filterConversations(list, "")).toEqual(list);
	});

	it("matches by title (case-insensitive)", () => {
		const list = [
			makeConv({ id: "a", name: "PixCake Plan" }),
			makeConv({ id: "b", name: "Other" }),
		];
		const result = filterConversations(list, "pixcake");
		expect(result.map((c) => c.id)).toEqual(["a"]);
	});

	it("matches by preview content", () => {
		const list = [
			makeConv({ id: "a", name: "X", preview: "讨论了部署方案" }),
			makeConv({ id: "b", name: "Y", preview: "无关内容" }),
		];
		const result = filterConversations(list, "部署");
		expect(result.map((c) => c.id)).toEqual(["a"]);
	});

	it("trims whitespace from query", () => {
		const list = [makeConv({ id: "a", name: "Alpha" })];
		expect(filterConversations(list, "  alpha  ").length).toBe(1);
	});

	it("returns empty array when no match", () => {
		const list = [makeConv({ id: "a", name: "Alpha" })];
		expect(filterConversations(list, "nope")).toEqual([]);
	});
});
