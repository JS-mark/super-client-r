import {
	BulbOutlined,
	ClearOutlined,
	ExportOutlined,
	FileTextOutlined,
	PlusOutlined,
	RightOutlined,
	RobotOutlined,
	SearchOutlined,
	SendOutlined,
	StarOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import {
	Button,
	Tooltip,
	message
} from "antd";
import type * as React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentList } from "../components/attachment";
import { FileUploadButton } from "../components/attachment/FileUpload";
import type { Attachment } from "../stores/attachmentStore";
import { ChatExportDialog } from "../components/chat/ChatExportDialog";
import { MessageBubble } from "../components/chat/MessageBubble";
import { MessageSearch } from "../components/chat/MessageSearch";
import { SearchEnginePanel, useSearchEngine } from "../components/chat/SearchEnginePanel";
import { MainLayout } from "../components/layout/MainLayout";
import { useChat } from "../hooks/useChat";
import { useTitle } from "../hooks/useTitle";
import { cn } from "../lib/utils";

// Empty state suggestions - use i18n keys
const SUGGESTION_KEYS = [
	"suggestions.quantum",
	"suggestions.fibonacci",
	"suggestions.debug",
	"suggestions.marketing",
];

// Skill/tool icons for the input toolbar
interface ToolbarItem {
	id: string;
	icon: React.ReactNode;
	label: string;
	type: "skill" | "tool" | "action";
	color?: string;
}

// Quick action items for the toolbar - labels use i18n keys
const TOOLBAR_ITEMS: ToolbarItem[] = [
	{ id: "quote", icon: <PlusOutlined />, label: "toolbar.quote", type: "action" },
	{
		id: "prompt",
		icon: <BulbOutlined />,
		label: "toolbar.prompt",
		type: "tool",
		color: "#52c41a",
	},
	{ id: "doc", icon: <FileTextOutlined />, label: "toolbar.doc", type: "tool" },
	{ id: "tools", icon: <ToolOutlined />, label: "toolbar.tools", type: "tool" },
];

