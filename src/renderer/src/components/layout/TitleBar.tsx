import {
	CloseOutlined,
	FullscreenExitOutlined,
	FullscreenOutlined,
	MinusOutlined,
	MoreOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import { App, Dropdown, Input, Modal, Tooltip, theme } from "antd";
import type { InputRef, MenuProps } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useMatches } from "react-router-dom";
import { type TitleContent, useTitleContext } from "../../hooks/useTitle";
import { useChatStore } from "../../stores/chatStore";
import { useInspectorPanelStore } from "../../stores/inspectorPanelStore";
import { useTerminalPanelStore } from "../../stores/terminalPanelStore";
import { BranchPill } from "./BranchPill";
import { CurrentModelIndicator } from "./CurrentModelIndicator";
import { IdeAppSwitcher } from "./IdeAppSwitcher";
import { ProjectPill } from "./ProjectPill";

/**
 * `>_` terminal glyph drawn inline so it matches the reference screenshot more
 * accurately than @ant-design/icons CodeOutlined (which is `</>`).
 */
const TerminalGlyph: React.FC<{ size?: number }> = ({ size = 16 }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<rect x="1.5" y="2.5" width="13" height="11" rx="2" />
		<path d="M4.5 6L7 8L4.5 10" />
		<path d="M8 10.5H11.5" />
	</svg>
);

/**
 * 右侧面板 glyph —— 视觉上是个矩形 + 右侧填充的窄列，
 * 与 VS Code "Toggle Secondary Side Bar" 同款语义，用于环境检视面板开关。
 */
const InspectorPanelGlyph: React.FC<{ size?: number; active?: boolean }> = ({
	size = 16,
	active = false,
}) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<rect x="1.5" y="2.5" width="13" height="11" rx="2" />
		<line x1="10.5" y1="2.5" x2="10.5" y2="13.5" />
		{active && (
			<rect
				x="10.5"
				y="2.5"
				width="4"
				height="11"
				fill="currentColor"
				stroke="none"
				opacity="0.18"
			/>
		)}
	</svg>
);

const { useToken } = theme;

const NO_DRAG: React.CSSProperties = {
	// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
	WebkitAppRegion: "no-drag",
};

