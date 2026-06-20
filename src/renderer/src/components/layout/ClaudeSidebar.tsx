import {
	AppstoreAddOutlined,
	ClusterOutlined,
	DownOutlined,
	FolderAddOutlined,
	FolderOutlined,
	PlusOutlined,
	ReadOutlined,
	SearchOutlined,
	SettingOutlined,
	UpOutlined,
} from "@ant-design/icons";
import { Input, type InputRef, Tooltip, message, theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chatStore";
import { useNewConversation } from "../../hooks/useNewConversation";
import type { ConversationSummary } from "../../types/electron";
import { SessionContextMenu } from "./SessionContextMenu";
import { GlobalSessionSearchModal } from "../chat/GlobalSessionSearchModal";
import { useSidebarLayoutStore } from "../../stores/sidebarLayoutStore";
import {
	getAvatarColor,
	getUserInitials,
	useUserStore,
} from "../../stores/userStore";
import { useProjectStore, useSortedProjects } from "../../stores/projectStore";
import { ProjectSettingsModal } from "../project/ProjectSettingsModal";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

const { useToken } = theme;

type ChatMode = "chat" | "cowork" | "code";

const MODE_ORDER: ChatMode[] = ["chat", "cowork", "code"];
const MODE_LABELS: Record<ChatMode, string> = {
	chat: "Chat",
	cowork: "Cowork",
	code: "Code",
};

function isMac(): boolean {
	if (typeof navigator === "undefined") return false;
	return navigator.platform.toLowerCase().includes("mac");
}

function modKey(): string {
	return isMac() ? "⌘" : "Ctrl";
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
		className="w-full h-9 px-3 flex items-center gap-3 rounded-md transition-colors text-sm"
		style={{ color: textColor }}
		onMouseEnter={(e) => {
			e.currentTarget.style.background = hoverBg;
		}}
		onMouseLeave={(e) => {
			e.currentTarget.style.background = "transparent";
		}}
	>
		<span className="w-4 flex items-center justify-center">{icon}</span>
		<span className="flex-1 text-left truncate">{label}</span>
		{shortcut && (
			<span
				className="text-[11px] font-mono px-1.5 py-0.5 rounded"
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
		className="w-full h-7 px-3 flex items-center justify-between rounded-md transition-colors group"
		style={{ color: mutedColor }}
		onMouseEnter={(e) => {
			e.currentTarget.style.background = hoverBg;
		}}
		onMouseLeave={(e) => {
			e.currentTarget.style.background = "transparent";
		}}
	>
		<button
			type="button"
			onClick={onToggle}
			className="flex-1 h-full flex items-center text-left"
			style={{ background: "transparent", color: "inherit" }}
		>
			<span className="text-[13px] tracking-wide font-medium">
				{title}
			</span>
		</button>
		<div className="flex items-center gap-1">
			{action && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						action.onClick();
					}}
					title={action.tooltip}
					className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded transition-opacity"
					style={{ color: "inherit" }}
				>
					{action.icon}
				</button>
			)}
			{expanded ? (
				<UpOutlined className="text-[10px]" />
			) : (
				<DownOutlined className="text-[10px]" />
			)}
		</div>
	</div>
);

