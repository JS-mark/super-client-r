import { useCallback, useMemo } from "react";
import type { EffectiveSessionRuntime } from "@super-client/shared-types/chat";
import { createLogger } from "../services/logService";
import { runtimeService } from "../services/runtimeService";
import {
	getProjectIdFromConversation,
	useChatStore,
} from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import { useProjectStore } from "../stores/projectStore";
import type {
	ActiveModelSelection,
	ModelProvider,
	ProviderModel,
} from "../types/models";

const log = createLogger("useMessageModelResolution");

export interface ProviderModelResolution {
	provider: ModelProvider;
	model: ProviderModel;
}

export type EffectiveModelSource =
	| "message"
	| "session"
	| "project"
	| "global"
	| "runtime-fallback"
	| "subagent";

export interface EffectiveProviderModelResolution
	extends ProviderModelResolution {
	source: EffectiveModelSource;
	sourceLabel: string;
}

interface ConversationModelContext {
	workspaceId?: string;
	session?: {
		modelOverride?: ActiveModelSelection;
	};
}

export interface RendererModelFallbackInput {
	providers: ModelProvider[];
	messageModelOverride?: ActiveModelSelection | null;
	sessionModelOverride?: ActiveModelSelection | null;
	projectDefaultModel?: ActiveModelSelection;
	activeSelection?: ActiveModelSelection | null;
}

export const EFFECTIVE_MODEL_SOURCE_LABEL: Record<EffectiveModelSource, string> =
	{
		message: "本次使用",
		session: "会话覆盖",
		project: "项目默认",
		global: "全局默认",
		"runtime-fallback": "Runtime fallback",
		subagent: "Subagent selected",
	};

export function findProviderModelInList(
	providers: ModelProvider[],
	selection: ActiveModelSelection | null | undefined,
): ProviderModelResolution | undefined {
	if (!selection) return undefined;
	const provider = providers.find((p) => p.id === selection.providerId);
	const model = provider?.models.find((m) => m.id === selection.modelId);
	return provider && model ? { provider, model } : undefined;
}

export function resolveRendererFallbackModel({
	providers,
	messageModelOverride,
	sessionModelOverride,
	projectDefaultModel,
	activeSelection,
}: RendererModelFallbackInput): ProviderModelResolution | undefined {
	return resolveRendererEffectiveModel({
		providers,
		messageModelOverride,
		sessionModelOverride,
		projectDefaultModel,
		activeSelection,
	});
}

export function resolveRendererEffectiveModel({
	providers,
	messageModelOverride,
	sessionModelOverride,
	projectDefaultModel,
	activeSelection,
}: RendererModelFallbackInput): EffectiveProviderModelResolution | undefined {
	const candidates: Array<{
		selection: ActiveModelSelection | null | undefined;
		source: EffectiveModelSource;
	}> = [
		{ selection: messageModelOverride, source: "message" },
		{ selection: sessionModelOverride, source: "session" },
		{ selection: projectDefaultModel, source: "project" },
		{ selection: activeSelection, source: "global" },
	];
	for (const candidate of candidates) {
		const found = findProviderModelInList(providers, candidate.selection);
		if (found) {
			return {
				...found,
				source: candidate.source,
				sourceLabel: EFFECTIVE_MODEL_SOURCE_LABEL[candidate.source],
			};
		}
	}
	return undefined;
}

export function clearMessageModelOverrideAfterSend(
	messageModelOverride: ActiveModelSelection | null,
	setMessageModelOverride: (selection: ActiveModelSelection | null) => void,
): void {
	if (messageModelOverride) {
		setMessageModelOverride(null);
	}
}

function sameSelection(
	a: ActiveModelSelection | null | undefined,
	b: ActiveModelSelection | null | undefined,
): boolean {
	return Boolean(
		a &&
			b &&
			a.providerId === b.providerId &&
			a.modelId === b.modelId,
	);
}

function sourceForRuntimeModel(
	runtimeModel: ActiveModelSelection,
	localEffective: EffectiveProviderModelResolution | undefined,
): EffectiveModelSource {
	if (
		localEffective &&
		sameSelection(runtimeModel, {
			providerId: localEffective.provider.id,
			modelId: localEffective.model.id,
		})
	) {
		return localEffective.source;
	}
	return "runtime-fallback";
}

export function withEffectiveModelSource(
	resolution: ProviderModelResolution,
	source: EffectiveModelSource,
): EffectiveProviderModelResolution {
	return {
		...resolution,
		source,
		sourceLabel: EFFECTIVE_MODEL_SOURCE_LABEL[source],
	};
}

export function useMessageModelResolution(
	currentConversation: ConversationModelContext | null | undefined,
	messageModelOverride?: ActiveModelSelection | null,
) {
	const sessionModelOverride = useMemo<ActiveModelSelection | null>(() => {
		const override = currentConversation?.session?.modelOverride;
		return override
			? { providerId: override.providerId, modelId: override.modelId }
			: null;
	}, [currentConversation?.session?.modelOverride]);

	const currentProjectId = useMemo(
		() => getProjectIdFromConversation(currentConversation),
		[currentConversation?.workspaceId],
	);

	const setSessionModelOverride = useCallback(
		(override: ActiveModelSelection | null) => {
			const convId = useChatStore.getState().currentConversationId;
			if (!convId) return;
			useChatStore.getState().updateConversationMetadata(convId, {
				session: {
					modelOverride: override
						? { providerId: override.providerId, modelId: override.modelId }
						: undefined,
				},
			});
		},
		[],
	);

	const findProviderModel = useCallback(
		(selection: ActiveModelSelection | null | undefined) =>
			findProviderModelInList(useModelStore.getState().providers, selection) ??
			null,
		[],
	);

	const getEffectiveModel = useCallback(() => {
		const { activeSelection, providers } = useModelStore.getState();
		const projectDefaultModel = currentProjectId
			? useProjectStore.getState().settingsByProject[currentProjectId]
					?.defaultModel
			: undefined;

		return resolveRendererEffectiveModel({
			providers,
			messageModelOverride,
			sessionModelOverride,
			projectDefaultModel,
			activeSelection,
		});
	}, [currentProjectId, messageModelOverride, sessionModelOverride]);

	const resolveEffectiveRuntime =
		useCallback(async (): Promise<EffectiveSessionRuntime | null> => {
			const convId = useChatStore.getState().currentConversationId;
			if (!convId) return null;
			try {
				const res = await runtimeService.resolveSession({ sessionId: convId });
				if (res.success && res.data) return res.data;
				return null;
			} catch (err) {
				log.warn("resolveEffectiveRuntime failed", { error: err });
				return null;
			}
		}, []);

	const resolveActiveProviderModel = useCallback(async () => {
		const localEffective = getEffectiveModel();
		const runtime = await resolveEffectiveRuntime();
		if (runtime) {
			const found = findProviderModel(runtime.model);
			if (found) {
				return withEffectiveModelSource(
					found,
					sourceForRuntimeModel(runtime.model, localEffective),
				);
			}
			log.warn(
				"resolver returned model not present in useModelStore; falling back",
				{ model: runtime.model },
			);
		}
		return localEffective;
	}, [resolveEffectiveRuntime, findProviderModel, getEffectiveModel]);

	return {
		sessionModelOverride,
		setSessionModelOverride,
		findProviderModel,
		getEffectiveModel,
		resolveEffectiveRuntime,
		resolveActiveProviderModel,
	};
}
