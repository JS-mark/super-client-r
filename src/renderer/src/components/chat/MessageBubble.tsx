import { RobotOutlined, StarOutlined } from "@ant-design/icons";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { Message } from "../../stores/chatStore";
import { useMessageStore } from "../../stores/messageStore";
import { Markdown } from "../Markdown";
import { MessageContextMenu } from "./MessageContextMenu";
import { ToolCallCard } from "./ToolCallCard";

export const MessageBubble: React.FC<{
	msg: Message;
	isStreaming: boolean;
	isLast: boolean;
	streamingContent: string;
	conversationId: string;
	onDelete?: (msgId: string) => void;
}> = ({ msg, isStreaming, isLast, streamingContent, conversationId, onDelete }) => {
	const isUser = msg.role === "user";
	const isTool = msg.role === "tool";
	const isAssistant = msg.role === "assistant";
	const displayContent =
		isAssistant && isStreaming && isLast ? streamingContent : msg.content;
	const { t } = useTranslation();
	const { isBookmarked } = useMessageStore();

	if (isTool && msg.toolCall) {
		return <ToolCallCard toolCall={msg.toolCall} />;
	}

	const messageContent = (
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
						"rounded-2xl px-5 py-3 relative group",
						isUser
							? "bg-gradient-to-br from-blue-500 to-purple-500 text-white"
							: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm",
					)}
				>
					{/* Bookmark indicator */}
					{isBookmarked(msg.id) && (
						<div className={cn(
							"absolute -top-2",
							isUser ? "left-2" : "right-2"
						)}>
							<StarOutlined className="text-yellow-500 text-sm" />
						</div>
					)}
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

	// Don't wrap tool messages with context menu
	if (isTool) {
		return messageContent;
	}

	return (
		<MessageContextMenu
			message={msg}
			conversationId={conversationId}
			onDelete={onDelete ? () => onDelete(msg.id) : undefined}
		>
			{messageContent}
		</MessageContextMenu>
	);
};
