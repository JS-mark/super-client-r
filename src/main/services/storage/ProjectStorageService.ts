/**
 * Project / Session 重设计 A-3 — ProjectStorageService
 *
 * 项目 registry + 物理目录管理。负责：
 *  - `<baseDir>/<userId>/projects.json` 持久化 Project[] 列表
 *  - `<baseDir>/<userId>/projects/<projectId>/` 目录结构（含 path.txt 备份）
 *  - settings.json 项目级 sparse 配置
 *  - 孤儿目录扫描与恢复（单向：仅 hash 一致的孤儿可恢复，hash 不一致需手动迁移）
 *
 * 不做：
 *  - session 内容（A-5 SessionStorageService 负责）
 *  - 跨设备同步 / 备份
 *
 * 多用户隔离跟 ConversationStorageService 一致：每个 userId 一份 projects.json，
 * 每个用户独立的 projects/ 子树。构造注入 baseDir + userId 便于测试 (tmp dir)。
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type {
	Project,
	ProjectSettings,
} from "@super-client/shared-types/project";
import { hashCwd, normalizeCwd } from "./cwd";

/** 物理目录布局（per user）：
 *
 *   <baseDir>/<userId>/
 *     projects.json
 *     projects/<projectId>/
 *       path.txt          — cwd 字面量备份，恢复 / 验证用
 *       settings.json     — 可选；不存在时返回 {}
 *       sessions/         — 由 A-5 SessionStorageService 写
 */
const REGISTRY_FILE = "projects.json";
const PROJECTS_DIR = "projects";
const PATH_FILE = "path.txt";
const SETTINGS_FILE = "settings.json";
const SCR_DATA_DIR = ".scr-data";
const PROJECT_SESSIONS_DIR = "sessions";

export interface ListOrphansEntry {
	projectId: string;
	cwd: string;
	sessionCount: number;
}

export class ProjectStorageService {
	private readonly userRoot: string;

	constructor(baseDir: string, userId: string = "default") {
		this.userRoot = join(baseDir, userId);
		mkdirSync(this.userRoot, { recursive: true });
	}

	// ─── public API ──────────────────────────────────────────────

	list(): Project[] {
		const path = this.registryPath();
		if (!existsSync(path)) return [];
		try {
			const raw = readFileSync(path, "utf-8");
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return [];
			return parsed.filter(isValidProject);
		} catch {
			return [];
		}
	}

	get(id: string): Project | null {
		return this.list().find((project) => project.id === id) ?? null;
	}

	getProjectDataDir(id: string): string {
		return this.projectDir(id);
	}

	getProjectSessionsDir(id: string): string {
		return join(this.projectDir(id), PROJECT_SESSIONS_DIR);
	}

	getProjectScrDataDir(id: string): string | null {
		const project = this.get(id);
		if (!project) return null;
		return join(project.cwd, SCR_DATA_DIR);
	}

	getProjectScrSessionsDir(id: string): string | null {
		const scrDataDir = this.getProjectScrDataDir(id);
		return scrDataDir ? join(scrDataDir, PROJECT_SESSIONS_DIR) : null;
	}

	canUseProjectScrData(
		id: string,
	): { ok: true } | { ok: false; reason: string } {
		const project = this.get(id);
		if (!project) return { ok: false, reason: "project-not-found" };
		if (!existsSync(project.cwd)) return { ok: false, reason: "cwd-missing" };
		try {
			const stat = statSync(project.cwd);
			if (!stat.isDirectory())
				return { ok: false, reason: "cwd-not-directory" };
		} catch {
			return { ok: false, reason: "cwd-unreadable" };
		}
		try {
			const scrDataDir = join(project.cwd, SCR_DATA_DIR);
			const sessionsDir = join(scrDataDir, PROJECT_SESSIONS_DIR);
			mkdirSync(sessionsDir, { recursive: true });
			return { ok: true };
		} catch {
			return { ok: false, reason: "scr-data-not-writable" };
		}
	}

