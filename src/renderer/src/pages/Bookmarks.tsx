import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { List, Card, Tag, Button, Empty, Input, Modal, message } from "antd";
import {
	StarFilled,
	DeleteOutlined,
	EditOutlined,
	ExportOutlined,
	SearchOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { MainLayout } from "../components/layout/MainLayout";
import { useMessageStore, type BookmarkedMessage } from "../stores/messageStore";
import { useTitle } from "../hooks/useTitle";
import { cn } from "../lib/utils";

export default function Bookmarks() {
	const { t } = useTranslation();

	// 设置标题栏
	const pageTitle = useMemo(() => (
		<div className="flex items-center gap-2">
			<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
				<StarOutlined className="text-white text-xs" />
			</div>
			<span className="text-slate-700 dark:text-slate-200 text-sm font-medium">{t("bookmarks.title", "收藏消息")}</span>
		</div>
	), [t]);
	useTitle(pageTitle);
	const [searchQuery, setSearchQuery] = useState("");
	const [editingBookmark, setEditingBookmark] = useState<BookmarkedMessage | null>(null);
	const [editNote, setEditNote] = useState("");

	const { bookmarks, removeBookmark, updateBookmark, tags } = useMessageStore();

	const filteredBookmarks = bookmarks.filter(
		(b) =>
			b.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.note?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const handleDelete = (id: string) => {
		removeBookmark(id);
		message.success(t("bookmarks.deleted", "书签已删除"));
	};

	const handleEditNote = (bookmark: BookmarkedMessage) => {
		setEditingBookmark(bookmark);
		setEditNote(bookmark.note || "");
	};

	const handleSaveNote = () => {
		if (editingBookmark) {
			updateBookmark(editingBookmark.id, { note: editNote });
			message.success(t("bookmarks.noteSaved", "备注已保存"));
			setEditingBookmark(null);
		}
	};

	const handleExport = () => {
		const content = JSON.stringify(bookmarks, null, 2);
		const blob = new Blob([content], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `bookmarks-${new Date().toISOString().split("T")[0]}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		message.success(t("bookmarks.exported", "书签已导出"));
	};

	return (
		<MainLayout>
			<div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-950">
				{/* Header */}
				<div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-white">
								{t("bookmarks.title", "收藏的消息")}
							</h1>
							<p className="text-sm text-slate-500 mt-1">
								{t("bookmarks.subtitle", "管理您收藏的重要消息")}
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								icon={<ExportOutlined />}
								onClick={handleExport}
								disabled={bookmarks.length === 0}
							>
								{t("common.export", "导出")}
							</Button>
						</div>
					</div>

					{/* Search */}
					<div className="mt-4">
						<Input
							prefix={<SearchOutlined />}
							placeholder={t("bookmarks.search", "搜索收藏...")}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							allowClear
						/>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-6">
					{bookmarks.length === 0 ? (
						<Empty
							description={t("bookmarks.empty", "暂无收藏的消息")}
							image={Empty.PRESENTED_IMAGE_SIMPLE}
						/>
					) : filteredBookmarks.length === 0 ? (
						<Empty
							description={t("bookmarks.noResults", "未找到匹配的书签")}
							image={Empty.PRESENTED_IMAGE_SIMPLE}
						/>
					) : (
						<List
							grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2 }}
							dataSource={filteredBookmarks}
							renderItem={(bookmark) => (
								<List.Item>
									<Card
										className="w-full h-full"
										actions={[
											<Button
												key="edit"
												type="text"
												icon={<EditOutlined />}
												onClick={() => handleEditNote(bookmark)}
											>
												{t("common.edit", "编辑")}
											</Button>,
											<Button
												key="delete"
												type="text"
												danger
												icon={<DeleteOutlined />}
												onClick={() => handleDelete(bookmark.id)}
											>
												{t("common.delete", "删除")}
											</Button>,
										]}
									>
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<Tag color={bookmark.role === "user" ? "blue" : "green"}>
													{bookmark.role === "user"
														? t("chat.user", "用户")
														: t("chat.assistant", "助手")}
												</Tag>
												<span className="text-xs text-slate-400">
													{new Date(bookmark.timestamp).toLocaleString()}
												</span>
											</div>

											<div className="text-slate-700 dark:text-slate-300 line-clamp-4">
												{bookmark.content}
											</div>

											{bookmark.note && (
												<div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded text-sm">
													<span className="font-medium">
														{t("bookmarks.note", "备注")}:{" "}
													</span>
													{bookmark.note}
												</div>
											)}
										</div>
									</Card>
									</List.Item>
								)}
						/>
						)}
					</div>
				</div>

			{/* Edit Note Modal */}
			<Modal
				title={t("bookmarks.editNote", "编辑备注")}
				open={!!editingBookmark}
				onOk={handleSaveNote}
				onCancel={() => setEditingBookmark(null)}
			>
				<Input.TextArea
					value={editNote}
					onChange={(e) => setEditNote(e.target.value)}
					rows={4}
					placeholder={t("bookmarks.notePlaceholder", "输入备注...")}
				/>
			</Modal>
		</MainLayout>
	);
}
