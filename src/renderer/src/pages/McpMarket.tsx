import {
	ApiOutlined,
	ExportOutlined,
	FilterOutlined,
	GlobalOutlined,
	LinkOutlined,
	PlusOutlined,
	ReloadOutlined,
	SaveOutlined,
	SearchOutlined,
	ShopOutlined,
	StarFilled,
} from "@ant-design/icons";
import {
	Button,
	Card,
	Dropdown,
	Empty,
	Form,
	Input,
	Modal,
	Pagination,
	Select,
	Spin,
	Tag,
	Tabs,
	Tooltip,
	message,
	theme,
} from "antd";

const { useToken } = theme;
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { InstalledMcpCard } from "../components/mcp/InstalledMcpCard";
import { McpConfigModal } from "../components/mcp/McpConfigModal";
import { McpDetailModal } from "../components/mcp/McpDetailModal";
import { McpMarketCard } from "../components/mcp/McpMarketCard";
import {
	MCP_LOGO_PATHS,
	MCP_MARKET_SOURCES,
	type McpMarketSource,
} from "../components/mcp/McpMarketSources";
import { ThirdPartyMcpCard } from "../components/mcp/ThirdPartyMcpCard";
import { useTitle } from "../hooks/useTitle";
import { useMcpStore } from "../stores/mcpStore";
import type { McpMarketItem, McpServer, BuiltinMcpDefinition } from "../types/mcp";

const PAGE_SIZE = 12;

/**
 * Match a server to its builtin definition by command + npm package in args.
 * Name-based matching fails because builtin names are Chinese (e.g., "文件系统")
 * while installed server names come from npm packages.
 */
function findBuiltinDefinition(
	server: McpServer,
	definitions: BuiltinMcpDefinition[],
): BuiltinMcpDefinition | undefined {
	if (!server.command) return undefined;
	return definitions.find((def) => {
		if (server.command !== def.command) return false;
		// Find the npm package name in the definition args (the non-flag arg)
		const defPackage = def.args.find((a) => !a.startsWith("-"));
		if (!defPackage) return false;
		return server.args?.includes(defPackage) ?? false;
	});
}

