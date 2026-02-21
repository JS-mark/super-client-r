import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message } from "./chatStore";

// 书签/收藏的消息
export interface BookmarkedMessage {
	id: string;
	messageId: string;
	conversationId: string;
	content: string;
	role: "user" | "assistant";
	timestamp: number;
	note?: string;
	tags?: string[];
}

// 消息标签
export interface MessageTag {
	id: string;
	name: string;
	color: string;
}

// 导出格式
export type ExportFormat = "markdown" | "json" | "txt";

interface MessageState {
	// 收藏的消息
	bookmarks: BookmarkedMessage[];
	// 消息标签
	tags: MessageTag[];
	// 搜索历史
	searchHistory: string[];
	// 最后导出路径
	lastExportPath?: string;
}

interface MessageActions {
	// 书签管理
	addBookmark: (bookmark: Omit<BookmarkedMessage, "id">) => void;
	removeBookmark: (id: string) => void;
	updateBookmark: (id: string, updates: Partial<BookmarkedMessage>) => void;
	isBookmarked: (messageId: string) => boolean;
	getBookmarkByMessageId: (messageId: string) => BookmarkedMessage | undefined;

	// 标签管理
	addTag: (tag: Omit<MessageTag, "id">) => void;
	removeTag: (id: string) => void;
	updateTag: (id: string, updates: Partial<MessageTag>) => void;

	// 搜索历史
	addSearchHistory: (query: string) => void;
	clearSearchHistory: () => void;

	// 导出设置
	setLastExportPath: (path: string) => void;

	// 导出功能
	exportMessages: (
		messages: Message[],
		format: ExportFormat,
		filename?: string,
	) => Promise<string>;

	// 搜索功能
	searchMessages: (
		messages: Message[],
		query: string,
		options?: {
			caseSensitive?: boolean;
			wholeWord?: boolean;
			role?: "user" | "assistant" | "all";
		},
	) => Message[];
}

const generateId = () => Math.random().toString(36).substring(2, 9);

// 默认标签颜色
const DEFAULT_TAG_COLORS = [
	"#ff4d4f",
	"#ff7a45",
	"#ffa940",
	"#ffc53d",
	"#73d13d",
	"#36cfc9",
	"#40a9ff",
	"#597ef7",
	"#9254de",
	"#f759ab",
];

