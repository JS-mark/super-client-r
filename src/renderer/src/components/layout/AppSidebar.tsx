import {
	ApiOutlined,
	AppstoreOutlined,
	BarsOutlined,
	ClusterOutlined,
	DesktopOutlined,
	DownOutlined,
	FolderAddOutlined,
	FolderOpenOutlined,
	FolderOutlined,
	MessageOutlined,
	MoonOutlined,
	MoreOutlined,
	PlusOutlined,
	RobotOutlined,
	RocketOutlined,
	SearchOutlined,
	SettingOutlined,
	StarOutlined,
	SunOutlined,
} from "@ant-design/icons";
import {
	Dropdown,
	Input,
	type InputRef,
	type MenuProps,
	Tooltip,
	message,
	theme,
} from "antd";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useNewConversation } from "../../hooks/useNewConversation";
import {
	PROJECT_MENU_IDS,
	findMenuItem,
	getEffectiveMenuItems,
	getVisibleMenuItems,
	isMenuItemEnabled,
} from "../../lib/menuConfig";
import {
	getProjectIdFromConversation,
	useChatStore,
} from "../../stores/chatStore";
import { useChatMessageStore } from "../../stores/chatMessageStore";
import { useFeatureFlagsStore } from "../../stores/featureFlagsStore";
import { useMenuStore } from "../../stores/menuStore";
import { useSidebarLayoutStore } from "../../stores/sidebarLayoutStore";
import { useThemeStore } from "../../stores/themeStore";
import {
	getAvatarColor,
	getUserInitials,
	useUserStore,
} from "../../stores/userStore";
import { useProjectStore, useSortedProjects } from "../../stores/projectStore";
import type { ConversationSummary } from "../../types/electron";
import type { MenuItemConfig } from "../../types/menu";
import { ProjectContextMenu } from "../project/ProjectContextMenu";
import { ProjectSettingsModal } from "../project/ProjectSettingsModal";
import { SessionContextMenu } from "./SessionContextMenu";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

const { useToken } = theme;

// ---- Codex sidebar palette (stays dark in both themes) ----
const SIDEBAR_BG = "#15161a";
const SIDEBAR_BORDER = "rgba(255,255,255,0.06)";
const TEXT_PRIMARY = "rgba(255,255,255,0.85)";
const TEXT_SECONDARY = "rgba(255,255,255,0.55)";
const TEXT_MUTED = "rgba(255,255,255,0.4)";
const HOVER_BG = "rgba(255,255,255,0.04)";
const ACTIVE_BG = "rgba(255,255,255,0.06)";
const CHIP_BG = "rgba(255,255,255,0.08)";

// Reusable hover handlers — inline because no CSS files allowed.
const hoverIn = (
	e: React.MouseEvent<HTMLElement>,
	bg = HOVER_BG,
	color?: string,
) => {
	e.currentTarget.style.backgroundColor = bg;
	if (color) e.currentTarget.style.color = color;
};
const hoverOut = (e: React.MouseEvent<HTMLElement>, color?: string) => {
	e.currentTarget.style.backgroundColor = "transparent";
	if (color) e.currentTarget.style.color = color;
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
	MessageOutlined,
	AppstoreOutlined,
	RocketOutlined,
	SettingOutlined,
	ApiOutlined,
	StarOutlined,
	FolderOutlined,
	RobotOutlined,
	DesktopOutlined,
	ClusterOutlined,
	PluginOutlined: AppstoreOutlined,
};

