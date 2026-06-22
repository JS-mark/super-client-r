// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveOptimalConfig } from "../AgentAutoConfig";

describe("resolveOptimalConfig", () => {
	it("ignores a non-compatible Agent provider model", () => {
		const config = resolveOptimalConfig(
			{
				prompt: "List files",
				model: "ai21/jamba-large-1.7",
			} as any,
			{
				defaultModel: "MiniMax/MiniMax-M2.7",
			} as any,
			"qwen3.5-plus",
		);

		expect(config.model).toBe("claude-sonnet-4-5");
	});

	it("uses a compatible Agent provider model when chat model is not tool compatible", () => {
		const config = resolveOptimalConfig(
			{
				prompt: "List files",
				model: "ai21/jamba-large-1.7",
			} as any,
			{
				defaultModel: "MiniMax/MiniMax-M2.7",
			} as any,
			"anthropic/claude-sonnet-4",
		);

		expect(config.model).toBe("anthropic/claude-sonnet-4");
	});

	it("keeps a compatible explicit request model", () => {
		const config = resolveOptimalConfig(
			{
				prompt: "List files",
				model: "anthropic/claude-sonnet-4",
			} as any,
			{
				defaultModel: "MiniMax/MiniMax-M2.7",
			} as any,
			"qwen3.5-plus",
		);

		expect(config.model).toBe("anthropic/claude-sonnet-4");
	});
});
