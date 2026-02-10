import { EditOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import { Avatar, Button, Card, Divider, Input, Modal, Popconfirm, Select, Space, Switch, Tooltip } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuConfig, MenuItemConfig, MenuItemIconType } from "../../types/menu";
import { DEFAULT_MENU_CONFIG, getMenuConfig, resetMenuConfig, saveMenuConfig } from "../../types/menu";

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

const IconSelector: React.FC<IconSelectorProps> = ({ value, type, onChange }) => {
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
						input.onchange = (e) => handleImageUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
						input.click();
					}}
				>
					选择图片
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

const MenuEditModal: React.FC<MenuEditModalProps> = ({ open, item, onCancel, onSave, onDelete }) => {
	const { t } = useTranslation();
	const [editingItem, setEditingItem] = useState<MenuItemConfig>(item || {
		id: "",
		label: "",
		path: "",
		iconType: "default",
		iconContent: "MessageOutlined",
		enabled: true,
	});

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
			title={t("settings.editMenuItem", "Edit Menu Item")}
			onCancel={onCancel}
			onOk={handleSave}
			width={500}
			footer={
				<Space>
					<Button onClick={onCancel}>
						{t("common.cancel", "Cancel")}
					</Button>
					<Popconfirm
						title={t("settings.confirmDeleteMenuItem", "Delete this menu item?")}
						onConfirm={onDelete}
						okText={t("common.confirm", "Confirm")}
						cancelText={t("common.cancel", "Cancel")}
					>
						<Button danger>
							{t("settings.delete", "Delete")}
						</Button>
					</Popconfirm>
					<Button type="primary" onClick={handleSave}>
						{t("common.save", "Save")}
					</Button>
				</Space>
			}
		>
			<Space orientation="vertical" className="w-full" size="middle">
				<div>
					<span className="text-sm text-slate-600 dark:text-slate-400 mb-2">
						{t("settings.menuLabel", "Label")}
					</span>
					<Input
						value={t(editingItem.label)}
						readOnly
						className="!cursor-default"
					/>
				</div>

				<div>
					<label className="text-sm text-slate-600 dark:text-slate-400 mb-2">
						{t("settings.iconType", "Icon Type")}
					</label>
					<Select
						value={editingItem.iconType}
						onChange={(v) => setEditingItem({ ...editingItem, iconType: v as MenuItemIconType })}
						options={ICON_TYPE_OPTIONS}
						className="!w-full"
					/>
				</div>

				<div>
					<label className="text-sm text-slate-600 dark:text-slate-400 mb-2">
						{t("settings.icon", "Icon")}
					</label>
					<IconSelector
						value={editingItem.iconContent || ""}
						type={editingItem.iconType}
						onChange={(v) => setEditingItem({ ...editingItem, iconContent: v })}
					/>
				</div>

				<div className="flex items-center justify-between">
					<span className="text-sm text-slate-600 dark:text-slate-400">
						{t("settings.enabled", "Enabled")}
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

// SVG 图标组件
const EditIcon: React.FC = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<path d="M11 4H4a2 2 0 0 0 0-2 2v14a2 2 0 0 0 0 2 2h14" />
		<path d="m18.5 2.5 3 3L21 9" />
	</svg>
);

const ReloadIcon: React.FC = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<path d="M1 4v6h6" />
		<path d="M3.51 15a9 9 0 0 1 0-2-5.74" />
		<path d="M4 13h6" />
		<path d="M21 3v6h-6" />
		<path d="M3 21h6" />
	</svg>
);

/**
 * 设置区块组件（内部）
 */