	/**
	 * Add a project. Idempotent: same cwd → same id → returns existing record.
	 * Transactional: if creating the project directory or path.txt fails, the
	 * registry change is rolled back so we never leave a half-written project.
	 */
	add(
		cwd: string,
		name?: string,
		opts?: { lineage?: Project["lineage"] },
	): Project {
		const normalizedCwd = normalizeCwd(cwd);
		const id = this.resolveProjectId(normalizedCwd);
		const list = this.list();
		const existing = list.find((p) => p.id === id);
		if (existing) {
			// idempotent: bump lastSeenAt and update cwd / name only if needed
			const now = Date.now();
			const merged: Project = {
				...existing,
				cwd: normalizedCwd,
				name: name ?? existing.name,
				// lineage 一旦写入不允许后续 add 覆盖（避免误改派生关系）
				lastSeenAt: now,
				updatedAt: now,
			};
			this.writeRegistry(list.map((p) => (p.id === id ? merged : p)));
			// also ensure path.txt exists in case of legacy data
			this.ensureProjectFiles(id, normalizedCwd);
			return merged;
		}

		const now = Date.now();
		const project: Project = {
			id,
			cwd: normalizedCwd,
			name: name ?? basename(normalizedCwd),
			...(opts?.lineage ? { lineage: opts.lineage } : {}),
			createdAt: now,
			updatedAt: now,
			lastSeenAt: now,
		};

		// Step 1: write registry first so we can roll back from a single mutation
		const next = [...list, project];
		this.writeRegistry(next);

		// Step 2: create directory + path.txt. Roll back on any failure.
		try {
			this.ensureProjectFiles(id, normalizedCwd);
		} catch (err) {
			this.writeRegistry(list); // roll back registry
			// also clean up partial directory
			const dir = this.projectDir(id);
			if (existsSync(dir)) {
				try {
					rmSync(dir, { recursive: true, force: true });
				} catch {
					/* best-effort */
				}
			}
			throw err;
		}

		return project;
	}

	rename(id: string, name: string): Project {
		const list = this.list();
		const idx = list.findIndex((p) => p.id === id);
		if (idx < 0) throw new Error(`project not found: ${id}`);
		const updated: Project = {
			...list[idx],
			name,
			updatedAt: Date.now(),
		};
		const next = [...list];
		next[idx] = updated;
		this.writeRegistry(next);
		return updated;
	}

	pin(id: string, pinned: boolean): Project {
		const list = this.list();
		const idx = list.findIndex((p) => p.id === id);
		if (idx < 0) throw new Error(`project not found: ${id}`);
		const updated: Project = {
			...list[idx],
			pinned,
			updatedAt: Date.now(),
		};
		const next = [...list];
		next[idx] = updated;
		this.writeRegistry(next);
		return updated;
	}

	/**
	 * G-7: 把项目标记为"用户已看过项目首页"。下次打开同项目就不再展示首页 CTA。
	 * 幂等：再次调用不报错也不再写入。
	 */
	markFirstRunSeen(id: string): Project {
		const list = this.list();
		const idx = list.findIndex((p) => p.id === id);
		if (idx < 0) throw new Error(`project not found: ${id}`);
		if (list[idx].firstRunSeen) return list[idx];
		const updated: Project = {
			...list[idx],
			firstRunSeen: true,
			updatedAt: Date.now(),
		};
		const next = [...list];
		next[idx] = updated;
		this.writeRegistry(next);
		return updated;
	}

	/**
	 * F-1: 归档 / 取消归档项目。session 数据不动，仅切 `archived` flag。
	 * sidebar 渲染层默认 filter `(!archived)`；恢复入口在 Settings 高级页。
	 */
	archive(id: string, archived: boolean): Project {
		const list = this.list();
		const idx = list.findIndex((p) => p.id === id);
		if (idx < 0) throw new Error(`project not found: ${id}`);
		if (!!list[idx].archived === archived) return list[idx];
		const updated: Project = {
			...list[idx],
			archived,
			updatedAt: Date.now(),
		};
		const next = [...list];
		next[idx] = updated;
		this.writeRegistry(next);
		return updated;
	}

