import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuConfig, MenuItemConfig } from "../types/menu";
import { DEFAULT_MENU_CONFIG } from "../types/menu";

interface MenuState extends MenuConfig {
	/** 插件贡献的动态菜单项（不持久化） */
	pluginItems: MenuItemConfig[];
	/** 更新菜单配置 */
	setConfig: (config: MenuConfig) => void;
	/** 更新单个菜单项 */
	updateItem: (item: MenuItemConfig) => void;
	/** 删除菜单项 */
	deleteItem: (itemId: string) => void;
	/** 切换菜单项启用状态 */
	toggleEnabled: (itemId: string) => void;
	/** 重置为默认配置 */
	resetConfig: () => void;
	/** 设置插件贡献的菜单项 */
	setPluginItems: (items: MenuItemConfig[]) => void;
}

export const useMenuStore = create<MenuState>()(
	persist(
		(set, get) => ({
			items: DEFAULT_MENU_CONFIG.items,
			pluginItems: [],

			setConfig: (config) => set({ items: config.items }),

			updateItem: (item) => {
				const { items } = get();
				set({
					items: items.map((i) => (i.id === item.id ? item : i)),
				});
			},

			deleteItem: (itemId) => {
				const { items } = get();
				set({
					items: items.filter((i) => i.id !== itemId),
				});
			},

			toggleEnabled: (itemId) => {
				const { items } = get();
				set({
					items: items.map((item) =>
						item.id === itemId ? { ...item, enabled: !item.enabled } : item,
					),
				});
			},

			resetConfig: () => set({ items: DEFAULT_MENU_CONFIG.items }),

			setPluginItems: (pluginItems) => set({ pluginItems }),
		}),
		{
			name: "menu-config",
			partialize: (state) => ({ items: state.items }),
		},
	),
);
