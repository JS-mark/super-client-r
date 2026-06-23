// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createTaskTool, MAX_TASK_DEPTH } from "../tools/task";

describe("Task tool", () => {
	it("invokes dispatchSubagent with prompt + depth+1", async () => {
		const dispatch = vi.fn(async () => "subagent result");
		const tool = createTaskTool({
			cwd: "/x",
			signal: new AbortController().signal,
			taskDepth: 0,
			dispatchSubagent: dispatch,
		});
		const result = await tool.execute({
			description: "find foo",
			prompt: "Find all foo refs and list them.",
		});
		expect(result).toBe("subagent result");
		expect(dispatch).toHaveBeenCalledWith(
			"Find all foo refs and list them.",
			expect.objectContaining({ depth: 1 }),
		);
	});

	it("errors at nesting depth MAX_TASK_DEPTH", async () => {
		const tool = createTaskTool({
			cwd: "/x",
			signal: new AbortController().signal,
			taskDepth: MAX_TASK_DEPTH,
			dispatchSubagent: vi.fn(),
		});
		await expect(
			tool.execute({ description: "x", prompt: "y" }),
		).rejects.toThrow(/nest|depth/i);
	});

	it("errors if dispatchSubagent missing", async () => {
		const tool = createTaskTool({
			cwd: "/x",
			signal: new AbortController().signal,
			taskDepth: 0,
		});
		await expect(
			tool.execute({ description: "x", prompt: "y" }),
		).rejects.toThrow(/not available/i);
	});

	it("errors on empty description / prompt", async () => {
		const tool = createTaskTool({
			cwd: "/x",
			signal: new AbortController().signal,
			taskDepth: 0,
			dispatchSubagent: vi.fn(),
		});
		await expect(
			tool.execute({ description: "", prompt: "y" }),
		).rejects.toThrow(/description.*required/i);
		await expect(
			tool.execute({ description: "x", prompt: "  " }),
		).rejects.toThrow(/prompt.*required/i);
	});

	it("forwards abort signal to subagent", async () => {
		const ac = new AbortController();
		const dispatch = vi.fn(async (_p, opts: { signal: AbortSignal }) => {
			expect(opts.signal).toBe(ac.signal);
			return "ok";
		});
		const tool = createTaskTool({
			cwd: "/x",
			signal: ac.signal,
			taskDepth: 0,
			dispatchSubagent: dispatch,
		});
		await tool.execute({ description: "x", prompt: "y" });
		expect(dispatch).toHaveBeenCalled();
	});
});
