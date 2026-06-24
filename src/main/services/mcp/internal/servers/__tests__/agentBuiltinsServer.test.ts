// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	AGENT_BUILTIN_TOOL_NAMES,
	createAgentBuiltinsServer,
} from "../agentBuiltinsServer";

describe("agentBuiltinsServer skeleton", () => {
	it("exposes 8 tools with canonical names", () => {
		const server = createAgentBuiltinsServer();
		expect(server.id).toBe("@scp/agent-builtins");
		expect(server.name).toBe("Agent Built-ins");
		expect(server.tools.map((t) => t.name).sort()).toEqual(
			[
				"Bash",
				"Edit",
				"Glob",
				"Grep",
				"Read",
				"Task",
				"WebFetch",
				"Write",
			].sort(),
		);
	});

	it("AGENT_BUILTIN_TOOL_NAMES matches tools[]", () => {
		const server = createAgentBuiltinsServer();
		expect(AGENT_BUILTIN_TOOL_NAMES).toEqual(server.tools.map((t) => t.name));
	});

	it("each tool has description + inputSchema + matching handler", () => {
		const server = createAgentBuiltinsServer();
		for (const tool of server.tools) {
			expect(typeof tool.description).toBe("string");
			expect(tool.description.length).toBeGreaterThan(20);
			expect(typeof tool.inputSchema).toBe("object");
			expect(server.handlers.has(tool.name)).toBe(true);
		}
	});

	it("placeholder handlers return isError until implemented", async () => {
		const server = createAgentBuiltinsServer();
		const result = await server.handlers.get("Read")!({});
		expect(result.isError).toBe(true);
	});
});
