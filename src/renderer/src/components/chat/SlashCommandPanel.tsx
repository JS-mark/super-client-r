import { ThunderboltOutlined } from "@ant-design/icons";
import { Empty, theme } from "antd";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { SkillManifest } from "../../types/electron";

interface SlashCommandPanelProps {
	skills: SkillManifest[];
	highlightIndex: number;
	onSelect: (skillId: string, skillName: string) => void;
	onClose: () => void;
	onHighlightChange: (index: number) => void;
}

export function SlashCommandPanel({
	skills,
	highlightIndex,
	onSelect,
	onClose,
	onHighlightChange,
}: SlashCommandPanelProps) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const panelRef = useRef<HTMLDivElement>(null);

	// Click outside to close
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	// Scroll highlighted item into view
	useEffect(() => {
		const el = panelRef.current?.querySelector(`[data-index="${highlightIndex}"]`);
		el?.scrollIntoView({ block: "nearest" });
	}, [highlightIndex]);

	const handleItemClick = useCallback(
		(skill: SkillManifest) => {
			onSelect(skill.id, skill.name);
		},
		[onSelect],
	);

	return (
		<div
			ref={panelRef}
			className="w-full rounded-lg overflow-hidden shadow-2xl"
			style={{
				backgroundColor: token.colorBgElevated,
				borderColor: token.colorBorderSecondary,
				borderWidth: 1,
				borderStyle: "solid",
			}}
		>
			{/* Header */}
			<div
				className="px-3 py-2 text-xs font-medium"
				style={{ color: token.colorTextSecondary }}
			>
				{t("slashCommand.title", "选择技能", { ns: "chat" })}
			</div>

			{/* Skill list */}
			<div className="py-1 max-h-[240px] overflow-y-auto">
				{skills.length === 0 ? (
					<div className="px-3 py-4">
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={
								<span className="text-xs" style={{ color: token.colorTextQuaternary }}>
									{t("slashCommand.noResults", "未找到匹配的技能", { ns: "chat" })}
								</span>
							}
						/>
					</div>
				) : (
					skills.map((skill, index) => (
						<button
							key={skill.id}
							type="button"
							data-index={index}
							onClick={() => handleItemClick(skill)}
							className={cn(
								"w-full flex items-center gap-3 px-3 py-2.5 transition-colors",
							)}
							style={{
								backgroundColor:
									highlightIndex === index
										? token.colorFillTertiary
										: "transparent",
							}}
							onMouseEnter={() => onHighlightChange(index)}
						>
							<span
								className="w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0"
								style={{
									backgroundColor: token.colorSuccessBg,
									color: token.colorSuccess,
								}}
							>
								<ThunderboltOutlined />
							</span>
							<div className="flex flex-col items-start min-w-0">
								<span
									className="text-[13px] font-medium truncate"
									style={{ color: token.colorText }}
								>
									{skill.name}
								</span>
								{skill.description && (
									<span
										className="text-[11px] truncate max-w-[300px]"
										style={{ color: token.colorTextQuaternary }}
									>
										{skill.description}
									</span>
								)}
							</div>
						</button>
					))
				)}
			</div>

			{/* Footer */}
			<div
				className="flex items-center justify-between px-3 py-1.5"
				style={{
					borderTop: `1px solid ${token.colorBorderSecondary}`,
				}}
			>
				<div
					className="text-[10px]"
					style={{ color: token.colorTextQuaternary }}
				>
					{t("slashCommand.hint", "输入 / 快速选择技能", { ns: "chat" })}
				</div>
				<div
					className="flex items-center gap-1.5 text-[10px]"
					style={{ color: token.colorTextQuaternary }}
				>
					<span
						className="px-1 py-0.5 rounded"
						style={{ backgroundColor: token.colorFillTertiary }}
					>
						↑↓
					</span>
					<span
						className="px-1 py-0.5 rounded"
						style={{ backgroundColor: token.colorFillTertiary }}
					>
						Enter
					</span>
					<span
						className="px-1 py-0.5 rounded"
						style={{ backgroundColor: token.colorFillTertiary }}
					>
						ESC
					</span>
				</div>
			</div>
		</div>
	);
}
