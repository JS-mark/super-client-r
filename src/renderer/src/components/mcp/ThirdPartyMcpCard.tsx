import { DeleteOutlined, EditOutlined, EyeOutlined, GlobalOutlined, LinkOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { Button, Card, Modal, Tag, Tooltip, message } from "antd";
import type * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer } from "../../types/mcp";
import { McpStatusBadge } from "./McpStatusBadge";

export const ThirdPartyMcpCard: React.FC<{
	server: McpServer;
	onEdit: () => void;
}> = ({ server, onEdit }) => {
	const { t } = useTranslation();
	const { removeServer, toggleServer, testConnection } = useMcpStore();
	const [testing, setTesting] = useState(false);

	const handleDelete = (e: React.MouseEvent) => {
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
	};

	const handleToggle = async (e: React.MouseEvent) => {
		e.stopPropagation();
		toggleServer(server.id);
	};

	const handleTest = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setTesting(true);
		try {
			await testConnection(server.id);
			message.success(t("messages.testSuccess", { ns: "mcp" }));
		} catch {
			message.error(t("messages.testFailed", { ns: "mcp" }));
		} finally {
			setTesting(false);
		}
	};

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
			actions={[
				<Tooltip title={t("actions.test", { ns: "mcp" })} key="test">
					<Button
						size="small"
						type="text"
						icon={<EyeOutlined />}
						onClick={handleTest}
						loading={testing}
					/>
				</Tooltip>,
				<Tooltip title={server.enabled ? t("actions.disable", { ns: "mcp" }) : t("actions.enable", { ns: "mcp" })} key="toggle">
					<Button
						size="small"
						type="text"
						icon={server.enabled ? <SyncOutlined /> : <ReloadOutlined />}
						onClick={handleToggle}
					/>
				</Tooltip>,
				<Tooltip title={t("actions.edit", { ns: "common" })} key="edit">
					<Button
						size="small"
						type="text"
						icon={<EditOutlined />}
						onClick={onEdit}
					/>
				</Tooltip>,
				<Tooltip title={t("actions.delete", { ns: "common" })} key="delete">
					<Button
						size="small"
						type="text"
						danger
						icon={<DeleteOutlined />}
						onClick={handleDelete}
					/>
				</Tooltip>,
			]}
		>
			<div className="flex flex-col h-24 justify-between">
				<div className="text-sm text-gray-500">
					<p className="line-clamp-2">{server.description || "-"}</p>
				</div>
				<div className="flex justify-between items-center mt-2">
					<Tag color="green">{server.transport}</Tag>
					{server.url && (
						<div className="flex items-center gap-1 text-xs text-gray-400 truncate max-w-[150px]">
							<LinkOutlined />
							<span className="truncate">{server.url}</span>
						</div>
					)}
					{server.command && (
						<div className="flex items-center gap-1 text-xs text-gray-400 truncate max-w-[150px]">
							<span className="truncate">{server.command}</span>
						</div>
					)}
				</div>
			</div>
		</Card>
	);
};
