import { describe, expect, it } from "vitest";
import { APP_ROUTE_SHELL_ENTRIES } from "../routeConfig";

describe("router shell entries", () => {
	it("does not register an Extensions aggregate route", () => {
		expect(APP_ROUTE_SHELL_ENTRIES.map((route) => route.path)).not.toContain(
			"/extensions",
		);
	});

	it("keeps MCP, Skills and App Plugins as separate routes", () => {
		expect(APP_ROUTE_SHELL_ENTRIES.map((route) => route.path)).toEqual(
			expect.arrayContaining(["/mcp", "/skills", "/plugins"]),
		);
	});

	it("labels chat route as the Agent workbench", () => {
		const chatRoute = APP_ROUTE_SHELL_ENTRIES.find(
			(route) => route.path === "/chat",
		);
		expect(chatRoute?.title).toBe("Agent 工作台");
		expect(chatRoute?.title).not.toMatch(/AI 聊天|direct|Direct|普通对话/);
	});
});
