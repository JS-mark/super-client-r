import {
	ApiOutlined,
	AppstoreOutlined,
	FolderOutlined,
	MessageOutlined,
	RocketOutlined,
	SettingOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { Dropdown, type MenuProps, Tooltip, theme } from "antd";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppShortcuts } from "../../hooks/useAppShortcuts";
import { cn } from "../../lib/utils";
import { type AppInfo, appService } from "../../services/appService";
import { useMenuStore } from "../../stores/menuStore";
import { useModelStore } from "../../stores/modelStore";
import {
	getAvatarColor,
	getUserInitials,
	useUserStore,
} from "../../stores/userStore";
import type { MenuItemConfig } from "../../types/menu";
import { AboutModal } from "../AboutModal";
import { TitleBar } from "./TitleBar";

const { useToken } = theme;

/**
 * Icon map: icon name → Ant Design icon component
 */
const ICON_MAP: Record<string, React.ComponentType<any>> = {
	MessageOutlined,
	AppstoreOutlined,
	RocketOutlined,
	SettingOutlined,
	ApiOutlined,
	StarOutlined,
	FolderOutlined,
	// Alias for legacy persisted configs
	PluginOutlined: AppstoreOutlined,
};

/**
 * Render menu item icon
 */
function renderMenuItemIcon(item: MenuItemConfig): React.ReactNode {
	if (!item.enabled) return null;

	if (item.iconType === "emoji") {
		return <span className="text-xl">{item.iconContent}</span>;
	}
	if (item.iconType === "image") {
		return (
			<img
				src={item.iconContent}
				alt={item.label}
				className="w-6 h-6 object-contain"
			/>
		);
	}
	const iconKey = item.iconContent || "MessageOutlined";
	const IconComponent = ICON_MAP[iconKey] || MessageOutlined;
	return <IconComponent className="text-xl" />;
}

// --- Sub-components ---

const springTransition = {
	type: "spring" as const,
	stiffness: 400,
	damping: 17,
};

interface UserAvatarProps {
	user: { name: string } | null;
	isLoggedIn: boolean;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, isLoggedIn }) => {
	if (isLoggedIn && user) {
		const initials = getUserInitials(user.name);
		const bgColor = getAvatarColor(user.name);
		return (
			<motion.div
				whileHover={{ scale: 1.05, rotate: 2 }}
				transition={springTransition}
				className={cn(
					"w-9 h-9 rounded-xl flex items-center justify-center shadow-lg cursor-pointer",
					bgColor,
				)}
			>
				<span className="text-white font-bold text-sm">{initials}</span>
			</motion.div>
		);
	}
	return (
		<motion.div
			whileHover={{ scale: 1.05, rotate: 2 }}
			transition={springTransition}
			className="w-9 h-9 rounded-xl bg-linear-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-blue-500/30 cursor-pointer"
		>
			<span className="text-white font-bold text-sm">S</span>
		</motion.div>
	);
};

interface SidebarMenuItemProps {
	item: MenuItemConfig;
	isSelected: boolean;
	onClick: () => void;
	label: string;
}

const SidebarMenuItem: React.FC<SidebarMenuItemProps> = ({
	item,
	isSelected,
	onClick,
	label,
}) => {
	return (
		<Tooltip title={label} placement="right" mouseEnterDelay={0.5}>
			<motion.button
				type="button"
				onClick={onClick}
				whileHover={{ scale: 1.08 }}
				whileTap={{ scale: 0.92 }}
				transition={springTransition}
				className="w-full h-12 flex items-center justify-center text-slate-400 hover:text-white relative"
			>
				<span
					className={cn(
						"w-9 h-9 rounded-xl flex items-center justify-center relative z-10 transition-colors duration-200",
						isSelected ? "text-white" : "hover:bg-slate-700/50",
					)}
				>
					{renderMenuItemIcon(item)}
				</span>
				{isSelected && (
					<motion.div
						layoutId="sidebar-active"
						className="absolute inset-x-2.5 top-1.5 bottom-1.5 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg shadow-blue-500/30"
						transition={{
							type: "spring",
							stiffness: 350,
							damping: 30,
						}}
					/>
				)}
			</motion.button>
		</Tooltip>
	);
};

