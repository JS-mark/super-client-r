import {
	ApiOutlined,
	AppstoreOutlined,
	FolderOutlined,
	MessageOutlined,
	RocketOutlined,
	SettingOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { Dropdown, Layout, type MenuProps, theme, Tooltip } from "antd";
import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { type AppInfo, appService } from "../../services/appService";
import { useMenuStore } from "../../stores/menuStore";
import {
	getAvatarColor,
	getUserInitials,
	useUserStore,
} from "../../stores/userStore";
import type { MenuItemConfig } from "../../types/menu";
import { AboutModal } from "../AboutModal";
import { TitleBar } from "./TitleBar";

const { Sider, Content } = Layout;
const { useToken } = theme;

/**
 * 图标映射：图标名称到 Ant Design 图标组件
 */
const ICON_MAP: Record<string, React.ComponentType<any>> = {
	MessageOutlined,
	AppstoreOutlined,
	RocketOutlined,
	SettingOutlined,
	ApiOutlined,
	StarOutlined,
	FolderOutlined,
};

/**
 * 渲染菜单图标
 */
function renderMenuItemIcon(item: MenuItemConfig): React.ReactNode {
	if (!item.enabled) return null;

	// 渲染图标
	let iconNode: React.ReactNode;

	if (item.iconType === "emoji") {
		// Emoji 图标
		iconNode = <span className="text-xl">{item.iconContent}</span>;
	} else if (item.iconType === "image") {
		// 图片图标
		iconNode = (
			<img
				src={item.iconContent}
				alt={item.label}
				className="w-6 h-6 object-contain"
			/>
		);
	} else {
		// 默认 Ant Design 图标
		const iconKey = item.iconContent || "MessageOutlined";
		const IconComponent = ICON_MAP[iconKey] || MessageOutlined;
		iconNode = <IconComponent className="text-xl" />;
	}

	return iconNode;
}

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { token } = useToken();

	// 从 store 获取菜单配置
	const menuItems = useMenuStore((state) => state.items);

	// 用户状态
	const { user, isLoggedIn, logout } = useUserStore();

	// 关于弹窗状态
	const [aboutModalOpen, setAboutModalOpen] = useState(false);
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

	// 获取应用信息
	useEffect(() => {
		appService.getInfo().then((info) => {
			setAppInfo(info);
		});
	}, []);

	// 监听显示关于弹窗事件（从系统托盘菜单触发）
	useEffect(() => {
		const handleShowAboutModal = () => {
			setAboutModalOpen(true);
		};

		window.electron.ipc.on("show-about-modal", handleShowAboutModal);

		return () => {
			window.electron.ipc.off("show-about-modal", handleShowAboutModal);
		};
	}, []);

	// 过滤出已启用的菜单项（排除设置项，设置项固定显示在底部）
	const enabledItems = menuItems.filter(
		(item) => item.enabled && item.id !== "settings",
	);

	// 检查设置是否被选中
	const isSettingsSelected = location.pathname.startsWith("/settings");

	// 当前选中的菜单项 ID
	const selectedKey =
		enabledItems.find((item) => location.pathname.startsWith(item.path))?.id ||
		"";

	// 处理菜单点击
	const handleMenuClick = (item: MenuItemConfig) => {
		navigate(item.path);
	};

	// 处理退出登录
	const handleLogout = () => {
		logout();
		// 导航到登录页
		navigate("/");
	};

	// 右键菜单项
	const contextMenuItems: MenuProps["items"] = [
		{
			key: "username",
			label: user?.name || t("guest", "访客", { ns: "user" }),
			disabled: true,
		},
		{
			type: "divider",
		},
		{
			key: "logout",
			label: t("logout", "退出登录", { ns: "user" }),
			onClick: handleLogout,
		},
	];

	// 用户头像组件
	const UserAvatar = () => {
		if (isLoggedIn && user) {
			const initials = getUserInitials(user.name);
			const bgColor = getAvatarColor(user.name);

			return (
				<div
					className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center shadow-lg cursor-pointer hover:opacity-90 transition-opacity`}
				>
					<span className="text-white font-bold text-sm">{initials}</span>
				</div>
			);
		}

		// 未登录状态显示默认 Logo
		return (
			<div className="w-9 h-9 rounded-xl bg-linear-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
				<span className="text-white font-bold text-sm">S</span>
			</div>
		);
	};

	return (
		<Layout className="h-screen bg-linear-to-br from-slate-50 via-blue-50/20 to-purple-50/10">
			{/* 左侧边栏 - 全高 */}
			<Sider
				width={80}
				className="!bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 !border-r !border-slate-700/50 shadow-2xl h-full"
			>
				<div className="flex flex-col h-full pt-[30px]">
					{/* Logo Area - 用户头像 */}
					<div className="h-16 flex items-center justify-center border-b border-slate-700/50">
						<Dropdown
							menu={{ items: contextMenuItems }}
							placement="bottomLeft"
							trigger={["contextMenu"]}
						>
							<div>
								<Tooltip
									title={user?.name || t("name", "Super Client", { ns: "app" })}
									placement="right"
									mouseEnterDelay={0.5}
								>
									<UserAvatar />
								</Tooltip>
							</div>
						</Dropdown>
					</div>

					{/* Menu - 仅图标 */}
					<div className="mt-4 px-2 flex flex-col gap-1">
						{enabledItems.map((item) => {
							const isSelected = selectedKey === item.id;
							return (
								<Tooltip
									key={item.id}
									title={t(item.label, { ns: "menu" })}
									placement="right"
									mouseEnterDelay={0.5}
								>
									<button
										type="button"
										onClick={() => handleMenuClick(item)}
										className="w-full h-12 flex items-center justify-center transition-all text-slate-400 hover:text-white"
									>
										<span
											className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isSelected
												? "bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/30"
												: "hover:bg-slate-700/50"
												}`}
										>
											{renderMenuItemIcon(item)}
										</span>
									</button>
								</Tooltip>
							);
						})}
					</div>

					{/* Settings Button - 固定在底部 */}
					<div className="mt-auto px-2 pb-4 pt-4 border-t border-slate-700/50">
						<Tooltip
							title={t("settings", { ns: "menu" })}
							placement="right"
							mouseEnterDelay={0.5}
						>
							<button
								type="button"
								onClick={() => navigate("/settings")}
								className="w-full h-12 flex items-center justify-center transition-all text-slate-400 hover:text-white"
							>
								<span
									className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isSettingsSelected
										? "bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/30"
										: "hover:bg-slate-700/50"
										}`}
								>
									<SettingOutlined className="text-xl" />
								</span>
							</button>
						</Tooltip>
					</div>
				</div>
			</Sider>
			{/* 右侧内容区域 */}
			<Layout className="h-full flex flex-col">
				{/* 自定义标题栏 - 只在右侧顶部 */}
				<TitleBar />

				{/* 内容区域 */}
				<Content className="flex-1 overflow-auto">
					<div
						className={cn(
							"h-full",
							"animate-fade-in",
						)}
						style={{ background: token.colorBgContainer }}
					>
						{children}
					</div>
				</Content>
			</Layout>

			{/* 关于弹窗 */}
			<AboutModal
				open={aboutModalOpen}
				onClose={() => setAboutModalOpen(false)}
				appInfo={appInfo}
			/>
		</Layout>
	);
};
