import { RobotOutlined, StarOutlined, UserOutlined } from "@ant-design/icons";
import { Bubble } from "@ant-design/x";
import { Avatar } from "antd";
import type * as React from "react";
import { useCallback, useMemo } from "react";
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
}> = ({
	msg,
	isStreaming,
	isLast,
	streamingContent,
	conversationId,
	onDelete,
}) => {
	const isUser = msg.role === "user";
	const isTool = msg.role === "tool";
	const isAssistant = msg.role === "assistant";
	const displayContent =
		isAssistant && isStreaming && isLast ? streamingContent : msg.content;
	const { isBookmarked } = useMessageStore();
	const isCurrentlyStreaming = isAssistant && isStreaming && isLast;

	if (isTool && msg.toolCall) {
		return <ToolCallCard toolCall={msg.toolCall} />;
	}

	const renderContent = useCallback(
		(content: string) => (
			<Markdown content={content} streaming={isCurrentlyStreaming} />
		),
		[isCurrentlyStreaming],
	);

	const avatar = useMemo(
		() => (
			<Avatar
				icon={isUser ? <UserOutlined /> : <RobotOutlined />}
				style={{
					background: isUser
						? "linear-gradient(135deg, #3b82f6, #8b5cf6)"
						: "linear-gradient(135deg, #8b5cf6, #ec4899)",
					color: "#fff",
				}}
			/>
		),
		[isUser],
	);

	const footer = useMemo(
		() => (
			<div className="flex items-center gap-1">
				{isBookmarked(msg.id) && (
					<StarOutlined className="text-yellow-500 text-xs" />
				)}
				<span className="text-xs text-slate-400">
					{new Date(msg.timestamp).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					})}
				</span>
			</div>
		),
		[msg.id, msg.timestamp, isBookmarked],
	);

	const bubble = (
		<Bubble
			placement={isUser ? "end" : "start"}
			content={displayContent || ""}
			avatar={avatar}
			loading={isCurrentlyStreaming && !displayContent}
			variant={isUser ? "filled" : "borderless"}
			shape="round"
			typing={
				isCurrentlyStreaming
					? { effect: "fade-in" as const, step: 5, interval: 50 }
					: undefined
			}
			contentRender={(_content, _info) => {
				if (!displayContent) return null;
				return renderContent(displayContent);
			}}
			footer={footer}
			styles={{
				content: isUser
					? {
							background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
							color: "#fff",
						}
					: undefined,
			}}
		/>
	);

	if (isTool) {
		return bubble;
	}

	return (
		<MessageContextMenu
			message={msg}
			conversationId={conversationId}
			onDelete={onDelete ? () => onDelete(msg.id) : undefined}
		>
			<div>{bubble}</div>
		</MessageContextMenu>
	);
};
