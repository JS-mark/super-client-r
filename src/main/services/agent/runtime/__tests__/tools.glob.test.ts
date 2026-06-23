// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: {
		callTool: vi.fn(async () => ({
			success: true,
			data: { content: [{ type: "text", text: "/x/a.ts\n/x/b/c.ts" }] },
		})),
	},
}));

import { createGlobTool } from "../tools/glob";

describe("Glob tool", () => {
	it("forwards pattern + cwd to search_files", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		const tool = createGlobTool({
			cwd: "/x",
			signal: new AbortController().signal,
		});
		const result = await tool.execute({ pattern: "**/*.ts" });
		expect(result).toContain("/x/a.ts");
		expect(mcpService.callTool).toHaveBeenCalledWith(
			"@scp/file-system",
			"search_files",
			expect.objectContaining({ pattern: "**/*.ts", path: "/x" }),
			expect.any(Object),
		);
	});

	it("resolves explicit relative path against cwd", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		const tool = createGlobTool({
			cwd: "/x",
			signal: new AbortController().signal,
		});
		await tool.execute({ pattern: "*.ts", path: "subdir" });
		expect(mcpService.callTool).toHaveBeenLastCalledWith(
			"@scp/file-system",
			"search_files",
			expect.objectContaining({ path: "/x/subdir" }),
			expect.any(Object),
		);
	});
});
