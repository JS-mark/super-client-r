import {
	DeleteOutlined,
	DownloadOutlined,
	EllipsisOutlined,
	ReloadOutlined,
	SyncOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Card, Dropdown, Tag, Tooltip, message } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSkillStore } from "../../stores/skillStore";
import type { Skill } from "../../types/skills";

export const SkillCard: React.FC<{
	skill: Skill;
	onClick: () => void;
}> = ({ skill, onClick }) => {
	const { t } = useTranslation();
	const {
		installedSkills,
		installSkill,
		uninstallSkill,
		updateSkill,
		reinstallSkill,
		checkUpdate,
	} = useSkillStore();

	const isInstalled = installedSkills.some((s) => s.id === skill.id);
	const hasUpdate = checkUpdate(skill.id);
	const installedVersion = installedSkills.find(
		(s) => s.id === skill.id,
	)?.version;

	const handleInstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		installSkill(skill);
		message.success(
			t("messages.installed", { ns: "skills", name: skill.name }),
		);
	};

	const handleUninstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		uninstallSkill(skill.id);
		message.success(
			t("messages.uninstalled", { ns: "skills", name: skill.name }),
		);
	};

	const handleUpdate = (e: React.MouseEvent) => {
		e.stopPropagation();
		updateSkill(skill.id);
		message.success(t("messages.updated", { ns: "skills", name: skill.name }));
	};

	const handleReinstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		reinstallSkill(skill.id);
		message.success(
			t("messages.reinstalled", { ns: "skills", name: skill.name }),
		);
	};

	const mainActions: React.ReactNode[] = [];
	const moreItems: MenuProps["items"] = [];

	if (isInstalled) {
		if (hasUpdate) {
			mainActions.push(
				<Button
					key="update"
					type="primary"
					size="small"
					icon={<SyncOutlined />}
					onClick={handleUpdate}
				>
					{t("actions.update", { ns: "skills" })}
				</Button>,
			);
		}
		mainActions.push(
			<Button
				key="reinstall"
				size="small"
				icon={<ReloadOutlined />}
				onClick={handleReinstall}
			>
				{t("actions.reinstall", { ns: "skills" })}
			</Button>,
		);
		mainActions.push(
			<Button
				key="uninstall"
				size="small"
				danger
				icon={<DeleteOutlined />}
				onClick={handleUninstall}
			>
				{t("actions.uninstall", { ns: "skills" })}
			</Button>,
		);
	} else {
		mainActions.push(
			<Button
				key="install"
				type="primary"
				size="small"
				icon={<DownloadOutlined />}
				onClick={handleInstall}
			>
				{t("actions.install", { ns: "skills" })}
			</Button>,
		);
	}

	const actions: React.ReactNode[] = [...mainActions];

	if (moreItems.length > 0) {
		actions.push(
			<Dropdown key="more" menu={{ items: moreItems }} trigger={["click"]}>
				<Button type="text" size="small" icon={<EllipsisOutlined />} />
			</Dropdown>,
		);
	}

	return (
		<Card
			hoverable
			className="h-full flex flex-col cursor-pointer"
			actions={actions}
			onClick={onClick}
			title={
				<div className="flex items-center gap-2">
					<span className="text-xl">{skill.icon || "🧩"}</span>
					<span className="truncate" title={skill.name}>
						{skill.name}
					</span>
				</div>
			}
			extra={
				<div className="flex flex-col items-end">
					<Tag>{skill.version}</Tag>
					{isInstalled &&
						installedVersion &&
						installedVersion !== skill.version && (
							<span className="text-xs text-gray-400 mt-1">
								{t("installedVersion", { ns: "skills" })}
								{installedVersion}
							</span>
						)}
				</div>
			}
		>
			<div className="flex flex-col h-32 justify-between">
				<Tooltip
					title={skill.description}
					placement="topLeft"
					styles={{
						root: { maxWidth: 400 },
						container: {
							maxHeight: 200,
							overflow: "auto",
						},
					}}
				>
					<p className="text-gray-500 line-clamp-3 mb-2 grow cursor-help">
						{skill.description}
					</p>
				</Tooltip>
				<div className="flex justify-between items-center text-xs text-gray-400 mt-2">
					<span>
						{t("by", { ns: "skills" })} {skill.author}
					</span>
					{skill.category && <Tag variant="filled">{skill.category}</Tag>}
				</div>
			</div>
		</Card>
	);
};
