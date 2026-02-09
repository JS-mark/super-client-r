import { RobotOutlined } from "@ant-design/icons";
import { Button, Dropdown, Space, Tooltip } from "antd";
import type { MenuProps } from "antd";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Conversations, Sender } from "@ant-design/x";
import { MainLayout } from "../components/layout/MainLayout";
import { Markdown } from "../components/Markdown";
import { useChat } from "../hooks/useChat";

const Chat: React.FC = () => {
	const { t } = useTranslation();
	const { messages, input, setInput, sendMessage, isStreaming, clearMessages } =
		useChat();
	const chatEndRef = useRef<HTMLDivElement>(null);
	const [streamingContent, setStreamingContent] = useState("");

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isStreaming, streamingContent]);

	const handleSend = () => {
		if (input.trim() && !isStreaming) {
			sendMessage();
		}
	};

	const menuItems: MenuProps["items"] = [
		{
			key: "clear",
			label: t("chat.clear", "Clear Chat"),
			icon: <RobotOutlined />,
			danger: true,
			onClick: clearMessages,
		},
		{
			key: "export",
			label: t("chat.export", "Export Chat"),
			onClick: () => {
				// TODO: Implement export functionality
				console.log("Export chat");
			},
		},
	];

	// Convert messages to @ant-design/x format
	const conversationItems = messages.map((msg, idx) => ({
		key: msg.id || idx.toString(),
		role: msg.role as "user" | "assistant",
		label: (
			<div className="prose dark:prose-invert max-w-none">
				<Markdown content={msg.content} />
			</div>
		),
	}));

	return (
		<MainLayout>
			<div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
							<RobotOutlined className="text-white text-lg" />
						</div>
						<div>
							<h2 className="text-lg font-semibold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
								{t("chat.title", "AI Assistant")}
							</h2>
							<p className="text-xs text-slate-500 dark:text-slate-400">
								{t("chat.subtitle", "Powered by Claude")}
							</p>
						</div>
					</div>
					<Space>
						<Tooltip title={t("chat.clear", "Clear Chat")}>
							<Button
								type="text"
								icon={<RobotOutlined />}
								onClick={clearMessages}
								disabled={messages.length === 0}
								className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
							/>
						</Tooltip>
						<Dropdown menu={{ items: menuItems }} trigger={["click"]}>
							<Button
								type="text"
								className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
							>
								•••
							</Button>
						</Dropdown>
					</Space>
				</div>

				{/* Chat Area */}
				<div className="flex-1 overflow-hidden">
					{messages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-center py-20">
							<div className="w-32 h-32 mb-8 rounded-3xl bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 flex items-center justify-center shadow-xl shadow-blue-500/10">
								<span className="text-6xl">💬</span>
							</div>
							<h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
								Start a conversation
							</h3>
							<p className="text-slate-500 dark:text-slate-400 max-w-md text-base">
								Ask me anything! I'm here to help you with your questions and
								tasks.
							</p>
						</div>
					) : (
						<Conversations
							items={conversationItems}
							className="h-full px-6 py-4"
						/>
					)}
					{/* Loading indicator */}
					{isStreaming && (
						<div className="flex items-center gap-2 text-slate-400 px-6 py-4">
							<span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
							<span
								className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"
								style={{ animationDelay: "150ms" }}
							/>
							<span
								className="w-2 h-2 bg-pink-500 rounded-full animate-bounce"
								style={{ animationDelay: "300ms" }}
							/>
						</div>
					)}
				</div>

				{/* Scroll Anchor */}
				<div ref={chatEndRef} />

				{/* Input Area */}
				<div className="p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50">
					<div className="max-w-4xl mx-auto">
						<Sender
							value={input}
							onChange={setInput}
							onSubmit={handleSend}
							loading={isStreaming}
							placeholder={t("chat.placeholder", "Type your message...")}
							allowSpeech={false}
							className="!bg-slate-50 dark:!bg-slate-800/50 !border-slate-200 dark:!border-slate-700 !rounded-2xl !shadow-sm focus:!shadow-md focus:!border-blue-400 dark:focus:!border-blue-500 transition-all duration-200"
						/>
						<div className="text-center mt-2">
							<span className="text-xs text-slate-400">
								{t("chat.hint", "Press Enter to send, Shift+Enter for new line")}
							</span>
						</div>
					</div>
				</div>
			</div>
		</MainLayout>
	);
};

export default Chat;