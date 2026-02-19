import {
	ApiOutlined,
	DeleteOutlined,
	DisconnectOutlined,
	PlayCircleOutlined,
	SettingOutlined,
	ShopOutlined,
} from "@ant-design/icons";
import { Badge, Button, Empty, List, Modal, Tag, Tooltip, message, theme } from "antd";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useMcpStore } from "../../stores/mcpStore";
import type { McpServer, BuiltinMcpDefinition } from "../../types/mcp";
import { McpConfigModal } from "../mcp/McpConfigModal";

const { useToken } = theme;

/**
 * Match a server to its builtin definition by command + npm package in args.
 */
function findBuiltinDefinition(
	server: McpServer,
	definitions: BuiltinMcpDefinition[],
): BuiltinMcpDefinition | undefined {
	if (!server.command) return undefined;
	return definitions.find((def) => {
		if (server.command !== def.command) return false;
		const defPackage = def.args.find((a) => !a.startsWith("-"));
		if (!defPackage) return false;
		return server.args?.includes(defPackage) ?? false;
	});
}

/**
 * Parse KEY=VALUE lines into a Record.
 */
function parseEnvString(envStr: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const line of envStr.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx > 0) {
			env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
		}
	}
	return env;
}

export const McpConfig: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const navigate = useNavigate();
	const servers = useMcpStore((state) => state.servers);
	const removeServer = useMcpStore((state) => state.removeServer);
	const testConnection = useMcpStore((state) => state.testConnection);
	const disconnectServer = useMcpStore((state) => state.disconnectServer);
	const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set());
	const [builtinDefinitions, setBuiltinDefinitions] = useState<BuiltinMcpDefinition[]>([]);
	const [configModalOpen, setConfigModalOpen] = useState(false);
	const [configuringServer, setConfiguringServer] = useState<McpServer | null>(null);

	useEffect(() => {
		window.electron.mcp.builtin.getDefinitions().then((res) => {
			if (res.success && res.data) {
				setBuiltinDefinitions(res.data);
			}
		});
	}, []);

	const handleConnect = useCallback(async (id: string) => {
		setConnectingIds((prev) => new Set(prev).add(id));
		try {
			await testConnection(id);
			message.success(t("messages.connectSuccess", { ns: "mcp" }));
		} catch {
			message.error(t("messages.connectError", { ns: "mcp" }));
		} finally {
			setConnectingIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}
	}, [testConnection, t]);

	const handleDisconnect = useCallback(async (id: string) => {
		try {
			await disconnectServer(id);
			message.success(t("messages.disconnectSuccess", { ns: "mcp" }));
		} catch {
			message.error(t("messages.disconnectError", { ns: "mcp" }));
		}
	}, [disconnectServer, t]);

	const handleDelete = useCallback((id: string, name: string) => {
		Modal.confirm({
			title: t("confirm.delete", { ns: "mcp" }),
			content: t("confirm.deleteContent", { name, ns: "mcp" }),
			onOk: () => {
				removeServer(id);
				message.success(t("messages.deleted", { ns: "mcp", name }));
			},
		});
	}, [removeServer, t]);

	const handleConfigure = useCallback((server: McpServer) => {
		setConfiguringServer(server);
		setConfigModalOpen(true);
	}, []);

	const handleSaveConfig = useCallback(async (serverId: string, config: Record<string, unknown>) => {
		const server = servers.find((s) => s.id === serverId);
		if (!server) return;

		try {
			if (config.__generic) {
				// Generic mode: directly update command/args/env/url
				const updates: Partial<McpServer> = {};

				if (server.transport === "stdio") {
					if (config._command) updates.command = config._command as string;
					if (config._args !== undefined) {
						updates.args = (config._args as string).split(" ").filter(Boolean);
					}
					if (config._env !== undefined) {
						const envStr = config._env as string;
						updates.env = envStr.trim() ? parseEnvString(envStr) : undefined;
					}
				} else {
					if (config._url) updates.url = config._url as string;
				}

				if (server.status === "connected") {
					await window.electron.mcp.disconnect(serverId);
				}

				await window.electron.mcp.updateServer(serverId, updates);

				const { updateServer } = useMcpStore.getState();
				updateServer(serverId, {
					...updates,
					status: "disconnected",
					tools: undefined,
				});
			} else {
				// Schema mode: use builtin createConfig
				const def = findBuiltinDefinition(server, builtinDefinitions);
				if (!def) return;

				const res = await window.electron.mcp.builtin.createConfig(def.id, config);
				if (!res.success || !res.data) {
					message.error(res.error || "Failed to create config");
					return;
				}

				const newConfig = res.data;

				if (server.status === "connected") {
					await window.electron.mcp.disconnect(serverId);
				}

				await window.electron.mcp.updateServer(serverId, {
					command: newConfig.command,
					args: newConfig.args,
					env: newConfig.env,
				});

				const { updateServer } = useMcpStore.getState();
				updateServer(serverId, {
					command: newConfig.command,
					args: newConfig.args,
					env: newConfig.env,
					status: "disconnected",
					tools: undefined,
				});
			}

			setConfigModalOpen(false);
			setConfiguringServer(null);
			message.success(t("messages.saveSuccess", { ns: "mcp" }));
		} catch {
			message.error(t("messages.saveError", { ns: "mcp" }));
		}
	}, [servers, builtinDefinitions, t]);

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "connected":
				return <Badge status="success" text={t("status.connected", { ns: "mcp" })} />;
			case "connecting":
				return <Badge status="processing" text={t("status.connecting", { ns: "mcp" })} />;
			case "error":
				return <Badge status="error" text={t("status.error", { ns: "mcp" })} />;
			default:
				return <Badge status="default" text={t("status.disconnected", { ns: "mcp" })} />;
		}
	};

	const getServerDetail = (item: typeof servers[0]) => {
		if (item.url) return item.url;
		if (item.command) {
			const args = item.args?.join(" ") || "";
			return `${item.command} ${args}`.trim();
		}
		return item.transport;
	};

	return (
		<div>
			{/* 头部：跳转到 MCP 市场 */}
			<div
				className="flex items-center justify-between mb-4 p-3 rounded-lg"
				style={{ backgroundColor: token.colorFillQuaternary }}
			>
				<div className="flex items-center gap-2" style={{ color: token.colorTextSecondary }}>
					<ApiOutlined />
					<span className="text-sm">
						{t("settingsMcpDesc", {
							ns: "settings",
							defaultValue: "Manage your MCP server connections",
						})}
					</span>
				</div>
				<Button
					type="primary"
					icon={<ShopOutlined />}
					size="small"
					onClick={() => navigate("/mcp")}
				>
					{t("goToMcpMarket", {
						ns: "settings",
						defaultValue: "MCP Market",
					})}
				</Button>
			</div>

			{/* 服务器列表 */}
			{servers.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={
						<span style={{ color: token.colorTextSecondary }}>
							{t("empty", { ns: "mcp" })}
						</span>
					}
				>
					<Button
						type="primary"
						icon={<ShopOutlined />}
						onClick={() => navigate("/mcp")}
					>
						{t("goToMcpMarket", {
							ns: "settings",
							defaultValue: "MCP Market",
						})}
					</Button>
				</Empty>
			) : (
				<List
					className="!rounded-xl"
					dataSource={servers}
					renderItem={(item) => {
						const isConnected = item.status === "connected";
						const isConnecting = item.status === "connecting" || connectingIds.has(item.id);

						return (
							<List.Item
								key={item.id}
								className="!px-4 !py-3"
								actions={[
									isConnected ? (
										<Tooltip title={t("actions.disconnect", { ns: "mcp" })} key="disconnect">
											<Button
												size="small"
												type="text"
												icon={<DisconnectOutlined />}
												onClick={() => handleDisconnect(item.id)}
											/>
										</Tooltip>
									) : (
										<Tooltip
											title={
												item.status === "error" && item.error
													? item.error
													: t("actions.connect", { ns: "mcp" })
											}
											key="connect"
										>
											<Button
												size="small"
												type="text"
												icon={
													<PlayCircleOutlined
														style={item.status === "error" ? { color: token.colorError } : undefined}
													/>
												}
												loading={isConnecting}
												onClick={() => handleConnect(item.id)}
											/>
										</Tooltip>
									),
									<Tooltip title={t("actions.settings", { ns: "mcp" })} key="settings">
										<Button
											size="small"
											type="text"
											icon={<SettingOutlined />}
											onClick={() => handleConfigure(item)}
										/>
									</Tooltip>,
									<Tooltip title={t("actions.delete", { ns: "mcp" })} key="delete">
										<Button
											size="small"
											type="text"
											danger
											icon={<DeleteOutlined />}
											onClick={() => handleDelete(item.id, item.name)}
										/>
									</Tooltip>,
								]}
							>
								<List.Item.Meta
									avatar={
										<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
											<ApiOutlined className="text-white text-sm" />
										</div>
									}
									title={
										<div className="flex items-center gap-2 min-w-0">
											<Tooltip title={item.name} placement="topLeft">
												<span className="truncate" style={{ color: token.colorText, maxWidth: 200 }}>
													{item.name}
												</span>
											</Tooltip>
											<Tag className="!text-xs !m-0 shrink-0">{item.transport}</Tag>
											<span className="shrink-0">{getStatusBadge(item.status)}</span>
										</div>
									}
									description={
										<Tooltip title={getServerDetail(item)} placement="topLeft">
											<span
												className="text-xs truncate block"
												style={{ color: token.colorTextTertiary, maxWidth: 360 }}
											>
												{getServerDetail(item)}
											</span>
										</Tooltip>
									}
								/>
							</List.Item>
						);
					}}
				/>
			)}
			<McpConfigModal
				open={configModalOpen}
				server={configuringServer}
				configSchema={
					configuringServer
						? findBuiltinDefinition(configuringServer, builtinDefinitions)?.configSchema
						: undefined
				}
				builtinDefinition={
					configuringServer
						? findBuiltinDefinition(configuringServer, builtinDefinitions)
						: undefined
				}
				onSave={handleSaveConfig}
				onCancel={() => { setConfigModalOpen(false); setConfiguringServer(null); }}
			/>
		</div>
	);
};
