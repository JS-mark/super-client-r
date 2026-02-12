import { EditOutlined } from "@ant-design/icons";
import { Switch, Tooltip } from "antd";
import type React from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { MenuItemConfig } from "../../types/menu";
import { renderItemIcon } from "./MenuIconConfig";

interface MenuRowProps {
	item: MenuItemConfig;
	index: number;
	isDragging: boolean;
	isDropTarget: boolean;
	dropPosition: "above" | "below" | null;
	onToggle: (id: string) => void;
	onEdit: (item: MenuItemConfig) => void;
	onDragStart: (index: number) => void;
	onDragEnter: (index: number, rect: DOMRect, clientY: number) => void;
	onDragEnd: () => void;
}

export const MenuRow: React.FC<MenuRowProps> = ({
	item,
	index,
	isDragging,
	isDropTarget,
	dropPosition,
	onToggle,
	onEdit,
	onDragStart,
	onDragEnter,
	onDragEnd,
}) => {
	const { t } = useTranslation();
	const rowRef = useRef<HTMLDivElement>(null);

	const handleDragStart = useCallback(
		(e: React.DragEvent) => {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", index.toString());
			onDragStart(index);
		},
		[index, onDragStart],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			if (rowRef.current) {
				const rect = rowRef.current.getBoundingClientRect();
				onDragEnter(index, rect, e.clientY);
			}
		},
		[index, onDragEnter],
	);

	return (
		<div
			ref={rowRef}
			className={cn(
				"relative transition-all duration-150",
				isDragging && "opacity-30 scale-[0.98]",
			)}
			draggable
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={onDragEnd}
		>
			{/* Drop indicator line (above) */}
			{isDropTarget && dropPosition === "above" && (
				<div className="absolute -top-[1px] left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
			)}

			<div
				className={cn(
					"flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group",
					"hover:bg-slate-50 dark:hover:bg-slate-800/50",
					!item.enabled && "opacity-50",
				)}
			>
				{/* Drag handle */}
				<div className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500 transition-colors shrink-0">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<circle cx="8" cy="6" r="2" />
						<circle cx="8" cy="12" r="2" />
						<circle cx="8" cy="18" r="2" />
						<circle cx="16" cy="6" r="2" />
						<circle cx="16" cy="12" r="2" />
						<circle cx="16" cy="18" r="2" />
					</svg>
				</div>

				{/* Icon */}
				<div
					className={cn(
						"w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
						"bg-slate-100 dark:bg-slate-700/60",
						item.enabled
							? "text-slate-700 dark:text-slate-200"
							: "text-slate-400 dark:text-slate-500",
					)}
				>
					{renderItemIcon(item, "sm")}
				</div>

				{/* Label */}
				<span
					className={cn(
						"flex-1 text-sm font-medium select-none",
						item.enabled
							? "text-slate-700 dark:text-slate-200"
							: "text-slate-400 dark:text-slate-500",
					)}
				>
					{t(item.label, { ns: "menu" })}
				</span>

				{/* Actions */}
				<div className="flex items-center gap-2">
					<Switch
						checked={item.enabled}
						size="small"
						onChange={() => onToggle(item.id)}
					/>
					<Tooltip title={t("edit", { ns: "settings" })}>
						<button
							className={cn(
								"w-7 h-7 rounded-lg flex items-center justify-center transition-all",
								"text-slate-400 dark:text-slate-500",
								"opacity-0 group-hover:opacity-100",
								"hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-600 dark:hover:text-slate-300",
							)}
							onClick={() => onEdit(item)}
						>
							<EditOutlined className="text-xs" />
						</button>
					</Tooltip>
				</div>
			</div>

			{/* Drop indicator line (below) */}
			{isDropTarget && dropPosition === "below" && (
				<div className="absolute -bottom-[1px] left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
			)}
		</div>
	);
};
