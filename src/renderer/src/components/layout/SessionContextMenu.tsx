/**
 * SessionContextMenu — plan §23.2 right-click context menu wrapper for a
 * session row. Used by both AppSidebar and ClaudeSidebar to avoid duplicating
 * the 11-item menu definition.
 *
 * The wrapper itself is presentation-only: it forwards children inside an antd
 * Dropdown configured with `trigger=["contextMenu"]` so left-click on the row
 * still navigates while right-click opens the menu.
 *
 * Inline rename UI lives in the parent (state must outlive a Dropdown unmount);
 * the wrapper only signals intent through the `onRename` callback.
 */

import { Dropdown, type MenuProps, message, Modal } from "antd";
import type React from "react";
import { useCallback, useMemo } from "react";
import { fileActionService } from "../../services/fileActionService";
import { useChatStore } from "../../stores/chatStore";
import type { ConversationSummary } from "../../types/electron";

export interface SessionContextMenuProps {
	conversation: ConversationSummary;
	onRename: (conv: ConversationSummary) => void;
	children: React.ReactNode;
}

async function resolveCwd(id: string): Promise<string | null> {
	try {
		const res = await window.electron.cwd.resolveSessionCwd(id);
		if (res.success && res.data) return res.data;
	} catch {
		/* fallthrough */
	}
	return null;
}

export const SessionContextMenu: React.FC<SessionContextMenuProps> = ({
	conversation,
	onRename,
	children,
}) => {
	const session = conversation.session;
	const pinned = !!session?.flags?.pinned;
	const archived = !!session?.flags?.archived;
	const unread = !!session?.flags?.unread;

	const togglePinned = useCallback(() => {
		void useChatStore.getState().updateConversationMetadata(conversation.id, {
			session: { flags: { pinned: !pinned } },
		});
	}, [conversation.id, pinned]);

	const toggleArchived = useCallback(() => {
		void useChatStore.getState().updateConversationMetadata(conversation.id, {
			session: { flags: { archived: !archived } },
		});
	}, [conversation.id, archived]);

	const toggleUnread = useCallback(() => {
		void useChatStore.getState().updateConversationMetadata(conversation.id, {
			session: { flags: { unread: !unread } },
		});
	}, [conversation.id, unread]);

	const handleReveal = useCallback(async () => {
		const cwd = await resolveCwd(conversation.id);
		if (!cwd) {
			message.error("无法解析会话目录");
			return;
		}
		await fileActionService.reveal(cwd, conversation.workspaceId);
	}, [conversation.id, conversation.workspaceId]);

	const handleCopyPath = useCallback(async () => {
		const cwd = await resolveCwd(conversation.id);
		if (!cwd) {
			message.error("无法解析会话目录");
			return;
		}
		await fileActionService.copyPath(cwd, conversation.workspaceId);
		message.success("已复制工作目录");
	}, [conversation.id, conversation.workspaceId]);

	const handleCopyId = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(conversation.id);
			message.success("已复制");
		} catch {
			message.error("复制失败");
		}
	}, [conversation.id]);

	const handleCopyDeepLink = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(
				`superclient://conversation/${conversation.id}`,
			);
			message.success("已复制深度链接");
		} catch {
			message.error("复制失败");
		}
	}, [conversation.id]);

	const handleForkLocal = useCallback(() => {
		void useChatStore.getState().forkConversationLocal(conversation.id);
	}, [conversation.id]);

	const handleForkWorktree = useCallback(() => {
		void useChatStore.getState().forkConversationWorktree(conversation.id);
	}, [conversation.id]);

	const handleRename = useCallback(() => {
		onRename(conversation);
	}, [conversation, onRename]);

	const handleDelete = useCallback(() => {
		// Plan §25.6 — surface the remote-binding side-effect in the confirm
		// modal so the user is aware the IM bot will be auto-unbound on delete.
		const hasRemote = !!conversation.remote;
		const baseLine = `确定删除 "${conversation.name || "未命名对话"}" 吗？此操作不可撤销。`;
		const remoteLine = hasRemote
			? "此会话已绑定 IM bot，删除会同时解绑。"
			: null;
		Modal.confirm({
			title: "删除对话",
			content: remoteLine ? (
				<div className="flex flex-col gap-1">
					<div>{baseLine}</div>
					<div className="text-amber-500 text-sm">{remoteLine}</div>
				</div>
			) : (
				baseLine
			),
			okText: "删除",
			okButtonProps: { danger: true },
			cancelText: "取消",
			onOk: async () => {
				try {
					await useChatStore.getState().deleteConversation(conversation.id);
					message.success("已删除");
				} catch (err) {
					message.error(err instanceof Error ? err.message : "删除失败");
				}
			},
		});
	}, [conversation.id, conversation.name, conversation.remote]);

	const items: MenuProps["items"] = useMemo(() => {
		const isMac =
			typeof navigator !== "undefined" &&
			/Mac|iPhone|iPod|iPad/i.test(navigator.platform);
		return [
			{
				key: "pin",
				label: pinned ? "取消置顶" : "置顶对话",
				onClick: togglePinned,
			},
			{ key: "rename", label: "重命名对话", onClick: handleRename },
			{
				key: "archive",
				label: archived ? "取消归档" : "归档对话",
				onClick: toggleArchived,
			},
			{
				key: "unread",
				label: unread ? "标记为已读" : "标记为未读",
				onClick: toggleUnread,
			},
			{ type: "divider" },
			{ key: "reveal", label: "在 Finder 中显示", onClick: handleReveal },
			{ key: "copy-path", label: "复制工作目录", onClick: handleCopyPath },
			{ key: "copy-id", label: "复制会话 ID", onClick: handleCopyId },
			{
				key: "copy-deeplink",
				label: "复制深度链接",
				onClick: handleCopyDeepLink,
			},
			{ type: "divider" },
			{ key: "fork-local", label: "派生到本地", onClick: handleForkLocal },
			{
				key: "fork-worktree",
				label: "派生到新工作树",
				onClick: handleForkWorktree,
				disabled: !isMac,
			},
			{ type: "divider" },
			{
				key: "open-new-window",
				label: "在新窗口中打开 (即将推出)",
				disabled: true,
			},
			{ type: "divider" },
			{
				key: "delete",
				label: "删除对话",
				danger: true,
				onClick: handleDelete,
			},
		];
	}, [
		archived,
		handleCopyDeepLink,
		handleCopyId,
		handleCopyPath,
		handleDelete,
		handleForkLocal,
		handleForkWorktree,
		handleRename,
		handleReveal,
		pinned,
		toggleArchived,
		togglePinned,
		toggleUnread,
		unread,
	]);

	return (
		<Dropdown menu={{ items }} trigger={["contextMenu"]}>
			<div style={{ width: "100%" }}>{children}</div>
		</Dropdown>
	);
};
