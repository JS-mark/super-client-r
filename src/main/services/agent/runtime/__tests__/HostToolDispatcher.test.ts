// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { EffectiveSessionRuntime } from "@super-client/shared-types/chat";
import type { ToolCallContext } from "@super-client/shared-types/agent-runtime";

import {
	HostToolDispatcher,
	type HostToolDispatcherDeps,
	injectBuiltinArgs,
	normalizeOutput,
} from "../HostToolDispatcher";

// ─────────────────────────── helpers ───────────────────────────

function runtimeWithApproval(
	mode: "request" | "auto-safe" | "full-access",
): EffectiveSessionRuntime {
	return {
		workspaceId: "ws-1",
		sessionId: "sess-1",
		model: { providerId: "anthropic", modelId: "claude-3" },
		interactionProfile: "claude-code",
		planMode: "chat",
		runtimePolicy: {
			approvalMode: mode,
			sandboxMode: "workspace-write",
			writableRoots: [],
			networkAccess: "allowed",
			externalAppAccess: "allowed",
		},
		contextPolicy: {
			defaultAttachmentMode: "include-content",
			includeWorkspaceKnowledge: false,
		},
		enabledCapabilities: [],
		attachments: [],
		approvalGrants: [],
	};
}

function ctx(over: Partial<ToolCallContext> = {}): ToolCallContext {
	return {
		conversationId: "conv-1",
		requestId: "req-1",
		callId: "call-1",
		toolName: "scp-fs__read_file",
		input: { path: "src/foo.ts" },
		origin: {
			kind: "mcp",
			serverId: "@scp/file-system",
			realName: "read_file",
		},
		runtime: runtimeWithApproval("request"),
		cwd: "/work",
		...over,
	};
}

interface MakeDepsOverrides {
	findGrant?: HostToolDispatcherDeps["approvals"]["findGrant"];
	addGrant?: HostToolDispatcherDeps["approvals"]["addGrant"];
	recordDeny?: HostToolDispatcherDeps["approvals"]["recordDeny"];
	callTool?: HostToolDispatcherDeps["mcp"]["callTool"];
	executeSkill?: HostToolDispatcherDeps["skills"]["executeSkill"];
}

function makeDeps(over: MakeDepsOverrides = {}): HostToolDispatcherDeps {
	return {
		approvals: {
			findGrant: over.findGrant ?? (() => null),
			addGrant:
				over.addGrant ??
				(() => {
					throw new Error("addGrant not stubbed in this test");
				}),
			recordDeny: over.recordDeny ?? (() => undefined),
		},
		mcp: {
			callTool: over.callTool ?? (async () => ({ success: true, data: "ok" })),
		},
		skills: {
			executeSkill:
				over.executeSkill ?? (async () => ({ success: true, output: "ok" })),
		},
	};
}

// ─────────────────────────── injectBuiltinArgs ───────────────────────────

describe("injectBuiltinArgs", () => {
	it("resolves relative paths against cwd for @scp/file-system", () => {
		const out = injectBuiltinArgs(
			"@scp/file-system",
			{ path: "src/foo.ts", other: 1 },
			"/work",
		);
		expect(out.path).toBe("/work/src/foo.ts");
		expect(out.other).toBe(1);
	});

	it("preserves absolute paths", () => {
		const out = injectBuiltinArgs(
			"@scp/file-system",
			{ path: "/abs/foo.ts" },
			"/work",
		);
		expect(out.path).toBe("/abs/foo.ts");
	});

	it("injects _storageDir for @scp/plan", () => {
		const out = injectBuiltinArgs("@scp/plan", { something: 1 }, "/work");
		expect(out._storageDir).toBe("/work/todo");
	});

	it("no-op when cwd missing", () => {
		const out = injectBuiltinArgs(
			"@scp/file-system",
			{ path: "rel" },
			undefined,
		);
		expect(out.path).toBe("rel");
	});

	it("ignores unknown servers", () => {
		const out = injectBuiltinArgs("@scp/unknown", { path: "rel" }, "/work");
		expect(out.path).toBe("rel");
	});
});

// ─────────────────────────── checkApproval ───────────────────────────

