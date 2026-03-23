import { ToolOutlined } from "@ant-design/icons";
import { Empty, List, Spin, Tag, theme } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { mcpClient } from "../../../services/mcp/mcpService";

const { useToken } = theme;

interface ToolItem {
	serverId: string;
	name: string;
	description: string;
}

interface ToolsPanelProps {
	onSelect: (tool: ToolItem) => void;
	onClose: () => void;
}

export function ToolsPanel({ onSelect, onClose }: ToolsPanelProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const [tools, setTools] = useState<ToolItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const result = await mcpClient.getAllTools();
				if (!cancelled) {
					setTools(
						result.map((r) => ({
							serverId: r.serverId,
							name: r.tool.name,
							description: r.tool.description,
						})),
					);
				}
			} catch {
				// No MCP servers connected
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleSelect = useCallback(
		(tool: ToolItem) => {
			onSelect(tool);
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
				<ToolOutlined style={{ color: token.colorPrimary }} />
				<span className="text-sm font-medium">
					{t("toolbar.toolsTitle", "MCP Tools", { ns: "chat" })}
				</span>
				<Tag color="blue" className="ml-auto">
					{tools.length}
				</Tag>
			</div>

			{loading ? (
				<div className="flex justify-center py-8">
					<Spin size="small" />
				</div>
			) : tools.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t(
						"toolbar.noTools",
						"No MCP tools available. Connect an MCP server first.",
						{ ns: "chat" },
					)}
					className="py-6"
				/>
			) : (
				<List
					dataSource={tools}
					split={false}
					renderItem={(tool) => (
						<List.Item
							className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 px-3! py-2!"
							onClick={() => handleSelect(tool)}
						>
							<List.Item.Meta
								title={
									<span className="text-sm font-mono">
										{tool.name}
									</span>
								}
								description={
									<span className="text-xs text-gray-500">
										<Tag className="mr-1" bordered={false}>
											{tool.serverId}
										</Tag>
										{tool.description}
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

export type { ToolItem };
