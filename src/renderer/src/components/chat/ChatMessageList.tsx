import {
	ArrowDownOutlined,
	CopyOutlined,
	DeleteOutlined,
	DownloadOutlined,
	EditOutlined,
	HistoryOutlined,
	LoadingOutlined,
	MoreOutlined,
	ReloadOutlined,
	RobotOutlined,
	StarFilled,
	StarOutlined,
	UserOutlined,
} from "@ant-design/icons";
import { Bubble } from "@ant-design/x";
import type { BubbleItemType, BubbleListRef } from "@ant-design/x/es/bubble";
import type { RoleType } from "@ant-design/x/es/bubble/interface";
import { App, Avatar, Button, Dropdown, Spin, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { List, useDynamicRowHeight, useListRef } from "react-window";
import { formatSmartTime } from "../../lib/formatTime";
import { formatTokenCount } from "../../lib/formatTokens";
import { useChatMessageStore } from "../../stores/chatMessageStore";
import type { Message } from "../../stores/chatMessageStore";
import { useChatStore } from "../../stores/chatStore";
import { useMessageStore } from "../../stores/messageStore";
import type { ModelProviderPreset } from "../../types/models";
import { Markdown } from "../Markdown";
import { MessageContextMenu } from "./MessageContextMenu";
import { ProviderIcon } from "../models/ProviderIcon";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { AskUserQuestionCard } from "./AskUserQuestionCard";
import { ErrorCard } from "./ErrorCard";
import {
	getPlanCardFromPart,
	PlanCard,
	type PlanDecisionHandler,
} from "./PlanCard";
import { ToolCallCard } from "./ToolCallCard";
import {
	shouldVirtualizeMessageList,
	smoothScrollToBottom,
} from "./chatMessageListVirtualization";
import { isAskUserQuestionToolCall, messageToParts } from "./messagePartsAdapter";
import { buildMessageTurns } from "./messageTurns";
import { StreamPartRenderer } from "./parts/StreamPartRenderer";

const { useToken } = theme;

interface VirtualBubbleRowProps {
	items: BubbleItemType[];
	roles: RoleType;
	contentStyle: React.CSSProperties;
}

interface VirtualBubbleRowComponentProps extends VirtualBubbleRowProps {
	ariaAttributes: {
		"aria-posinset": number;
		"aria-setsize": number;
		role: "listitem";
	};
	index: number;
	style: React.CSSProperties;
}

function resolveRoleProps(roles: RoleType, item: BubbleItemType) {
	const role = roles[item.role];
	return typeof role === "function" ? role(item) : role;
}

function VirtualBubbleRow({
	ariaAttributes,
	index,
	style,
	items,
	roles,
	contentStyle,
}: VirtualBubbleRowComponentProps): React.ReactElement | null {
	const item = items[index];
	if (!item) return null;
	const {
		key: _key,
		role: _role,
		status: _status,
		extraInfo: _extraInfo,
		...props
	} = item;
	const roleProps = resolveRoleProps(roles, item);
	const rowPaddingTop = index === 0 ? 32 : 0;
	const rowPaddingBottom = index === items.length - 1 ? 32 : 12;

	return (
		<div {...ariaAttributes} style={style}>
			<div
				style={{
					...contentStyle,
					paddingTop: rowPaddingTop,
					paddingBottom: rowPaddingBottom,
				}}
			>
				<Bubble {...roleProps} {...props} />
			</div>
		</div>
	);
}

interface VirtualBubbleListProps {
	items: BubbleItemType[];
	roles: RoleType;
	contentStyle: React.CSSProperties;
	isStreaming: boolean;
	/** Notified whenever the list's at-bottom state changes (for the FAB). */
	onNearBottomChange?: (nearBottom: boolean) => void;
	/**
	 * Called once on mount with a stable "scroll to last row" function so the
	 * parent's scroll-to-bottom FAB can drive the virtualized list without
	 * threading react-window's internal ref shape (whose nullability differs
	 * across versions and would force noisy type gymnastics).
	 */
	registerScrollToBottom?: (fn: () => void) => void;
}

function VirtualBubbleList({
	items,
	roles,
	contentStyle,
	isStreaming,
	onNearBottomChange,
	registerScrollToBottom,
}: VirtualBubbleListProps) {
	const listRef = useListRef(null);
	const rowHeight = useDynamicRowHeight({
		defaultRowHeight: 160,
		key: items.length,
	});
	const nearBottomRef = useRef(true);
	const pendingKey = useMemo(
		() =>
			items.find((item) => item.extraInfo?.hasPendingInteraction)?.key ?? null,
		[items],
	);

	// Expose a stable "scroll to last row" handle to the parent. Uses
	// `smoothScrollToBottom` (rAF-driven easeOutCubic that re-reads
	// scrollHeight every frame) so the user sees a real animation AND the
	// scroll still reaches the true bottom even when `useDynamicRowHeight`
	// resolves row measurements mid-flight.
	useEffect(() => {
		registerScrollToBottom?.(() => {
			smoothScrollToBottom(listRef.current?.element ?? null);
		});
	}, [listRef, registerScrollToBottom]);

	const rowProps = useMemo(
		() => ({ items, roles, contentStyle }),
		[items, roles, contentStyle],
	);

	const handleScroll = useCallback(() => {
		const el = listRef.current?.element;
		if (!el) return;
		const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
		const nearBottom = distance < 120;
		if (nearBottom !== nearBottomRef.current) {
			nearBottomRef.current = nearBottom;
			onNearBottomChange?.(nearBottom);
		}
	}, [listRef, onNearBottomChange]);

	useEffect(() => {
		if (!items.length) return;
		if (nearBottomRef.current || isStreaming) {
			listRef.current?.scrollToRow({
				index: items.length - 1,
				align: "end",
				behavior: "auto",
			});
		}
	}, [items.length, isStreaming, listRef]);

	useEffect(() => {
		if (!pendingKey) return;
		const index = items.findIndex((item) => item.key === pendingKey);
		if (index >= 0) {
			listRef.current?.scrollToRow({
				index,
				align: "smart",
				behavior: "smooth",
			});
		}
	}, [items, listRef, pendingKey]);

	return (
		<List<VirtualBubbleRowProps>
			className="h-full"
			defaultHeight={720}
			listRef={listRef}
			onScroll={handleScroll}
			overscanCount={8}
			rowComponent={VirtualBubbleRow}
			rowCount={items.length}
			rowHeight={rowHeight}
			rowProps={rowProps}
			style={{ height: "100%", width: "100%" }}
		/>
	);
}

/** Reads sessionStatus from the store so the parent doesn't need it as a dep. */
function StreamingStatusIndicator() {
	const { t } = useTranslation();
	const { token } = useToken();
	const sessionStatus = useChatMessageStore((s) => s.sessionStatus);
	if (sessionStatus === "idle") return null;
	return (
		<div
			className="flex items-center gap-1.5 mt-2"
			style={{ color: token.colorTextTertiary, fontSize: 12 }}
		>
			<LoadingOutlined spin style={{ fontSize: 12 }} />
			<span>{t(`sessionStatus.${sessionStatus}`, { ns: "chat" })}</span>
		</div>
	);
}

interface ChatMessageListProps {
	messages: Message[];
	isStreaming: boolean;
	conversationId: string;
	bubbleListRef: React.RefObject<BubbleListRef | null>;
	retryMessage: (messageId: string) => void;
	editMessage: (messageId: string) => void;
	deleteMessage: (messageId: string) => void;
	respondToApproval: (
		toolCallId: string,
		approved: boolean,
		updatedInput?: Record<string, unknown>,
		updatedPermissions?: Array<Record<string, unknown>>,
	) => void;
	onPlanDecision?: PlanDecisionHandler;
}

interface ScrollToBottomFabProps {
	visible: boolean;
	onClick: () => void;
}

/**
 * Floating "scroll to bottom" button anchored to the bottom-center of the
 * chat pane. Pure CSS class drives the entrance/exit/hover animations so
 * we get a real "appear" effect (scale + fade up) rather than a flat opacity
 * toggle. See `.chat-scroll-to-bottom-fab` in `styles/index.css`.
 */
const ScrollToBottomFab = memo(function ScrollToBottomFab({
	visible,
	onClick,
}: ScrollToBottomFabProps) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={t("scrollToBottom", "滚动到底部", { ns: "chat" })}
			className={`chat-scroll-to-bottom-fab ${
				visible ? "is-visible" : "is-hidden"
			}`}
		>
			<ArrowDownOutlined style={{ fontSize: 14 }} />
		</button>
	);
});