// Page transition config
const pageTransition = {
	duration: 0.2,
	ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

// --- Main Layout ---

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { token } = useToken();

	useAppShortcuts();

	const menuItems = useMenuStore((state) => state.items);
	const { user, isLoggedIn, logout } = useUserStore();
	const loadProviders = useModelStore((s) => s.loadProviders);
	const loadActiveModel = useModelStore((s) => s.loadActiveModel);

	const [aboutModalOpen, setAboutModalOpen] = useState(false);
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

	// Initialize model store on app mount so all pages can access providers
	useEffect(() => {
		loadProviders();
		loadActiveModel();
	}, [loadProviders, loadActiveModel]);

	useEffect(() => {
		appService.getInfo().then((info) => {
			setAppInfo(info);
		});
	}, []);

	useEffect(() => {
		const handleShowAboutModal = () => {
			setAboutModalOpen(true);
		};
		window.electron.ipc.on("show-about-modal", handleShowAboutModal);
		return () => {
			window.electron.ipc.off("show-about-modal", handleShowAboutModal);
		};
	}, []);

	const enabledItems = menuItems.filter(
		(item) => item.enabled && item.id !== "settings",
	);

	const isSettingsSelected = location.pathname.startsWith("/settings");

	const selectedKey =
		enabledItems.find((item) => location.pathname.startsWith(item.path))?.id ||
		"";

	const handleMenuClick = useCallback(
		(item: MenuItemConfig) => {
			navigate(item.path);
		},
		[navigate],
	);

	const handleLogout = useCallback(() => {
		logout();
		navigate("/");
	}, [logout, navigate]);

	const contextMenuItems: MenuProps["items"] = [
		{
			key: "username",
			label: user?.name || t("guest", "访客", { ns: "user" }),
			disabled: true,
		},
		{ type: "divider" },
		{
			key: "logout",
			label: t("logout", "退出登录", { ns: "user" }),
			onClick: handleLogout,
		},
	];

	return (
		<div className="h-screen overflow-hidden flex bg-linear-to-br from-slate-50 via-blue-50/20 to-purple-50/10">
			{/* Sidebar */}
			<div className="w-20 h-full flex-none bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border-r border-slate-700/50 shadow-2xl">
				<div className="flex flex-col h-full pt-[30px]">
					{/* Avatar */}
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
									<UserAvatar user={user} isLoggedIn={isLoggedIn} />
								</Tooltip>
							</div>
						</Dropdown>
					</div>

					{/* Menu items */}
					<div className="mt-4 px-2 flex flex-col gap-1">
						<LayoutGroup>
							{enabledItems.map((item) => (
								<SidebarMenuItem
									key={item.id}
									item={item}
									isSelected={selectedKey === item.id}
									onClick={() => handleMenuClick(item)}
									label={t(item.label, { ns: "menu" })}
								/>
							))}
						</LayoutGroup>
					</div>

					{/* Settings - fixed at bottom */}
					<div className="mt-auto px-2 pb-4 pt-4 border-t border-slate-700/50">
						<LayoutGroup>
							<Tooltip
								title={t("settings", { ns: "menu" })}
								placement="right"
								mouseEnterDelay={0.5}
							>
								<motion.button
									type="button"
									onClick={() => navigate("/settings")}
									whileHover={{ scale: 1.08 }}
									whileTap={{ scale: 0.92 }}
									transition={springTransition}
									className="w-full h-12 flex items-center justify-center text-slate-400 hover:text-white relative"
								>
									<span
										className={cn(
											"w-9 h-9 rounded-xl flex items-center justify-center relative z-10 transition-colors duration-200",
											isSettingsSelected
												? "text-white"
												: "hover:bg-slate-700/50",
										)}
									>
										<SettingOutlined className="text-xl" />
									</span>
									{isSettingsSelected && (
										<motion.div
											layoutId="sidebar-settings-active"
											className="absolute inset-x-2.5 top-1.5 bottom-1.5 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg shadow-blue-500/30"
											transition={{
												type: "spring",
												stiffness: 350,
												damping: 30,
											}}
										/>
									)}
								</motion.button>
							</Tooltip>
						</LayoutGroup>
					</div>
				</div>
			</div>

			{/* Right column */}
			<div className="flex-1 h-full flex flex-col overflow-hidden">
				{/* Title bar */}
				<TitleBar />

				{/* Scrollable content area */}
				<div
					className="flex-1 overflow-y-auto"
					style={{ background: token.colorBgContainer }}
				>
					<AnimatePresence mode="wait">
						<motion.div
							key={location.pathname}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={pageTransition}
							className="h-full"
						>
							{children}
						</motion.div>
					</AnimatePresence>
				</div>
			</div>

			{/* About modal */}
			<AboutModal
				open={aboutModalOpen}
				onClose={() => setAboutModalOpen(false)}
				appInfo={appInfo}
			/>
		</div>
	);
};
