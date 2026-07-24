import {
	ApiOutlined,
	AppstoreOutlined,
	ClusterOutlined,
	DownOutlined,
	FolderAddOutlined,
	FolderOutlined,
	MessageOutlined,
	PlusOutlined,
	RocketOutlined,
	SearchOutlined,
	SettingOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { Input, type InputRef, Tooltip, message, theme } from "antd";
import { SidebarUserRow } from "./SidebarUserRow";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
	PROJECT_MENU_IDS,
	getEffectiveMenuItems,
	getVisibleMenuItems,
	isMenuItemEnabled,
} from "../../lib/menuConfig";
import {
	getProjectIdFromConversation,
	useChatStore,
} from "../../stores/chatStore";
import { useNewConversation } from "../../hooks/useNewConversation";
import type { ConversationSummary } from "../../types/electron";
import type { MenuItemConfig } from "../../types/menu";
import { SessionContextMenu } from "./SessionContextMenu";
import { GlobalSessionSearchModal } from "../chat/GlobalSessionSearchModal";
import { useFeatureFlagsStore } from "../../stores/featureFlagsStore";
import { useMenuStore } from "../../stores/menuStore";
import {
	DEFAULT_SHORTCUTS,
	formatShortcut,
	useShortcutStore,
} from "../../stores/shortcutStore";
import { useSidebarLayoutStore } from "../../stores/sidebarLayoutStore";
import { useProjectStore, useSortedProjects } from "../../stores/projectStore";
import { ProjectContextMenu } from "../project/ProjectContextMenu";
import { ProjectSettingsModal } from "../project/ProjectSettingsModal";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { createLogger } from "../../services/logService";

const log = createLogger("ClaudeSidebar");

const { useToken } = theme;

const CLAUDE_QUICK_MENU_IDS = new Set([
	"chat",
	"skills",
	"mcp",
  "bookmarks",
  "plugins",
	"imbot",
]);

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
	MessageOutlined,
	ApiOutlined,
	AppstoreOutlined,
	RocketOutlined,
	StarOutlined,
	ClusterOutlined,
};

const MENU_ICON_BY_ID: Record<string, string> = {
	skills: "RocketOutlined",
	mcp: "ApiOutlined",
	plugins: "AppstoreOutlined",
	bookmarks: "StarOutlined",
	imbot: "ClusterOutlined",
};

function isMac(): boolean {
	if (typeof navigator === "undefined") return false;
	return navigator.platform.toLowerCase().includes("mac");
}