export function ChatMessageList({
	messages,
	isStreaming,
	conversationId,
	bubbleListRef,
	retryMessage,
	editMessage,
	deleteMessage,
	respondToApproval,
	onPlanDecision,
}: ChatMessageListProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const { message: messageApi } = App.useApp();
	const { isBookmarked, addBookmark, removeBookmark, getBookmarkByMessageId } =
		useMessageStore();
	const isLoadingMessages = useChatMessageStore((s) => s.isLoadingMessages);
	const hasOlderMessages = useChatMessageStore((s) => s.hasOlderMessages);
	const isLoadingOlderMessages = useChatMessageStore(
		(s) => s.isLoadingOlderMessages,
	);
	// One-time subscription is enough — `loadOlderMessages` is a stable
	// action reference on the zustand store. We read it via `getState()` in
	// the click handler below so the component doesn't need to subscribe
	// to the entire chatStore.

	// ── Scroll-to-bottom FAB state ──
	// `isAtBottom` drives the FAB visibility; it's updated from either
	// `Bubble.List`'s scroll DOM (non-virtual path) or `VirtualBubbleList`'s
	// internal scroll handler (virtual path) via `onNearBottomChange`.
	const [isAtBottom, setIsAtBottom] = useState(true);
	// Stored "scroll to bottom" function from the virtualized list; null when
	// the non-virtual `Bubble.List` is the active renderer.
	const virtualScrollToBottomRef = useRef<(() => void) | null>(null);

	const handleNearBottomChange = useCallback((nearBottom: boolean) => {
		setIsAtBottom(nearBottom);
	}, []);

	const handleRegisterVirtualScrollToBottom = useCallback((fn: () => void) => {
		virtualScrollToBottomRef.current = fn;
	}, []);

	// Attach a scroll listener to `Bubble.List`'s internal scroll DOM so the
	// FAB hides whenever the user is near the bottom on the non-virtual path.
	useEffect(() => {
		const el = bubbleListRef.current?.scrollBoxNativeElement;
		if (!el) return;
		const handler = () => {
			const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
			setIsAtBottom(distance < 120);
		};
		handler();
		el.addEventListener("scroll", handler, { passive: true });
		return () => el.removeEventListener("scroll", handler);
		// `bubbleListRef.current` is mutable; re-resolve when the underlying
		// list mounts/unmounts (covered by depending on the ref itself plus
		// the message count to retrigger after a switch).
	}, [bubbleListRef, messages.length]);

	const handleScrollToBottom = useCallback(() => {
		// Virtual path: defer to the registered animated scroll.
		if (virtualScrollToBottomRef.current) {
			virtualScrollToBottomRef.current();
			return;
		}
		// Non-virtual path: same hand-rolled rAF animation as the virtual
		// path. `Bubble.List`'s built-in smooth scroll captured the target
		// once at start and stopped short when markdown/code blocks reflowed
		// mid-animation; `smoothScrollToBottom` re-reads scrollHeight every
		// frame so growing content during the scroll still counts.
		smoothScrollToBottom(
			bubbleListRef.current?.scrollBoxNativeElement ?? null,
		);
	}, [bubbleListRef]);

	// ── Message action callbacks ──
	const handleCopyMessage = useCallback(
		(content: string) => {
			navigator.clipboard.writeText(content);
			messageApi.success(t("actions.copied", "已复制", { ns: "chat" }));
		},
		[messageApi, t],
	);

	const handleDeleteMessage = useCallback(
		(messageId: string) => {
			deleteMessage(messageId);
			messageApi.success(t("actions.deleted", "已删除", { ns: "chat" }));
		},
		[deleteMessage, messageApi, t],
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
			messageApi.success(
				t("messageExported", "消息已导出", { ns: "chat" }),
			);
		},
		[messageApi, t],
	);

	const handleToggleBookmark = useCallback(
		(msg: { id: string; role: string; content: string; timestamp: number }) => {
			const bm = getBookmarkByMessageId(msg.id);
			if (bm) {
				removeBookmark(bm.id);
				messageApi.success(
					t("bookmarkRemoved", "已取消收藏", { ns: "chat" }),
				);
			} else if (msg.role === "user" || msg.role === "assistant") {
				addBookmark({
					messageId: msg.id,
					conversationId,
					content: msg.content,
					role: msg.role as "user" | "assistant",
					timestamp: msg.timestamp,
				});
				messageApi.success(
					t("bookmarkAdded", "已收藏消息", { ns: "chat" }),
				);
			}
		},
		[
			addBookmark,
			removeBookmark,
			getBookmarkByMessageId,
			conversationId,
			messageApi,
			t,
		],
	);

	const handlePlanDecision = useCallback<PlanDecisionHandler>(
		(decision) => {
			onPlanDecision?.(decision);
		},
		[onPlanDecision],
	);

	// ── Stable styles for Bubble.List (avoids inline object triggering re-renders) ──
	const bubbleListStyles = useMemo(
		() => ({
			content: {
				maxWidth: "56rem",
				margin: "0 auto",
				padding: "2rem 1.5rem",
			},
		}),
		[],
	);
	const bubbleContentStyle = bubbleListStyles.content;

	// ── Roles config ──
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
				loadingRender: () => <ThinkingIndicator />,
				styles: {
					content: {
						// inline-block keeps short text replies shrink-to-fit
						// (so the left edge doesn't anchor a tiny "好的"
						// against a 56rem-wide invisible box). Block-level
						// children that need to escape this (ErrorCard,
						// ApprovalDecisionCard with fullWidth) lift the
						// constraint via their own scoped `:has` style — see
						// ErrorCard.tsx and ApprovalDecisionCard.tsx.
						display: "inline-block",
					},
				},
			},
		}),
		[],
	);

	// Smart relative time: today → HH:mm, yesterday → 昨天 HH:mm,
	// this year → MM/DD HH:mm, older → YYYY/MM/DD HH:mm. Pure delegation
	// to `formatSmartTime` so the formatting rule lives next to its tests.
	const formatHeaderTime = useCallback(
		(ts: number) => formatSmartTime(ts, t),
		[t],
	);

	// ── Build bubble items ──
	const bubbleItems = useMemo(() => {
		const turns = buildMessageTurns(messages);

		const result: BubbleItemType[] = [];
		for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
			const turn = turns[turnIdx];
			const isLastTurn = turnIdx === turns.length - 1;

			// ════════════════════════════════════════
			//  User turn
			// ════════════════════════════════════════
			if (turn.type === "user") {
				const msg = turn.message;
				const timeText = formatHeaderTime(msg.timestamp);
				const meta = msg.metadata;
				const userHeader = (
					<div className="flex flex-col items-end gap-0.5 mb-1">
						<div className="flex items-center gap-2">
							<span
								style={{
									fontSize: 13,
									fontWeight: 500,
									color: token.colorText,
								}}
							>
								{t("user", "用户", { ns: "chat" })}
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
				);

				// Token info (chip = compact, tooltip = exact below)
				const tokenText =
					meta?.inputTokens != null
						? `↑${formatTokenCount(meta.inputTokens)}`
						: "";
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
				const tokenInfoEl =
					meta?.inputTokens != null ? (
						<Tooltip
							title={`Tokens: ↑${formatTokenCount(meta.inputTokens)}`}
						>
							{tokenInfo}
						</Tooltip>
					) : (
						tokenInfo
					);

				const actionBtnStyle = { color: token.colorTextTertiary };
				const actionButtons = (
					<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
					</div>
				);

				result.push({
					key: msg.id,
					role: "user" as const,
					content: msg.content,
					header: userHeader,
					contentRender: () => (
						<MessageContextMenu
							message={msg}
							conversationId={conversationId}
							onDelete={() => {
								messageApi.info(
									t("messageDeleteNotImplemented", "消息删除功能待实现", {
										ns: "chat",
									}),
								);
							}}
						>
							<div id={`msg-${msg.id}`} className="user-bubble-content">
								<Markdown content={msg.content} />
							</div>
						</MessageContextMenu>
					),
					footer: (
						<div className="flex items-center justify-end gap-2">
							{actionButtons}
							{tokenInfoEl}
						</div>
					),
				});
				continue;
			}

			// ════════════════════════════════════════
			//  AI turn (assistant + tool messages grouped)
			// ════════════════════════════════════════
			const aiMessages = turn.messages;
			const lastMsg = aiMessages[aiMessages.length - 1];
			const isStreamingTurn =
				isLastTurn && isStreaming && lastMsg.role === "assistant";

			// Pre-compute content parts
			const precomputedParts: Array<{ msg: Message; idx: number }> = [];
			for (let i = 0; i < aiMessages.length; i++) {
				const m = aiMessages[i];
				if (m.role === "assistant") {
					const isLastInTurn = i === aiMessages.length - 1;
					// During streaming, the last assistant message content comes from the store
					// via StreamingMarkdown (not from props), so check m.content for non-streaming
					// and always include the last message in a streaming turn
					const hasContent =
						(isStreamingTurn && isLastInTurn) ||
						m.content?.trim() ||
						messageToParts(m).some((part) => part.type !== "tool");
					if (hasContent) {
						precomputedParts.push({ msg: m, idx: i });
					}
				} else if (m.role === "tool" && m.toolCall) {
					precomputedParts.push({ msg: m, idx: i });
				}
			}

			// Skip empty AI turns
			if (precomputedParts.length === 0 && !isStreamingTurn) continue;

			// Metadata
			const firstAssistant = aiMessages.find((m) => m.role === "assistant");
			const meta =
				firstAssistant?.metadata ||
				aiMessages.find((m) => m.metadata)?.metadata;

			const timeText = formatHeaderTime(
				firstAssistant?.timestamp || aiMessages[0].timestamp,
			);

			// AI header
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
			const modelSourceLabel = meta?.modelSourceLabel;

			// Mirror the user-side header layout but anchored left: avatar on the
			// left, two stacked lines on the right — model + provider on top,
			// timestamp below. Lining model/provider on its own row keeps long
			// provider names from pushing the time off-screen on narrow widths.
			const aiHeader = (
				<div className="flex items-start gap-2 mb-1">
					{avatarNode}
					<div className="flex flex-col gap-0.5 min-w-0">
						{modelName ? (
							<span
								className="truncate"
								style={{
									fontSize: 13,
									fontWeight: 500,
									color: token.colorText,
									lineHeight: 1.25,
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
										{" "}
										| {providerName}
									</span>
								)}
								{modelSourceLabel && (
									<span
										style={{
											fontWeight: 400,
											color: token.colorTextQuaternary,
										}}
									>
										{" "}
										| {modelSourceLabel}
									</span>
								)}
							</span>
						) : (
							<span
								style={{
									fontSize: 13,
									fontWeight: 500,
									color: token.colorText,
									lineHeight: 1.25,
								}}
							>
								AI
							</span>
						)}
						<span
							style={{
								fontSize: 11,
								color: token.colorTextQuaternary,
								lineHeight: 1.25,
							}}
						>
							{timeText}
						</span>
					</div>
				</div>
			);

				// Content: interleave assistant text + tool cards
				const contentRender = () => {
					const parts: React.ReactNode[] = [];
					for (let i = 0; i < aiMessages.length; i++) {
						const m = aiMessages[i];
						if (m.role === "assistant") {
							// When the assistant turn failed mid-stream, useChat
							// converts the placeholder into a `type:'error'`
							// message via markMessageAsError. Render the
							// structured ErrorCard in place of the regular text
							// parts so the failure reason, model, endpoint, and
							// triggering query stay first-class.
							if (m.type === "error") {
								parts.push(
									<ErrorCard
										key={`${m.id}:error`}
										message={m}
										onRetry={retryMessage}
									/>,
								);
								continue;
							}
							const isLastInTurn = i === aiMessages.length - 1;
							const assistantParts = messageToParts(m).filter(
								(part) => part.type !== "tool",
							);
							const textPart = assistantParts.find(
								(part) => part.type === "text",
							);
							if (isStreamingTurn && isLastInTurn) {
								// StreamingMarkdown reads streamingContent from Zustand store directly,
								// so this component re-renders in isolation without rebuilding all bubbleItems.
								parts.push(
									<StreamPartRenderer
										key={textPart?.id ?? `${m.id}:streaming-text`}
										sessionId={conversationId}
										part={
											textPart ?? {
												id: `${m.id}:streaming-text`,
												type: "text",
												state: "streaming",
												createdAt: m.timestamp || Date.now(),
												updatedAt: m.timestamp || Date.now(),
												content: m.content || "",
											}
										}
										streaming
									/>,
								);
							} else {
								for (const part of assistantParts) {
									const plan = getPlanCardFromPart(part);
									if (plan) {
										parts.push(
											<PlanCard
												key={part.id}
												plan={plan}
												disabled={!onPlanDecision}
												onExecute={handlePlanDecision}
												onCancel={handlePlanDecision}
												onRegenerate={handlePlanDecision}
											/>,
										);
									} else {
										parts.push(
											<StreamPartRenderer
												key={part.id}
												part={part}
												sessionId={conversationId}
											/>,
										);
									}
								}
							}
						} else if (m.role === "tool" && m.toolCall) {
							if (m.toolCall.status === "awaiting_approval") {
								continue;
							}
							if (isAskUserQuestionToolCall(m.toolCall)) {
								parts.push(
									<AskUserQuestionCard
										key={m.id}
										toolCall={m.toolCall}
										onSubmit={respondToApproval}
									/>,
								);
							} else {
								parts.push(
									<ToolCallCard
										key={m.id}
										toolCall={m.toolCall}
										onApproval={respondToApproval}
									/>,
								);
							}
						}
					}
				if (parts.length === 0 && !isStreamingTurn) return null;

				const representative =
					[...aiMessages]
						.reverse()
						.find((m) => m.role === "assistant" && m.content?.trim()) ||
					firstAssistant ||
					aiMessages[0];

				return (
					<MessageContextMenu
						message={representative}
						conversationId={conversationId}
						onDelete={() => {
							messageApi.info(
								t("messageDeleteNotImplemented", "消息删除功能待实现", {
									ns: "chat",
								}),
							);
						}}
					>
						<div id={`msg-${firstAssistant?.id || aiMessages[0].id}`}>
							{parts}
							{isStreamingTurn && <StreamingStatusIndicator />}
						</div>
					</MessageContextMenu>
				);
			};

			// Footer: token stats + action buttons
			const footerMeta = (() => {
				const lastAssistant = [...aiMessages]
					.reverse()
					.find((m) => m.role === "assistant");
				return lastAssistant?.metadata || meta;
			})();
			const combinedContent = aiMessages
				.filter((m) => m.role === "assistant" && m.content)
				.map((m) => m.content)
				.join("\n\n");
			const representativeMsg =
				[...aiMessages].reverse().find((m) => m.role === "assistant") ||
				aiMessages[0];

			const footer = (() => {
				const tooltipLines: string[] = [];
				if (footerMeta?.firstTokenMs != null) {
					tooltipLines.push(
						`${t("metrics.firstToken", "首字时延", { ns: "chat" })} ${footerMeta.firstTokenMs} ms`,
					);
				}
				if (footerMeta?.tokensPerSecond != null) {
					tooltipLines.push(
						`${t("metrics.speed", "每秒", { ns: "chat" })} ${footerMeta.tokensPerSecond} tokens`,
					);
				}
				if (footerMeta?.duration != null) {
					const seconds = (footerMeta.duration / 1000).toFixed(1);
					tooltipLines.push(
						`${t("metrics.duration", "回答耗时", { ns: "chat" })} ${seconds} s`,
					);
				}
				if (footerMeta?.tokens != null) {
					// Tooltip uses the same compact K/M form as the chip so the
					// two views are consistent and the long total digits don't
					// dominate the line. Total is split from the in/out
					// breakdown with " / " so the eye can tell them apart
					// (otherwise "5K ↑4.1K ↓909" reads as one continuous run).
					const breakdown: string[] = [];
					if (footerMeta.inputTokens != null)
						breakdown.push(`↑${formatTokenCount(footerMeta.inputTokens)}`);
					if (footerMeta.outputTokens != null)
						breakdown.push(`↓${formatTokenCount(footerMeta.outputTokens)}`);
					const total = `Tokens: ${formatTokenCount(footerMeta.tokens)}`;
					tooltipLines.push(
						breakdown.length
							? `${total} / ${breakdown.join(" ")}`
							: total,
					);
				}

				// Visible footer chip uses compact form (1.9K / 1.8M …) so the
				// row width doesn't jump as token counts grow over a long chat.
				let tokenText = "";
				if (
					footerMeta?.inputTokens != null &&
					footerMeta?.outputTokens != null
				) {
					tokenText = `↑${formatTokenCount(footerMeta.inputTokens)} ↓${formatTokenCount(footerMeta.outputTokens)}`;
				} else if (footerMeta?.tokens != null) {
					tokenText = `${formatTokenCount(footerMeta.tokens)} tokens`;
				}

				const tokenInfo = (
					<div className="flex items-center gap-1.5">
						{isBookmarked(representativeMsg.id) && (
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
							title={tooltipLines.map((line) => <div key={line}>{line}</div>)}
						>
							{tokenInfo}
						</Tooltip>
					) : (
						tokenInfo
					);

				const actionBtnStyle = { color: token.colorTextTertiary };
				const moreMenuItems = [
					{
						key: "bookmark",
						icon: isBookmarked(representativeMsg.id) ? (
							<StarFilled className="text-yellow-500" />
						) : (
							<StarOutlined />
						),
						label: isBookmarked(representativeMsg.id)
							? t("removeBookmark", "取消收藏", { ns: "chat" })
							: t("actions.bookmark", "收藏", { ns: "chat" }),
						onClick: () => handleToggleBookmark(representativeMsg),
					},
					{
						key: "export",
						icon: <DownloadOutlined />,
						label: t("actions.export", "导出", { ns: "chat" }),
						onClick: () => handleExportMessage(representativeMsg),
					},
				];

				const actionButtons = (
					<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
						<Tooltip title={t("actions.copy", "复制", { ns: "chat" })}>
							<Button
								type="text"
								size="small"
								icon={<CopyOutlined />}
								style={actionBtnStyle}
								onClick={() =>
									handleCopyMessage(
										isStreamingTurn
											? useChatMessageStore.getState().streamingContent
											: combinedContent,
									)
								}
							/>
						</Tooltip>
						<Tooltip
							title={t("actions.regenerate", "重新生成", {
								ns: "chat",
							})}
						>
							<Button
								type="text"
								size="small"
								icon={<ReloadOutlined />}
								style={actionBtnStyle}
								onClick={() => retryMessage(representativeMsg.id)}
							/>
						</Tooltip>
						<Tooltip title={t("actions.delete", "删除", { ns: "chat" })}>
							<Button
								type="text"
								size="small"
								icon={<DeleteOutlined />}
								style={actionBtnStyle}
								onClick={() => handleDeleteMessage(representativeMsg.id)}
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
					</div>
				);

				return (
					<div className="flex items-center gap-2">
						{tokenInfoWithTooltip}
						{actionButtons}
					</div>
				);
			})();

			// Full-width override for ErrorCard turns is handled by a
			// scoped `:has` CSS rule inside `ErrorCard.tsx` — per-item
			// `styles` overrides on Bubble items don't reliably win over
			// the role-level `display: inline-block`.
			result.push({
				key: firstAssistant?.id || aiMessages[0].id,
				role: "ai" as const,
				content: "",
				extraInfo: {
					hasPendingInteraction: turn.hasPendingInteraction,
				},
				loading:
					isStreamingTurn &&
					!aiMessages.some(
						(m) =>
							m.role === "tool" ||
							(m.role === "assistant" && m.content?.trim()),
					),
				typing: isStreamingTurn
					? { effect: "fade-in" as const, step: 5, interval: 50 }
					: undefined,
				header: aiHeader,
				contentRender,
				footer,
			});
		}
		return result;
	}, [
		messages,
		isStreaming,
		conversationId,
		isBookmarked,
		messageApi,
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
		respondToApproval,
		onPlanDecision,
		handlePlanDecision,
	]);

	const handleLoadOlderMessages = useCallback(() => {
		// Stable action — read from store at click time so the callback's
		// dep array stays empty. Aborts internally if the user has already
		// switched conversations mid-fetch.
		useChatStore.getState().loadOlderMessages();
	}, []);

	// ── Loading state ──
	// Show a centered spinner while a conversation's history is being read
	// from disk (set by `chatStore.switchConversation`). The store clears
	// `messages` first so without this guard the pane would flash blank.
	if (isLoadingMessages && bubbleItems.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full w-full gap-3">
				<Spin size="large" />
				<div
					className="text-sm"
					style={{ color: token.colorTextSecondary }}
				>
					{t("loadingConversation", "正在加载对话...", { ns: "chat" })}
				</div>
			</div>
		);
	}

	const list = shouldVirtualizeMessageList(bubbleItems.length) ? (
		<VirtualBubbleList
			items={bubbleItems}
			roles={roles}
			contentStyle={bubbleContentStyle}
			isStreaming={isStreaming}
			onNearBottomChange={handleNearBottomChange}
			registerScrollToBottom={handleRegisterVirtualScrollToBottom}
		/>
	) : (
		<Bubble.List
			ref={bubbleListRef}
			items={bubbleItems}
			role={roles}
			autoScroll
			className="h-full"
			styles={bubbleListStyles}
		/>
	);

	return (
		<div className="relative h-full w-full">
			{list}
			{hasOlderMessages && (
				// Pinned to the top of the chat pane (above the scroll DOM, so
				// it stays put while the list virtualizes). Pill style with
				// soft border + subtle shadow — see `.chat-load-older-pill`.
				<div className="absolute left-0 right-0 top-3 flex justify-center pointer-events-none z-10">
					<button
						type="button"
						className="chat-load-older-pill pointer-events-auto"
						disabled={isLoadingOlderMessages}
						onClick={handleLoadOlderMessages}
					>
						<span className="chat-load-older-pill__icon">
							{isLoadingOlderMessages ? (
								<LoadingOutlined spin />
							) : (
								<HistoryOutlined />
							)}
						</span>
						<span>
							{isLoadingOlderMessages
								? t("loadingOlderMessages", "正在加载更早消息", {
										ns: "chat",
									})
								: t("loadOlderMessages", "查看更早消息", { ns: "chat" })}
						</span>
					</button>
				</div>
			)}
			<ScrollToBottomFab
				visible={!isAtBottom && bubbleItems.length > 0}
				onClick={handleScrollToBottom}
			/>
		</div>
	);
}
