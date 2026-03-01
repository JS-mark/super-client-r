import { ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import { Popconfirm, Tooltip, theme } from "antd";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useMenuStore } from "../../stores/menuStore";
import type { MenuItemConfig } from "../../types/menu";
import { MenuEditModal } from "./MenuEditModal";
import { MenuRow } from "./MenuRow";

const { useToken } = theme;

/**
 * Menu configuration component - draggable list
 */
export const MenuSettings: React.FC<{
	onEditItem?: (item: MenuItemConfig) => void;
}> = ({ onEditItem }) => {
	const { t } = useTranslation();
	const { token } = useToken();
	const menuItems = useMenuStore((state) => state.items);
	const setConfig = useMenuStore((state) => state.setConfig);
	const toggleEnabled = useMenuStore((state) => state.toggleEnabled);
	const resetConfig = useMenuStore((state) => state.resetConfig);

	// Drag state – use refs to avoid re-renders on every onDragOver event,
	// and only sync to state when the drop target actually changes.
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(
		null,
	);
	const dragIndexRef = useRef<number | null>(null);
	const dropIndexRef = useRef<number | null>(null);
	const dropPositionRef = useRef<"above" | "below" | null>(null);

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
		dragIndexRef.current = index;
		setDragIndex(index);
	}, []);

	const handleDragEnter = useCallback(
		(index: number, rect: DOMRect, clientY: number) => {
			if (dragIndexRef.current === null || dragIndexRef.current === index) {
				if (dropIndexRef.current !== null) {
					dropIndexRef.current = null;
					dropPositionRef.current = null;
					setDropIndex(null);
					setDropPosition(null);
				}
				return;
			}
			const midY = rect.top + rect.height / 2;
			const newPosition = clientY < midY ? "above" : "below";
			if (dropIndexRef.current === index && dropPositionRef.current === newPosition) {
				return; // No change, skip re-render
			}
			dropIndexRef.current = index;
			dropPositionRef.current = newPosition;
			setDropIndex(index);
			setDropPosition(newPosition);
		},
		[],
	);

	const handleDragEnd = useCallback(() => {
		const di = dragIndexRef.current;
		const dri = dropIndexRef.current;
		const drp = dropPositionRef.current;

		if (di !== null && dri !== null && drp !== null && di !== dri) {
			const items = menuItems.filter((item) => item.id !== "settings");
			const newItems = [...items];
			const [removed] = newItems.splice(di, 1);
			let insertAt = drp === "above" ? dri : dri + 1;
			if (di < dri) insertAt--;
			newItems.splice(insertAt, 0, removed);

			const settingsItem = menuItems.find((item) => item.id === "settings");
			const finalItems = settingsItem ? [...newItems, settingsItem] : newItems;
			setConfig({ items: finalItems });
		}

		dragIndexRef.current = null;
		dropIndexRef.current = null;
		dropPositionRef.current = null;
		setDragIndex(null);
		setDropIndex(null);
		setDropPosition(null);
	}, [menuItems, setConfig]);

	const handleReset = useCallback(() => {
		resetConfig();
	}, [resetConfig]);

	return (
		<div
			className="p-6 rounded-2xl border"
			style={{
				backgroundColor: token.colorBgContainer,
				borderColor: token.colorBorder,
			}}
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<h3
					className="text-lg font-semibold flex items-center gap-2"
					style={{ color: token.colorTextHeading }}
				>
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
							)}
							style={{
								color: token.colorTextSecondary,
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.backgroundColor = token.colorBgTextHover;
								e.currentTarget.style.color = token.colorText;
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.backgroundColor = "";
								e.currentTarget.style.color = token.colorTextSecondary;
							}}
						>
							<ReloadOutlined className="text-xs" />
							{t("reset", { ns: "settings" })}
						</button>
					</Tooltip>
				</Popconfirm>
			</div>

			{/* Menu items list */}
			<div className="space-y-0.5" onDragOver={(e) => e.preventDefault()}>
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
			<p
				className="mt-3 text-xs text-center"
				style={{ color: token.colorTextDisabled }}
			>
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