function renderMenuIcon(item: MenuItemConfig): React.ReactNode {
	if (item.id === "chat") return <PlusOutlined />;
	if (item.iconType === "emoji") {
		return <span className="text-[14px] leading-none">{item.iconContent}</span>;
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
	const iconKey =
		item.iconContent || MENU_ICON_BY_ID[item.id] || "AppstoreOutlined";
	const IconComponent = ICON_MAP[iconKey] || AppstoreOutlined;
	return <IconComponent />;
}

/**
 * macOS traffic lights occupy ~78x30px at the top-left of the window.
 * Render a transparent spacer so the first interactive content starts below it.
 * On non-macOS platforms a small spacer keeps vertical rhythm consistent.
 */
const TrafficLightSpacer: React.FC<{ mac: boolean }> = ({ mac }) => (
	<div
		className="flex-none"
		style={{ height: mac ? 30 : 8 }}
		data-testid="traffic-light-spacer"
		aria-hidden="true"
	/>
);

/**
 * Lightweight relative-time formatter (zh-CN style).
 * Duplicated from AppSidebar to keep components decoupled.
 */
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

export interface ClaudeSidebarProps {
	onOpenAbout?: () => void;
}

interface QuickActionRowProps {
	icon: React.ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
	hoverBg: string;
	textColor: string;
	mutedColor: string;
	chipBg: string;
}

const QuickActionRow: React.FC<QuickActionRowProps> = ({
	icon,
	label,
	shortcut,
	onClick,
	hoverBg,
	textColor,
	mutedColor,
	chipBg,
}) => (
	<button
		type="button"
		onClick={onClick}
		className="group w-full h-8 px-2 flex items-center gap-2.5 rounded-md transition-all duration-150 text-[13px]"
		style={{ color: textColor }}
		onMouseEnter={(e) => {
			e.currentTarget.style.background = hoverBg;
		}}
		onMouseLeave={(e) => {
			e.currentTarget.style.background = "transparent";
		}}
	>
		<span
			className="w-4 flex items-center justify-center text-[14px] transition-colors"
			style={{ color: mutedColor }}
		>
			{icon}
		</span>
		<span className="flex-1 text-left truncate">{label}</span>
		{shortcut && (
			<span
				className="text-[10.5px] font-mono px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
				style={{ color: mutedColor, background: chipBg }}
			>
				{shortcut}
			</span>
		)}
	</button>
);

interface SectionHeaderProps {
	title: string;
	expanded: boolean;
	onToggle: () => void;
	mutedColor: string;
	hoverBg: string;
	/** Optional secondary action button rendered on the right (before chevron). */
	action?: { icon: React.ReactNode; onClick: () => void; tooltip?: string };
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
	title,
	expanded,
	onToggle,
	mutedColor,
	hoverBg,
	action,
}) => (
	<div
		className="w-full h-7 px-2 flex items-center justify-between rounded-md transition-all duration-150 group cursor-pointer"
		style={{ color: mutedColor }}
		onMouseEnter={(e) => {
			e.currentTarget.style.background = hoverBg;
		}}
		onMouseLeave={(e) => {
			e.currentTarget.style.background = "transparent";
		}}
		onClick={onToggle}
	>
		<span
			className="flex-1 text-[12px] font-medium select-none"
			style={{ letterSpacing: "0.02em" }}
		>
			{title}
		</span>
		<div className="flex items-center gap-1">
			{action && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						action.onClick();
					}}
					title={action.tooltip}
					className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-all hover:bg-black/5"
					style={{ color: "inherit" }}
				>
					{action.icon}
				</button>
			)}
			<span
				className="w-5 h-5 flex items-center justify-center transition-transform duration-200"
				style={{
					transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
				}}
			>
				<DownOutlined className="text-[9px] opacity-60" />
			</span>
		</div>
	</div>
);

