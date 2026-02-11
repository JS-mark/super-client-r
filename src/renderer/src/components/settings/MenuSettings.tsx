import {
	EditOutlined,
	PlusOutlined,
	ReloadOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import {
	Avatar,
	Button,
	Input,
	Modal,
	Popconfirm,
	Select,
	Space,
	Switch,
	Tooltip,
} from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMenuStore } from "../../stores/menuStore";
import type { MenuItemConfig, MenuItemIconType } from "../../types/menu";

// 图标类型选项
const ICON_TYPE_OPTIONS = [
	{ label: "Default", value: "default" as MenuItemIconType },
	{ label: "Emoji", value: "emoji" as MenuItemIconType },
	{ label: "Image", value: "image" as MenuItemIconType },
];

// 可用的默认图标
const AVAILABLE_ICONS = [
	{ label: "MessageOutlined", value: "MessageOutlined" },
	{ label: "AppstoreOutlined", value: "AppstoreOutlined" },
	{ label: "RocketOutlined", value: "RocketOutlined" },
	{ label: "SettingOutlined", value: "SettingOutlined" },
	{ label: "HomeOutlined", value: "HomeOutlined" },
	{ label: "UserOutlined", value: "UserOutlined" },
	{ label: "CodeOutlined", value: "CodeOutlined" },
	{ label: "FileTextOutlined", value: "FileTextOutlined" },
	{ label: "CloudOutlined", value: "CloudOutlined" },
	{ label: "DatabaseOutlined", value: "DatabaseOutlined" },
];

/**
 * 图标选择器
 */
interface IconSelectorProps {
	value: string;
	type: MenuItemIconType;
	onChange: (value: string) => void;
}

const IconSelector: React.FC<IconSelectorProps> = ({
	value,
	type,
	onChange,
}) => {
	const { t } = useTranslation();
	const [previewUrl, setPreviewUrl] = useState("");

	const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (event) => {
				const base64 = event.target?.result as string;
				onChange(base64);
				setPreviewUrl(base64);
			};
			reader.readAsDataURL(file);
		}
	};

	if (type === "emoji") {
		return (
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="🎯"
				className="!w-24"
				maxLength={4}
			/>
		);
	}

	if (type === "image") {
		return (
			<div className="flex items-center gap-2">
				<Avatar size={32} src={previewUrl || value} />
				<Button
					size="small"
					icon={<PlusOutlined />}
					onClick={() => {
						const input = document.createElement("input");
						input.type = "file";
						input.accept = "image/*";
						input.onchange = (e) =>
							handleImageUpload(
								e as unknown as React.ChangeEvent<HTMLInputElement>,
							);
						input.click();
					}}
				>
					{t("selectImage", { ns: "settings" })}
				</Button>
			</div>
		);
	}

	return (
		<Select
			value={value}
			onChange={(v) => onChange(v as string)}
			options={AVAILABLE_ICONS.map((icon) => ({
				label: icon.label,
				value: icon.value,
			}))}
			className="!w-48"
		/>
	);
};

/**
 * 菜单编辑弹窗
 */
interface MenuEditModalProps {
	open: boolean;
	item: MenuItemConfig | null;
	onCancel: () => void;
	onSave: (item: MenuItemConfig) => void;
	onDelete: () => void;
}

