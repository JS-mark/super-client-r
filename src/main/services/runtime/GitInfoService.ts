/**
 * GitInfoService — 通过 `git` CLI 收集只读分支信息。
 *
 * 用于 Codex 环境检视等 UI surface。所有错误均被吞掉并降级为 `{ isRepo: false }`，
 * 避免阻塞渲染。3 秒内同 cwd 的查询返回缓存以避免快速重渲染时反复调用 git。
 */

import { execFile } from "child_process";
import { access, stat } from "fs/promises";
import { dirname, join } from "path";
import { promisify } from "util";

import type {
	CreateWorktreeResult,
	GitBranchInfo,
	GitCommit,
	WorktreePreflightIssue,
	WorktreePreflightLevel,
	WorktreePreflightResult,
} from "@super-client/shared-types/git";
import { logger } from "../../utils/logger";

const log = logger.withContext("GitInfoService");

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 2_000;
const GIT_WRITE_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 3_000;

export interface GitBranchListItem {
	/** Local branch short name, e.g. "main". */
	name: string;
	/** True iff this branch is currently checked out (HEAD). */
	current: boolean;
}

export interface SwitchBranchResult {
	ok: boolean;
	error?: string;
	/** Whether the failure was due to a dirty working tree (uncommitted changes). */
	dirty?: boolean;
}

export interface CreateBranchResult {
	ok: boolean;
	error?: string;
	/** The branch name actually created (echoes the request, for caller convenience). */
	branch?: string;
}

interface CacheEntry {
	expires: number;
	value: GitBranchInfo;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		timeout: GIT_TIMEOUT_MS,
		windowsHide: true,
	});
	return stdout.toString();
}

function isSafeBranchName(branch: string): boolean {
	if (!branch || branch !== branch.trim()) return false;
	if (branch.startsWith("-")) return false;
	if (branch.includes("..") || branch.includes("@{")) return false;
	if (branch.includes("\\") || /\s/.test(branch)) return false;
	if (branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) {
		return false;
	}
	return /^[A-Za-z0-9._\-/]+$/.test(branch);
}

export class GitInfoService {
	private readonly cache = new Map<string, CacheEntry>();

	async getBranchInfo(cwd: string): Promise<GitBranchInfo> {
		if (!cwd) return { isRepo: false };
		const now = Date.now();
		const cached = this.cache.get(cwd);
		if (cached && cached.expires > now) {
			return cached.value;
		}
		const value = await this.collect(cwd);
		this.cache.set(cwd, { expires: now + CACHE_TTL_MS, value });
		return value;
	}

	private async collect(cwd: string): Promise<GitBranchInfo> {
		// 1. Detect repo
		try {
			const out = (
				await runGit(cwd, ["rev-parse", "--is-inside-work-tree"])
			).trim();
			if (out !== "true") return { isRepo: false };
		} catch (err) {
			// 注意：ENOENT 表示 git 不在 PATH 上（macOS GUI 启动常见），不是
			// "不是 git 仓库"。打 warn 方便后续排查；UI 仍然降级为 isRepo:false。
			log.warn(`rev-parse failed for cwd=${cwd}`, err);
			return { isRepo: false };
		}

		const info: GitBranchInfo = { isRepo: true };

		// 2. Branch
		try {
			info.branch = (
				await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
			).trim();
		} catch {
			info.branch = undefined;
		}

		// 3. Dirty + count
		try {
			const status = await runGit(cwd, ["status", "--porcelain"]);
			// porcelain v1：每行一个变更（含 untracked），即变更文件数。空行过滤。
			const lines = status
				.split(/\r?\n/)
				.filter((line) => line.length > 0);
			info.dirtyCount = lines.length;
			info.dirty = lines.length > 0;
		} catch {
			info.dirty = undefined;
			info.dirtyCount = undefined;
		}

		// 4. Upstream + ahead/behind
		try {
			const upstream = (
				await runGit(cwd, [
					"rev-parse",
					"--abbrev-ref",
					"--symbolic-full-name",
					"@{upstream}",
				])
			).trim();
			if (upstream) info.upstream = upstream;

			const counts = (
				await runGit(cwd, [
					"rev-list",
					"--left-right",
					"--count",
					"HEAD...@{upstream}",
				])
			).trim();
			const [aheadStr, behindStr] = counts.split(/\s+/);
			const ahead = Number.parseInt(aheadStr ?? "", 10);
			const behind = Number.parseInt(behindStr ?? "", 10);
			if (Number.isFinite(ahead)) info.ahead = ahead;
			if (Number.isFinite(behind)) info.behind = behind;
		} catch {
			// No upstream configured — leave ahead/behind/upstream undefined.
		}

		return info;
	}