export function ClaudeSidebar(_props: ClaudeSidebarProps): React.ReactElement {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { token } = useToken();

	// 折叠按钮 + collapsed 状态已彻底移除（R-8）。
	const width = useSidebarLayoutStore((s) => s.width);
	const setWidth = useSidebarLayoutStore((s) => s.setWidth);

	const conversations = useChatStore((s) => s.conversations);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	// D-3: 切到 useProjectStore（替代旧 workspaceConfigStore）
	const sortedWorkspaces = useSortedProjects();
	const currentWorkspaceId = useProjectStore((s) => s.currentProjectId);
	const menuItems = useMenuStore((s) => s.items);
	const unifiedNavigation = useFeatureFlagsStore((s) => s.unifiedNavigation);
	const effectiveMenuItems = useMemo(
		() => getEffectiveMenuItems(menuItems, { unifiedNavigation }),
		[menuItems, unifiedNavigation],
	);
	const quickMenuItems = useMemo(
		() => getVisibleMenuItems(effectiveMenuItems, CLAUDE_QUICK_MENU_IDS),
		[effectiveMenuItems],
	);
	const chatMenuEnabled = isMenuItemEnabled(effectiveMenuItems, "chat", true);
	const projectsMenuEnabled = isMenuItemEnabled(
		effectiveMenuItems,
		PROJECT_MENU_IDS,
		true,
	);

	const mac = useMemo(() => isMac(), []);

	// Quick-action shortcuts: read user-configurable keys from shortcutStore.
	// `shortcuts` may be `[]` on first render before zustand persist rehydrates,
	// so fall back to DEFAULT_SHORTCUTS.defaultKey to keep the hover chip stable.
	// Rendering goes through formatShortcut → "⌘ + N" / "Ctrl + N".
	const newChatShortcutKey = useShortcutStore(
		(s) => s.shortcuts.find((sh) => sh.id === "new-chat")?.currentKey,
	);
	const globalSearchShortcutKey = useShortcutStore(
		(s) => s.shortcuts.find((sh) => sh.id === "global-search")?.currentKey,
	);
	const newChatShortcut = useMemo(() => {
		const key =
			newChatShortcutKey ||
			DEFAULT_SHORTCUTS.find((s) => s.id === "new-chat")?.defaultKey;
		return key ? formatShortcut(key, mac) : undefined;
	}, [newChatShortcutKey, mac]);
	const globalSearchShortcut = useMemo(() => {
		const key =
			globalSearchShortcutKey ||
			DEFAULT_SHORTCUTS.find((s) => s.id === "global-search")?.defaultKey;
		return key ? formatShortcut(key, mac) : undefined;
	}, [globalSearchShortcutKey, mac]);

	const [recentsOpen, setRecentsOpen] = useState(true);
	const [projectsOpen, setProjectsOpen] = useState(true);
	const [searchModalOpen, setSearchModalOpen] = useState(false);

	useEffect(() => {
		const handler = () => setSearchModalOpen(true);
		window.addEventListener("chat:open-global-search", handler);
		return () => {
			window.removeEventListener("chat:open-global-search", handler);
		};
	}, []);

	// plan §23.4 — Recents = casual sessions only（projectId === null）。
	// 项目对话归属在 PROJECTS 区，不进 Recents，避免同一会话出现两次。
	const recentConversations = useMemo(() => {
		return [...conversations]
			.filter(
				(c) =>
					!c.session?.flags?.archived &&
					getProjectIdFromConversation(c) === null,
			)
			.sort((a, b) => {
				const ap = a.session?.flags?.pinned ? 1 : 0;
				const bp = b.session?.flags?.pinned ? 1 : 0;
				if (ap !== bp) return bp - ap;
				return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
			})
			.slice(0, 12);
	}, [conversations]);

	// 项目下的 sessions（按项目分组，活跃排序）
	const conversationsByProject = useMemo(() => {
		const map = new Map<string, ConversationSummary[]>();
		for (const c of conversations) {
			if (c.session?.flags?.archived) continue;
			const projectId = getProjectIdFromConversation(c);
			if (!projectId) continue;
			const list = map.get(projectId) ?? [];
			list.push(c);
			map.set(projectId, list);
		}
		for (const [k, list] of map) {
			map.set(
				k,
				[...list].sort((a, b) => {
					const ap = a.session?.flags?.pinned ? 1 : 0;
					const bp = b.session?.flags?.pinned ? 1 : 0;
					if (ap !== bp) return bp - ap;
					return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
				}),
			);
		}
		return map;
	}, [conversations]);

	// plan §23.2 — inline rename state for Recents rows.
	const [renamingConversationId, setRenamingConversationId] = useState<
		string | null
	>(null);

	// E-2/E-3 trailing: project settings modal trigger for ClaudeSidebar.
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

	// 项目展开状态（默认当前项目展开）
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => {
		const set = new Set<string>();
		if (currentWorkspaceId) set.add(currentWorkspaceId);
		return set;
	});
	const toggleProjectExpand = useCallback((id: string) => {
		setExpandedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
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

	// 共享 reuse-or-create 入口；创建前自动展开目标项目分组让新会话立刻可见。
	const { openOrCreateConversation } = useNewConversation({
		onBeforeCreate: (targetProjectId) => {
			if (!targetProjectId) return;
			setExpandedProjects((prev) => {
				if (prev.has(targetProjectId)) return prev;
				const next = new Set(prev);
				next.add(targetProjectId);
				return next;
			});
		},
	});

	// 顶部"+ 新建任务"——目标省略，hook 内部从当前会话派生
	const handleNewConversation = useCallback(async () => {
		await openOrCreateConversation();
	}, [openOrCreateConversation]);

	// Recents 表头/空态 "+"——显式 target=null，强制创建无项目 Agent 任务。
	// 修复：在项目会话中点顶部"+ 新建任务"会派生为"项目内新建"，导致
	// Recents 永远填不进东西。这个入口绕过派生逻辑，直接落到无项目桶。
	const handleNewCasualConversation = useCallback(async () => {
		useProjectStore.getState().setCurrent(null);
		await openOrCreateConversation(null);
	}, [openOrCreateConversation]);

	// 项目行 hover "+"——目标 = 该项目
	const handleNewConversationInProject = useCallback(
		async (projectId: string) => {
			useProjectStore.getState().setCurrent(projectId);
			await openOrCreateConversation(projectId);
		},
		[openOrCreateConversation],
	);

	// 选择目录 → projects.add，开 sidebar 创建项目入口。
	const handleCreateProject = useCallback(async () => {
		try {
			const project = await useProjectStore.getState().pickAndAdd();
			if (project) {
				message.success(`项目已添加：${project.name}`);
				setProjectsOpen(true);
			}
		} catch (err) {
			log.error("Failed to create project", err instanceof Error ? err : new Error(String(err)));
			message.error("创建项目失败");
		}
	}, []);

	const handleSessionSearch = useCallback(() => {
		setSearchModalOpen(true);
	}, []);

	const handleMenuItemClick = useCallback(
		async (item: MenuItemConfig) => {
			if (item.id === "chat") {
				await handleNewConversation();
				return;
			}
			navigate(item.path);
		},
		[handleNewConversation, navigate],
	);

	const handleConversationClick = useCallback(
		async (conversationId: string) => {
			try {
				// 同步 currentProjectId，让 sidebar 项目高亮跟着 session 走
				const conv = useChatStore
					.getState()
					.conversations.find((c) => c.id === conversationId);
				useProjectStore
					.getState()
					.setCurrent(getProjectIdFromConversation(conv));
				await useChatStore.getState().switchConversation(conversationId);
			} catch (err) {
				log.error("Failed to switch conversation", err instanceof Error ? err : new Error(String(err)));
			}
			navigate("/chat");
		},
		[navigate],
	);

	const handleSettings = useCallback(() => {
		navigate("/settings");
	}, [navigate]);

	// Theme-aware colors
	const bg = token.colorBgLayout;
	const borderColor = token.colorBorderSecondary;
	const textColor = token.colorText;
	const mutedColor = token.colorTextSecondary;
	const hoverBg = token.colorFillTertiary;
	const chipBg = token.colorFillQuaternary;
	// Session 选中态 —— 参考 Claude.ai / ChatGPT / Linear：
	// 不做染色，仅在 hover 灰阶上再"沉降一档"（secondary 比 tertiary 略深），
	// 文字保持原色 + 字重 500，去掉左侧主色竖条。这样：
	//   - 不与项目行的主色竖条争视觉
	//   - 列表整体保持单一中性色，更像专业 IDE / Notion 风格
	//   - hover→active 是顺滑的灰阶加深，而不是颜色跳变
	const activeBg = token.colorFillSecondary;
	const activeText = token.colorText;
	const primaryBg = token.colorPrimary;

	// 折叠模式已移除（仅保留侧边拖拽）。
	return (
		<>
			<aside
				className="h-full flex-none flex flex-col"
				style={{
					width,
					position: "relative",
					background: bg,
					borderRight: `1px solid ${borderColor}`,
				}}
				data-testid="claude-sidebar"
			>
				<TrafficLightSpacer mac={mac} />

				{/* Quick actions */}
				<div
					className="p-2 pb-2 flex flex-col gap-0.5 flex-none"
					data-testid="quick-actions"
				>
					{quickMenuItems.map((item) => (
						<QuickActionRow
							key={item.id}
							icon={renderMenuIcon(item)}
							label={
								item.id === "chat" ? "新建任务" : t(item.label, { ns: "menu" })
							}
							shortcut={item.id === "chat" ? newChatShortcut : undefined}
							onClick={() => {
								void handleMenuItemClick(item);
							}}
							hoverBg={hoverBg}
							textColor={textColor}
							mutedColor={mutedColor}
							chipBg={chipBg}
						/>
					))}
					<QuickActionRow
						icon={<SearchOutlined />}
						label="会话搜索"
						shortcut={globalSearchShortcut}
						onClick={handleSessionSearch}
						hoverBg={hoverBg}
						textColor={textColor}
						mutedColor={mutedColor}
						chipBg={chipBg}
					/>
				</div>

				{/* Subtle divider between quick actions and sections */}
				{(chatMenuEnabled || projectsMenuEnabled) && (
					<div
						className="mx-3 my-1 flex-none"
						style={{
							height: 1,
							background: token.colorBorderSecondary,
							opacity: 0.5,
						}}
					/>
				)}

				{/* Scrollable section list */}
				<div
					className="flex-1 overflow-y-auto px-2 pb-2 pt-2"
					data-testid="sidebar-sections"
				>
					{/* Recents */}
					{chatMenuEnabled && (
						<div>
							<SectionHeader
								title="最近任务"
								expanded={recentsOpen}
								onToggle={() => setRecentsOpen((v) => !v)}
								mutedColor={mutedColor}
								hoverBg={hoverBg}
								action={{
									icon: <PlusOutlined className="text-[10px]" />,
									onClick: handleNewCasualConversation,
									tooltip: "新建无项目任务",
								}}
							/>
							{recentsOpen && (
								<div className="mt-1 flex flex-col gap-0.5">
									{recentConversations.length === 0 ? (
										<button
											type="button"
											onClick={handleNewCasualConversation}
											className="mx-1 px-2 py-2 flex items-center gap-2 rounded-md text-xs transition-colors"
											style={{ color: mutedColor }}
											onMouseEnter={(e) => {
												e.currentTarget.style.background = hoverBg;
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.background = "transparent";
											}}
										>
											<PlusOutlined />
											<span>新建无项目任务</span>
										</button>
									) : (
										recentConversations.map((conv) => (
											<RecentConversationRow
												key={conv.id}
												conv={conv}
												active={conv.id === currentConversationId}
												renaming={renamingConversationId === conv.id}
												textColor={textColor}
												mutedColor={mutedColor}
												hoverBg={hoverBg}
												activeBg={activeBg}
												activeText={activeText}
												primaryBg={primaryBg}
												onClick={() => handleConversationClick(conv.id)}
												onRenameStart={handleRenameStart}
												onRenameCommit={handleRenameCommit}
												onRenameCancel={handleRenameCancel}
											/>
										))
									)}
								</div>
							)}
						</div>
					)}

					{/* Projects */}
					{projectsMenuEnabled && (
						<div className={chatMenuEnabled ? "mt-4" : ""}>
							<SectionHeader
								title="项目"
								expanded={projectsOpen}
								onToggle={() => setProjectsOpen((v) => !v)}
								mutedColor={mutedColor}
								hoverBg={hoverBg}
								action={{
									icon: <PlusOutlined className="text-[10px]" />,
									onClick: handleCreateProject,
									tooltip: "新建项目",
								}}
							/>
							{projectsOpen && (
								<div className="mt-1 flex flex-col">
									{sortedWorkspaces.length === 0 ? (
										<button
											type="button"
											onClick={handleCreateProject}
											className="mx-1 px-2 py-2 flex items-center gap-2 rounded-md text-xs transition-colors"
											style={{ color: mutedColor }}
											onMouseEnter={(e) => {
												e.currentTarget.style.background = hoverBg;
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.background = "transparent";
											}}
										>
											<FolderAddOutlined />
											<span>添加目录作为项目</span>
										</button>
									) : (
										sortedWorkspaces.map((ws) => {
											const active = ws.id === currentWorkspaceId;
											const expanded = expandedProjects.has(ws.id);
											const projectConvs =
												conversationsByProject.get(ws.id) ?? [];
											return (
												<div key={ws.id} className="flex flex-col">
													<ProjectContextMenu
														project={ws}
														onRename={(p) => setRenamingProjectId(p.id)}
													>
														<ProjectRow
															id={ws.id}
															name={ws.name}
															active={active}
															expanded={expanded}
															count={projectConvs.length}
															textColor={textColor}
															mutedColor={mutedColor}
															hoverBg={hoverBg}
															primaryBg={primaryBg}
															onClick={() => toggleProjectExpand(ws.id)}
															onAdd={() =>
																handleNewConversationInProject(ws.id)
															}
															onSettings={() => setSettingsProjectId(ws.id)}
															renaming={renamingProjectId === ws.id}
															onRenameCommit={handleProjectRenameCommit}
															onRenameCancel={handleProjectRenameCancel}
														/>
													</ProjectContextMenu>
													{expanded && (
														<div className="ml-5 mt-px mb-1 flex flex-col gap-0.5">
															{projectConvs.length === 0 ? (
																<div
																	className="px-3 py-1.5 text-xs italic"
																	style={{ color: mutedColor }}
																>
																	暂无对话
																</div>
															) : (
																projectConvs.map((conv) => (
																	<RecentConversationRow
																		key={conv.id}
																		conv={conv}
																		active={conv.id === currentConversationId}
																		renaming={
																			renamingConversationId === conv.id
																		}
																		textColor={textColor}
																		mutedColor={mutedColor}
																		hoverBg={hoverBg}
																		activeBg={activeBg}
																		activeText={activeText}
																		primaryBg={primaryBg}
																		onClick={() =>
																			handleConversationClick(conv.id)
																		}
																		onRenameStart={handleRenameStart}
																		onRenameCommit={handleRenameCommit}
																		onRenameCancel={handleRenameCancel}
																	/>
																))
															)}
														</div>
													)}
												</div>
											);
										})
									)}
								</div>
							)}
						</div>
					)}
				</div>

				{/* Bottom user row — shared with SettingsRail so profile
				    presentation stays consistent across sidebars. */}
				<SidebarUserRow onOpenSettings={handleSettings} />

				<SidebarResizeHandle currentWidth={width} onWidthChange={setWidth} />

				<ProjectSettingsModal
					projectId={settingsProjectId}
					open={settingsProjectId !== null}
					onClose={() => setSettingsProjectId(null)}
				/>
			</aside>
			<GlobalSessionSearchModal
				open={searchModalOpen}
				onClose={() => setSearchModalOpen(false)}
			/>
		</>
	);
}

interface ProjectRowProps {
	id: string;
	name: string;
	active: boolean;
	expanded: boolean;
	count: number;
	textColor: string;
	mutedColor: string;
	hoverBg: string;
	primaryBg: string;
	onClick: () => void;
	onAdd: () => void;
	onSettings: () => void;
	/** F-7 inline rename：renaming===true 时该行渲染为 Input */
	renaming?: boolean;
	onRenameCommit?: (id: string, newName: string) => void;
	onRenameCancel?: () => void;
}

/**
 * Active 态视觉区分于 session 选中：
 * - session 选中 = 整行 activeBg 实心填充
 * - project 当前 = 左侧 2px 主色竖条 + 项目名加粗着色，行背景透明
 *   （仅表示"当前所在项目"，不抢 session 选中视觉）
 */
const ProjectRow: React.FC<ProjectRowProps> = ({
	id,
	name,
	active,
	expanded,
	count,
	textColor,
	mutedColor,
	hoverBg,
	primaryBg,
	onClick,
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
				className="w-full h-8 pl-3 pr-3 flex items-center gap-2"
				style={{ color: textColor }}
			>
				<span className="w-3 flex items-center justify-center" />
				<FolderOutlined className="text-[13px]" style={{ color: mutedColor }} />
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
			className="group relative w-full h-8 pl-3 pr-3 flex items-center gap-2 rounded-md text-[13px] transition-colors cursor-pointer"
			style={{
				background: "transparent",
				color: textColor,
				fontWeight: active ? 500 : 400,
			}}
			onClick={onClick}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = hoverBg;
				setHovered(true);
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "transparent";
				setHovered(false);
			}}
		>
			{active && (
				<span
					className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r"
					style={{ background: primaryBg, opacity: 0.7 }}
				/>
			)}
			<span
				className="w-3 flex items-center justify-center transition-transform"
				style={{
					color: mutedColor,
					transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
				}}
			>
				<DownOutlined className="text-[9px]" />
			</span>
			<FolderOutlined className="text-[13px]" style={{ color: mutedColor }} />
			<span className="flex-1 text-left truncate">{name}</span>
			{hovered ? (
				<div className="flex items-center gap-1">
					<Tooltip title="项目设置" placement="top">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onSettings();
							}}
							className="w-5 h-5 flex items-center justify-center rounded transition-colors"
							style={{ color: mutedColor }}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "rgba(0,0,0,0.06)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
							aria-label="项目设置"
						>
							<SettingOutlined className="text-[11px]" />
						</button>
					</Tooltip>
					<Tooltip title="在此项目下新建任务" placement="top">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onAdd();
							}}
							className="w-5 h-5 flex items-center justify-center rounded transition-colors"
							style={{ color: mutedColor }}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "rgba(0,0,0,0.06)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
							aria-label="在此项目下新建任务"
						>
							<PlusOutlined className="text-[11px]" />
						</button>
					</Tooltip>
				</div>
			) : (
				count > 0 && (
					<span
						className="text-[10px] tabular-nums"
						style={{ color: mutedColor }}
					>
						{count > 99 ? "99+" : count}
					</span>
				)
			)}
		</div>
	);
};

