import {
	CloseOutlined,
	PauseCircleOutlined,
	SearchOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import { App, Button, Flex, Tag, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type Attachment,
	useAttachmentStore,
} from "../../stores/attachmentStore";
import {
	getShortcutFromEvent,
	normalizeShortcut,
	useShortcutStore,
} from "../../stores/shortcutStore";
import { AttachmentList } from "../attachment";
import { AgentTeamSelector } from "./AgentTeamSelector";
import { ApprovalModePill } from "./composer/ApprovalModePill";
import { ChatComposer } from "./composer/ChatComposer";
import { ChatComposerInfoBar } from "./composer/ChatComposerInfoBar";
import { ChatToolsMenu } from "./composer/ChatToolsMenu";
import { ContextUsagePill } from "./composer/ContextUsagePill";
import { ModelPill } from "./composer/ModelPill";
import { ComposerStatusBar } from "./ComposerStatusBar";
import {
	getProjectIdFromConversation,
	useChatStore,
} from "../../stores/chatStore";
import { useChatInputStore } from "../../stores/chatInputStore";
import { useProjectSettings, useProjectStore } from "../../stores/projectStore";
import type { ActionsComponents } from "@ant-design/x/lib/sender/interface";
import { useEffectiveModel } from "../../hooks/useEffectiveModel";
import {
	type Message,
	useChatMessageStore,
} from "../../stores/chatMessageStore";
import { SearchEnginePanel } from "./SearchEnginePanel";
import type { SlashItem } from "./SlashCommandPanel";
import { SlashCommandPanel } from "./SlashCommandPanel";
import { MentionPanel } from "./MentionPanel";
import { applyMentionToValue } from "../../hooks/useAtMentions";
import type { WorkspaceFileEntry } from "../../services/workspaceService";
import { PromptTemplatePanel } from "./toolbar/PromptTemplatePanel";
import type { PromptTemplate } from "./toolbar/PromptTemplatePanel";
import { QuotePanel } from "./toolbar/QuotePanel";
import { ToolsPanel } from "./toolbar/ToolsPanel";
import type { ToolItem } from "./toolbar/ToolsPanel";
import { AskUserQuestionCard } from "./AskUserQuestionCard";
import { ToolCallCard } from "./ToolCallCard";
import { isAskUserQuestionToolCall } from "./messagePartsAdapter";

const { useToken } = theme;

interface ChatInputAreaProps {
	// `input` / `onInputChange` are intentionally NOT threaded from the parent
	// anymore — the composer's text lives in `chatInputStore` so typing into
	// the textarea no longer re-renders Chat.tsx (the whole page subtree).
	// These props are kept in the interface for clarity; the component ignores
	// them in favor of subscribing to the store directly.
	// See the 2026-06-28 perf comment in `useChat.ts`.
	onSend: (value: string, attachmentIds?: string[]) => void;
	isStreaming: boolean;
	onStopStream: () => void;
	selectedSkillId: string | null;
	onClearSkill: () => void;
	selectedEngine: string;
	onSelectEngine: (engine: string) => void;
	hasSearchEngines: boolean;
	currentEngine: { id: string; name: string; icon: React.ReactNode } | null;
	conversationId: string;
	// Slash panel (from useSlashCommands)
	slashPanelOpen: boolean;
	slashFilteredItems: SlashItem[];
	slashHighlight: number;
	onSlashHighlightChange: (index: number) => void;
	onSlashSelect: (item: SlashItem) => void;
	onSlashPanelClose: () => void;
	onSlashInputChange: (val: string) => void;
	registerKeydownHandler: (el: HTMLElement | null) => () => void;
	// "@" file-mention panel (from useAtMentions) — all optional so the
	// remote-IM ChatInputArea (which has no mention support) doesn't need to
	// pass them.
	mentionPanelOpen?: boolean;
	mentionFilteredItems?: WorkspaceFileEntry[];
	mentionHighlight?: number;
	onMentionHighlightChange?: (index: number) => void;
	onMentionSelect?: (item: WorkspaceFileEntry) => void;
	onMentionPanelClose?: () => void;
	onMentionInputChange?: (val: string, caret: number) => void;
	registerMentionKeydownHandler?: (el: HTMLElement | null) => () => void;
	/**
	 * Register the splice callback the hook's capture-phase Enter handler
	 * should invoke. Supplied by `useAtMentions.setSelectHandler`. We forward
	 * our local `handleMentionItemSelect` (which knows the live `input` value
	 * and textarea caret) so Enter behaves identically to a mouse click.
	 */
	setMentionSelectHandler?: (
		fn: ((item: WorkspaceFileEntry) => void) | null,
	) => void;
	hideToolbar?: boolean;
	placeholder?: string;
	respondToApproval?: (
		toolCallId: string,
		approved: boolean,
		updatedInput?: Record<string, unknown>,
		updatedPermissions?: Array<Record<string, unknown>>,
	) => void;
}

export function ChatInputArea({
	onSend,
	isStreaming,
	onStopStream,
	selectedSkillId,
	onClearSkill,
	selectedEngine,
	onSelectEngine,
	hasSearchEngines,
	currentEngine,
	conversationId,
	slashPanelOpen,
	slashFilteredItems,
	slashHighlight,
	onSlashHighlightChange,
	onSlashSelect,
	onSlashPanelClose,
	onSlashInputChange,
	registerKeydownHandler,
	mentionPanelOpen = false,
	mentionFilteredItems,
	mentionHighlight = 0,
	onMentionHighlightChange,
	onMentionSelect,
	onMentionPanelClose,
	onMentionInputChange,
	registerMentionKeydownHandler,
	setMentionSelectHandler,
	hideToolbar,
	placeholder: placeholderProp,
	respondToApproval,
}: ChatInputAreaProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const { message } = App.useApp();
	// Subscribe to the shared composer input directly. This is the ONLY
	// component that re-renders on each keystroke — the page (Chat.tsx) and
	// `useChat` callbacks read snapshots via `getState()` instead.
	const input = useChatInputStore((s) => s.value);
	const setInput = useChatInputStore((s) => s.setValue);
	const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
	const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
	const [promptPanelOpen, setPromptPanelOpen] = useState(false);
	const [quotePanelOpen, setQuotePanelOpen] = useState(false);
	const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	// Captured from registerKeydownHandler so we can read the textarea caret
	// during onChange and reposition it after a mention splice.
	const composerWrapperRef = useRef<HTMLElement | null>(null);
	const chatMessages = useChatMessageStore((s) => s.messages);
	const pendingToolMessage = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
			const msg = chatMessages[i];
			if (msg.role === "tool" && msg.toolCall?.status === "awaiting_approval") {
				return msg;
			}
		}
		return undefined;
	}, [chatMessages]);

	const closeAllToolPanels = useCallback(() => {
		setPromptPanelOpen(false);
		setQuotePanelOpen(false);
		setToolsPanelOpen(false);
	}, []);

	const handleAttachmentFiles = useCallback(
		async (files: FileList | null) => {
			if (!files || files.length === 0) return;
			const completed: Attachment[] = [];
			for (const file of Array.from(files)) {
				try {
					const arrayBuffer = await file.arrayBuffer();
					const bytes = new Uint8Array(arrayBuffer);
					const result = await window.electron.file.saveAttachmentBytes({
						bytes,
						fileName: file.name,
						mimeType: file.type || undefined,
						conversationId,
					});
					if (!result.success || !result.data) {
						throw new Error(result.error || "saveAttachmentBytes failed");
					}
					const info = result.data;
					const ext = (file.name.split(".").pop() || "").toLowerCase();
					const mime = info.mimeType ?? file.type ?? "application/octet-stream";
					const type: Attachment["type"] = mime.startsWith("image/")
						? "image"
						: mime.startsWith("video/")
							? "video"
							: mime.startsWith("audio/")
								? "audio"
								: mime.includes("pdf") ||
										mime.includes("word") ||
										mime.includes("excel")
									? "document"
									: mime.includes("zip") ||
											mime.includes("rar") ||
											mime.includes("7z")
										? "archive"
										: ["js", "ts", "jsx", "tsx", "json"].includes(ext)
											? "code"
											: "other";
					const attachment: Attachment = {
						id: info.id,
						name: info.name ?? file.name,
						originalName: info.originalName ?? file.name,
						path: info.path,
						size: info.size ?? file.size,
						mimeType: mime,
						type,
						createdAt: info.createdAt ?? new Date().toISOString(),
						conversationId: info.conversationId ?? conversationId,
						messageId: info.messageId,
					};
					useAttachmentStore.getState().addAttachment(attachment);
					completed.push(attachment);
				} catch (error) {
					const errorMsg =
						error instanceof Error ? error.message : String(error);
					message.error(
						t("attachment.upload.error", "上传失败：{{error}}", {
							error: errorMsg,
						}),
					);
				}
			}
			if (completed.length > 0) {
				setAttachedFiles((prev) => [...prev, ...completed]);
			}
		},
		[conversationId, message, t],
	);

	const handleAttachmentClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleSenderChange = useCallback(
		(val: string) => {
			setInput(val);
			onSlashInputChange(val);
			if (onMentionInputChange) {
				const ta = composerWrapperRef.current?.querySelector(
					"textarea",
				) as HTMLTextAreaElement | null;
				const caret = ta?.selectionStart ?? val.length;
				onMentionInputChange(val, caret);
			}
		},
		[setInput, onSlashInputChange, onMentionInputChange],
	);

	const handleMentionItemSelect = useCallback(
		(item: WorkspaceFileEntry) => {
			const ta = composerWrapperRef.current?.querySelector(
				"textarea",
			) as HTMLTextAreaElement | null;
			const caret = ta?.selectionStart ?? input.length;
			const next = applyMentionToValue(input, caret, item.relativePath);
			setInput(next.value);
			// Restore caret position after React commits the new value.
			requestAnimationFrame(() => {
				const ta2 = composerWrapperRef.current?.querySelector(
					"textarea",
				) as HTMLTextAreaElement | null;
				if (ta2) {
					ta2.setSelectionRange(next.caret, next.caret);
					ta2.focus();
				}
			});
			onMentionSelect?.(item);
		},
		[input, setInput, onMentionSelect],
	);

	// Wire the same splice handler into the hook's capture-phase Enter path.
	// The hook stores it through a ref so this fires once per render (cheap)
	// — it just keeps `onSelectRef.current` pointing at the freshest closure
	// of `handleMentionItemSelect` (which closes over the live `input`).
	useEffect(() => {
		if (!setMentionSelectHandler) return;
		setMentionSelectHandler(handleMentionItemSelect);
		return () => {
			setMentionSelectHandler(null);
		};
	}, [setMentionSelectHandler, handleMentionItemSelect]);

	const handleSend = useCallback(
		(value: string) => {
			// Slash / mention panels swallow Enter at the capture phase; this is
			// a defensive guard for synthetic-submit paths (e.g. click on send
			// button) so a literal `/cmd` or `@token` query doesn't get fired.
			if (slashPanelOpen || mentionPanelOpen) return;
			if ((value.trim() || attachedFiles.length > 0) && !isStreaming) {
				const attachmentIds = attachedFiles.map((f) => f.id);
				onSend(value, attachmentIds);
				setAttachedFiles([]);
			}
		},
		[attachedFiles, isStreaming, onSend, slashPanelOpen, mentionPanelOpen],
	);

	// Compose slash + mention capture-phase listeners into one registration so
	// ChatComposer's single `registerKeydownHandler` slot can host both.
	const composedRegisterKeydown = useCallback(
		(el: HTMLElement | null) => {
			composerWrapperRef.current = el;
			const off1 = registerKeydownHandler(el);
			const off2 = registerMentionKeydownHandler?.(el);
			return () => {
				off1?.();
				off2?.();
				composerWrapperRef.current = null;
			};
		},
		[registerKeydownHandler, registerMentionKeydownHandler],
	);


	const handlePromptSelect = useCallback(
		(template: PromptTemplate) => {
			// Insert template into input, replacing {{placeholders}} with selection hints
			const text = template.template.replace(
				/\{\{(\w+)\}\}/g,
				(_match, key: string) => `[${key}]`,
			);
			setInput(text);
		},
		[setInput],
	);

	const handleQuoteSelect = useCallback(
		(msg: Message) => {
			const role = msg.role === "user" ? "You" : "AI";
			const preview =
				msg.content.length > 200
					? `${msg.content.slice(0, 200)}...`
					: msg.content;
			const quote = `> **${role}**: ${preview}\n\n`;
			setInput(input ? `${input}\n${quote}` : quote);
		},
		[setInput, input],
	);

	const handleToolSelect = useCallback(
		(tool: ToolItem) => {
			const hint = `Please use the "${tool.name}" tool to `;
			setInput(input ? `${input}\n${hint}` : hint);
		},
		[setInput, input],
	);

	const topOverlay = (
		<>
			{!hideToolbar && slashPanelOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<SlashCommandPanel
						items={slashFilteredItems}
						highlightIndex={slashHighlight}
						onSelect={onSlashSelect}
						onHighlightChange={onSlashHighlightChange}
						onClose={onSlashPanelClose}
					/>
				</div>
			)}
			{!hideToolbar &&
				mentionPanelOpen &&
				!slashPanelOpen &&
				mentionFilteredItems && (
					<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
						<MentionPanel
							items={mentionFilteredItems}
							highlightIndex={mentionHighlight}
							onSelect={handleMentionItemSelect}
							onHighlightChange={onMentionHighlightChange ?? (() => {})}
							onClose={onMentionPanelClose ?? (() => {})}
						/>
					</div>
				)}
			{!hideToolbar && searchPopoverOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<SearchEnginePanel
						selectedEngine={selectedEngine}
						onSelectEngine={onSelectEngine}
						onClose={() => setSearchPopoverOpen(false)}
					/>
				</div>
			)}
			{!hideToolbar && promptPanelOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<PromptTemplatePanel
						onSelect={(tpl) => {
							handlePromptSelect(tpl);
							closeAllToolPanels();
						}}
						onClose={closeAllToolPanels}
					/>
				</div>
			)}
			{!hideToolbar && quotePanelOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<QuotePanel
						onSelect={(msg) => {
							handleQuoteSelect(msg);
							closeAllToolPanels();
						}}
						onClose={closeAllToolPanels}
					/>
				</div>
			)}
			{!hideToolbar && toolsPanelOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<ToolsPanel
						onSelect={(tool) => {
							handleToolSelect(tool);
							closeAllToolPanels();
						}}
						onClose={closeAllToolPanels}
					/>
				</div>
			)}
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
		</>
	);

	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === conversationId),
	);
	const projectId = getProjectIdFromConversation(currentConversation);
	const project = useProjectStore((s) =>
		projectId ? s.projects.find((p) => p.id === projectId) : null,
	);
	const workspaceName = project?.name ?? "未指定工作区";
	const remoteBinding = currentConversation?.remote;
	const projectSettings = useProjectSettings(projectId);
	const approvalMode = projectSettings?.runtimePolicy?.approvalMode;

	const effective = useEffectiveModel();
	const modelLabel = effective
		? `${effective.provider.name} · ${effective.model.name || effective.model.id}`
		: null;

	const handleOpenModelSwitcher = useCallback(() => {
		window.dispatchEvent(new Event("chat:open-model-switcher"));
	}, []);

	const existingFooterFn = useCallback(
		(_footerNode: React.ReactNode, opts: { components: ActionsComponents }) => {
			const { SendButton } = opts.components;
			if (hideToolbar) {
				return (
					<Flex justify="end" align="center">
						{isStreaming ? (
							<Tooltip title={t("actions.stop", "Stop", { ns: "chat" })}>
								<Button
									className="chat-stop-btn"
									type="primary"
									danger
									shape="circle"
									icon={<PauseCircleOutlined />}
									onClick={onStopStream}
								/>
							</Tooltip>
						) : (
							<SendButton
								className="chat-send-btn"
								type="primary"
								shape="circle"
							/>
						)}
					</Flex>
				);
			}
			return (
				<Flex
					justify="space-between"
					align="center"
					style={{ width: "100%", minWidth: 0 }}
				>
					{/* Left group can shrink (and clip overflowing pills) so the
					    right group — which carries the Send / Stop button — never
					    overflows past the composer card's right border. */}
					<Flex
						align="center"
						gap={8}
						style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}
					>
						<ApprovalModePill
							projectId={projectId}
							approvalMode={approvalMode}
						/>
						<AgentTeamSelector />
						{selectedSkillId && (
							<Tag
								color="green"
								className="text-xs flex items-center gap-0.5 m-0"
								closeIcon={<CloseOutlined className="text-[10px]" />}
								onClose={(e) => {
									e.preventDefault();
									onClearSkill();
								}}
							>
								<ThunderboltOutlined className="text-[10px]" />
								<span className="ml-0.5">
									{t("chatMode.skillActive", "Skill", { ns: "chat" })}
								</span>
							</Tag>
						)}
						<ChatToolsMenu
							onAttachment={handleAttachmentClick}
							onPromptTemplate={() => {
								closeAllToolPanels();
								setPromptPanelOpen(true);
							}}
							onQuote={() => {
								closeAllToolPanels();
								setQuotePanelOpen(true);
							}}
							onTools={() => {
								closeAllToolPanels();
								setToolsPanelOpen(true);
							}}
						/>
						{hasSearchEngines && (
							<Tooltip
								title={
									currentEngine?.name ??
									t("toolbar.search", "搜索", { ns: "chat" })
								}
							>
								<button
									type="button"
									onClick={() => setSearchPopoverOpen(!searchPopoverOpen)}
									className={`composer-pill is-icon${
										searchPopoverOpen
											? " is-active"
											: selectedEngine
												? " is-accent-blue"
												: ""
									}`}
									aria-label={t("toolbar.search", "搜索", { ns: "chat" })}
								>
									{currentEngine?.icon ?? <SearchOutlined />}
								</button>
							</Tooltip>
						)}
					</Flex>

					{/* Send or Stop button — pinned to the right edge. flexShrink:0
					    keeps it inside the card; ModelPill already self-truncates via
					    its own max-width. */}
					<Flex align="center" gap={8} style={{ flexShrink: 0 }}>
						<ContextUsagePill />
						<ModelPill label={modelLabel} onClick={handleOpenModelSwitcher} />
						{isStreaming ? (
							<Tooltip title={t("actions.stop", "终止", { ns: "chat" })}>
								<Button
									className="chat-stop-btn"
									type="primary"
									danger
									shape="circle"
									icon={<PauseCircleOutlined />}
									onClick={onStopStream}
								/>
							</Tooltip>
						) : (
							<SendButton
								className="chat-send-btn"
								type="primary"
								shape="circle"
							/>
						)}
					</Flex>
				</Flex>
			);
		},
		[
			t,
			token,
			hideToolbar,
			isStreaming,
			onStopStream,
			projectId,
			approvalMode,
			searchPopoverOpen,
			selectedSkillId,
			onClearSkill,
			selectedEngine,
			hasSearchEngines,
			currentEngine,
			handleAttachmentClick,
			closeAllToolPanels,
			modelLabel,
			handleOpenModelSwitcher,
		],
	);

	return (
		<div className="chat-input-shell px-6 py-4">
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(e) => {
					handleAttachmentFiles(e.target.files);
					if (e.target) e.target.value = "";
				}}
			/>
			{pendingToolMessage?.toolCall && respondToApproval ? (
				<div className="chat-composer relative w-full mx-auto">
					{isAskUserQuestionToolCall(pendingToolMessage.toolCall) ? (
						<AskUserQuestionCard
							toolCall={pendingToolMessage.toolCall}
							compact
							onSubmit={respondToApproval}
						/>
					) : (
						<ToolCallCard
							toolCall={pendingToolMessage.toolCall}
							compact
							onApproval={respondToApproval}
						/>
					)}
				</div>
			) : (
				<ChatComposer
					value={input}
					onChange={handleSenderChange}
					onSubmit={handleSend}
					isStreaming={isStreaming}
					onStopStream={onStopStream}
					placeholder={
						placeholderProp ??
						t("placeholder", "在这里输入消息，按 Enter 发送", { ns: "chat" })
					}
					hideToolbar={hideToolbar}
					infoBar={
						hideToolbar ? null : (
							<ChatComposerInfoBar
								workspaceName={workspaceName}
								remoteBinding={remoteBinding}
								trailing={<ComposerStatusBar />}
							/>
						)
					}
					topOverlay={topOverlay}
					registerKeydownHandler={composedRegisterKeydown}
					onKeyDown={(e) => {
						if (e.nativeEvent.isComposing) return;
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
							// `@ant-design/x` 的 Sender 内部 Enter 提交是以
							// `onKeyDown(e) === false` 作为「已被外部处理」的信号
							// （见 node_modules/@ant-design/x/lib/sender/components/TextArea.js
							// 的 onInternalKeyDown：`if (... || eventRes === false) return;`）。
							// preventDefault 不够；不返回 false 会导致 Sender 再次
							// 触发 onSubmit -> handleSend，消息被发两条。
							return false;
						}
					}}
					renderFooter={existingFooterFn}
				/>
			)}
		</div>
	);
}