	/**
	 * Create a new git worktree under `worktreePath` based on a fresh branch.
	 *
	 * Wraps `git -C <cwd> worktree add -b <branchName> <worktreePath>`.
	 * Errors are normalized into `{ ok: false, error }` rather than thrown so
	 * callers can surface a friendly message without `try/catch` gymnastics.
	 */
	async createWorktree(
		cwd: string,
		worktreePath: string,
		branchName?: string,
	): Promise<CreateWorktreeResult> {
		if (!cwd || !worktreePath) {
			return { ok: false, error: "cwd and worktreePath are required" };
		}
		const branch = branchName?.trim() || `fork-${Date.now()}`;
		const preflight = await this.preflightCreateWorktree(
			cwd,
			worktreePath,
			branch,
		);
		if (!preflight.ok) {
			const firstBlock = preflight.issues.find((issue) => issue.level === "block");
			return {
				ok: false,
				error: firstBlock?.message ?? "git worktree preflight failed",
				preflight,
			};
		}
		try {
			await execFileAsync(
				"git",
				["-C", cwd, "worktree", "add", "-b", branch, worktreePath],
				{ timeout: GIT_WRITE_TIMEOUT_MS, windowsHide: true },
			);
			return { ok: true, worktreePath, preflight };
		} catch (err) {
			const stderr =
				(err as { stderr?: Buffer | string }).stderr?.toString().trim() || "";
			const message =
				stderr || (err as Error).message || "git worktree add failed";
			return { ok: false, error: message, preflight };
		}
	}

	async preflightCreateWorktree(
		cwd: string,
		worktreePath: string,
		branchName?: string,
	): Promise<WorktreePreflightResult> {
		const branch = branchName?.trim() || `fork-${Date.now()}`;
		const issues: WorktreePreflightIssue[] = [];
		const addIssue = (
			check: WorktreePreflightIssue["check"],
			level: WorktreePreflightLevel,
			message: string,
		) => {
			issues.push({ check, level, message });
		};

		if (!cwd || !worktreePath) {
			addIssue("target-path", "block", "cwd and worktreePath are required");
			return { ok: false, cwd, worktreePath, branchName: branch, issues };
		}

		try {
			const out = (
				await runGit(cwd, ["rev-parse", "--is-inside-work-tree"])
			).trim();
			if (out !== "true") {
				addIssue("git-repo", "block", "当前项目不是 Git 仓库");
			}
		} catch {
			addIssue("git-repo", "block", "当前项目不是 Git 仓库");
		}

		if (!isSafeBranchName(branch)) {
			addIssue("branch-name", "block", "分支名不合法");
		} else {
			try {
				await execFileAsync("git", ["check-ref-format", "--branch", branch], {
					timeout: GIT_TIMEOUT_MS,
					windowsHide: true,
				});
			} catch {
				addIssue("branch-name", "block", "分支名不合法");
			}
			try {
				await runGit(cwd, ["show-ref", "--verify", `refs/heads/${branch}`]);
				addIssue("branch-exists", "block", "分支已存在，请换一个分支名");
			} catch {
				// Missing branch is the expected path.
			}
		}

		try {
			await stat(worktreePath);
			addIssue("target-path", "block", "工作树目录已存在");
		} catch (err) {
			if ((err as { code?: string }).code !== "ENOENT") {
				addIssue("target-path", "block", "无法检查工作树目录");
			} else {
				try {
					await access(dirname(worktreePath));
				} catch {
					addIssue("target-path", "block", "工作树父目录不可访问");
				}
			}
		}

		try {
			const status = await runGit(cwd, ["status", "--porcelain"]);
			const dirtyCount = status.split(/\r?\n/).filter(Boolean).length;
			if (dirtyCount > 0) {
				addIssue(
					"dirty",
					"warn",
					`当前工作区有 ${dirtyCount} 个未提交变更`,
				);
			}
		} catch {
			// Repo check above already reports blocking failures.
		}

		try {
			await stat(join(cwd, ".gitmodules"));
			addIssue("submodules", "warn", "新工作树可能需要初始化子模块");
		} catch {
			// No .gitmodules.
		}

		try {
			const attrs = await runGit(cwd, [
				"grep",
				"-n",
				"filter=lfs",
				"--",
				".gitattributes",
			]);
			if (attrs.trim()) addIssue("lfs", "warn", "新工作树可能需要拉取 LFS 文件");
		} catch {
			// No tracked LFS attributes or git grep failed; keep this advisory only.
		}

		try {
			await runGit(cwd, [
				"rev-parse",
				"--abbrev-ref",
				"--symbolic-full-name",
				"@{upstream}",
			]);
		} catch {
			addIssue("upstream", "info", "当前分支无 upstream");
		}

		return {
			ok: !issues.some((issue) => issue.level === "block"),
			cwd,
			worktreePath,
			branchName: branch,
			issues,
		};
	}