const MenuEditModal: React.FC<MenuEditModalProps> = ({
	open,
	item,
	onCancel,
	onSave,
	onDelete,
}) => {
	const { t } = useTranslation();
	const [editingItem, setEditingItem] = useState<MenuItemConfig>(
		item || {
			id: "",
			label: "",
			path: "",
			iconType: "default",
			iconContent: "MessageOutlined",
			enabled: true,
		},
	);

	useEffect(() => {
		if (item) {
			setEditingItem({ ...item });
		}
	}, [item]);

	const handleSave = () => {
		if (!editingItem.id) return;
		onSave(editingItem);
	};

	return (
		<Modal
			open={open}
			title={t("editMenuItem", "Edit Menu Item", { ns: "settings" })}
			onCancel={onCancel}
			onOk={handleSave}
			width={500}
			destroyOnHidden
			maskClosable={false}
			footer={
				<Space>
					<Button onClick={onCancel}>
						{t("cancel", "Cancel", { ns: "common" })}
					</Button>
					<Popconfirm
						title={t("confirmDeleteMenuItem", "Delete this menu item?", {
							ns: "settings",
						})}
						onConfirm={onDelete}
						okText={t("confirm", "Confirm", { ns: "common" })}
						cancelText={t("cancel", "Cancel", { ns: "common" })}
					>
						<Button danger>{t("delete", "Delete", { ns: "settings" })}</Button>
					</Popconfirm>
					<Button type="primary" onClick={handleSave}>
						{t("save", "Save", { ns: "common" })}
					</Button>
				</Space>
			}
		>
			<Space orientation="vertical" className="w-full" size="middle">
				<div>
					<span className="text-sm text-slate-600 dark:text-slate-400 mb-2">
						{t("menuLabel", "Label", { ns: "settings" })}
					</span>
					<Input
						value={t(editingItem.label)}
						readOnly
						className="!cursor-default"
					/>
				</div>

				<div>
					<span className="text-sm text-slate-600 dark:text-slate-400 mb-2">
						{t("iconType", "Icon Type", { ns: "settings" })}
					</span>
					<Select
						value={editingItem.iconType}
						onChange={(v) =>
							setEditingItem({
								...editingItem,
								iconType: v as MenuItemIconType,
							})
						}
						options={ICON_TYPE_OPTIONS}
						className="!w-full"
					/>
				</div>

				<div>
					<span className="text-sm text-slate-600 dark:text-slate-400 mb-2">
						{t("icon", "Icon", { ns: "settings" })}
					</span>
					<IconSelector
						value={editingItem.iconContent || ""}
						type={editingItem.iconType}
						onChange={(v) => setEditingItem({ ...editingItem, iconContent: v })}
					/>
				</div>

				<div className="flex items-center justify-between">
					<span className="text-sm text-slate-600 dark:text-slate-400">
						{t("enabled", "Enabled", { ns: "settings" })}
					</span>
					<Switch
						checked={editingItem.enabled}
						onChange={(v) => setEditingItem({ ...editingItem, enabled: v })}
					/>
				</div>
			</Space>
		</Modal>
	);
};

/**
 * 设置区块组件（内部）
 */
const SettingSection: React.FC<{
	title: string;
	icon?: React.ReactNode;
	children: React.ReactNode;
	extra?: React.ReactNode;
}> = ({ title, icon, children, extra }) => (
	<div className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
		<div className="flex items-center justify-between mb-4">
			<h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
				{icon}
				{title}
			</h3>
			{extra}
		</div>
		{children}
	</div>
);

/**
 * 菜单配置组件
 */
