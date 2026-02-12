import {
	ApiOutlined,
	CloudDownloadOutlined,
	DeleteOutlined,
	DownloadOutlined,
	EditOutlined,
	EyeOutlined,
	FilterOutlined,
	GlobalOutlined,
	LinkOutlined,
	PlusOutlined,
	ReloadOutlined,
	SaveOutlined,
	SearchOutlined,
	ShopOutlined,
	StarFilled,
	SyncOutlined,
} from "@ant-design/icons";
import {
	Badge,
	Button,
	Card,
	Dropdown,
	Empty,
	Form,
	Input,
	List,
	Modal,
	Pagination,
	Select,
	Spin,
	Tabs,
	Tag,
	Tooltip,
	message,
} from "antd";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { useTitle } from "../hooks/useTitle";
import { useMcpStore } from "../stores/mcpStore";
import type { McpMarketItem, McpServer, McpTransportType } from "../types/mcp";

// MCP 详情弹窗组件
interface McpDetailModalProps {
	item: McpMarketItem | null;
	open: boolean;
	onClose: () => void;
	onInstall: (item: McpMarketItem) => void;
}

const McpDetailModal: React.FC<McpDetailModalProps> = ({
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

// MCP 市场卡片组件
const McpMarketCard: React.FC<{
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

// 第三方 MCP 卡片组件
const ThirdPartyMcpCard: React.FC<{
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

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "connected":
				return (
					<Badge
						status="success"
						text={t("status.connected", { ns: "mcp" })}
					/>
				);
			case "connecting":
				return (
					<Badge
						status="processing"
						text={t("status.connecting", { ns: "mcp" })}
					/>
				);
			case "error":
				return (
					<Badge status="error" text={t("status.error", { ns: "mcp" })} />
				);
			default:
				return (
					<Badge
						status="default"
						text={t("status.disconnected", { ns: "mcp" })}
					/>
				);
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
					{getStatusBadge(server.status)}
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

// 已安装 MCP 卡片组件
const InstalledMcpCard: React.FC<{
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

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "connected":
				return (
					<Badge
						status="success"
						text={t("status.connected", { ns: "mcp" })}
					/>
				);
			case "connecting":
				return (
					<Badge
						status="processing"
						text={t("status.connecting", { ns: "mcp" })}
					/>
				);
			case "error":
				return (
					<Badge status="error" text={t("status.error", { ns: "mcp" })} />
				);
			default:
				return (
					<Badge
						status="default"
						text={t("status.disconnected", { ns: "mcp" })}
					/>
				);
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
					{getStatusBadge(server.status)}
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
						<Tooltip title={server.enabled ? t("actions.disable", { ns: "mcp" }) : t("actions.enable", { ns: "mcp" })}>
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

const McpMarket: React.FC = () => {
	const { t } = useTranslation();

	// 页面标题组件
	const pageTitle = useMemo(() => {
		return (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
					<ShopOutlined className="text-white text-xs" />
				</div>
				<span className="text-slate-700 dark:text-slate-200 text-sm font-medium">
					{t("title", "MCP Market", { ns: "mcp" })}
				</span>
			</div>
		);
	}, [t]);

	// 设置标题栏
	useTitle(pageTitle);

	const {
		servers,
		marketItems,
		marketTotal,
		isLoading,
		fetchMarketItems,
		installMarketItem,
	} = useMcpStore();

	const [marketSearchTerm, setMarketSearchTerm] = useState("");
	const [installedSearchTerm, setInstalledSearchTerm] = useState("");
	const [thirdPartySearchTerm, setThirdPartySearchTerm] = useState("");
	const [selectedItem, setSelectedItem] = useState<McpMarketItem | null>(null);
	const [modalOpen, setModalOpen] = useState(false);
	const [thirdPartyModalOpen, setThirdPartyModalOpen] = useState(false);
	const [editingServer, setEditingServer] = useState<McpServer | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedTag, setSelectedTag] = useState<string | null>(null);
	const [thirdPartyForm] = Form.useForm();
	const pageSize = 12;

	// 初始加载
	useEffect(() => {
		fetchMarketItems();
	}, [fetchMarketItems]);

	// 搜索时调用 API（带防抖）
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setCurrentPage(1);
			fetchMarketItems(1, pageSize, selectedTag || undefined, marketSearchTerm);
		}, 300);
		return () => clearTimeout(timeoutId);
	}, [marketSearchTerm, selectedTag, fetchMarketItems]);

	// 分页切换
	const handlePageChange = (page: number) => {
		setCurrentPage(page);
		fetchMarketItems(page, pageSize, selectedTag || undefined, marketSearchTerm);
	};

	const handleItemClick = (item: McpMarketItem) => {
		setSelectedItem(item);
		setModalOpen(true);
	};

	const handleCloseModal = () => {
		setModalOpen(false);
		setSelectedItem(null);
	};

	const handleInstall = useCallback(
		(item: McpMarketItem) => {
			installMarketItem(item);
			message.success(
				t("messages.installed", { ns: "mcp", name: item.name }),
			);
		},
		[installMarketItem, t],
	);

	// 本地过滤已安装的 MCP
	const filterInstalledServers = (servers: McpServer[]) => {
		if (!installedSearchTerm) return servers;
		return servers.filter(
			(s) =>
				s.name.toLowerCase().includes(installedSearchTerm.toLowerCase()) ||
				(s.description || "")
					.toLowerCase()
					.includes(installedSearchTerm.toLowerCase()),
		);
	};

	// 获取第三方 MCP 服务器
	const thirdPartyServers = useMemo(() => {
		return servers.filter((s) => s.type === "third-party");
	}, [servers]);

	// 本地过滤第三方 MCP
	const filterThirdPartyServers = (servers: McpServer[]) => {
		if (!thirdPartySearchTerm) return servers;
		return servers.filter(
			(s) =>
				s.name.toLowerCase().includes(thirdPartySearchTerm.toLowerCase()) ||
				(s.description || "")
					.toLowerCase()
					.includes(thirdPartySearchTerm.toLowerCase()),
		);
	};

	// 打开添加第三方 MCP 弹窗
	const handleAddThirdParty = () => {
		setEditingServer(null);
		thirdPartyForm.resetFields();
		setThirdPartyModalOpen(true);
	};

	// 打开编辑第三方 MCP 弹窗
	const handleEditThirdParty = (server: McpServer) => {
		setEditingServer(server);
		thirdPartyForm.setFieldsValue({
			name: server.name,
			description: server.description,
			transport: server.transport,
			url: server.url,
			command: server.command,
			args: server.args?.join(" "),
		});
		setThirdPartyModalOpen(true);
	};

	// 保存第三方 MCP
	const handleSaveThirdParty = (values: any) => {
		const { addServer, updateServer } = useMcpStore.getState();

		if (editingServer) {
			// 更新现有服务器
			updateServer(editingServer.id, {
				name: values.name,
				description: values.description,
				transport: values.transport,
				url: values.transport !== "stdio" ? values.url : undefined,
				command: values.transport === "stdio" ? values.command : undefined,
				args: values.transport === "stdio" && values.args ? values.args.split(" ", { ns: "mcp" }).filter(Boolean) : undefined,
			});
			message.success(t("messages.updated", { ns: "mcp", name: values.name }));
		} else {
			// 添加新服务器
			const newServer: McpServer = {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				name: values.name,
				type: "third-party",
				transport: values.transport,
				status: "disconnected",
				enabled: true,
				description: values.description,
				url: values.transport !== "stdio" ? values.url : undefined,
				command: values.transport === "stdio" ? values.command : undefined,
				args: values.transport === "stdio" && values.args ? values.args.split(" ", { ns: "mcp" }).filter(Boolean) : undefined,
			};
			addServer(newServer);
			message.success(t("messages.added", { ns: "mcp", name: values.name }));
		}
		setThirdPartyModalOpen(false);
		thirdPartyForm.resetFields();
	};

	// 获取所有标签
	const allTags = useMemo(() => {
		const tagSet = new Set<string>();
		marketItems.forEach((item) => {
			item.tags.forEach((tag) => tagSet.add(tag));
		});
		return Array.from(tagSet).sort();
	}, [marketItems]);

	const tabItems = [
		{
			key: "market",
			label: t("tabs.market", { ns: "mcp" }),
			children: (
				<div className="h-full flex flex-col pr-2">
					<div className="mb-4 flex gap-2 shrink-0 flex-wrap">
						<Input
							prefix={<SearchOutlined className="text-gray-400" />}
							placeholder={t("searchPlaceholder", { ns: "mcp" })}
							allowClear
							value={marketSearchTerm}
							onChange={(e) => setMarketSearchTerm(e.target.value)}
							onPressEnter={() => {
								setCurrentPage(1);
								fetchMarketItems(
									1,
									pageSize,
									selectedTag || undefined,
									marketSearchTerm,
								);
							}}
							className="flex-1 min-w-[200px]"
						/>
						{allTags.length > 0 && (
							<Dropdown
								menu={{
									items: [
										{
											key: "all",
											label: t("tags.all", { ns: "mcp" }),
											onClick: () => setSelectedTag(null),
										},
										...allTags.map((tag) => ({
											key: tag,
											label: tag,
											onClick: () => setSelectedTag(tag),
										})),
									],
								}}
							>
								<Button icon={<FilterOutlined />}>
									{selectedTag || t("tags.filter", { ns: "mcp" })}
								</Button>
							</Dropdown>
						)}
						<Button
							type="primary"
							icon={<SearchOutlined />}
							onClick={() => {
								setCurrentPage(1);
								fetchMarketItems(
									1,
									pageSize,
									selectedTag || undefined,
									marketSearchTerm,
								);
							}}
							loading={isLoading}
						>
							{t("search", { ns: "common" })}
						</Button>
					</div>
					<div className="flex-1 overflow-y-auto min-h-0">
						{isLoading ? (
							<div className="flex justify-center items-center py-20">
								<Spin size="large" />
							</div>
						) : marketItems.length === 0 ? (
							<Empty
								description={t("noData", { ns: "mcp" })}
								className="py-20"
							/>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
								{marketItems.map((item) => (
									<McpMarketCard
										key={item.id}
										item={item}
										onClick={() => handleItemClick(item)}
										onInstall={() => handleInstall(item)}
										isInstalled={servers.some((s) => s.name === item.name)}
									/>
								))}
							</div>
						)}
					</div>
					{marketTotal > pageSize && (
						<div className="flex justify-center pt-4 shrink-0">
							<Pagination
								current={currentPage}
								total={marketTotal}
								pageSize={pageSize}
								onChange={handlePageChange}
								showSizeChanger={false}
							/>
						</div>
					)}
				</div>
			),
		},
		{
			key: "third-party",
			label: `${t("tabs.thirdParty", { ns: "mcp" })} (${thirdPartyServers.length})`,
			children: (
				<div className="h-full overflow-y-auto pr-2">
					<div className="mb-4 flex gap-2">
						<Input
							prefix={<SearchOutlined className="text-gray-400" />}
							placeholder={t("searchThirdParty", { ns: "mcp" })}
							allowClear
							value={thirdPartySearchTerm}
							onChange={(e) => setThirdPartySearchTerm(e.target.value)}
						/>
						<Button
							type="primary"
							icon={<SearchOutlined />}
							onClick={() => {
								// 本地搜索，无需调用 API
							}}
						>
							{t("search", { ns: "common" })}
						</Button>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={handleAddThirdParty}
						>
							{t("add", { ns: "mcp" })}
						</Button>
					</div>
					{filterThirdPartyServers(thirdPartyServers).length === 0 ? (
						<Empty
							description={t("noThirdParty", { ns: "mcp" })}
							className="py-20"
						>
							<Button
								type="primary"
								icon={<PlusOutlined />}
								onClick={handleAddThirdParty}
							>
								{t("add", { ns: "mcp" })}
							</Button>
						</Empty>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
							{filterThirdPartyServers(thirdPartyServers).map((server) => (
								<ThirdPartyMcpCard
									key={server.id}
									server={server}
									onEdit={() => handleEditThirdParty(server)}
								/>
							))}
						</div>
					)}
				</div>
			),
		},
		{
			key: "installed",
			label: `${t("tabs.installed", { ns: "mcp" })} (${servers.length})`,
			children: (
				<div className="h-full overflow-y-auto pr-2">
					<div className="mb-4 flex gap-2">
						<Input
							prefix={<SearchOutlined className="text-gray-400" />}
							placeholder={t("searchInstalled", { ns: "mcp" })}
							allowClear
							value={installedSearchTerm}
							onChange={(e) => setInstalledSearchTerm(e.target.value)}
						/>
						<Button
							type="primary"
							icon={<SearchOutlined />}
							onClick={() => {
								// 本地搜索，无需调用 API
							}}
						>
							{t("search", { ns: "common" })}
						</Button>
					</div>
					{filterInstalledServers(servers).length === 0 ? (
						<Empty
							description={t("noInstalled", { ns: "mcp" })}
							className="py-20"
						/>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
							{filterInstalledServers(servers).map((server) => (
								<InstalledMcpCard
									key={server.id}
									server={server}
									onView={() => {
										// 查看详情或编辑
									}}
								/>
							))}
						</div>
					)}
				</div>
			),
		},
	];

	return (
		<MainLayout>
			<div className="p-4 h-full overflow-auto">
				<Tabs
					defaultActiveKey="market"
					items={tabItems}
					className="flex-1 min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-tabpane]:h-full"
				/>

				<McpDetailModal
					item={selectedItem}
					open={modalOpen}
					onClose={handleCloseModal}
					onInstall={handleInstall}
				/>

				{/* 第三方 MCP 配置弹窗 */}
				<Modal
					title={
						<div className="flex items-center gap-2">
							<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
								<GlobalOutlined className="text-white text-sm" />
							</div>
							<span className="font-semibold">
								{editingServer ? t("edit", { ns: "mcp" }) : t("add", { ns: "mcp" })}
							</span>
						</div>
					}
					open={thirdPartyModalOpen}
					onCancel={() => setThirdPartyModalOpen(false)}
					onOk={() => thirdPartyForm.submit()}
					okText={t("save", { ns: "common" })}
					cancelText={t("cancel", { ns: "mcp" })}
					width={560}
					destroyOnHidden={true}
				>
					<Form
						form={thirdPartyForm}
						layout="vertical"
						onFinish={handleSaveThirdParty}
					>
						<Form.Item
							name="name"
							label={t("form.name", { ns: "mcp" })}
							rules={[{ required: true, message: t("form.nameRequired", { ns: "mcp" }) }]}
						>
							<Input
								placeholder={t("form.namePlaceholder", { ns: "mcp" })}
								prefix={<ApiOutlined className="text-gray-400" />}
							/>
						</Form.Item>

						<Form.Item
							name="description"
							label={t("description", { ns: "common" })}
						>
							<Input.TextArea
								placeholder={t("form.descriptionPlaceholder", { ns: "mcp" })}
								rows={2}
							/>
						</Form.Item>

						<Form.Item
							name="transport"
							label={t("form.transport", { ns: "mcp" })}
							rules={[{ required: true, message: t("form.transportRequired", { ns: "mcp" }) }]}
							initialValue="http"
						>
							<Select
								options={[
									{ value: "http", label: "HTTP" },
									{ value: "sse", label: "SSE" },
									{ value: "stdio", label: "STDIO" },
								]}
							/>
						</Form.Item>

						<Form.Item
							noStyle
							shouldUpdate={(prevValues, currentValues) =>
								prevValues.transport !== currentValues.transport
							}
						>
							{({ getFieldValue }) =>
								getFieldValue("transport") === "stdio" ? (
									<>
										<Form.Item
											name="command"
											label={t("form.command", { ns: "mcp" })}
											rules={[{ required: true, message: t("form.commandRequired", { ns: "mcp" }) }]}
										>
											<Input
												placeholder={t("form.commandPlaceholder", { ns: "mcp" })}
												prefix={<SaveOutlined className="text-gray-400" />}
											/>
										</Form.Item>
										<Form.Item
											name="args"
											label={t("form.args", { ns: "mcp" })}
										>
											<Input
												placeholder={t("form.argsPlaceholder", { ns: "mcp" })}
											/>
										</Form.Item>
									</>
								) : (
									<Form.Item
										name="url"
										label={t("form.url", { ns: "mcp" })}
										rules={[
											{ required: true, message: t("form.urlRequired", { ns: "mcp" }) },
											{ type: "url", message: t("form.urlInvalid", { ns: "mcp" }) },
										]}
									>
										<Input
											placeholder={t("form.urlPlaceholder", { ns: "mcp" })}
											prefix={<LinkOutlined className="text-gray-400" />}
										/>
									</Form.Item>
								)
							}
						</Form.Item>
					</Form>
				</Modal>
			</div>
		</MainLayout>
	);
};

export default McpMarket;
