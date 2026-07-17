import { CopyOutlined, UndoOutlined } from "@ant-design/icons";
import { Button, Empty, Tag, Typography, message } from "antd";
import { LiteList as List } from "@/components/ui/LiteList";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toRedactedPathLabel } from "@/lib/privacyDisplay";
import { fileActionService } from "../../services/fileActionService";
import { useProjectStore } from "../../stores/projectStore";

const { Text } = Typography;

export function ArchivedProjectsPanel() {
	const { t } = useTranslation();
	const projects = useProjectStore((s) => s.projects);
	const archive = useProjectStore((s) => s.archive);

	const archivedProjects = useMemo(
		() => projects.filter((p) => p.archived),
		[projects],
	);

	const handleRestore = async (id: string, name: string) => {
		try {
			await archive(id, false);
			message.success(
				t("settingsNav.recovery.archivedRestoreSuccess", "Project restored: {{name}}", {
					ns: "settings",
					name,
				}),
			);
		} catch (err) {
			message.error(
				err instanceof Error
					? err.message
					: t("settingsNav.recovery.archivedRestoreError", "Restore failed", {
							ns: "settings",
						}),
			);
		}
	};

	const handleCopyPath = async (cwd: string) => {
		const result = await fileActionService.copyPath(cwd);
		if (result.success) {
			message.success(
				t("settingsNav.recovery.pathCopied", "Full path copied", {
					ns: "settings",
				}),
			);
			return;
		}
		message.error(
			result.error ??
				t("settingsNav.recovery.copyPathError", "Failed to copy path", {
					ns: "settings",
				}),
		);
	};

	if (archivedProjects.length === 0) {
		return (
			<Empty
				description={t(
					"settingsNav.recovery.noArchivedProjects",
					"No archived projects",
					{ ns: "settings" },
				)}
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				className="py-8"
			/>
		);
	}

	return (
		<div className="space-y-3">
			<Text type="secondary" className="block text-sm">
				{t(
					"settingsNav.recovery.archivedProjectsHint",
					"Projects hidden from the sidebar. Session data stays in app-managed storage and becomes visible immediately after restore.",
					{ ns: "settings" },
				)}
			</Text>
			<List
				bordered
				dataSource={archivedProjects}
				renderItem={(project) => (
					<List.Item
						actions={[
							<Button
								key="copy"
								type="link"
								icon={<CopyOutlined />}
								onClick={() => handleCopyPath(project.cwd)}
							>
								{t("settingsNav.recovery.copyFullPath", "Copy full path", {
									ns: "settings",
								})}
							</Button>,
							<Button
								key="restore"
								type="link"
								icon={<UndoOutlined />}
								onClick={() => handleRestore(project.id, project.name)}
							>
								{t("settingsNav.recovery.restore", "Restore", {
									ns: "settings",
								})}
							</Button>,
						]}
					>
						<List.Item.Meta
							title={
								<span className="flex items-center gap-2">
									<span>{project.name}</span>
									{project.lineage?.kind === "worktree-of" && (
										<Tag color="purple">worktree</Tag>
									)}
								</span>
							}
							description={
								<div className="flex flex-col gap-0.5 text-xs">
									<code className="text-slate-500">
										{toRedactedPathLabel(project.cwd)}
									</code>
									<span className="text-slate-400">
										{t(
											"settingsNav.recovery.archivedUpdatedAt",
											"Archived at {{time}}",
											{
												ns: "settings",
												time: new Date(project.updatedAt).toLocaleString(),
											},
										)}
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
