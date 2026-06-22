import { ClockCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { Empty, Input, List, Modal, theme } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../../stores/chatStore";
import type { ConversationSummary } from "../../types/electron";

const { useToken } = theme;

interface GlobalSessionSearchModalProps {
	open: boolean;
	onClose: () => void;
}

/**
 * 过滤 conversation 列表：title + preview 包含 query（不区分大小写）。
 * 空 query 返回全部。
 */
export function filterConversations(
	list: ConversationSummary[],
	query: string,
): ConversationSummary[] {
	const q = query.trim().toLowerCase();
	if (!q) return list;
	return list.filter((conv) => {
		const title = (conv.name ?? "").toLowerCase();
		const preview = (conv.preview ?? "").toLowerCase();
		return title.includes(q) || preview.includes(q);
	});
}

function formatRelativeTime(ts: number): string {
	if (!ts) return "";
	const diff = Date.now() - ts;
	if (diff < 60_000) return "刚刚";
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes}分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}小时前`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}天前`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}个月前`;
	const years = Math.floor(months / 12);
	return `${years}年前`;
}

export function GlobalSessionSearchModal({
	open,
	onClose,
}: GlobalSessionSearchModalProps) {
	const { token } = useToken();
	const navigate = useNavigate();
	const conversations = useChatStore((s) => s.conversations);
	const switchConversation = useChatStore((s) => s.switchConversation);

	const [query, setQuery] = useState("");
	const inputDomRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (open) {
			setQuery("");
			requestAnimationFrame(() => {
				inputDomRef.current?.focus();
			});
		}
	}, [open]);

	const results = useMemo(
		() => filterConversations(conversations, query),
		[conversations, query],
	);

	const handleSelect = async (convId: string) => {
		onClose();
		navigate("/chat");
		await switchConversation(convId);
	};

	return (
		<Modal
			open={open}
			onCancel={onClose}
			footer={null}
			width={600}
			destroyOnHidden
			title="搜索会话"
		>
			<Input
				ref={(el) => {
					if (el) {
						const dom = (el as unknown as { input?: HTMLInputElement }).input;
						inputDomRef.current = dom ?? null;
					}
				}}
				prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
				placeholder="按 title 或 preview 搜索…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				size="large"
				autoFocus
			/>
			<div style={{ marginTop: 12, maxHeight: 400, overflowY: "auto" }}>
				{results.length === 0 ? (
					<Empty
						description={query ? "无匹配会话" : "暂无会话"}
						style={{ padding: "32px 0" }}
					/>
				) : (
					<List
						dataSource={results}
						renderItem={(conv) => (
							<List.Item
								onClick={() => handleSelect(conv.id)}
								style={{ cursor: "pointer", padding: "10px 12px" }}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = token.colorFillTertiary;
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = "transparent";
								}}
							>
								<List.Item.Meta
									title={conv.name || "未命名会话"}
									description={
										<div className="flex items-center gap-2 text-xs">
											<ClockCircleOutlined
												style={{ color: token.colorTextTertiary }}
											/>
											<span style={{ color: token.colorTextTertiary }}>
												{formatRelativeTime(conv.updatedAt)}
											</span>
											{conv.preview && (
												<span
													style={{
														color: token.colorTextSecondary,
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
														maxWidth: 360,
													}}
												>
													· {conv.preview}
												</span>
											)}
										</div>
									}
								/>
							</List.Item>
						)}
					/>
				)}
			</div>
		</Modal>
	);
}
