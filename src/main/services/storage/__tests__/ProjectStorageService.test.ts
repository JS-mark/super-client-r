// @vitest-environment node
//
// A-3 ProjectStorageService 测试。所有用例用 tmp dir，避免污染真实 userData。

import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashCwd } from "../cwd";
import { ProjectStorageService } from "../ProjectStorageService";

let baseDir: string;
let svc: ProjectStorageService;

beforeEach(() => {
	baseDir = mkdtempSync(join(tmpdir(), "super-client-test-"));
	svc = new ProjectStorageService(baseDir, "default");
});

afterEach(() => {
	rmSync(baseDir, { recursive: true, force: true });
});

const userRoot = () => join(baseDir, "default");
const registryPath = () => join(userRoot(), "projects.json");
const projectDir = (id: string) => join(userRoot(), "projects", id);

describe("add", () => {
	it("creates registry entry + directory + path.txt", () => {
		const p = svc.add("/Users/mark/projects/app");
		expect(existsSync(registryPath())).toBe(true);
		expect(existsSync(projectDir(p.id))).toBe(true);
		expect(readFileSync(join(projectDir(p.id), "path.txt"), "utf-8")).toBe(
			"/Users/mark/projects/app",
		);
		expect(p.cwd).toBe("/Users/mark/projects/app");
		expect(p.id).toBe(hashCwd("/Users/mark/projects/app"));
		expect(p.name).toBe("app");
	});

	it("is idempotent: same cwd returns existing project", () => {
		const a = svc.add("/Users/mark/projects/app");
		const b = svc.add("/Users/mark/projects/app/", "Renamed");
		expect(b.id).toBe(a.id);
		expect(b.name).toBe("Renamed"); // existing record updates name on idempotent add
		expect(svc.list()).toHaveLength(1);
	});

	it("preserves paths with spaces and Chinese characters", () => {
		const cwd = "/Users/mark/项目 空格/app";
		const p = svc.add(cwd);
		expect(p.cwd).toBe(cwd);
		expect(readFileSync(join(projectDir(p.id), "path.txt"), "utf-8")).toBe(
			cwd,
		);
		expect(svc.list()[0].cwd).toBe(cwd);
	});

	it("treats symlink path and real path as separate projects", () => {
		if (process.platform === "win32") return;

		const realDir = mkdtempSync(join(tmpdir(), "super-client-real-"));
		const linkDir = join(
			tmpdir(),
			`super-client-link-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		symlinkSync(realDir, linkDir, "dir");
		try {
			const realProject = svc.add(realDir);
			const linkProject = svc.add(linkDir);
			expect(linkProject.id).not.toBe(realProject.id);
			expect(svc.list().map((project) => project.cwd).sort()).toEqual(
				[linkDir, realDir].sort(),
			);
		} finally {
			rmSync(linkDir, { force: true });
			rmSync(realDir, { recursive: true, force: true });
		}
	});

	it("rolls back registry + directory when ensureProjectFiles fails", () => {
		// Stub the private method to simulate a step-2 failure
		// (e.g. EACCES on path.txt write). Verifies the catch path's rollback.
		const original = (svc as any).ensureProjectFiles.bind(svc);
		(svc as any).ensureProjectFiles = (id: string, cwd: string) => {
			// Run original first so the dir gets created, then throw
			original(id, cwd);
			throw new Error("simulated path.txt failure");
		};

		expect(() => svc.add("/Users/mark/projects/will-fail")).toThrow(
			"simulated",
		);
		// registry must not contain the failed project
		expect(svc.list()).toHaveLength(0);
		// the partial directory must be cleaned up
		const id = hashCwd("/Users/mark/projects/will-fail");
		expect(existsSync(projectDir(id))).toBe(false);
	});
});

describe("list", () => {
	it("returns empty array when registry missing", () => {
		expect(svc.list()).toEqual([]);
	});

	it("reads back what add() wrote", () => {
		svc.add("/a/b");
		svc.add("/c/d");
		const list = svc.list();
		expect(list).toHaveLength(2);
		expect(list.map((p) => p.cwd).sort()).toEqual(["/a/b", "/c/d"]);
	});
});

describe("rename / pin", () => {
	it("rename only changes name; cwd and id unchanged", () => {
		const p = svc.add("/a/b");
		const renamed = svc.rename(p.id, "Custom");
		expect(renamed.name).toBe("Custom");
		expect(renamed.id).toBe(p.id);
		expect(renamed.cwd).toBe(p.cwd);
	});

	it("pin toggles flag", () => {
		const p = svc.add("/a/b");
		expect(svc.pin(p.id, true).pinned).toBe(true);
		expect(svc.pin(p.id, false).pinned).toBe(false);
	});
});

describe("remove", () => {
	it("keepFiles=false (default) physically deletes the directory", () => {
		const p = svc.add("/a/b");
		expect(existsSync(projectDir(p.id))).toBe(true);
		const result = svc.remove(p.id);
		expect(result).toEqual({ removed: true, orphan: false });
		expect(svc.list()).toHaveLength(0);
		expect(existsSync(projectDir(p.id))).toBe(false);
	});

	it("keepFiles=true unregisters but leaves the directory", () => {
		const p = svc.add("/a/b");
		const result = svc.remove(p.id, { keepFiles: true });
		expect(result).toEqual({ removed: true, orphan: true });
		expect(svc.list()).toHaveLength(0);
		expect(existsSync(projectDir(p.id))).toBe(true);
		expect(readFileSync(join(projectDir(p.id), "path.txt"), "utf-8")).toBe(
			"/a/b",
		);
	});
});

describe("settings", () => {
	it("getSettings returns {} when no settings.json", () => {
		const p = svc.add("/a/b");
		expect(svc.getSettings(p.id)).toEqual({});
	});

	it("saveSettings + getSettings round-trip with patch merge", () => {
		const p = svc.add("/a/b");
		svc.saveSettings(p.id, { interactionProfile: "codex" });
		expect(svc.getSettings(p.id)).toEqual({
			interactionProfile: "codex",
		});
		svc.saveSettings(p.id, {
			defaultModel: { providerId: "anthropic", modelId: "claude-3-5" },
		});
		expect(svc.getSettings(p.id)).toEqual({
			interactionProfile: "codex",
			defaultModel: { providerId: "anthropic", modelId: "claude-3-5" },
		});
	});

	it("deep-merges nested settings and clears null fields", () => {
		const p = svc.add("/a/b");
		svc.saveSettings(p.id, {
			runtimePolicy: {
				sandboxMode: "workspace-write",
				networkAccess: "blocked",
			},
		});
		svc.saveSettings(p.id, {
			runtimePolicy: {
				sandboxMode: "read-only",
				networkAccess: null,
			} as never,
		});
		expect(svc.getSettings(p.id).runtimePolicy).toEqual({
			sandboxMode: "read-only",
		});
	});

	it("treats undefined as no-op and top-level null as clear", () => {
		const p = svc.add("/a/b");
		svc.saveSettings(p.id, {
			interactionProfile: "codex",
			defaultModel: { providerId: "anthropic", modelId: "claude" },
		});
		svc.saveSettings(p.id, {
			interactionProfile: undefined,
			defaultModel: null,
		} as never);
		expect(svc.getSettings(p.id)).toEqual({
			interactionProfile: "codex",
		});
	});

	it("does not persist empty policy objects after clearing nested fields", () => {
		const p = svc.add("/a/b");
		svc.saveSettings(p.id, {
			runtimePolicy: { networkAccess: "blocked" },
		});
		svc.saveSettings(p.id, {
			runtimePolicy: { networkAccess: null } as never,
		});
		expect(svc.getSettings(p.id)).toEqual({});
	});
});

describe("hash collision guard", () => {
	it("does not overwrite an existing project when path.txt disagrees with the id", () => {
		const p = svc.add("/a/b");
		writeFileSync(
			join(projectDir(p.id), "path.txt"),
			"/different/path",
			"utf-8",
		);
		const next = svc.add("/a/b");
		expect(next.id).not.toBe(p.id);
		expect(next.id.length).toBeGreaterThan(p.id.length);
		expect(svc.list()).toHaveLength(2);
		expect(readFileSync(join(projectDir(p.id), "path.txt"), "utf-8")).toBe(
			"/different/path",
		);
	});
});

describe("orphan recovery", () => {
	it("listOrphans returns directories not in registry", () => {
		const p1 = svc.add("/a/b");
		svc.remove(p1.id, { keepFiles: true });
		const p2 = svc.add("/c/d"); // still registered
		const orphans = svc.listOrphans();
		expect(orphans.map((o) => o.cwd)).toEqual(["/a/b"]);
		expect(orphans[0].projectId).toBe(p1.id);
		expect(p2.id).not.toBe(p1.id); // sanity
	});

	it("restoreOrphan re-registers when hash matches", () => {
		const p = svc.add("/a/b");
		svc.remove(p.id, { keepFiles: true });
		expect(svc.list()).toHaveLength(0);

		const restored = svc.restoreOrphan(p.id);
		expect(restored.id).toBe(p.id);
		expect(restored.cwd).toBe("/a/b");
		expect(svc.list()).toHaveLength(1);
	});

	it("restoreOrphan throws when hash mismatch", () => {
		// Manually create an orphan with a tampered path.txt
		const fakeId = "deadbeefdeadbeef";
		const dir = projectDir(fakeId);
		require("node:fs").mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "path.txt"), "/some/other/path", "utf-8");
		expect(() => svc.restoreOrphan(fakeId)).toThrow("hash");
	});
});
