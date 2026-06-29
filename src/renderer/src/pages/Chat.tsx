import { FolderOpenOutlined } from "@ant-design/icons";
import { Alert, App, Button, Spin, theme } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatInputArea } from "../components/chat/ChatInputArea";
import { ChatMessageList } from "../components/chat/ChatMessageList";
import { ChatModals } from "../components/chat/ChatModals";
import { CodexEnvironmentInspector } from "../components/chat/CodexEnvironmentInspector";
import { ChatModelPicker } from "../components/chat/ChatModelPicker";
import { ChatNewSession } from "../components/chat/ChatNewSession";
import { ChatWelcomeScreen } from "../components/chat/ChatWelcomeScreen";
import { ClaudeEmptyChatHome } from "../components/chat/ClaudeEmptyChatHome";
import { RemoteChatPane } from "../components/chat/RemoteChatPane";
import { useSearchEngine } from "../components/chat/SearchEnginePanel";
import { MainLayout } from "../components/layout/MainLayout";
import { useChat } from "../hooks/useChat";
import { useChatPageState } from "../hooks/useChatPageState";
import { useEffectiveInteractionProfile } from "../hooks/useEffectiveInteractionProfile";
import { useRemoteChat } from "../hooks/useRemoteChat";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { useAtMentions } from "../hooks/useAtMentions";

import { useModelStore } from "../stores/modelStore";
import { useChatStore } from "../stores/chatStore";
import { useChatInputStore } from "../stores/chatInputStore";
import { useChatMessageStore } from "../stores/chatMessageStore";
import { useFeatureFlagsStore } from "../stores/featureFlagsStore";
import { useInspectorPanelStore } from "../stores/inspectorPanelStore";
import { useFileArtifactStore } from "../stores/fileArtifactStore";
import { useProjectStore } from "../stores/projectStore";

const { useToken } = theme;