export const useMessageStore = create<MessageState & MessageActions>()(
	persist(
		(set, get) => ({
			bookmarks: [],
			tags: [],
			searchHistory: [],

			// 书签管理
			addBookmark: (bookmark) => {
				const newBookmark: BookmarkedMessage = {
					...bookmark,
					id: generateId(),
				};
				set((state) => ({
					bookmarks: [newBookmark, ...state.bookmarks],
				}));
			},

			removeBookmark: (id) => {
				set((state) => ({
					bookmarks: state.bookmarks.filter((b) => b.id !== id),
				}));
			},

			updateBookmark: (id, updates) => {
				set((state) => ({
					bookmarks: state.bookmarks.map((b) =>
						b.id === id ? { ...b, ...updates } : b,
					),
				}));
			},

			isBookmarked: (messageId) => {
				return get().bookmarks.some((b) => b.messageId === messageId);
			},

			getBookmarkByMessageId: (messageId) => {
				return get().bookmarks.find((b) => b.messageId === messageId);
			},

			// 标签管理
			addTag: (tag) => {
				const newTag: MessageTag = {
					...tag,
					id: generateId(),
					color:
						tag.color ||
						DEFAULT_TAG_COLORS[
							Math.floor(Math.random() * DEFAULT_TAG_COLORS.length)
						],
				};
				set((state) => ({
					tags: [...state.tags, newTag],
				}));
			},

			removeTag: (id) => {
				set((state) => ({
					tags: state.tags.filter((t) => t.id !== id),
					bookmarks: state.bookmarks.map((b) => ({
						...b,
						tags: b.tags?.filter((t) => t !== id),
					})),
				}));
			},

			updateTag: (id, updates) => {
				set((state) => ({
					tags: state.tags.map((t) => (t.id === id ? { ...t, ...updates } : t)),
				}));
			},

			// 搜索历史
			addSearchHistory: (query) => {
				if (!query.trim()) return;
				set((state) => ({
					searchHistory: [
						query,
						...state.searchHistory.filter((h) => h !== query),
					].slice(0, 20),
				}));
			},

			clearSearchHistory: () => {
				set({ searchHistory: [] });
			},

			// 导出设置
			setLastExportPath: (path) => {
				set({ lastExportPath: path });
			},

			// 导出功能
			exportMessages: async (messages, format, filename) => {
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
				const defaultFilename = filename || `chat-export-${timestamp}`;

				let content = "";
				let extension = "";
				let mimeType = "";

				switch (format) {
					case "markdown":
						content = messagesToMarkdown(messages);
						extension = "md";
						mimeType = "text/markdown";
						break;
					case "json":
						content = JSON.stringify(messages, null, 2);
						extension = "json";
						mimeType = "application/json";
						break;
					case "txt":
						content = messagesToText(messages);
						extension = "txt";
						mimeType = "text/plain";
						break;
				}

				// 创建Blob并下载
				const blob = new Blob([content], { type: mimeType });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `${defaultFilename}.${extension}`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);

				return `${defaultFilename}.${extension}`;
			},

			// 搜索功能
			searchMessages: (messages, query, options = {}) => {
				if (!query.trim()) return messages;

				const {
					caseSensitive = false,
					wholeWord = false,
					role = "all",
				} = options;

				let searchRegex: RegExp;
				const flags = caseSensitive ? "g" : "gi";

				if (wholeWord) {
					searchRegex = new RegExp(`\\b${escapeRegExp(query)}\\b`, flags);
				} else {
					searchRegex = new RegExp(escapeRegExp(query), flags);
				}

				return messages.filter((msg) => {
					// 角色过滤
					if (role !== "all" && msg.role !== role) {
						return false;
					}

					// 内容搜索
					return searchRegex.test(msg.content);
				});
			},
		}),
		{
			name: "message-storage",
			partialize: (state) => ({
				bookmarks: state.bookmarks,
				tags: state.tags,
				searchHistory: state.searchHistory,
				lastExportPath: state.lastExportPath,
			}),
		},
	),
);

// 转义正则表达式特殊字符
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$\u0026");
}

// 转换为Markdown格式
function messagesToMarkdown(messages: Message[]): string {
	const lines: string[] = [];
	lines.push("# 聊天记录导出");
	lines.push("");
	lines.push(`导出时间: ${new Date().toLocaleString()}`);
	lines.push(`消息数量: ${messages.length}`);
	lines.push("");
	lines.push("---");
	lines.push("");

	for (const msg of messages) {
		const role = msg.role === "user" ? "👤 用户" : "🤖 助手";
		const time = new Date(msg.timestamp).toLocaleString();

		lines.push(`## ${role} - ${time}`);
		lines.push("");
		lines.push(msg.content);
		lines.push("");
		lines.push("---");
		lines.push("");
	}

	return lines.join("\n");
}

// 转换为纯文本格式
function messagesToText(messages: Message[]): string {
	const lines: string[] = [];
	lines.push("聊天记录导出");
	lines.push(`导出时间: ${new Date().toLocaleString()}`);
	lines.push(`消息数量: ${messages.length}`);
	lines.push("");
	lines.push("=".repeat(50));
	lines.push("");

	for (const msg of messages) {
		const role = msg.role === "user" ? "用户" : "助手";
		const time = new Date(msg.timestamp).toLocaleString();

		lines.push(`[${time}] ${role}:`);
		lines.push(msg.content);
		lines.push("");
	}

	return lines.join("\n");
}
