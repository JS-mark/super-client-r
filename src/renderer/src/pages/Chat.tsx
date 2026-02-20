import {
	BulbOutlined,
	ClearOutlined,
	CodeOutlined,
	CopyOutlined,
	DeleteOutlined,
	DownloadOutlined,
	EditOutlined,
	ExportOutlined,
	FileTextOutlined,
	HistoryOutlined,
	LeftOutlined,
	MoreOutlined,
	PlusOutlined,
	ReloadOutlined,
	RightOutlined,
	RobotOutlined,
	SearchOutlined,
	SettingOutlined,
	StarFilled,
	StarOutlined,
	TagsOutlined,
	ThunderboltOutlined,
	ToolOutlined,
	TranslationOutlined,
	UserOutlined,
	PauseCircleOutlined,
} from "@ant-design/icons";
import { Bubble, Prompts, Sender, Welcome } from "@ant-design/x";
import type { BubbleListRef } from "@ant-design/x/es/bubble";
import { Avatar, Button, Dropdown, Flex, message, Select, Tooltip, Typography, theme } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AttachmentList } from "../components/attachment";
import { FileUploadButton } from "../components/attachment/FileUpload";
import { ChatExportDialog } from "../components/chat/ChatExportDialog";
import { ChatSidebar } from "../components/chat/ChatSidebar";
import { MessageContextMenu } from "../components/chat/MessageContextMenu";
import { MessageSearch } from "../components/chat/MessageSearch";
import { ChatModePanel } from "../components/chat/ChatModePanel";
import type { ChatModeSelection } from "../components/chat/ChatModePanel";
import { SlashCommandPanel } from "../components/chat/SlashCommandPanel";
import {
	SearchEnginePanel,
	useSearchEngine,
} from "../components/chat/SearchEnginePanel";
import { ToolCallCard } from "../components/chat/ToolCallCard";
import { MainLayout } from "../components/layout/MainLayout";
import { Markdown } from "../components/Markdown";
import { ProviderIcon } from "../components/models/ProviderIcon";
import type { ModelProviderPreset } from "../types/models";
import { useChat } from "../hooks/useChat";
import { useTitle } from "../hooks/useTitle";
import type { Attachment } from "../stores/attachmentStore";
import { useChatStore } from "../stores/chatStore";
import { useMessageStore } from "../stores/messageStore";
import { useModelStore } from "../stores/modelStore";
import {
	getShortcutFromEvent,
	normalizeShortcut,
	useShortcutStore,
} from "../stores/shortcutStore";

// Toolbar item definition
interface ToolbarItem {
	id: string;
	icon: React.ReactNode;
	label: string;
}

// Primary toolbar items - always visible
const PRIMARY_TOOLBAR_ITEMS: ToolbarItem[] = [
	{ id: "quote", icon: <PlusOutlined />, label: "toolbar.quote" },
	{ id: "prompt", icon: <BulbOutlined />, label: "toolbar.prompt" },
	{ id: "doc", icon: <FileTextOutlined />, label: "toolbar.doc" },
	{ id: "tools", icon: <ToolOutlined />, label: "toolbar.tools" },
];

// Extra toolbar items - shown when "More" is expanded
const EXTRA_TOOLBAR_ITEMS: ToolbarItem[] = [
	{ id: "tags", icon: <TagsOutlined />, label: "toolbar.tags" },
	{
		id: "translate",
		icon: <TranslationOutlined />,
		label: "toolbar.translate",
	},
	{ id: "settings", icon: <SettingOutlined />, label: "toolbar.settings" },
];

const { Text } = Typography;
const { useToken } = theme;

/**
 * Inline model selector shown on the welcome screen when no model is active.
 */
