import {
	DeleteOutlined,
	DisconnectOutlined,
	EditOutlined,
	GlobalOutlined,
	LinkOutlined,
	PlayCircleOutlined,
} from "@ant-design/icons";
import { Button, Modal, Tag, Tooltip, message, theme } from "antd";
import type * as React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer } from "../../types/mcp";
import { McpStatusBadge } from "./McpStatusBadge";

const { useToken } = theme;

export const ThirdPartyMcpCard: React.FC<{
	server: McpServer;
	onEdit: () => void;
}> = ({ server, onEdit }) => {
	const { t } = useTranslation();
	const { token } = useToken();
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

	const iconBg = isConnected
		? `linear-gradient(135deg, ${token.colorSuccess}, ${token.colorSuccessActive})`
		: token.colorFillSecondary;

	return (
		<div
			className="group relative flex flex-col rounded-xl border cursor-pointer transition-all duration-200"
			style={{
				borderColor: token.colorBorderSecondary,
				backgroundColor: token.colorBgContainer,
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.borderColor = token.colorPrimaryBorder;
				e.currentTarget.style.boxShadow = token.boxShadowTertiary;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.borderColor = token.colorBorderSecondary;
				e.currentTarget.style.boxShadow = "none";
			}}
		>
			{/* Header */}
			<div className="flex items-start gap-3 p-4 pb-2">
				<div
					className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
					style={{ background: iconBg }}
				>
					<GlobalOutlined style={{ color: isConnected ? "#fff" : token.colorTextTertiary, fontSize: 16 }} />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span
							className="font-semibold text-sm truncate"
							style={{ color: token.colorText }}
							title={server.name}
						>
							{server.name}
						</span>
					</div>
					<div className="flex items-center gap-1.5 mt-1">
						<McpStatusBadge status={server.status} />
					</div>
				</div>
			</div>

			{/* Description */}
			<div className="px-4 flex-1">
				<p
					className="text-xs line-clamp-2 leading-relaxed m-0"
					style={{ color: token.colorTextSecondary }}
				>
					{server.description || "-"}
				</p>
				{(server.url || server.command) && (
					<div
						className="flex items-center gap-1 mt-1.5 text-xs truncate"
						style={{ color: token.colorTextQuaternary }}
						title={server.url || server.command}
					>
						<LinkOutlined style={{ fontSize: 10, flexShrink: 0 }} />
						<span className="truncate">{server.url || server.command}</span>
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="px-4 py-3 flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Tag bordered={false} color="green" className="!text-xs !px-1.5 !py-0 !m-0 !rounded">
						{server.transport}
					</Tag>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
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
								icon={<PlayCircleOutlined style={server.status === "error" ? { color: token.colorError } : undefined} />}
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
	);
};
