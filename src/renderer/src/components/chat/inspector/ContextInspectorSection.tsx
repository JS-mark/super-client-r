/**
 * ContextInspectorSection — read-only "Context / 上下文" section that
 * lives inside the right-side CodexEnvironmentInspector panel.
 *
 * Round-5 R10 MVP scope:
 *   - Token budget bar reading useContextUsage; hidden when budget is
 *     unknown (only text shows).
 *   - Injected-sources chips (system prompt, project rules placeholder,
 *     attachments).
 *   - Compact-event log (only real markers; no synthetic entries).
 *   - Empty state when no injected sources beyond the system prompt.
 *   - Chip → antd Tooltip carrying source + byte count.
 *
 * NOT in scope for this round:
 *   - Compact triggers.
 *   - Memory editing.
 *   - Reading AGENTS.md / CLAUDE.md content (deferred to a later batch).
 *
 * The section is rendered by the parent Collapse in
 * `CodexEnvironmentInspector`, so we only need to return the *body*
 * (children) here — the collapsible header + fold state is owned by the
 * parent Collapse (which persists its state via CodexEnvironmentInspector's
 * defaultActiveKey).
 */

import {
	FileTextOutlined,
	FolderOpenOutlined,
	PaperClipOutlined,
	CompressOutlined,
	SearchOutlined,
	HistoryOutlined,
	ToolOutlined,
	PushpinFilled,
	PushpinOutlined,
} from "@ant-design/icons";
import { Progress, Tag, Tooltip, theme } from "antd";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useContextUsage } from "../../../hooks/useContextUsage";
import {
	type ContextSourceEntry,
	type ContextSourceKind,
	toggleContextSourcePinned,
	useContextInspectorData,
} from "../../../hooks/useContextInspectorData";
import { useChatMessageStore } from "../../../stores/chatMessageStore";

const { useToken } = theme;

