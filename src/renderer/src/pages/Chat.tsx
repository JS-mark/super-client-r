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
	ToolOutlined,
} from "@ant-design/icons";
import {
	Button,
	Tooltip
} from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { Markdown } from "../components/Markdown";
import { useChat } from "../hooks/useChat";
import { useTitle } from "../hooks/useTitle";
import { cn } from "../lib/utils";
import type { Message } from "../stores/chatStore";
import {
	GoogleIcon,
	BingIcon,
	BaiduIcon,
	SogouIcon,
} from "../components/icons/SearchEngineIcons";
import type { SearchConfig, SearchProviderType } from "../types/search";
import { searchService } from "../services/search/searchService";

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

// Search engine definitions
interface SearchEngine {
	id: string;
	name: string;
	icon: React.ReactNode;
	key: string;
}

const SEARCH_ENGINES: SearchEngine[] = [
	{ id: "google", name: "Google", icon: <GoogleIcon size={16} />, key: "↑" },
	{ id: "bing", name: "Bing", icon: <BingIcon size={16} />, key: "↓" },
	{ id: "baidu", name: "百度", icon: <BaiduIcon size={16} />, key: "←" },
	{ id: "sogou", name: "搜狗", icon: <SogouIcon size={16} />, key: "→" },
];

// Quick action items for the toolbar - labels use i18n keys
const TOOLBAR_ITEMS: ToolbarItem[] = [
	{ id: "quote", icon: <PlusOutlined />, label: "toolbar.quote", type: "action" },
	{ id: "attach", icon: <PaperClipOutlined />, label: "toolbar.attach", type: "action" },
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
				<Tooltip title="Clear conversation">
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
	const [selectedEngine, setSelectedEngine] = useState<string>("baidu");

	// 搜索配置
	const [searchConfigs, setSearchConfigs] = useState<SearchConfig[]>([]);
	const [defaultSearchProvider, setDefaultSearchProvider] = useState<SearchProviderType | undefined>();

	// 加载搜索配置
	const loadSearchConfigs = useCallback(async () => {
		try {
			const result = await searchService.getConfigs();
			if (result.success && result.data) {
				setSearchConfigs(result.data.configs);
				setDefaultSearchProvider(result.data.defaultProvider);
				// 如果有默认搜索引擎，设置为选中
				if (result.data.defaultProvider) {
					setSelectedEngine(result.data.defaultProvider);
				}
			}
		} catch (error) {
			console.error("Failed to load search configs:", error);
		}
	}, []);

	useEffect(() => {
		loadSearchConfigs();
	}, [loadSearchConfigs]);

	// Search engine panel - full width at top of input area
	// Search categories
	const categories = [
		{ id: 'all', name: '全部', count: 12 },
		{ id: 'question', name: '问题', count: null },
		{ id: 'tool', name: '工具', count: null },
		{ id: 'skill', name: '技能', count: null },
	];
	const [activeCategory, setActiveCategory] = useState('all');
	const [searchQuery, setSearchQuery] = useState('');

	const searchEnginePanel = (
		<div className="w-full bg-[#252526] rounded-lg overflow-hidden shadow-2xl border border-[#3c3c3c]">
			{/* Search Input */}
			<div className="px-3 py-3 border-b border-[#3c3c3c]">
				<div className="flex items-center gap-2 text-[#cccccc]">
					<svg className="w-4 h-4 text-[#858585]" viewBox="0 0 16 16" fill="currentColor">
						<path d="M11.7422 10.3439C12.5329 9.2673 13 7.9382 13 6.5C13 2.91015 10.0899 0 6.5 0C2.91015 0 0 2.91015 0 6.5C0 10.0899 2.91015 13 6.5 13C7.9382 13 9.2673 12.5329 10.3439 11.7422L14.1464 15.5446C14.3417 15.7399 14.6583 15.7399 14.8536 15.5446L15.5446 14.8536C15.7399 14.6583 15.7399 14.3417 15.5446 14.1464L11.7422 10.3439ZM6.5 11C8.98528 11 11 8.98528 11 6.5C11 4.01472 8.98528 2 6.5 2C4.01472 2 2 4.01472 2 6.5C2 8.98528 4.01472 11 6.5 11Z"/>
					</svg>
					<input
						type="text"
						placeholder="搜索问题、工具或AI..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="flex-1 bg-transparent text-[13px] text-[#cccccc] placeholder-[#6e6e6e] outline-none"
					/>
				</div>
			</div>

			{/* Category Tabs */}
			<div className="flex items-center px-2 py-2 border-b border-[#3c3c3c] gap-1">
				{categories.map((cat) => (
					<button
						key={cat.id}
						onClick={() => setActiveCategory(cat.id)}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] transition-colors",
							activeCategory === cat.id
								? "bg-[#094771] text-white"
								: "text-[#cccccc] hover:bg-[#2a2d2e]"
						)}
					>
						<span>{cat.name}</span>
						{cat.count !== null && (
							<span className="text-[10px] opacity-70">{cat.count}</span>
						)}
					</button>
				))}
			</div>

			{/* Search Engine List */}
			<div className="py-1 max-h-[200px] overflow-y-auto">
				{/* 已配置的搜索引擎 */}
				{searchConfigs.length > 0 && (
					<>
						<div className="px-3 py-1.5 text-[11px] text-[#858585] uppercase tracking-wider">
							我的搜索
						</div>
						{searchConfigs.filter(c => c.enabled).map((config) => (
							<button
								key={config.id}
								onClick={() => {
									setSelectedEngine(config.provider);
									setSearchPopoverOpen(false);
								}}
								className={cn(
									"w-full flex items-center justify-between px-3 py-2.5 transition-colors",
									selectedEngine === config.provider
										? "bg-[#094771]"
										: "hover:bg-[#2a2d2e]"
								)}
							>
								<div className="flex items-center gap-3">
									<span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
										{getEngineIcon(config.provider)}
									</span>
									<span className={cn(
										"text-[13px]",
										selectedEngine === config.provider ? "text-white" : "text-[#cccccc]"
									)}>
										{config.name}
									</span>
								</div>
								{config.isDefault && (
									<span className="text-[11px] text-white/80 bg-white/20 px-1.5 py-0.5 rounded">默认</span>
								)}
							</button>
						))}
						<div className="my-2 border-t border-[#3c3c3c]" />
					</>
				)}
				{/* 基础搜索引擎 */}
				<div className="px-3 py-1.5 text-[11px] text-[#858585] uppercase tracking-wider">
					快速搜索
				</div>
				{SEARCH_ENGINES.map((engine) => (
					<button
						key={engine.id}
						onClick={() => {
							setSelectedEngine(engine.id);
							setSearchPopoverOpen(false);
						}}
						className={cn(
							"w-full flex items-center justify-between px-3 py-2.5 transition-colors",
							selectedEngine === engine.id
								? "bg-[#094771]"
								: "hover:bg-[#2a2d2e]"
						)}
					>
						<div className="flex items-center gap-3">
							<span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
								{engine.icon}
							</span>
							<span className={cn(
								"text-[13px]",
								selectedEngine === engine.id ? "text-white" : "text-[#cccccc]"
							)}>
								{engine.name}
							</span>
						</div>
						{selectedEngine === engine.id && !searchConfigs.find(c => c.provider === engine.id)?.isDefault && (
							<span className="text-[11px] text-white/80 bg-white/20 px-1.5 py-0.5 rounded">免费</span>
						)}
					</button>
				))}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between px-3 py-2 border-t border-[#3c3c3c] bg-[#252526]">
				<div className="flex items-center gap-2">
					<svg className="w-3.5 h-3.5 text-[#858585]" viewBox="0 0 16 16" fill="currentColor">
						<path d="M8.5 1.5a.5.5 0 00-1 0v5.793L5.354 5.146a.5.5 0 10-.707.707l3 3a.5.5 0 00.707 0l3-3a.5.5 0 00-.707-.707L8.5 7.293V1.5z"/>
						<path d="M3.5 9.5a.5.5 0 00-1 0v2A2.5 2.5 0 005 14h6a2.5 2.5 0 002.5-2.5v-2a.5.5 0 00-1 0v2A1.5 1.5 0 0111 13H5a1.5 1.5 0 01-1.5-1.5v-2z"/>
					</svg>
					<span className="text-[11px] text-[#cccccc]">网络搜索</span>
				</div>
				<div className="flex items-center gap-1.5 text-[10px] text-[#858585]">
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">ESC</span>
					<span>关闭</span>
					<span className="mx-1">·</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">▲▼</span>
					<span>选择</span>
					<span className="mx-1">·</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">⌘</span>
					<span>+</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">▲▼</span>
					<span>翻页</span>
					<span className="mx-1">·</span>
					<span className="px-1 py-0.5 bg-[#3c3c3c] rounded">↵</span>
					<span>确认</span>
				</div>
			</div>
		</div>
	);

	// 获取搜索引擎图标
	const getEngineIcon = useCallback((provider: string) => {
		switch (provider) {
			case "google": return <GoogleIcon size={16} />;
			case "bing": return <BingIcon size={16} />;
			case "baidu": return <BaiduIcon size={16} />;
			case "sogou": return <SogouIcon size={16} />;
			default: return <span className="text-lg">🔍</span>;
		}
	}, []);

	// 获取搜索引擎名称
	const getEngineName = useCallback((provider: string) => {
		const config = searchConfigs.find(c => c.provider === provider);
		if (config) return config.name;
		switch (provider) {
			case "google": return "Google";
			case "bing": return "Bing";
			case "baidu": return "百度";
			case "sogou": return "搜狗";
			default: return provider;
		}
	}, [searchConfigs]);

	// 获取当前选中的搜索引擎
	const currentEngine = useMemo(() => {
		const config = searchConfigs.find(c => c.provider === selectedEngine);
		if (config) {
			return {
				id: config.provider,
				name: config.name,
				icon: getEngineIcon(config.provider),
				key: "",
			};
		}
		return SEARCH_ENGINES.find(e => e.id === selectedEngine) || SEARCH_ENGINES[2];
	}, [selectedEngine, searchConfigs, getEngineIcon]);

	// Auto-scroll to bottom
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const handleSend = () => {
		if (input.trim() && !isStreaming) {
			sendMessage();
		}
	};

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
								{searchEnginePanel}
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
										<Tooltip key={item.id} title={t(item.label, { ns: "chat" })}>
											<button
												onClick={() => {
													// Handle toolbar item click
													if (item.id === "prompt") {
														// Toggle prompt mode or show prompt selector
														setChatMode("skill");
													}
												}}
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
									<Tooltip title={t("chat.toolbar.search", "搜索")}>
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
