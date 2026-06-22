import { DiffOutlined } from "@ant-design/icons";
import { App, Card, Collapse, Tag, Typography } from "antd";
import type * as React from "react";
import { useCallback, useMemo } from "react";
import { fileActionService } from "../../services/fileActionService";
import type { ChatFileChangeSet } from "../../types/electron";

interface ChangedFilesSummaryProps {
	changeSet: ChatFileChangeSet;
}

type FileEntry = ChatFileChangeSet["files"][number];

const STATUS_TAG: Record<
	FileEntry["status"],
	{ color: string; label: string }
> = {
	added: { color: "green", label: "A" },
	modified: { color: "blue", label: "M" },
	deleted: { color: "red", label: "D" },
	renamed: { color: "purple", label: "R" },
};

function formatDelta(additions: number, deletions: number): string | null {
	if (additions === 0 && deletions === 0) return null;
	const parts: string[] = [];
	if (additions > 0) parts.push(`+${additions}`);
	if (deletions > 0) parts.push(`-${deletions}`);
	return parts.join(" ");
}

export const ChangedFilesSummary: React.FC<ChangedFilesSummaryProps> = ({
	changeSet,
}) => {
	const { message } = App.useApp();
	const { files, additions, deletions } = changeSet;

	const handleReveal = useCallback(
		async (path: string) => {
			const result = await fileActionService.reveal(path);
			if (!result.success) {
				message.error(result.error ?? "操作失败");
				return;
			}
			const data = result.data;
			if (data && data.ok === false) {
				message.error(data.error ?? "操作失败");
			}
		},
		[message],
	);

	const headingDelta = useMemo(
		() => formatDelta(additions, deletions),
		[additions, deletions],
	);

	if (!files || files.length === 0) return null;

	const heading = (
		<div className="flex items-center gap-2 text-sm">
			<DiffOutlined className="text-slate-500" />
			<span className="font-medium">{files.length} 个文件变更</span>
			{headingDelta && (
				<>
					<span className="text-slate-400">·</span>
					<span className="text-slate-500">{headingDelta}</span>
				</>
			)}
		</div>
	);

	return (
		<Card size="small" className="my-1">
			<Collapse
				ghost
				size="small"
				items={[
					{
						key: "files",
						label: heading,
						children: (
							<div className="flex flex-col gap-1">
								{files.map((f) => {
									const tag = STATUS_TAG[f.status];
									const delta = formatDelta(f.additions, f.deletions);
									return (
										<button
											type="button"
											key={`${f.path}-${f.status}`}
											className="flex items-center gap-2 text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
											onClick={() => {
												void handleReveal(f.path);
											}}
										>
											<Tag color={tag.color} className="!m-0">
												{tag.label}
											</Tag>
											<Typography.Text
												ellipsis={{ tooltip: f.path }}
												className="flex-1 min-w-0 text-xs"
											>
												{f.path}
											</Typography.Text>
											{delta && (
												<span className="text-xs text-slate-500 shrink-0">
													{delta}
												</span>
											)}
										</button>
									);
								})}
							</div>
						),
					},
				]}
			/>
		</Card>
	);
};