const ModelSelectPrompt: React.FC<{
	token: any;
	t: any;
	getAllEnabledModels: () => { provider: any; model: any }[];
	setActiveModel: (selection: { providerId: string; modelId: string }) => Promise<void>;
	navigate: (path: string) => void;
	messageApi: any;
}> = ({ token, t, getAllEnabledModels, setActiveModel, navigate, messageApi }) => {
	const enabledModels = getAllEnabledModels();

	const handleSelect = useCallback(
		async (value: string) => {
			const [providerId, modelId] = value.split("||");
			await setActiveModel({ providerId, modelId });
			messageApi.success(t("modelSelected", "Model selected", { ns: "chat" }));
		},
		[setActiveModel, messageApi, t],
	);

	if (enabledModels.length === 0) {
		return (
			<div
				className="mt-6 p-6 rounded-xl border text-center"
				style={{
					borderColor: token.colorWarningBorder,
					backgroundColor: token.colorWarningBg,
				}}
			>
				<SettingOutlined
					className="text-3xl mb-3"
					style={{ color: token.colorWarning }}
				/>
				<div
					className="text-sm font-medium mb-2"
					style={{ color: token.colorText }}
				>
					{t("noModelsConfigured", "No models configured", { ns: "chat" })}
				</div>
				<Text
					type="secondary"
					className="text-xs block mb-4"
				>
					{t("noModelsConfiguredDesc", "Please add and enable a model provider in settings first.", { ns: "chat" })}
				</Text>
				<Button
					type="primary"
					icon={<SettingOutlined />}
					onClick={() => navigate("/settings?tab=models")}
				>
					{t("goToModelSettings", "Go to Model Settings", { ns: "chat" })}
				</Button>
			</div>
		);
	}

	// Group models by provider
	const groupedOptions = enabledModels.reduce<
		Record<string, { providerName: string; preset: ModelProviderPreset; models: { label: React.ReactNode; value: string }[] }>
	>((acc, { provider, model }) => {
		if (!acc[provider.id]) {
			acc[provider.id] = {
				providerName: provider.name,
				preset: provider.preset,
				models: [],
			};
		}
		acc[provider.id].models.push({
			label: model.name,
			value: `${provider.id}||${model.id}`,
		});
		return acc;
	}, {});

	const selectOptions = Object.entries(groupedOptions).map(
		([, group]) => ({
			label: (
				<span className="flex items-center gap-2">
					<ProviderIcon preset={group.preset} size={16} />
					{group.providerName}
				</span>
			),
			options: group.models,
		}),
	);

	return (
		<div
			className="mt-6 p-6 rounded-xl border max-w-md w-full"
			style={{
				borderColor: token.colorPrimaryBorder,
				backgroundColor: token.colorPrimaryBg,
			}}
		>
			<div
				className="text-sm font-medium mb-3"
				style={{ color: token.colorText }}
			>
				{t("selectModelToStart", "Select a model to start chatting", { ns: "chat" })}
			</div>
			<Select
				className="w-full"
				size="large"
				placeholder={t("selectModel", "Select a model...", { ns: "chat" })}
				onChange={handleSelect}
				showSearch
				optionFilterProp="label"
				options={selectOptions}
			/>
		</div>
	);
};