	/**
	 * Remove a project from the registry. Defaults to physical delete.
	 * `keepFiles: true` leaves `<projectId>/` on disk so the user can later
	 * restore it via `restoreOrphan`.
	 */
	remove(
		id: string,
		opts: { keepFiles?: boolean } = {},
	): {
		removed: boolean;
		orphan: boolean;
	} {
		const list = this.list();
		if (!list.some((p) => p.id === id)) {
			return { removed: false, orphan: false };
		}
		const scrSessionsDir = this.getProjectScrSessionsDir(id);
		this.writeRegistry(list.filter((p) => p.id !== id));
		if (!opts.keepFiles) {
			const dir = this.projectDir(id);
			if (existsSync(dir)) {
				rmSync(dir, { recursive: true, force: true });
			}
			if (scrSessionsDir && existsSync(scrSessionsDir)) {
				rmSync(scrSessionsDir, { recursive: true, force: true });
			}
			return { removed: true, orphan: false };
		}
		return { removed: true, orphan: true };
	}

	getSettings(id: string): ProjectSettings {
		const path = join(this.projectDir(id), SETTINGS_FILE);
		if (!existsSync(path)) return {};
		try {
			const raw = readFileSync(path, "utf-8");
			return JSON.parse(raw) as ProjectSettings;
		} catch {
			return {};
		}
	}

	saveSettings(id: string, patch: Partial<ProjectSettings>): ProjectSettings {
		const dir = this.projectDir(id);
		if (!existsSync(dir)) {
			throw new Error(`project not found: ${id}`);
		}
		const current = this.getSettings(id);
		const merged = deepMergeSettings(current, patch);
		writeFileSync(
			join(dir, SETTINGS_FILE),
			JSON.stringify(merged, null, 2),
			"utf-8",
		);
		return merged;
	}

	/**
	 * Scan `projects/` directory for entries not present in `projects.json`.
	 * Each orphan is reported with its cwd (read from `path.txt`) and a rough
	 * count of session meta files for UI.
	 */
	listOrphans(): ListOrphansEntry[] {
		const projectsRoot = join(this.userRoot, PROJECTS_DIR);
		if (!existsSync(projectsRoot)) return [];
		const registered = new Set(this.list().map((p) => p.id));
		const orphans: ListOrphansEntry[] = [];
		for (const entry of readdirSync(projectsRoot)) {
			if (entry.startsWith(".")) continue;
			if (registered.has(entry)) continue;
			const dir = join(projectsRoot, entry);
			const pathFile = join(dir, PATH_FILE);
			if (!existsSync(pathFile)) continue;
			try {
				const cwd = readFileSync(pathFile, "utf-8").trim();
				if (!cwd) continue;
				const sessionsDir = join(dir, "sessions");
				let sessionCount = 0;
				if (existsSync(sessionsDir)) {
					sessionCount = readdirSync(sessionsDir).filter((f) =>
						f.endsWith(".meta.json"),
					).length;
				}
				orphans.push({ projectId: entry, cwd, sessionCount });
			} catch {
				// corrupted entry — skip
			}
		}
		return orphans;
	}

	/**
	 * Re-register an orphaned project. Only supports the common case where
	 * the orphan's directory id still equals `hashCwd(cwd)` (the cwd hasn't
	 * been edited externally). hash mismatch is reported as an error so the
	 * caller can guide the user to a manual migration.
	 */
	restoreOrphan(projectId: string): Project {
		const dir = this.projectDir(projectId);
		const pathFile = join(dir, PATH_FILE);
		if (!existsSync(pathFile)) {
			throw new Error(`orphan ${projectId} has no path.txt`);
		}
		const cwd = readFileSync(pathFile, "utf-8").trim();
		const expectedId = hashCwd(cwd);
		if (expectedId !== projectId) {
			throw new Error(
				`orphan id mismatch: dir=${projectId} but hash(${cwd})=${expectedId}; ` +
					"manual migration required (out of scope for restoreOrphan)",
			);
		}
		// re-add via the normal path; idempotent will preserve directory contents
		return this.add(cwd);
	}

	// ─── helpers ─────────────────────────────────────────────────

	private registryPath(): string {
		return join(this.userRoot, REGISTRY_FILE);
	}

	private projectDir(id: string): string {
		return join(this.userRoot, PROJECTS_DIR, id);
	}

	private writeRegistry(projects: Project[]): void {
		writeFileSync(
			this.registryPath(),
			JSON.stringify(projects, null, 2),
			"utf-8",
		);
	}

