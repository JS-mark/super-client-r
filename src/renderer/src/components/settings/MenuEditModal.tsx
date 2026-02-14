import {
	CheckOutlined,
	EyeInvisibleOutlined,
	EyeOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import {
	Button,
	Divider,
	Modal,
	Popconfirm,
	Segmented,
	Space,
	Switch,
	theme,
} from "antd";
import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { MenuItemConfig, MenuItemIconType } from "../../types/menu";
import { ICON_TYPE_OPTIONS, IconSelector } from "./MenuIconConfig";

const { useToken } = theme;

interface MenuEditModalProps {
	open: boolean;
	item: MenuItemConfig | null;
	onCancel: () => void;
	onSave: (item: MenuItemConfig) => void;
	onDelete: () => void;
}

export const MenuEditModal: React.FC<MenuEditModalProps> = ({
	open,
	item,
	onCancel,
	onSave,
	onDelete,
}) => {
	const { t } = useTranslation();
	const { token } = useToken();
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
				header: "border-b",
				footer: "border-t",
			}}
			styles={{
				header: { borderColor: token.colorBorder },
				footer: { borderColor: token.colorBorder },
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
				{/* Menu item info card */}
				<div
					className="rounded-2xl p-4 border"
					style={{
						backgroundColor: token.colorBgContainer,
						borderColor: token.colorBorder,
					}}
				>
					<div
						className="text-xs font-medium uppercase tracking-wider mb-2"
						style={{ color: token.colorTextSecondary }}
					>
						{t("menuLabel", "菜单名称", { ns: "settings" })}
					</div>
					<div className="flex items-center gap-3">
						<div
							className={cn(
								"w-10 h-10 rounded-xl flex items-center justify-center text-lg",
								editingItem.enabled
									? "bg-gradient-to-br from-blue-500 to-indigo-600"
									: "",
							)}
							style={{
								backgroundColor: editingItem.enabled
									? undefined
									: token.colorBgContainer,
							}}
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
							<div className="font-medium" style={{ color: token.colorText }}>
								{t(editingItem.label, { ns: "menu" })}
							</div>
							<div
								className="text-xs"
								style={{ color: token.colorTextSecondary }}
							>
								ID: {editingItem.id}
							</div>
						</div>
					</div>
				</div>

				{/* Icon settings */}
				<div className="space-y-4">
					{/* Icon type toggle */}
					<div>
						<div
							className="text-xs font-medium uppercase tracking-wider mb-3"
							style={{ color: token.colorTextSecondary }}
						>
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
							style={{ backgroundColor: token.colorBgContainer }}
						/>
					</div>

					{/* Icon selector */}
					<div>
						<div
							className="text-xs font-medium uppercase tracking-wider mb-3"
							style={{ color: token.colorTextSecondary }}
						>
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

				{/* Enable toggle card */}
				<div
					className={cn(
						"rounded-2xl p-4 border-2 transition-all cursor-pointer",
					)}
					style={{
						borderColor: editingItem.enabled
							? token.colorSuccess
							: token.colorBorder,
						backgroundColor: editingItem.enabled
							? token.colorSuccessBg
							: token.colorBgContainer,
						opacity: editingItem.enabled ? 1 : 0.7,
					}}
					onClick={() =>
						setEditingItem({ ...editingItem, enabled: !editingItem.enabled })
					}
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div
								className={cn(
									"w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
								)}
								style={{
									backgroundColor: editingItem.enabled
										? token.colorSuccess
										: token.colorBgContainer,
									color: editingItem.enabled ? "#fff" : token.colorTextDisabled,
								}}
							>
								{editingItem.enabled ? (
									<EyeOutlined className="text-lg" />
								) : (
									<EyeInvisibleOutlined className="text-lg" />
								)}
							</div>
							<div>
								<div className="font-medium" style={{ color: token.colorText }}>
									{editingItem.enabled
										? t("enabled", "已启用", { ns: "settings" })
										: t("disabled", "已禁用", { ns: "settings" })}
								</div>
								<div
									className="text-xs"
									style={{ color: token.colorTextSecondary }}
								>
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
