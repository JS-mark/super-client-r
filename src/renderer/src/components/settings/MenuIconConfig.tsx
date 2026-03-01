import {
	ApiOutlined,
	AppstoreOutlined,
	CloudOutlined,
	CodeOutlined,
	DatabaseOutlined,
	FileTextOutlined,
	FolderOutlined,
	HomeOutlined,
	MessageOutlined,
	PlusOutlined,
	RocketOutlined,
	SettingOutlined,
	StarOutlined,
	UserOutlined,
} from "@ant-design/icons";
import { Button, Input, theme } from "antd";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { MenuItemConfig, MenuItemIconType } from "../../types/menu";

const { useToken } = theme;

/**
 * Ant Design icon map for rendering "default" type icons
 */
export const ICON_MAP: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
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

// Icon type options for Segmented - use getter for i18n
import i18n from "i18next";

function settingsT(key: string, fallback: string): string {
	return i18n.t(key, { ns: "settings", defaultValue: fallback });
}

export const getIconTypeOptions = () => [
	{ label: settingsT("presetIcons", "预设图标"), value: "default" as MenuItemIconType },
	{ label: settingsT("emojiIcon", "Emoji"), value: "emoji" as MenuItemIconType },
	{ label: settingsT("imageIcon", "图片"), value: "image" as MenuItemIconType },
];

// For backward compat
export const ICON_TYPE_OPTIONS = getIconTypeOptions();

// Available preset icons
export const getAvailableIcons = () => [
	{ label: `💬 ${settingsT("presetIcon.message", "消息")}`, value: "MessageOutlined" },
	{ label: `📦 ${settingsT("presetIcon.apps", "应用")}`, value: "AppstoreOutlined" },
	{ label: `🚀 ${settingsT("presetIcon.rocket", "火箭")}`, value: "RocketOutlined" },
	{ label: `⚙️ ${settingsT("presetIcon.settings", "设置")}`, value: "SettingOutlined" },
	{ label: `🏠 ${settingsT("presetIcon.home", "首页")}`, value: "HomeOutlined" },
	{ label: `👤 ${settingsT("presetIcon.user", "用户")}`, value: "UserOutlined" },
	{ label: `💻 ${settingsT("presetIcon.code", "代码")}`, value: "CodeOutlined" },
	{ label: `📄 ${settingsT("presetIcon.document", "文档")}`, value: "FileTextOutlined" },
	{ label: `☁️ ${settingsT("presetIcon.cloud", "云")}`, value: "CloudOutlined" },
	{ label: `🗄️ ${settingsT("presetIcon.database", "数据库")}`, value: "DatabaseOutlined" },
];

export const AVAILABLE_ICONS = getAvailableIcons();

/**
 * Render an icon for a menu item
 */
export function renderItemIcon(
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
 * Icon selector component
 */
interface IconSelectorProps {
	value: string;
	type: MenuItemIconType;
	onChange: (value: string) => void;
}

export const IconSelector: React.FC<IconSelectorProps> = ({
	value,
	type,
	onChange,
}) => {
	const { t } = useTranslation();
	const { token } = useToken();
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

	// Emoji input
	if (type === "emoji") {
		return (
			<div className="flex items-center gap-3">
				<div
					className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-inner"
					style={{ backgroundColor: token.colorBgContainer }}
				>
					{value || "🎯"}
				</div>
				<Input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={t("emojiPlaceholder", { ns: "settings" })}
					className="flex-1 h-12 text-base"
					maxLength={4}
				/>
			</div>
		);
	}

	// Image upload
	if (type === "image") {
		return (
			<div className="flex items-center gap-4">
				<div
					className={cn(
						"w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center",
						!previewUrl && !value && "border-2 border-dashed",
					)}
					style={{
						backgroundColor: token.colorBgContainer,
						borderColor: !previewUrl && !value ? token.colorBorder : undefined,
					}}
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

	// Preset icons - grid selection
	return (
		<div className="grid grid-cols-5 gap-2">
			{AVAILABLE_ICONS.map((icon) => (
				<button
					key={icon.value}
					onClick={() => onChange(icon.value)}
					className={cn(
						"h-12 rounded-xl flex items-center justify-center text-lg transition-all",
						"hover:scale-105 hover:shadow-md",
					)}
					style={{
						backgroundColor:
							value === icon.value
								? token.colorPrimary
								: token.colorBgContainer,
						color: value === icon.value ? "#fff" : token.colorText,
						boxShadow:
							value === icon.value
								? `0 0 0 2px ${token.colorPrimary}40`
								: undefined,
					}}
					onMouseEnter={(e) => {
						if (value !== icon.value) {
							e.currentTarget.style.backgroundColor = token.colorBgTextHover;
						}
					}}
					onMouseLeave={(e) => {
						if (value !== icon.value) {
							e.currentTarget.style.backgroundColor = token.colorBgContainer;
						}
					}}
					title={icon.label}
				>
					{icon.label.split(" ")[0]}
				</button>
			))}
		</div>
	);
};