const Chat: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const { message } = App.useApp();

	const {
		messages,
		sendMessage,
		isStreaming,
		stopCurrentStream,
		retryMessage,
		editMessage,
		deleteMessage,
		selectedSkillId,
		setSelectedSkillId,
		selectedCommandName,
		setSelectedCommandName,
		sessionModelOverride,
		setSessionModelOverride,
		sessionSettings,
		setSessionSettings,
		respondToApproval,
		availableTools,
	} = useChat();

	// Search engine state
	const {
		selectedEngine,
		setSelectedEngine,
		currentEngine,
		searchConfigs,
		hasSearchEngines,
	} = useSearchEngine();

	// Model state
	const isModelLoading = useModelStore((s) => s.isLoading);
	const hasActiveModel = !!useModelStore((s) => s.getActiveProviderModel)();

	// Conversation loading state — set by `chatStore.switchConversation` while
	// reading historical messages from disk. Drives the centered spinner
	// below; otherwise an empty `messages` array would route to the welcome
	// screen mid-load, which feels like nothing is happening.
	const isLoadingMessages = useChatMessageStore((s) => s.isLoadingMessages);

	// Remote chat bridge
	const {
		binding: remoteBinding,
		remoteMessages,
		bindToBot,
		unbind: unbindRemote,
		checkBotOnline,
		sendRemoteMessage,
	} = useRemoteChat();

	// Page-level state (sidebar, dialogs, conversations, workspace, etc.)
	const pageState = useChatPageState({
		messages,
		sendMessage,
		setSelectedSkillId,
		setSessionSettings,
		remoteBinding,
		remoteMessages,
		checkBotOnline,
		unbindRemote,
	});

	// Effective interactionProfile for the current conversation.
	// Drives the data-interaction-profile attribute on the page wrapper so
	// CSS in `styles/interaction-profile.css` can differentiate density.
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);
	const currentProjectId = useProjectStore((s) => s.currentProjectId);
	const interactionProfile = useEffectiveInteractionProfile();

	// Codex Environment Inspector visibility:
	//   - codex profile: always show.
	//   - hybrid profile: show when there is "content to inspect"
	//     (artifacts present OR a tool is running OR planMode != "chat").
	//   - claude-code: never show.
	// Read the raw map via selector (stable ref) and derive the per-conversation
	// list with useMemo. Selector must NOT build a new array each render — that
	// breaks zustand's strict-equal short-circuit and infinite-loops.
	const artifactsMap = useFileArtifactStore((s) => s.artifacts);
	const inspectorArtifacts = useMemo(() => {
		const cid = pageState.currentConversationId;
		return cid ? (artifactsMap[cid] ?? []) : [];
	}, [artifactsMap, pageState.currentConversationId]);
	const sessionPlanMode = currentConversation?.session?.planMode;
	// §22 rollback flags: fileArtifacts=false 时强制隐藏 inspector；
	// profileLayouts=false 时把 hybrid/claude 一并视为 codex（永远显示）。
	const fileArtifactsEnabled = useFeatureFlagsStore((s) => s.fileArtifacts);
	const profileLayoutsEnabled = useFeatureFlagsStore((s) => s.profileLayouts);
	// 用户对面板的手动开关（持久化）。默认 true —— 对话时默认展示。
	// 由 TitleBar 上的环境检视按钮切换。
	//
	// 语义（修订）：
	//   - feature flag fileArtifacts=false → 强制隐藏
	//   - 用户手动 isOpen=true → 一律展示，覆盖所有 profile 的"无内容自动收"逻辑
	//     （之前 hybrid 在 idle + 无 artifact + chat 模式时会自动收起，跟用户
	//     从 TitleBar 显式打开的语义冲突 —— 用户点开了却看不到面板。）
	//   - 用户手动 isOpen=false → 一律隐藏
	//   - claude-code profile：默认不显示（与原行为一致，需要 profileLayouts flag）
	const inspectorUserOpen = useInspectorPanelStore((s) => s.isOpen);
	const showInspector = useMemo(() => {
		if (!fileArtifactsEnabled) return false;
		if (!inspectorUserOpen) return false;
		// 欢迎页（未选中任何对话）→ 不展示。面板内容（变更/分支/来源）都依赖
		// 具体会话上下文，没有 conversation 时全是空状态，纯属占地方。
		if (!pageState.currentConversationId) return false;
		// profileLayouts flag 关闭时，把所有 profile 视为 codex（永远显示）
		if (!profileLayoutsEnabled) return true;
		// claude-code profile 保持"默认不展示"语义：仅在有 artifact / 流式中 / 非
		// chat planMode 时显示。其他 profile（codex / hybrid）尊重用户开关。
		if (interactionProfile === "claude-code") {
			if (inspectorArtifacts.length > 0) return true;
			if (isStreaming) return true;
			if (sessionPlanMode && sessionPlanMode !== "chat") return true;
			return false;
		}
		return true;
	}, [
		fileArtifactsEnabled,
		inspectorUserOpen,
		pageState.currentConversationId,
		profileLayoutsEnabled,
		interactionProfile,
		inspectorArtifacts.length,
		isStreaming,
		sessionPlanMode,
	]);

	// Slash commands
	const slash = useSlashCommands({
		setSelectedSkillId,
		setSelectedCommandName,
	});

	// "@" file-mention panel. Selection is handled inside the host composer
	// (ChatInputArea / ClaudeEmptyChatHome) where the textarea caret is
	// reachable, so the hook just exposes panel state + keydown plumbing.
	const mention = useAtMentions({
		sessionId: pageState.currentConversationId,
		isSlashOpen: slash.slashPanelOpen,
	});

	// ── Send handler (AI chat) ──
	const handleSend = useCallback(
		async (value: string, attachmentIds?: string[]) => {
			// Safety guard: prevent send when slash command panel is open
			if (slash.slashStateRef.current.open) return;
			if (value.trim() && !isStreaming) {
				const state = useChatStore.getState();
				if (!state.currentConversationId) {
					await state.createConversation(value.trim().slice(0, 50), "agent", {
						workspaceId: currentProjectId ?? undefined,
					});
				}
				// Mirror the typed value into the shared composer store so that
				// `sendMessage` (which snapshots `chatInputStore.getState().value`
				// when `content` isn't passed) and any post-send UI stays in sync.
				// `sendMessage` itself calls `.clear()` once it has consumed it.
				useChatInputStore.getState().setValue(value);
				sendMessage({
					mode: "agent",
					content: value,
					// Skill is independent of mode — always pass through
					skillId: selectedSkillId ?? undefined,
					commandName: selectedCommandName ?? undefined,
					searchEngine: selectedEngine || undefined,
					searchConfigs: searchConfigs,
					attachmentIds,
				});
			}
		},
		[
			isStreaming,
			sendMessage,
			currentProjectId,
			selectedSkillId,
			selectedCommandName,
			selectedEngine,
			searchConfigs,
			slash.slashStateRef,
		],
	);

	// ── Send handler (remote IM — routes to sendRemoteMessage) ──
	const handleRemoteSend = useCallback(
		(value: string) => {
			if (value.trim()) {
				sendRemoteMessage(value.trim());
				// Reset the shared composer store after routing to IM.
				useChatInputStore.getState().clear();
			}
		},
		[sendRemoteMessage],
	);

	// ── Skill clear ──
	const handleClearSkill = useCallback(() => {
		setSelectedSkillId(null);
		setSelectedCommandName(null);
	}, [setSelectedSkillId, setSelectedCommandName]);

	// ── Remote bind handler ──
	// R-7 / §25.3: remote conversations are now created via NewConversationModal
	// (TitleBar 新建对话…) which calls chatStore.createConversationAdvanced and
	// binds the remote in one step. The local-then-bind flow this comment used to
	// describe is no longer reachable from any live UI surface.
	const handleRemoteBind = useCallback(
		async (botId: string, chatId: string) => {
			try {
				await bindToBot(botId, chatId);
				message.success(
					t("remoteChat.bindSuccess", "Bot bound successfully", {
						ns: "chat",
					}),
				);
				pageState.setSidebarTab("remote");
				pageState.setViewMode("remote");
			} catch (err) {
				message.error(
					`${t("remoteChat.bindFailed", "Bind failed", { ns: "chat" })}: ${err instanceof Error ? err.message : String(err)}`,
				);
				throw err;
			}
		},
		[bindToBot, message, t, pageState.setSidebarTab, pageState.setViewMode],
	);

	// ── Model value for settings ──
	const modelValue = sessionModelOverride
		? `${sessionModelOverride.providerId}||${sessionModelOverride.modelId}`
		: pageState.activeSelection
			? `${pageState.activeSelection.providerId}||${pageState.activeSelection.modelId}`
			: undefined;

	const handleModelChange = useCallback(
		(val: string) => {
			if (!val) {
				setSessionModelOverride(null);
				return;
			}
			const [providerId, modelId] = val.split("||");
			setSessionModelOverride({ providerId, modelId });
		},
		[setSessionModelOverride],
	);

	// ── Model switcher (Cmd/Ctrl+M, or chip click via window event) ──
	const [modelSwitcherOpen, setModelSwitcherOpen] = useState(false);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && (e.key === "m" || e.key === "M") && !e.shiftKey && !e.altKey) {
				e.preventDefault();
				setModelSwitcherOpen((prev) => !prev);
			}
		};
		const onOpen = () => setModelSwitcherOpen(true);
		window.addEventListener("keydown", onKey);
		window.addEventListener("chat:open-model-switcher", onOpen);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("chat:open-model-switcher", onOpen);
		};
	}, []);

	// ── Session settings opener (triggered from TitleBar more menu) ──
	useEffect(() => {
		const onOpenSessionSettings = () => pageState.setSettingsOpen(true);
		window.addEventListener(
			"chat:open-session-settings",
			onOpenSessionSettings,
		);
		return () => {
			window.removeEventListener(
				"chat:open-session-settings",
				onOpenSessionSettings,
			);
		};
	}, [pageState.setSettingsOpen]);

	// ── Export dialog opener (triggered from TitleBar more menu) ──
	useEffect(() => {
		const onOpenExport = () => pageState.setIsExportOpen(true);
		window.addEventListener("chat:open-export", onOpenExport);
		return () => {
			window.removeEventListener("chat:open-export", onOpenExport);
		};
	}, [pageState.setIsExportOpen]);

	return (
		<MainLayout>
			<div
				className="flex h-full"
				data-interaction-profile={interactionProfile}
			>
				{/* Main Chat Area */}
				<div className="flex flex-col flex-1 h-full min-w-0">
					<div
						className="flex flex-col h-full min-w-0"
						style={{ backgroundColor: token.colorBgContainer }}
					>
						{pageState.viewMode === "local" ? (
							<>
								{/* Session tip — only when there are messages */}
								{messages.length > 0 && (
									<div className="px-4 sm:px-6 pt-2 shrink-0">
										<Alert
											type="info"
											title={
												<span className="text-xs flex items-center gap-2 flex-wrap">
													<span>
														{t("sessionTip", "Type / to invoke skills", {
															ns: "chat",
														})}
													</span>
													{pageState.workspaceDir && (
														<Button
															type="text"
															size="small"
															icon={<FolderOpenOutlined />}
															style={{ color: token.colorPrimary }}
															onClick={pageState.handleOpenWorkspace}
														>
															{t("workspace", "Workspace", { ns: "chat" })}
														</Button>
													)}
												</span>
											}
										/>
									</div>
								)}

								{/* Chat Area */}
								<div className="chat-message-area flex-1 overflow-hidden w-full px-4 sm:px-6">
									{!pageState.currentConversationId ? (
										<ChatNewSession />
									) : isLoadingMessages ? (
										// Take priority over the empty-state welcome: while a
										// session's history is being read, show a centered
										// spinner instead of bouncing through the welcome page.
										// Lay out spinner + label in a flex column (rather than
										// using Spin's `tip` slot) so the text gets the full
										// available width and renders on one line.
										<div className="flex flex-col items-center justify-center h-full w-full gap-3">
											<Spin size="large" />
											<div
												className="text-sm"
												style={{ color: token.colorTextSecondary }}
											>
												{t("loadingConversation", "正在加载对话...", {
													ns: "chat",
												})}
											</div>
										</div>
									) : messages.length === 0 ? (
										profileLayoutsEnabled &&
										(interactionProfile === "claude-code" ||
											interactionProfile === "hybrid") ? (
											<ClaudeEmptyChatHome
												onSend={(text, attachmentIds) => {
													void handleSend(text, attachmentIds);
												}}
												isStreaming={isStreaming}
												slashPanelOpen={slash.slashPanelOpen}
												slashFilteredItems={slash.slashFilteredItems}
												slashHighlight={slash.slashHighlight}
												onSlashHighlightChange={slash.setSlashHighlight}
												onSlashSelect={slash.handleSlashSelect}
												onSlashPanelClose={() => {
													slash.setSlashPanelOpen(false);
													slash.setSlashQuery("");
												}}
												onSlashInputChange={slash.handleSlashInputChange}
												registerKeydownHandler={slash.registerKeydownHandler}
												mentionPanelOpen={mention.mentionPanelOpen}
												mentionFilteredItems={mention.mentionFilteredItems}
												mentionHighlight={mention.mentionHighlight}
												onMentionHighlightChange={mention.setMentionHighlight}
												onMentionPanelClose={mention.closeMentionPanel}
												onMentionInputChange={mention.handleMentionInputChange}
												registerMentionKeydownHandler={
													mention.registerKeydownHandler
												}
												setMentionSelectHandler={mention.setSelectHandler}
											/>
										) : (
											<ChatWelcomeScreen
												hasActiveModel={hasActiveModel}
												isModelLoading={isModelLoading}
												messageApi={message}
											/>
										)
									) : (
										<ChatMessageList
											messages={messages}
											isStreaming={isStreaming}
											conversationId={pageState.conversationId}
											bubbleListRef={pageState.bubbleListRef}
											retryMessage={retryMessage}
											editMessage={editMessage}
											deleteMessage={deleteMessage}
											respondToApproval={respondToApproval}
										/>
									)}
								</div>

								{/* Input Area — hidden when no conversation (app-level empty state)
                    or when Claude empty home owns the centered composer. */}
								{pageState.currentConversationId &&
									!(
										messages.length === 0 &&
										(interactionProfile === "claude-code" ||
											interactionProfile === "hybrid")
									) && (
										<ChatInputArea
											onSend={handleSend}
											isStreaming={isStreaming}
											onStopStream={stopCurrentStream}
											selectedSkillId={selectedSkillId}
											onClearSkill={handleClearSkill}
											selectedEngine={selectedEngine}
											onSelectEngine={setSelectedEngine}
											hasSearchEngines={hasSearchEngines}
											currentEngine={currentEngine}
											conversationId={pageState.conversationId}
											slashPanelOpen={slash.slashPanelOpen}
											slashFilteredItems={slash.slashFilteredItems}
											slashHighlight={slash.slashHighlight}
											onSlashHighlightChange={slash.setSlashHighlight}
											onSlashSelect={slash.handleSlashSelect}
											onSlashPanelClose={() => {
												slash.setSlashPanelOpen(false);
												slash.setSlashQuery("");
											}}
											onSlashInputChange={slash.handleSlashInputChange}
											registerKeydownHandler={slash.registerKeydownHandler}
											mentionPanelOpen={mention.mentionPanelOpen}
											mentionFilteredItems={mention.mentionFilteredItems}
											mentionHighlight={mention.mentionHighlight}
											onMentionHighlightChange={mention.setMentionHighlight}
											onMentionPanelClose={mention.closeMentionPanel}
											onMentionInputChange={mention.handleMentionInputChange}
											registerMentionKeydownHandler={
												mention.registerKeydownHandler
											}
											setMentionSelectHandler={mention.setSelectHandler}
											respondToApproval={respondToApproval}
										/>
									)}
							</>
						) : (
							<>
								{/* Remote IM View — header + messages from RemoteChatPane, input from ChatInputArea */}
								<RemoteChatPane
									binding={remoteBinding}
									remoteMessages={remoteMessages}
									onSendMessage={sendRemoteMessage}
									onBind={() => pageState.setRemoteBindModalOpen(true)}
									onUnbind={pageState.handleUnbindRemote}
									botOnline={pageState.remoteBotOnline}
									isBotChecking={pageState.remoteBotChecking}
									hideInput
								/>

								{/* Chat's own input — hideToolbar mode for IM */}
								<ChatInputArea
									onSend={handleRemoteSend}
									isStreaming={false}
									onStopStream={stopCurrentStream}
									selectedSkillId={null}
									onClearSkill={handleClearSkill}
									selectedEngine={selectedEngine}
									onSelectEngine={setSelectedEngine}
									hasSearchEngines={hasSearchEngines}
									currentEngine={currentEngine}
									conversationId={pageState.conversationId}
									slashPanelOpen={false}
									slashFilteredItems={[]}
									slashHighlight={0}
									onSlashHighlightChange={() => {}}
									onSlashSelect={() => {}}
									onSlashPanelClose={() => {}}
									onSlashInputChange={() => {}}
									registerKeydownHandler={() => () => {}}
									hideToolbar
									placeholder={t(
										"remoteChat.inputPlaceholder",
										"Type a message to send to IM...",
										{ ns: "chat" },
									)}
								/>
							</>
						)}
					</div>
				</div>

				{/* Codex Environment Inspector — rightmost column for codex/hybrid */}
				{showInspector && <CodexEnvironmentInspector />}
			</div>

			{/* Modals */}
			<ChatModals
				messages={messages}
				isSearchOpen={pageState.isSearchOpen}
				onSearchClose={() => pageState.setIsSearchOpen(false)}
				pendingScrollKeyRef={pageState.pendingScrollKeyRef}
				isExportOpen={pageState.isExportOpen}
				onExportClose={() => pageState.setIsExportOpen(false)}
				settingsOpen={pageState.settingsOpen}
				onSettingsClose={() => pageState.setSettingsOpen(false)}
				sessionSettings={sessionSettings}
				onSettingsChange={setSessionSettings}
				modelValue={modelValue}
				onModelChange={handleModelChange}
				groupedModelOptions={pageState.groupedModelOptions}
				isStreaming={isStreaming}
				availableTools={availableTools}
				remoteBindModalOpen={pageState.remoteBindModalOpen}
				onRemoteBindClose={() => {
					pageState.setRemoteBindModalOpen(false);
				}}
				onBind={handleRemoteBind}
				checkBotOnline={checkBotOnline}
			/>

			<ChatModelPicker
				open={modelSwitcherOpen}
				onClose={() => setModelSwitcherOpen(false)}
				currentSelection={sessionModelOverride}
				onSelect={(sel) => setSessionModelOverride(sel)}
				onClear={() => setSessionModelOverride(null)}
			/>
		</MainLayout>
	);
};

export default Chat;