export const MenuSettings: React.FC<{
	onEditItem?: (item: MenuItemConfig) => void;
}> = ({ onEditItem }) => {
	const { t } = useTranslation();
	const menuItems = useMenuStore((state) => state.items);
	const setConfig = useMenuStore((state) => state.setConfig);
	const toggleEnabled = useMenuStore((state) => state.toggleEnabled);
	const resetConfig = useMenuStore((state) => state.resetConfig);

	// 过滤掉设置项（设置按钮固定在侧边栏底部，不可配置）
	const configurableItems = menuItems.filter((item) => item.id !== "settings");

	const handleToggleEnabled = useCallback(
		(itemId: string) => {
			toggleEnabled(itemId);
		},
		[toggleEnabled],
	);

	const handleEditItem = (item: MenuItemConfig) => {
		onEditItem?.(item);
	};

	const handleReset = () => {
		resetConfig();
	};

	// 渲染图标
	const renderIcon = (item: MenuItemConfig): React.ReactNode => {
		if (!item.enabled) return null;

		if (item.iconType === "emoji") {
			return <span className="text-xl">{item.iconContent}</span>;
		}
		if (item.iconType === "image") {
			return (
				<img
					src={item.iconContent}
					alt={item.label}
					className="w-6 h-6 object-contain rounded"
				/>
			);
		}
		return <span className="text-xl">⚙️</span>;
	};

	return (
		<div className="space-y-6">
			<SettingSection
				title={t("menuConfig", "Menu Configuration", { ns: "settings" })}
				icon={<SettingOutlined />}
				extra={
					<Tooltip
						title={t("resetMenu", "Reset to default", { ns: "settings" })}
					>
						<Button
							size="small"
							icon={<ReloadOutlined />}
							onClick={handleReset}
						>
							{t("reset", "Reset", { ns: "settings" })}
						</Button>
					</Tooltip>
				}
			>
				{/* 菜单项列表（不含设置项，设置按钮固定在底部） */}
				<div className="space-y-2">
					{configurableItems.map((item, index) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: <explanation>
						<div
							key={item.id}
							className={`p-4 rounded-xl border transition-all
								${item.enabled
									? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
									: "border-transparent bg-slate-100/50 dark:bg-slate-700/30 opacity-60"
								}`}
							style={{
								cursor: item.enabled ? "grab" : "not-allowed",
							}}
							draggable={item.enabled}
							onDragStart={(e) => {
								e.dataTransfer.setData("text/plain", index.toString());
							}}
							onDragOver={(e) => {
								e.preventDefault();
							}}
							onDrop={(e) => {
								e.preventDefault();
								const fromIndex = Number(e.dataTransfer.getData("text/plain"));
								if (fromIndex === index) return;

								// 重新排序可配置项，但保持设置项在原始位置
								const newConfigurableItems = [...configurableItems];
								const [removed] = newConfigurableItems.splice(fromIndex, 1);
								newConfigurableItems.splice(index, 0, removed);

								// 从完整列表中找到设置项
								const settingsItem = menuItems.find(
									(item) => item.id === "settings",
								);

								// 合并：可配置项 + 设置项（保持设置项在列表中）
								const newItems = settingsItem
									? [...newConfigurableItems, settingsItem]
									: newConfigurableItems;

								setConfig({ items: newItems });
							}}
						>
							<div className="flex items-center gap-3">
								{/* 拖拽手柄 */}
								{item.enabled && (
									<div className="cursor-grab text-slate-400 hover:text-slate-600">
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<circle cx="9" cy="12" r="1" />
											<circle cx="9" cy="5" r="1" />
											<circle cx="9" cy="19" r="1" />
											<circle cx="15" cy="12" r="1" />
											<circle cx="15" cy="5" r="1" />
											<circle cx="15" cy="19" r="1" />
										</svg>
									</div>
								)}

								{/* 图标 */}
								{renderIcon(item)}

								{/* 标签名称 */}
								<span className="flex-1 font-medium">{t(item.label)}</span>

								{/* 操作按钮 */}
								<div className="flex items-center gap-2">
									<Tooltip
										title={t("toggleMenu", "Toggle menu item", {
											ns: "settings",
										})}
									>
										<Switch
											checked={item.enabled}
											size="small"
											onChange={() => handleToggleEnabled(item.id)}
										/>
									</Tooltip>
									<Button
										type="text"
										size="small"
										icon={<EditOutlined />}
										onClick={() => handleEditItem(item)}
										disabled={!item.enabled}
									>
										{t("edit", "Edit", { ns: "settings" })}
									</Button>
								</div>
							</div>
						</div>
					))}
				</div>

				{/* 拖拽提示 */}
				<div className="mt-[10px] p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-center text-slate-400 dark:text-slate-500">
					{t("dragTip", "Drag to reorder menu items", { ns: "settings" })}
				</div>
			</SettingSection>
		</div>
	);
};

/**
 * 完整的菜单设置组件（包括 Modal）
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
