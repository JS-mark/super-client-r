import {
	CheckCircleFilled,
	ThunderboltOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { Tag, theme } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import type { SkillManifest } from "../../types/electron";

const { useToken } = theme;

export const BuiltinSkillCard: React.FC<{
	skill: SkillManifest;
	onSelect: (skillId: string) => void;
}> = ({ skill, onSelect }) => {
	const { t } = useTranslation();
	const { token } = useToken();

	const toolCount = skill.tools?.length ?? 0;

	return (
		<div
			onClick={() => onSelect(skill.id)}
			className="group relative flex flex-col rounded-xl border cursor-pointer transition-all duration-200"
			style={{
				borderColor: token.colorBorderSecondary,
				backgroundColor: token.colorBgContainer,
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.borderColor = token.colorPrimaryBorder;
				e.currentTarget.style.boxShadow = token.boxShadowTertiary;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.borderColor = token.colorBorderSecondary;
				e.currentTarget.style.boxShadow = "none";
			}}
		>
			{/* Header */}
			<div className="flex items-start gap-3 p-4 pb-2">
				<div
					className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
					style={{ backgroundColor: token.colorFillQuaternary }}
				>
					{skill.icon || "🧩"}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span
							className="font-semibold text-sm truncate"
							style={{ color: token.colorText }}
							title={skill.name}
						>
							{skill.name}
						</span>
						<CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 14 }} />
					</div>
					<div className="flex items-center gap-1.5 mt-1">
						<Tag
							bordered={false}
							className="!text-xs !px-1.5 !py-0 !m-0 !rounded"
						>
							v{skill.version}
						</Tag>
						{skill.category && (
							<Tag
								bordered={false}
								color="orange"
								className="!text-xs !px-1.5 !py-0 !m-0 !rounded"
							>
								{skill.category}
							</Tag>
						)}
					</div>
				</div>
			</div>

			{/* Description */}
			<div className="px-4 flex-1">
				<p
					className="text-xs line-clamp-3 leading-relaxed m-0"
					style={{ color: token.colorTextSecondary }}
					title={skill.description}
				>
					{skill.description}
				</p>
			</div>

			{/* Footer */}
			<div className="px-4 py-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span
						className="text-xs"
						style={{ color: token.colorTextTertiary }}
					>
						{t("by", { ns: "skills" })} {skill.author}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					{toolCount > 0 && (
						<Tag bordered={false} color="purple" className="!text-xs !px-1.5 !py-0 !m-0 !rounded">
							<ToolOutlined className="mr-0.5" style={{ fontSize: 10 }} />
							{toolCount} {toolCount === 1 ? "tool" : "tools"}
						</Tag>
					)}
					{skill.systemPrompt && (
						<Tag bordered={false} color="blue" className="!text-xs !px-1.5 !py-0 !m-0 !rounded">
							<ThunderboltOutlined className="mr-0.5" style={{ fontSize: 10 }} />
							Prompt
						</Tag>
					)}
				</div>
			</div>
		</div>
	);
};
