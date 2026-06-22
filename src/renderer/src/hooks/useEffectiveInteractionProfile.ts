import type { InteractionProfile } from "@super-client/shared-types/chat";
import {
	getProjectIdFromConversation,
	useChatStore,
} from "../stores/chatStore";
import { useProjectSettings } from "../stores/projectStore";

/**
 * Returns the effective interactionProfile for the current conversation:
 *   session override → project settings → "hybrid" default.
 */
export function useEffectiveInteractionProfile(): InteractionProfile {
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);
	const projectId = getProjectIdFromConversation(currentConversation);
	const projectSettings = useProjectSettings(projectId);
	return (
		currentConversation?.session?.interactionProfileOverride ||
		projectSettings?.interactionProfile ||
		"hybrid"
	);
}
