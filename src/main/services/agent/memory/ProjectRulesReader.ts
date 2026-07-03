/**
 * ProjectRulesReader — Phase 3 R10 (Memory / Context) MVP.
 *
 * Read-only accessor for a project's rules files (`AGENTS.md`, `CLAUDE.md`).
 *
 * Contract (per requirements §4 R10 and §7):
 *   - 项目规则：只读 `AGENTS.md` / `CLAUDE.md` — NEVER edited via UI or code path.
 *   - Missing files are non-fatal: they simply yield an empty snapshot field.
 *   - Reads are size-bounded (128 KiB) so a runaway file cannot blow the main
 *     process heap; when truncated the caller is told via `truncated: true`.
 *   - Path safety: rules files must resolve inside `cwd` — symlinks that
 *     escape (via `..` or absolute targets outside the project root) are
 *     refused. `path.relative` + `fs.realpath` fencing mirrors the pattern
 *     used by `SkillValidator`.
 *
 * This service is NOT yet wired into any Agent system-prompt injection. It
 * only exposes a safe read API that later batches (prompt-context builder,
 * settings pane) can compose on top of.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

/** Files this reader knows about, in the order it probes them. */
export const PROJECT_RULES_FILENAMES = ["AGENTS.md", "CLAUDE.md"] as const;

/** Hard cap on read size (bytes). Files above this are truncated. */
export const PROJECT_RULES_MAX_BYTES = 128 * 1024;

export interface ProjectRulesFile {
	/** Absolute (real) path of the file that was read. */
	path: string;
	/** UTF-8 content, possibly truncated to `PROJECT_RULES_MAX_BYTES`. */
	content: string;
	/** SHA-256 of the *raw file bytes* (not of the truncated slice). */
	sha256: string;
	/** Length in bytes of the raw file (before truncation). */
	byteLength: number;
	/** True if `content` was truncated to the byte cap. */
	truncated: boolean;
}

export interface ProjectRulesSnapshot {
	agentsMd?: ProjectRulesFile;
	claudeMd?: ProjectRulesFile;
	/** `Date.now()` at the moment the snapshot was built. */
	readAt: number;
}

export interface ProjectRulesReaderOptions {
	/** Override the byte cap (mainly for tests). */
	maxBytes?: number;
	/** Injectable clock (mainly for tests). */
	now?: () => number;
}

export class ProjectRulesReader {
	private readonly maxBytes: number;
	private readonly now: () => number;

	constructor(options: ProjectRulesReaderOptions = {}) {
		this.maxBytes = options.maxBytes ?? PROJECT_RULES_MAX_BYTES;
		this.now = options.now ?? Date.now;
	}

	async readProjectRules(cwd: string): Promise<ProjectRulesSnapshot> {
		const snapshot: ProjectRulesSnapshot = { readAt: this.now() };
		if (!cwd || typeof cwd !== "string") return snapshot;

		let cwdReal: string;
		try {
			cwdReal = await fs.realpath(cwd);
		} catch {
			// cwd itself is missing / unreadable → nothing to read.
			return snapshot;
		}

		const agentsMd = await this.readSingle(cwdReal, "AGENTS.md");
		if (agentsMd) snapshot.agentsMd = agentsMd;
		const claudeMd = await this.readSingle(cwdReal, "CLAUDE.md");
		if (claudeMd) snapshot.claudeMd = claudeMd;

		return snapshot;
	}

	private async readSingle(
		cwdReal: string,
		filename: string,
	): Promise<ProjectRulesFile | undefined> {
		const candidate = path.join(cwdReal, filename);

		// Reject any `..` segment before touching the filesystem. path.join
		// already collapses these but a caller could pass a filename with
		// separators — defensive guard.
		if (filename.includes(path.sep) || filename.includes("..")) return undefined;

		let resolvedReal: string;
		try {
			resolvedReal = await fs.realpath(candidate);
		} catch {
			// Missing file (ENOENT) or dangling symlink → skip silently.
			return undefined;
		}

		if (!isInside(cwdReal, resolvedReal)) {
			// Symlink escape: refuse silently rather than throwing so a single
			// misconfigured project can't break the caller.
			return undefined;
		}

		let stat: import("node:fs").Stats;
		try {
			stat = await fs.stat(resolvedReal);
		} catch {
			return undefined;
		}
		if (!stat.isFile()) return undefined;

		const buffer = await fs.readFile(resolvedReal);
		const byteLength = buffer.length;
		const truncated = byteLength > this.maxBytes;
		const slice = truncated ? buffer.subarray(0, this.maxBytes) : buffer;
		const content = slice.toString("utf8");
		const sha256 = createHash("sha256").update(buffer).digest("hex");

		return {
			path: resolvedReal,
			content,
			sha256,
			byteLength,
			truncated,
		};
	}
}

/**
 * True iff `target` resolves inside `root`. Both arguments must already be
 * `fs.realpath`-resolved. Handles the `target === root` edge case (which
 * `path.relative` reports as empty string).
 */
function isInside(root: string, target: string): boolean {
	if (target === root) return true;
	const rel = path.relative(root, target);
	if (!rel) return false;
	if (rel.startsWith("..")) return false;
	if (path.isAbsolute(rel)) return false;
	return true;
}
