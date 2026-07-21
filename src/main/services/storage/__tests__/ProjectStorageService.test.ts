// @vitest-environment node
//
// A-3 ProjectStorageService 测试。所有用例用 tmp dir，避免污染真实 userData。

import {
	existsSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

	it("keepFiles=false deletes app-managed project session data", () => {
		const p = svc.add("/a/b");
		const sessionsDir = join(projectDir(p.id), "sessions");
		const sessionDir = join(sessionsDir, "session-1");
		mkdirSync(join(sessionDir, "attachments"), { recursive: true });
		mkdirSync(join(sessionDir, "tool-outputs", "content-refs"), {
			recursive: true,
		});
		writeFileSync(join(sessionsDir, "session-1.jsonl"), "{}\n", "utf-8");
		writeFileSync(join(sessionsDir, "session-1.meta.json"), "{}", "utf-8");
		writeFileSync(
			join(sessionDir, "attachments", "file.txt"),
			"payload",
			"utf-8",
		);
		writeFileSync(
			join(sessionDir, "tool-outputs", "content-refs", "ref.txt"),
			"output",
			"utf-8",
		);

		const result = svc.remove(p.id);

		expect(result).toEqual({ removed: true, orphan: false });
		expect(existsSync(sessionsDir)).toBe(false);
		expect(existsSync(projectDir(p.id))).toBe(false);
	});

	it("keepFiles=true preserves app-managed project session data for orphan recovery", () => {
		const p = svc.add("/a/b");
		const sessionsDir = join(projectDir(p.id), "sessions");
		mkdirSync(sessionsDir, { recursive: true });
		writeFileSync(join(sessionsDir, "session-1.jsonl"), "{}\n", "utf-8");
		writeFileSync(join(sessionsDir, "session-1.meta.json"), "{}", "utf-8");

		const result = svc.remove(p.id, { keepFiles: true });

		expect(result).toEqual({ removed: true, orphan: true });
		expect(existsSync(join(sessionsDir, "session-1.jsonl"))).toBe(true);
		expect(existsSync(join(sessionsDir, "session-1.meta.json"))).toBe(true);
	});

	it("keepFiles=false deletes historical cwd .scr-data sessions without deleting cwd files", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-cwd-"));
		try {
			const p = svc.add(cwd);
			const scrSessionsDir = join(cwd, ".scr-data", "sessions");
			mkdirSync(scrSessionsDir, { recursive: true });
			writeFileSync(join(scrSessionsDir, "legacy.jsonl"), "{}\n", "utf-8");
			writeFileSync(join(cwd, "source.txt"), "user file", "utf-8");

			const result = svc.remove(p.id);

			expect(result).toEqual({ removed: true, orphan: false });
			expect(existsSync(scrSessionsDir)).toBe(false);
			expect(readFileSync(join(cwd, "source.txt"), "utf-8")).toBe(
				"user file",
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("keepFiles=true preserves historical cwd .scr-data sessions", () => {
		const cwd = mkdtempSync(join(tmpdir(), "super-client-project-cwd-"));
		try {
			const p = svc.add(cwd);
			const scrSessionsDir = join(cwd, ".scr-data", "sessions");
			mkdirSync(scrSessionsDir, { recursive: true });
			writeFileSync(join(scrSessionsDir, "legacy.jsonl"), "{}\n", "utf-8");

			const result = svc.remove(p.id, { keepFiles: true });

			expect(result).toEqual({ removed: true, orphan: true });
			expect(existsSync(join(scrSessionsDir, "legacy.jsonl"))).toBe(true);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
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

	it("deleteOrphan removes the app-managed dir without touching project.cwd", () => {
		// Create a real orphan whose "cwd" is a file the test writes ITSELF —
		// then assert that the file is still there after deleteOrphan. This
		// pins the load-bearing invariant "deleteOrphan must never rmSync
		// the user's real project working directory".
		const cwdSurface = mkdtempSync(join(tmpdir(), "orphan-cwd-"));
		const p = svc.add(cwdSurface);
		svc.remove(p.id, { keepFiles: true });
		// Sanity: the orphan storage dir + the user's cwd both exist now.
		expect(existsSync(projectDir(p.id))).toBe(true);
		expect(existsSync(cwdSurface)).toBe(true);
		const result = svc.deleteOrphan(p.id);
		expect(result.removed).toBe(true);
		// The app-managed storage dir is gone.
		expect(existsSync(projectDir(p.id))).toBe(false);
		// The user's real project working directory is UNTOUCHED.
		expect(existsSync(cwdSurface)).toBe(true);
		rmSync(cwdSurface, { recursive: true, force: true });
	});

	it("deleteOrphan is idempotent when the orphan dir no longer exists", () => {
		const p = svc.add("/a/b");
		svc.remove(p.id, { keepFiles: true });
		expect(svc.deleteOrphan(p.id).removed).toBe(true);
		expect(svc.deleteOrphan(p.id).removed).toBe(false);
	});

	it("deleteOrphan refuses unsafe projectId (path escape)", () => {
		expect(() => svc.deleteOrphan("../etc")).toThrow(/unsafe/);
		expect(() => svc.deleteOrphan("foo/bar")).toThrow(/unsafe/);
		expect(() => svc.deleteOrphan("foo\\bar")).toThrow(/unsafe/);
		expect(() => svc.deleteOrphan("")).toThrow(/unsafe/);
	});

	it("deleteOrphan refuses to delete a registered project", () => {
		const p = svc.add("/a/b");
		// Still in the registry → must not be deletable as orphan.
		expect(() => svc.deleteOrphan(p.id)).toThrow(/registered/);
	});

	it("relinkOrphan renames storage dir to the new hash and registers newCwd", () => {
		const oldCwd = "/a/moved-from";
		const newCwd = "/a/moved-to";
		const p = svc.add(oldCwd);
		const oldId = p.id;
		svc.remove(oldId, { keepFiles: true });
		expect(svc.list()).toHaveLength(0);
		expect(existsSync(projectDir(oldId))).toBe(true);

		const relinked = svc.relinkOrphan(oldId, newCwd);
		const newId = hashCwd(newCwd);
		expect(relinked.id).toBe(newId);
		expect(relinked.cwd).toBe(newCwd);
		// Storage dir renamed: old id gone, new id present.
		expect(existsSync(projectDir(oldId))).toBe(false);
		expect(existsSync(projectDir(newId))).toBe(true);
		// path.txt refreshed to the new cwd.
		expect(readFileSync(join(projectDir(newId), "path.txt"), "utf-8")).toBe(
			newCwd,
		);
		// Registry now contains the new project.
		expect(svc.list().map((p) => p.id)).toEqual([newId]);
	});

	it("relinkOrphan degrades to restore-style behavior when newCwd hash matches", () => {
		const cwd = "/a/same";
		const p = svc.add(cwd);
		svc.remove(p.id, { keepFiles: true });
		// Relinking to the same cwd should NOT rename (hash unchanged) but
		// should still re-register the project.
		const relinked = svc.relinkOrphan(p.id, cwd);
		expect(relinked.id).toBe(p.id);
		expect(existsSync(projectDir(p.id))).toBe(true);
		expect(svc.list().map((p) => p.id)).toEqual([p.id]);
	});

	it("relinkOrphan refuses when the target hash dir already exists", () => {
		// Create two orphans; try to relink one onto the other's id.
		const p1 = svc.add("/a/one");
		const p2 = svc.add("/a/two");
		svc.remove(p1.id, { keepFiles: true });
		svc.remove(p2.id, { keepFiles: true });
		// Attempt to relink p1's orphan to p2's cwd — target dir already
		// exists at hashCwd("/a/two") == p2.id.
		expect(() => svc.relinkOrphan(p1.id, "/a/two")).toThrow(
			/target dir already exists/,
		);
		// Both orphan dirs still intact.
		expect(existsSync(projectDir(p1.id))).toBe(true);
		expect(existsSync(projectDir(p2.id))).toBe(true);
	});

	it("relinkOrphan refuses unsafe projectId + registered project + missing source dir", () => {
		expect(() => svc.relinkOrphan("../etc", "/a/b")).toThrow(/unsafe/);
		expect(() => svc.relinkOrphan("foo/bar", "/a/b")).toThrow(/unsafe/);
		const registered = svc.add("/a/live");
		expect(() =>
			svc.relinkOrphan(registered.id, "/a/live-renamed"),
		).toThrow(/registered/);
		expect(() =>
			svc.relinkOrphan("deadbeefdeadbeef", "/a/nowhere"),
		).toThrow(/not found/);
	});
});

describe("archive session cascade sink", () => {
	it("invokes the sink when archive() actually flips the project state", () => {
		const p = svc.add("/a/b");
		const sink = vi.fn();
		svc.setArchiveSessionsSink(sink);
		svc.archive(p.id, true);
		expect(sink).toHaveBeenCalledTimes(1);
		expect(sink).toHaveBeenCalledWith(p.id, true);
		// Unarchive path also flips.
		svc.archive(p.id, false);
		expect(sink).toHaveBeenCalledTimes(2);
		expect(sink).toHaveBeenLastCalledWith(p.id, false);
	});

	it("does NOT invoke the sink on a no-op archive (state unchanged)", () => {
		const p = svc.add("/a/b");
		svc.archive(p.id, true);
		const sink = vi.fn();
		svc.setArchiveSessionsSink(sink);
		// Already archived — second call is a no-op, sink must not fire.
		svc.archive(p.id, true);
		expect(sink).not.toHaveBeenCalled();
	});

	it("archive() swallows sink errors and still commits the registry", () => {
		const p = svc.add("/a/b");
		svc.setArchiveSessionsSink(() => {
			throw new Error("session cascade unreachable");
		});
		// Registry write should still succeed.
		const result = svc.archive(p.id, true);
		expect(result.archived).toBe(true);
		expect(svc.list().find((x) => x.id === p.id)?.archived).toBe(true);
	});
});
