// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: {
		callTool: vi.fn(async () => ({
			success: true,
			data: {
				content: [
					{ type: "text", text: "URL: https://x.test\nStatus: 200\n\nHello body" },
				],
			},
		})),
	},
}));

import { createWebFetchTool } from "../tools/webfetch";

describe("WebFetch tool", () => {
	it("forwards url to @scp/fetch::fetch_html and returns body text", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		const tool = createWebFetchTool({
			cwd: "/",
			signal: new AbortController().signal,
		});
		const result = await tool.execute({ url: "https://x.test" });
		expect(result).toContain("Hello body");
		expect(mcpService.callTool).toHaveBeenCalledWith(
			"@scp/fetch",
			"fetch_html",
			{ url: "https://x.test" },
			expect.any(Object),
		);
	});

	it("rejects empty url", async () => {
		const tool = createWebFetchTool({
			cwd: "/",
			signal: new AbortController().signal,
		});
		await expect(tool.execute({ url: "" })).rejects.toThrow(/url.*required/i);
	});

	it("surfaces tool errors", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: false,
			error: "DNS resolution failed",
		});
		const tool = createWebFetchTool({
			cwd: "/",
			signal: new AbortController().signal,
		});
		await expect(tool.execute({ url: "https://bad.test" })).rejects.toThrow(
			/DNS/,
		);
	});
});
