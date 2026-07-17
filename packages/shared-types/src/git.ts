/**
 * Git 分支信息类型
 *
 * 由 main 进程的 GitInfoService 通过 `git` CLI 收集的只读视图。
 * 仅用于 UI 显示，不承载任何写操作语义。
 */

export interface GitBranchInfo {
	/** 目录是否处于一个 git 工作区中 */
	isRepo: boolean;
	/** 当前分支名（detached HEAD 时为 "HEAD"） */
	branch?: string;
	/** 是否存在未提交修改（含 untracked） */
	dirty?: boolean;
	/** 未提交变更的文件数（含 untracked）。`dirty=false` 时为 0；查询失败时 undefined。 */
	dirtyCount?: number;
	/** 相对 upstream 领先的提交数 */
	ahead?: number;
	/** 相对 upstream 落后的提交数 */
	behind?: number;
	/** upstream 引用，例如 "origin/main"。若无 upstream 则为 undefined */
	upstream?: string;
}

/**
 * 单个 commit 的元数据，用于 Git 图谱视图。
 * 字段命名向 git 字段对齐（hash / parents / author / date / refs / subject）
 * 以便未来扩展（committer, body, gpgsign 等）不破坏 wire format。
 */
export interface GitCommit {
	/** 完整 40 位 sha */
	hash: string;
	/** 父提交的 hash 列表（merge commit 有 2 个，root commit 为空数组） */
	parents: string[];
	/** 作者显示名 */
	author: string;
	/** 作者邮箱 */
	email: string;
	/** 作者时间戳（unix seconds） */
	timestamp: number;
	/** commit message 首行 */
	subject: string;
	/**
	 * 关联的 ref 名称（git log %D 输出），如 `HEAD -> main, origin/main, tag: v1.0`。
	 * 已按逗号拆分并去除 "HEAD -> " 等前缀，得到一个干净的标签字符串数组。
	 */
	refs: string[];
}

export type WorktreePreflightLevel = "block" | "warn" | "info";

export interface WorktreePreflightIssue {
	check:
		| "git-repo"
		| "target-path"
		| "branch-name"
		| "branch-exists"
		| "dirty"
		| "submodules"
		| "lfs"
		| "upstream";
	level: WorktreePreflightLevel;
	message: string;
}

export interface WorktreePreflightResult {
	ok: boolean;
	cwd: string;
	worktreePath: string;
	branchName: string;
	issues: WorktreePreflightIssue[];
}

export interface CreateWorktreeResult {
	ok: boolean;
	error?: string;
	worktreePath?: string;
	preflight?: WorktreePreflightResult;
}
