import {
	BulbOutlined,
	CheckCircleOutlined,
	ClearOutlined,
	CloseCircleOutlined,
	FileTextOutlined,
	LoadingOutlined,
	PaperClipOutlined,
	PlusOutlined,
	RightOutlined,
	RobotOutlined,
	SendOutlined,
	StarOutlined,
	ThunderboltOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import {
	Button,
	Tooltip
} from "antd";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { Markdown } from "../components/Markdown";
import { type ChatMode, useChat } from "../hooks/useChat";
import { cn } from "../lib/utils";
import type { Message } from "../stores/chatStore";

// Tool call status card
const ToolCallCard: React.FC<{
	toolCall: NonNullable<Message["toolCall"]>;
}> = ({ toolCall }) => {
	const [isExpanded, setIsExpanded] = useState(true);

	const statusConfig = {
		pending: {
			color: "blue",
			icon: <LoadingOutlined className="animate-spin" />,
			bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
		},
		success: {
			color: "green",
			icon: <CheckCircleOutlined />,
			bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
		},
		error: {
			color: "red",
			icon: <CloseCircleOutlined />,
			bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
		},
	}[toolCall.status];

	return (
		<div
			className={cn(
				"my-3 rounded-xl border overflow-hidden transition-all",
				statusConfig.bg,
			)}
		>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
			>
				<span className={cn("text-lg", `text-${statusConfig.color}-500`)}>
					{statusConfig.icon}
				</span>
				<div className="flex-1 text-left">
					<div className="font-medium text-sm text-slate-800 dark:text-slate-200">
						{toolCall.name}
					</div>
					<div className="text-xs text-slate-500 capitalize">
						{toolCall.status}
					</div>
				</div>
				<span className="text-xs text-slate-400">{isExpanded ? "▼" : "▶"}</span>
			</button>

			{isExpanded && (
				<div className="px-4 pb-4 space-y-3">
					<div className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-3">
						<div className="text-xs font-medium text-slate-500 mb-1">Input</div>
						<pre className="text-xs text-slate-700 dark:text-slate-300 overflow-auto max-h-24">
							{JSON.stringify(toolCall.input, null, 2)}
						</pre>
					</div>

					{toolCall.result !== undefined && (
						<div className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-3">
							<div className="text-xs font-medium text-slate-500 mb-1">
								Result
							</div>
							<pre className="text-xs text-slate-700 dark:text-slate-300 overflow-auto max-h-32">
								{typeof toolCall.result === "string"
									? toolCall.result
									: JSON.stringify(toolCall.result, null, 2)}
							</pre>
						</div>
					)}

					{toolCall.error && (
						<div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg p-3 text-sm">
							{toolCall.error}
						</div>
					)}

					{toolCall.duration !== undefined && (
						<div className="text-right text-xs text-slate-400">
							Duration: {toolCall.duration}ms
						</div>
					)}
				</div>
			)}
		</div>
	);
};

// Message bubble component
const MessageBubble: React.FC<{
	msg: Message;
	isStreaming: boolean;
	isLast: boolean;
	streamingContent: string;
}> = ({ msg, isStreaming, isLast, streamingContent }) => {
	const isUser = msg.role === "user";
	const isTool = msg.role === "tool";
	const isAssistant = msg.role === "assistant";
	const displayContent =
		isAssistant && isStreaming && isLast ? streamingContent : msg.content;

	if (isTool && msg.toolCall) {
		return <ToolCallCard toolCall={msg.toolCall} />;
	}

	return (
		<div
			className={cn(
				"flex gap-4 mb-6",
				isUser ? "flex-row-reverse" : "flex-row",
			)}
		>
			{/* Avatar */}
			<div
				className={cn(
					"w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
					isUser
						? "bg-gradient-to-br from-blue-500 to-purple-500"
						: "bg-gradient-to-br from-purple-500 to-pink-500",
				)}
			>
				{isUser ? (
					<span className="text-white font-bold">U</span>
				) : (
					<RobotOutlined className="text-white" />
				)}
			</div>

			{/* Message content */}
			<div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
				<div
					className={cn(
						"rounded-2xl px-5 py-3",
						isUser
							? "bg-gradient-to-br from-blue-500 to-purple-500 text-white"
							: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm",
					)}
				>
					{displayContent ? (
						<div
							className={cn(
								"prose prose-sm max-w-none",
								isUser ? "prose-invert" : "dark:prose-invert",
							)}
						>
							<Markdown content={displayContent} />
						</div>
					) : isStreaming && isAssistant ? (
						<div className="flex items-center gap-2 text-slate-400 py-2">
							<span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
							<span
								className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
								style={{ animationDelay: "0.2s" }}
							/>
							<span
								className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
								style={{ animationDelay: "0.4s" }}
							/>
							<span className="text-sm">Thinking...</span>
						</div>
					) : null}
				</div>
				<div
					className={cn(
						"text-xs text-slate-400 mt-1",
						isUser ? "text-right" : "text-left",
					)}
				>
					{new Date(msg.timestamp).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					})}
				</div>
			</div>
		</div>
	);
};


