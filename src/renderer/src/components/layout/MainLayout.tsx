import { AppstoreOutlined, MessageOutlined, RocketOutlined, SettingOutlined } from "@ant-design/icons";
import { Layout, Menu, Tooltip } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import type { MenuItemConfig } from "../../types/menu";
import { getMenuConfig } from "../../types/menu";

const { Sider, Content } = Layout;

/**
 * 图标映射：图标名称到 Ant Design 图标组件
 */
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const ICON_MAP: Record<string, React.ComponentType<any>> = {
	MessageOutlined,
	AppstoreOutlined,
	RocketOutlined,
	SettingOutlined,
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

	// 从存储获取菜单配置
	const menuConfig = getMenuConfig();

	// 过滤出已启用的菜单项
	const enabledItems = menuConfig.items.filter((item) => item.enabled);

	// 当前选中的菜单项 ID
	const selectedKey = enabledItems.find((item) => location.pathname.startsWith(item.path))?.id || "";

	// 处理菜单点击
	const handleMenuClick = (item: MenuItemConfig) => {
		navigate(item.path);
	};

	return (
		<Layout className="h-[600px] bg-gradient-to-br from-slate-50 via-blue-50/20 to-purple-50/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
			<Sider
				width={64}
				className="!bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 dark:!from-slate-950 dark:!via-slate-900 dark:!to-slate-950 !border-r !border-slate-700/50 shadow-2xl"
			>
				{/* Logo Area */}
				<div className="h-16 flex items-center justify-center border-b border-slate-700/50">
					<div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
						<span className="text-white font-bold text-sm">S</span>
					</div>
				</div>

				{/* Menu - 仅图标 */}
				<div className="mt-4 px-2 flex flex-col gap-1">
					{enabledItems.map((item) => {
						const isSelected = selectedKey === item.id;
						return (
							<Tooltip
								key={item.id}
								title={t(item.label)}
								placement="right"
								mouseEnterDelay={0.5}
							>
								<button
									type="button"
									onClick={() => handleMenuClick(item)}
									className={`w-full h-12 rounded-xl flex items-center justify-center transition-all
										${isSelected
											? "bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/30"
											: "text-slate-400 hover:text-white hover:bg-slate-700/50 dark:hover:bg-slate-800/50"
										}`}
								>
									{renderMenuItemIcon(item)}
								</button>
							</Tooltip>
						);
					})}
				</div>
			</Sider>

			<Layout>
				<Content className="overflow-auto">
					<div className="p-6 min-h-[600px]">{children}</div>
				</Content>
			</Layout>
		</Layout>
	);
};
