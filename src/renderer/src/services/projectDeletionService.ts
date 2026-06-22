import type { Project } from "@super-client/shared-types/project";
import { useChatStore } from "../stores/chatStore";
import { useProjectStore } from "../stores/projectStore";

export interface DeleteProjectOptions {
	keepFiles?: boolean;
}

export async function deleteProjectWithCleanup(
	project: Project,
	options: DeleteProjectOptions = {},
): Promise<{ removed: boolean; orphan?: boolean } | null> {
	window.dispatchEvent(new Event("chat:stop-current-stream"));
	const result = await useProjectStore.getState().remove(project.id, options);
	if (result?.removed) {
		await useChatStore.getState().deleteProjectConversationsLocally(project.id);
	}
	return result;
}
