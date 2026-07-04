import {
	ApiOutlined,
	BellOutlined,
	BugOutlined,
	CloudOutlined,
	FolderOutlined,
	HistoryOutlined,
	InfoCircleOutlined,
	KeyOutlined,
	LeftOutlined,
	RobotOutlined,
	SettingOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { theme } from "antd";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
	SETTINGS_NAVIGATION_GROUPS,
	type SettingsNavigationKey,
} from "../../lib/settingsNavigation";
import { useSidebarLayoutStore } from "../../stores/sidebarLayoutStore";
import { SidebarResizeHandle } from "../layout/SidebarResizeHandle";
import { SidebarUserRow } from "../layout/SidebarUserRow";

const { useToken } = theme;

/**
 * Detect macOS to reserve space for native traffic lights at the top of
 * the rail (same helper as `ClaudeSidebar` / `AppSidebar`).
 */
function isMacPlatform(): boolean {
	if (typeof navigator === "undefined") return false;
	return navigator.platform.toLowerCase().includes("mac");
}

export function getSettingsNavigationIcon(
	key: SettingsNavigationKey,
): React.ReactNode {
	switch (key) {
		case "general":
			return <SettingOutlined />;
		case "models":
			return <CloudOutlined />;
		case "agent":
			return <RobotOutlined />;
		case "tools-permissions":
			return <ToolOutlined />;
		case "projects":
			return <FolderOutlined />;
		case "project-recovery":
			return <HistoryOutlined />;
		case "keyboard":
			return <KeyOutlined />;
		case "api-service":
			return <ApiOutlined />;
		case "webhook":
			return <BellOutlined />;
		case "advanced":
			return <BugOutlined />;
		case "about":
			return <InfoCircleOutlined />;
	}
}

/**
 * Returns the active Settings nav key derived from the current pathname
 * (e.g. `/settings/models` → `models`). Falls back to `general` when the
 * path is `/settings` with no child.
 */
export function getActiveSettingsKey(
	pathname: string,
): SettingsNavigationKey | null {
	if (!pathname.startsWith("/settings")) return null;
	const rest = pathname.slice("/settings".length).replace(/^\/+/, "");
	if (!rest) return "general";
	const first = rest.split("/")[0];
	const found = SETTINGS_NAVIGATION_GROUPS.find((g) => g.key === first);
	return found ? (found.key as SettingsNavigationKey) : null;
}

export interface SettingsRailProps {
	/** Optional override for the "back to workspace" handler (used in tests). */
	onBack?: () => void;
}

/**
 * Left rail for the Settings shell. Renders:
 *  - "Back to workspace" button
 *  - The 11 navigation items from SETTINGS_NAVIGATION_GROUPS
 *  - Shared bottom user row (avatar + name + theme toggle + settings icon)
 */
export const SettingsRail: React.FC<SettingsRailProps> = ({ onBack }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { token } = useToken();

	const activeKey = getActiveSettingsKey(location.pathname);

	// Share the workspace sidebar's persisted width so entering / leaving
	// Settings doesn't visually "jump" (workspace sidebars default to 280px
	// and are user-resizable; the rail must track the same value).
	const width = useSidebarLayoutStore((s) => s.width);
	const setWidth = useSidebarLayoutStore((s) => s.setWidth);

	const handleBack = useCallback(() => {
		if (onBack) {
			onBack();
			return;
		}
		// "返回工作区" 语义就是回到 Chat / 工作区，不用 history.back()：
		//  - history 里可能是 Settings 内部跳转（Rail 点了几次就回不到工作区）
		//  - 我们直接 navigate("/chat")；Chat 页会根据 chatStore 的
		//    currentConversationId 恢复到上次会话（或空态）
		navigate("/chat");
	}, [navigate, onBack]);

	const handleItemClick = useCallback(
		(key: SettingsNavigationKey) => {
			navigate(`/settings/${key}`);
		},
		[navigate],
	);

	return (
		<aside
			className="flex flex-col flex-none border-r relative"
			style={{
				width,
				borderColor: token.colorBorderSecondary,
				background: token.colorBgLayout,
			}}
			data-testid="settings-rail"
		>
			{/* macOS traffic lights occupy ~78×30 at (0,0). Spacer keeps
			    "返回工作区" and other interactive content clear of them. */}
			<div
				className="flex-none"
				style={{ height: isMacPlatform() ? 30 : 8 }}
				aria-hidden="true"
			/>

			{/* Back to workspace */}
			<div className="p-2">
				<button
					type="button"
					onClick={handleBack}
					className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors"
					style={{ color: token.colorText }}
					aria-label={t("settingsShell.backToWorkspace", "返回工作区", {
						ns: "settings",
					})}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = token.colorFillTertiary;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "";
					}}
				>
					<LeftOutlined />
					<span>
						{t("settingsShell.backToWorkspace", "返回工作区", {
							ns: "settings",
						})}
					</span>
				</button>
			</div>

			{/* Nav items */}
			<nav
				className="flex-1 overflow-y-auto px-2 pb-2"
				aria-label={t("title", "Settings", { ns: "settings" })}
			>
				<ul className="flex flex-col gap-1 list-none m-0 p-0">
					{SETTINGS_NAVIGATION_GROUPS.map((group) => {
						const isActive = activeKey === group.key;
						const label = t(group.labelKey, group.fallback, {
							ns: "settings",
						});
						return (
							<li key={group.key}>
								<button
									type="button"
									onClick={() => handleItemClick(group.key)}
									aria-label={label}
									aria-current={isActive ? "page" : undefined}
									data-active={isActive ? "true" : "false"}
									className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors focus:outline-none"
									style={
										isActive
											? {
													backgroundColor: token.colorPrimaryBg,
													color: token.colorPrimary,
												}
											: {
													backgroundColor: "transparent",
													color: token.colorTextSecondary,
												}
									}
									onMouseEnter={(e) => {
										if (!isActive) {
											e.currentTarget.style.background =
												token.colorFillTertiary;
											e.currentTarget.style.color = token.colorText;
										}
									}}
									onMouseLeave={(e) => {
										if (!isActive) {
											e.currentTarget.style.background = "transparent";
											e.currentTarget.style.color = token.colorTextSecondary;
										}
									}}
								>
									<span className="text-sm flex-none">
										{getSettingsNavigationIcon(group.key)}
									</span>
									<span className="truncate">{label}</span>
								</button>
							</li>
						);
					})}
				</ul>
			</nav>

			{/* Shared bottom user row — same treatment as workspace sidebar. */}
			<SidebarUserRow />

			{/* Right-edge resize handle. Uses the same shared store as the
			    workspace sidebars, so dragging here also affects them
			    (and vice-versa) — that's the whole point: one persisted
			    sidebar width across workspace and settings. */}
			<SidebarResizeHandle currentWidth={width} onWidthChange={setWidth} />
		</aside>
	);
};

export default SettingsRail;
