import { describe, expect, it, vi } from "vitest";
import {
	loadAvailableToolsCatalog,
	sanitizeServerId,
	type AvailableToolsCatalogSources,
} from "../useAvailableToolsCatalog";

function makeSources(
	overrides: Partial<AvailableToolsCatalogSources> = {},
): AvailableToolsCatalogSources {
	return {
		listBuiltinTools: vi.fn().mockResolvedValue([]),
		listMcpTools: vi.fn().mockResolvedValue([]),
		listSkillTools: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}

describe("sanitizeServerId", () => {
	it("strips leading @ and replaces non-alphanumeric with -", () => {
		expect(sanitizeServerId("@scp/fetch")).toBe("scp-fetch");
		expect(sanitizeServerId("@mcp/browser")).toBe("mcp-browser");
		expect(sanitizeServerId("plain-id")).toBe("plain-id");
	});
});

describe("loadAvailableToolsCatalog", () => {
	it("merges builtin + MCP + skill tools when a skill is active", async () => {
		const sources = makeSources({
			listBuiltinTools: vi
				.fn()
				.mockResolvedValue([{ name: "Read" }, { name: "Write" }]),
			listMcpTools: vi.fn().mockResolvedValue([
				{ serverId: "@scp/fetch", tool: { name: "get" } },
				{ serverId: "browser", tool: { name: "click" } },
			]),
			listSkillTools: vi.fn().mockResolvedValue([
				{ skillId: "my-skill", tool: { name: "helper" } },
				{ skillId: "other-skill", tool: { name: "ignored" } },
			]),
		});

		const tools = await loadAvailableToolsCatalog("my-skill", sources);

		expect(tools).toEqual([
			{ prefixedName: "Read", displayName: "Read", source: "builtin" },
			{ prefixedName: "Write", displayName: "Write", source: "builtin" },
			{
				prefixedName: "scp-fetch__get",
				displayName: "get",
				source: "mcp",
			},
			{
				prefixedName: "browser__click",
				displayName: "click",
				source: "mcp",
			},
			{
				prefixedName: "skill-my-skill__helper",
				displayName: "my-skill/helper",
				source: "skill",
			},
		]);
	});

	it("skips skill fetch entirely when selectedSkillId is null", async () => {
		const listSkillTools = vi.fn().mockResolvedValue([]);
		const sources = makeSources({
			listBuiltinTools: vi.fn().mockResolvedValue([{ name: "Read" }]),
			listSkillTools,
		});
		const tools = await loadAvailableToolsCatalog(null, sources);
		expect(listSkillTools).not.toHaveBeenCalled();
		expect(tools.map((t) => t.source)).toEqual(["builtin"]);
	});

	it("returns builtin + skill when MCP fetch throws (non-fatal)", async () => {
		const sources = makeSources({
			listBuiltinTools: vi.fn().mockResolvedValue([{ name: "Read" }]),
			listMcpTools: vi.fn().mockRejectedValue(new Error("mcp down")),
			listSkillTools: vi.fn().mockResolvedValue([
				{ skillId: "my-skill", tool: { name: "helper" } },
			]),
		});
		const tools = await loadAvailableToolsCatalog("my-skill", sources);
		expect(tools).toEqual([
			{ prefixedName: "Read", displayName: "Read", source: "builtin" },
			{
				prefixedName: "skill-my-skill__helper",
				displayName: "my-skill/helper",
				source: "skill",
			},
		]);
	});

	it("survives builtin fetch failure", async () => {
		const sources = makeSources({
			listBuiltinTools: vi.fn().mockRejectedValue(new Error("builtin down")),
			listMcpTools: vi
				.fn()
				.mockResolvedValue([{ serverId: "srv", tool: { name: "x" } }]),
		});
		const tools = await loadAvailableToolsCatalog(null, sources);
		expect(tools).toEqual([
			{ prefixedName: "srv__x", displayName: "x", source: "mcp" },
		]);
	});

	it("survives skill fetch failure", async () => {
		const sources = makeSources({
			listBuiltinTools: vi.fn().mockResolvedValue([{ name: "Read" }]),
			listSkillTools: vi.fn().mockRejectedValue(new Error("skills down")),
		});
		const tools = await loadAvailableToolsCatalog("my-skill", sources);
		expect(tools).toEqual([
			{ prefixedName: "Read", displayName: "Read", source: "builtin" },
		]);
	});

	it("deduplicates by prefixedName across sources", async () => {
		const sources = makeSources({
			listBuiltinTools: vi
				.fn()
				.mockResolvedValue([{ name: "Read" }, { name: "Read" }]),
			// Two MCP entries with the same serverId + tool name would produce
			// the same `prefixedName`; the second must be dropped.
			listMcpTools: vi.fn().mockResolvedValue([
				{ serverId: "srv", tool: { name: "x" } },
				{ serverId: "srv", tool: { name: "x" } },
			]),
		});
		const tools = await loadAvailableToolsCatalog(null, sources);
		expect(tools).toEqual([
			{ prefixedName: "Read", displayName: "Read", source: "builtin" },
			{ prefixedName: "srv__x", displayName: "x", source: "mcp" },
		]);
	});
});

describe("useAvailableToolsCatalog re-fetch behavior", () => {
	// Simulate the hook's "cancel-on-selectedSkillId-change" contract by
	// running two loads in flight where the second resolves faster; the hook
	// must use the LATEST invocation result. We test the underlying
	// primitive by asserting that fetches for different skill ids are
	// independent and correctly filtered.
	it("re-fetch with a different skill id yields a different result set", async () => {
		let skillCall = 0;
		const sources = makeSources({
			listBuiltinTools: vi.fn().mockResolvedValue([]),
			listMcpTools: vi.fn().mockResolvedValue([]),
			listSkillTools: vi.fn(async () => {
				skillCall += 1;
				return [
					{ skillId: "skill-a", tool: { name: "a-tool" } },
					{ skillId: "skill-b", tool: { name: "b-tool" } },
				];
			}),
		});

		const first = await loadAvailableToolsCatalog("skill-a", sources);
		const second = await loadAvailableToolsCatalog("skill-b", sources);

		expect(first).toEqual([
			{
				prefixedName: "skill-skill-a__a-tool",
				displayName: "skill-a/a-tool",
				source: "skill",
			},
		]);
		expect(second).toEqual([
			{
				prefixedName: "skill-skill-b__b-tool",
				displayName: "skill-b/b-tool",
				source: "skill",
			},
		]);
		expect(skillCall).toBe(2);
	});
});
