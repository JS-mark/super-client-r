import { Button, Switch, message, theme } from "antd";
import type React from "react";
import { useCallback } from "react";
import {
	type FeatureFlags,
	useFeatureFlagsStore,
} from "../../stores/featureFlagsStore";

const { useToken } = theme;

interface FlagRow {
	key: keyof FeatureFlags;
	title: string;
	description: string;
}

const ROWS: FlagRow[] = [
	{
		key: "runtimeEnforcement",
		title: "运行时策略 enforcement",
		description:
			"开启后会按工作区策略阻断高风险操作（当前：external-app 设为 blocked 时，文件 open / openWith 被拒绝执行）。审计日志始终记录，关闭此项只是绕过 enforcement 决策。",
	},
	{
		key: "fileArtifacts",
		title: "文件结果卡 / 变更摘要",
		description:
			"关闭后会话中不再渲染文件卡和变更摘要；底层 capture 仍运行，重新打开此项即可恢复显示。",
	},
	{
		key: "profileLayouts",
		title: "交互档案布局切换",
		description:
			"关闭后无论 workspace 的 interactionProfile 是什么，始终使用 Codex 风格 sidebar；ClaudeSidebar / ClaudeEmptyChatHome 不再被路由。",
	},
];

export const FeatureFlagsSettings: React.FC = () => {
	const { token } = useToken();
	const unifiedNavigation = useFeatureFlagsStore((s) => s.unifiedNavigation);
	const runtimeEnforcement = useFeatureFlagsStore((s) => s.runtimeEnforcement);
	const fileArtifacts = useFeatureFlagsStore((s) => s.fileArtifacts);
	const profileLayouts = useFeatureFlagsStore((s) => s.profileLayouts);
	const flags: FeatureFlags = {
		unifiedNavigation,
		runtimeEnforcement,
		fileArtifacts,
		profileLayouts,
	};
	const setFlag = useFeatureFlagsStore((s) => s.setFlag);
	const reset = useFeatureFlagsStore((s) => s.reset);

	const handleReset = useCallback(() => {
		reset();
		message.success("已重置");
	}, [reset]);

	return (
		<div className="flex flex-col gap-3">
			<div
				className="text-[13px] mb-1"
				style={{ color: token.colorTextSecondary }}
			>
				实验性功能可在出现回归时关闭对应能力，无需重装或回滚版本。
			</div>

			{ROWS.map((row) => (
				<div
					key={row.key}
					className="rounded-lg flex items-start gap-3"
					style={{
						border: `1px solid ${token.colorBorderSecondary}`,
						padding: 16,
						background: token.colorBgContainer,
					}}
				>
					<Switch
						checked={flags[row.key]}
						onChange={(value) => setFlag(row.key, value)}
					/>
					<div className="flex-1 min-w-0">
						<div
							className="text-[14px] font-medium"
							style={{ color: token.colorText }}
						>
							{row.title}
						</div>
						<div
							className="text-[12px] mt-1"
							style={{ color: token.colorTextSecondary }}
						>
							{row.description}
						</div>
					</div>
				</div>
			))}

			<div className="pt-2">
				<Button onClick={handleReset}>重置默认</Button>
			</div>
		</div>
	);
};