const Chat: React.FC = () => {
	const { t } = useTranslation();

	const {
		messages,
		input,
		setInput,
		sendMessage,
		isStreaming,
		streamingContent,
		clearMessages,
		setChatMode,
	} = useChat();

	// Search engine state
	const { selectedEngine, setSelectedEngine, currentEngine } = useSearchEngine();

	// Message search and export dialogs
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [isExportOpen, setIsExportOpen] = useState(false);

	// 设置标题栏和页面标题
	const pageTitle = useMemo(() => (
		<>
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
					<RobotOutlined className="text-white text-xs" />
				</div>
				<span className="text-slate-700 dark:text-slate-200 text-sm font-medium">{t("title", "AI 聊天", { ns: "chat" })}</span>
			</div>
			<div
				className="flex items-center gap-2"
				// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
				style={{ WebkitAppRegion: "no-drag" }}
			>
				<Tooltip title={t("chat.toolbar.searchMessages", "搜索消息", { ns: "chat" })}>
					<Button
						type="text"
						icon={<span className="text-slate-700 dark:text-slate-200"><SearchOutlined /></span>}
						onClick={() => setIsSearchOpen(true)}
						disabled={messages.length === 0}
						className="rounded-lg"
					/>
				</Tooltip>
				<Tooltip title={t("chat.toolbar.export", "导出", { ns: "chat" })}>
					<Button
						type="text"
						icon={<span className="text-slate-700 dark:text-slate-200"><ExportOutlined /></span>}
						onClick={() => setIsExportOpen(true)}
						disabled={messages.length === 0 || isStreaming}
						className="rounded-lg"
					/>
				</Tooltip>
				<Tooltip title={t("chat.toolbar.clear", "清空", { ns: "chat" })}>
					<Button
						type="text"
						icon={<span className="text-slate-700 dark:text-slate-200"><ClearOutlined /></span>}
						onClick={clearMessages}
						disabled={messages.length === 0 || isStreaming}
						className="rounded-lg"
					/>
				</Tooltip>
			</div>
		</>
	), [messages, t, clearMessages, isStreaming]);
	useTitle(pageTitle)

	const chatEndRef = useRef<HTMLDivElement>(null);
	const [isInputFocused, setIsInputFocused] = useState(false);
	const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);

	// Attachment state
	const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);

	// Toolbar feature states
	const [isPromptSelectorOpen, setIsPromptSelectorOpen] = useState(false);
	const [isToolSelectorOpen, setIsToolSelectorOpen] = useState(false);
	const [isQuoteSelectorOpen, setIsQuoteSelectorOpen] = useState(false);

	// Active tools state
	const [activeTools, setActiveTools] = useState<string[]>([]);

	// Conversation ID for message operations
	const conversationId = "default"; // TODO: Use actual conversation ID

	const handleSend = () => {
		if ((input.trim() || attachedFiles.length > 0) && !isStreaming) {
			sendMessage();
			setAttachedFiles([]);
		}
	};

	// Handle toolbar item click
	const handleToolbarClick = useCallback((itemId: string) => {
		switch (itemId) {
			case "prompt":
				setIsPromptSelectorOpen(true);
				break;
			case "tools":
				setIsToolSelectorOpen(true);
				break;
			case "quote":
				setIsQuoteSelectorOpen(true);
				break;
			case "doc":
				message.info(t("toolbar.docComingSoon", "文档功能即将推出", { ns: "chat" }));
				break;
			default:
				break;
		}
	}, [t]);

	// Handle prompt selection
	const handlePromptSelect = useCallback((prompt: string) => {
		setInput((prev) => prev + (prev ? " " : "") + prompt);
		setIsPromptSelectorOpen(false);
	}, [setInput]);

	// Handle tool toggle
	const handleToolToggle = useCallback((toolId: string) => {
		setActiveTools((prev) =>
			prev.includes(toolId)
				? prev.filter((id) => id !== toolId)
				: [...prev, toolId]
		);
	}, []);

	// Handle quote selection
	const handleQuoteSelect = useCallback((messageId: string) => {
		const msg = messages.find((m) => m.id === messageId);
		if (msg) {
			setInput((prev) => prev + (prev ? "\n\n" : "") + "> " + msg.content.slice(0, 200) + (msg.content.length > 200 ? "..." : ""));
		}
		setIsQuoteSelectorOpen(false);
	}, [messages, setInput]);

	return (
		<MainLayout>
			<div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950">
				{/* Chat Area */}
				<div className="flex-1 overflow-auto w-full">
					{messages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full w-full px-4 sm:px-6">
							{/* Welcome Card */}
							<div className="w-full mx-auto">
								<div className="text-center mb-6 sm:mb-8">
									<div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-2xl mb-4 sm:mb-6">
										<StarOutlined className="text-2xl sm:text-3xl text-white" />
									</div>
									<h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3 whitespace-normal">
										{t("welcomeTitle", { ns: "chat" })}
									</h2>
									<p className="text-slate-500 text-base sm:text-lg whitespace-normal">
										{t("welcomeSubtitle", { ns: "chat" })}
									</p>
								</div>
								{/* Suggestions */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
									{SUGGESTION_KEYS.map((key) => (
										<button
											key={key}
											onClick={() => {
												setInput(t(key, { ns: 'chat' }));
											}}
											className="p-4 text-left rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:shadow-md transition-all group block w-full min-w-0"
										>
											<p className="text-slate-700 dark:text-slate-300 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 break-words">
												{t(key, { ns: 'chat' })}
											</p>
										</button>
									))}
								</div>
							</div>
						</div>
					) : (
						<div className="max-w-4xl mx-auto px-6 py-8">
							{messages.map((msg, idx) => (
								<MessageBubble
									key={msg.id || idx}
									msg={msg}
									isStreaming={isStreaming}
									isLast={idx === messages.length - 1}
									streamingContent={streamingContent}
									conversationId={conversationId}
									onDelete={(msgId) => {
										message.info(t("chat.messageDeleteNotImplemented", "消息删除功能待实现", { ns: "chat" }));
									}}
								/>
							))}
							<div ref={chatEndRef} />
						</div>
					)}
				</div>

				{/* Input Area */}
				<div className="px-6 py-4">
					<div className="w-full mx-auto max-w-4xl">
						{/* Search Engine Panel - Full width at top */}
						{searchPopoverOpen && (
							<div className="mb-2 shadow-lg rounded-lg overflow-hidden">
								<SearchEnginePanel
									selectedEngine={selectedEngine}
									onSelectEngine={setSelectedEngine}
									onClose={() => setSearchPopoverOpen(false)}
								/>
							</div>
						)}

						{/* Input box with toolbar */}
						<div
							className={cn(
								"relative rounded-2xl border bg-slate-50 dark:bg-slate-800 transition-all duration-200",
								isInputFocused
									? "border-blue-500 shadow-lg shadow-blue-500/10"
									: "border-slate-200 dark:border-slate-700",
							)}
						>
							{/* Attached files */}
							{attachedFiles.length > 0 && (
								<div className="px-4 pt-3">
									<AttachmentList
										attachments={attachedFiles}
										onRemove={(id) =>
											setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
										}
									/>
								</div>
							)}

							{/* Textarea */}
							<textarea
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSend();
									}
								}}
								onFocus={() => setIsInputFocused(true)}
								onBlur={() => setIsInputFocused(false)}
								placeholder={t(
									"chat.placeholder",
									"在这里输入消息，按 Enter 发送",
								)}
								className="w-full bg-transparent border-0 resize-none py-4 px-5 max-h-40 min-h-[80px] focus:outline-none text-slate-800 dark:text-slate-200"
								rows={1}
								style={{ height: "auto" }}
								disabled={isStreaming}
							/>

							{/* Bottom toolbar */}
							<div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-700">
								{/* Left toolbar items */}
								<div className="flex items-center gap-1">
									{/* File Upload Button */}
									<FileUploadButton
										onUploadComplete={(attachments) => {
											setAttachedFiles((prev) => [...prev, ...attachments]);
										}}
										conversationId={conversationId}
									/>

									{/* Divider */}
									<div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

									{TOOLBAR_ITEMS.map((item) => (
										<Tooltip key={item.id} title={t(item.label, { ns: "chat" })}>
											<button
												onClick={() => handleToolbarClick(item.id)}
												className={cn(
													"w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600",
													item.color && "hover:text-[var(--hover-color)]",
												)}
												style={
													item.color
														? ({
															"--hover-color": item.color,
														} as React.CSSProperties)
														: undefined
												}
											>
												{item.icon}
											</button>
										</Tooltip>
									))}

									{/* Search engine toggle button */}
									<Tooltip title={t("chat.toolbar.search", "搜索", { ns: "chat" })}>
										<button
											onClick={() => setSearchPopoverOpen(!searchPopoverOpen)}
											className={cn(
												"w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600",
												searchPopoverOpen && "bg-slate-200 dark:bg-slate-600"
											)}
										>
											{currentEngine.icon}
										</button>
									</Tooltip>

								{/* Divider */}
									<div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

									{/* More button */}
									<Tooltip title="更多">
										<button className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600">
											<RightOutlined className="text-sm" />
										</button>
									</Tooltip>
								</div>

								{/* Right send button */}
								<Button
									type="primary"
									onClick={handleSend}
									loading={isStreaming}
									disabled={!input.trim() && attachedFiles.length === 0}
									className="rounded-full h-9 w-9 flex items-center justify-center !bg-slate-400 hover:!bg-slate-500 !border-0"
									icon={<SendOutlined className="text-sm" />}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Message Search Dialog */}
			<MessageSearch
				messages={messages}
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
				onJumpToMessage={(messageId) => {
					message.info(`${t("chat.jumpToMessage", "跳转到消息", { ns: "chat" })}: ${messageId}`);
				}}
			/>

			{/* Chat Export Dialog */}
			<ChatExportDialog
				messages={messages}
				isOpen={isExportOpen}
				onClose={() => setIsExportOpen(false)}
			/>
		</MainLayout>
	);
};

export default Chat;
