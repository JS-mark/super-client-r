import { useState } from "react";
import { Dropdown, Modal, Input, message as antdMessage } from "antd";
import type { MenuProps } from "antd";
import {
	StarOutlined,
	StarFilled,
	CopyOutlined,
	DownloadOutlined,
	DeleteOutlined,
	EditOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useMessageStore } from "../../stores/messageStore";
import type { Message } from "../../stores/chatStore";

interface MessageContextMenuProps {
	message: Message;
	conversationId: string;
	children: React.ReactNode;
	onDelete?: () => void;
	onEdit?: () => void;
}

type MenuItem = NonNullable<MenuProps["items"]>[number];

export function MessageContextMenu({
	message,
	conversationId,
	children,
	onDelete,
	onEdit,
}: MessageContextMenuProps) {
	const { t } = useTranslation();
	const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
	const [note, setNote] = useState("");

	const {
		addBookmark,
		removeBookmark,
		isBookmarked,
		getBookmarkByMessageId,
		updateBookmark,
	} = useMessageStore();

	const bookmarked = isBookmarked(message.id);
	const bookmark = getBookmarkByMessageId(message.id);

	const handleCopy = () => {
		navigator.clipboard.writeText(message.content);
		antdMessage.success(t("chat.messageCopied", "消息已复制", { ns: "chat" }));
	};

	const handleBookmark = () => {
		if (bookmarked) {
			const bm = getBookmarkByMessageId(message.id);
			if (bm) {
				removeBookmark(bm.id);
				antdMessage.success(t("chat.bookmarkRemoved", "已取消收藏", { ns: "chat" }));
			}
		} else {
			// Only allow bookmarking user or assistant messages
			if (message.role === "user" || message.role === "assistant") {
				addBookmark({
					messageId: message.id,
					conversationId,
					content: message.content,
					role: message.role,
					timestamp: message.timestamp,
				});
				antdMessage.success(t("chat.bookmarkAdded", "已收藏消息", { ns: "chat" }));
			}
		}
	};

	const handleAddNote = () => {
		setNote(bookmark?.note || "");
		setIsNoteModalOpen(true);
	};

	const handleSaveNote = () => {
		if (bookmark) {
			updateBookmark(bookmark.id, { note });
			antdMessage.success(t("chat.noteSaved", "备注已保存", { ns: "chat" }));
		}
		setIsNoteModalOpen(false);
	};

	const handleExport = () => {
		// 导出单条消息
		const blob = new Blob([message.content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `message-${message.id}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		antdMessage.success(t("chat.messageExported", "消息已导出", { ns: "chat" }));
	};

	const menuItems: MenuItem[] = [
		{
			key: "copy",
			icon: <CopyOutlined />,
			label: t("chat.copyMessage", "复制消息", { ns: "chat" }),
			onClick: handleCopy,
		},
		{
			key: "bookmark",
			icon: bookmarked ? <StarFilled className="text-yellow-500" /> : <StarOutlined />,
			label: bookmarked ? t("chat.removeBookmark", "取消收藏") : t("chat.addBookmark", "收藏消息", { ns: "chat" }),
			onClick: handleBookmark,
		},
		...(bookmarked
			? [
					{
						key: "note",
						icon: <EditOutlined />,
						label: t("chat.addNote", "添加备注", { ns: "chat" }),
						onClick: handleAddNote,
					},
				]
			: []),
		{
			key: "export",
			icon: <DownloadOutlined />,
			label: t("chat.exportMessage", "导出消息", { ns: "chat" }),
			onClick: handleExport,
		},
		...(onEdit
			? [
					{
						key: "edit",
						icon: <EditOutlined />,
						label: t("chat.editMessage", "编辑消息", { ns: "chat" }),
						onClick: onEdit,
					},
				]
			: []),
		...(onDelete
			? [
					{
						key: "delete",
						icon: <DeleteOutlined className="text-red-500" />,
						label: <span className="text-red-500">{t("chat.deleteMessage", "删除消息", { ns: "chat" })}</span>,
						onClick: onDelete,
					},
				]
			: []),
	];

	return (
		<>
			<Dropdown
				menu={{ items: menuItems }}
				trigger={["contextMenu"]}
				placement="bottomLeft"
			>
				{children}
			</Dropdown>

			<Modal
				title={t("chat.addNote", "添加备注", { ns: "chat" })}
				open={isNoteModalOpen}
				onOk={handleSaveNote}
				onCancel={() => setIsNoteModalOpen(false)}
				okText={t("common.save", "保存")}
				cancelText={t("cancel", "取消", { ns: "common" })}
			>
				<Input.TextArea
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder={t("chat.notePlaceholder", "输入备注...", { ns: "chat" })}
					rows={4}
				/>
			</Modal>
		</>
	);
}
