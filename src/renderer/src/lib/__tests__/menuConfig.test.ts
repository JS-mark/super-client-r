import { describe, expect, it } from "vitest";
import {
	CORE_NAVIGATION_MENU_IDS,
	PROJECT_MENU_IDS,
	getCoreNavigationItems,
	getEffectiveMenuItems,
	getVisibleMenuItems,
	isMenuItemEnabled,
} from "../menuConfig";
import { DEFAULT_MENU_CONFIG, type MenuItemConfig } from "../../types/menu";

function item(id: string, enabled = true): MenuItemConfig {
	return {
		id,
		label: id,
		path: `/${id}`,
		iconType: "default",
		enabled,
		action: "navigate",
	};
}

describe("menuConfig", () => {
	it("returns only enabled navigation menu items in stored order", () => {
		const visible = getVisibleMenuItems([
			item("skills", false),
			item("chat"),
			item("bookmarks"),
			item("debug"),
		]);

		expect(visible.map((i) => i.id)).toEqual(["chat", "bookmarks"]);
	});

	it("does not ship extensions as a default menu entry", () => {
		expect(DEFAULT_MENU_CONFIG.items.map((i) => i.id)).not.toContain(
			"extensions",
		);
	});

	it("supports legacy workspace ids when checking project menu visibility", () => {
		expect(
			isMenuItemEnabled([item("workspaces", false)], PROJECT_MENU_IDS, true),
		).toBe(false);
		expect(isMenuItemEnabled([], PROJECT_MENU_IDS, true)).toBe(true);
	});

	it("force-enables core nav ids and hides extensions", () => {
		// 界面收口后：只有核心页（chat/models/skills）恒开；
		// mcp/plugins 保留其配置值，不再被强制开启进主导航。
		const effective = getEffectiveMenuItems(
			[
				item("models", false),
				item("skills", false),
				item("mcp", false),
				item("plugins", false),
				item("extensions", false),
			],
			{
				unifiedNavigation: false,
			},
		);

		expect(effective.map((i) => [i.id, i.enabled])).toEqual([
			["models", true],
			["skills", true],
			["mcp", false],
			["plugins", false],
			["extensions", false],
		]);
	});

	it("keeps extensions hidden even when unified navigation is on", () => {
		const effective = getEffectiveMenuItems(
			[item("skills", false), item("extensions", false)],
			{
				unifiedNavigation: true,
			},
		);

		expect(effective.map((i) => [i.id, i.enabled])).toEqual([
			["skills", true],
			["extensions", false],
		]);
	});

	it("returns core navigation items in fixed order regardless of stored order", () => {
		// 历史安装里菜单顺序可能漂移；核心导航仍按 Chat · Models · Skills 排列。
		const core = getCoreNavigationItems([
			item("skills"),
			item("bookmarks"),
			item("models"),
			item("chat"),
			item("mcp"),
		]);

		expect(core.map((i) => i.id)).toEqual(["chat", "models", "skills"]);
	});

	it("omits disabled or missing core navigation items", () => {
		const core = getCoreNavigationItems([
			item("chat"),
			item("models", false),
			// skills missing entirely
		]);

		expect(core.map((i) => i.id)).toEqual(["chat"]);
	});

	it("excludes jumble pages from core navigation even when enabled", () => {
		const core = getCoreNavigationItems([
			item("chat"),
			item("models"),
			item("skills"),
			item("mcp"),
			item("plugins"),
			item("bookmarks"),
			item("imbot"),
		]);

		expect(core.map((i) => i.id)).toEqual(CORE_NAVIGATION_MENU_IDS.slice());
	});

	it("ships models as a default menu entry", () => {
		expect(DEFAULT_MENU_CONFIG.items.map((i) => i.id)).toContain("models");
	});
});
