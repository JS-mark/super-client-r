/**
 * RemoteChatPane — Remote side panel for IM messaging
 *
 * Displays incoming/outgoing IM messages with an independent input box.
 * Used inside the Splitter layout when a conversation has a remote binding.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	Button,
	Input,
	Tag,
	Badge,
	Empty,
	Avatar,
	Tooltip,
	message,
	theme,
} from "antd";
import {
	SendOutlined,
	DisconnectOutlined,
	ApiOutlined,
	UserOutlined,
	RobotOutlined,
} from "@ant-design/icons";
import type { RemoteBinding, RemoteChatMessage } from "@/types/electron";

const { useToken } = theme;

interface RemoteChatPaneProps {
	binding: RemoteBinding | null;
	remoteMessages: RemoteChatMessage[];
	onSendMessage: (content: string) => Promise<void>;
	onBind: () => void;
	onUnbind: () => void;
	botOnline: boolean;
	isBotChecking: boolean;
	/** Hide the built-in input area (when the parent provides its own) */
	hideInput?: boolean;
}

const PLATFORM_COLORS: Record<string, string> = {
	telegram: "blue",
	dingtalk: "cyan",
	lark: "green",
};

const PLATFORM_LABELS: Record<string, string> = {
	telegram: "Telegram",
	dingtalk: "DingTalk",
	lark: "Lark",
};

function formatTime(timestamp: number): string {
	const d = new Date(timestamp);
	return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function RemoteChatPane({
	binding,
	remoteMessages,
	onSendMessage,
	onBind,
	onUnbind,
	botOnline,
	isBotChecking,
	hideInput,
}: RemoteChatPaneProps) {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const [inputValue, setInputValue] = useState("");
	const [isSending, setIsSending] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [remoteMessages.length]);

	const handleSend = useCallback(async () => {
		const content = inputValue.trim();
		if (!content || isSending) return;

		setIsSending(true);
		try {
			await onSendMessage(content);
			setInputValue("");
		} catch (err) {
			message.error(
				t("remoteChat.sendFailed", "发送失败") +
					": " +
					(err instanceof Error ? err.message : String(err)),
			);
		} finally {
			setIsSending(false);
		}
	}, [inputValue, isSending, onSendMessage, t]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	// Empty state — no binding
	if (!binding) {
		return (
			<div
				className="flex flex-col items-center justify-center h-full"
				style={{ backgroundColor: token.colorBgLayout }}
			>
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t("remoteChat.noBinding", "该会话未绑定机器人")}
				>
					<Button type="primary" icon={<ApiOutlined />} onClick={onBind}>
						{t("remoteChat.bindBot", "绑定 Bot")}
					</Button>
				</Empty>
				<p
					className="text-xs mt-3 max-w-[240px] text-center"
					style={{ color: token.colorTextDescription }}
				>
					{t(
						"remoteChat.bindPrompt",
						"绑定一个 IM 机器人以开始收发消息",
					)}
				</p>
			</div>
		);
	}

	const canSend = botOnline && !isSending;

	return (
		<div
			className="flex flex-col h-full"
			style={{ backgroundColor: token.colorBgLayout }}
		>
			{/* Header */}
			<div
				className="flex items-center justify-between px-3 py-2.5 shrink-0"
				style={{
					borderBottom: `1px solid ${token.colorBorderSecondary}`,
					backgroundColor: token.colorBgContainer,
				}}
			>
				<div className="flex items-center gap-2 min-w-0">
					<Tag
						color={PLATFORM_COLORS[binding.platform] || "default"}
						className="shrink-0"
					>
						{PLATFORM_LABELS[binding.platform] || binding.platform}
					</Tag>
					<span
						className="text-sm font-medium truncate"
						style={{ color: token.colorText }}
					>
						{binding.botName}
					</span>
					<Badge
						status={
							isBotChecking
								? "processing"
								: botOnline
									? "success"
									: "error"
						}
						text={
							<span className="text-xs" style={{ color: token.colorTextSecondary }}>
								{isBotChecking
									? t("remoteChat.checking", "检查中...")
									: botOnline
										? t("remoteChat.online", "在线")
										: t("remoteChat.offline", "离线")}
							</span>
						}
					/>
				</div>
				<Tooltip title={t("remoteChat.unbind", "解绑")}>
					<Button
						type="text"
						size="small"
						icon={<DisconnectOutlined />}
						danger
						onClick={onUnbind}
					/>
				</Tooltip>
			</div>

			{/* Message list */}
			<div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
				{remoteMessages.length === 0 ? (
					<div className="flex items-center justify-center h-full">
						<span
							className="text-sm"
							style={{ color: token.colorTextQuaternary }}
						>
							{t("remoteChat.noMessages", "暂无消息")}
						</span>
					</div>
				) : (
					remoteMessages.map((msg) => (
						<MessageBubble key={msg.id} message={msg} token={token} />
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input area — hidden when parent provides its own */}
			{!hideInput && (
				<div
					className="px-3 py-3 shrink-0"
					style={{
						borderTop: `1px solid ${token.colorBorderSecondary}`,
						backgroundColor: token.colorBgContainer,
					}}
				>
					{!botOnline && (
						<div
							className="text-xs mb-2 px-1"
							style={{ color: token.colorWarningText }}
						>
							{t("remoteChat.botOffline", "机器人离线")}
						</div>
					)}
					<div className="flex gap-2">
						<Input.TextArea
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t(
								"remoteChat.inputPlaceholder",
								"输入消息发送到 IM...",
							)}
							autoSize={{ minRows: 1, maxRows: 4 }}
							disabled={!botOnline}
							className="flex-1"
						/>
						<Button
							type="primary"
							icon={<SendOutlined />}
							onClick={handleSend}
							disabled={!canSend || !inputValue.trim()}
							loading={isSending}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

// ── Message bubble sub-component ──

function MessageBubble({
	message: msg,
	token,
}: {
	message: RemoteChatMessage;
	token: any;
}) {
	const isOutgoing = msg.direction === "outgoing";

	return (
		<div
			className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}
		>
			<div
				className={`flex items-end gap-2 max-w-[90%] ${isOutgoing ? "flex-row-reverse" : ""}`}
			>
				<Avatar
					size={24}
					icon={isOutgoing ? <UserOutlined /> : <RobotOutlined />}
					style={{
						backgroundColor: isOutgoing
							? token.colorPrimary
							: token.colorTextQuaternary,
						flexShrink: 0,
					}}
				/>
				<div>
					{!isOutgoing && (
						<div
							className="text-xs mb-0.5 px-1"
							style={{ color: token.colorTextSecondary }}
						>
							{msg.sender.name}
						</div>
					)}
					<div
						className="px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words"
						style={{
							backgroundColor: isOutgoing
								? token.colorPrimaryBg
								: token.colorBgContainer,
							color: token.colorText,
							border: `1px solid ${isOutgoing ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
						}}
					>
						{msg.content}
					</div>
					<div
						className={`text-[10px] mt-0.5 px-1 ${isOutgoing ? "text-right" : ""}`}
						style={{ color: token.colorTextQuaternary }}
					>
						{formatTime(msg.timestamp)}
					</div>
				</div>
			</div>
		</div>
	);
}
