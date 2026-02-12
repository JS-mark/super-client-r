import {
	ReloadOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import { Popconfirm, Tooltip } from "antd";
import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useMenuStore } from "../../stores/menuStore";
import type { MenuItemConfig } from "../../types/menu";
import { MenuEditModal } from "./MenuEditModal";
import { MenuRow } from "./MenuRow";

/**
 * Menu configuration component - draggable list
 */
export const MenuSettings: React.FC<{
	onEditItem?: (item: MenuItemConfig) => void;
}> = ({ onEditItem }) => {
	const { t } = useTranslation();
	const menuItems = useMenuStore((state) => state.items);
	const setConfig = useMenuStore((state) => state.setConfig);
	const toggleEnabled = useMenuStore((state) => state.toggleEnabled);
	const resetConfig = useMenuStore((state) => state.resetConfig);

	// Drag state
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(
		null,
	);

	// Filter out settings item (fixed at bottom of sidebar, not configurable)
	const configurableItems = menuItems.filter((item) => item.id !== "settings");

	const handleToggle = useCallback(
		(itemId: string) => {
			toggleEnabled(itemId);
		},
		[toggleEnabled],
	);

	const handleEditItem = useCallback(
		(item: MenuItemConfig) => {
			onEditItem?.(item);
		},
		[onEditItem],
	);

	const handleDragStart = useCallback((index: number) => {
		setDragIndex(index);
	}, []);

	const handleDragEnter = useCallback(
		(index: number, rect: DOMRect, clientY: number) => {
			if (dragIndex === null || dragIndex === index) {
				setDropIndex(null);
				setDropPosition(null);
				return;
			}
			const midY = rect.top + rect.height / 2;
			setDropIndex(index);
			setDropPosition(clientY < midY ? "above" : "below");
		},
		[dragIndex],
	);

	const handleDragEnd = useCallback(() => {
		if (
			dragIndex !== null &&
			dropIndex !== null &&
			dropPosition !== null &&
			dragIndex !== dropIndex
		) {
			const newItems = [...configurableItems];
			const [removed] = newItems.splice(dragIndex, 1);
			let insertAt = dropPosition === "above" ? dropIndex : dropIndex + 1;
			if (dragIndex < dropIndex) insertAt--;
			newItems.splice(insertAt, 0, removed);

			const settingsItem = menuItems.find((item) => item.id === "settings");
			const finalItems = settingsItem
				? [...newItems, settingsItem]
				: newItems;
			setConfig({ items: finalItems });
		}

		setDragIndex(null);
		setDropIndex(null);
		setDropPosition(null);
	}, [
		dragIndex,
		dropIndex,
		dropPosition,
		configurableItems,
		menuItems,
		setConfig,
	]);

	const handleReset = useCallback(() => {
		resetConfig();
	}, [resetConfig]);

	return (
		<div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
					<SettingOutlined />
					{t("menuConfig", { ns: "settings" })}
				</h3>
				<Popconfirm
					title={t("resetMenu", { ns: "settings" })}
					description={t("confirmResetMenu", { ns: "settings" })}
					onConfirm={handleReset}
					okText={t("reset", { ns: "settings" })}
					cancelText={t("cancel", "Cancel", { ns: "common" })}
				>
					<Tooltip title={t("resetMenu", { ns: "settings" })}>
						<button
							className={cn(
								"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
								"text-slate-500 dark:text-slate-400",
								"hover:bg-slate-100 dark:hover:bg-slate-700",
								"hover:text-slate-700 dark:hover:text-slate-200",
							)}
						>
							<ReloadOutlined className="text-xs" />
							{t("reset", { ns: "settings" })}
						</button>
					</Tooltip>
				</Popconfirm>
			</div>

			{/* Menu items list */}
			<div
				className="space-y-0.5"
				onDragOver={(e) => e.preventDefault()}
			>
				{configurableItems.map((item, index) => (
					<MenuRow
						key={item.id}
						item={item}
						index={index}
						isDragging={dragIndex === index}
						isDropTarget={dropIndex === index}
						dropPosition={dropIndex === index ? dropPosition : null}
						onToggle={handleToggle}
						onEdit={handleEditItem}
						onDragStart={handleDragStart}
						onDragEnter={handleDragEnter}
						onDragEnd={handleDragEnd}
					/>
				))}
			</div>

			{/* Hint text */}
			<p className="mt-3 text-xs text-slate-400 dark:text-slate-500 text-center">
				{t("dragTip", { ns: "settings" })}
			</p>
		</div>
	);
};

/**
 * Complete menu settings component (includes edit modal)
 */
export const MenuSettingsWithModal: React.FC = () => {
	const updateItem = useMenuStore((state) => state.updateItem);
	const deleteItem = useMenuStore((state) => state.deleteItem);
	const [editingItem, setEditingItem] = useState<MenuItemConfig | null>(null);
	const [editModalOpen, setEditModalOpen] = useState(false);

	const handleEditItem = (item: MenuItemConfig) => {
		setEditingItem(item);
		setEditModalOpen(true);
	};

	const handleSaveItem = (item: MenuItemConfig) => {
		updateItem(item);
		setEditModalOpen(false);
		setEditingItem(null);
	};

	const handleDeleteItem = () => {
		if (!editingItem) return;
		deleteItem(editingItem.id);
		setEditModalOpen(false);
		setEditingItem(null);
	};

	return (
		<>
			<MenuSettings onEditItem={handleEditItem} />
			<MenuEditModal
				open={editModalOpen}
				item={editingItem}
				onCancel={() => {
					setEditModalOpen(false);
					setEditingItem(null);
				}}
				onSave={handleSaveItem}
				onDelete={handleDeleteItem}
			/>
		</>
	);
};
