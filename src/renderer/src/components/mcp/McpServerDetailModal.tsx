import {
	ApiOutlined,
	CodeOutlined,
	InfoCircleOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { Badge, Collapse, Empty, Modal, Tag, theme } from "antd";
import type * as React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { McpServer } from "../../types/mcp";
import { McpStatusBadge } from "./McpStatusBadge";

const { useToken } = theme;

export interface McpServerDetailModalProps {
	server: McpServer | null;
	open: boolean;
	onClose: () => void;
}

export const McpServerDetailModal: React.FC<McpServerDetailModalProps> = ({
	server,
	open,
	onClose,
}) => {
	const { t } = useTranslation();
	const { token } = useToken();

	const tools = useMemo(() => server?.tools ?? [], [server?.tools]);

	if (!server) return null;

	const isInternal = server.type === "internal";
	const isConnected = server.status === "connected";

	return (
		<Modal
			title={
				<div className="flex items-center gap-3">
					<div
						className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
						style={{
							background: isConnected
								? `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`
								: token.colorFillSecondary,
						}}
					>
						<ApiOutlined
							style={{
								color: isConnected ? "#fff" : token.colorTextTertiary,
								fontSize: 16,
							}}
						/>
					</div>
					<div className="min-w-0">
						<div className="text-base font-semibold truncate">
							{server.name}
						</div>
						<div className="flex items-center gap-2 mt-0.5">
							<McpStatusBadge status={server.status} />
						</div>
					</div>
				</div>
			}
			open={open}
			onCancel={onClose}
			footer={null}
			width={640}
			destroyOnHidden={true}
		>
			<div className="space-y-4 mt-2">
				{/* Server Info */}
				{server.description && (
					<p
						className="text-sm m-0 leading-relaxed"
						style={{ color: token.colorTextSecondary }}
					>
						{server.description}
					</p>
				)}

				<div className="flex items-center gap-2 flex-wrap">
					<Tag bordered={false}>{server.transport}</Tag>
					{isInternal && (
						<Tag bordered={false} color="blue">
							{t("internal.label", { ns: "mcp" })}
						</Tag>
					)}
					{server.version && <Tag bordered={false}>v{server.version}</Tag>}
				</div>

				{/* Tools Section */}
				<div>
					<div
						className="flex items-center gap-2 mb-3 text-sm font-medium"
						style={{ color: token.colorText }}
					>
						<ToolOutlined />
						<span>{t("detail.tools", { ns: "mcp" })}</span>
						<Badge
							count={tools.length}
							showZero
							style={{
								backgroundColor:
									tools.length > 0
										? token.colorPrimary
										: token.colorTextQuaternary,
								fontSize: 11,
							}}
						/>
					</div>

					{tools.length === 0 ? (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={
								<div>
									<p
										className="m-0"
										style={{ color: token.colorTextSecondary }}
									>
										{t("detail.noTools", { ns: "mcp" })}
									</p>
									{!isConnected && (
										<p
											className="m-0 text-xs mt-1"
											style={{ color: token.colorTextTertiary }}
										>
											{t("detail.noToolsHint", { ns: "mcp" })}
										</p>
									)}
								</div>
							}
							className="!my-4"
						/>
					) : (
						<Collapse
							size="small"
							items={tools.map((tool, idx) => ({
								key: String(idx),
								label: (
									<div className="flex items-center gap-2">
										<CodeOutlined
											style={{ color: token.colorPrimary, fontSize: 12 }}
										/>
										<span
											className="font-mono text-xs font-medium"
											style={{ color: token.colorText }}
										>
											{tool.name}
										</span>
									</div>
								),
								children: (
									<div className="space-y-2">
										<p
											className="text-xs m-0 leading-relaxed"
											style={{ color: token.colorTextSecondary }}
										>
											{tool.description || "-"}
										</p>
										{tool.inputSchema &&
											Object.keys(tool.inputSchema).length > 0 && (
												<div>
													<div
														className="flex items-center gap-1 mb-1 text-xs"
														style={{ color: token.colorTextTertiary }}
													>
														<InfoCircleOutlined style={{ fontSize: 10 }} />
														<span>
															{t("detail.toolInputSchema", { ns: "mcp" })}
														</span>
													</div>
													<pre
														className="text-xs p-2 rounded-lg m-0 overflow-x-auto leading-relaxed"
														style={{
															backgroundColor: token.colorFillQuaternary,
															color: token.colorTextSecondary,
															maxHeight: 200,
														}}
													>
														{JSON.stringify(tool.inputSchema, null, 2)}
													</pre>
												</div>
											)}
									</div>
								),
							}))}
							className="[&_.ant-collapse-header]:!py-2"
						/>
					)}
				</div>
			</div>
		</Modal>
	);
};