// Empty state suggestions
const SUGGESTIONS = [
	"Explain quantum computing in simple terms",
	"Write a Python function to calculate fibonacci",
	"Help me debug this error in my code",
	"Create a marketing plan for a new product",
];

// Skill/tool icons for the input toolbar
interface ToolbarItem {
	id: string;
	icon: React.ReactNode;
	label: string;
	type: "skill" | "tool" | "action";
	color?: string;
}

// Quick action items for the toolbar
const TOOLBAR_ITEMS: ToolbarItem[] = [
	{ id: "quote", icon: <PlusOutlined />, label: "引用", type: "action" },
	{ id: "attach", icon: <PaperClipOutlined />, label: "附件", type: "action" },
	{
		id: "prompt",
		icon: <BulbOutlined />,
		label: "提示词",
		type: "tool",
		color: "#52c41a",
	},
	{
		id: "baidu",
		icon: <span className="text-green-500 font-bold">du</span>,
		label: "百度",
		type: "tool",
		color: "#52c41a",
	},
	{ id: "doc", icon: <FileTextOutlined />, label: "文档", type: "tool" },
	{ id: "tools", icon: <ToolOutlined />, label: "工具", type: "tool" },
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

	const chatEndRef = useRef<HTMLDivElement>(null);
	const [isInputFocused, setIsInputFocused] = useState(false);

	// Auto-scroll to bottom
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const handleSend = () => {
		if (input.trim() && !isStreaming) {
			sendMessage();
		}
	};

	const modes: ChatMode[] = ["direct", "agent", "skill", "mcp"];

	return (
		<MainLayout>
			<div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
							<ThunderboltOutlined className="text-white text-xl" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-white">
								{t("chat.title", "AI Chat")}
							</h1>
							<p className="text-sm text-slate-500">
								{messages.length} messages
							</p>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<Tooltip title="Clear conversation">
							<Button
								type="text"
								icon={<ClearOutlined />}
								onClick={clearMessages}
								disabled={messages.length === 0 || isStreaming}
								className="rounded-lg"
							/>
						</Tooltip>
					</div>
				</div>

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
										Welcome to AI Chat
									</h2>
									<p className="text-slate-500 text-base sm:text-lg whitespace-normal">
										Choose a mode and start your conversation
									</p>
								</div>
								{/* Suggestions */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
									{SUGGESTIONS.map((suggestion) => (
										<button
											key={suggestion}
											onClick={() => {
												setInput(suggestion);
											}}
											className="p-4 text-left rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:shadow-md transition-all group block w-full min-w-0"
										>
											<p className="text-slate-700 dark:text-slate-300 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 break-words">
												{suggestion}
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
								/>
							))}
							<div ref={chatEndRef} />
						</div>
					)}
				</div>

				{/* Input Area */}
				<div className="px-6 py-4">
					<div className="w-full mx-auto">
						{/* Input box with toolbar */}
						<div
							className={cn(
								"relative rounded-2xl border bg-slate-50 dark:bg-slate-800 transition-all duration-200",
								isInputFocused
									? "border-blue-500 shadow-lg shadow-blue-500/10"
									: "border-slate-200 dark:border-slate-700",
							)}
						>
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
									{TOOLBAR_ITEMS.map((item) => (
										<Tooltip key={item.id} title={item.label}>
											<button
												onClick={() => {
													// Handle toolbar item click
													if (item.id === "prompt") {
														// Toggle prompt mode or show prompt selector
														setChatMode("skill");
													}
												}}
												className={cn(
													"w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700",
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

									{/* Divider */}
									<div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

									{/* More button */}
									<Tooltip title="更多">
										<button className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
											<RightOutlined className="text-sm" />
										</button>
									</Tooltip>
								</div>

								{/* Right send button */}
								<Button
									type="primary"
									onClick={handleSend}
									loading={isStreaming}
									disabled={!input.trim()}
									className="rounded-full h-9 w-9 flex items-center justify-center !bg-slate-400 hover:!bg-slate-500 !border-0"
									icon={<SendOutlined className="text-sm" />}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</MainLayout>
	);
};

export default Chat;
