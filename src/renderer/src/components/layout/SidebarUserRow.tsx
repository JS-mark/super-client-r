/**
 * SidebarUserRow — bottom row shown in every sidebar (workspace and
 * Settings alike). Renders the user's avatar + display name, plus a
 * theme-toggle button and a trailing settings button.
 *
 * Extracted so ClaudeSidebar / AppSidebar / SettingsRail can share the
 * exact same profile-row treatment without diverging.
 */

import { SettingOutlined } from "@ant-design/icons";
import { Tooltip, theme } from "antd";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
	getAvatarColor,
	getUserInitials,
	useUserStore,
} from "../../stores/userStore";
import { ThemeToggleButton } from "./ThemeToggleButton";

const { useToken } = theme;

export interface SidebarUserRowProps {
	/**
	 * Where the trailing settings button should navigate. Defaults to
	 * `/settings/general` (the first Settings shell tab). Pass a
	 * different path to reuse the row on other surfaces.
	 */
	settingsPath?: string;
	/**
	 * Override the click handler on the settings button; when provided
	 * `settingsPath` is ignored.
	 */
	onOpenSettings?: () => void;
	/**
	 * Fallback initial to render in the avatar when no user is set. Different
	 * sidebars can pass a different letter for visual continuity ("C" for
	 * Claude / "S" for Settings, etc.). Defaults to `"C"` for parity with
	 * the existing ClaudeSidebar behavior.
	 */
	guestInitial?: string;
}

export const SidebarUserRow: React.FC<SidebarUserRowProps> = ({
	settingsPath = "/settings/general",
	onOpenSettings,
	guestInitial = "C",
}) => {
	const { token } = useToken();
	const { user } = useUserStore();
	const { t } = useTranslation();
	const navigate = useNavigate();

	const mutedColor = token.colorTextSecondary;
	const hoverBg = token.colorFillTertiary;

	const initials = user?.name ? getUserInitials(user.name) : guestInitial;
	const avatarColor = user?.name
		? getAvatarColor(user.name)
		: "bg-linear-to-br from-blue-500 via-purple-500 to-pink-500";

	const handleSettings = useCallback(() => {
		if (onOpenSettings) {
			onOpenSettings();
			return;
		}
		navigate(settingsPath);
	}, [navigate, onOpenSettings, settingsPath]);

	return (
		<div
			className="h-14 px-3 flex items-center justify-between flex-none border-t"
			style={{ borderColor: token.colorBorderSecondary }}
			data-testid="sidebar-user-row"
		>
			<div className="flex items-center gap-2.5 min-w-0">
				<div
					className={cn(
						"w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold flex-none shadow-sm",
						avatarColor,
					)}
				>
					{initials}
				</div>
				<span
					className="text-[13px] font-medium truncate"
					style={{ color: token.colorText }}
				>
					{user?.name || t("guest", "访客", { ns: "common" })}
				</span>
			</div>
			<div className="flex items-center gap-1">
				<ThemeToggleButton color={mutedColor} hoverBg={hoverBg} />
				<Tooltip title={t("title", "设置", { ns: "settings" })} mouseEnterDelay={0.3}>
					<button
						type="button"
						onClick={handleSettings}
						className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
						style={{ color: mutedColor }}
						data-testid="sidebar-user-settings"
						onMouseEnter={(e) => {
							e.currentTarget.style.background = hoverBg;
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
						}}
					>
						<SettingOutlined className="text-[15px]" />
					</button>
				</Tooltip>
			</div>
		</div>
	);
};

export default SidebarUserRow;
