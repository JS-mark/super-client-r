// @vitest-environment node
import { mkdtemp, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMocks = vi.hoisted(() => {
	const execFileAsync = vi.fn();
	const execFile = vi.fn();
	(
		execFile as unknown as Record<symbol, typeof execFileAsync>
	)[Symbol.for("nodejs.util.promisify.custom")] = execFileAsync;
	return { execFile, execFileAsync };
});

vi.mock("child_process", () => ({
	execFile: execFileMocks.execFile,
}));

import { GitInfoService } from "../GitInfoService";

let tempRoot = "";

beforeEach(async () => {
	tempRoot = await mkdtemp(join(tmpdir(), "scr-git-preflight-"));
	execFileMocks.execFileAsync.mockReset();
});

afterEach(async () => {
	if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
	tempRoot = "";
});

function mockGit(handler: (args: string[]) => string): void {
	execFileMocks.execFileAsync.mockImplementation(
		async (_cmd: string, args: string[]) => ({
			stdout: handler(args),
			stderr: "",
		}),
	);
}

describe("GitInfoService worktree preflight", () => {
	it("blocks non-git cwd before running git worktree add", async () => {
		mockGit((args) => {
			if (args.includes("rev-parse")) throw new Error("not a repo");
			return "";
		});
		const svc = new GitInfoService();
		const result = await svc.createWorktree(
			tempRoot,
			join(tempRoot, "feature-worktree"),
			"feature/test",
		);

		expect(result.ok).toBe(false);
		expect(result.preflight?.issues).toContainEqual({
			check: "git-repo",
			level: "block",
			message: "当前项目不是 Git 仓库",
		});
		expect(execFileMocks.execFileAsync).not.toHaveBeenCalledWith(
			"git",
			expect.arrayContaining(["worktree", "add"]),
			expect.anything(),
		);
	});

	it("blocks existing worktree target paths", async () => {
		await mkdir(join(tempRoot, "existing"));
		mockGit((args) => {
			if (args.includes("--is-inside-work-tree")) return "true\n";
			if (args.includes("check-ref-format")) return "feature/test\n";
			if (args.includes("status")) return "";
			if (args.includes("@{upstream}")) return "origin/main\n";
			throw new Error("not found");
		});
		const svc = new GitInfoService();
		const result = await svc.preflightCreateWorktree(
			tempRoot,
			join(tempRoot, "existing"),
			"feature/test",
		);

		expect(result.ok).toBe(false);
		expect(result.issues).toContainEqual({
			check: "target-path",
			level: "block",
			message: "工作树目录已存在",
		});
	});

	it("blocks invalid branch names", async () => {
		mockGit((args) => {
			if (args.includes("--is-inside-work-tree")) return "true\n";
			if (args.includes("status")) return "";
			if (args.includes("@{upstream}")) return "origin/main\n";
			throw new Error("not found");
		});
		const svc = new GitInfoService();
		const result = await svc.preflightCreateWorktree(
			tempRoot,
			join(tempRoot, "feature-worktree"),
			"../escape",
		);

		expect(result.ok).toBe(false);
		expect(result.issues).toContainEqual({
			check: "branch-name",
			level: "block",
			message: "分支名不合法",
		});
		expect(execFileMocks.execFileAsync).not.toHaveBeenCalledWith(
			"git",
			expect.arrayContaining(["check-ref-format"]),
			expect.anything(),
		);
	});

	it("allows dirty source worktrees with a warning", async () => {
		mockGit((args) => {
			if (args.includes("--is-inside-work-tree")) return "true\n";
			if (args.includes("check-ref-format")) return "feature/test\n";
			if (args.includes("status")) return " M src/index.ts\n?? tmp.txt\n";
			if (args.includes("@{upstream}")) return "origin/main\n";
			if (args.includes("worktree")) return "";
			throw new Error("not found");
		});
		const svc = new GitInfoService();
		const result = await svc.createWorktree(
			tempRoot,
			join(tempRoot, "feature-worktree"),
			"feature/test",
		);

		expect(result.ok).toBe(true);
		expect(result.preflight?.issues).toContainEqual({
			check: "dirty",
			level: "warn",
			message: "当前工作区有 2 个未提交变更",
		});
		expect(execFileMocks.execFileAsync).toHaveBeenCalledWith(
			"git",
			[
				"-C",
				tempRoot,
				"worktree",
				"add",
				"-b",
				"feature/test",
				join(tempRoot, "feature-worktree"),
			],
			expect.objectContaining({ timeout: 10_000 }),
		);
	});
});
