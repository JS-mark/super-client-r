import { create } from "zustand";
import { persist } from "zustand/middleware";
import { modelService } from "../services/modelService";
import type {
	ActiveModelSelection,
	ModelProvider,
	ProviderModel,
} from "../types/models";

interface ModelState {
	providers: ModelProvider[];
	activeSelection: ActiveModelSelection | null;
	isLoading: boolean;

	// Actions
	loadProviders: () => Promise<void>;
	loadActiveModel: () => Promise<void>;
	saveProvider: (provider: ModelProvider) => Promise<void>;
	deleteProvider: (id: string) => Promise<void>;
	setActiveModel: (selection: ActiveModelSelection | null) => Promise<void>;
	updateModelConfig: (
		providerId: string,
		modelId: string,
		config: Partial<ProviderModel>,
	) => Promise<void>;

	// Computed helpers
	getActiveProvider: () => ModelProvider | undefined;
	getActiveProviderModel: () =>
		| { provider: ModelProvider; model: ProviderModel }
		| undefined;
	getAllEnabledModels: () => {
		provider: ModelProvider;
		model: ProviderModel;
	}[];
}

export const useModelStore = create<ModelState>()(
	persist(
		(set, get) => ({
			providers: [],
			activeSelection: null,
			isLoading: false,

			loadProviders: async () => {
				set({ isLoading: true });
				try {
					const result = await modelService.listProviders();
					if (result.success && result.data) {
						set({ providers: result.data });
					}
				} finally {
					set({ isLoading: false });
				}
			},

			loadActiveModel: async () => {
				try {
					const result = await modelService.getActiveModel();
					if (result.success) {
						set({ activeSelection: result.data ?? null });
					}
				} catch {
					// ignore
				}
			},

			saveProvider: async (provider: ModelProvider) => {
				const result = await modelService.saveProvider(provider);
				if (result.success) {
					set((state) => {
						const providers = [...state.providers];
						const idx = providers.findIndex((p) => p.id === provider.id);
						if (idx >= 0) {
							providers[idx] = provider;
						} else {
							providers.push(provider);
						}
						return { providers };
					});
				}
			},

			deleteProvider: async (id: string) => {
				const result = await modelService.deleteProvider(id);
				if (result.success) {
					set((state) => {
						const providers = state.providers.filter((p) => p.id !== id);
						let activeSelection = state.activeSelection;
						if (activeSelection?.providerId === id) {
							activeSelection = null;
						}
						return { providers, activeSelection };
					});
				}
			},

			setActiveModel: async (selection: ActiveModelSelection | null) => {
				const result = await modelService.setActiveModel(selection);
				if (result.success) {
					set({ activeSelection: selection });
				}
			},

			updateModelConfig: async (
				providerId: string,
				modelId: string,
				config: Partial<ProviderModel>,
			) => {
				const result = await modelService.updateModelConfig(
					providerId,
					modelId,
					config,
				);
				if (result.success) {
					set((state) => {
						const providers = state.providers.map((p) => {
							if (p.id !== providerId) return p;
							return {
								...p,
								models: p.models.map((m) =>
									m.id === modelId ? { ...m, ...config } : m,
								),
								updatedAt: Date.now(),
							};
						});
						return { providers };
					});
				}
			},

			getActiveProvider: () => {
				const { providers, activeSelection } = get();
				if (!activeSelection) return undefined;
				return providers.find((p) => p.id === activeSelection.providerId);
			},

			getActiveProviderModel: () => {
				const { providers, activeSelection } = get();
				if (!activeSelection) return undefined;
				const provider = providers.find(
					(p) => p.id === activeSelection.providerId,
				);
				if (!provider) return undefined;
				const model = provider.models.find(
					(m) => m.id === activeSelection.modelId,
				);
				if (!model) return undefined;
				return { provider, model };
			},

			getAllEnabledModels: () => {
				const { providers } = get();
				const result: { provider: ModelProvider; model: ProviderModel }[] = [];
				for (const provider of providers) {
					if (!provider.enabled) continue;
					for (const model of provider.models) {
						if (model.enabled) {
							result.push({ provider, model });
						}
					}
				}
				return result;
			},
		}),
		{
			name: "model-storage",
			partialize: (state) => ({
				activeSelection: state.activeSelection,
			}),
		},
	),
);
