import { useMemo } from "react";
import { getProjectIdFromConversation, useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import { useProjectStore } from "../stores/projectStore";
import type { ActiveModelSelection } from "../types/models";

export function useEffectiveModel() {
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
		const findProviderModel = (selection: ActiveModelSelection | undefined) => {
			if (!selection) return undefined;
			const provider = providers.find((p) => p.id === selection.providerId);
			const model = provider?.models.find((m) => m.id === selection.modelId);
			return provider && model ? { provider, model } : undefined;
		};

		return (
			findProviderModel(sessionModelOverride) ||
			findProviderModel(projectDefaultModel) ||
			findProviderModel(activeSelection ?? undefined)
		);
	}, [activeSelection, projectDefaultModel, providers, sessionModelOverride]);
}
