import {
	RobotOutlined,
	ClearOutlined,
	MoreOutlined,
	ApiOutlined,
	ToolOutlined,
	CodeOutlined,
	MessageOutlined,
	CheckCircleOutlined,
	LoadingOutlined,
	CloseCircleOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Space, Tooltip, Badge, Card, Tag, Select } from "antd";
import type { MenuProps } from "antd";
import type * as React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Conversations, Sender } from "@ant-design/x";
import { MainLayout } from "../components/layout/MainLayout";
import { Markdown } from "../components/Markdown";
import { useChat, type ChatMode } from "../hooks/useChat";
import { cn } from "../lib/utils";

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
	const chatEndRef = useRef<HTMLDivElement>(null);

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
			icon: <ClearOutlined />,
			danger: true,
			onClick: clearMessages,
		},
		{
			key: "export",
			label: t("chat.export", "Export Chat"),
			onClick: () => {
				console.log("Export chat");
			},
		},
	];

	// Mode selector items
	const modeOptions = [
		{ value: "direct" as ChatMode, label: "Direct", icon: <MessageOutlined /> },
		{ value: "agent" as ChatMode, label: "Agent", icon: <RobotOutlined /> },
		{ value: "skill" as ChatMode, label: "Skill", icon: <ToolOutlined /> },
		{ value: "mcp" as ChatMode, label: "MCP", icon: <ApiOutlined /> },
	];

	// Get current mode config
	const getModeConfig = () => {
		switch (chatMode) {
			case "agent":
				return { color: "purple", icon: <RobotOutlined />, label: "Agent" };
			case "skill":
				return { color: "orange", icon: <ToolOutlined />, label: "Skill" };
			case "mcp":
				return { color: "cyan", icon: <ApiOutlined />, label: "MCP" };
			default:
				return { color: "blue", icon: <MessageOutlined />, label: "Direct" };
		}
	};

	const modeConfig = getModeConfig();

	// Render tool call card
	const ToolCallCard: React.FC<{ toolCall: NonNullable<typeof messages[0]["toolCall"]> }> = ({ toolCall }) => {
		const statusIcon = {
			pending: <LoadingOutlined className="animate-spin text-blue-500" />,
			success: <CheckCircleOutlined className="text-green-500" />,
			error: <CloseCircleOutlined className="text-red-500" />,
		}[toolCall.status];

		const statusColor = {
			pending: "blue",
			success: "green",
			error: "red",
		}[toolCall.status];

		return (
			<Card
				size="small"
				className={cn(
					"my-2 max-w-lg",
					"border-l-4",
					toolCall.status === "pending" && "border-l-blue-500",
					toolCall.status === "success" && "border-l-green-500",
					toolCall.status === "error" && "border-l-red-500"
				)}
				title={
					<div className="flex items-center gap-2">
						<CodeOutlined />
						<span className="font-medium">{toolCall.name}</span>
						<Tag color={statusColor} className="ml-auto text-xs">
							{statusIcon}
							<span className="ml-1 capitalize">{toolCall.status}</span>
						</Tag>
					</div>
				}
			>
				<div className="space-y-2">
					<div>
						<div className="text-xs text-slate-500 mb-1">Input:</div>
						<pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto max-h-32">
							{JSON.stringify(toolCall.input, null, 2)}
						</pre>
					</div>
					{toolCall.result !== undefined && (
						<div>
							<div className="text-xs text-slate-500 mb-1">Result:</div>
							<pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto max-h-48">
								{typeof toolCall.result === "string"
									? toolCall.result
									: JSON.stringify(toolCall.result, null, 2)}
							</pre>
						</div>
					)}
					{toolCall.error && (
						<div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
							{toolCall.error}
						</div>
					)}
					{toolCall.duration !== undefined && (
						<div className="text-xs text-slate-400 text-right">
							Duration: {toolCall.duration}ms
						</div>
					)}
				</div>
			</Card>
		);
	};

	// Convert messages to @ant-design/x format
	const conversationItems = messages.map((msg, idx) => {
		const isTool = msg.role === "tool";
		const isAssistant = msg.role === "assistant";

		// For assistant messages, show streaming content if available and it's the last message
		const displayContent = isAssistant && isStreaming && idx === messages.length - 1
			? streamingContent
			: msg.content;

		return {
			key: msg.id || idx.toString(),
			role: msg.role as "user" | "assistant",
			label: (
				<div className="max-w-none">
					{isTool && msg.toolCall ? (
						<ToolCallCard toolCall={msg.toolCall} />
					) : (
						<div className="prose dark:prose-invert">
							{displayContent ? (
								<Markdown content={displayContent} />
							) : isStreaming && isAssistant ? (
								<div className="flex items-center gap-2 text-slate-400">
									<span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
									<span>Thinking...</span>
								</div>
							) : null}
						</div>
					)}
				</div>
			),
		};
	});

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
								icon={<ClearOutlined />}
								onClick={clearMessages}
								disabled={messages.length === 0}
								className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
							/>
						</Tooltip>
						<Dropdown menu={{ items: menuItems }} trigger={["click"]}>
							<Button
								type="text"
								icon={<MoreOutlined />}
								className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
							/>
						</Dropdown>
					</Space>
				</div>

				{/* Chat Area */}
				<div className="flex-1 overflow-auto">
					{messages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-center py-20">
							<div className="w-32 h-32 mb-8 rounded-3xl bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 flex items-center justify-center shadow-xl shadow-blue-500/10">
								<span className="text-6xl">💬</span>
							</div>
							<h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
								Start a conversation
							</h3>
							<p className="text-slate-500 dark:text-slate-400 max-w-md text-base">
								Ask me anything! I'm here to help you with your questions and tasks.
							</p>
							<div className="mt-6 flex gap-2">
								{modeOptions.map((mode) => (
									<Button
										key={mode.value}
										size="small"
										onClick={() => setChatMode(mode.value)}
										className={cn(
											"transition-all",
											chatMode === mode.value && "bg-blue-50 text-blue-600 border-blue-200"
										)}
									>
										{mode.icon}
										<span className="ml-1">{mode.label}</span>
									</Button>
								))}
								</div>
						</div>
					) : (
						<Conversations
							items={conversationItems}
							className="h-full px-6 py-4"
						/>
					)}
					<div ref={chatEndRef} />
				</div>

				{/* Input Area */}
				<div className="p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50">
					<div className="max-w-4xl mx-auto space-y-3">
						{/* Mode Selector */}
						<div className="flex items-center gap-2 flex-wrap">
							<Badge color={modeConfig.color}>
								<Select
									value={chatMode}
									onChange={setChatMode}
									style={{ width: 120 }}
									variant="borderless"
									options={modeOptions.map((m) => ({
										value: m.value,
										label: (
											<div className="flex items-center gap-2">
												{m.icon}
												<span>{m.label}</span>
											</div>
										),
									}))}
								/>
							</Badge>

							{chatMode === "skill" && (
								<Select
									placeholder="Select skill"
									value={selectedSkillId}
									onChange={setSelectedSkillId}
									style={{ width: 160 }}
									size="small"
									options={[]} // TODO: Load from skill store
								/>
							)}

							{chatMode === "mcp" && (
								<Select
									placeholder="Select MCP server"
									value={selectedMcpServerId}
									onChange={setSelectedMcpServerId}
									style={{ width: 160 }}
									size="small"
									options={[]} // TODO: Load from MCP store
								/>
							)}
						</div>

						<Sender
							value={input}
							onChange={setInput}
							onSubmit={handleSend}
							loading={isStreaming}
							placeholder={t("chat.placeholder", "Type your message...")}
							allowSpeech={false}
							className="!bg-slate-50 dark:!bg-slate-800/50 !border-slate-200 dark:!border-slate-700 !rounded-2xl !shadow-sm focus:!shadow-md focus:!border-blue-400 dark:focus:!border-blue-500 transition-all duration-200"
						/>
						<div className="text-center">
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
