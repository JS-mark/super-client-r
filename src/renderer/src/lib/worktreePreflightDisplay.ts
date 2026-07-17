import type { WorktreePreflightResult } from "../services/gitService";

export type WorktreePreflightAlertType = "info" | "success" | "warning" | "error";

export interface WorktreePreflightDisplay {
	type: WorktreePreflightAlertType;
	message: string;
	items: string[];
	emptyDescription: string;
}

export function describeWorktreePreflight(
	result: WorktreePreflightResult | null,
	idleMessage: string,
): WorktreePreflightDisplay {
	if (!result) {
		return {
			type: "info",
			message: idleMessage,
			items: [],
			emptyDescription: "",
		};
	}
	const items = result.issues.map((issue) => issue.message);
	if (result.issues.some((issue) => issue.level === "block")) {
		return {
			type: "error",
			message: "工作树检查未通过",
			items,
			emptyDescription: "",
		};
	}
	if (result.issues.length > 0) {
		return {
			type: "warning",
			message: "工作树检查有提醒",
			items,
			emptyDescription: "",
		};
	}
	return {
		type: "success",
		message: "工作树检查通过",
		items,
		emptyDescription: "可以创建新 worktree。",
	};
}
