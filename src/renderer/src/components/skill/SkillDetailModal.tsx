import {
	DeleteOutlined,
	DownloadOutlined,
	ReloadOutlined,
	SyncOutlined,
} from "@ant-design/icons";
import { App, Button, Modal, Tag } from "antd";
import type * as React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSkillStore } from "../../stores/skillStore";
import type { Skill } from "../../types/skills";
import { SkillValidationReportModal } from "./SkillValidationReportModal";

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
	const { message } = App.useApp();
	const { t } = useTranslation();
	const {
		installedSkills,
		installSkill,
		uninstallSkill,
		updateSkill,
		reinstallSkill,
		checkUpdate,
	} = useSkillStore();

	const [validationResult, setValidationResult] = useState<unknown>(null);
	const [validationOpen, setValidationOpen] = useState(false);
	const [validating, setValidating] = useState(false);
	const [installing, setInstalling] = useState(false);

	if (!skill) return null;

	const isInstalled = installedSkills.some((s) => s.id === skill.id);
	const hasUpdate = checkUpdate(skill.id);
	const installedVersion = installedSkills.find(
		(s) => s.id === skill.id,
	)?.version;

	const handleInstall = useCallback(async () => {
		if (!skill.repository) {
			// No source path available, fall back to direct install
			installSkill(skill);
			message.success(
				t("messages.installed", { ns: "skills", name: skill.name }),
			);
			return;
		}

		// Validate first
		setValidating(true);
		try {
			const res = await window.electron.skill.validateSkill(skill.repository);
			if (res.success && res.data) {
				setValidationResult(res.data);
				setValidationOpen(true);
			} else {
				// Validation call itself failed, fall back to direct install
				installSkill(skill);
				message.success(
					t("messages.installed", { ns: "skills", name: skill.name }),
				);
			}
		} catch {
			// IPC error, fall back to direct install
			installSkill(skill);
			message.success(
				t("messages.installed", { ns: "skills", name: skill.name }),
			);
		} finally {
			setValidating(false);
		}
	}, [skill, installSkill, t]);

	const handleConfirmInstall = useCallback(async () => {
		setInstalling(true);
		try {
			installSkill(skill);
			message.success(
				t("messages.installed", { ns: "skills", name: skill.name }),
			);
			setValidationOpen(false);
			onClose();
		} finally {
			setInstalling(false);
		}
	}, [skill, installSkill, t, onClose]);

	const handleUninstall = useCallback(() => {
		uninstallSkill(skill.id);
		message.success(
			t("messages.uninstalled", { ns: "skills", name: skill.name }),
		);
	}, [skill, uninstallSkill, t]);

	const handleUpdate = useCallback(() => {
		updateSkill(skill.id);
		message.success(t("messages.updated", { ns: "skills", name: skill.name }));
	}, [skill, updateSkill, t]);

	const handleReinstall = useCallback(() => {
		reinstallSkill(skill.id);
		message.success(
			t("messages.reinstalled", { ns: "skills", name: skill.name }),
		);
	}, [skill, reinstallSkill, t]);

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
				<Button
					key="install"
					type="primary"
					loading={validating}
					onClick={handleInstall}
				>
					<DownloadOutlined />
					{validating
						? t("validation.validating", { ns: "skills" })
						: t("actions.install", { ns: "skills" })}
				</Button>,
			);
		}

		return buttons;
	};

	return (
		<>
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

			<SkillValidationReportModal
				result={validationResult as any}
				open={validationOpen}
				onClose={() => setValidationOpen(false)}
				onConfirmInstall={handleConfirmInstall}
				installing={installing}
			/>
		</>
	);
};
