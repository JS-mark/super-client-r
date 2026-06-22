import type { MenuItemConfig } from "../types/menu";

export const PROJECT_MENU_IDS = ["workspace", "workspaces"] as const;

const NAVIGATION_MENU_IDS = new Set([
	"chat",
	"skills",
	"mcp",
	"plugins",
	"bookmarks",
	"imbot",
	"workspace",
	"workspaces",
]);

export function getEffectiveMenuItems(
	items: MenuItemConfig[],
	_options: { unifiedNavigation: boolean },
): MenuItemConfig[] {
	return items.map((item) => {
		if (item.id === "extensions") {
			return { ...item, enabled: false };
		}
		if (item.id === "skills" || item.id === "mcp" || item.id === "plugins") {
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
