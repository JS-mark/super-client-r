import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Drawer, Input, theme } from "antd";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../stores/chatStore";
import type { ConversationSummary } from "../../types/electron";
import { ConversationItem } from "./ConversationItem";

const { useToken } = theme;

function getDateGroup(
	timestamp: number,
	t: (key: string, defaultValue: string) => string,
): string {
	const now = new Date();
	const todayStart = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	).getTime();
	const yesterdayStart = todayStart - 86400000;
	const last7Start = todayStart - 86400000 * 7;
	const last30Start = todayStart - 86400000 * 30;

	if (timestamp >= todayStart) return t("sidebar.today", "Today");
	if (timestamp >= yesterdayStart) return t("sidebar.yesterday", "Yesterday");
	if (timestamp >= last7Start) return t("sidebar.last7Days", "Last 7 Days");
	if (timestamp >= last30Start) return t("sidebar.last30Days", "Last 30 Days");
	return t("sidebar.older", "Older");
}

interface ChatSidebarProps {
	open: boolean;
	onClose: () => void;
	onNewChat: () => void;
}

export function ChatSidebar({ open, onClose, onNewChat }: ChatSidebarProps) {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const [searchText, setSearchText] = useState("");

	const {
		conversations,
		currentConversationId,
		isStreaming,
		switchConversation,
		deleteConversation,
		renameConversation,
	} = useChatStore();

	const handleSwitch = useCallback(
		(id: string) => {
			if (!isStreaming) {
				switchConversation(id);
			}
		},
		[isStreaming, switchConversation],
	);

	const handleRename = useCallback(
		(id: string, name: string) => {
			renameConversation(id, name);
		},
		[renameConversation],
	);

	const handleDelete = useCallback(
		(id: string) => {
			deleteConversation(id);
		},
		[deleteConversation],
	);

	const handleNewChat = useCallback(() => {
		onNewChat();
		onClose();
	}, [onNewChat, onClose]);

	// Filter and group conversations
	const groupedConversations = useMemo(() => {
		let filtered = conversations;
		if (searchText.trim()) {
			const lower = searchText.toLowerCase();
			filtered = conversations.filter(
				(c) =>
					c.name.toLowerCase().includes(lower) ||
					c.preview.toLowerCase().includes(lower),
			);
		}

		const groups: { label: string; items: ConversationSummary[] }[] = [];
		const groupMap = new Map<string, ConversationSummary[]>();

		for (const conv of filtered) {
			const label = getDateGroup(conv.updatedAt, t);
			if (!groupMap.has(label)) {
				groupMap.set(label, []);
			}
			groupMap.get(label)!.push(conv);
		}

		for (const [label, items] of groupMap) {
			groups.push({ label, items });
		}

		return groups;
	}, [conversations, searchText, t]);

	return (
		<Drawer
			title={null}
			placement="right"
			size={320}
			open={open}
			onClose={onClose}
			closable={false}
			styles={{
				wrapper: { WebkitAppRegion: "no-drag" } as React.CSSProperties,
				body: {
					padding: 0,
					display: "flex",
					flexDirection: "column",
					height: "100%",
				},
				header: { display: "none" },
			}}
		>
			<div className="flex flex-col h-full">
				{/* Search + New Chat */}
				<div className="flex items-center gap-2 px-3 py-3 shrink-0">
					<Input
						size="middle"
						prefix={
							<SearchOutlined style={{ color: token.colorTextQuaternary }} />
						}
						placeholder={t("sidebar.searchConversations", "Search...")}
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
						allowClear
						className="flex-1"
					/>
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={handleNewChat}
					/>
				</div>

				{/* Conversation list */}
				<div className="flex-1 overflow-y-auto px-2">
					{groupedConversations.length === 0 && (
						<div
							className="text-center py-8 text-sm"
							style={{ color: token.colorTextTertiary }}
						>
							{conversations.length === 0
								? t("sidebar.noConversations", "No conversations yet")
								: t("sidebar.noResults", "No matching conversations")}
						</div>
					)}

					{groupedConversations.map((group) => (
						<div key={group.label} className="mb-2">
							<div
								className="text-xs font-medium px-3 py-1.5"
								style={{ color: token.colorTextQuaternary }}
							>
								{group.label}
							</div>
							{group.items.map((conv) => (
								<ConversationItem
									key={conv.id}
									conversation={conv}
									isActive={conv.id === currentConversationId}
									onClick={() => handleSwitch(conv.id)}
									onRename={(name) => handleRename(conv.id, name)}
									onDelete={() => handleDelete(conv.id)}
								/>
							))}
						</div>
					))}
				</div>
			</div>
		</Drawer>
	);
}
