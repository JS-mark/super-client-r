/**
 * 菜单图标类型
 */
export type MenuItemIconType = "emoji" | "image" | "default";

/**
 * 菜单项动作类型
 */
export type MenuItemAction = "navigate" | "modal" | "callback";

/**
 * 菜单项配置
 */
export interface MenuItemConfig {
	/** 唯一标识 */
	id: string;
	/** 显示名称 */
	label: string;
	/** 路由路径或动作标识 */
	path: string;
	/** 图标类型 */
	iconType: MenuItemIconType;
	/** 图标内容（emoji字符串或图片URL） */
	iconContent?: string;
	/** 是否启用 */
	enabled: boolean;
	/** 动作类型：navigate-路由跳转，modal-打开弹窗，callback-执行回调 */
	action?: MenuItemAction;
}

/**
 * 菜单配置存储
 */
export interface MenuConfig {
	/** 菜单项列表（按顺序排列） */
	items: MenuItemConfig[];
}

/**
 * 默认菜单配置
 */
export const DEFAULT_MENU_CONFIG: MenuConfig = {
	items: [
		{
			id: "chat",
			label: "chat",
			path: "/chat",
			iconType: "default",
			iconContent: "MessageOutlined",
			enabled: true,
			action: "navigate",
		},
		{
			id: "models",
			label: "models",
			path: "/models",
			iconType: "default",
			iconContent: "AppstoreOutlined",
			enabled: true,
			action: "navigate",
		},
		{
			id: "skills",
			label: "skills",
			path: "/skills",
			iconType: "default",
			iconContent: "RocketOutlined",
			enabled: true,
			action: "navigate",
		},
		{
			id: "mcp",
			label: "mcp",
			path: "/mcp",
			iconType: "default",
			iconContent: "ApiOutlined",
			enabled: true,
			action: "navigate",
		},
		{
			id: "settings",
			label: "settings",
			path: "/settings",
			iconType: "default",
			iconContent: "SettingOutlined",
			enabled: true,
			action: "navigate",
		},
	],
};

/** 菜单配置存储键 */
const MENU_CONFIG_KEY = "menu-config";

/**
 * 获取菜单配置
 */
export function getMenuConfig(): MenuConfig {
	try {
		const saved = localStorage.getItem(MENU_CONFIG_KEY);
		if (saved) {
			return JSON.parse(saved) as MenuConfig;
		}
	} catch {
		// ignore
	}
	return DEFAULT_MENU_CONFIG;
}

/**
 * 保存菜单配置
 */
export function saveMenuConfig(config: MenuConfig): void {
	try {
		localStorage.setItem(MENU_CONFIG_KEY, JSON.stringify(config));
	} catch {
		// ignore
	}
}

/**
 * 重置菜单配置为默认值
 */
export function resetMenuConfig(): void {
	try {
		localStorage.removeItem(MENU_CONFIG_KEY);
	} catch {
		// ignore
	}
}