	/**
	 * 列出本地分支。返回 `{name, current}[]`；非 git 仓库或调用失败返回 `[]`。
	 *
	 * 用 `git branch --format` 而不是解析 `--list` 输出，可避免本地化前缀（如
	 * `* `）干扰。currentBranch 优先取 `HEAD` 名称；detached HEAD 时返回的列表
	 * 里没有 current=true 的项（renderer 自行处理"游离 HEAD"情况）。
	 */
	async listBranches(cwd: string): Promise<GitBranchListItem[]> {
		if (!cwd) return [];
		try {
			const out = await runGit(cwd, [
				"branch",
				"--format=%(refname:short)",
			]);
			const names = out
				.split(/\r?\n/)
				.map((s) => s.trim())
				.filter(Boolean);
			let head = "";
			try {
				head = (await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
			} catch {
				head = "";
			}
			return names.map((name) => ({ name, current: name === head }));
		} catch (err) {
			// 同上：ENOENT 多半是 PATH 没找到 git。
			log.warn(`listBranches failed for cwd=${cwd}`, err);
			return [];
		}
	}

	/**
	 * 切换到指定分支：`git -C <cwd> checkout <branch>`。
	 *
	 * - 干净工作区 → 成功
	 * - 脏工作区 + 目标分支会覆盖未提交修改 → 失败，`dirty: true`
	 * - 其他错误（不存在的分支、权限等）→ `dirty: false`
	 *
	 * 切完会主动让该 cwd 的缓存失效，下一次 `getBranchInfo` 拿到的就是新分支。
	 */
	async switchBranch(
		cwd: string,
		branch: string,
	): Promise<SwitchBranchResult> {
		if (!cwd || !branch) {
			return { ok: false, error: "cwd and branch are required" };
		}
		try {
			await execFileAsync("git", ["-C", cwd, "checkout", branch], {
				timeout: GIT_WRITE_TIMEOUT_MS,
				windowsHide: true,
			});
			this.cache.delete(cwd);
			return { ok: true };
		} catch (err) {
			const stderr =
				(err as { stderr?: Buffer | string }).stderr?.toString().trim() || "";
			const message =
				stderr || (err as Error).message || "git checkout failed";
			// `git checkout` 在脏工作区会以 "Your local changes ... would be
			// overwritten" / "Please commit your changes or stash them" 提示。
			const dirty =
				/would be overwritten|commit your changes or stash|local changes/i.test(
					stderr,
				);
			return { ok: false, error: message, dirty };
		}
	}

	/**
	 * 创建并检出新分支（基于 HEAD）：`git -C <cwd> checkout -b <branch>`。
	 *
	 * 分支名只允许常见安全字符——避免空白/特殊符号被 shell 误解、避免被注入额外
	 * 参数。git 自己也有一套 refname 规则，我们用较紧的白名单先过滤一遍。
	 */
	async createBranch(
		cwd: string,
		branch: string,
	): Promise<CreateBranchResult> {
		if (!cwd || !branch) {
			return { ok: false, error: "cwd and branch are required" };
		}
		const trimmed = branch.trim();
		if (!/^[A-Za-z0-9._\-/]+$/.test(trimmed) || trimmed.startsWith("-")) {
			return { ok: false, error: "分支名仅允许字母、数字、. _ - / 且不能以 - 开头" };
		}
		try {
			await execFileAsync("git", ["-C", cwd, "checkout", "-b", trimmed], {
				timeout: GIT_WRITE_TIMEOUT_MS,
				windowsHide: true,
			});
			this.cache.delete(cwd);
			return { ok: true, branch: trimmed };
		} catch (err) {
			const stderr =
				(err as { stderr?: Buffer | string }).stderr?.toString().trim() || "";
			const message =
				stderr || (err as Error).message || "git checkout -b failed";
			return { ok: false, error: message };
		}
	}

	/**
	 * 列出最近 N 条 commit（topo order, all refs），给 Git 图谱视图使用。
	 *
	 * 解析策略：
	 *   - 用 `%x1f`（ASCII Unit Separator）分隔字段，`%x1e`（Record Separator）
	 *     分隔记录。比 `|` / `\t` 更不容易撞 commit message 内容。
	 *   - `--no-walk` 不行（要遍历），`--topo-order` 保证父子顺序稳定；
	 *     `--all` 把所有本地分支带进来；`--max-count=N` 限制规模。
	 *   - subject 用 `%s`（不包含 body），避免多行 message 把记录撕开。
	 *
	 * 限制：
	 *   - 不抓 body / files / stats —— 图谱视图当前只展示标题行。
	 *   - 失败统一返回空数组，不抛；caller 用空态 UI 处理。
	 */
	async listCommits(
		cwd: string,
		opts: { limit?: number } = {},
	): Promise<GitCommit[]> {
		if (!cwd) return [];
		const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
		const FIELD = "\u001f";
		const RECORD = "\u001e";
		const format = ["%H", "%P", "%an", "%ae", "%at", "%D", "%s"].join(FIELD);
		try {
			const out = await runGit(cwd, [
				"log",
				"--all",
				"--topo-order",
				`--max-count=${limit}`,
				`--pretty=format:${format}${RECORD}`,
			]);
			const records = out.split(RECORD).map((r) => r.trim()).filter(Boolean);
			const commits: GitCommit[] = [];
			for (const rec of records) {
				const parts = rec.split(FIELD);
				if (parts.length < 7) continue;
				const [hash, parentsRaw, author, email, atRaw, decoRaw, subject] =
					parts;
				const parents = parentsRaw
					.split(/\s+/)
					.map((s) => s.trim())
					.filter(Boolean);
				// %D 形如 "HEAD -> main, origin/main, tag: v1.0"; 我们把 "HEAD -> " 去掉，
				// 然后按逗号拆分；空串 → 空数组。
				const refs = decoRaw
					.split(",")
					.map((s) => s.trim().replace(/^HEAD -> /, ""))
					.filter(Boolean);
				const timestamp = Number.parseInt(atRaw, 10);
				commits.push({
					hash,
					parents,
					author,
					email,
					timestamp: Number.isFinite(timestamp) ? timestamp : 0,
					subject,
					refs,
				});
			}
			return commits;
		} catch (err) {
			log.warn(`listCommits failed for cwd=${cwd}`, err);
			return [];
		}
	}

	/**
	 * F-9 回滚路径：删除一个 worktree。`git -C <cwd> worktree remove <path>`，
	 * 加 `--force` 兜底（脏工作区也删，因为这是回滚场景）。失败也不抛——
	 * caller 的"主路径"已经失败，回滚 best-effort 即可。
	 */
	async removeWorktree(
		cwd: string,
		worktreePath: string,
	): Promise<{ ok: boolean; error?: string }> {
		try {
			await execFileAsync(
				"git",
				["-C", cwd, "worktree", "remove", "--force", worktreePath],
				{ timeout: GIT_WRITE_TIMEOUT_MS, windowsHide: true },
			);
			return { ok: true };
		} catch (err) {
			const stderr =
				(err as { stderr?: Buffer | string }).stderr?.toString().trim() || "";
			const message =
				stderr || (err as Error).message || "git worktree remove failed";
			return { ok: false, error: message };
		}
	}
}

let singleton: GitInfoService | null = null;

export function getGitInfoService(): GitInfoService {
	if (!singleton) singleton = new GitInfoService();
	return singleton;
}
