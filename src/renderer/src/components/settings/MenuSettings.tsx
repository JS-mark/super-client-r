import {
	ApiOutlined,
	AppstoreOutlined,
	CheckOutlined,
	CloudOutlined,
	CodeOutlined,
	DatabaseOutlined,
	EditOutlined,
	EyeInvisibleOutlined,
	EyeOutlined,
	FileTextOutlined,
	FolderOutlined,
	HomeOutlined,
	MessageOutlined,
	PlusOutlined,
	ReloadOutlined,
	RocketOutlined,
	SettingOutlined,
	StarOutlined,
	UserOutlined,
} from "@ant-design/icons";
import {
	Button,
	Divider,
	Input,
	Modal,
	Popconfirm,
	Segmented,
	Space,
	Switch,
	Tooltip,
} from "antd";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useMenuStore } from "../../stores/menuStore";
import type { MenuItemConfig, MenuItemIconType } from "../../types/menu";

/**
 * Ant Design icon map for rendering "default" type icons
 */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
	MessageOutlined,
	AppstoreOutlined,
	RocketOutlined,
	SettingOutlined,
	ApiOutlined,
	StarOutlined,
	FolderOutlined,
	HomeOutlined,
	UserOutlined,
	CodeOutlined,
	FileTextOutlined,
	CloudOutlined,
	DatabaseOutlined,
};

// 图标类型选项 - 使用 Segmented 的格式
const ICON_TYPE_OPTIONS = [
	{ label: "预设图标", value: "default" as MenuItemIconType },
	{ label: "Emoji", value: "emoji" as MenuItemIconType },
	{ label: "图片", value: "image" as MenuItemIconType },
];

// 可用的预设图标 - 使用更友好的显示名称
const AVAILABLE_ICONS = [
	{ label: "💬 消息", value: "MessageOutlined" },
	{ label: "📦 应用", value: "AppstoreOutlined" },
	{ label: "🚀 火箭", value: "RocketOutlined" },
	{ label: "⚙️ 设置", value: "SettingOutlined" },
	{ label: "🏠 首页", value: "HomeOutlined" },
	{ label: "👤 用户", value: "UserOutlined" },
	{ label: "💻 代码", value: "CodeOutlined" },
	{ label: "📄 文档", value: "FileTextOutlined" },
	{ label: "☁️ 云", value: "CloudOutlined" },
	{ label: "🗄️ 数据库", value: "DatabaseOutlined" },
];

/**
 * Render an icon for a menu item in the settings list
 */
function renderItemIcon(
	item: MenuItemConfig,
	size: "sm" | "md" = "md",
): React.ReactNode {
	const sizeClass = size === "sm" ? "text-base" : "text-xl";

	if (item.iconType === "emoji") {
		return <span className={sizeClass}>{item.iconContent || "🎯"}</span>;
	}
	if (item.iconType === "image" && item.iconContent) {
		const imgSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
		return (
			<img
				src={item.iconContent}
				alt={item.label}
				className={`${imgSize} object-contain rounded`}
			/>
		);
	}
	// Default: Ant Design icon
	const iconKey = item.iconContent || "MessageOutlined";
	const IconComponent = ICON_MAP[iconKey] || MessageOutlined;
	return <IconComponent className={sizeClass} />;
}

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

	// Emoji 输入
	if (type === "emoji") {
		return (
			<div className="flex items-center gap-3">
				<div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center text-3xl shadow-inner">
					{value || "🎯"}
				</div>
				<Input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="输入 Emoji..."
					className="flex-1 h-12 text-base"
					maxLength={4}
				/>
			</div>
		);
	}

	// 图片上传
	if (type === "image") {
		return (
			<div className="flex items-center gap-4">
				<div
					className={cn(
						"w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center",
						"bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30",
						!previewUrl &&
						!value &&
						"border-2 border-dashed border-blue-300 dark:border-blue-700",
					)}
				>
					{previewUrl || value ? (
						<img
							src={previewUrl || value}
							alt="Preview"
							className="w-full h-full object-cover"
						/>
					) : (
						<PlusOutlined className="text-xl text-blue-400" />
					)}
				</div>
				<Button
					size="large"
					type="dashed"
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
					className="flex-1 h-12"
				>
					{t("selectImage", { ns: "settings" })}
				</Button>
			</div>
		);
	}

	// 预设图标 - 使用网格选择
	return (
		<div className="grid grid-cols-5 gap-2">
			{AVAILABLE_ICONS.map((icon) => (
				<button
					key={icon.value}
					onClick={() => onChange(icon.value)}
					className={cn(
						"h-12 rounded-xl flex items-center justify-center text-lg transition-all",
						"hover:scale-105 hover:shadow-md",
						value === icon.value
							? "bg-blue-500 text-white shadow-lg ring-2 ring-blue-300 ring-offset-2 dark:ring-offset-slate-800"
							: "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600",
					)}
					title={icon.label}
				>
					{icon.label.split(" ")[0]}
				</button>
			))}
		</div>
	);
};

