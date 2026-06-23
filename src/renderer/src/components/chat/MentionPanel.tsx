import { Empty, theme } from "antd";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	FileIcon,
	getFileTypeFromExtension,
} from "../attachment/FileIcon";
import { cn } from "../../lib/utils";
import type { WorkspaceFileEntry } from "../../services/workspaceService";

interface MentionPanelProps {
	items: WorkspaceFileEntry[];
	highlightIndex: number;
	onSelect: (item: WorkspaceFileEntry) => void;
	onClose: () => void;
	onHighlightChange: (index: number) => void;
}

/**
 * "@" file-mention panel. Visual twin of `SlashCommandPanel` — same chrome,
 * click-outside behavior, scroll-into-view, keycap footer hints. Differs only
 * in row contents: type-aware `FileIcon`, bold file name, dim parent
 * directory, and a `[session]` tag for files coming out of the per-session
 * sandbox.
 */
export function MentionPanel({
	items,
	highlightIndex,
	onSelect,
	onClose,
	onHighlightChange,
}: MentionPanelProps) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const panelRef = useRef<HTMLDivElement>(null);

	// Click outside to close — same defer pattern as SlashCommandPanel so the
	// click that opens the panel doesn't immediately close it again.
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

	// Scroll highlighted row into view (arrow-key driven)
	useEffect(() => {
		const el = panelRef.current?.querySelector(
			`[data-index="${highlightIndex}"]`,
		);
		el?.scrollIntoView({ block: "nearest" });
	}, [highlightIndex]);

	const handleItemClick = useCallback(
		(item: WorkspaceFileEntry) => {
			onSelect(item);
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
				{t("atMention.title", "文件", { ns: "chat" })}
			</div>

			{/* Item list */}
			<div className="py-1 max-h-[260px] overflow-y-auto">
				{items.length === 0 ? (
					<div className="px-3 py-4">
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={
								<span
									className="text-xs"
									style={{ color: token.colorTextQuaternary }}
								>
									{t("atMention.noResults", "未找到匹配的文件", {
										ns: "chat",
									})}
								</span>
							}
						/>
					</div>
				) : (
					items.map((item, index) => {
						const type = getFileTypeFromExtension(item.ext);
						return (
							<button
								key={item.absolutePath}
								type="button"
								data-index={index}
								onClick={() => handleItemClick(item)}
								className={cn(
									"w-full flex items-center gap-3 px-3 py-2 transition-colors text-left",
								)}
								style={{
									backgroundColor:
										highlightIndex === index
											? token.colorFillTertiary
											: "transparent",
								}}
								onMouseEnter={() => onHighlightChange(index)}
							>
								<FileIcon
									type={type}
									size="sm"
									className="!w-7 !h-7"
								/>
								<div className="flex items-center gap-2 min-w-0 flex-1">
									<span
										className="text-[13px] font-medium truncate"
										style={{ color: token.colorText }}
									>
										{item.name}
									</span>
									{item.dir && (
										<span
											className="text-[11px] truncate"
											style={{ color: token.colorTextQuaternary }}
										>
											{item.dir}/
										</span>
									)}
									{item.root === "session" && (
										<span
											className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
											style={{
												backgroundColor: token.colorFillTertiary,
												color: token.colorTextSecondary,
											}}
										>
											{t("atMention.sessionTag", "session", { ns: "chat" })}
										</span>
									)}
								</div>
							</button>
						);
					})
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
					{t("atMention.hint", "输入内容以搜索文件", { ns: "chat" })}
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