const McpMarket: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();

	const pageTitle = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
					<ShopOutlined className="text-white text-xs" />
				</div>
				<span
					className="text-sm font-medium"
					style={{ color: token.colorText }}
				>
					{t("title", "MCP Market", { ns: "mcp" })}
				</span>
			</div>
		),
		[t, token.colorText],
	);
	useTitle(pageTitle);

	const {
		servers,
		marketItems,
		marketTotal,
		marketError,
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
	const [builtinDefinitions, setBuiltinDefinitions] = useState<BuiltinMcpDefinition[]>([]);
	const [configModalOpen, setConfigModalOpen] = useState(false);
	const [configuringServer, setConfiguringServer] = useState<McpServer | null>(null);

	useEffect(() => {
		fetchMarketItems();
		// 获取内置 MCP 定义
		window.electron.mcp.builtin.getDefinitions().then((res) => {
			if (res.success && res.data) {
				setBuiltinDefinitions(res.data);
			}
		});
	}, [fetchMarketItems]);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setCurrentPage(1);
			fetchMarketItems(1, PAGE_SIZE, selectedTag || undefined, marketSearchTerm);
		}, 300);
		return () => clearTimeout(timeoutId);
	}, [marketSearchTerm, selectedTag, fetchMarketItems]);

	const handlePageChange = (page: number) => {
		setCurrentPage(page);
		fetchMarketItems(page, PAGE_SIZE, selectedTag || undefined, marketSearchTerm);
	};

	const handleInstall = useCallback(
		(item: McpMarketItem) => {
			installMarketItem(item);
			message.success(t("messages.installed", { ns: "mcp", name: item.name }));
		},
		[installMarketItem, t],
	);

	const filterServers = (list: McpServer[], term: string) => {
		if (!term) return list;
		const lower = term.toLowerCase();
		return list.filter(
			(s) =>
				s.name.toLowerCase().includes(lower) ||
				(s.description || "").toLowerCase().includes(lower),
		);
	};

	const thirdPartyServers = useMemo(
		() => servers.filter((s) => s.type === "third-party"),
		[servers],
	);

	const handleAddThirdParty = () => {
		setEditingServer(null);
		thirdPartyForm.resetFields();
		setThirdPartyModalOpen(true);
	};

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

	const handleSaveThirdParty = (values: any) => {
		const { addServer, updateServer } = useMcpStore.getState();
		const args =
			values.transport === "stdio" && values.args
				? values.args.split(" ").filter(Boolean)
				: undefined;

		if (editingServer) {
			updateServer(editingServer.id, {
				name: values.name,
				description: values.description,
				transport: values.transport,
				url: values.transport !== "stdio" ? values.url : undefined,
				command: values.transport === "stdio" ? values.command : undefined,
				args,
			});
			message.success(t("messages.updated", { ns: "mcp", name: values.name }));
		} else {
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
				args,
			};
			addServer(newServer);
			message.success(t("messages.added", { ns: "mcp", name: values.name }));
		}
		setThirdPartyModalOpen(false);
		thirdPartyForm.resetFields();
	};

	const handleOpenConfig = useCallback((server: McpServer) => {
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
						if (envStr.trim()) {
							const env: Record<string, string> = {};
							for (const line of envStr.split("\n")) {
								const trimmed = line.trim();
								if (!trimmed) continue;
								const eqIdx = trimmed.indexOf("=");
								if (eqIdx > 0) {
									env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
								}
							}
							updates.env = env;
						} else {
							updates.env = undefined;
						}
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

	const allTags = useMemo(() => {
		const tagSet = new Set<string>();
		for (const item of marketItems) {
			for (const tag of item.tags) tagSet.add(tag);
		}
		return Array.from(tagSet).sort();
	}, [marketItems]);

	const tabItems = [
		{
			key: "market",
			label: t("tabs.market", { ns: "mcp" }),
			children: (
				<MarketTab
					marketItems={marketItems}
					marketTotal={marketTotal}
					marketError={marketError}
					isLoading={isLoading}
					servers={servers}
					searchTerm={marketSearchTerm}
					onSearchChange={setMarketSearchTerm}
					selectedTag={selectedTag}
					onTagChange={setSelectedTag}
					allTags={allTags}
					currentPage={currentPage}
					pageSize={PAGE_SIZE}
					onPageChange={handlePageChange}
					onItemClick={(item) => { setSelectedItem(item); setModalOpen(true); }}
					onInstall={handleInstall}
					onConfigure={handleOpenConfig}
					onSearch={() => {
						setCurrentPage(1);
						fetchMarketItems(1, PAGE_SIZE, selectedTag || undefined, marketSearchTerm);
					}}
				/>
			),
		},
		{
			key: "sources",
			label: t("tabs.sources", { ns: "mcp" }),
			children: <MarketSourcesTab />,
		},
		{
			key: "third-party",
			label: `${t("tabs.thirdParty", { ns: "mcp" })} (${thirdPartyServers.length})`,
			children: (
				<ThirdPartyTab
					servers={filterServers(thirdPartyServers, thirdPartySearchTerm)}
					searchTerm={thirdPartySearchTerm}
					onSearchChange={setThirdPartySearchTerm}
					onAdd={handleAddThirdParty}
					onEdit={handleEditThirdParty}
				/>
			),
		},
		{
			key: "installed",
			label: `${t("tabs.installed", { ns: "mcp" })} (${servers.length})`,
			children: (
				<InstalledTab
					servers={filterServers(servers, installedSearchTerm)}
					searchTerm={installedSearchTerm}
					onSearchChange={setInstalledSearchTerm}
					onConfigure={handleOpenConfig}
				/>
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
					onClose={() => { setModalOpen(false); setSelectedItem(null); }}
					onInstall={handleInstall}
					onConfigure={handleOpenConfig}
				/>

				<ThirdPartyFormModal
					open={thirdPartyModalOpen}
					editingServer={editingServer}
					form={thirdPartyForm}
					onCancel={() => setThirdPartyModalOpen(false)}
					onFinish={handleSaveThirdParty}
				/>

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
		</MainLayout>
	);
};

// --- Tab sub-components ---

function MarketTab({
	marketItems, marketTotal, marketError, isLoading, servers, searchTerm, onSearchChange,
	selectedTag, onTagChange, allTags, currentPage, pageSize, onPageChange,
	onItemClick, onInstall, onConfigure, onSearch,
}: {
	marketItems: McpMarketItem[];
	marketTotal: number;
	marketError: string | null;
	isLoading: boolean;
	servers: McpServer[];
	searchTerm: string;
	onSearchChange: (v: string) => void;
	selectedTag: string | null;
	onTagChange: (v: string | null) => void;
	allTags: string[];
	currentPage: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onItemClick: (item: McpMarketItem) => void;
	onInstall: (item: McpMarketItem) => void;
	onConfigure: (server: McpServer) => void;
	onSearch: () => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="h-full flex flex-col pr-2">
			<div className="mb-4 flex gap-2 shrink-0 flex-wrap">
				<Input
					prefix={<SearchOutlined className="text-gray-400" />}
					placeholder={t("searchPlaceholder", { ns: "mcp" })}
					allowClear
					value={searchTerm}
					onChange={(e) => onSearchChange(e.target.value)}
					onPressEnter={onSearch}
					className="flex-1 min-w-[200px]"
				/>
				{allTags.length > 0 && (
					<Dropdown
						menu={{
							items: [
								{ key: "all", label: t("tags.all", { ns: "mcp" }), onClick: () => onTagChange(null) },
								...allTags.map((tag) => ({ key: tag, label: tag, onClick: () => onTagChange(tag) })),
							],
						}}
					>
						<Button icon={<FilterOutlined />}>
							{selectedTag || t("tags.filter", { ns: "mcp" })}
						</Button>
					</Dropdown>
				)}
				<Button type="primary" icon={<SearchOutlined />} onClick={onSearch} loading={isLoading}>
					{t("search", { ns: "common" })}
				</Button>
			</div>
			<div className="flex-1 overflow-y-auto min-h-0">
				{isLoading ? (
					<div className="flex justify-center items-center py-20"><Spin size="large" /></div>
				) : marketError ? (
					<Empty
						description={
							<div className="text-center">
								<p className="mb-2">{t("marketError", { ns: "mcp", defaultValue: "Failed to load marketplace data" })}</p>
								<p className="text-xs opacity-60 mb-3">{marketError}</p>
								<Button icon={<ReloadOutlined />} onClick={onSearch}>
									{t("retry", { ns: "common", defaultValue: "Retry" })}
								</Button>
							</div>
						}
						className="py-20"
					/>
				) : marketItems.length === 0 ? (
					<Empty description={t("noData", { ns: "mcp" })} className="py-20" />
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{marketItems.map((item) => (
							<McpMarketCard
								key={item.id}
								item={item}
								onClick={() => onItemClick(item)}
								onInstall={() => onInstall(item)}
								isInstalled={servers.some((s) => s.name === item.name)}
								onConfigure={onConfigure}
							/>
						))}
					</div>
				)}
			</div>
			{marketTotal > pageSize && (
				<div className="flex justify-center pt-4 shrink-0">
					<Pagination current={currentPage} total={marketTotal} pageSize={pageSize} onChange={onPageChange} showSizeChanger={false} />
				</div>
			)}
		</div>
	);
}

function ThirdPartyTab({
	servers, searchTerm, onSearchChange, onAdd, onEdit,
}: {
	servers: McpServer[];
	searchTerm: string;
	onSearchChange: (v: string) => void;
	onAdd: () => void;
	onEdit: (server: McpServer) => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="h-full overflow-y-auto pr-2">
			<div className="mb-4 flex gap-2">
				<Input
					prefix={<SearchOutlined className="text-gray-400" />}
					placeholder={t("searchThirdParty", { ns: "mcp" })}
					allowClear
					value={searchTerm}
					onChange={(e) => onSearchChange(e.target.value)}
				/>
				<Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
					{t("add", { ns: "mcp" })}
				</Button>
			</div>
			{servers.length === 0 ? (
				<Empty description={t("noThirdParty", { ns: "mcp" })} className="py-20">
					<Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
						{t("add", { ns: "mcp" })}
					</Button>
				</Empty>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
					{servers.map((server) => (
						<ThirdPartyMcpCard key={server.id} server={server} onEdit={() => onEdit(server)} />
					))}
				</div>
			)}
		</div>
	);
}

function InstalledTab({
	servers, searchTerm, onSearchChange, onConfigure,
}: {
	servers: McpServer[];
	searchTerm: string;
	onSearchChange: (v: string) => void;
	onConfigure: (server: McpServer) => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="h-full overflow-y-auto pr-2">
			<div className="mb-4 flex gap-2">
				<Input
					prefix={<SearchOutlined className="text-gray-400" />}
					placeholder={t("searchInstalled", { ns: "mcp" })}
					allowClear
					value={searchTerm}
					onChange={(e) => onSearchChange(e.target.value)}
				/>
			</div>
			{servers.length === 0 ? (
				<Empty description={t("noInstalled", { ns: "mcp" })} className="py-20" />
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
					{servers.map((server) => (
						<InstalledMcpCard
							key={server.id}
							server={server}
							onView={() => {}}
							onConfigure={onConfigure}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function McpLogoIcon({ size = 24, className }: { size?: number; className?: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 180 180"
			fill="none"
			className={className}
			style={{ flexShrink: 0 }}
		>
			{MCP_LOGO_PATHS.map((d, i) => (
				<path
					key={i}
					d={d}
					stroke="currentColor"
					strokeWidth="11.07"
					strokeLinecap="round"
					fill="none"
				/>
			))}
		</svg>
	);
}

function MarketSourcesTab() {
	const { t, i18n } = useTranslation();
	const { token } = useToken();
	const isZh = i18n.language?.startsWith("zh");

	const handleOpenSource = useCallback((source: McpMarketSource) => {
		window.open(source.url, "_blank");
	}, []);

	return (
		<div className="h-full overflow-y-auto pr-2">
			<div className="mb-4">
				<p style={{ color: token.colorTextSecondary }}>
					{t("sourcesDescription", { ns: "mcp" })}
				</p>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pb-4">
				{MCP_MARKET_SOURCES.map((source) => (
					<Card
						key={source.id}
						hoverable
						className="cursor-pointer"
						onClick={() => handleOpenSource(source)}
					>
						<div className="flex items-start gap-3">
							<div
								className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
								style={{
									backgroundColor: source.official ? token.colorPrimary : token.colorFillSecondary,
									color: source.official ? "#fff" : token.colorText,
								}}
							>
								<McpLogoIcon size={22} />
							</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 mb-1">
									<span className="font-semibold text-sm truncate" style={{ color: token.colorText }}>
										{isZh ? source.nameZh : source.name}
									</span>
									{source.official && (
										<Tag color="blue" className="!text-xs !px-1 !py-0 !m-0">
											<StarFilled className="mr-0.5" />
											{t("sourcesOfficial", { ns: "mcp" })}
										</Tag>
									)}
								</div>
								<p className="text-xs m-0 line-clamp-2" style={{ color: token.colorTextSecondary }}>
									{isZh ? source.descriptionZh : source.description}
								</p>
							</div>
							<Tooltip title={t("sourcesBrowse", { ns: "mcp" })}>
								<ExportOutlined style={{ color: token.colorTextTertiary }} />
							</Tooltip>
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}

function ThirdPartyFormModal({
	open, editingServer, form, onCancel, onFinish,
}: {
	open: boolean;
	editingServer: McpServer | null;
	form: any;
	onCancel: () => void;
	onFinish: (values: any) => void;
}) {
	const { t } = useTranslation();

	return (
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
			open={open}
			onCancel={onCancel}
			onOk={() => form.submit()}
			okText={t("save", { ns: "common" })}
			cancelText={t("cancel", { ns: "mcp" })}
			width={560}
			destroyOnHidden={true}
		>
			<Form form={form} layout="vertical" onFinish={onFinish}>
				<Form.Item name="name" label={t("form.name", { ns: "mcp" })} rules={[{ required: true, message: t("form.nameRequired", { ns: "mcp" }) }]}>
					<Input placeholder={t("form.namePlaceholder", { ns: "mcp" })} prefix={<ApiOutlined className="text-gray-400" />} />
				</Form.Item>
				<Form.Item name="description" label={t("description", { ns: "common" })}>
					<Input.TextArea placeholder={t("form.descriptionPlaceholder", { ns: "mcp" })} rows={2} />
				</Form.Item>
				<Form.Item name="transport" label={t("form.transport", { ns: "mcp" })} rules={[{ required: true, message: t("form.transportRequired", { ns: "mcp" }) }]} initialValue="http">
					<Select options={[{ value: "http", label: "HTTP" }, { value: "sse", label: "SSE" }, { value: "stdio", label: "STDIO" }]} />
				</Form.Item>
				<Form.Item noStyle shouldUpdate={(prev, cur) => prev.transport !== cur.transport}>
					{({ getFieldValue }) =>
						getFieldValue("transport") === "stdio" ? (
							<>
								<Form.Item name="command" label={t("form.command", { ns: "mcp" })} rules={[{ required: true, message: t("form.commandRequired", { ns: "mcp" }) }]}>
									<Input placeholder={t("form.commandPlaceholder", { ns: "mcp" })} prefix={<SaveOutlined className="text-gray-400" />} />
								</Form.Item>
								<Form.Item name="args" label={t("form.args", { ns: "mcp" })}>
									<Input placeholder={t("form.argsPlaceholder", { ns: "mcp" })} />
								</Form.Item>
							</>
						) : (
							<Form.Item name="url" label={t("form.url", { ns: "mcp" })} rules={[{ required: true, message: t("form.urlRequired", { ns: "mcp" }) }, { type: "url", message: t("form.urlInvalid", { ns: "mcp" }) }]}>
								<Input placeholder={t("form.urlPlaceholder", { ns: "mcp" })} prefix={<LinkOutlined className="text-gray-400" />} />
							</Form.Item>
						)
					}
				</Form.Item>
			</Form>
		</Modal>
	);
}

export default McpMarket;
