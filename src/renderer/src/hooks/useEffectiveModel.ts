import { useMemo } from "react";
import { getProjectIdFromConversation, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import { useProjectStore } from "../stores/projectStore";
import { resolveRendererEffectiveModel } from "./useMessageModelResolution";
import type { ActiveModelSelection } from "../types/models";

export function useEffectiveModel(
	messageModelOverride?: ActiveModelSelection | null,
) {
	const providers = useModelStore((s) => s.providers);
	const activeSelection = useModelStore((s) => s.activeSelection);
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);
	const projectId = getProjectIdFromConversation(currentConversation);
	const projectDefaultModel = useProjectStore((s) =>
		projectId ? s.settingsByProject[projectId]?.defaultModel : undefined,
	);
	const sessionModelOverride = currentConversation?.session?.modelOverride;

	return useMemo(() => {
		return resolveRendererEffectiveModel({
			providers,
			messageModelOverride,
			sessionModelOverride,
			projectDefaultModel,
			activeSelection,
		});
	}, [
		activeSelection,
		messageModelOverride,
		projectDefaultModel,
		providers,
		sessionModelOverride,
	]);
}
