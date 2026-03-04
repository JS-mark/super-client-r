/**
 * Remote Badge
 *
 * Displays the remote binding status for a conversation.
 * Shows platform icon, bot name, and provides unbind action.
 */

import { ApiOutlined, CloseOutlined } from "@ant-design/icons";
import { Popconfirm, Tag, Tooltip, theme } from "antd";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { RemoteBinding } from "../../types/electron";

const { useToken } = theme;

const PLATFORM_COLORS: Record<string, string> = {
	telegram: "blue",
	dingtalk: "cyan",
	lark: "purple",
};

const PLATFORM_LABELS: Record<string, string> = {
	telegram: "TG",
	dingtalk: "DD",
	lark: "Lark",
};

interface RemoteBadgeProps {
	binding: RemoteBinding;
	onUnbind: () => void;
}

export function RemoteBadge({ binding, onUnbind }: RemoteBadgeProps) {
	const { t } = useTranslation("chat");

	const handleUnbind = useCallback(() => {
		onUnbind();
	}, [onUnbind]);

	const platformLabel = PLATFORM_LABELS[binding.platform] || binding.platform;
	const platformColor = PLATFORM_COLORS[binding.platform] || "default";

	return (
		<Tooltip
			title={t("remoteChat.boundTo", {
				defaultValue: "Bridged to {{bot}} ({{chatId}})",
				bot: binding.botName,
				chatId: binding.chatId,
			})}
		>
			<Tag
				color={platformColor}
				className="flex items-center gap-1 cursor-pointer"
				style={{ margin: 0 }}
			>
				<ApiOutlined className="text-xs" />
				<span className="text-xs">
					{platformLabel} · {binding.botName}
				</span>
				<Popconfirm
					title={t("remoteChat.unbindConfirm", "Unbind this bot?")}
					onConfirm={handleUnbind}
					okText={t("remoteChat.unbind", "Unbind")}
					cancelText={t("remoteChat.cancel", "Cancel")}
					placement="bottom"
				>
					<CloseOutlined
						className="text-xs ml-0.5 opacity-60 hover:opacity-100"
						onClick={(e) => e.stopPropagation()}
					/>
				</Popconfirm>
			</Tag>
		</Tooltip>
	);
}

/**
 * Small inline indicator for conversation list items
 */
export function RemoteIndicator() {
	const { token } = useToken();
	return (
		<ApiOutlined
			className="text-xs"
			style={{ color: token.colorPrimary }}
		/>
	);
}