const SettingSection: React.FC<{
	title: string;
	icon?: React.ReactNode;
	children: React.ReactNode;
	extra?: React.ReactNode;
}> = ({ title, icon, children, extra }) => (
	<div className="p-6 rounded-2xl bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
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
export const MenuSettings: React.FC = () => {
	const { t } = useTranslation();
	const [config, setConfig] = useState<MenuConfig>(getMenuConfig());
	const [editingItem, setEditingItem] = useState<MenuItemConfig | null>(null);
	const [editModalOpen, setEditModalOpen] = useState(false);

	const handleToggleEnabled = useCallback((itemId: string) => {
		setConfig((prev) => {
			const updatedItems = prev.items.map((item) =>
				item.id === itemId ? { ...item, enabled: !item.enabled } : item,
			);
			saveMenuConfig({ items: updatedItems });
			return { items: updatedItems };
		});
	}, []);

	const handleEditItem = (item: MenuItemConfig) => {
		setEditingItem(item);
		setEditModalOpen(true);
	};

	const handleSaveItem = (item: MenuItemConfig) => {
		const updatedItems = config.items.map((i) => (i.id === item.id ? item : i));
		setConfig({ items: updatedItems });
		saveMenuConfig({ items: updatedItems });
		setEditModalOpen(false);
		setEditingItem(null);
	};

	const handleDeleteItem = () => {
		if (!editingItem) return;
		const updatedItems = config.items.filter((i) => i.id !== editingItem.id);
		setConfig({ items: updatedItems });
		saveMenuConfig({ items: updatedItems });
		setEditModalOpen(false);
		setEditingItem(null);
	};

	const handleReset = () => {
		setConfig(DEFAULT_MENU_CONFIG);
		resetMenuConfig();
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
				title={t("settings.menuConfig", "Menu Configuration")}
				icon={<SettingOutlined />}
				extra={
					<Tooltip title={t("settings.resetMenu", "Reset to default")}>
						<Button
							size="small"
							icon={<ReloadIcon />}
							onClick={handleReset}
						>
							{t("settings.reset", "Reset")}
						</Button>
					</Tooltip>
				}
			>
				{/* 菜单项列表 */}
				<div className="space-y-2">
					{config.items.map((item, index) => (
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

								setConfig((prev) => {
									const newItems = [...prev.items];
									const [removed] = newItems.splice(fromIndex, 1);
									newItems.splice(index, 0, removed);
									saveMenuConfig({ items: newItems });
									return { items: newItems };
								});
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
								<span className="flex-1 font-medium">
									{t(item.label)}
								</span>

								{/* 操作按钮 */}
								<div className="flex items-center gap-2">
									<Tooltip title={t("settings.toggleMenu", "Toggle menu item")}>
										<Switch
											checked={item.enabled}
											size="small"
											onChange={() => handleToggleEnabled(item.id)}
										/>
									</Tooltip>
									<Button
										type="text"
										size="small"
										icon={<EditIcon />}
										onClick={() => handleEditItem(item)}
										disabled={!item.enabled}
									>
										{t("settings.edit", "Edit")}
									</Button>
								</div>
							</div>
						</div>
					))}
				</div>

				{/* 拖拽提示 */}
				<div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-center text-slate-400 dark:text-slate-500">
					{t("settings.dragTip", "Drag to reorder menu items")}
				</div>
			</SettingSection>
		</div>
	);
};

/**
 * 完整的菜单设置组件（包括 Modal）
 */
export const MenuSettingsWithModal: React.FC = () => {
	const { t } = useTranslation();
	const [config, setConfig] = useState<MenuConfig>(getMenuConfig());
	const [editingItem, setEditingItem] = useState<MenuItemConfig | null>(null);
	const [editModalOpen, setEditModalOpen] = useState(false);

	const handleSaveItem = (item: MenuItemConfig) => {
		const updatedItems = config.items.map((i) => (i.id === item.id ? item : i));
		setConfig({ items: updatedItems });
		saveMenuConfig({ items: updatedItems });
		setEditModalOpen(false);
		setEditingItem(null);
	};

	const handleDeleteItem = () => {
		if (!editingItem) return;
		const updatedItems = config.items.filter((i) => i.id !== editingItem.id);
		setConfig({ items: updatedItems });
		saveMenuConfig({ items: updatedItems });
		setEditModalOpen(false);
		setEditingItem(null);
	};

	return (
		<>
			<MenuSettings />
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
