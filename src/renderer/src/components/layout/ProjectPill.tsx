/**
 * ProjectPill —— 顶部标题栏里的「项目」胶囊按钮。
 *
 * 行为：
 *   - 仅在当前会话归属某个项目时显示（workspaceId/projectId 非 default 且能在
 *     useProjectStore 里查到）。casual 会话 → 返回 null。
 *   - 显示项目图标 + 项目名；title 上 tooltip 显示完整 cwd。
 *   - 左键点击弹出小 popover：「在 Finder 中显示 / 复制路径」。
 *
 * 设计取舍：
 *   - 不做"切换项目"——同一 conversation 的 projectId 在第一条消息后锁定
 *     （见 chatStore §9.10 C1），ProjectPill 只是个查看 + 系统侧操作入口。
 *   - 不做"在 IDE 中打开"——TitleBar 右侧已有专门的 IdeAppSwitcher，避免重复入口。
 */

import { CopyOutlined, DownOutlined, FolderOutlined } from "@ant-design/icons";
import { App, Popover, theme } from "antd";
import * as React from "react";

import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";

const { useToken } = theme;

interface ProjectPillProps {
	conversationId: string | null;
}

export const ProjectPill: React.FC<ProjectPillProps> = ({ conversationId }) => {
	const { token } = useToken();
	const { message: messageApi } = App.useApp();
	const [open, setOpen] = React.useState(false);

	// 从 chatStore 拿当前会话的 workspaceId，从 projectStore 解项目对象。
	// useProjectStore 是 mirror，需要确保已 load 一次。
	const conversations = useChatStore((s) => s.conversations);
	const projects = useProjectStore((s) => s.projects);
	const loadProjects = useProjectStore((s) => s.load);
	const loaded = useProjectStore((s) => s.loaded);

	React.useEffect(() => {
		if (!loaded) void loadProjects();
	}, [loaded, loadProjects]);

	const project = React.useMemo(() => {
		if (!conversationId) return null;
		const conv = conversations.find((c) => c.id === conversationId);
		const wsId = conv?.workspaceId;
		if (!wsId || wsId === "default") return null;
		return projects.find((p) => p.id === wsId) ?? null;
	}, [conversationId, conversations, projects]);

	const handleReveal = React.useCallback(async () => {
		if (!project) return;
		try {
			const res = await window.electron.fileAction.reveal(project.cwd);
			if (!res.success) {
				messageApi.error(res.error || "打开失败");
			}
		} catch (err) {
			messageApi.error(err instanceof Error ? err.message : String(err));
		}
		setOpen(false);
	}, [messageApi, project]);

	const handleCopy = React.useCallback(async () => {
		if (!project) return;
		try {
			const res = await window.electron.fileAction.copyPath(project.cwd);
			if (res.success) {
				messageApi.success("已复制路径");
			} else {
				messageApi.error(res.error || "复制失败");
			}
		} catch (err) {
			messageApi.error(err instanceof Error ? err.message : String(err));
		}
		setOpen(false);
	}, [messageApi, project]);

	if (!project) return null;

	const popoverContent = (
		<div
			style={{
				width: 240,
				margin: -12,
				padding: "8px 6px",
			}}
		>
			{/* 路径展示 */}
			<div
				style={{
					padding: "2px 10px 8px",
					borderBottom: `1px solid ${token.colorBorderSecondary}`,
					marginBottom: 4,
				}}
			>
				<div
					style={{
						fontSize: 11,
						color: token.colorTextTertiary,
						marginBottom: 3,
					}}
				>
					项目路径
				</div>
				<div
					style={{
						fontSize: 11,
						color: token.colorText,
						fontFamily:
							"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
						wordBreak: "break-all",
						lineHeight: 1.5,
					}}
				>
					{project.cwd}
				</div>
			</div>

			<ProjectActionRow
				icon={<FolderOutlined />}
				label="在 Finder 中显示"
				onClick={handleReveal}
				token={token}
			/>
			<ProjectActionRow
				icon={<CopyOutlined />}
				label="复制路径"
				onClick={handleCopy}
				token={token}
			/>
		</div>
	);

	return (
		<Popover
			content={popoverContent}
			trigger="click"
			open={open}
			onOpenChange={setOpen}
			placement="bottomLeft"
			arrow={false}
		>
			<button
				type="button"
				className="flex items-center gap-1.5 transition-colors"
				style={{
					height: 24,
					padding: "0 9px",
					borderRadius: 999,
					border: `1px solid ${token.colorBorderSecondary}`,
					background: open ? token.colorFillTertiary : "transparent",
					color: token.colorText,
					fontSize: 12,
					lineHeight: 1,
					cursor: "pointer",
					maxWidth: 200,
					fontWeight: 500,
				}}
				onMouseEnter={(e) => {
					if (!open) {
						e.currentTarget.style.background = token.colorFillQuaternary;
					}
				}}
				onMouseLeave={(e) => {
					if (!open) {
						e.currentTarget.style.background = "transparent";
					}
				}}
				title={project.cwd}
				aria-label={`项目 ${project.name}`}
			>
				<FolderOutlined style={{ fontSize: 12 }} />
				<span
					style={{
						maxWidth: 150,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{project.name}
				</span>
				<DownOutlined
					style={{
						fontSize: 8,
						opacity: 0.6,
						marginLeft: 1,
						color: token.colorTextSecondary,
					}}
				/>
			</button>
		</Popover>
	);
};

const ProjectActionRow: React.FC<{
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
	token: {
		colorText: string;
		colorTextSecondary: string;
		colorBgTextHover: string;
	};
}> = ({ icon, label, onClick, token }) => {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				width: "100%",
				padding: "7px 10px",
				borderRadius: 8,
				border: "none",
				background: "transparent",
				cursor: "pointer",
				textAlign: "left",
				color: token.colorText,
				fontSize: 13,
				transition: "background 120ms",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = token.colorBgTextHover;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "transparent";
			}}
		>
			<span
				style={{
					color: token.colorTextSecondary,
					display: "flex",
					alignItems: "center",
					fontSize: 13,
				}}
			>
				{icon}
			</span>
			{label}
		</button>
	);
};
