import { describe, expect, it } from "vitest";
import { createCurrentModelInfoRef } from "../useCurrentModelInfoRef";

describe("createCurrentModelInfoRef", () => {
	it("get() returns the latest set() snapshot", () => {
		const handle = createCurrentModelInfoRef();
		expect(handle.get()).toBeNull();
		handle.set({
			model: "claude-3",
			providerPreset: "anthropic",
			providerName: "Anthropic",
		});
		expect(handle.get()).toEqual({
			model: "claude-3",
			providerPreset: "anthropic",
			providerName: "Anthropic",
		});
		handle.set({
			model: "gpt-4",
			providerPreset: "openai",
			providerName: "OpenAI",
			modelSource: "session",
			modelSourceLabel: "会话覆盖",
		});
		expect(handle.get()?.model).toBe("gpt-4");
		expect(handle.get()?.modelSource).toBe("session");
	});

	it("clear() resets the ref to null", () => {
		const handle = createCurrentModelInfoRef({
			model: "m",
			providerPreset: "anthropic",
			providerName: "n",
		});
		expect(handle.get()?.model).toBe("m");
		handle.clear();
		expect(handle.get()).toBeNull();
	});

	it(".ref points to the same mutable cell the getter reads", () => {
		const handle = createCurrentModelInfoRef();
		handle.set({
			model: "x",
			providerPreset: "anthropic",
			providerName: "n",
		});
		expect(handle.ref.current?.model).toBe("x");
		handle.ref.current = {
			model: "direct-write",
			providerPreset: "anthropic",
			providerName: "n",
		};
		expect(handle.get()?.model).toBe("direct-write");
	});
});
