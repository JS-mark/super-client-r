import { create } from "zustand";

interface SkinState {
	activeSkinPluginId: string | null;
	activeSkinThemeId: string | null;
	antdTokenOverrides: Record<string, unknown> | null;
	// Markdown theme state
	activeMarkdownPluginId: string | null;
	activeMarkdownThemeId: string | null;
	setActiveSkin: (pluginId: string | null, themeId: string | null) => void;
	setAntdTokenOverrides: (tokens: Record<string, unknown> | null) => void;
	setActiveMarkdownTheme: (pluginId: string | null, themeId: string | null) => void;
	initialize: () => Promise<void>;
}

export const useSkinStore = create<SkinState>()((set) => ({
	activeSkinPluginId: null,
	activeSkinThemeId: null,
	antdTokenOverrides: null,
	activeMarkdownPluginId: null,
	activeMarkdownThemeId: null,
	setActiveSkin: (pluginId, themeId) => set({ activeSkinPluginId: pluginId, activeSkinThemeId: themeId }),
	setAntdTokenOverrides: (tokens) => set({ antdTokenOverrides: tokens }),
	setActiveMarkdownTheme: (pluginId, themeId) => set({ activeMarkdownPluginId: pluginId, activeMarkdownThemeId: themeId }),
	initialize: async () => {
		try {
			const [skinResult, mdResult] = await Promise.all([
				window.electron.skin.getActiveSkin(),
				window.electron.markdownTheme.getActive(),
			]);
			const updates: Partial<SkinState> = {};
			if (skinResult.success && skinResult.data) {
				updates.activeSkinPluginId = skinResult.data.pluginId;
				updates.activeSkinThemeId = skinResult.data.themeId;
			}
			if (mdResult.success && mdResult.data) {
				updates.activeMarkdownPluginId = mdResult.data.pluginId;
				updates.activeMarkdownThemeId = mdResult.data.themeId;
			}
			set(updates);
		} catch (error) {
			console.error("[SkinStore] Failed to initialize:", error);
		}
	},
}));