describe("HostToolDispatcher.checkApproval", () => {
	it("auto-grants when grant store hits", async () => {
		const findGrant = vi
			.fn<HostToolDispatcherDeps["approvals"]["findGrant"]>()
			.mockReturnValue({
				id: "g1",
				operationType: "tool:@scp/file-system:read_file",
				scope: "session",
				target: "src/foo.ts",
				grantedAt: 0,
			});
		const deps = makeDeps({ findGrant });
		const d = new HostToolDispatcher(deps);
		const r = await d.checkApproval(ctx());
		expect(r).toEqual({ kind: "allow", source: "auto-grant" });
		expect(findGrant).toHaveBeenCalledWith({
			conversationId: "conv-1",
			operationType: "tool:@scp/file-system:read_file",
			target: "src/foo.ts",
		});
	});

	it("full-access mode auto-allows by policy", async () => {
		const deps = makeDeps();
		const d = new HostToolDispatcher(deps);
		const r = await d.checkApproval(
			ctx({ runtime: runtimeWithApproval("full-access") }),
		);
		expect(r).toEqual({ kind: "allow", source: "auto-policy" });
	});

	it("request mode asks", async () => {
		const deps = makeDeps();
		const d = new HostToolDispatcher(deps);
		const r = await d.checkApproval(ctx());
		expect(r.kind).toBe("ask");
		if (r.kind !== "ask") return;
		expect(typeof r.approvalId).toBe("string");
	});

	it("auto-safe mode also asks (Phase 1 保守)", async () => {
		const deps = makeDeps();
		const d = new HostToolDispatcher(deps);
		const r = await d.checkApproval(
			ctx({ runtime: runtimeWithApproval("auto-safe") }),
		);
		expect(r.kind).toBe("ask");
	});
});

// ─────────────────────────── execute ───────────────────────────

describe("HostToolDispatcher.execute", () => {
	it("dispatches MCP with cwd resolution", async () => {
		const callTool = vi
			.fn<HostToolDispatcherDeps["mcp"]["callTool"]>()
			.mockResolvedValue({ success: true, data: "ok" });
		const d = new HostToolDispatcher(makeDeps({ callTool }));
		const r = await d.execute(ctx());
		expect(r.isError).toBe(false);
		expect(callTool).toHaveBeenCalledWith("@scp/file-system", "read_file", {
			path: "/work/src/foo.ts",
		});
		expect(r.content.kind).toBe("text");
	});

	it("dispatches skill by serverId prefix", async () => {
		const executeSkill = vi
			.fn<HostToolDispatcherDeps["skills"]["executeSkill"]>()
			.mockResolvedValue({ success: true, output: "skill-ok" });
		const d = new HostToolDispatcher(makeDeps({ executeSkill }));
		const r = await d.execute(
			ctx({
				origin: { kind: "skill", serverId: "skill:foo", realName: "bar" },
				toolName: "skill-foo__bar",
				input: { x: 1 },
			}),
		);
		expect(executeSkill).toHaveBeenCalledWith("foo", "bar", { x: 1 });
		expect(r.content.kind).toBe("text");
		if (r.content.kind === "text") expect(r.content.text).toBe("skill-ok");
	});

	it("returns ErrorResult on tool failure", async () => {
		const callTool = vi
			.fn<HostToolDispatcherDeps["mcp"]["callTool"]>()
			.mockResolvedValue({ success: false, error: "boom" });
		const d = new HostToolDispatcher(makeDeps({ callTool }));
		const r = await d.execute(ctx());
		expect(r.isError).toBe(true);
		expect(r.content.kind).toBe("error");
		if (r.content.kind === "error") expect(r.content.message).toBe("boom");
	});

	it("returns ErrorResult when call throws", async () => {
		const callTool = vi
			.fn<HostToolDispatcherDeps["mcp"]["callTool"]>()
			.mockRejectedValue(new Error("kaboom"));
		const d = new HostToolDispatcher(makeDeps({ callTool }));
		const r = await d.execute(ctx());
		expect(r.isError).toBe(true);
		if (r.content.kind === "error") expect(r.content.message).toBe("kaboom");
	});
});

// ─────────────────────────── normalizeOutput ───────────────────────────

describe("normalizeOutput", () => {
	it("string → text", () => {
		expect(normalizeOutput("hi")).toEqual({ kind: "text", text: "hi" });
	});

	it("null/undefined → empty text", () => {
		expect(normalizeOutput(null)).toEqual({ kind: "text", text: "" });
		expect(normalizeOutput(undefined)).toEqual({ kind: "text", text: "" });
	});

	it("MCP content array (single text) → text", () => {
		const r = normalizeOutput({ content: [{ type: "text", text: "hello" }] });
		expect(r).toEqual({ kind: "text", text: "hello" });
	});

	it("MCP content array (mixed) → mixed", () => {
		const r = normalizeOutput({
			content: [
				{ type: "text", text: "a" },
				{ type: "image", data: "BASE64", mimeType: "image/jpeg" },
			],
		});
		expect(r.kind).toBe("mixed");
		if (r.kind !== "mixed") return;
		expect(r.parts).toHaveLength(2);
		expect(r.parts[1]).toEqual({
			kind: "image",
			source: "BASE64",
			mime: "image/jpeg",
		});
	});

	it("plain object → structured", () => {
		const r = normalizeOutput({ foo: 1 });
		expect(r.kind).toBe("structured");
		if (r.kind !== "structured") return;
		expect(r.data).toEqual({ foo: 1 });
	});
});
