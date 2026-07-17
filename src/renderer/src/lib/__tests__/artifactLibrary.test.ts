import { describe, expect, it } from "vitest";
import type { ChatFileArtifact, ChatFileChangeSet } from "../../types/electron";
import { buildArtifactLibraryItems } from "../artifactLibrary";

function artifact(
	overrides: Partial<ChatFileArtifact> = {},
): ChatFileArtifact {
	return {
		id: "artifact-1",
		conversationId: "session-1",
		messageId: "message-1",
		path: "/Users/mark/project/src/app.ts",
		relativePath: "src/app.ts",
		name: "app.ts",
		extension: "ts",
		kind: "created",
		source: "tool",
		openTargets: [],
		policy: {
			canOpen: true,
			canReveal: true,
			canDiff: true,
		},
		...overrides,
	};
}

function changeSet(
	overrides: Partial<ChatFileChangeSet> = {},
): ChatFileChangeSet {
	return {
		id: "changes-1",
		conversationId: "session-1",
		messageId: "message-2",
		files: [
			{
				path: "/Users/mark/project/src/other.ts",
				status: "modified",
				additions: 3,
				deletions: 1,
			},
		],
		additions: 3,
		deletions: 1,
		...overrides,
	};
}

describe("buildArtifactLibraryItems", () => {
	it("returns current conversation artifacts only", () => {
		const items = buildArtifactLibraryItems({
			conversationId: "session-1",
			artifacts: [
				artifact({ id: "a1" }),
				artifact({
					id: "a2",
					conversationId: "session-2",
					path: "/Users/mark/other/secret.txt",
					relativePath: "secret.txt",
					name: "secret.txt",
				}),
			],
			changeSets: [],
		});
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			id: "a1",
			conversationId: "session-1",
			displayPath: "src/app.ts",
			fullPath: "/Users/mark/project/src/app.ts",
		});
	});

	it("dedupes the same message/path/kind while keeping stable order", () => {
		const items = buildArtifactLibraryItems({
			conversationId: "session-1",
			artifacts: [
				artifact({ id: "a1" }),
				artifact({ id: "a1-duplicate", name: "duplicate.ts" }),
				artifact({
					id: "a2",
					messageId: "message-2",
					path: "/Users/mark/project/src/next.ts",
					relativePath: "src/next.ts",
					name: "next.ts",
				}),
			],
			changeSets: [],
		});
		expect(items.map((item) => item.id)).toEqual(["a1", "a2"]);
	});

	it("redacts absolute paths when no relativePath is available", () => {
		const items = buildArtifactLibraryItems({
			conversationId: "session-1",
			artifacts: [
				artifact({
					relativePath: undefined,
					path: "/Users/mark/private/project/secrets.env",
					name: "secrets.env",
				}),
			],
			changeSets: [],
		});
		expect(items[0].displayPath).toBe("~/.../project/secrets.env");
		expect(items[0].displayPath).not.toContain("/Users/mark/private");
		expect(items[0].fullPath).toBe("/Users/mark/private/project/secrets.env");
	});

	it("indexes change-set files without exposing raw absolute paths", () => {
		const items = buildArtifactLibraryItems({
			conversationId: "session-1",
			artifacts: [],
			changeSets: [changeSet()],
		});
		expect(items).toEqual([
			expect.objectContaining({
				id: "changes-1:/Users/mark/project/src/other.ts",
				kind: "modified",
				source: "tool",
				name: "other.ts",
				displayPath: "~/.../src/other.ts",
				fullPath: "/Users/mark/project/src/other.ts",
				additions: 3,
				deletions: 1,
				origin: "change",
			}),
		]);
	});
});
