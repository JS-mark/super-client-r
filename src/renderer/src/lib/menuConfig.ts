import type { MenuItemConfig } from "../types/menu";

export const PROJECT_MENU_IDS = ["workspace", "workspaces"] as const;

/**
 * 第一版（内测版）界面收口：主导航固定为 4 个一等公民页面
 *   Chat · Models · Skills · Settings
 * 其中 Settings 由侧边栏底部 user row 承载，主导航快捷区渲染前三项。
 *
 * 现存杂页（MCP / Plugins / Bookmarks / IMBot / 工作区入口等）**内测版隐藏**：
 * 从主导航移除，但页面、路由与菜单项配置全部保留，隐藏是路由/开关级、可逆的。
 * MCP 已降为二级入口（Models 页内的 MCP 标签 + `/mcp` 路由仍可直达）。
 *
 * 顺序在此以数组固定，`getCoreNavigationItems()` 按此顺序返回，
 * 不依赖 localStorage 中可能因历史安装而漂移的 items 顺序。
 */
export const CORE_NAVIGATION_MENU_IDS = ["chat", "models", "skills"] as const;

const NAVIGATION_MENU_IDS = new Set([
	"chat",
	"models",
	"skills",
	"mcp",
	"plugins",
	"bookmarks",
	"imbot",
	"workspace",
	"workspaces",
]);

const CORE_NAVIGATION_ID_SET = new Set<string>(CORE_NAVIGATION_MENU_IDS);

export function getEffectiveMenuItems(
	items: MenuItemConfig[],
	_options: { unifiedNavigation: boolean },
): MenuItemConfig[] {
	return items.map((item) => {
		if (item.id === "extensions") {
			return { ...item, enabled: false };
		}
		// 核心导航项（chat / models / skills）恒开，避免历史安装里被误关。
		// mcp / plugins 页面保留，但不再强制开启进主导航——降为二级/隐藏入口。
		if (CORE_NAVIGATION_ID_SET.has(item.id)) {
			return { ...item, enabled: true };
		}
		return item;
	});
}

export function getVisibleMenuItems(
	items: MenuItemConfig[],
	allowedIds: ReadonlySet<string> = NAVIGATION_MENU_IDS,
): MenuItemConfig[] {
	return items.filter((item) => item.enabled && allowedIds.has(item.id));
}

/**
 * 返回主导航的 4 核心页快捷项（Chat · Models · Skills），按固定顺序排列，
 * 不受 localStorage 中历史菜单顺序影响（Settings 由侧边栏底部 user row 承载，
 * 不在此列）。杂页即使在配置里 enabled，也不会出现在这里。
 */
export function getCoreNavigationItems(
	items: MenuItemConfig[],
): MenuItemConfig[] {
	return CORE_NAVIGATION_MENU_IDS.map((id) =>
		items.find((item) => item.id === id),
	).filter((item): item is MenuItemConfig => Boolean(item?.enabled));
}

export function findMenuItem(
	items: MenuItemConfig[],
	ids: string | readonly string[],
): MenuItemConfig | undefined {
	const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
	return items.find((item) => idSet.has(item.id));
}

export function isMenuItemEnabled(
	items: MenuItemConfig[],
	ids: string | readonly string[],
	fallback: boolean,
): boolean {
	return findMenuItem(items, ids)?.enabled ?? fallback;
}
