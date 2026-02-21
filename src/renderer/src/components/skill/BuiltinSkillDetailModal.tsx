import {
	CheckCircleFilled,
	MessageOutlined,
	ThunderboltOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { Button, Modal, Tag, theme } from "antd";
import type * as React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SkillManifest } from "../../types/electron";

const { useToken } = theme;

interface BuiltinSkillDetailModalProps {
	skill: SkillManifest | null;
	open: boolean;
	onClose: () => void;
	onUse: (skillId: string) => void;
}

export const BuiltinSkillDetailModal: React.FC<
	BuiltinSkillDetailModalProps
> = ({ skill, open, onClose, onUse }) => {
	const { t } = useTranslation();
	const { token } = useToken();

	const handleUse = useCallback(() => {
		if (skill) {
			onUse(skill.id);
			onClose();
		}
	}, [skill, onUse, onClose]);

	if (!skill) return null;

	const toolCount = skill.tools?.length ?? 0;

	return (
		<Modal
			title={
				<div className="flex items-center gap-3">
					<div
						className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
						style={{ backgroundColor: token.colorFillQuaternary }}
					>
						{skill.icon || "🧩"}
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span
								className="text-lg font-semibold"
								style={{ color: token.colorText }}
							>
								{skill.name}
							</span>
							<CheckCircleFilled
								style={{ color: token.colorSuccess, fontSize: 16 }}
							/>
						</div>
						<div
							className="text-xs mt-0.5"
							style={{ color: token.colorTextTertiary }}
						>
							{t("by", { ns: "skills" })} {skill.author}
						</div>
					</div>
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={
				<div className="flex justify-end gap-2">
					<Button onClick={onClose}>
						{t("close", { ns: "common", defaultValue: "关闭" })}
					</Button>
					<Button type="primary" icon={<MessageOutlined />} onClick={handleUse}>
						{t("useSkill", { ns: "skills", defaultValue: "使用技能" })}
					</Button>
				</div>
			}
			width={560}
			destroyOnHidden
		>
			<div className="space-y-4 pt-2">
				{/* Tags */}
				<div className="flex flex-wrap items-center gap-2">
					<Tag bordered={false}>v{skill.version}</Tag>
					{skill.category && (
						<Tag bordered={false} color="orange">
							{skill.category}
						</Tag>
					)}
					<Tag bordered={false} color="success">
						{t("builtinTag", { ns: "skills", defaultValue: "内置" })}
					</Tag>
				</div>

				{/* Description */}
				<div>
					<h4
						className="text-sm font-medium mb-2"
						style={{ color: token.colorText }}
					>
						{t("description", { ns: "skills" })}
					</h4>
					<p
						className="text-sm leading-relaxed whitespace-pre-wrap m-0"
						style={{ color: token.colorTextSecondary }}
					>
						{skill.description}
					</p>
				</div>

				{/* System Prompt */}
				{skill.systemPrompt && (
					<div>
						<h4
							className="text-sm font-medium mb-2 flex items-center gap-1.5"
							style={{ color: token.colorText }}
						>
							<ThunderboltOutlined style={{ color: token.colorPrimary }} />
							{t("systemPrompt", { ns: "skills", defaultValue: "系统提示词" })}
						</h4>
						<div
							className="p-3 rounded-lg text-xs leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap"
							style={{
								backgroundColor: token.colorFillQuaternary,
								color: token.colorTextSecondary,
								fontFamily:
									"ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
							}}
						>
							{skill.systemPrompt}
						</div>
					</div>
				)}

				{/* Tools */}
				{toolCount > 0 && (
					<div>
						<h4
							className="text-sm font-medium mb-2 flex items-center gap-1.5"
							style={{ color: token.colorText }}
						>
							<ToolOutlined style={{ color: token.colorPrimary }} />
							{t("tools", { ns: "skills", defaultValue: "工具" })} ({toolCount})
						</h4>
						<div className="flex flex-col gap-2">
							{skill.tools?.map((tool) => (
								<div
									key={tool.name}
									className="p-2.5 rounded-lg"
									style={{ backgroundColor: token.colorFillQuaternary }}
								>
									<div
										className="text-xs font-medium mb-0.5"
										style={{ color: token.colorText }}
									>
										{tool.name}
									</div>
									<div
										className="text-xs leading-relaxed"
										style={{ color: token.colorTextTertiary }}
									>
										{tool.description}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Permissions */}
				{skill.permissions && skill.permissions.length > 0 && (
					<div>
						<h4
							className="text-sm font-medium mb-2"
							style={{ color: token.colorText }}
						>
							{t("permissions", { ns: "skills", defaultValue: "权限" })}
						</h4>
						<div className="flex flex-wrap gap-1.5">
							{skill.permissions.map((perm) => (
								<Tag key={perm} bordered={false} color="default">
									{perm}
								</Tag>
							))}
						</div>
					</div>
				)}
			</div>
		</Modal>
	);
};
