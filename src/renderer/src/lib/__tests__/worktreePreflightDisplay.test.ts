import { describe, expect, it } from "vitest";
import type { WorktreePreflightResult } from "../../services/gitService";
import { describeWorktreePreflight } from "../worktreePreflightDisplay";

function result(
	issues: WorktreePreflightResult["issues"],
): WorktreePreflightResult {
	return {
		ok: !issues.some((issue) => issue.level === "block"),
		cwd: "/repo",
		worktreePath: "/repo-worktree",
		branchName: "feature/test",
		issues,
	};
}

describe("describeWorktreePreflight", () => {
	it("returns an idle info state before preflight runs", () => {
		expect(describeWorktreePreflight(null, "run checks")).toEqual({
			type: "info",
			message: "run checks",
			items: [],
			emptyDescription: "",
		});
	});

	it("surfaces blocking issues as error items", () => {
		expect(
			describeWorktreePreflight(
				result([
					{
						check: "target-path",
						level: "block",
						message: "工作树目录已存在",
					},
				]),
				"run checks",
			),
		).toMatchObject({
			type: "error",
			message: "工作树检查未通过",
			items: ["工作树目录已存在"],
		});
	});

	it("surfaces non-blocking issues as warnings", () => {
		expect(
			describeWorktreePreflight(
				result([
					{
						check: "dirty",
						level: "warn",
						message: "当前工作区有 2 个未提交变更",
					},
				]),
				"run checks",
			),
		).toMatchObject({
			type: "warning",
			message: "工作树检查有提醒",
			items: ["当前工作区有 2 个未提交变更"],
		});
	});

	it("returns success when preflight has no issues", () => {
		expect(describeWorktreePreflight(result([]), "run checks")).toEqual({
			type: "success",
			message: "工作树检查通过",
			items: [],
			emptyDescription: "可以创建新 worktree。",
		});
	});
});
