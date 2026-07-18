/**
 * CompactedSummaryCard — Inline card surfacing a context-compaction event.
 *
 * Renders the structured `metadata.contextCompacted` payload attached to an
 * assistant message. The send pipeline writes this metadata when the history
 * strategy summarizes older turns to fit the token budget; this card makes
 * that event first-class in the chat message list (previously it was only
 * visible in the Context Inspector sidebar).
 *
 * Visual language mirrors the Context Inspector's compact-event rendering:
 * `CompressOutlined` icon + `<Tag color="gold">` (the established amber/gold
 * affordance for compaction). See ContextInspectorSection.tsx:301,373.
 */

import { CompressOutlined } from "@ant-design/icons";
import { Tag, theme } from "antd";
import { useTranslation } from "react-i18next";
import type { Message } from "../../stores/chatMessageStore";

const { useToken } = theme;

export interface CompactedSummaryCardProps {
	message: Message;
}

export function CompactedSummaryCard({ message }: CompactedSummaryCardProps) {
	const { t } = useTranslation();
	const { token } = useToken();

	const compacted = message.metadata?.contextCompacted;
	// Defensive: the list only invokes this card when the payload exists, but
	// guard so a stray render produces nothing instead of a broken shell.
	if (!compacted) return null;

	// Amber/gold accent consistent with the Context Inspector's compact-event
	// affordance (`Tag color="gold"` + CompressOutlined).
	const accent = "#faad14";
	const bg = "rgba(250, 173, 20, 0.08)";
	const border = "rgba(250, 173, 20, 0.35)";

	const label = t("compactedSummaryCard.label", "{{count}} messages compacted", {
		ns: "chat",
		count: compacted.originalCount,
	});

	return (
		<div
			data-testid="compacted-summary-card"
			style={{
				width: "100%",
				border: `1px solid ${border}`,
				borderLeft: `3px solid ${accent}`,
				borderRadius: token.borderRadiusLG,
				background: bg,
				padding: "10px 12px",
				boxSizing: "border-box",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: compacted.summary ? 6 : 0,
				}}
			>
				<CompressOutlined style={{ color: accent, fontSize: 16, flexShrink: 0 }} />
				<Tag color="gold" style={{ marginInlineEnd: 0 }}>
					{label}
				</Tag>
			</div>
			{compacted.summary ? (
				<div
					style={{
						fontSize: 13,
						lineHeight: 1.5,
						color: token.colorText,
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
					}}
				>
					{compacted.summary}
				</div>
			) : null}
		</div>
	);
}
