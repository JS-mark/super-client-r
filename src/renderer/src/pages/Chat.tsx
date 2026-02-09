import {
	RobotOutlined,
	ClearOutlined,
	ApiOutlined,
	ToolOutlined,
	CodeOutlined,
	MessageOutlined,
	CheckCircleOutlined,
	LoadingOutlined,
	CloseCircleOutlined,
	SendOutlined,
	ThunderboltOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { Button, Badge, Card, Tag, Select, Avatar, Typography, Divider, Tooltip } from "antd";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { Markdown } from "../components/Markdown";
import { useChat, type ChatMode } from "../hooks/useChat";
import { cn } from "../lib/utils";
import { useSkillStore } from "../stores/skillStore";
import { useMcpStore } from "../stores/mcpStore";
import type { Message } from "../stores/chatStore";

const { Text } = Typography;

// Mode configuration with colors and icons
const MODE_CONFIG: Record<ChatMode, { color: string; bgColor: string; icon: React.ReactNode; label: string; description: string }> = {
	direct: {
		color: "#3b82f6",
		bgColor: "bg-blue-500",
		icon: <MessageOutlined />,
		label: "Direct",
		description: "Chat directly with AI",
	},
	agent: {
		color: "#8b5cf6",
		bgColor: "bg-purple-500",
		icon: <RobotOutlined />,
		label: "Agent",
		description: "AI agent with tools",
	},
	skill: {
		color: "#f97316",
		bgColor: "bg-orange-500",
		icon: <ToolOutlined />,
		label: "Skill",
		description: "Execute skills",
	},
	mcp: {
		color: "#06b6d4",
		bgColor: "bg-cyan-500",
		icon: <ApiOutlined />,
		label: "MCP",
		description: "MCP server tools",
	},
};

// Tool call status card
const ToolCallCard: React.FC<{ toolCall: NonNullable<Message["toolCall"]> }> = ({ toolCall }) => {
	const [isExpanded, setIsExpanded] = useState(true);

	const statusConfig = {
		pending: { color: "blue", icon: <LoadingOutlined className="animate-spin" />, bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
		success: { color: "green", icon: <CheckCircleOutlined />, bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" },
		error: { color: "red", icon: <CloseCircleOutlined />, bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" },
	}[toolCall.status];

	return (
		<div className={cn("my-3 rounded-xl border overflow-hidden transition-all", statusConfig.bg)}>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
			>
				<span className={cn("text-lg", `text-${statusConfig.color}-500`)}>{statusConfig.icon}</span>
				<div className="flex-1 text-left">
					<div className="font-medium text-sm text-slate-800 dark:text-slate-200">{toolCall.name}</div>
					<div className="text-xs text-slate-500 capitalize">{toolCall.status}</div>
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
							<div className="text-xs font-medium text-slate-500 mb-1">Result</div>
							<pre className="text-xs text-slate-700 dark:text-slate-300 overflow-auto max-h-32">
								{typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
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
	const displayContent = isAssistant && isStreaming && isLast ? streamingContent : msg.content;

	if (isTool && msg.toolCall) {
		return <ToolCallCard toolCall={msg.toolCall} />;
	}

	return (
		<div className={cn("flex gap-4 mb-6", isUser ? "flex-row-reverse" : "flex-row")}>
			{/* Avatar */}
			<div className={cn(
				"w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
				isUser ? "bg-gradient-to-br from-blue-500 to-purple-500" : "bg-gradient-to-br from-purple-500 to-pink-500"
			)}>
				{isUser ? (
					<span className="text-white font-bold">U</span>
				) : (
					<RobotOutlined className="text-white" />
				)}
			</div>

			{/* Message content */}
			<div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
				<div className={cn(
					"rounded-2xl px-5 py-3",
					isUser
						? "bg-gradient-to-br from-blue-500 to-purple-500 text-white"
							: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm"
				)}>
					{displayContent ? (
						<div className={cn("prose prose-sm max-w-none", isUser ? "prose-invert" : "dark:prose-invert")}>
							<Markdown content={displayContent} />
						</div>
					) : isStreaming && isAssistant ? (
						<div className="flex items-center gap-2 text-slate-400 py-2">
							<span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
							<span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
							<span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
							<span className="text-sm">Thinking...</span>
						</div>
					) : null}
				</div>
				<div className={cn("text-xs text-slate-400 mt-1", isUser ? "text-right" : "text-left")}>
					{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
				</div>
			</div>
		</div>
	);
};

// Mode selector pill
const ModePill: React.FC<{
	mode: ChatMode;
	isSelected: boolean;
	onClick: () => void;
}> = ({ mode, isSelected, onClick }) => {
	const config = MODE_CONFIG[mode];

	return (
		<button
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200",
				isSelected
					? `text-white shadow-lg`
					: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
			)}
			style={isSelected ? { backgroundColor: config.color } : undefined}
		>
			{config.icon}
			<span className="font-medium text-sm">{config.label}</span>
		</button>
	);
};

// Empty state suggestions
const SUGGESTIONS = [
	"Explain quantum computing in simple terms",
	"Write a Python function to calculate fibonacci",
	"Help me debug this error in my code",
	"Create a marketing plan for a new product",
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
		chatMode,
		setChatMode,
		selectedSkillId,
		setSelectedSkillId,
		selectedMcpServerId,
		setSelectedMcpServerId,
	} = useChat();

	const { installedSkills } = useSkillStore();
	const { servers } = useMcpStore();
	const chatEndRef = useRef<HTMLDivElement>(null);
	const [isInputFocused, setIsInputFocused] = useState(false);

	// Auto-scroll to bottom
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isStreaming, streamingContent]);

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
				<div className="flex-1 overflow-auto">
					{messages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full px-6">
							{/* Welcome Card */}
							<div className="max-w-2xl w-full">
								<div className="text-center mb-8">
									<div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-2xl mb-6">
										<StarOutlined className="text-3xl text-white" />
									</div>
									<h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
										Welcome to AI Chat
									</h2>
									<p className="text-slate-500 text-lg">
										Choose a mode and start your conversation
									</p>
								</div>

								{/* Mode Selection */}
								<div className="flex flex-wrap justify-center gap-3 mb-8">
									{modes.map((mode) => (
										<ModePill
											key={mode}
											mode={mode}
											isSelected={chatMode === mode}
											onClick={() => setChatMode(mode)}
										/>
									))}
								</div>

								{/* Suggestions */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
									{SUGGESTIONS.map((suggestion, idx) => (
										<button
											key={idx}
											onClick={() => {
												setInput(suggestion);
											}}
											className="p-4 text-left rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:shadow-md transition-all group"
										>
											<p className="text-slate-700 dark:text-slate-300 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400">
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
				<div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
					<div className="max-w-4xl mx-auto">
						{/* Mode selector */}
						<div className="flex items-center gap-3 mb-3 overflow-x-auto pb-2">
							{modes.map((mode) => (
								<ModePill
									key={mode}
									mode={mode}
									isSelected={chatMode === mode}
									onClick={() => setChatMode(mode)}
								/>
							))}

							{/* Skill selector */}
							{chatMode === "skill" && (
								<Select
									placeholder="Select skill"
									value={selectedSkillId}
									onChange={setSelectedSkillId}
									size="small"
									style={{ minWidth: 150 }}
									options={installedSkills.map((s) => ({
										value: s.id,
										label: s.name,
									}))}
								/>
							)}

							{/* MCP selector */}
							{chatMode === "mcp" && (
								<Select
									placeholder="Select MCP server"
									value={selectedMcpServerId}
									onChange={setSelectedMcpServerId}
									size="small"
									style={{ minWidth: 150 }}
									options={servers
										.filter((s) => s.status === "connected")
										.map((s) => ({
											value: s.id,
											label: s.name,
										}))}
								/>
							)}
						</div>

						{/* Input box */}
						<div
							className={cn(
								"relative flex items-end gap-2 rounded-2xl border bg-slate-50 dark:bg-slate-800 transition-all duration-200",
								isInputFocused
									? "border-blue-500 shadow-lg shadow-blue-500/10"
									: "border-slate-200 dark:border-slate-700"
							)}
						>
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
								placeholder={t("chat.placeholder", "Type your message...")}
								className="flex-1 bg-transparent border-0 resize-none py-4 px-5 max-h-40 min-h-[56px] focus:outline-none text-slate-800 dark:text-slate-200"
								rows={1}
								style={{ height: "auto" }}
								disabled={isStreaming}
							/>
							<div className="pr-3 pb-3">
								<Button
									type="primary"
									icon={<SendOutlined />}
									onClick={handleSend}
									loading={isStreaming}
									disabled={!input.trim()}
									className="rounded-xl h-10 w-10 flex items-center justify-center"
								/>
							</div>
						</div>

						<div className="text-center mt-2">
							<Text className="text-xs text-slate-400">
								Press Enter to send, Shift+Enter for new line
							</Text>
						</div>
					</div>
				</div>
			</div>
		</MainLayout>
	);
};

export default Chat;