	private ensureProjectFiles(id: string, cwd: string): void {
		const dir = this.projectDir(id);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, PATH_FILE), cwd, "utf-8");
	}

	private resolveProjectId(normalizedCwd: string): string {
		const baseId = hashCwd(normalizedCwd);
		const existingPath =
			this.readPathFile(baseId) ??
			this.list().find((project) => project.id === baseId)?.cwd ??
			null;
		if (!existingPath || normalizeCwd(existingPath) === normalizedCwd) {
			return baseId;
		}
		// Hash collision or externally edited path.txt. Use deterministic longer
		// prefixes of the same hash input and never overwrite the existing project.
		for (const len of [24, 32, 40, 64]) {
			const candidate = hashCwdWithLength(normalizedCwd, len);
			const candidatePath =
				this.readPathFile(candidate) ??
				this.list().find((project) => project.id === candidate)?.cwd ??
				null;
			if (!candidatePath || normalizeCwd(candidatePath) === normalizedCwd) {
				return candidate;
			}
		}
		throw new Error(`unable to allocate project id for cwd: ${normalizedCwd}`);
	}

	private readPathFile(id: string): string | null {
		const pathFile = join(this.projectDir(id), PATH_FILE);
		if (!existsSync(pathFile)) return null;
		try {
			const value = readFileSync(pathFile, "utf-8").trim();
			return value || null;
		} catch {
			return null;
		}
	}
}

function basename(p: string): string {
	const parts = p.split(/[/\\]/);
	return parts[parts.length - 1] || p;
}

function hashCwdWithLength(cwd: string, length: number): string {
	// Keep this helper local so `hashCwd` remains the canonical 16-char public id.
	return createHash("sha256")
		.update(normalizeCwd(cwd))
		.digest("hex")
		.slice(0, length);
}

function deepMergeSettings(
	current: ProjectSettings,
	patch: Partial<ProjectSettings>,
): ProjectSettings {
	const merged: ProjectSettings = { ...current };
	for (const [key, value] of Object.entries(patch) as Array<
		[keyof ProjectSettings, ProjectSettings[keyof ProjectSettings] | null]
	>) {
		if (value === undefined) continue;
		if (value === null) {
			delete merged[key];
			continue;
		}
		const currentValue = merged[key];
		if (isPlainObject(currentValue) && isPlainObject(value)) {
			(merged as Record<string, unknown>)[key] = removeUndefinedAndNullClears(
				currentValue as Record<string, unknown>,
				value as Record<string, unknown>,
			);
		} else {
			(merged as Record<string, unknown>)[key] = value;
		}
	}
	return removeEmptyObjects(merged) as ProjectSettings;
}

function removeUndefinedAndNullClears(
	current: Record<string, unknown>,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		if (value === null) delete next[key];
		else next[key] = value;
	}
	return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function removeEmptyObjects(value: unknown): unknown {
	if (!isPlainObject(value)) return value;
	const next: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (child === undefined || child === null) continue;
		const cleaned = removeEmptyObjects(child);
		if (isPlainObject(cleaned) && Object.keys(cleaned).length === 0) {
			continue;
		}
		next[key] = cleaned;
	}
	return next;
}

// ─────────────────────────────────────────────────────────────────────
// Singleton (initialized from main.ts after app.whenReady)
// ─────────────────────────────────────────────────────────────────────

let _singleton: ProjectStorageService | null = null;

/**
 * Called from main.ts once `app.getPath('userData')` is available.
 * The current implementation does not yet swap userId on login/logout —
 * that happens by re-calling `initializeProjectStorage` from the auth
 * handler (analogous to ConversationStorageService.setCurrentUser).
 */
export function initializeProjectStorage(
	baseDir: string,
	userId: string = "default",
): ProjectStorageService {
	_singleton = new ProjectStorageService(baseDir, userId);
	return _singleton;
}

export function getProjectStorage(): ProjectStorageService {
	if (!_singleton) {
		throw new Error(
			"ProjectStorageService not initialized — call initializeProjectStorage() first",
		);
	}
	return _singleton;
}

function isValidProject(p: unknown): p is Project {
	if (!p || typeof p !== "object") return false;
	const r = p as Record<string, unknown>;
	return (
		typeof r.id === "string" &&
		typeof r.cwd === "string" &&
		typeof r.name === "string" &&
		typeof r.createdAt === "number" &&
		typeof r.updatedAt === "number" &&
		typeof r.lastSeenAt === "number"
	);
}
