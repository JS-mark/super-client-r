import {
	ApiOutlined,
	DeleteOutlined,
	EyeOutlined,
	ReloadOutlined,
	SyncOutlined,
} from "@ant-design/icons";
import { Button, Card, Modal, message, Tag, Tooltip } from "antd";
import type * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer } from "../../types/mcp";
import { McpStatusBadge } from "./McpStatusBadge";

export const InstalledMcpCard: React.FC<{
	server: McpServer;
	onView: () => void;
}> = ({ server, onView }) => {
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
			className="h-full flex flex-col cursor-pointer"
			onClick={onView}
			title={
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
						<ApiOutlined className="text-white text-sm" />
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
					<Tag>{server.transport}</Tag>
					<div className="flex gap-1">
						<Tooltip title={t("actions.test", { ns: "mcp" })}>
							<Button
								size="small"
								type="text"
								icon={<EyeOutlined />}
								onClick={handleTest}
								loading={testing}
							/>
						</Tooltip>
						<Tooltip
							title={
								server.enabled
									? t("actions.disable", { ns: "mcp" })
									: t("actions.enable", { ns: "mcp" })
							}
						>
							<Button
								size="small"
								type="text"
								icon={server.enabled ? <SyncOutlined /> : <ReloadOutlined />}
								onClick={handleToggle}
							/>
						</Tooltip>
						<Tooltip title={t("actions.delete", { ns: "common" })}>
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
