import {
	CheckCircleFilled,
	CloudDownloadOutlined,
	DeleteOutlined,
	DownloadOutlined,
	SettingOutlined,
	StarFilled,
} from "@ant-design/icons";
import { Button, Tag, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpMarketItem, McpServer } from "../../types/mcp";

const { useToken } = theme;

export const McpMarketCard: React.FC<{
	item: McpMarketItem;
	onClick: () => void;
	onInstall: () => void;
	isInstalled: boolean;
	onConfigure?: (server: McpServer) => void;
}> = ({ item, onClick, onInstall, isInstalled, onConfigure }) => {
	const { t } = useTranslation();
	const { token } = useToken();
	const { removeServer, servers } = useMcpStore();

	const installedServer = servers.find((s) => s.name === item.name);

	const handleUninstall = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (installedServer) {
				removeServer(installedServer.id);
			}
		},
		[installedServer, removeServer],
	);

	const handleInstall = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onInstall();
		},
		[onInstall],
	);

	const handleConfigure = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (installedServer && onConfigure) {
				onConfigure(installedServer);
			}
		},
		[installedServer, onConfigure],
	);

	return (
		<div
			onClick={onClick}
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
					className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
					style={{ backgroundColor: token.colorFillQuaternary }}
				>
					{item.icon || "🔌"}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span
							className="font-semibold text-sm truncate"
							style={{ color: token.colorText }}
							title={item.name}
						>
							{item.name}
						</span>
						{isInstalled && (
							<CheckCircleFilled
								style={{ color: token.colorSuccess, fontSize: 14 }}
							/>
						)}
					</div>
					<div className="flex items-center gap-1.5 mt-1">
						<Tag
							bordered={false}
							className="!text-xs !px-1.5 !py-0 !m-0 !rounded"
						>
							v{item.version}
						</Tag>
					</div>
				</div>
			</div>

			{/* Description */}
			<div className="px-4 flex-1">
				<p
					className="text-xs line-clamp-3 leading-relaxed m-0"
					style={{ color: token.colorTextSecondary }}
					title={item.description}
				>
					{item.description}
				</p>
			</div>

			{/* Footer */}
			<div className="px-4 py-3 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<span
						className="text-xs truncate max-w-[80px]"
						style={{ color: token.colorTextTertiary }}
						title={item.author}
					>
						{item.author}
					</span>
					<span
						className="flex items-center gap-1 text-xs"
						style={{ color: token.colorTextQuaternary }}
					>
						<StarFilled style={{ color: "#faad14", fontSize: 11 }} />
						{item.rating}
					</span>
					<span
						className="flex items-center gap-1 text-xs"
						style={{ color: token.colorTextQuaternary }}
					>
						<CloudDownloadOutlined style={{ fontSize: 11 }} />
						{item.downloads >= 1000
							? `${(item.downloads / 1000).toFixed(1)}k`
							: item.downloads}
					</span>
				</div>

				{/* Action buttons */}
				<div
					className="flex items-center gap-1"
					onClick={(e) => e.stopPropagation()}
				>
					{isInstalled ? (
						<>
							<Tooltip title={t("actions.settings", { ns: "mcp" })}>
								<Button
									size="small"
									type="text"
									icon={<SettingOutlined />}
									onClick={handleConfigure}
								/>
							</Tooltip>
							<Tooltip title={t("actions.uninstall", { ns: "common" })}>
								<Button
									size="small"
									type="text"
									danger
									icon={<DeleteOutlined />}
									onClick={handleUninstall}
								/>
							</Tooltip>
						</>
					) : (
						<Button
							type="primary"
							size="small"
							icon={<DownloadOutlined />}
							onClick={handleInstall}
						>
							{t("actions.install", { ns: "common" })}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
};
