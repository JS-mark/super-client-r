import { MessageOutlined } from "@ant-design/icons";
import { Empty, List, Tag, theme } from "antd";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../../../stores/chatStore";
import type { Message } from "../../../stores/chatStore";

const { useToken } = theme;

interface QuotePanelProps {
	onSelect: (message: Message) => void;
	onClose: () => void;
}

/** Truncate text to maxLen characters */
function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen)}...`;
}

export function QuotePanel({ onSelect, onClose }: QuotePanelProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const messages = useChatStore((s) => s.messages);

	// Show user and assistant messages only, most recent first
	const quotableMessages = useMemo(
		() =>
			messages
				.filter(
					(m) =>
						(m.role === "user" || m.role === "assistant") &&
						m.content.trim().length > 0,
				)
				.reverse(),
		[messages],
	);

	const handleSelect = useCallback(
		(msg: Message) => {
			onSelect(msg);
			onClose();
		},
		[onSelect, onClose],
	);

	return (
		<div
			style={{
				backgroundColor: token.colorBgElevated,
				border: `1px solid ${token.colorBorderSecondary}`,
				maxHeight: 320,
				overflow: "auto",
			}}
			className="rounded-lg"
		>
			<div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700">
				<MessageOutlined style={{ color: token.colorPrimary }} />
				<span className="text-sm font-medium">
					{t("toolbar.quoteTitle", "Quote Message", { ns: "chat" })}
				</span>
				<Tag color="blue" className="ml-auto">
					{quotableMessages.length}
				</Tag>
			</div>

			{quotableMessages.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t(
						"toolbar.noMessages",
						"No messages to quote",
						{ ns: "chat" },
					)}
					className="py-6"
				/>
			) : (
				<List
					dataSource={quotableMessages}
					split={false}
					renderItem={(msg) => (
						<List.Item
							className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 px-3! py-2!"
							onClick={() => handleSelect(msg)}
						>
							<List.Item.Meta
								title={
									<span className="text-xs text-gray-400">
										{msg.role === "user"
											? t("quote.you", "You", { ns: "chat" })
											: t("quote.assistant", "AI", {
													ns: "chat",
												})}
										{" · "}
										{new Date(msg.timestamp).toLocaleTimeString(
											[],
											{ hour: "2-digit", minute: "2-digit" },
										)}
									</span>
								}
								description={
									<span className="text-sm">
										{truncate(msg.content, 120)}
									</span>
								}
							/>
						</List.Item>
					)}
				/>
			)}
		</div>
	);
}
