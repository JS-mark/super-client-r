import {
	CloudDownloadOutlined,
	DeleteOutlined,
	DownloadOutlined,
	StarFilled,
} from "@ant-design/icons";
import { Button, Modal, message, Tag } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpMarketItem } from "../../types/mcp";

export interface McpDetailModalProps {
	item: McpMarketItem | null;
	open: boolean;
	onClose: () => void;
	onInstall: (item: McpMarketItem) => void;
}

export const McpDetailModal: React.FC<McpDetailModalProps> = ({
	item,
	open,
	onClose,
	onInstall,
}) => {
	const { t } = useTranslation();
	const { servers, removeServer } = useMcpStore();

	if (!item) return null;

	const isInstalled = servers.some((s) => s.name === item.name);
	const installedServer = servers.find((s) => s.name === item.name);

	const handleInstall = () => {
		onInstall(item);
		onClose();
	};

	const handleUninstall = () => {
		if (installedServer) {
			removeServer(installedServer.id);
			message.success(
				t("messages.uninstalled", { ns: "mcp", name: item.name }),
			);
		}
		onClose();
	};

	return (
		<Modal
			title={
				<div className="flex items-center gap-3">
					<span className="text-2xl">{item.icon || "🔌"}</span>
					<div>
						<div className="text-lg font-semibold">{item.name}</div>
						<div className="text-sm text-gray-400">
							{t("by", { ns: "common" })} {item.author}
						</div>
					</div>
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={
				<div className="flex justify-end gap-2">
					{isInstalled ? (
						<>
							<Button danger onClick={handleUninstall}>
								<DeleteOutlined />
								{t("actions.uninstall", { ns: "common" })}
							</Button>
							<Button type="primary" disabled>
								<DownloadOutlined />
								{t("status.installed", { ns: "mcp" })}
							</Button>
						</>
					) : (
						<Button type="primary" onClick={handleInstall}>
							<DownloadOutlined />
							{t("actions.install", { ns: "common" })}
						</Button>
					)}
				</div>
			}
			width={600}
			destroyOnHidden={true}
			maskClosable={false}
		>
			<div className="space-y-4">
				<div className="flex items-center gap-2 flex-wrap">
					<Tag>{item.version}</Tag>
					<Tag color="blue">{item.transport}</Tag>
					{item.license && <Tag color="green">{item.license}</Tag>}
					{isInstalled && (
						<Tag color="success">{t("status.installed", { ns: "mcp" })}</Tag>
					)}
				</div>

				<div className="flex items-center gap-4 text-sm text-gray-500">
					<div className="flex items-center gap-1">
						<StarFilled className="text-yellow-500" />
						<span>{item.rating}</span>
					</div>
					<div className="flex items-center gap-1">
						<CloudDownloadOutlined />
						<span>{item.downloads.toLocaleString()}</span>
					</div>
					{item.installCount && (
						<div className="flex items-center gap-1">
							<span>+</span>
							<span>{item.installCount.toLocaleString()}</span>
						</div>
					)}
				</div>

				<div>
					<h4 className="text-sm font-medium text-gray-700 mb-2">
						{t("description", "Description", { ns: "common" })}
					</h4>
					<p className="text-gray-600 whitespace-pre-wrap">
						{item.description}
					</p>
				</div>

				{item.tags.length > 0 && (
					<div>
						<h4 className="text-sm font-medium text-gray-700 mb-2">
							{t("tags", "Tags", { ns: "common" })}
						</h4>
						<div className="flex flex-wrap gap-2">
							{item.tags.map((tag) => (
								<Tag key={tag} variant="filled">
									{tag}
								</Tag>
							))}
						</div>
					</div>
				)}

				{item.repositoryUrl && (
					<div>
						<h4 className="text-sm font-medium text-gray-700 mb-2">
							{t("repository", "Repository", { ns: "common" })}
						</h4>
						<a
							href={item.repositoryUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:text-blue-600"
						>
							{item.repositoryUrl}
						</a>
					</div>
				)}
			</div>
		</Modal>
	);
};
