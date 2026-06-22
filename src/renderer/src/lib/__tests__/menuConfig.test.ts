import { describe, expect, it } from "vitest";
import {
	PROJECT_MENU_IDS,
	getEffectiveMenuItems,
	getVisibleMenuItems,
	isMenuItemEnabled,
} from "../menuConfig";
import type { MenuItemConfig } from "../../types/menu";

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

	it("supports legacy workspace ids when checking project menu visibility", () => {
		expect(
			isMenuItemEnabled([item("workspaces", false)], PROJECT_MENU_IDS, true),
		).toBe(false);
		expect(isMenuItemEnabled([], PROJECT_MENU_IDS, true)).toBe(true);
	});

	it("keeps marketplace entries visible and hides extensions", () => {
		const effective = getEffectiveMenuItems(
			[
				item("skills", true),
				item("mcp", true),
				item("plugins", true),
				item("extensions", false),
			],
			{
				unifiedNavigation: false,
			},
		);

		expect(effective.map((i) => [i.id, i.enabled])).toEqual([
			["skills", true],
			["mcp", true],
			["plugins", true],
			["extensions", false],
		]);
	});

	it("keeps extensions hidden even when unified navigation is on", () => {
		const effective = getEffectiveMenuItems(
			[
				item("skills", false),
				item("mcp", false),
				item("plugins", false),
				item("extensions", false),
			],
			{
				unifiedNavigation: true,
			},
		);

		expect(effective.map((i) => [i.id, i.enabled])).toEqual([
			["skills", true],
			["mcp", true],
			["plugins", true],
			["extensions", false],
		]);
	});
});