const Chat: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const navigate = useNavigate();

	const {
		messages,
		input,
		setInput,
		sendMessage,
		sessionStatus,
		isStreaming,
		streamingContent,
		clearMessages,
		stopCurrentStream,
		retryMessage,
		editMessage,
		deleteMessage,
		chatMode,
		setChatMode,
		selectedSkillId,
		setSelectedSkillId,
		sessionModelOverride,
		setSessionModelOverride,
	} = useChat();

	// Search engine state
	const { selectedEngine, setSelectedEngine, currentEngine, searchConfigs, hasSearchEngines } =
		useSearchEngine();

	// Model selection state
	const getAllEnabledModels = useModelStore((s) => s.getAllEnabledModels);
	const setActiveModel = useModelStore((s) => s.setActiveModel);
	const isModelLoading = useModelStore((s) => s.isLoading);
	const hasActiveModel = !!useModelStore((s) => s.getActiveProviderModel)();

	// Message search and export dialogs
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [isExportOpen, setIsExportOpen] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(false);

	// Title bar and page title
	const pageTitle = useMemo(
		() => (
			<>
				<div className="flex items-center gap-2">
					<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
						<RobotOutlined className="text-white text-xs" />
					</div>
					<span
						style={{ color: token.colorText }}
						className="text-sm font-medium"
					>
						{t("title", "AI 聊天", { ns: "chat" })}
					</span>
				</div>
				<div
					className="flex items-center gap-2"
					// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
					style={{ WebkitAppRegion: "no-drag" }}
				>
					<Tooltip
						title={t("chat.toolbar.searchMessages", "搜索消息", {
							ns: "chat",
						})}
					>
						<Button
							type="text"
							icon={<SearchOutlined />}
							onClick={() => setIsSearchOpen(true)}
							disabled={messages.length === 0}
							className="rounded-lg"
						/>
					</Tooltip>
					<Tooltip title={t("chat.searchHistory", "搜索历史", { ns: "chat" })}>
						<Button
							type="text"
							icon={<HistoryOutlined />}
							onClick={() => setSidebarOpen(true)}
							className="rounded-lg"
						/>
					</Tooltip>
					<Tooltip title={t("chat.toolbar.export", "导出", { ns: "chat" })}>
						<Button
							type="text"
							icon={<ExportOutlined />}
							onClick={() => setIsExportOpen(true)}
							disabled={messages.length === 0 || isStreaming}
							className="rounded-lg"
						/>
					</Tooltip>
					<Tooltip title={t("chat.toolbar.clear", "清空", { ns: "chat" })}>
						<Button
							type="text"
							icon={<ClearOutlined />}
							onClick={clearMessages}
							disabled={messages.length === 0 || isStreaming}
							className="rounded-lg"
						/>
					</Tooltip>
				</div>
			</>
		),
		[messages, t, clearMessages, isStreaming, token.colorText],
	);
	useTitle(pageTitle);

	// Conversation management
	const {
		currentConversationId,
		loadConversations,
		createConversation,
		switchConversation,
		pendingInput,
		setPendingInput,
		pendingSkillId,
		setPendingSkillId,
	} = useChatStore();

	// Load conversations on mount and restore last conversation
	useEffect(() => {
		const init = async () => {
			await loadConversations();
			const res = await window.electron.chat.getLastConversation();
			if (res.success && res.data) {
				switchConversation(res.data);
			}
		};
		init();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Consume pendingInput from plugins or other sources
	useEffect(() => {
		if (pendingInput) {
			setInput(pendingInput);
			setPendingInput(null);
		}
	}, [pendingInput, setInput, setPendingInput]);

	// Consume pendingSkillId from Skills page navigation
	useEffect(() => {
		if (pendingSkillId) {
			setChatMode("skill");
			setSelectedSkillId(pendingSkillId);
			setPendingSkillId(null);
		}
	}, [pendingSkillId, setChatMode, setSelectedSkillId, setPendingSkillId]);

	// Reset session model override when switching conversations
	useEffect(() => {
		setSessionModelOverride(null);
	}, [currentConversationId, setSessionModelOverride]);

	// Build grouped model options for the session model selector
	const activeSelection = useModelStore((s) => s.activeSelection);
	const providers = useModelStore((s) => s.providers);
	const groupedModelOptions = useMemo(() => {
		const enabledModels = getAllEnabledModels();
		const groups: Record<
			string,
			{ providerName: string; preset: ModelProviderPreset; models: { label: React.ReactNode; value: string }[] }
		> = {};
		for (const { provider, model } of enabledModels) {
			if (!groups[provider.id]) {
				groups[provider.id] = { providerName: provider.name, preset: provider.preset, models: [] };
			}
			groups[provider.id].models.push({
				label: (
					<span className="flex items-center gap-1.5">
						<ProviderIcon preset={provider.preset} size={14} />
						<span>{model.name}</span>
					</span>
				),
				value: `${provider.id}||${model.id}`,
			});
		}
		return Object.entries(groups).map(([, group]) => ({
			label: (
				<span className="flex items-center gap-1.5">
					<ProviderIcon preset={group.preset} size={14} />
					{group.providerName}
				</span>
			),
			options: group.models,
		}));
	}, [providers, getAllEnabledModels]);

	const handleNewChat = useCallback(() => {
		createConversation();
	}, [createConversation]);

	const bubbleListRef = useRef<BubbleListRef>(null);
	const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
	const [modePanelOpen, setModePanelOpen] = useState(false);
	const [slashPanelOpen, setSlashPanelOpen] = useState(false);
	const [slashQuery, setSlashQuery] = useState("");
	const [slashSkills, setSlashSkills] = useState<import("../types/electron").SkillManifest[]>([]);
	const [slashHighlight, setSlashHighlight] = useState(0);
	const senderWrapperRef = useRef<HTMLDivElement>(null);
	const [toolbarExpanded, setToolbarExpanded] = useState(false);
	const { isBookmarked } = useMessageStore();

	// Attachment state
	const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);

	// Conversation ID for message operations
	const conversationId = currentConversationId || "default";

	const handleSend = useCallback(
		(value: string) => {
			// Safety guard: prevent send when slash command panel is open
			if (slashStateRef.current.open) return;
			if ((value.trim() || attachedFiles.length > 0) && !isStreaming) {
				sendMessage({
					mode: chatMode,
					skillId: chatMode === "skill" ? selectedSkillId ?? undefined : undefined,
					searchEngine: chatMode === "direct" ? selectedEngine : undefined,
					searchConfigs: chatMode === "direct" ? searchConfigs : undefined,
				});
				setAttachedFiles([]);
			}
		},
		[attachedFiles.length, isStreaming, sendMessage, chatMode, selectedSkillId, selectedEngine, searchConfigs],
	);

	// Mode selection callback
	const handleModeSelect = useCallback(
		(selection: ChatModeSelection) => {
			setChatMode(selection.mode);
			if (selection.mode === "skill" && selection.skillId) {
				setSelectedSkillId(selection.skillId);
			}
			setModePanelOpen(false);
		},
		[setChatMode, setSelectedSkillId],
	);

	// Load skills once for slash command
	useEffect(() => {
		import("../services/skill/skillService").then(({ skillClient }) => {
			skillClient.listSkills().then(setSlashSkills).catch(() => setSlashSkills([]));
		});
	}, []);

	// Filtered skill list for slash command
	const slashFilteredSkills = useMemo(() => {
		if (!slashPanelOpen) return [];
		return slashSkills.filter((s) => {
			if (!slashQuery) return true;
			const q = slashQuery.toLowerCase();
			return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
		});
	}, [slashPanelOpen, slashSkills, slashQuery]);

	// Reset highlight when query changes
	useEffect(() => {
		setSlashHighlight(0);
	}, [slashQuery]);

	// Slash command skill selection
	const handleSlashSelect = useCallback(
		(skillId: string, _skillName: string) => {
			setChatMode("skill");
			setSelectedSkillId(skillId);
			setInput("");
			setSlashPanelOpen(false);
			setSlashQuery("");
		},
		[setChatMode, setSelectedSkillId, setInput],
	);

	// Use refs so the native capture listener always sees fresh values
	const slashStateRef = useRef({ open: false, skills: [] as typeof slashFilteredSkills, highlight: 0 });
	slashStateRef.current = { open: slashPanelOpen, skills: slashFilteredSkills, highlight: slashHighlight };

	// Native capture-phase keydown: fires before Sender's internal handlers
	useEffect(() => {
		const el = senderWrapperRef.current;
		if (!el) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			const { open, skills, highlight } = slashStateRef.current;
			if (!open) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setSlashHighlight(highlight < skills.length - 1 ? highlight + 1 : 0);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setSlashHighlight(highlight > 0 ? highlight - 1 : skills.length - 1);
			} else if (e.key === "Enter") {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (skills.length > 0) {
					const skill = skills[highlight];
					handleSlashSelect(skill.id, skill.name);
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setSlashPanelOpen(false);
				setSlashQuery("");
			}
		};

		el.addEventListener("keydown", handleKeyDown, true);
		return () => el.removeEventListener("keydown", handleKeyDown, true);
	}, [handleSlashSelect]);

	// Suggestion prompts for the welcome screen
	const suggestionItems = useMemo(
		() => [
			{
				key: "quantum",
				icon: <BulbOutlined style={{ color: "#7c3aed" }} />,
				label: t("suggestions.quantum", {
					ns: "chat",
					defaultValue: "Explain quantum computing in simple terms",
				}),
			},
			{
				key: "fibonacci",
				icon: <CodeOutlined style={{ color: "#2563eb" }} />,
				label: t("suggestions.fibonacci", {
					ns: "chat",
					defaultValue: "Write a Python function to calculate fibonacci",
				}),
			},
			{
				key: "debug",
				icon: <ToolOutlined style={{ color: "#dc2626" }} />,
				label: t("suggestions.debug", {
					ns: "chat",
					defaultValue: "Help me debug this error in my code",
				}),
			},
			{
				key: "marketing",
				icon: <FileTextOutlined style={{ color: "#16a34a" }} />,
				label: t("suggestions.marketing", {
					ns: "chat",
					defaultValue: "Create a marketing plan for a new product",
				}),
			},
		],
		[t],
	);

	const handlePromptClick = useCallback(
		(info: { data: { key: string; label?: React.ReactNode } }) => {
			const label = typeof info.data.label === "string" ? info.data.label : "";
			if (label) {
				setInput(label);
			}
		},
		[setInput],
	);

	// Handle toolbar item click
	const handleToolbarClick = useCallback(
		(itemId: string) => {
			switch (itemId) {
				case "doc":
					message.info(
						t("toolbar.docComingSoon", "文档功能即将推出", { ns: "chat" }),
					);
					break;
				default:
					message.info(t(`toolbar.${itemId}`, { ns: "chat" }));
					break;
			}
		},
		[t, message],
	);

	// Bookmark handlers (reused from MessageContextMenu)
	const { addBookmark, removeBookmark, getBookmarkByMessageId } =
		useMessageStore();

	const handleCopyMessage = useCallback(
		(content: string) => {
			navigator.clipboard.writeText(content);
			message.success(t("actions.copied", "已复制", { ns: "chat" }));
		},
		[message, t],
	);

	const handleDeleteMessage = useCallback(
		(messageId: string) => {
			deleteMessage(messageId);
			message.success(t("actions.deleted", "已删除", { ns: "chat" }));
		},
		[deleteMessage, message, t],
	);

	const handleExportMessage = useCallback(
		(msg: { id: string; content: string }) => {
			const blob = new Blob([msg.content], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `message-${msg.id}.txt`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			message.success(t("chat.messageExported", "消息已导出", { ns: "chat" }));
		},
		[message, t],
	);

	const handleToggleBookmark = useCallback(
		(msg: { id: string; role: string; content: string; timestamp: number }) => {
			const bm = getBookmarkByMessageId(msg.id);
			if (bm) {
				removeBookmark(bm.id);
				message.success(
					t("chat.bookmarkRemoved", "已取消收藏", { ns: "chat" }),
				);
			} else if (msg.role === "user" || msg.role === "assistant") {
				addBookmark({
					messageId: msg.id,
					conversationId,
					content: msg.content,
					role: msg.role as "user" | "assistant",
					timestamp: msg.timestamp,
				});
				message.success(t("chat.bookmarkAdded", "已收藏消息", { ns: "chat" }));
			}
		},
		[
			addBookmark,
			removeBookmark,
			getBookmarkByMessageId,
			conversationId,
			message,
			t,
		],
	);

	// Bubble.List role config — avatars are rendered in per-message headers, not here
	const roles = useMemo(
		() => ({
			user: {
				placement: "end" as const,
				variant: "filled" as const,
				shape: "round" as const,
				rootClassName: "group",
				avatar: undefined as React.ReactNode,
				styles: {
					content: {
						background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
						color: "#fff",
						width: "fit-content",
						marginLeft: "auto",
						paddingInline: 10,
						borderRadius: 12,
					},
				},
			},
			ai: {
				placement: "start" as const,
				variant: "borderless" as const,
				shape: "round" as const,
				rootClassName: "group",
				avatar: undefined as React.ReactNode,
				styles: {
					content: {
						display: "inline-block",
					},
				},
			},
		}),
		[],
	);

	// Format timestamp for header display: MM/DD HH:mm
	const formatHeaderTime = useCallback((ts: number) => {
		const d = new Date(ts);
		const month = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		const hour = String(d.getHours()).padStart(2, "0");
		const minute = String(d.getMinutes()).padStart(2, "0");
		return `${month}/${day} ${hour}:${minute}`;
	}, []);

	// Convert messages to Bubble.List items
	const bubbleItems = useMemo(() => {
		return messages.flatMap((msg, idx) => {
			const isLast = idx === messages.length - 1;
			const isAssistant = msg.role === "assistant";
			const isTool = msg.role === "tool";
			const isUser = msg.role === "user";
			const isCurrentlyStreaming = isAssistant && isStreaming && isLast;
			const displayContent =
				isAssistant && isStreaming && isLast ? streamingContent : msg.content;

			// Skip empty assistant messages that aren't actively streaming
			// (e.g. placeholder created after tool_result but model hasn't responded yet)
			if (isAssistant && !displayContent && !isCurrentlyStreaming) {
				return [];
			}

			// Check if this AI message is a continuation after tool call(s)
			const prevMsg = idx > 0 ? messages[idx - 1] : null;
			const isContinuation = (isAssistant || isTool) && prevMsg != null && (prevMsg.role === "tool" || prevMsg.role === "assistant");

			const timeText = formatHeaderTime(msg.timestamp);

			// ── User header: label + avatar (right-aligned) + time below ──
			const userHeader = isUser ? (
				<div className="flex flex-col items-end gap-0.5 mb-1">
					<div className="flex items-center gap-2">
						<span
							style={{
								fontSize: 13,
								fontWeight: 500,
								color: token.colorText,
							}}
						>
							{t("chat.user", "用户", { ns: "chat" })}
						</span>
						<Avatar
							icon={<UserOutlined />}
							size={28}
							style={{
								background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
								color: "#fff",
							}}
						/>
					</div>
					<span
						style={{
							fontSize: 11,
							color: token.colorTextQuaternary,
						}}
					>
						{timeText}
					</span>
				</div>
			) : null;

			// ── AI header: avatar + model name (left-aligned) + time below ──
			const aiHeader = (() => {
				if (isUser || isContinuation) return null;
				const meta = msg.metadata;
				const preset = meta?.providerPreset as ModelProviderPreset | undefined;
				const avatarNode = preset ? (
					<ProviderIcon preset={preset} size={28} />
				) : (
					<Avatar
						icon={<RobotOutlined />}
						size={28}
						style={{
							background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
							color: "#fff",
						}}
					/>
				);
				const modelName = meta?.model;
				const providerName = meta?.providerName;

				return (
					<div className="flex flex-col gap-0.5 mb-1">
						<div className="flex items-center gap-2">
							{avatarNode}
							{modelName ? (
								<span
									style={{
										fontSize: 13,
										fontWeight: 500,
										color: token.colorText,
									}}
								>
									{modelName}
									{providerName && (
										<span
											style={{
												fontWeight: 400,
												color: token.colorTextTertiary,
											}}
										>
											{" "}| {providerName}
										</span>
									)}
								</span>
							) : (
								<span
									style={{
										fontSize: 13,
										fontWeight: 500,
										color: token.colorText,
									}}
								>
									AI
								</span>
							)}
						</div>
						<span
							style={{
								fontSize: 11,
								color: token.colorTextQuaternary,
								marginLeft: 36,
							}}
						>
							{timeText}
						</span>
					</div>
				);
			})();

			// Tool call messages — no header (part of same turn)
			if (isTool && msg.toolCall) {
				return [{
					key: msg.id || `msg-${idx}`,
					role: "ai" as const,
					content: "",
					contentRender: () => <ToolCallCard toolCall={msg.toolCall!} />,
					variant: "borderless" as const,
				}];
			}

			return [{
				key: msg.id || `msg-${idx}`,
				role: isUser ? ("user" as const) : ("ai" as const),
				content: displayContent || "",
				loading: isCurrentlyStreaming && !displayContent,
				typing: isCurrentlyStreaming
					? { effect: "fade-in" as const, step: 5, interval: 50 }
					: undefined,
				header: isUser ? userHeader : aiHeader,
				contentRender: () => {
					if (!displayContent) return null;
					return (
						<MessageContextMenu
							message={msg}
							conversationId={conversationId}
							onDelete={() => {
								message.info(
									t("chat.messageDeleteNotImplemented", "消息删除功能待实现", {
										ns: "chat",
									}),
								);
							}}
						>
							<div className={isUser ? "user-bubble-content" : undefined}>
								<Markdown
									content={displayContent}
									streaming={isCurrentlyStreaming}
								/>
							</div>
						</MessageContextMenu>
					);
				},
				footer: (() => {
					const meta = msg.metadata;
					const isAssistantMsg = msg.role === "assistant";
					const isUserMsg = msg.role === "user";

					// Build tooltip content for hover
					const tooltipLines: string[] = [];
					if (isAssistantMsg) {
						if (meta?.firstTokenMs != null) {
							tooltipLines.push(
								`${t("chat.metrics.firstToken", "首字时延", { ns: "chat" })} ${meta.firstTokenMs} ms`,
							);
						}
						if (meta?.tokensPerSecond != null) {
							tooltipLines.push(
								`${t("chat.metrics.speed", "每秒", { ns: "chat" })} ${meta.tokensPerSecond} tokens`,
							);
						}
						if (meta?.tokens != null) {
							const parts = [`Tokens: ${meta.tokens}`];
							if (meta.inputTokens != null) parts.push(`↑${meta.inputTokens}`);
							if (meta.outputTokens != null)
								parts.push(`↓${meta.outputTokens}`);
							tooltipLines.push(parts.join(" "));
						}
					} else if (meta?.inputTokens != null) {
						tooltipLines.push(`Tokens: ↑${meta.inputTokens}`);
					}

					// Token display text
					let tokenText = "";
					if (
						isAssistantMsg &&
						meta?.inputTokens != null &&
						meta?.outputTokens != null
					) {
						tokenText = `↑${meta.inputTokens} ↓${meta.outputTokens}`;
					} else if (meta?.inputTokens != null) {
						tokenText = `↑${meta.inputTokens}`;
					} else if (meta?.tokens != null) {
						tokenText = `${meta.tokens} tokens`;
					}

					// Token info element (no time — already in header)
					const tokenInfo = (
						<div className="flex items-center gap-1.5">
							{isBookmarked(msg.id) && (
								<StarFilled className="text-yellow-500 text-xs" />
							)}
							{tokenText && (
								<span
									className="text-xs"
									style={{ color: token.colorTextQuaternary }}
								>
									{tokenText}
								</span>
							)}
						</div>
					);

					const tokenInfoWithTooltip =
						tooltipLines.length > 0 ? (
							<Tooltip
								title={tooltipLines.map((line, i) => <div key={i}>{line}</div>)}
							>
								{tokenInfo}
							</Tooltip>
						) : (
							tokenInfo
						);

					// Action buttons (appear on hover)
					const actionBtnStyle = { color: token.colorTextTertiary };

					// More dropdown items for assistant messages
					const moreMenuItems = isAssistantMsg
						? [
							{
								key: "bookmark",
								icon: isBookmarked(msg.id) ? (
									<StarFilled className="text-yellow-500" />
								) : (
									<StarOutlined />
								),
								label: isBookmarked(msg.id)
									? t("chat.removeBookmark", "取消收藏", { ns: "chat" })
									: t("actions.bookmark", "收藏", { ns: "chat" }),
								onClick: () => handleToggleBookmark(msg),
							},
							{
								key: "export",
								icon: <DownloadOutlined />,
								label: t("actions.export", "导出", { ns: "chat" }),
								onClick: () => handleExportMessage(msg),
							},
						]
						: [];

					const actionButtons = (
						<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
							{isUserMsg && (
								<>
									<Tooltip title={t("actions.retry", "重试", { ns: "chat" })}>
										<Button
											type="text"
											size="small"
											icon={<ReloadOutlined />}
											style={actionBtnStyle}
											onClick={() => retryMessage(msg.id)}
										/>
									</Tooltip>
									<Tooltip title={t("actions.edit", "编辑", { ns: "chat" })}>
										<Button
											type="text"
											size="small"
											icon={<EditOutlined />}
											style={actionBtnStyle}
											onClick={() => editMessage(msg.id)}
										/>
									</Tooltip>
									<Tooltip title={t("actions.copy", "复制", { ns: "chat" })}>
										<Button
											type="text"
											size="small"
											icon={<CopyOutlined />}
											style={actionBtnStyle}
											onClick={() => handleCopyMessage(msg.content)}
										/>
									</Tooltip>
									<Tooltip title={t("actions.delete", "删除", { ns: "chat" })}>
										<Button
											type="text"
											size="small"
											icon={<DeleteOutlined />}
											style={actionBtnStyle}
											onClick={() => handleDeleteMessage(msg.id)}
										/>
									</Tooltip>
								</>
							)}
							{isAssistantMsg && (
								<>
									<Tooltip title={t("actions.copy", "复制", { ns: "chat" })}>
										<Button
											type="text"
											size="small"
											icon={<CopyOutlined />}
											style={actionBtnStyle}
											onClick={() => handleCopyMessage(msg.content)}
										/>
									</Tooltip>
									<Tooltip
										title={t("actions.regenerate", "重新生成", { ns: "chat" })}
									>
										<Button
											type="text"
											size="small"
											icon={<ReloadOutlined />}
											style={actionBtnStyle}
											onClick={() => retryMessage(msg.id)}
										/>
									</Tooltip>
									<Tooltip title={t("actions.delete", "删除", { ns: "chat" })}>
										<Button
											type="text"
											size="small"
											icon={<DeleteOutlined />}
											style={actionBtnStyle}
											onClick={() => handleDeleteMessage(msg.id)}
										/>
									</Tooltip>
									<Dropdown menu={{ items: moreMenuItems }} trigger={["click"]}>
										<Button
											type="text"
											size="small"
											icon={<MoreOutlined />}
											style={actionBtnStyle}
										/>
									</Dropdown>
								</>
							)}
						</div>
					);

					// Layout: user messages have actions on left, info on right
					// Assistant messages have info on left, actions on right
					if (isUserMsg) {
						return (
							<div className="flex items-center justify-end gap-2">
								{actionButtons}
								{tokenInfoWithTooltip}
							</div>
						);
					}

					return (
						<div className="flex items-center gap-2">
							{tokenInfoWithTooltip}
							{actionButtons}
						</div>
					);
				})(),
			}];
		});
	}, [
		messages,
		isStreaming,
		streamingContent,
		conversationId,
		isBookmarked,
		message,
		t,
		token.colorText,
		token.colorTextTertiary,
		token.colorTextQuaternary,
		formatHeaderTime,
		retryMessage,
		editMessage,
		handleCopyMessage,
		handleDeleteMessage,
		handleToggleBookmark,
		handleExportMessage,
	]);

	return (
		<MainLayout>
			<div className="flex h-full">
				{/* Chat History Drawer */}
				<ChatSidebar
					open={sidebarOpen}
					onClose={() => setSidebarOpen(false)}
					onNewChat={handleNewChat}
				/>

				{/* Main Chat Area */}
				<div
					className="flex flex-col flex-1 h-full min-w-0"
					style={{ backgroundColor: token.colorBgLayout }}
				>
					{/* Chat Area */}
					<div className="flex-1 overflow-hidden w-full px-4 sm:px-6">
					{messages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full w-full px-4 sm:px-6">
							<Welcome
								icon={
									<div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-2xl">
										<StarOutlined className="text-2xl sm:text-3xl text-white" />
									</div>
								}
								title={t("welcomeTitle", { ns: "chat" })}
								description={t("welcomeSubtitle", {
									ns: "chat",
								})}
								variant="borderless"
								styles={{
									title: {
										fontSize: "1.75rem",
										fontWeight: 700,
									},
									description: {
										color: token.colorTextSecondary,
										fontSize: "1rem",
									},
								}}
							/>
							{/* Model selector prompt when no model is active */}
							{!hasActiveModel && !isModelLoading && (
								<ModelSelectPrompt
									token={token}
									t={t}
									getAllEnabledModels={getAllEnabledModels}
									setActiveModel={setActiveModel}
									navigate={navigate}
									messageApi={message}
								/>
							)}
							{hasActiveModel && (
								<div className="mt-6">
									<Prompts
										items={suggestionItems}
										onItemClick={handlePromptClick}
										wrap
										styles={{
											item: {
												flex: "1 1 calc(50% - 8px)",
												minWidth: 200,
											},
										}}
									/>
								</div>
							)}
						</div>
					) : (
						<Bubble.List
							ref={bubbleListRef}
							items={bubbleItems}
							role={roles}
							autoScroll
							className="h-full"
							styles={{
								content: {
									maxWidth: "56rem",
									margin: "0 auto",
									padding: "2rem 1.5rem",
								},
							}}
						/>
					)}
				</div>

				{/* Input Area */}
				<div className="px-6 py-4">
					<div ref={senderWrapperRef} className="relative w-full mx-auto max-w-4xl">
						{/* Chat Mode Panel */}
						{modePanelOpen && (
							<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
								<ChatModePanel
									chatMode={chatMode}
									selectedSkillId={selectedSkillId}
									onSelect={handleModeSelect}
									onClose={() => setModePanelOpen(false)}
								/>
							</div>
						)}

						{/* Slash Command Panel */}
						{slashPanelOpen && (
							<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
								<SlashCommandPanel
									skills={slashFilteredSkills}
									highlightIndex={slashHighlight}
									onSelect={handleSlashSelect}
									onHighlightChange={setSlashHighlight}
									onClose={() => {
										setSlashPanelOpen(false);
										setSlashQuery("");
									}}
								/>
							</div>
						)}

						{/* Search Engine Panel */}
						{searchPopoverOpen && (
							<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
								<SearchEnginePanel
									selectedEngine={selectedEngine}
									onSelectEngine={setSelectedEngine}
									onClose={() => setSearchPopoverOpen(false)}
								/>
							</div>
						)}

						{/* Attached files preview */}
						{attachedFiles.length > 0 && (
							<div className="mb-2">
								<AttachmentList
									attachments={attachedFiles}
									onRemove={(id) =>
										setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
									}
								/>
							</div>
						)}

						{/* Sender component */}
						<Sender
							value={input}
							onChange={(val) => {
								setInput(val);
								if (val.startsWith("/")) {
									setSlashPanelOpen(true);
									setSlashQuery(val.slice(1));
								} else if (slashPanelOpen) {
									setSlashPanelOpen(false);
									setSlashQuery("");
								}
							}}
							onSubmit={handleSend}
							onCancel={isStreaming ? stopCurrentStream : undefined}
							loading={isStreaming}
							placeholder={t(
								"chat.placeholder",
								"在这里输入消息，按 Enter 发送",
							)}
							onKeyDown={(e) => {
								const { getShortcut } = useShortcutStore.getState();
								const sendShortcut = getShortcut("send-message");
								const newLineShortcut = getShortcut("new-line");
								const pressed = normalizeShortcut(
									getShortcutFromEvent(e.nativeEvent),
								);

								if (
									newLineShortcut?.enabled &&
									normalizeShortcut(newLineShortcut.currentKey) === pressed
								) {
									return;
								}

								if (
									sendShortcut?.enabled &&
									normalizeShortcut(sendShortcut.currentKey) === pressed
								) {
									e.preventDefault();
									handleSend(input);
									return false;
								}
							}}
							autoSize={{ minRows: 2, maxRows: 6 }}
							// Hide the default send button from the right side of textarea
							suffix={() => null}
							// Toolbar below textarea: render function to access built-in SendButton
							footer={(_footerNode, { components }) => {
								const { SendButton } = components;
								return (
									<Flex justify="space-between" align="center">
										<Flex align="center" gap={4}>
											{/* Mode selector */}
											<Tooltip
												title={t("chatMode.switchMode", "切换模式", { ns: "chat" })}
											>
												<Button
													type="text"
													size="small"
													icon={chatMode === "skill" ? <ThunderboltOutlined /> : <RobotOutlined />}
													onClick={() => {
														setModePanelOpen(!modePanelOpen);
														if (searchPopoverOpen) setSearchPopoverOpen(false);
													}}
													style={
														modePanelOpen
															? { backgroundColor: token.colorBgTextHover }
															: undefined
													}
												>
													<span className="text-xs">
														{t(`chatMode.${chatMode}`, { ns: "chat" })}
													</span>
												</Button>
											</Tooltip>

											<div
												className="w-px h-3 opacity-25"
												style={{
													backgroundColor: token.colorBorder,
												}}
											/>

											{/* File upload */}
											<FileUploadButton
												onUploadComplete={(attachments) => {
													setAttachedFiles((prev) => [...prev, ...attachments]);
												}}
												conversationId={conversationId}
											/>

											{/* Primary toolbar items */}
											{PRIMARY_TOOLBAR_ITEMS.map((item) => (
												<Tooltip
													key={item.id}
													title={t(item.label, {
														ns: "chat",
													})}
												>
													<Button
														type="text"
														size="small"
														icon={item.icon}
														onClick={() => handleToolbarClick(item.id)}
													/>
												</Tooltip>
											))}

											{/* Search engine - only show when engines are configured */}
											{hasSearchEngines && (
												<Tooltip
													title={t("chat.toolbar.search", "搜索", { ns: "chat" })}
												>
													<Button
														type="text"
														size="small"
														icon={currentEngine?.icon ?? <SearchOutlined />}
														onClick={() =>
															setSearchPopoverOpen(!searchPopoverOpen)
														}
														style={
															searchPopoverOpen
																? {
																	backgroundColor: token.colorBgTextHover,
																}
																: undefined
														}
													/>
												</Tooltip>
											)}

											{/* Extra items - visible when expanded */}
											{toolbarExpanded && (
												<>
													<div
														className="w-px h-3 opacity-25"
														style={{
															backgroundColor: token.colorBorder,
														}}
													/>
													{EXTRA_TOOLBAR_ITEMS.map((item) => (
														<Tooltip
															key={item.id}
															title={t(item.label, {
																ns: "chat",
															})}
														>
															<Button
																type="text"
																size="small"
																icon={item.icon}
																onClick={() => handleToolbarClick(item.id)}
															/>
														</Tooltip>
													))}
												</>
											)}

											<div
												className="w-px h-3 opacity-25"
												style={{
													backgroundColor: token.colorBorder,
												}}
											/>

											{/* More / Collapse toggle - always at the end */}
											<Tooltip
												title={
													toolbarExpanded
														? t("toolbar.collapse", "收起", {
															ns: "chat",
														})
														: t("toolbar.more", "更多", {
															ns: "chat",
														})
												}
											>
												<Button
													type="text"
													size="small"
													icon={
														toolbarExpanded ? (
															<LeftOutlined />
														) : (
															<RightOutlined />
														)
													}
													onClick={() => setToolbarExpanded((prev) => !prev)}
												/>
											</Tooltip>
										</Flex>

										{/* Session model selector + status + send */}
									<Flex align="center" gap={8}>
										<Select
											size="small"
											variant="borderless"
											value={
												sessionModelOverride
													? `${sessionModelOverride.providerId}||${sessionModelOverride.modelId}`
													: activeSelection
														? `${activeSelection.providerId}||${activeSelection.modelId}`
														: undefined
											}
											onChange={(val) => {
												if (!val) {
													setSessionModelOverride(null);
													return;
												}
												const [providerId, modelId] = val.split("||");
												setSessionModelOverride({ providerId, modelId });
											}}
											options={groupedModelOptions}
											popupMatchSelectWidth={false}
											disabled={isStreaming}
											style={{
												maxWidth: 200,
												...(sessionModelOverride ? { background: token.colorPrimaryBg, borderRadius: 6 } : {}),
											}}
											placeholder={t("selectModel", "选择模型", { ns: "chat" })}
										/>
										{sessionStatus !== "idle" && (
											<span
												className="text-xs whitespace-nowrap"
												style={{ color: token.colorTextSecondary }}
											>
												{t(`sessionStatus.${sessionStatus}`, { ns: "chat" })}
											</span>
										)}
										{/* Send or Stop button */}
										{isStreaming ? (
											<Tooltip title={t("actions.stop", "终止", { ns: "chat" })}>
												<Button
													type="primary"
													danger
													shape="circle"
													icon={<PauseCircleOutlined />}
													onClick={stopCurrentStream}
												/>
											</Tooltip>
										) : (
											<SendButton type="primary" shape="circle" />
										)}
									</Flex>
									</Flex>
								);
							}}
							styles={{
								input: { fontSize: 14 },
							}}
						/>
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
					message.info(
						`${t("chat.jumpToMessage", "跳转到消息", { ns: "chat" })}: ${messageId}`,
					);
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
