import { describe, expect, it } from "vitest";
import enMenu from "../../i18n/locales/en/menu.json";
import enSettings from "../../i18n/locales/en/settings.json";
import zhMenu from "../../i18n/locales/zh/menu.json";
import zhSettings from "../../i18n/locales/zh/settings.json";
import {
	SETTINGS_NAVIGATION_GROUPS,
	type SettingsNavigationKey,
} from "../settingsNavigation";

const REQUIRED_ORDER = [
	"general",
	"models",
	"third-party-api",
	"tools-permissions",
	"projects",
	"project-recovery",
	"keyboard",
	"api-service",
	"webhook",
	"advanced",
	"about",
] as const;

function isSettingsNavigationKey(
	value: string,
): value is SettingsNavigationKey {
	return SETTINGS_NAVIGATION_GROUPS.some((group) => group.key === value);
}

function readLabel(
	locale: Record<string, unknown>,
	labelKey: string,
): string | undefined {
	const [root, child] = labelKey.split(".");
	if (!child) {
		return typeof locale[root] === "string" ? locale[root] : undefined;
	}
	const nested = locale[root];
	if (!nested || typeof nested !== "object") return undefined;
	const value = (nested as Record<string, unknown>)[child];
	return typeof value === "string" ? value : undefined;
}

describe("settings navigation", () => {
	it("matches the Phase 2 settings group order", () => {
		expect(SETTINGS_NAVIGATION_GROUPS.map((group) => group.key)).toEqual(
			REQUIRED_ORDER,
		);
	});

	it("exposes exactly 11 settings groups (defensive against nav drift)", () => {
		expect(SETTINGS_NAVIGATION_GROUPS).toHaveLength(11);
	});

	it("no longer exposes MCP, Skills, App Plugins or Context & Memory as Settings groups", () => {
		const keys = SETTINGS_NAVIGATION_GROUPS.map((group) => group.key);
		expect(keys).not.toContain("mcp");
		expect(keys).not.toContain("skills");
		expect(keys).not.toContain("app-plugins");
		expect(keys).not.toContain("context-memory");
		expect(keys).not.toContain("extensions");
	});

	it("isSettingsNavigationKey rejects removed keys so stale ?tab= URLs fall back to general", () => {
		expect(isSettingsNavigationKey("mcp")).toBe(false);
		expect(isSettingsNavigationKey("skills")).toBe(false);
		expect(isSettingsNavigationKey("app-plugins")).toBe(false);
		expect(isSettingsNavigationKey("context-memory")).toBe(false);
		expect(isSettingsNavigationKey("general")).toBe(true);
	});

	it("exposes Project Recovery settings without an Extensions group", () => {
		const recovery = SETTINGS_NAVIGATION_GROUPS.find(
			(group) => group.key === "project-recovery",
		);

		expect(recovery?.fallback).toBe("Project Recovery");
		expect(readLabel(enSettings, recovery?.labelKey ?? "")).toContain(
			"Recovery",
		);
		expect(readLabel(zhSettings, recovery?.labelKey ?? "")).toContain("恢复");
		expect(SETTINGS_NAVIGATION_GROUPS.map((group) => group.key)).not.toContain(
			"extensions",
		);
	});

	it("has localized labels for every settings group", () => {
		for (const group of SETTINGS_NAVIGATION_GROUPS) {
			expect(readLabel(enSettings, group.labelKey)).toBeTruthy();
			expect(readLabel(zhSettings, group.labelKey)).toBeTruthy();
		}
	});

	it("does not expose Extensions as a menu translation", () => {
		expect(enMenu).not.toHaveProperty("extensions");
		expect(zhMenu).not.toHaveProperty("extensions");
		expect(enMenu.chat).toBe("Agent");
		expect(zhMenu.chat).toBe("Agent");
	});
});
