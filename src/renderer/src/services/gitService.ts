/**
 * gitService — 渲染端只读 git 信息封装。
 *
 * 实际 IO 在主进程的 GitInfoService 内通过 `git` CLI 完成；
 * 此服务仅做调用代理与类型暴露。
 */

import type {
	CreateWorktreeResult,
	GitBranchInfo,
	GitCommit,
	WorktreePreflightResult,
} from "@super-client/shared-types/git";
import type { IPCResponse } from "../types/electron";

export const gitService = {
	getBranchInfo: (cwd: string): Promise<IPCResponse<GitBranchInfo>> =>
		window.electron.git.getBranchInfo(cwd),
	createWorktree: (
		cwd: string,
		worktreePath: string,
		branchName?: string,
	): Promise<IPCResponse<CreateWorktreeResult>> =>
		window.electron.git.createWorktree(cwd, worktreePath, branchName),
	preflightCreateWorktree: (
		cwd: string,
		worktreePath: string,
		branchName?: string,
	): Promise<IPCResponse<WorktreePreflightResult>> =>
		window.electron.git.preflightCreateWorktree(cwd, worktreePath, branchName),
	listBranches: (
		cwd: string,
	): Promise<IPCResponse<{ name: string; current: boolean }[]>> =>
		window.electron.git.listBranches(cwd),
	switchBranch: (
		cwd: string,
		branch: string,
	): Promise<IPCResponse<{ ok: boolean; error?: string; dirty?: boolean }>> =>
		window.electron.git.switchBranch(cwd, branch),
	createBranch: (
		cwd: string,
		branch: string,
	): Promise<IPCResponse<{ ok: boolean; error?: string; branch?: string }>> =>
		window.electron.git.createBranch(cwd, branch),
	listCommits: (
		cwd: string,
		opts?: { limit?: number },
	): Promise<IPCResponse<GitCommit[]>> =>
		window.electron.git.listCommits(cwd, opts),
};

export type {
	CreateWorktreeResult,
	GitBranchInfo,
	GitCommit,
	WorktreePreflightResult,
};