interface RecentConversationRowProps {
	conv: ConversationSummary;
	active: boolean;
	renaming: boolean;
	textColor: string;
	mutedColor: string;
	hoverBg: string;
	activeBg: string;
	activeText: string;
	primaryBg: string;
	onClick: () => void;
	onRenameStart: (conv: ConversationSummary) => void;
	onRenameCommit: (id: string, value: string) => void;
	onRenameCancel: () => void;
}

const RecentConversationRow: React.FC<RecentConversationRowProps> = ({
	conv,
	active,
	renaming,
	textColor,
	mutedColor,
	hoverBg,
	activeBg,
	activeText,
	primaryBg,
	onClick,
	onRenameStart,
	onRenameCommit,
	onRenameCancel,
}) => {
	const inputRef = useRef<InputRef>(null);
	const pinned = !!conv.session?.flags?.pinned;
	const unread = !!conv.session?.flags?.unread;
	if (renaming) {
		return (
			<div className="w-full h-8 px-3 flex items-center">
				<Input
					ref={inputRef}
					autoFocus
					size="small"
					defaultValue={conv.name || "未命名对话"}
					onPressEnter={(e) =>
						onRenameCommit(conv.id, (e.target as HTMLInputElement).value)
					}
					onBlur={(e) => onRenameCommit(conv.id, e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.stopPropagation();
							onRenameCancel();
						}
					}}
				/>
			</div>
		);
	}
	return (
		<SessionContextMenu conversation={conv} onRename={onRenameStart}>
			<button
				type="button"
				onClick={onClick}
				className="relative w-full h-8 pl-3 pr-2 flex items-center gap-2 rounded-md text-[13px] transition-all duration-150"
				style={{
					background: active ? activeBg : "transparent",
					color: active ? activeText : textColor,
					fontWeight: active ? 500 : 400,
				}}
				onMouseEnter={(e) => {
					if (!active) e.currentTarget.style.background = hoverBg;
				}}
				onMouseLeave={(e) => {
					if (!active) e.currentTarget.style.background = "transparent";
				}}
			>
				{pinned && (
					<span
						aria-label="pinned"
						className="flex-none"
						style={{ color: mutedColor, fontSize: 10 }}
					>
						★
					</span>
				)}
				<span className="flex-1 text-left truncate">
					{conv.name || "未命名对话"}
				</span>
				{unread && (
					<span
						aria-label="unread"
						className="flex-none rounded-full"
						style={{ width: 6, height: 6, background: primaryBg }}
					/>
				)}
				<span
					className="text-[10.5px] flex-none opacity-70"
					style={{ color: mutedColor }}
				>
					{formatRelativeTime(conv.updatedAt)}
				</span>
			</button>
		</SessionContextMenu>
	);
};
