import { CloudDownloadOutlined, DeleteOutlined, DownloadOutlined, StarFilled } from "@ant-design/icons";
import { Badge, Button, Card, Tag, Tooltip, message } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpMarketItem } from "../../types/mcp";

export const McpMarketCard: React.FC<{
	item: McpMarketItem;
	onClick: () => void;
	onInstall: () => void;
	isInstalled: boolean;
}> = ({ item, onClick, onInstall, isInstalled }) => {
	const { t } = useTranslation();
	const { removeServer, servers } = useMcpStore();

	const installedServer = servers.find((s) => s.name === item.name);

	const handleUninstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (installedServer) {
			removeServer(installedServer.id);
			message.success(
				t("messages.uninstalled", { ns: "mcp", name: item.name }),
			);
		}
	};

	const handleInstall = (e: React.MouseEvent) => {
		e.stopPropagation();
		onInstall();
	};

	const actions: React.ReactNode[] = [];

	if (isInstalled) {
		actions.push(
			<Button
				key="uninstall"
				size="small"
				danger
				icon={<DeleteOutlined />}
				onClick={handleUninstall}
			>
				{t("actions.uninstall", { ns: "common" })}
			</Button>,
		);
	} else {
		actions.push(
			<Button
				key="install"
				type="primary"
				size="small"
				icon={<DownloadOutlined />}
				onClick={handleInstall}
			>
				{t("actions.install", { ns: "common" })}
			</Button>,
		);
	}

	return (
		<Card
			hoverable
			className="h-full flex flex-col cursor-pointer"
			actions={actions}
			onClick={onClick}
			title={
				<div className="flex items-center gap-2">
					<span className="text-xl">{item.icon || "🔌"}</span>
					<span className="truncate" title={item.name}>
						{item.name}
					</span>
					{isInstalled && (
						<Badge status="success" className="ml-auto" />
					)}
				</div>
			}
			extra={<Tag>{item.version}</Tag>}
		>
			<div className="flex flex-col h-32 justify-between">
				<Tooltip
					title={item.description}
					placement="topLeft"
					styles={{
						root: { maxWidth: 400 },
						container: {
							maxHeight: 200,
							overflow: "auto",
						},
					}}
				>
					<p className="text-gray-500 line-clamp-3 mb-2 grow cursor-help">
						{item.description}
					</p>
				</Tooltip>
				<div className="flex justify-between items-center text-xs text-gray-400 mt-2">
					<span>
						{t("by", { ns: "common" })} {item.author}
					</span>
					<div className="flex items-center gap-2">
						<span className="flex items-center gap-1">
							<StarFilled className="text-yellow-500 text-xs" />
							{item.rating}
						</span>
						<span className="flex items-center gap-1">
							<CloudDownloadOutlined className="text-xs" />
							{item.downloads.toLocaleString()}
						</span>
					</div>
				</div>
			</div>
		</Card>
	);
};
