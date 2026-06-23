/**
 * Bash tool — run a shell command in cwd.
 *
 * Wraps @scp/bash::execute_command. Passes `confirmed: true` to skip the
 * MCP server's interactive confirmation (the host has its own approval
 * gate via HostToolDispatcher / LLMService permission flow).
 */

import { mcpService } from "../../../mcp/McpService";
import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export function createBashTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Bash",
		description:
			"Run a shell command in the current working directory. Returns stdout, stderr and exit code. Default 30s timeout, max 120s. NOT for long-running daemons.",
		inputSchema: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "Shell command (bash/zsh/sh)",
				},
				timeout: {
					type: "number",
					description: "Optional ms timeout (default 30000, max 120000)",
				},
			},
			required: ["command"],
		},
		async execute(input) {
			const command = String(input.command ?? "");
			if (!command) throw new Error("Bash: `command` is required");
			const timeout = Number(input.timeout) || undefined;
			const result = await mcpService.callTool(
				"@scp/bash",
				"execute_command",
				{
					command,
					workingDir: ctx.cwd,
					timeout,
					confirmed: true,
				},
				{},
			);
			if (!result.success) {
				throw new Error(`Bash: ${result.error || "execution failed"}`);
			}
			const data = result.data as
				| { content?: Array<{ type: string; text?: string }>; isError?: boolean }
				| undefined;
			const text = data?.content?.map((c) => c.text ?? "").join("") ?? "";
			if (data?.isError) throw new Error(`Bash: ${text}`);
			return text;
		},
	};
}
