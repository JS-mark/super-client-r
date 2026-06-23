/**
 * F-8 — 已归档项目管理面板。
 *
 * 在 Settings → 项目管理 下展示所有 `archived === true` 的项目；用户点
 * 「恢复」会把 archived 翻回 false，sidebar 立即看到。
 */

import { Button, Empty, Tag, Typography, message } from "antd";
import { LiteList as List } from "@/components/ui/LiteList";
import { useMemo } from "react";
import { useProjectStore } from "../../stores/projectStore";

const { Text } = Typography;

export function ProjectArchiveManager() {
	const projects = useProjectStore((s) => s.projects);
	const archive = useProjectStore((s) => s.archive);

	const archivedProjects = useMemo(
		() => projects.filter((p) => p.archived),
		[projects],
	);

	const handleRestore = async (id: string, name: string) => {
		try {
			await archive(id, false);
			message.success(`已恢复项目：${name}`);
		} catch (err) {
			message.error(err instanceof Error ? err.message : "恢复失败");
		}
	};

	if (archivedProjects.length === 0) {
		return (
			<Empty
				description="没有已归档的项目"
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				className="py-8"
			/>
		);
	}

	return (
		<div className="space-y-3">
			<Text type="secondary" className="block text-sm">
				从 sidebar 隐藏的项目。session 数据原地保留，恢复后立即可见。
			</Text>
			<List
				bordered
				dataSource={archivedProjects}
				renderItem={(p) => (
					<List.Item
						actions={[
							<Button
								key="restore"
								type="link"
								onClick={() => handleRestore(p.id, p.name)}
							>
								恢复
							</Button>,
						]}
					>
						<List.Item.Meta
							title={
								<span className="flex items-center gap-2">
									<span>{p.name}</span>
									{p.lineage?.kind === "worktree-of" && (
										<Tag color="purple">worktree</Tag>
									)}
								</span>
							}
							description={
								<div className="flex flex-col gap-0.5 text-xs">
									<code className="text-slate-500">{p.cwd}</code>
									<span className="text-slate-400">
										归档于 {new Date(p.updatedAt).toLocaleString()}
									</span>
								</div>
							}
						/>
					</List.Item>
				)}
			/>
		</div>
	);
}
