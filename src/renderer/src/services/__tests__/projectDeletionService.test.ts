import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@super-client/shared-types/project";
import { deleteProjectWithCleanup } from "../projectDeletionService";
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";

const originalRemove = useProjectStore.getState().remove;
const originalDeleteProjectConversationsLocally =
	useChatStore.getState().deleteProjectConversationsLocally;

function installWindowEventTargetShim(): void {
	const target = new EventTarget();
	Object.assign(window, {
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target),
		dispatchEvent: target.dispatchEvent.bind(target),
	});
}

const mockProject = (overrides: Partial<Project> = {}): Project => ({
	id: "project-1",
	cwd: "/repo/project-1",
	name: "Project One",
	createdAt: 1,
	updatedAt: 2,
	lastSeenAt: 2,
	...overrides,
});

beforeEach(() => {
	vi.clearAllMocks();
	installWindowEventTargetShim();
	useProjectStore.setState({
		projects: [],
		currentProjectId: null,
		remove: originalRemove,
	});
	useChatStore.setState({
		conversations: [],
		currentConversationId: null,
		deleteProjectConversationsLocally: originalDeleteProjectConversationsLocally,
	});
});

afterEach(() => {
	useProjectStore.setState({ remove: originalRemove });
	useChatStore.setState({
		deleteProjectConversationsLocally: originalDeleteProjectConversationsLocally,
	});
});

describe("deleteProjectWithCleanup", () => {
	it("dispatches stop before project removal and then cleans local project sessions", async () => {
		const calls: string[] = [];
		const remove = vi.fn(async () => {
			calls.push("remove");
			return { removed: true, orphan: false };
		});
		const cleanup = vi.fn(async () => {
			calls.push("cleanup");
		});
		const onStop = vi.fn(() => {
			calls.push("stop");
		});

		useProjectStore.setState({ remove });
		useChatStore.setState({ deleteProjectConversationsLocally: cleanup });
		window.addEventListener("chat:stop-current-stream", onStop);
		try {
			const result = await deleteProjectWithCleanup(mockProject(), {
				keepFiles: true,
			});

			expect(result).toEqual({ removed: true, orphan: false });
			expect(remove).toHaveBeenCalledWith("project-1", { keepFiles: true });
			expect(cleanup).toHaveBeenCalledWith("project-1");
			expect(onStop).toHaveBeenCalledTimes(1);
			expect(calls).toEqual(["stop", "remove", "cleanup"]);
		} finally {
			window.removeEventListener("chat:stop-current-stream", onStop);
		}
	});

	it("does not clear renderer sessions when project removal is not confirmed", async () => {
		const cleanup = vi.fn();
		const remove = vi.fn(async () => ({ removed: false, orphan: false }));
		useProjectStore.setState({ remove });
		useChatStore.setState({ deleteProjectConversationsLocally: cleanup });

		await expect(deleteProjectWithCleanup(mockProject())).resolves.toEqual({
			removed: false,
			orphan: false,
		});

		expect(cleanup).not.toHaveBeenCalled();
	});

	it("does not clear renderer sessions when project removal fails", async () => {
		const cleanup = vi.fn();
		const remove = vi.fn(async () => null);
		useProjectStore.setState({ remove });
		useChatStore.setState({ deleteProjectConversationsLocally: cleanup });

		await expect(deleteProjectWithCleanup(mockProject())).resolves.toBeNull();

		expect(cleanup).not.toHaveBeenCalled();
	});
});