export const TitleBar: React.FC = () => {
	const { t } = useTranslation();
	const location = useLocation();
	const [isMaximized, setIsMaximized] = React.useState(false);
	const [isMac, setIsMac] = React.useState(false);
	const matches = useMatches();
	const { title: dynamicTitle } = useTitleContext();
	const { token } = useToken();

	const isChatRoute = location.pathname.startsWith("/chat");
	// Settings shell owns its own left rail; no page title is published to
	// the TitleBar left cluster so the header stays clean.
	const isSettingsRoute = location.pathname.startsWith("/settings");

	const conversations = useChatStore((s) => s.conversations);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	const currentConversation = React.useMemo(
		() => conversations.find((c) => c.id === currentConversationId),
		[conversations, currentConversationId],
	);
	const taskName = currentConversation?.name || "新建任务";
	const currentConversationWorkspaceId = currentConversation?.workspaceId;

	// 路由标题用于非 Chat 页面
	const routeTitle: TitleContent = React.useMemo(() => {
		const lastMatch = matches[matches.length - 1];
		if (lastMatch?.handle && typeof lastMatch.handle === "object") {
			return (lastMatch.handle as { title?: TitleContent }).title;
		}
		return undefined;
	}, [matches]);

	const displayTitle =
		dynamicTitle || routeTitle || t("name", "Super Client", { ns: "app" });
	const isReactElement = React.isValidElement(displayTitle);

	React.useEffect(() => {
		setIsMac(navigator.platform.toLowerCase().includes("mac"));
		window.electron.window.isMaximized().then((response) => {
			if (response.success && response.data !== undefined) {
				setIsMaximized(response.data);
			}
		});
		const unsubscribe = window.electron.window.onMaximizeChange(
			(maximized: boolean) => setIsMaximized(maximized),
		);
		return unsubscribe;
	}, []);

	const handleMinimize = () => window.electron.window.minimize();
	const handleMaximize = () => window.electron.window.maximize();
	const handleClose = () => window.electron.window.close();

	const handleOpenSessionSettings = () => {
		window.dispatchEvent(new Event("chat:open-session-settings"));
	};

	const isTerminalOpen = useTerminalPanelStore((s) => s.isOpen);
	const toggleTerminal = useTerminalPanelStore((s) => s.toggle);
	const handleToggleTerminal = React.useCallback(() => {
		toggleTerminal();
	}, [toggleTerminal]);

	const isInspectorOpen = useInspectorPanelStore((s) => s.isOpen);
	const toggleInspector = useInspectorPanelStore((s) => s.toggle);
	const handleToggleInspector = React.useCallback(() => {
		toggleInspector();
	}, [toggleInspector]);

	// AntD context handle for message/modal that respects the App provider
	// (Modal.confirm imported directly bypasses theme tokens in some setups).
	const { message: messageApi, modal: modalApi } = App.useApp();

	// ─── More menu: rename / switch-branch / export / delete ─────────────
	// Rename dialog state. Inline so the input lives within the title bar and
	// pre-fills with the current conversation name.
	const [renameOpen, setRenameOpen] = React.useState(false);
	const [renameValue, setRenameValue] = React.useState("");
	const [renameSubmitting, setRenameSubmitting] = React.useState(false);
	const renameInputRef = React.useRef<InputRef | null>(null);
	const openRename = React.useCallback(() => {
		if (!currentConversation) return;
		setRenameValue(currentConversation.name || "");
		setRenameOpen(true);
		// Focus + select-all after the modal mounts.
		setTimeout(() => {
			renameInputRef.current?.focus({ cursor: "all" });
		}, 50);
	}, [currentConversation]);
	const commitRename = React.useCallback(async () => {
		if (!currentConversationId) return;
		const trimmed = renameValue.trim();
		if (!trimmed) {
			messageApi.warning(t("rename.empty", "名称不能为空", { ns: "chat" }));
			return;
		}
		setRenameSubmitting(true);
		try {
			await useChatStore
				.getState()
				.renameConversation(currentConversationId, trimmed);
			setRenameOpen(false);
		} catch (err) {
			messageApi.error(
				err instanceof Error
					? err.message
					: t("rename.failed", "重命名失败", { ns: "chat" }),
			);
		} finally {
			setRenameSubmitting(false);
		}
	}, [currentConversationId, renameValue, messageApi, t]);

	const handleExport = React.useCallback(() => {
		window.dispatchEvent(new Event("chat:open-export"));
	}, []);

	const handleDelete = React.useCallback(() => {
		if (!currentConversation) return;
		const id = currentConversation.id;
		const name = currentConversation.name || "未命名对话";
		const hasRemote = !!currentConversation.remote;
		const baseLine = `确定删除 "${name}" 吗？此操作不可撤销。`;
		const remoteLine = hasRemote
			? "此会话已绑定 IM bot，删除会同时解绑。"
			: null;
		modalApi.confirm({
			title: "删除对话",
			content: remoteLine ? (
				<div className="flex flex-col gap-1">
					<div>{baseLine}</div>
					<div style={{ color: token.colorWarning, fontSize: 13 }}>
						{remoteLine}
					</div>
				</div>
			) : (
				baseLine
			),
			okText: "删除",
			okButtonProps: { danger: true },
			cancelText: "取消",
			onOk: async () => {
				try {
					await useChatStore.getState().deleteConversation(id);
					messageApi.success("已删除");
				} catch (err) {
					messageApi.error(err instanceof Error ? err.message : "删除失败");
				}
			},
		});
	}, [currentConversation, messageApi, modalApi, token.colorWarning]);

	// 注：切换工作区/新建任务/切换分支已从此菜单移除——
	//   - 切换工作区：Project = cwd 的新模型里 conversation 的 projectId 在第一条
	//     消息后锁定（plan §9.10 C1），不再支持运行时切；改项目要走"派生 fork"。
	//   - 新建任务：sidebar 顶部 + 与项目行 + 已经是统一入口，且已是
	//     reuse-or-create 流；这里再放一份会跟 reuse 行为冲突。
	//   - 切换分支：拆成 TitleBar 左侧的 BranchPill 独立胶囊按钮（带搜索、当前
	//     分支 dirty 计数、创建分支、Git 图谱占位）。
	const moreMenuItems: MenuProps["items"] = [
		{
			key: "rename",
			label: "重命名会话",
			onClick: openRename,
		},
		{ type: "divider" },
		{
			key: "export",
			label: "导出会话",
			onClick: handleExport,
		},
		{
			key: "delete",
			label: "删除会话",
			danger: true,
			onClick: handleDelete,
		},
	];

	const leftCluster = (
		<div
			className="flex items-center gap-2 min-w-0"
			style={{ color: token.colorTextSecondary, ...NO_DRAG }}
		>
			{/* Task / conversation name */}
			<span
				className="font-medium text-sm truncate max-w-[240px]"
				style={{ color: token.colorText, marginRight: 2 }}
				title={taskName}
			>
				{taskName}
			</span>
			{/* Project pill —— 仅项目会话渲染，内部 null 化 */}
			<ProjectPill conversationId={currentConversationId} />
			{/* Branch pill — 项目会话才会渲染（内部判定），非项目会话返回 null */}
			<BranchPill conversationId={currentConversationId} />
			{/* More */}
			<Dropdown
				menu={{ items: moreMenuItems }}
				trigger={["click"]}
				placement="bottomLeft"
			>
				<button
					type="button"
					className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:opacity-80"
					style={{ color: token.colorTextSecondary }}
					aria-label="更多"
				>
					<MoreOutlined style={{ fontSize: 16 }} />
				</button>
			</Dropdown>
		</div>
	);

	return (
		<div
			className="h-auto py-2 flex items-center justify-between select-none"
			// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
			style={{ WebkitAppRegion: "drag", background: token.colorBgContainer }}
		>
			{/* 左侧 */}
			<div className="flex items-center gap-2 px-4 flex-1 min-w-0">
				{isSettingsRoute ? null : isChatRoute ? (
					currentConversation ? (
						leftCluster
					) : null
				) : isReactElement ? (
					(displayTitle as React.ReactNode)
				) : (
					<span
						className="text-sm font-medium"
						style={{ color: token.colorText }}
					>
						{displayTitle as string}
					</span>
				)}
			</div>

			{/* 右侧：IDE 应用切换 + 会话设置 + 窗口控制
			    模型切换不在 TitleBar — 通过 ComposerStatusBar / Cmd+M / 大 composer 中切换。
			    非 Chat / 非 Settings 页仅展示只读的当前模型指示位。 */}
			<div className="flex items-center gap-1 pr-1" style={NO_DRAG}>
				{!isChatRoute && !isSettingsRoute && <CurrentModelIndicator />}

				{isChatRoute && currentConversation && (
					<IdeAppSwitcher
						conversationId={currentConversationId ?? undefined}
						workspaceId={currentConversationWorkspaceId}
					/>
				)}

				{isChatRoute && currentConversation && (
					<Tooltip title={t("terminal.toggle", "终端")} placement="bottomRight">
						<button
							type="button"
							onClick={handleToggleTerminal}
							className="flex items-center justify-center rounded transition-colors hover:opacity-80"
							style={{
								width: 28,
								height: 28,
								color: isTerminalOpen
									? token.colorPrimary
									: token.colorTextSecondary,
								background: isTerminalOpen
									? token.colorBgTextHover
									: "transparent",
							}}
							aria-label={t("terminal.toggle", "终端")}
							aria-pressed={isTerminalOpen}
						>
							<TerminalGlyph />
						</button>
					</Tooltip>
				)}

				{isChatRoute && currentConversation && (
					<Tooltip
						title={t("inspector.toggle", "环境检视", { ns: "chat" })}
						placement="bottomRight"
					>
						<button
							type="button"
							onClick={handleToggleInspector}
							className="flex items-center justify-center rounded transition-colors hover:opacity-80"
							style={{
								width: 28,
								height: 28,
								color: isInspectorOpen
									? token.colorPrimary
									: token.colorTextSecondary,
								background: isInspectorOpen
									? token.colorBgTextHover
									: "transparent",
							}}
							aria-label={t("inspector.toggle", "环境检视", { ns: "chat" })}
							aria-pressed={isInspectorOpen}
						>
							<InspectorPanelGlyph active={isInspectorOpen} />
						</button>
					</Tooltip>
				)}

				{isChatRoute && currentConversation && (
					<Tooltip title="会话设置" placement="bottomRight">
						<button
							type="button"
							onClick={handleOpenSessionSettings}
							className="flex items-center justify-center rounded transition-colors hover:opacity-80"
							style={{
								width: 28,
								height: 28,
								color: token.colorTextSecondary,
							}}
							aria-label="会话设置"
						>
							<SettingOutlined style={{ fontSize: 16 }} />
						</button>
					</Tooltip>
				)}

				{!isMac && (
					<div className="flex items-center h-full ml-1">
						<Tooltip
							title={t("minimize", "最小化", { ns: "menu" })}
							placement="bottom"
						>
							<button
								type="button"
								onClick={handleMinimize}
								className="w-12 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
							>
								<MinusOutlined className="text-sm" />
							</button>
						</Tooltip>
						<Tooltip
							title={
								isMaximized
									? t("restore", "还原")
									: t("maximize", "最大化", { ns: "menu" })
							}
							placement="bottom"
						>
							<button
								type="button"
								onClick={handleMaximize}
								className="w-12 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
							>
								{isMaximized ? (
									<FullscreenExitOutlined className="text-sm" />
								) : (
									<FullscreenOutlined className="text-sm" />
								)}
							</button>
						</Tooltip>
						<Tooltip
							title={t("close", "关闭", { ns: "window" })}
							placement="bottom"
						>
							<button
								type="button"
								onClick={handleClose}
								className="w-12 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/80 transition-colors"
							>
								<CloseOutlined className="text-sm" />
							</button>
						</Tooltip>
					</div>
				)}
			</div>

			{/* Rename dialog */}
			<Modal
				title={t("rename.title", "重命名对话", { ns: "chat" })}
				open={renameOpen}
				onCancel={() => {
					if (!renameSubmitting) setRenameOpen(false);
				}}
				onOk={commitRename}
				okText={t("rename.confirm", "确定", { ns: "chat" })}
				cancelText={t("rename.cancel", "取消", { ns: "chat" })}
				confirmLoading={renameSubmitting}
				destroyOnHidden
			>
				<Input
					ref={renameInputRef}
					value={renameValue}
					onChange={(e) => setRenameValue(e.target.value)}
					onPressEnter={commitRename}
					maxLength={120}
					placeholder={t("rename.placeholder", "输入新名称", { ns: "chat" })}
				/>
			</Modal>
		</div>
	);
};
