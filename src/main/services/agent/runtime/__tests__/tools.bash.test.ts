// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../mcp/McpService", () => ({
	mcpService: {
		callTool: vi.fn(async (_serverId, _toolName, args) => ({
			success: true,
			data: {
				content: [
					{ type: "text", text: `OK ran: ${(args as { command: string }).command}` },
				],
				isError: false,
			},
			serverType: "internal",
		})),
	},
}));

import { createBashTool } from "../tools/bash";

describe("Bash tool", () => {
	it("forwards command + workingDir to @scp/bash::execute_command", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		const tool = createBashTool({
			cwd: "/tmp",
			signal: new AbortController().signal,
		});
		const result = await tool.execute({ command: "echo hi" });
		expect(result).toContain("OK ran: echo hi");
		expect(mcpService.callTool).toHaveBeenCalledWith(
			"@scp/bash",
			"execute_command",
			expect.objectContaining({
				command: "echo hi",
				workingDir: "/tmp",
				confirmed: true,
			}),
			expect.any(Object),
		);
	});

	it("surfaces tool errors", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: false,
			error: "Bash: blocked dangerous command",
			serverType: "internal",
		});
		const tool = createBashTool({
			cwd: "/tmp",
			signal: new AbortController().signal,
		});
		await expect(tool.execute({ command: "rm -rf /" })).rejects.toThrow(
			/blocked/,
		);
	});

	it("surfaces isError:true from tool response", async () => {
		const { mcpService } = await import("../../../mcp/McpService");
		(mcpService.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: true,
			data: { content: [{ type: "text", text: "exit 1 stderr foo" }], isError: true },
			serverType: "internal",
		});
		const tool = createBashTool({
			cwd: "/tmp",
			signal: new AbortController().signal,
		});
		await expect(tool.execute({ command: "false" })).rejects.toThrow(
			/exit 1 stderr/,
		);
	});
});
