// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../systemPrompt";

describe("buildSystemPrompt", () => {
	it("includes the agent identity and cwd", () => {
		const out = buildSystemPrompt({
			cwd: "/projects/foo",
			customPrompt: "",
		});
		expect(out).toMatch(/coding agent/i);
		expect(out).toContain("/projects/foo");
	});

	it("lists every builtin tool name once", () => {
		const out = buildSystemPrompt({ cwd: "/x", customPrompt: "" });
		for (const name of [
			"Read",
			"Write",
			"Edit",
			"Bash",
			"Grep",
			"Glob",
			"WebFetch",
			"Task",
		]) {
			expect(out).toMatch(new RegExp(`\\*\\*${name}\\*\\*`));
		}
	});

	it("describes operating principles (plan first, read before edit)", () => {
		const out = buildSystemPrompt({ cwd: "/x", customPrompt: "" });
		expect(out).toMatch(/plan first/i);
		expect(out).toMatch(/Read before Edit/i);
	});

	it("appends customPrompt under a `User instructions` heading", () => {
		const out = buildSystemPrompt({
			cwd: "/x",
			customPrompt: "Always use TypeScript.",
		});
		expect(out).toMatch(/# User instructions/);
		expect(out).toMatch(/Always use TypeScript/);
	});

	it("omits user-instructions section when customPrompt is blank/whitespace", () => {
		const out = buildSystemPrompt({ cwd: "/x", customPrompt: "   \n  " });
		expect(out).not.toMatch(/# User instructions/);
	});
});
