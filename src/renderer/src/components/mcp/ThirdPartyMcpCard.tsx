import {
	DeleteOutlined,
	DisconnectOutlined,
	EditOutlined,
	GlobalOutlined,
	LinkOutlined,
	PlayCircleOutlined,
} from "@ant-design/icons";
import { Button, Card, Modal, message, Tag, Tooltip } from "antd";
import type * as React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer } from "../../types/mcp";
import { McpStatusBadge } from "./McpStatusBadge";

export const ThirdPartyMcpCard: React.FC<{
	server: McpServer;
	onEdit: () => void;
}> = ({ server, onEdit }) => {
	const { t } = useTranslation();
	const { removeServer, testConnection, disconnectServer } = useMcpStore();
	const [connecting, setConnecting] = useState(false);

	const handleDelete = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		Modal.confirm({
			title: t("confirm.delete", { ns: "mcp" }),
			content: t("confirm.deleteContent", { name: server.name, ns: "mcp" }),
			onOk: () => {
				removeServer(server.id);
				message.success(
					t("messages.deleted", { ns: "mcp", name: server.name }),
				);
			},
		});
	}, [removeServer, server.id, server.name, t]);

	const handleConnect = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		setConnecting(true);
		try {
			await testConnection(server.id);
			message.success(t("messages.connectSuccess", { ns: "mcp" }));
		} catch {
			message.error(t("messages.connectError", { ns: "mcp" }));
		} finally {
			setConnecting(false);
		}
	}, [testConnection, server.id, t]);

	const handleDisconnect = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await disconnectServer(server.id);
			message.success(t("messages.disconnectSuccess", { ns: "mcp" }));
		} catch {
			message.error(t("messages.disconnectError", { ns: "mcp" }));
		}
	}, [disconnectServer, server.id, t]);

	const isConnected = server.status === "connected";
	const isConnecting = server.status === "connecting" || connecting;

	return (
		<Card
			hoverable
			className="h-full flex flex-col"
			title={
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
						<GlobalOutlined className="text-white text-sm" />
					</div>
					<span className="truncate" title={server.name}>
						{server.name}
					</span>
				</div>
			}
			extra={
				<div className="flex items-center gap-2">
					<McpStatusBadge status={server.status} />
				</div>
			}
		>
			<div className="flex flex-col h-24 justify-between">
				<div className="text-sm text-gray-500">
					<p className="line-clamp-2">{server.description || "-"}</p>
				</div>
				<div className="flex justify-between items-center mt-2">
					<div className="flex items-center gap-2">
						<Tag color="green">{server.transport}</Tag>
						{server.url && (
							<div className="flex items-center gap-1 text-xs text-gray-400 truncate max-w-[120px]">
								<LinkOutlined />
								<span className="truncate">{server.url}</span>
							</div>
						)}
						{server.command && (
							<span className="text-xs text-gray-400 truncate max-w-[120px]">
								{server.command}
							</span>
						)}
					</div>
					<div className="flex gap-1">
						{isConnected ? (
							<Tooltip title={t("actions.disconnect", { ns: "mcp" })}>
								<Button
									size="small"
									type="text"
									icon={<DisconnectOutlined />}
									onClick={handleDisconnect}
								/>
							</Tooltip>
						) : (
							<Tooltip
								title={
									server.status === "error" && server.error
										? server.error
										: t("actions.connect", { ns: "mcp" })
								}
							>
								<Button
									size="small"
									type="text"
									icon={<PlayCircleOutlined style={server.status === "error" ? { color: "#ff4d4f" } : undefined} />}
									onClick={handleConnect}
									loading={isConnecting}
								/>
							</Tooltip>
						)}
						<Tooltip title={t("edit", { ns: "mcp" })}>
							<Button
								size="small"
								type="text"
								icon={<EditOutlined />}
								onClick={onEdit}
							/>
						</Tooltip>
						<Tooltip title={t("actions.delete", { ns: "mcp" })}>
							<Button
								size="small"
								type="text"
								danger
								icon={<DeleteOutlined />}
								onClick={handleDelete}
							/>
						</Tooltip>
					</div>
				</div>
			</div>
		</Card>
	);
};
