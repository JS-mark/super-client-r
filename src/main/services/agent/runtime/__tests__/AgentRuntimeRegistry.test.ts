// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type {
	AgentRuntime,
	AgentRuntimeDescriptor,
} from "@super-client/shared-types/agent-runtime";
import type { ModelSelection } from "@super-client/shared-types/chat";

import {
	AgentRuntimeRegistry,
	pickDefaultRuntimeId,
	RuntimeNotRegisteredError,
} from "../AgentRuntimeRegistry";

// ─────────────────────────── helpers ───────────────────────────

function fakeRuntime(id: string): AgentRuntime {
	const descriptor: AgentRuntimeDescriptor = {
		id: id as AgentRuntimeDescriptor["id"],
		displayName: id,
		schemaVersion: 1,
		capabilities: {
			streaming: true,
			reasoning: false,
			planMode: "host-strip",
			nativeSession: false,
			sandbox: "workspace-write",
			toolSchema: "json-schema",
			multimodalInput: ["text"],
		},
	};
	return {
		descriptor,
		// eslint-disable-next-line require-yield
		async *createQuery() {
			throw new Error("not used in tests");
		},
		async resolvePermission() {},
		async interrupt() {},
	};
}

const anthropicModel: ModelSelection = {
	providerId: "anthropic",
	modelId: "claude-3-7-sonnet",
};
const openaiModel: ModelSelection = {
	providerId: "openai",
	modelId: "gpt-4",
};

// ─────────────────────────── pickDefaultRuntimeId ───────────────────────────

describe("pickDefaultRuntimeId", () => {
	it("claude-code → claude-sdk regardless of model", () => {
		expect(
			pickDefaultRuntimeId({ profile: "claude-code", model: openaiModel }),
		).toBe("claude-sdk");
	});

	it("hybrid + anthropic → claude-sdk", () => {
		expect(
			pickDefaultRuntimeId({ profile: "hybrid", model: anthropicModel }),
		).toBe("claude-sdk");
	});

	it("hybrid + non-anthropic → llm-loop", () => {
		expect(
			pickDefaultRuntimeId({ profile: "hybrid", model: openaiModel }),
		).toBe("llm-loop");
	});

	it("codex registered → codex", () => {
		expect(
			pickDefaultRuntimeId({
				profile: "codex",
				model: openaiModel,
				codexRegistered: true,
			}),
		).toBe("codex");
	});

	it("codex unregistered → llm-loop with warning", () => {
		const warn = vi.fn();
		const id = pickDefaultRuntimeId({
			profile: "codex",
			model: openaiModel,
			codexRegistered: false,
			onCodexFallback: warn,
		});
		expect(id).toBe("llm-loop");
		expect(warn).toHaveBeenCalledOnce();
	});

	it("treats anthropic provider id case-insensitively", () => {
		expect(
			pickDefaultRuntimeId({
				profile: "hybrid",
				model: { providerId: "Anthropic", modelId: "x" },
			}),
		).toBe("claude-sdk");
	});
});

// ─────────────────────────── Registry ───────────────────────────

describe("AgentRuntimeRegistry", () => {
	it("register / get / has / list / unregister", () => {
		const r = new AgentRuntimeRegistry();
		const rt = fakeRuntime("claude-sdk");
		r.register(rt);
		expect(r.has("claude-sdk")).toBe(true);
		expect(r.get("claude-sdk")).toBe(rt);
		expect(r.list().map((d) => d.id)).toEqual(["claude-sdk"]);
		expect(r.unregister("claude-sdk")).toBe(true);
		expect(r.has("claude-sdk")).toBe(false);
	});

	it("rejects double registration", () => {
		const r = new AgentRuntimeRegistry();
		r.register(fakeRuntime("claude-sdk"));
		expect(() => r.register(fakeRuntime("claude-sdk"))).toThrow(/already/);
	});

	it("get throws RuntimeNotRegisteredError on miss", () => {
		const r = new AgentRuntimeRegistry();
		expect(() => r.get("codex")).toThrow(RuntimeNotRegisteredError);
		expect(r.tryGet("codex")).toBeNull();
	});

	it("resolveForSession honors sessionMeta.runtimeId when set", () => {
		const r = new AgentRuntimeRegistry();
		const claude = fakeRuntime("claude-sdk");
		const llm = fakeRuntime("llm-loop");
		r.register(claude);
		r.register(llm);
		const got = r.resolveForSession({
			sessionMeta: { runtimeId: "llm-loop" },
			profile: "claude-code",
			model: anthropicModel,
		});
		expect(got).toBe(llm);
	});

	it("resolveForSession throws when sessionMeta.runtimeId not registered (no silent fallback)", () => {
		const r = new AgentRuntimeRegistry();
		r.register(fakeRuntime("claude-sdk"));
		expect(() =>
			r.resolveForSession({
				sessionMeta: { runtimeId: "codex" },
				profile: "codex",
				model: openaiModel,
			}),
		).toThrow(RuntimeNotRegisteredError);
	});

	it("resolveForSession derives default when sessionMeta.runtimeId missing", () => {
		const r = new AgentRuntimeRegistry();
		const claude = fakeRuntime("claude-sdk");
		r.register(claude);
		const got = r.resolveForSession({
			sessionMeta: {},
			profile: "claude-code",
			model: anthropicModel,
		});
		expect(got).toBe(claude);
	});

	it("resolveForSession reports codex fallback through logger", () => {
		const r = new AgentRuntimeRegistry();
		const log = vi.fn();
		r.setLogger(log);
		r.register(fakeRuntime("llm-loop"));
		const got = r.resolveForSession({
			sessionMeta: {},
			profile: "codex",
			model: openaiModel,
		});
		expect(got.descriptor.id).toBe("llm-loop");
		expect(log).toHaveBeenCalledOnce();
		expect(log.mock.calls[0][0]).toMatch(/codex/);
	});

	it("disposeAll clears registry and calls each adapter dispose", async () => {
		const r = new AgentRuntimeRegistry();
		const dispose = vi.fn().mockResolvedValue(undefined);
		const rt: AgentRuntime = {
			...fakeRuntime("x"),
			dispose,
		};
		r.register(rt);
		await r.disposeAll();
		expect(dispose).toHaveBeenCalled();
		expect(r.list()).toEqual([]);
	});
});
