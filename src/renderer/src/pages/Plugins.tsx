import {
	AppstoreOutlined,
	CheckCircleOutlined,
	DeleteOutlined,
	DownloadOutlined,
	ExclamationCircleOutlined,
	LoadingOutlined,
	PlusOutlined,
	ReloadOutlined,
	SearchOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import {
	Badge,
	Button,
	Card,
	Empty,
	Input,
	List,
	message,
	Popconfirm,
	Spin,
	Switch,
	Tabs,
	Tag,
	theme,
} from "antd";
import { Children, useCallback, useEffect, useMemo, useState } from "react";

const { useToken } = theme;
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { useTitle } from "../hooks/useTitle";
import { cn } from "../lib/utils";
import { pluginService } from "../services/pluginService";
import type { MarketPlugin, PluginInfo } from "../types/plugin";

const { Search } = Input;

// 插件状态标签
const PluginStateBadge = ({ state }: { state: PluginInfo["state"] }) => {
	const stateConfig = {
		installing: { color: "processing", text: "安装中" },
		installed: { color: "default", text: "已安装" },
		activating: { color: "processing", text: "激活中" },
		active: { color: "success", text: "运行中" },
		deactivating: { color: "warning", text: "停用中" },
		inactive: { color: "default", text: "已停用" },
		error: { color: "error", text: "错误" },
		uninstalling: { color: "warning", text: "卸载中" },
	};

	const config = stateConfig[state];
	return <Badge status={config.color as any} text={config.text} />;
};

export default function Plugins() {
	const { t } = useTranslation();
	const { token } = useToken();

	// 设置标题栏
	const pageTitle = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
					<AppstoreOutlined className="text-white text-xs" />
				</div>
				<span
					className="text-sm font-medium"
					style={{ color: token.colorText }}
				>
					{t("plugins", "插件", { ns: "menu" })}
				</span>
			</div>
		),
		[t, token.colorText],
	);
	useTitle(pageTitle);

	// 状态
	const [activeTab, setActiveTab] = useState("market");
	const [loading, setLoading] = useState(false);

	// 已安装插件
	const [installedPlugins, setInstalledPlugins] = useState<PluginInfo[]>([]);
	const [installedLoading, setInstalledLoading] = useState(false);

	// 插件市场
	const [marketPlugins, setMarketPlugins] = useState<MarketPlugin[]>([]);
	const [marketLoading, setMarketLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// 加载已安装插件
	const loadInstalledPlugins = useCallback(async () => {
		setInstalledLoading(true);
		try {
			const plugins = await pluginService.getAllPlugins();
			setInstalledPlugins(plugins);
		} catch (error) {
			message.error(String(error));
		} finally {
			setInstalledLoading(false);
		}
	}, []);

	// 加载市场插件
	const loadMarketPlugins = useCallback(async () => {
		setMarketLoading(true);
		try {
			const plugins = await pluginService.searchMarket(searchQuery);
			setMarketPlugins(plugins);
		} catch (error) {
			message.error(String(error));
		} finally {
			setMarketLoading(false);
		}
	}, [searchQuery]);

	// 安装插件
	const handleInstallPlugin = async () => {
		try {
			await pluginService.installPlugin();
			message.success("插件安装成功");
			loadInstalledPlugins();
		} catch (error) {
			message.error(String(error));
		}
	};

	// 卸载插件
	const handleUninstallPlugin = async (pluginId: string) => {
		try {
			await pluginService.uninstallPlugin(pluginId);
			message.success("插件已卸载");
			loadInstalledPlugins();
		} catch (error) {
			message.error(String(error));
		}
	};

	// 启用/禁用插件
	const handleTogglePlugin = async (plugin: PluginInfo) => {
		try {
			if (plugin.enabled) {
				await pluginService.disablePlugin(plugin.id);
				message.success("插件已禁用");
			} else {
				await pluginService.enablePlugin(plugin.id);
				message.success("插件已启用");
			}
			loadInstalledPlugins();
		} catch (error) {
			message.error(String(error));
		}
	};

	// 从市场安装
	const handleInstallFromMarket = async (pluginId: string) => {
		try {
			setLoading(true);
			await pluginService.downloadPlugin(pluginId);
			message.success("插件下载并安装成功");
			loadMarketPlugins();
			loadInstalledPlugins();
		} catch (error) {
			message.error(String(error));
		} finally {
			setLoading(false);
		}
	};

	const tabContent = [
		{
			key: "market",
			label: t("plugins.market", "插件市场", { ns: "plugins" }),
			children: (
				<>
					<div className="mb-4">
						<Search
							placeholder={t("plugins.searchPlaceholder", "搜索插件...", { ns: "plugins" })}
							allowClear
							onSearch={loadMarketPlugins}
							onChange={(e) => setSearchQuery(e.target.value)}
							style={{ maxWidth: 400 }}
						/>
					</div>

					{marketLoading ? (
						<div className="flex justify-center py-12">
							<Spin size="large" />
						</div>
					) : marketPlugins.length === 0 ? (
						<Empty
							description={t("plugins.noMarketPlugins", "暂无可用插件", { ns: "plugins" })}
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{marketPlugins.map((plugin) => (
								<Card
									key={plugin.id}
									hoverable
									style={{
										backgroundColor: token.colorBgContainer,
										borderColor: token.colorBorder,
									}}
									actions={[
										plugin.installed ? (
											<Button
												key="installed"
												disabled
												icon={<CheckCircleOutlined />}
											>
												{t("plugins.installed", "已安装", { ns: "plugins" })}
											</Button>
										) : (
											<Button
												key="install"
												type="primary"
												icon={<DownloadOutlined />}
												onClick={() => handleInstallFromMarket(plugin.id)}
												loading={loading}
											>
												{t("plugins.install", "安装", { ns: "plugins" })}
											</Button>
										),
									]}
								>
									<Card.Meta
										title={
											<div className="flex items-center gap-2">
												<span className="text-lg">
													{plugin.icon || "🔌"}
												</span>
												<span>{plugin.displayName}</span>
											</div>
										}
										description={
											<div className="space-y-2">
												<p className="text-slate-500 line-clamp-2">
													{plugin.description}
												</p>
												<div className="flex items-center gap-2 text-xs text-slate-400">
													<span>v{plugin.version}</span>
													<span>·</span>
													<span>{plugin.author}</span>
												</div>
												<div className="flex items-center gap-1">
													{plugin.categories.map((cat: string) => (
														<Tag key={cat}>{cat}</Tag>
													))}
												</div>
												<div className="flex items-center gap-4 text-xs text-slate-400">
													<span>⬇️ {plugin.downloads}</span>
													<span>⭐ {plugin.rating}</span>
												</div>
											</div>
										}
									/>
								</Card>
							))}
						</div>
					)}
				</>
			)
		},
		{
			key: "installed",
			label: (
				<span>
					{t("plugins.installed", "已安装", { ns: "plugins" })}
					{installedPlugins.length > 0 && (
						<Badge count={installedPlugins.length} className="ml-1" />
					)}
				</span>
			),
			children: (
				<>
					{installedLoading ? (
						<div className="flex justify-center py-12">
							<Spin size="large" />
						</div>
					) : installedPlugins.length === 0 ? (
						<Empty
							description={t(
								"plugins.noInstalledPlugins",
								"暂无已安装插件",
							)}
							image={Empty.PRESENTED_IMAGE_SIMPLE}
						>
							<Button type="primary" onClick={() => setActiveTab("market")}>
								{t("plugins.browseMarket", "浏览插件市场", { ns: "plugins" })}
							</Button>
						</Empty>
					) : (
						<List
							grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3 }}
							dataSource={installedPlugins}
							renderItem={(plugin) => (
								<List.Item>
									<Card
										className={cn(
											"w-full",
											plugin.enabled &&
											"border-blue-500",
										)}
										actions={[
											<Switch
												key="toggle"
												checked={plugin.enabled}
												onChange={() => handleTogglePlugin(plugin)}
												checkedChildren="启用"
												unCheckedChildren="禁用"
											/>,
											<Popconfirm
												key="delete"
												title={t(
													"plugins.confirmUninstall",
													"确定要卸载此插件吗？",
												)}
												onConfirm={() => handleUninstallPlugin(plugin.id)}
												okText={t("common.yes", "是")}
												cancelText={t("no", "否", { ns: "common" })}
											>
												<Button danger icon={<DeleteOutlined />}>
													{t("uninstall", "卸载", { ns: "common" })}
												</Button>
											</Popconfirm>,
										]}
									>
										<Card.Meta
											avatar={
												<div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center text-lg">
													{plugin.manifest.icon || "🔌"}
												</div>
											}
											title={
												<div className="flex items-center gap-2">
													<span>{plugin.manifest.displayName}</span>
													<PluginStateBadge state={plugin.state} />
												</div>
											}
											description={
												<div className="space-y-1">
													<p className="text-slate-500 text-sm line-clamp-2">
														{plugin.manifest.description}
													</p>
													<div className="flex items-center gap-2 text-xs text-slate-400">
														<span>v{plugin.manifest.version}</span>
														{plugin.isBuiltin && (
															<Tag color="blue">内置</Tag>
														)}
														{plugin.isDev && <Tag color="orange">开发</Tag>}
													</div>
													{plugin.error && (
														<div className="text-red-500 text-xs flex items-center gap-1">
															<ExclamationCircleOutlined />
															{plugin.error}
														</div>
													)}
												</div>
											}
										/>
									</Card>
								</List.Item>
							)}
						/>
					)}
				</>
			)
		}
	]

	// 初始加载
	useEffect(() => {
		loadInstalledPlugins();
		loadMarketPlugins();
	}, [loadInstalledPlugins, loadMarketPlugins]);

	return (
		<MainLayout>
			<div
				className="h-full flex flex-col"
				style={{ backgroundColor: token.colorBgLayout }}
			>
				{/* Header */}
				<div
					className="px-6 py-4 border-b"
					style={{
						borderColor: token.colorBorder,
						backgroundColor: token.colorBgContainer,
					}}
				>
					<div className="flex items-center justify-between">
						<div>
							<h1
								className="text-2xl font-bold"
								style={{ color: token.colorTextHeading }}
							>
								{t("plugins.title", "插件中心", { ns: "plugins" })}
							</h1>
							<p className="text-sm text-slate-500 mt-1">
								{t("plugins.subtitle", "管理和安装插件以扩展应用功能", { ns: "plugins" })}
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								icon={<ReloadOutlined />}
								onClick={() => {
									loadInstalledPlugins();
									loadMarketPlugins();
								}}
							>
								{t("refresh", "刷新", { ns: "common" })}
							</Button>
							<Button
								type="primary"
								icon={<PlusOutlined />}
								onClick={handleInstallPlugin}
							>
								{t("plugins.installLocal", "安装本地插件", { ns: "plugins" })}
							</Button>
						</div>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-6">
					<Tabs items={tabContent} activeKey={activeTab} onChange={setActiveTab}></Tabs>
				</div>
			</div>
		</MainLayout>
	);
}
