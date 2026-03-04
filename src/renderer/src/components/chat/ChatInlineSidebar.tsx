import { ApiOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Badge, Button, Dropdown, Input, Tabs, theme } from "antd";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../stores/chatStore";
import type { ConversationSummary } from "../../types/electron";
import { ConversationItem } from "./ConversationItem";

const { useToken } = theme;

export function getDateGroup(
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
	visible: boolean;
	onNewChat: () => void;
	onNewRemoteChat?: () => void;
	newChatDisabled?: boolean;
	activeTab?: string;
	onTabChange?: (key: string) => void;
	unreadRemoteCount?: number;
	onSwitchToRemote?: (id: string) => void;
}

export function ChatSidebar({
	visible,
	onNewChat,
	onNewRemoteChat,
	newChatDisabled,
	activeTab,
	onTabChange,
	unreadRemoteCount = 0,
	onSwitchToRemote,
}: ChatSidebarProps) {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const [searchText, setSearchText] = useState("");
	const [remoteSearchText, setRemoteSearchText] = useState("");
	const [localTab, setLocalTab] = useState("conversations");

	const currentTab = activeTab ?? localTab;
	const handleTabChange = useCallback(
		(key: string) => {
			if (onTabChange) {
				onTabChange(key);
			} else {
				setLocalTab(key);
			}
		},
		[onTabChange],
	);

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

	const handleSwitchRemote = useCallback(
		(id: string) => {
			if (!isStreaming) {
				switchConversation(id);
				onSwitchToRemote?.(id);
			}
		},
		[isStreaming, switchConversation, onSwitchToRemote],
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
	}, [onNewChat]);

	const handleNewRemoteChat = useCallback(() => {
		onNewRemoteChat?.();
	}, [onNewRemoteChat]);

	// Filter and group conversations (local — all conversations)
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

	// Filter and group remote conversations (only those with remote binding)
	const groupedRemoteConversations = useMemo(() => {
		let filtered = conversations.filter((c) => c.remote);
		if (remoteSearchText.trim()) {
			const lower = remoteSearchText.toLowerCase();
			filtered = filtered.filter(
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
	}, [conversations, remoteSearchText, t]);

	const remoteConversationCount = useMemo(
		() => conversations.filter((c) => c.remote).length,
		[conversations],
	);

	const remoteTabLabel = useMemo(() => {
		const label = t("sidebar.remote", "Remote");
		if (unreadRemoteCount > 0) {
			return (
				<Badge count={unreadRemoteCount} size="small" offset={[6, -2]}>
					{label}
				</Badge>
			);
		}
		return label;
	}, [t, unreadRemoteCount]);

	const renderConversationList = useCallback(
		(
			groups: { label: string; items: ConversationSummary[] }[],
			totalCount: number,
			hasSearch: boolean,
			onItemClick: (id: string) => void,
		) => (
		<div className="flex-1 overflow-y-auto px-2 min-h-0">
			{groups.length === 0 && (
				<div
					className="text-center py-8 text-sm"
					style={{ color: token.colorTextTertiary }}
				>
					{totalCount === 0
						? t("sidebar.noConversations", "No conversations yet")
						: t("sidebar.noResults", "No matching conversations")}
				</div>
			)}

			{groups.map((group) => (
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
							onClick={() => onItemClick(conv.id)}
							onRename={(name) => handleRename(conv.id, name)}
							onDelete={() => handleDelete(conv.id)}
						/>
					))}
				</div>
			))}
		</div>
	), [token, t, currentConversationId, handleRename, handleDelete]);

	const tabItems = useMemo(
		() => [
			{
				key: "conversations",
				label: t("sidebar.conversations", "Conversations"),
				children: (
					<div className="flex flex-col h-full">
						{/* Search + New Chat */}
						<div className="flex items-center gap-2 px-3 py-3 shrink-0">
							<Input
								size="middle"
								prefix={
									<SearchOutlined
										style={{ color: token.colorTextQuaternary }}
									/>
								}
								placeholder={t("sidebar.searchConversations", "Search...")}
								value={searchText}
								onChange={(e) => setSearchText(e.target.value)}
								allowClear
								className="flex-1"
							/>
							{onNewRemoteChat ? (
								<Dropdown
									menu={{
										items: [
											{
												key: "normal",
												icon: <PlusOutlined />,
												label: t("sidebar.newChat", "New Chat"),
												onClick: handleNewChat,
											},
											{
												key: "remote",
												icon: <ApiOutlined />,
												label: t(
													"remoteChat.newRemoteSession",
													"New Remote Session",
												),
												onClick: handleNewRemoteChat,
											},
										],
									}}
									trigger={["click"]}
									disabled={newChatDisabled}
								>
									<Button
										type="primary"
										icon={<PlusOutlined />}
										disabled={newChatDisabled}
									/>
								</Dropdown>
							) : (
								<Button
									type="primary"
									icon={<PlusOutlined />}
									onClick={handleNewChat}
									disabled={newChatDisabled}
								/>
							)}
						</div>

						{/* Conversation list */}
						{renderConversationList(
							groupedConversations,
							conversations.length,
							!!searchText.trim(),
							handleSwitch,
						)}
					</div>
				),
			},
			{
				key: "remote",
				label: remoteTabLabel,
				children: (
					<div className="flex flex-col h-full">
						{/* Search + New Remote Chat */}
						<div className="flex items-center gap-2 px-3 py-3 shrink-0">
							<Input
								size="middle"
								prefix={
									<SearchOutlined
										style={{ color: token.colorTextQuaternary }}
									/>
								}
								placeholder={t("sidebar.searchConversations", "Search...")}
								value={remoteSearchText}
								onChange={(e) => setRemoteSearchText(e.target.value)}
								allowClear
								className="flex-1"
							/>
							<Button
								type="primary"
								icon={<PlusOutlined />}
								onClick={handleNewRemoteChat}
							/>
						</div>

						{/* Remote conversation list */}
						{renderConversationList(
							groupedRemoteConversations,
							remoteConversationCount,
							!!remoteSearchText.trim(),
							handleSwitchRemote,
						)}
					</div>
				),
			},
		],
		[
			t,
			token,
			searchText,
			remoteSearchText,
			onNewRemoteChat,
			newChatDisabled,
			handleNewChat,
			handleNewRemoteChat,
			groupedConversations,
			groupedRemoteConversations,
			conversations.length,
			remoteConversationCount,
			remoteTabLabel,
			handleSwitch,
			handleSwitchRemote,
			renderConversationList,
		],
	);

	if (!visible) return null;

	return (
		<div
			className="shrink-0 flex flex-col h-full"
			style={{
				width: 280,
				borderRight: `1px solid ${token.colorBorderSecondary}`,
				backgroundColor: token.colorBgContainer,
			}}
		>
			<Tabs
				activeKey={currentTab}
				onChange={handleTabChange}
				centered
				size="small"
				className="h-full [&_.ant-tabs-content]:flex-1 [&_.ant-tabs-content]:min-h-0 [&_.ant-tabs-content-holder]:flex-1 [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-tabpane]:h-full [&_.ant-tabs-content]:h-full flex flex-col"
				items={tabItems}
			/>
		</div>
	);
}