export function ClaudeSidebar(_props: ClaudeSidebarProps): React.ReactElement {
	const navigate = useNavigate();
	const { token } = useToken();

	// 折叠按钮 + collapsed 状态已彻底移除（R-8）。
	const width = useSidebarLayoutStore((s) => s.width);
	const setWidth = useSidebarLayoutStore((s) => s.setWidth);

	const conversations = useChatStore((s) => s.conversations);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	// D-3: 切到 useProjectStore（替代旧 workspaceConfigStore）
	const sortedWorkspaces = useSortedProjects();
	const currentWorkspaceId = useProjectStore((s) => s.currentProjectId);
	const { user } = useUserStore();

	const mac = useMemo(() => isMac(), []);

	const [mode, setMode] = useState<ChatMode>("chat");
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

	// plan §23.4 — Recents = casual sessions only (projectId === null →
	// workspaceId === "default" 经 metaToConversation 适配). 项目对话归属在
	// PROJECTS 区，不进 Recents，避免一条会话出现两次。
	const recentConversations = useMemo(() => {
		return [...conversations]
			.filter(
				(c) =>
					!c.session?.flags?.archived &&
					(!c.workspaceId || c.workspaceId === "default"),
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
			if (!c.workspaceId || c.workspaceId === "default") continue;
			const list = map.get(c.workspaceId) ?? [];
			list.push(c);
			map.set(c.workspaceId, list);
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

	// 顶部"+ 新建对话"——目标省略，hook 内部从当前会话派生
	const handleNewConversation = useCallback(async () => {
		await openOrCreateConversation();
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
			console.error("Failed to create project:", err);
			message.error("创建项目失败");
		}
	}, []);

	const handleLibrary = useCallback(() => {
		navigate("/bookmarks");
	}, [navigate]);

	const handleImBot = useCallback(() => {
		navigate("/imbot");
	}, [navigate]);

	const handleExtensions = useCallback(() => {
		navigate("/extensions");
	}, [navigate]);

	const handleSessionSearch = useCallback(() => {
		setSearchModalOpen(true);
	}, []);

	const handleConversationClick = useCallback(
		async (conversationId: string) => {
			try {
				// 同步 currentProjectId，让 sidebar 项目高亮跟着 session 走
				const conv = useChatStore
					.getState()
					.conversations.find((c) => c.id === conversationId);
				const projectId =
					conv?.workspaceId && conv.workspaceId !== "default"
						? conv.workspaceId
						: null;
				useProjectStore.getState().setCurrent(projectId);
				await useChatStore.getState().switchConversation(conversationId);
			} catch (err) {
				console.error("Failed to switch conversation:", err);
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
	// Session 选中态：使用次级填充（柔和、不抢眼），文字保持正常色 + 轻微加粗。
	// 项目 active 用左侧主色竖条，不与之冲突。
	const activeBg = token.colorFillSecondary;
	const activeText = token.colorText;
	const primaryBg = token.colorPrimary;

	const initials = user?.name ? getUserInitials(user.name) : "C";
	const avatarColor = user?.name
		? getAvatarColor(user.name)
		: "bg-linear-to-br from-blue-500 via-purple-500 to-pink-500";

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

			{/* Brand row — collapse button removed; 通过侧边拖拽手柄调整宽度 */}
			<div className="h-10 px-3 flex items-center flex-none">
				<div className="flex items-center gap-2 min-w-0">
					<div
						className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[11px] font-bold flex-none"
						style={{ background: primaryBg }}
					>
						C
					</div>
					<span
						className="text-sm font-semibold truncate"
						style={{ color: textColor }}
					>
						Claude
					</span>
				</div>
			</div>

			{/* Mode tabs */}
			<div className="px-3 pt-1 pb-2 flex-none">
				<div
					className="flex items-center gap-1 p-0.5 rounded-lg"
					style={{ background: chipBg }}
					data-testid="mode-tabs"
				>
					{MODE_ORDER.map((m) => {
						const active = mode === m;
						return (
							<button
								key={m}
								type="button"
								onClick={() => setMode(m)}
								className="flex-1 h-7 rounded-md text-xs font-medium transition-colors"
								style={{
									background: active ? token.colorBgContainer : "transparent",
									color: active ? primaryBg : mutedColor,
									boxShadow: active
										? `0 1px 2px ${token.colorBorderSecondary}`
										: "none",
								}}
								data-testid={`mode-tab-${m}`}
							>
								{MODE_LABELS[m]}
							</button>
						);
					})}
				</div>
			</div>

			{/* Quick actions */}
			<div
				className="px-2 pb-2 flex flex-col gap-0.5 flex-none"
				data-testid="quick-actions"
			>
				<QuickActionRow
					icon={<PlusOutlined />}
					label="新建对话"
					shortcut={`${modKey()}N`}
					onClick={handleNewConversation}
					hoverBg={hoverBg}
					textColor={textColor}
					mutedColor={mutedColor}
					chipBg={chipBg}
				/>
				<QuickActionRow
					icon={<ReadOutlined />}
					label="库"
					onClick={handleLibrary}
					hoverBg={hoverBg}
					textColor={textColor}
					mutedColor={mutedColor}
					chipBg={chipBg}
				/>
				<QuickActionRow
					icon={<SearchOutlined />}
					label="会话搜索"
					shortcut={`${modKey()}P`}
					onClick={handleSessionSearch}
					hoverBg={hoverBg}
					textColor={textColor}
					mutedColor={mutedColor}
					chipBg={chipBg}
				/>
				<QuickActionRow
					icon={<ClusterOutlined />}
					label="IM 机器人"
					onClick={handleImBot}
					hoverBg={hoverBg}
					textColor={textColor}
					mutedColor={mutedColor}
					chipBg={chipBg}
				/>
				<QuickActionRow
					icon={<AppstoreAddOutlined />}
					label="扩展"
					onClick={handleExtensions}
					hoverBg={hoverBg}
					textColor={textColor}
					mutedColor={mutedColor}
					chipBg={chipBg}
				/>
			</div>

			{/* Scrollable section list */}
			<div
				className="flex-1 overflow-y-auto px-2 pb-2"
				data-testid="sidebar-sections"
			>
				{/* Recents */}
				<div className="mt-2">
					<SectionHeader
						title="最近对话"
						expanded={recentsOpen}
						onToggle={() => setRecentsOpen((v) => !v)}
						mutedColor={mutedColor}
						hoverBg={hoverBg}
					/>
					{recentsOpen && (
						<div className="mt-1 flex flex-col">
							{recentConversations.length === 0 ? (
								<div
									className="px-3 py-2 text-xs"
									style={{ color: mutedColor }}
								>
									暂无对话
								</div>
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

				{/* Projects */}
				<div className="mt-3">
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
											<ProjectRow
												name={ws.name}
												active={active}
												expanded={expanded}
												count={projectConvs.length}
												textColor={textColor}
												mutedColor={mutedColor}
												hoverBg={hoverBg}
												primaryBg={primaryBg}
												onClick={() => toggleProjectExpand(ws.id)}
												onAdd={() => handleNewConversationInProject(ws.id)}
												onSettings={() => setSettingsProjectId(ws.id)}
											/>
											{expanded && (
												<div className="ml-5 mt-px mb-1 flex flex-col">
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
																active={
																	conv.id === currentConversationId
																}
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

			</div>

			{/* Bottom user/settings */}
			<div
				className="h-12 px-3 flex items-center justify-between flex-none"
				data-testid="sidebar-user-row"
			>
				<div className="flex items-center gap-2 min-w-0">
					<div
						className={cn(
							"w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-none",
							avatarColor,
						)}
					>
						{initials}
					</div>
					<span
						className="text-sm truncate"
						style={{ color: textColor }}
					>
						{user?.name || "访客"}
					</span>
				</div>
				<Tooltip title="设置" mouseEnterDelay={0.3}>
					<button
						type="button"
						onClick={handleSettings}
						className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
						style={{ color: mutedColor }}
						data-testid="sidebar-settings"
						onMouseEnter={(e) => {
							e.currentTarget.style.background = hoverBg;
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
						}}
					>
						<SettingOutlined />
					</button>
				</Tooltip>
			</div>

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
}

/**
 * Active 态视觉区分于 session 选中：
 * - session 选中 = 整行 activeBg 实心填充
 * - project 当前 = 左侧 2px 主色竖条 + 项目名加粗着色，行背景透明
 *   （仅表示"当前所在项目"，不抢 session 选中视觉）
 */
const ProjectRow: React.FC<ProjectRowProps> = ({
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
}) => {
	const [hovered, setHovered] = useState(false);
	return (
		<div
			className="group relative w-full h-8 pl-3 pr-3 flex items-center gap-2 rounded-md text-sm transition-colors cursor-pointer"
			style={{
				background: "transparent",
				color: textColor,
				fontWeight: active ? 600 : 400,
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
					className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
					style={{ background: primaryBg }}
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
			<FolderOutlined
				style={{ color: active ? primaryBg : mutedColor }}
			/>
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
					<Tooltip title="在此项目下新建对话" placement="top">
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
							aria-label="在此项目下新建对话"
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
				className="w-full h-8 px-3 flex items-center gap-2 rounded-md text-sm transition-colors"
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
					className="text-[11px] flex-none"
					style={{ color: mutedColor }}
				>
					{formatRelativeTime(conv.updatedAt)}
				</span>
			</button>
		</SessionContextMenu>
	);
};
