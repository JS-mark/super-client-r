// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: { callTool: vi.fn() },
}));

import { createGrepTool } from "../tools/grep";

describe("Grep tool", () => {
	it("forwards pattern + path + glob to @scp/grep", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "/x/y.ts:10:foo\n/x/z.ts:5:foo" }] },
		});
		const tool = createGrepTool({
			cwd: "/x",
			signal: new AbortController().signal,
		});
		const result = await tool.execute({ pattern: "foo", glob: "*.ts" });
		expect(result).toContain("y.ts");
		expect(mcpService.callTool).toHaveBeenCalledWith(
			"@scp/grep",
			"grep",
			expect.objectContaining({ pattern: "foo", path: "/x", include: "*.ts" }),
			expect.any(Object),
		);
	});

	it("filesOnly returns file list", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "/x/y.ts\n/x/z.ts" }] },
		});
		const tool = createGrepTool({
			cwd: "/x",
			signal: new AbortController().signal,
		});
		const out = await tool.execute({ pattern: "foo", filesOnly: true });
		expect(out).toContain("/x/y.ts");
	});

	it("surfaces tool errors", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: false,
			error: "ripgrep crashed",
		});
		const tool = createGrepTool({
			cwd: "/x",
			signal: new AbortController().signal,
		});
		await expect(tool.execute({ pattern: "foo" })).rejects.toThrow(
			/ripgrep crashed/,
		);
	});
});