/** 1024-based byte formatter, matches the parent inspector style. */
export function formatBytes(n: number | undefined): string {
	if (n == null) return "";
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
	return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

/** Locale-neutral token formatter that keeps parity with ContextUsagePill. */
export function formatTokenCount(n: number): string {
	if (!Number.isFinite(n) || n < 0) return "0";
	if (n >= 10_000) {
		const wan = n / 10_000;
		return `${wan.toFixed(wan >= 100 ? 0 : 1)}万`;
	}
	return n.toLocaleString();
}

function iconForKind(kind: ContextSourceKind): React.ReactNode {
	switch (kind) {
		case "systemPrompt":
			return <FileTextOutlined />;
		case "projectRules":
			return <FolderOpenOutlined />;
		case "attachment":
			return <PaperClipOutlined />;
		case "search":
			return <SearchOutlined />;
		case "history":
			return <HistoryOutlined />;
		case "other":
			return <ToolOutlined />;
		default:
			return <PaperClipOutlined />;
	}
}

interface SourceRowProps {
	entry: ContextSourceEntry;
	onTogglePinned?: (sourceId: string, pinned: boolean) => void;
	pinLabel: string;
	unpinLabel: string;
}

function SourceRow({
	entry,
	onTogglePinned,
	pinLabel,
	unpinLabel,
}: SourceRowProps) {
	const { token } = useToken();
	const detailBits: string[] = [];
	if (entry.detail) detailBits.push(entry.detail);
	if (entry.bytes != null) detailBits.push(formatBytes(entry.bytes));
	const tooltip =
		detailBits.length > 0
			? `${entry.label} · ${detailBits.join(" · ")}`
			: entry.label;
	return (
		<Tooltip title={tooltip} placement="left">
			<div
				className="flex items-center gap-2"
				data-testid="context-source-row"
				data-kind={entry.kind}
				style={{
					fontSize: 12,
					padding: "4px 0",
					color: token.colorText,
				}}
			>
				<span style={{ flexShrink: 0 }}>{iconForKind(entry.kind)}</span>
				<span
					className="truncate"
					title={entry.label}
					style={{ flex: 1, minWidth: 0 }}
				>
					{entry.label}
				</span>
				{entry.bytes != null && (
					<span style={{ color: token.colorTextSecondary, fontSize: 11 }}>
						{formatBytes(entry.bytes)}
					</span>
				)}
				{onTogglePinned && (
					<button
						type="button"
						aria-label={entry.pinned ? unpinLabel : pinLabel}
						title={entry.pinned ? unpinLabel : pinLabel}
						data-testid="context-source-pin-toggle"
						data-pinned={entry.pinned ? "true" : "false"}
						onClick={(event) => {
							event.stopPropagation();
							onTogglePinned(entry.id, !entry.pinned);
						}}
						style={{
							alignItems: "center",
							background: "transparent",
							border: 0,
							color: entry.pinned
								? token.colorPrimary
								: token.colorTextTertiary,
							cursor: "pointer",
							display: "inline-flex",
							height: 22,
							justifyContent: "center",
							padding: 0,
							width: 22,
						}}
					>
						{entry.pinned ? <PushpinFilled /> : <PushpinOutlined />}
					</button>
				)}
			</div>
		</Tooltip>
	);
}

export interface ContextInspectorSectionProps {
	/** Optional override used exclusively by tests to bypass i18n init. */
	testOverrides?: {
		systemPromptLabel?: string;
		projectRulesLabel?: string;
	};
}

export function ContextInspectorSection(props: ContextInspectorSectionProps = {}) {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const usage = useContextUsage();
	const updateMessageMetadata = useChatMessageStore(
		(s) => s.updateMessageMetadata,
	);

	const systemPromptLabel =
		props.testOverrides?.systemPromptLabel ??
		t("contextInspector.chips.systemPrompt", "System prompt");
	const projectRulesLabel =
		props.testOverrides?.projectRulesLabel ??
		t("contextInspector.chips.projectRules", "Project rules: AGENTS.md");

	const data = useContextInspectorData({
		systemPromptLabel,
		projectRulesLabel,
	});

	const handleTogglePinned = useCallback(
		(sourceId: string, pinned: boolean) => {
			if (!data.latestContextMessageId) return;
			const messages = useChatMessageStore.getState().messages;
			const sourceMessage = messages.find(
				(message) => message.id === data.latestContextMessageId,
			);
			const sources = sourceMessage?.metadata?.contextSources;
			if (!sources?.length) return;
			updateMessageMetadata(data.latestContextMessageId, {
				contextSources: toggleContextSourcePinned(sources, sourceId, pinned),
			});
		},
		[data.latestContextMessageId, updateMessageMetadata],
	);

	const hasBudget = usage.contextWindow != null && usage.contextWindow > 0;
	const percent =
		hasBudget && usage.contextWindow
			? Math.min(100, Math.round((usage.usedTokens / usage.contextWindow) * 1000) / 10)
			: 0;

	// "Empty" means the ONLY source is the system-prompt chip AND no
	// compact events exist. The system-prompt chip is always present so
	// we don't want to hide it — instead we still show it but surface a
	// small hint below.
	const injectedBesidesSystem = data.sources.filter(
		(s) => s.kind !== "systemPrompt",
	);
	const isEmpty =
		injectedBesidesSystem.length === 0 && data.compactEvents.length === 0;

	const subHeaderStyle: React.CSSProperties = {
		fontSize: 11,
		fontWeight: 600,
		textTransform: "uppercase",
		letterSpacing: 0.4,
		color: token.colorTextTertiary,
		marginTop: 8,
		marginBottom: 4,
	};
	const strategy = data.strategy;

	return (
		<div className="flex flex-col" data-testid="context-inspector-section">
			{/* Token budget block */}
			<div
				className="flex items-center justify-between"
				style={{ fontSize: 12, marginBottom: hasBudget ? 4 : 8 }}
			>
				<span style={{ color: token.colorTextSecondary }}>
					{t("contextInspector.budget.label", "Token budget")}
				</span>
				<span
					style={{
						color: token.colorText,
						fontVariantNumeric: "tabular-nums",
					}}
					data-testid="context-budget-usage"
				>
					{hasBudget && usage.contextWindow != null
						? `${formatTokenCount(usage.usedTokens)} / ${formatTokenCount(usage.contextWindow)}`
						: formatTokenCount(usage.usedTokens)}
				</span>
			</div>
			{hasBudget && (
				<Progress
					percent={percent}
					showInfo={false}
					size="small"
					style={{ marginBottom: 8 }}
					data-testid="context-budget-bar"
				/>
			)}
			{!hasBudget && (
				<div
					style={{
						fontSize: 11,
						color: token.colorTextTertiary,
						marginBottom: 8,
					}}
					data-testid="context-budget-unknown"
				>
					{t(
						"contextInspector.budget.unknown",
						"Model context window unknown",
					)}
				</div>
			)}

			{strategy && (
				<div
					className="flex flex-col gap-1"
					style={{
						fontSize: 12,
						padding: "6px 0",
						marginBottom: 4,
						color: token.colorText,
					}}
					data-testid="context-strategy"
				>
					<div className="flex items-center justify-between gap-2">
						<span style={{ color: token.colorTextSecondary }}>
							{t("contextInspector.strategy.label", "History strategy")}
						</span>
						<Tag style={{ fontSize: 11 }} color={strategy.compacted ? "gold" : "default"}>
							{t(
								`contextInspector.strategy.${strategy.strategy}`,
								strategy.strategy,
							)}
						</Tag>
					</div>
					<div style={{ color: token.colorTextTertiary, fontSize: 11 }}>
						{t(
							"contextInspector.strategy.detail",
							"{{historyCount}} sent · {{omittedCount}} omitted",
							{
								historyCount: strategy.historyCount,
								omittedCount: strategy.omittedCount,
							},
						)}
					</div>
				</div>
			)}

			{/* Sources */}
			<div style={subHeaderStyle}>
				{t("contextInspector.sources.header", "Injected sources")}
			</div>
			<div className="flex flex-col">
				{data.sources.map((entry) => (
					<SourceRow
						key={entry.id}
						entry={entry}
						onTogglePinned={
							data.latestContextMessageId ? handleTogglePinned : undefined
						}
						pinLabel={t("contextInspector.sources.pin", "Pin source")}
						unpinLabel={t("contextInspector.sources.unpin", "Unpin source")}
					/>
				))}
			</div>

			{isEmpty && (
				<div
					style={{
						fontSize: 12,
						color: token.colorTextTertiary,
						padding: "6px 0",
					}}
					data-testid="context-empty-hint"
				>
					{t(
						"contextInspector.emptyHint",
						"No files or project rules injected yet.",
					)}
				</div>
			)}

			{/* Compact events — only rendered when at least one exists */}
			{data.compactEvents.length > 0 && (
				<>
					<div style={subHeaderStyle}>
						{t("contextInspector.compact.header", "Compact events")}
					</div>
					<div className="flex flex-col">
						{data.compactEvents.map((event) => (
							<div
								key={event.id}
								className="flex items-center gap-2"
								style={{
									fontSize: 12,
									padding: "4px 0",
									color: token.colorText,
								}}
								data-testid="context-compact-event"
							>
								<CompressOutlined style={{ color: token.colorTextSecondary }} />
								<span
									className="truncate"
									title={event.summary ?? ""}
									style={{ flex: 1, minWidth: 0 }}
								>
									{event.summary ??
										t("contextInspector.compact.defaultSummary", "Context compacted")}
								</span>
								<Tag
									style={{ fontSize: 11 }}
									color="default"
								>
									{new Date(event.timestamp).toLocaleTimeString()}
								</Tag>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}

export default ContextInspectorSection;