/**
 * 菜单编辑弹窗 - 现代化卡片式布局
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
			title={
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
						<SettingOutlined className="text-white text-sm" />
					</div>
					<span className="font-semibold">
						{t("editMenuItem", "编辑菜单项", { ns: "settings" })}
					</span>
				</div>
			}
			onCancel={onCancel}
			width={520}
			destroyOnHidden
			maskClosable={false}
			classNames={{
				header: "border-b border-slate-100 dark:border-slate-700",
				footer: "border-t border-slate-100 dark:border-slate-700",
			}}
			footer={
				<div className="flex items-center justify-end">
					<Space>
						<Popconfirm
							title={t("confirmDeleteMenuItem", "确定删除此菜单项？", {
								ns: "settings",
							})}
							description={t("cannotRestore", "删除后无法恢复", {
								ns: "settings",
							})}
							onConfirm={onDelete}
							okText={t("confirm", "确认", { ns: "common" })}
							cancelText={t("cancel", "取消", { ns: "common" })}
							okButtonProps={{ danger: true }}
						>
							<Button danger size="middle">
								{t("delete", "删除", { ns: "settings" })}
							</Button>
						</Popconfirm>
						<Button
							type="primary"
							onClick={handleSave}
							size="middle"
							icon={<CheckOutlined />}
						>
							{t("save", "保存", { ns: "common" })}
						</Button>
					</Space>
				</div>
			}
		>
			<div className="space-y-5 py-2">
				{/* 菜单项信息卡片 */}
				<div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
					<div className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
						{t("menuLabel", "菜单名称", { ns: "settings" })}
					</div>
					<div className="flex items-center gap-3">
						<div
							className={cn(
								"w-10 h-10 rounded-xl flex items-center justify-center text-lg",
								editingItem.enabled
									? "bg-gradient-to-br from-blue-500 to-indigo-600"
									: "bg-slate-300 dark:bg-slate-600",
							)}
						>
							{editingItem.iconType === "emoji" && (
								<span>{editingItem.iconContent || "🎯"}</span>
							)}
							{editingItem.iconType === "image" && (
								<img
									src={editingItem.iconContent}
									alt=""
									className="w-6 h-6 object-cover rounded"
								/>
							)}
							{editingItem.iconType === "default" && (
								<span className="text-white text-sm font-bold">
									{t(editingItem.label, { ns: "menu" }).charAt(0)}
								</span>
							)}
						</div>
						<div className="flex-1">
							<div className="font-medium text-slate-800 dark:text-slate-200">
								{t(editingItem.label, { ns: "menu" })}
							</div>
							<div className="text-xs text-slate-400 dark:text-slate-500">
								ID: {editingItem.id}
							</div>
						</div>
					</div>
				</div>

				{/* 图标设置区域 */}
				<div className="space-y-4">
					{/* 图标类型切换 */}
					<div>
						<div className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
							{t("iconType", "图标类型", { ns: "settings" })}
						</div>
						<Segmented
							value={editingItem.iconType}
							onChange={(v) =>
								setEditingItem({
									...editingItem,
									iconType: v as MenuItemIconType,
									iconContent:
										v === "default"
											? "MessageOutlined"
											: v === "emoji"
												? "💬"
												: "",
								})
							}
							options={ICON_TYPE_OPTIONS}
							block
							className="bg-slate-100 dark:bg-slate-800"
						/>
					</div>

					{/* 图标选择器 */}
					<div>
						<div className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
							{t("icon", "图标", { ns: "settings" })}
						</div>
						<IconSelector
							value={editingItem.iconContent || ""}
							type={editingItem.iconType}
							onChange={(v) =>
								setEditingItem({ ...editingItem, iconContent: v })
							}
						/>
					</div>
				</div>

				<Divider className="my-0" />

				{/* 启用开关 - 独立卡片 */}
				<div
					className={cn(
						"rounded-2xl p-4 border-2 transition-all cursor-pointer",
						editingItem.enabled
							? "border-green-500/30 bg-green-50/50 dark:bg-green-900/20"
							: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-70",
					)}
					onClick={() =>
						setEditingItem({ ...editingItem, enabled: !editingItem.enabled })
					}
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div
								className={cn(
									"w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
									editingItem.enabled
										? "bg-green-500 text-white"
										: "bg-slate-200 dark:bg-slate-700 text-slate-400",
								)}
							>
								{editingItem.enabled ? (
									<EyeOutlined className="text-lg" />
								) : (
									<EyeInvisibleOutlined className="text-lg" />
								)}
							</div>
							<div>
								<div className="font-medium text-slate-800 dark:text-slate-200">
									{editingItem.enabled
										? t("enabled", "已启用", { ns: "settings" })
										: t("disabled", "已禁用", { ns: "settings" })}
								</div>
								<div className="text-xs text-slate-400 dark:text-slate-500">
									{editingItem.enabled
										? t("menuItemVisible", "在侧边栏中显示", {
												ns: "settings",
											})
										: t("menuItemHidden", "已从侧边栏中隐藏", {
												ns: "settings",
											})}
								</div>
							</div>
						</div>
						<Switch
							checked={editingItem.enabled}
							onChange={(v) => setEditingItem({ ...editingItem, enabled: v })}
							size="default"
						/>
					</div>
				</div>
			</div>
		</Modal>
	);
};

/**
 * Single draggable menu item row
 */
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

const MenuRow: React.FC<MenuRowProps> = ({
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
