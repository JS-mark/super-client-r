// @vitest-environment node
//
// G-4 SessionRuntimeResolver overlay 测试。
// 数据源：SessionMeta + ProjectSettings + GLOBAL_RUNTIME_DEFAULTS。
// 解析顺序：global ← project ← session meta ← message override（每字段独立）。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStorageService } from "../../storage/ProjectStorageService";
import { SessionStorageService } from "../../storage/SessionStorageService";
import { SessionRuntimeResolver } from "../SessionRuntimeResolver";

let baseDir: string;
let projects: ProjectStorageService;
let sessions: SessionStorageService;

function makeResolver(): SessionRuntimeResolver {
	const fakeStoreManager = {
		getActiveModelSelection: () => ({
			providerId: "global-provider",
			modelId: "global-model",
		}),
	};
	return new SessionRuntimeResolver(
		fakeStoreManager as never,
		sessions,
		projects,
	);
}

beforeEach(() => {
	baseDir = mkdtempSync(join(tmpdir(), "super-client-resolver-test-"));
	projects = new ProjectStorageService(baseDir, "default");
	sessions = new SessionStorageService(baseDir, "default", projects);
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
});

describe("SessionRuntimeResolver overlay", () => {
	it("falls back to global defaults when nothing else set", () => {
		const s = sessions.create({ projectId: null });
		const r = makeResolver().resolve({ sessionId: s.id });
		expect(r.interactionProfile).toBe("hybrid");
		expect(r.runtimePolicy.approvalMode).toBe("request");
		expect(r.runtimePolicy.sandboxMode).toBe("workspace-write");
		expect(r.contextPolicy.defaultAttachmentMode).toBe("ask-before-read");
		expect(r.planMode).toBe("chat");
		expect(r.model).toEqual({
			providerId: "global-provider",
			modelId: "global-model",
		});
	});

	it("project settings override global defaults", () => {
		const p = projects.add("/proj");
		projects.saveSettings(p.id, {
			interactionProfile: "claude-code",
			runtimePolicy: { sandboxMode: "read-only" },
			defaultModel: { providerId: "p-prov", modelId: "p-model" },
		});
		const s = sessions.create({ projectId: p.id });
		const r = makeResolver().resolve({ sessionId: s.id });
		expect(r.interactionProfile).toBe("claude-code");
		expect(r.runtimePolicy.sandboxMode).toBe("read-only");
		// 未覆盖字段保留全局
		expect(r.runtimePolicy.approvalMode).toBe("request");
		expect(r.model).toEqual({ providerId: "p-prov", modelId: "p-model" });
	});

	it("session meta override beats project settings", () => {
		const p = projects.add("/proj");
		projects.saveSettings(p.id, {
			interactionProfile: "claude-code",
			defaultModel: { providerId: "p-prov", modelId: "p-model" },
		});
		const s = sessions.create({ projectId: p.id });
		sessions.updateMeta(s.id, {
			interactionProfileOverride: "codex",
			modelOverride: { providerId: "s-prov", modelId: "s-model" },
			planMode: "plan-only",
		});
		const r = makeResolver().resolve({ sessionId: s.id });
		expect(r.interactionProfile).toBe("codex");
		expect(r.model).toEqual({ providerId: "s-prov", modelId: "s-model" });
		expect(r.planMode).toBe("plan-only");
	});

	it("message override beats everything", () => {
		const p = projects.add("/proj");
		projects.saveSettings(p.id, { interactionProfile: "claude-code" });
		const s = sessions.create({ projectId: p.id });
		sessions.updateMeta(s.id, { interactionProfileOverride: "codex" });
		const r = makeResolver().resolve({
			sessionId: s.id,
			messageOverride: {
				model: { providerId: "msg-prov", modelId: "msg-model" },
				interactionProfile: "hybrid",
				planMode: "auto-execute-safe",
			},
		});
		expect(r.interactionProfile).toBe("hybrid");
		expect(r.model).toEqual({
			providerId: "msg-prov",
			modelId: "msg-model",
		});
		expect(r.planMode).toBe("auto-execute-safe");
	});

	it("casual session resolves with workspaceId='default'", () => {
		const s = sessions.create({ projectId: null });
		const r = makeResolver().resolve({ sessionId: s.id });
		expect(r.workspaceId).toBe("default");
	});

	it("project session uses projectId as workspaceId", () => {
		const p = projects.add("/proj");
		const s = sessions.create({ projectId: p.id });
		const r = makeResolver().resolve({ sessionId: s.id });
		expect(r.workspaceId).toBe(p.id);
	});

	it("throws SESSION_NOT_FOUND for unknown session", () => {
		expect(() => makeResolver().resolve({ sessionId: "nope" })).toThrow(
			/Session not found/,
		);
	});

	it("approvalGrants come from session meta", () => {
		const s = sessions.create({ projectId: null });
		sessions.updateMeta(s.id, {
			approvalGrants: [
				{
					id: "g1",
					operationType: "shell",
					scope: "session",
					target: "rm",
					grantedAt: 1,
				},
			],
		});
		const r = makeResolver().resolve({ sessionId: s.id });
		expect(r.approvalGrants).toHaveLength(1);
		expect(r.approvalGrants[0].id).toBe("g1");
	});
});
