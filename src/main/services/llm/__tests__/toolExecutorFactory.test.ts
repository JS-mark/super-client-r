// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	injectBuiltinArgs,
	type AgentBuiltinsContext,
} from "../toolExecutorFactory";

describe("injectBuiltinArgs", () => {
	it("returns args unchanged for unknown server", () => {
		const out = injectBuiltinArgs(
			"@scp/unknown",
			{ x: 1 },
			"/proj",
		);
		expect(out).toEqual({ x: 1 });
	});

	it("injects _storageDir for @scp/plan", () => {
		const out = injectBuiltinArgs("@scp/plan", { title: "t" }, "/proj");
		expect(out._storageDir).toBe("/proj/todo");
		expect(out.title).toBe("t");
	});

	it("injects _storageDir for @scp/task", () => {
		const out = injectBuiltinArgs("@scp/task", {}, "/proj");
		expect(out._storageDir).toBe("/proj/todo");
	});

	it("resolves relative `path` arg for @scp/file-system", () => {
		const out = injectBuiltinArgs(
			"@scp/file-system",
			{ path: "src/foo.ts" },
			"/proj",
		);
		expect(out.path).toBe("/proj/src/foo.ts");
	});

	it("leaves absolute paths alone", () => {
		const out = injectBuiltinArgs(
			"@scp/file-system",
			{ path: "/abs/foo.ts" },
			"/proj",
		);
		expect(out.path).toBe("/abs/foo.ts");
	});

	it("resolves `source` + `destination` for @scp/grep too", () => {
		const out = injectBuiltinArgs(
			"@scp/grep",
			{ source: "a", destination: "b" },
			"/proj",
		);
		expect(out.source).toBe("/proj/a");
		expect(out.destination).toBe("/proj/b");
	});

	describe("@scp/agent-builtins context injection", () => {
		const ctx: AgentBuiltinsContext = {
			provider: {
				baseUrl: "https://x.test/v1",
				apiKey: "sk-x",
				model: "m1",
				providerPreset: "openai",
				apiFormat: "chat-completions",
			},
			scpPort: 31337,
			scpApiKey: "sk-self",
			parentRequestId: "r1",
			taskDepth: 1,
			parentConversationId: "conv-root",
			parentAssistantMessageId: "assistant-root",
		};

		it("injects _cwd + provider + Task recursion context", () => {
			const out = injectBuiltinArgs(
				"@scp/agent-builtins",
				{ path: "foo.ts" },
				"/proj",
				ctx,
			);
			expect(out._cwd).toBe("/proj");
			expect(out._provider).toEqual(ctx.provider);
			expect(out._scpPort).toBe(31337);
			expect(out._scpApiKey).toBe("sk-self");
			expect(out._parentRequestId).toBe("r1");
			expect(out._taskDepth).toBe(1);
			expect(out._parentConversationId).toBe("conv-root");
			expect(out._parentAssistantMessageId).toBe("assistant-root");
		});

		it("resolves relative path against cwd", () => {
			const out = injectBuiltinArgs(
				"@scp/agent-builtins",
				{ path: "src/foo.ts" },
				"/proj",
				ctx,
			);
			expect(out.path).toBe("/proj/src/foo.ts");
		});

		it("preserves _taskDepth from caller (Task recursion threads it)", () => {
			const out = injectBuiltinArgs(
				"@scp/agent-builtins",
				{ _taskDepth: 2 },
				"/proj",
				ctx,
			);
			expect(out._taskDepth).toBe(2);
		});

		it("omits ctx fields when not provided", () => {
			const out = injectBuiltinArgs(
				"@scp/agent-builtins",
				{ path: "foo" },
				"/proj",
				{},
			);
			expect(out._provider).toBeUndefined();
			expect(out._scpPort).toBeUndefined();
			expect(out._scpApiKey).toBeUndefined();
			// _cwd still injected from workspaceDir
			expect(out._cwd).toBe("/proj");
		});

		it("works without workspaceDir (no _cwd, but ctx still applied)", () => {
			const out = injectBuiltinArgs(
				"@scp/agent-builtins",
				{ path: "foo" },
				undefined,
				ctx,
			);
			expect(out._cwd).toBeUndefined();
			expect(out._provider).toEqual(ctx.provider);
			expect(out._scpPort).toBe(31337);
		});
	});
});
