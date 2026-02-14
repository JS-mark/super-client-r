import {
	DeleteOutlined,
	DownloadOutlined,
	ReloadOutlined,
	SyncOutlined,
} from "@ant-design/icons";
import { Button, Modal, message, Tag } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useSkillStore } from "../../stores/skillStore";
import type { Skill } from "../../types/skills";

interface SkillDetailModalProps {
	skill: Skill | null;
	open: boolean;
	onClose: () => void;
}

export const SkillDetailModal: React.FC<SkillDetailModalProps> = ({
	skill,
	open,
	onClose,
}) => {
	const { t } = useTranslation();
	const {
		installedSkills,
		installSkill,
		uninstallSkill,
		updateSkill,
		reinstallSkill,
		checkUpdate,
	} = useSkillStore();

	if (!skill) return null;

	const isInstalled = installedSkills.some((s) => s.id === skill.id);
	const hasUpdate = checkUpdate(skill.id);
	const installedVersion = installedSkills.find(
		(s) => s.id === skill.id,
	)?.version;

	const handleInstall = () => {
		installSkill(skill);
		message.success(
			t("messages.installed", { ns: "skills", name: skill.name }),
		);
	};

	const handleUninstall = () => {
		uninstallSkill(skill.id);
		message.success(
			t("messages.uninstalled", { ns: "skills", name: skill.name }),
		);
	};

	const handleUpdate = () => {
		updateSkill(skill.id);
		message.success(t("messages.updated", { ns: "skills", name: skill.name }));
	};

	const handleReinstall = () => {
		reinstallSkill(skill.id);
		message.success(
			t("messages.reinstalled", { ns: "skills", name: skill.name }),
		);
	};

	const renderFooter = () => {
		const buttons = [];

		if (isInstalled) {
			buttons.push(
				<Button key="reinstall" onClick={handleReinstall}>
					<ReloadOutlined />
					{t("actions.reinstall", { ns: "skills" })}
				</Button>,
			);
			buttons.push(
				<Button key="uninstall" danger onClick={handleUninstall}>
					<DeleteOutlined />
					{t("actions.uninstall", { ns: "skills" })}
				</Button>,
			);
			if (hasUpdate) {
				buttons.push(
					<Button key="update" type="primary" onClick={handleUpdate}>
						<SyncOutlined />
						{t("actions.update", { ns: "skills" })}
					</Button>,
				);
			}
		} else {
			buttons.push(
				<Button key="install" type="primary" onClick={handleInstall}>
					<DownloadOutlined />
					{t("actions.install", { ns: "skills" })}
				</Button>,
			);
		}

		return buttons;
	};

	return (
		<Modal
			title={
				<div className="flex items-center gap-3">
					<span className="text-2xl">{skill.icon || "🧩"}</span>
					<div>
						<div className="text-lg font-semibold">{skill.name}</div>
						<div className="text-sm text-gray-400">
							{t("by", { ns: "skills" })} {skill.author}
						</div>
					</div>
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={renderFooter()}
			width={600}
			destroyOnHidden={true}
			maskClosable={false}
		>
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Tag>{skill.version}</Tag>
					{skill.category && <Tag>{skill.category}</Tag>}
					{isInstalled && (
						<Tag color="success">
							{t("status.installed", { ns: "skills" })}
							{installedVersion && installedVersion !== skill.version && (
								<span className="ml-1">
									({installedVersion} → {skill.version})
								</span>
							)}
						</Tag>
					)}
				</div>

				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-2">
						{t("description", "Description", { ns: "skills" })}
					</h4>
					<p className="text-gray-600 whitespace-pre-wrap">
						{skill.description}
					</p>
				</div>

				{skill.readme && (
					<div>
						<h4 className="text-sm font-medium text-gray-700 mb-2">
							{t("readme", "README", { ns: "skills" })}
						</h4>
						<div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
							<pre className="text-sm text-gray-600 whitespace-pre-wrap">
								{skill.readme}
							</pre>
						</div>
					</div>
				)}

				{skill.repository && (
					<div>
						<h4 className="text-sm font-medium text-gray-700 mb-2">
							{t("repository", "Repository", { ns: "skills" })}
						</h4>
						<a
							href={skill.repository}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:text-blue-600"
						>
							{skill.repository}
						</a>
					</div>
				)}
			</div>
		</Modal>
	);
};
