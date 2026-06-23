/**
 * Task tool — spawn a focused subagent for a self-contained sub-problem.
 *
 * Mirrors Claude Code's Task tool. Each Task call recursively invokes the
 * same ClaudeCodeAgentRuntime with a fresh chat context. Depth is bounded
 * (MAX_DEPTH = 3) so a model that loves Task can't blow up the system.
 *
 * The actual recursion glue (ctx.dispatchSubagent) is provided by
 * ClaudeCodeAgentRuntime during builtinCtx construction (Phase B wire-in).
 */

import type { BuiltinToolContext, BuiltinToolDef } from "./index";

export const MAX_TASK_DEPTH = 3;

export function createTaskTool(ctx: BuiltinToolContext): BuiltinToolDef {
	return {
		name: "Task",
		description:
			"Spawn a focused subagent to complete a self-contained sub-problem. The subagent has access to the same workspace and built-in tools but starts with a fresh chat context. Use Task for: (a) parallel exploration ('find all callers of X'), (b) heavy multi-step analysis you want summarised back, (c) isolating tool-noisy work so the main conversation stays clean. Avoid: trivial single-tool tasks (call the tool yourself).",
		inputSchema: {
			type: "object",
			properties: {
				description: {
					type: "string",
					description: "Short label for the task (3-5 words)",
				},
				prompt: {
					type: "string",
					description: "Detailed instructions for the subagent",
				},
			},
			required: ["description", "prompt"],
		},
		async execute(input) {
			const description = String(input.description ?? "").trim();
			const prompt = String(input.prompt ?? "").trim();
			if (!description) throw new Error("Task: `description` is required");
			if (!prompt) throw new Error("Task: `prompt` is required");

			const depth = ctx.taskDepth ?? 0;
			if (depth >= MAX_TASK_DEPTH) {
				throw new Error(
					`Task: max subagent nesting depth (${MAX_TASK_DEPTH}) reached. Inline this work instead.`,
				);
			}
			if (!ctx.dispatchSubagent) {
				throw new Error(
					"Task: subagent dispatch not available in this context",
				);
			}
			return await ctx.dispatchSubagent(prompt, {
				signal: ctx.signal,
				depth: depth + 1,
			});
		},
	};
}