function isMac(): boolean {
	if (typeof navigator === "undefined") return false;
	return /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

function modKey(): string {
	return isMac() ? "⌘" : "Ctrl";
}

function formatRelativeTime(ts: number): string {
	if (!ts) return "";
	const diff = Date.now() - ts;
	if (diff < 60_000) return "刚刚";
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes}分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}小时前`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}天前`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}个月前`;
	const years = Math.floor(months / 12);
	return `${years}年前`;
}

function renderPluginItemIcon(item: MenuItemConfig): React.ReactNode {
	if (item.iconType === "emoji") {
		return <span className="text-base leading-none">{item.iconContent}</span>;
	}
	if (item.iconType === "image") {
		return (
			<img
				src={item.iconContent}
				alt={item.label}
				className="w-4 h-4 object-contain"
			/>
		);
	}
	const iconKey = item.iconContent || "AppstoreOutlined";
	const IconComponent = ICON_MAP[iconKey] || AppstoreOutlined;
	return <IconComponent className="text-[13px]" />;
}

const THEME_CYCLE = ["light", "dark", "auto"] as const;

interface AppSidebarProps {
	onOpenAbout?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { token } = useToken();

	const conversations = useChatStore((s) => s.conversations);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	const isStreaming = useChatMessageStore((s) => s.isStreaming);

	// D-3: 切到 useProjectStore
	const workspaces = useSortedProjects();
	const currentWorkspaceId = useProjectStore((s) => s.currentProjectId);

	const pluginItems = useMenuStore((s) => s.pluginItems);
	const menuItems = useMenuStore((s) => s.items);
	// Compatibility flag is still persisted, but Extensions route is no longer exposed.
	const unifiedNavigation = useFeatureFlagsStore((s) => s.unifiedNavigation);
	const effectiveMenuItems = useMemo(
		() => getEffectiveMenuItems(menuItems, { unifiedNavigation }),
		[menuItems, unifiedNavigation],
	);
	const chatMenuEnabled = isMenuItemEnabled(effectiveMenuItems, "chat", true);
	const projectsMenuEnabled = isMenuItemEnabled(
		effectiveMenuItems,
		PROJECT_MENU_IDS,
		true,
	);
	const skillsMenuItem = findMenuItem(effectiveMenuItems, "skills");
	const skillsMenuEnabled = skillsMenuItem?.enabled ?? false;

	const { user, isLoggedIn, logout } = useUserStore();
	const themeMode = useThemeStore((s) => s.mode);

	// 折叠按钮 + collapsed 状态已彻底移除（R-8）。
	const width = useSidebarLayoutStore((s) => s.width);
	const setWidth = useSidebarLayoutStore((s) => s.setWidth);
	const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
		() => {
			const initial = new Set<string>();
			const activeConv = conversations.find(
				(c) => c.id === currentConversationId,
			);
			if (activeConv?.workspaceId) initial.add(activeConv.workspaceId);
			else if (currentWorkspaceId) initial.add(currentWorkspaceId);
			return initial;
		},
	);
	// plan §23.2 — archived sessions live in a per-workspace collapsible group.
	const [expandedArchived, setExpandedArchived] = useState<Set<string>>(
		() => new Set(),
	);
	// plan §23.2 — inline rename: id of the conversation currently being renamed.
	const [renamingConversationId, setRenamingConversationId] = useState<
		string | null
	>(null);
	// E-2: project settings modal trigger — projectId set when opened.
	const [settingsProjectId, setSettingsProjectId] = useState<string | null>(
		null,
	);

	// F-7 inline rename：当前正在被重命名的 project id
	const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
		null,
	);
	const handleProjectRenameCommit = useCallback(
		async (id: string, newName: string) => {
			const trimmed = newName.trim();
			if (trimmed) {
				await useProjectStore.getState().rename(id, trimmed);
			}
			setRenamingProjectId(null);
		},
		[],
	);
	const handleProjectRenameCancel = useCallback(() => {
		setRenamingProjectId(null);
	}, []);

	const handleRenameStart = useCallback((conv: ConversationSummary) => {
		setRenamingConversationId(conv.id);
	}, []);

	const handleRenameCommit = useCallback(
		async (conversationId: string, value: string) => {
			const trimmed = value.trim();
			if (trimmed) {
				await useChatStore
					.getState()
					.renameConversation(conversationId, trimmed);
			}
			setRenamingConversationId(null);
		},
		[],
	);

	const handleRenameCancel = useCallback(() => {
		setRenamingConversationId(null);
	}, []);

	const toggleArchivedExpand = useCallback((workspaceId: string) => {
		setExpandedArchived((prev) => {
			const next = new Set(prev);
			if (next.has(workspaceId)) next.delete(workspaceId);
			else next.add(workspaceId);
			return next;
		});
	}, []);

	// D-3: useSortedProjects 已经返回排序好的列表，不再 local memo
	const sortedWorkspaces = workspaces;

	// plan §23.4 — sort pinned first, then by updatedAt desc; archived sessions
	// are tracked separately so the project group can render the collapsible
	// "已归档" row at the bottom.
	const conversationsByWorkspace = useMemo(() => {
		const active = new Map<string, ConversationSummary[]>();
		const archived = new Map<string, ConversationSummary[]>();
		for (const conv of conversations) {
			const key = conv.workspaceId || "";
			if (!key) continue;
			if (conv.session?.flags?.archived) {
				const list = archived.get(key) ?? [];
				list.push(conv);
				archived.set(key, list);
			} else {
				const list = active.get(key) ?? [];
				list.push(conv);
				active.set(key, list);
			}
		}
		const sortFn = (a: ConversationSummary, b: ConversationSummary) => {
			const ap = a.session?.flags?.pinned ? 1 : 0;
			const bp = b.session?.flags?.pinned ? 1 : 0;
			if (ap !== bp) return bp - ap;
			return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
		};
		for (const [k, list] of active) active.set(k, [...list].sort(sortFn));
		for (const [k, list] of archived)
			archived.set(
				k,
				[...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
			);
		return { active, archived };
	}, [conversations]);

	// 共享 reuse-or-create 入口；创建前自动展开目标项目分组。
	const { openOrCreateConversation } = useNewConversation({
		onBeforeCreate: (targetProjectId) => {
			if (!targetProjectId) return;
			setExpandedWorkspaces((prev) => {
				if (prev.has(targetProjectId)) return prev;
				const next = new Set(prev);
				next.add(targetProjectId);
				return next;
			});
		},
	});

	// 顶部"新建对话"——目标省略，hook 内部从当前会话派生
	const handleNewTask = useCallback(async () => {
		await openOrCreateConversation();
	}, [openOrCreateConversation]);

	// 项目行 hover "+"——目标 = 该项目
	const handleNewTaskInWorkspace = useCallback(
		async (workspaceId: string) => {
			useProjectStore.getState().setCurrent(workspaceId);
			await openOrCreateConversation(workspaceId);
		},
		[openOrCreateConversation],
	);

	// 新建项目（目录选择器 → projects.add）
	const handleCreateProject = useCallback(async () => {
		try {
			const project = await useProjectStore.getState().pickAndAdd();
			if (project) {
				message.success(`项目已添加：${project.name}`);
			}
		} catch (err) {
			console.error("Failed to create project:", err);
			message.error("创建项目失败");
		}
	}, []);

	const handleSkills = useCallback(() => {
		navigate(skillsMenuItem?.path ?? "/skills");
	}, [navigate, skillsMenuItem?.path]);

	const toggleWorkspaceExpand = useCallback((workspaceId: string) => {
		setExpandedWorkspaces((prev) => {
			const next = new Set(prev);
			if (next.has(workspaceId)) next.delete(workspaceId);
			else next.add(workspaceId);
			return next;
		});
	}, []);

	const handleConversationClick = useCallback(
		async (workspaceId: string, conversationId: string) => {
			// 归一化 workspaceId → projectId 语义
			const projectId = getProjectIdFromConversation({ workspaceId });
			if (projectId !== currentWorkspaceId) {
				useProjectStore.getState().setCurrent(projectId);
			}
			try {
				await useChatStore.getState().switchConversation(conversationId);
			} catch (err) {
				console.error("Failed to switch conversation:", err);
			}
			navigate("/chat");
		},
		[currentWorkspaceId, navigate],
	);

	const handleLogout = useCallback(() => {
		logout();
		navigate("/");
	}, [logout, navigate]);

	const handleThemeCycle = useCallback(async () => {
		const { mode: current, setMode } = useThemeStore.getState();
		const idx = THEME_CYCLE.indexOf(current);
		const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
		setMode(next);
		try {
			await window.electron.theme.set(next);
		} catch (err) {
			console.error("Failed to sync theme:", err);
		}
	}, []);

	const overflowMenuItems: MenuProps["items"] = useMemo(() => {
		const legacyIds = new Set([
			"mcp",
			"skills",
			"plugins",
			"bookmarks",
			"workspaces",
			"imbot",
		]);
		const legacy = getVisibleMenuItems(effectiveMenuItems, legacyIds).map(
			(m) => ({
				key: m.id,
				label: t(m.label, { ns: "menu" }),
				onClick: () => navigate(m.path),
			}),
		);
		const items: MenuProps["items"] = [];
		if (legacy.length > 0) {
			items.push(...legacy);
			items.push({ type: "divider" });
		}
		items.push({
			key: "settings",
			label: t("settings", "设置", { ns: "menu" }),
			icon: <SettingOutlined />,
			onClick: () => navigate("/settings"),
		});
		items.push({
			key: "theme",
			label: t(`theme.${themeMode}`, themeMode, { ns: "settings" }),
			icon:
				themeMode === "dark" ? (
					<MoonOutlined />
				) : themeMode === "auto" ? (
					<DesktopOutlined />
				) : (
					<SunOutlined />
				),
			onClick: handleThemeCycle,
		});
		return items;
	}, [effectiveMenuItems, navigate, t, themeMode, handleThemeCycle]);

	const userMenuItems: MenuProps["items"] = useMemo(
		() => [
			{
				key: "username",
				label: user?.name || t("guest", "访客", { ns: "user" }),
				disabled: true,
			},
			{ type: "divider" },
			{
				key: "settings",
				label: t("settings", "设置", { ns: "menu" }),
				icon: <SettingOutlined />,
				onClick: () => navigate("/settings"),
			},
			{ type: "divider" },
			{
				key: "logout",
				label: t("logout", "退出登录", { ns: "user" }),
				onClick: handleLogout,
			},
		],
		[user, t, navigate, handleLogout],
	);

	const initials = user?.name ? getUserInitials(user.name) : "S";
	const avatarColor = user?.name
		? getAvatarColor(user.name)
		: "bg-linear-to-br from-blue-500 via-purple-500 to-pink-500";

	const settingsActive = location.pathname.startsWith("/settings");

	// 折叠模式已移除（仅保留侧边可拖拽）。
	return (
		<aside
			className="h-full flex-none flex flex-col pt-[30px]"
			style={{
				width,
				position: "relative",
				backgroundColor: SIDEBAR_BG,
				borderRight: `1px solid ${SIDEBAR_BORDER}`,
			}}
		>
			{/* Top: branding（折叠按钮已移除） */}
			<div className="px-3 pb-2 flex items-center">
				<span
					className="text-[13px] font-semibold tracking-wide select-none"
					style={{ color: TEXT_PRIMARY }}
				>
					Codex
				</span>
			</div>

			{/* Quick actions */}
			<div className="px-2 flex flex-col gap-0.5">
				{chatMenuEnabled && (
					<QuickAction
						icon={<PlusOutlined style={{ fontSize: 13 }} />}
						label="新建对话"
						shortcut={`${modKey()}N`}
						onClick={handleNewTask}
					/>
				)}
				{skillsMenuEnabled && (
					<QuickAction
						icon={<RocketOutlined style={{ fontSize: 13 }} />}
						label={t(skillsMenuItem?.label ?? "skills", { ns: "menu" })}
						onClick={handleSkills}
					/>
				)}
			</div>

			{projectsMenuEnabled ? (
				<>
					{/* Projects section header */}
					<div className="px-3 pt-4 pb-1.5 flex items-center justify-between">
						<span
							className="text-[11px] font-semibold tracking-[0.08em] uppercase"
							style={{ color: TEXT_MUTED }}
						>
							项目
						</span>
						<div className="flex items-center gap-0.5">
							<SectionIconButton
								title="新建项目"
								icon={<PlusOutlined />}
								onClick={handleCreateProject}
							/>
							<SectionIconButton title="筛选" icon={<BarsOutlined />} />
							<SectionIconButton title="搜索" icon={<SearchOutlined />} />
							<SectionIconButton
								title="折叠全部"
								icon={<FolderOpenOutlined />}
								onClick={() => setExpandedWorkspaces(new Set())}
							/>
						</div>
					</div>

					{/* Workspaces + conversations */}
					<div className="flex-1 overflow-y-auto px-2 pb-2">
						{sortedWorkspaces.length === 0 && (
							<button
								type="button"
								onClick={handleCreateProject}
								className="mx-1 mt-1 px-2 py-2 flex items-center gap-2 rounded-md text-[12px] transition-colors"
								style={{ color: TEXT_MUTED }}
								onMouseEnter={(e) => hoverIn(e, HOVER_BG, TEXT_SECONDARY)}
								onMouseLeave={(e) => hoverOut(e, TEXT_MUTED)}
							>
								<FolderAddOutlined />
								<span>添加目录作为项目</span>
							</button>
						)}
						{sortedWorkspaces.map((ws) => {
							const expanded = expandedWorkspaces.has(ws.id);
							const wsActive = conversationsByWorkspace.active.get(ws.id) ?? [];
							const wsArchived =
								conversationsByWorkspace.archived.get(ws.id) ?? [];
							// plan §23.4 — count badge excludes archived sessions.
							const count = wsActive.length;
							const archivedExpanded = expandedArchived.has(ws.id);
							return (
								<div key={ws.id} className="mb-px">
									<ProjectContextMenu
										project={ws}
										onRename={(p) => setRenamingProjectId(p.id)}
									>
										<ProjectHeader
											id={ws.id}
											name={ws.name}
											count={count}
											expanded={expanded}
											onToggle={() => toggleWorkspaceExpand(ws.id)}
											onAdd={() => handleNewTaskInWorkspace(ws.id)}
											onSettings={() => setSettingsProjectId(ws.id)}
											renaming={renamingProjectId === ws.id}
											onRenameCommit={handleProjectRenameCommit}
											onRenameCancel={handleProjectRenameCancel}
										/>
									</ProjectContextMenu>
									{expanded && (
										<div className="ml-5 mt-px mb-0.5 flex flex-col">
											{wsActive.length === 0 ? (
												<div
													className="h-7 px-2 text-[12px] italic flex items-center"
													style={{ color: TEXT_MUTED }}
												>
													—
												</div>
											) : (
												wsActive.map((conv) => (
													<SessionContextMenu
														key={conv.id}
														conversation={conv}
														onRename={handleRenameStart}
													>
														<ConversationRow
															name={conv.name || "未命名会话"}
															updatedAt={conv.updatedAt}
															active={conv.id === currentConversationId}
															running={
																isStreaming && conv.id === currentConversationId
															}
															pinned={!!conv.session?.flags?.pinned}
															unread={!!conv.session?.flags?.unread}
															accent={token.colorPrimary}
															isRenaming={renamingConversationId === conv.id}
															onClick={() =>
																handleConversationClick(ws.id, conv.id)
															}
															onRenameCommit={(value) =>
																handleRenameCommit(conv.id, value)
															}
															onRenameCancel={handleRenameCancel}
														/>
													</SessionContextMenu>
												))
											)}
											{wsArchived.length > 0 && (
												<div className="mt-1">
													<button
														type="button"
														onClick={() => toggleArchivedExpand(ws.id)}
														className="w-full h-6 px-2 flex items-center gap-2 rounded-lg transition-colors text-[11px]"
														style={{ color: TEXT_MUTED }}
														onMouseEnter={(e) =>
															hoverIn(e, HOVER_BG, TEXT_SECONDARY)
														}
														onMouseLeave={(e) => hoverOut(e, TEXT_MUTED)}
													>
														<span
															className="w-3 flex items-center justify-center transition-transform"
															style={{
																transform: archivedExpanded
																	? "rotate(0deg)"
																	: "rotate(-90deg)",
															}}
														>
															<DownOutlined style={{ fontSize: 8 }} />
														</span>
														<span className="flex-1 text-left">
															已归档 ({wsArchived.length})
														</span>
													</button>
													{archivedExpanded && (
														<div className="flex flex-col">
															{wsArchived.map((conv) => (
																<SessionContextMenu
																	key={conv.id}
																	conversation={conv}
																	onRename={handleRenameStart}
																>
																	<ConversationRow
																		name={conv.name || "未命名会话"}
																		updatedAt={conv.updatedAt}
																		active={conv.id === currentConversationId}
																		running={
																			isStreaming &&
																			conv.id === currentConversationId
																		}
																		pinned={false}
																		unread={false}
																		accent={token.colorPrimary}
																		isRenaming={
																			renamingConversationId === conv.id
																		}
																		onClick={() =>
																			handleConversationClick(ws.id, conv.id)
																		}
																		onRenameCommit={(value) =>
																			handleRenameCommit(conv.id, value)
																		}
																		onRenameCancel={handleRenameCancel}
																	/>
																</SessionContextMenu>
															))}
														</div>
													)}
												</div>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</>
			) : (
				<div className="flex-1" />
			)}

			{/* Plugin contributions */}
			{pluginItems.length > 0 && (
				<>
					<div
						className="px-3 pt-3 pb-1.5"
						style={{ borderTop: `1px solid ${SIDEBAR_BORDER}` }}
					>
						<span
							className="text-[11px] font-semibold tracking-[0.08em] uppercase"
							style={{ color: TEXT_MUTED }}
						>
							插件
						</span>
					</div>
					<div className="px-2 pb-1 flex flex-col gap-0.5">
						{pluginItems.map((item) => {
							const isActive = location.pathname.startsWith(item.path);
							return (
								<button
									key={item.id}
									type="button"
									onClick={() => navigate(item.path)}
									className="w-full h-8 px-2.5 flex items-center gap-2.5 rounded-lg text-[13px] transition-colors"
									style={{
										color: isActive ? TEXT_PRIMARY : TEXT_SECONDARY,
										backgroundColor: isActive ? ACTIVE_BG : "transparent",
									}}
									onMouseEnter={(e) => {
										if (!isActive) hoverIn(e);
									}}
									onMouseLeave={(e) => {
										if (!isActive) hoverOut(e);
									}}
								>
									<span
										className="w-4 flex items-center justify-center"
										style={{ color: TEXT_SECONDARY }}
									>
										{renderPluginItemIcon(item)}
									</span>
									<span className="flex-1 text-left truncate">
										{item.label}
									</span>
								</button>
							);
						})}
					</div>
				</>
			)}

				{/* Bottom: user identity */}
				<div className="mt-auto px-2 py-2 flex items-center gap-1">
				<Dropdown
					menu={{ items: userMenuItems }}
					placement="topLeft"
					trigger={["click"]}
				>
					<button
						type="button"
						className="flex-1 h-9 px-1.5 flex items-center gap-2 rounded-lg transition-colors"
						onMouseEnter={(e) => hoverIn(e)}
						onMouseLeave={(e) => hoverOut(e)}
					>
						<div
							className={cn(
								"w-7 h-7 rounded-lg flex-none flex items-center justify-center",
								isLoggedIn ? avatarColor : "bg-slate-600",
							)}
						>
							<span className="text-white font-semibold text-[11px]">
								{initials}
							</span>
						</div>
						<span
							className="flex-1 text-left text-[13px] truncate"
							style={{ color: TEXT_PRIMARY }}
						>
							{isLoggedIn && user
								? user.name
								: t("notLoggedIn", "未登录", { ns: "user" })}
						</span>
					</button>
				</Dropdown>
				<Dropdown
					menu={{ items: overflowMenuItems }}
					placement="topRight"
					trigger={["click"]}
				>
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
						style={{ color: TEXT_MUTED }}
						onMouseEnter={(e) => hoverIn(e, HOVER_BG, TEXT_PRIMARY)}
						onMouseLeave={(e) => hoverOut(e, TEXT_MUTED)}
						title="更多"
					>
						<MoreOutlined />
					</button>
				</Dropdown>
				<button
					type="button"
					onClick={() => navigate("/settings")}
					className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
					style={{
						color: settingsActive ? TEXT_PRIMARY : TEXT_MUTED,
						backgroundColor: settingsActive ? ACTIVE_BG : "transparent",
					}}
					onMouseEnter={(e) => {
						if (!settingsActive) hoverIn(e, HOVER_BG, TEXT_PRIMARY);
					}}
					onMouseLeave={(e) => {
						if (!settingsActive) hoverOut(e, TEXT_MUTED);
					}}
					title="设置"
				>
					<SettingOutlined />
				</button>
			</div>

			<SidebarResizeHandle currentWidth={width} onWidthChange={setWidth} />

			<ProjectSettingsModal
				projectId={settingsProjectId}
				open={settingsProjectId !== null}
				onClose={() => setSettingsProjectId(null)}
			/>
		</aside>
	);
};

// =====================================================================
// Subcomponents
// =====================================================================

interface QuickActionProps {
	icon: React.ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({
	icon,
	label,
	shortcut,
	onClick,
}) => (
	<button
		type="button"
		onClick={onClick}
		className="w-full h-8 px-2.5 flex items-center gap-2.5 rounded-lg transition-colors text-[13px]"
		style={{ color: TEXT_PRIMARY }}
		onMouseEnter={(e) => hoverIn(e)}
		onMouseLeave={(e) => hoverOut(e)}
	>
		<span
			className="w-4 flex items-center justify-center"
			style={{ color: TEXT_SECONDARY }}
		>
			{icon}
		</span>
		<span className="flex-1 text-left truncate">{label}</span>
		{shortcut && (
			<span
				className="text-[10px] font-mono px-1.5 py-0.5 rounded"
				style={{ backgroundColor: CHIP_BG, color: TEXT_SECONDARY }}
			>
				{shortcut}
			</span>
		)}
	</button>
);

interface SectionIconButtonProps {
	icon: React.ReactNode;
	title: string;
	onClick?: () => void;
}

const SectionIconButton: React.FC<SectionIconButtonProps> = ({
	icon,
	title,
	onClick,
}) => (
	<button
		type="button"
		onClick={onClick}
		title={title}
		className="w-5 h-5 flex items-center justify-center rounded transition-colors"
		style={{ color: TEXT_MUTED, fontSize: 11 }}
		onMouseEnter={(e) => hoverIn(e, HOVER_BG, TEXT_PRIMARY)}
		onMouseLeave={(e) => hoverOut(e, TEXT_MUTED)}
	>
		{icon}
	</button>
);

interface ProjectHeaderProps {
	id: string;
	name: string;
	count: number;
	expanded: boolean;
	onToggle: () => void;
	onAdd: () => void;
	onSettings: () => void;
	/** F-7 inline rename：renaming===true 时整行渲染为 Input */
	renaming?: boolean;
	onRenameCommit?: (id: string, newName: string) => void;
	onRenameCancel?: () => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({
	id,
	name,
	count,
	expanded,
	onToggle,
	onAdd,
	onSettings,
	renaming = false,
	onRenameCommit,
	onRenameCancel,
}) => {
	const [hovered, setHovered] = useState(false);

	if (renaming) {
		return (
			<div
				className="w-full h-7 px-2 flex items-center gap-2 rounded-lg text-[13px]"
				style={{ color: TEXT_PRIMARY }}
			>
				<span className="w-3 flex items-center justify-center" />
				<FolderOutlined style={{ color: TEXT_SECONDARY, fontSize: 13 }} />
				<Input
					autoFocus
					size="small"
					defaultValue={name}
					onPressEnter={(e) => {
						const v = (e.target as HTMLInputElement).value.trim();
						onRenameCommit?.(id, v || name);
					}}
					onBlur={(e) => {
						const v = e.target.value.trim();
						onRenameCommit?.(id, v || name);
					}}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.stopPropagation();
							onRenameCancel?.();
						}
					}}
				/>
			</div>
		);
	}

	return (
		<div
			className="group w-full h-7 px-2 flex items-center gap-2 rounded-lg transition-colors text-[13px] relative"
			style={{ color: TEXT_PRIMARY }}
			onMouseEnter={(e) => {
				hoverIn(e);
				setHovered(true);
			}}
			onMouseLeave={(e) => {
				hoverOut(e);
				setHovered(false);
			}}
		>
			<button
				type="button"
				onClick={onToggle}
				className="flex items-center gap-2 flex-1 min-w-0 h-full"
				style={{ background: "transparent", color: "inherit" }}
			>
				<span
					className="w-3 flex items-center justify-center transition-transform"
					style={{
						color: TEXT_MUTED,
						transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
					}}
				>
					<DownOutlined style={{ fontSize: 9 }} />
				</span>
				<FolderOutlined style={{ color: TEXT_SECONDARY, fontSize: 13 }} />
				<span className="flex-1 text-left truncate">{name}</span>
			</button>
			{hovered ? (
				<div className="flex items-center gap-0.5">
					<Tooltip title="项目设置" placement="left">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onSettings();
							}}
							className="w-5 h-5 flex items-center justify-center rounded transition-colors"
							style={{ color: TEXT_SECONDARY }}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "rgba(255,255,255,0.08)";
								e.currentTarget.style.color = "#fff";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
								e.currentTarget.style.color = TEXT_SECONDARY;
							}}
							aria-label="项目设置"
						>
							<SettingOutlined style={{ fontSize: 11 }} />
						</button>
					</Tooltip>
					<Tooltip title="在此项目下新建对话" placement="left">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onAdd();
							}}
							className="w-5 h-5 flex items-center justify-center rounded transition-colors"
							style={{ color: TEXT_SECONDARY }}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "rgba(255,255,255,0.08)";
								e.currentTarget.style.color = "#fff";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
								e.currentTarget.style.color = TEXT_SECONDARY;
							}}
							aria-label="在此项目下新建对话"
						>
							<PlusOutlined style={{ fontSize: 11 }} />
						</button>
					</Tooltip>
				</div>
			) : (
				count > 0 && (
					<span
						className="text-[10px] tabular-nums"
						style={{ color: TEXT_MUTED }}
					>
						{count > 99 ? "99+" : count}
					</span>
				)
			)}
		</div>
	);
};

interface ConversationRowProps {
	name: string;
	updatedAt: number;
	active: boolean;
	running: boolean;
	pinned: boolean;
	unread: boolean;
	accent: string;
	isRenaming: boolean;
	onClick: () => void;
	onRenameCommit: (value: string) => void;
	onRenameCancel: () => void;
}

const ConversationRow: React.FC<ConversationRowProps> = ({
	name,
	updatedAt,
	active,
	running,
	pinned,
	unread,
	accent,
	isRenaming,
	onClick,
	onRenameCommit,
	onRenameCancel,
}) => {
	const inputRef = useRef<InputRef>(null);
	if (isRenaming) {
		return (
			<div
				className="relative w-full h-7 pr-2 flex items-center gap-2 rounded-lg"
				style={{ paddingLeft: 8 }}
			>
				<Input
					ref={inputRef}
					autoFocus
					defaultValue={name}
					size="small"
					onPressEnter={(e) =>
						onRenameCommit((e.target as HTMLInputElement).value)
					}
					onBlur={(e) => onRenameCommit(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.stopPropagation();
							onRenameCancel();
						}
					}}
					style={{
						height: 22,
						fontSize: 12,
						background: "rgba(255,255,255,0.08)",
						color: TEXT_PRIMARY,
						borderColor: "rgba(255,255,255,0.15)",
					}}
				/>
			</div>
		);
	}
	return (
		<button
			type="button"
			onClick={onClick}
			className="relative w-full h-7 pr-2 flex items-center gap-2 rounded-lg transition-colors text-[12px]"
			style={{
				color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
				backgroundColor: active ? ACTIVE_BG : "transparent",
				paddingLeft: active ? 10 : 8,
			}}
			onMouseEnter={(e) => {
				if (!active) hoverIn(e);
			}}
			onMouseLeave={(e) => {
				if (!active) hoverOut(e);
			}}
		>
			{active && (
				<span
					aria-hidden
					className="absolute left-1 top-1/2 -translate-y-1/2"
					style={{
						width: 2,
						height: 14,
						borderRadius: 1,
						backgroundColor: accent,
					}}
				/>
			)}
			{running && (
				<span
					className="flex-none rounded-full"
					style={{ width: 6, height: 6, backgroundColor: "#22c55e" }}
					aria-label="streaming"
				/>
			)}
			{pinned && (
				<span
					aria-label="pinned"
					className="flex-none"
					style={{ color: TEXT_MUTED, fontSize: 10 }}
				>
					★
				</span>
			)}
			<span className="flex-1 text-left truncate">{name}</span>
			{unread && (
				<span
					aria-label="unread"
					className="flex-none rounded-full"
					style={{ width: 6, height: 6, backgroundColor: accent }}
				/>
			)}
			<span
				className="text-[10px] flex-none tabular-nums"
				style={{ color: TEXT_MUTED }}
			>
				{formatRelativeTime(updatedAt)}
			</span>
		</button>
	);
};
