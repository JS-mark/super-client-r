import {
	AppstoreOutlined,
	CheckCircleOutlined,
	CopyOutlined,
	DeleteOutlined,
	DownloadOutlined,
	ExclamationCircleOutlined,
	MessageOutlined,
	PlayCircleOutlined,
	PlusOutlined,
	ReloadOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import {
	Button,
	Card,
	Empty,
	Input,
	message,
	Modal,
	Popconfirm,
	Space,
	Spin,
	Switch,
	Tabs,
	Tag,
	theme,
	Tooltip,
	Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

const { useToken } = theme;
const { Text } = Typography;
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../components/layout/MainLayout";
import { useTitle } from "../hooks/useTitle";
import { pluginService } from "../services/pluginService";
import { useChatStore } from "../stores/chatStore";
import { useSkinStore } from "../stores/skinStore";
import type { MarketPlugin, PluginCommand, PluginInfo } from "../types/plugin";

const { Search } = Input;

// Template result from command execution
interface TemplateResult {
	id: string;
	name: string;
	description: string;
	template: string;
}

export default function Plugins() {
	const { t } = useTranslation();
	const { token } = useToken();
	const navigate = useNavigate();
	const setPendingInput = useChatStore((s) => s.setPendingInput);
	const activeSkinPluginId = useSkinStore((s) => s.activeSkinPluginId);
	const activeSkinThemeId = useSkinStore((s) => s.activeSkinThemeId);
	const setActiveSkin = useSkinStore((s) => s.setActiveSkin);
	const activeMarkdownPluginId = useSkinStore((s) => s.activeMarkdownPluginId);
	const activeMarkdownThemeId = useSkinStore((s) => s.activeMarkdownThemeId);
	const setActiveMarkdownTheme = useSkinStore((s) => s.setActiveMarkdownTheme);

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

	// 命令
	const [pluginCommands, setPluginCommands] = useState<
		Record<string, PluginCommand[]>
	>({});
	const [commandModalOpen, setCommandModalOpen] = useState(false);
	const [commandResult, setCommandResult] = useState<TemplateResult | null>(
		null,
	);
	const [executingCommand, setExecutingCommand] = useState<string | null>(
		null,
	);

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

	// 加载插件命令
	const loadPluginCommands = useCallback(async (plugins: PluginInfo[]) => {
		const commandsMap: Record<string, PluginCommand[]> = {};
		for (const plugin of plugins) {
			if (plugin.state === "active") {
				try {
					const commands = await pluginService.getCommands(plugin.id);
					if (commands.length > 0) {
						commandsMap[plugin.id] = commands;
					}
				} catch {
					// Plugin may not have commands
				}
			}
		}
		setPluginCommands(commandsMap);
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
	const handleInstallPlugin = useCallback(async () => {
		try {
			await pluginService.installPlugin();
			message.success(
				t("plugins.pluginInstalled", "插件安装成功", { ns: "plugins" }),
			);
			loadInstalledPlugins();
		} catch (error) {
			message.error(String(error));
		}
	}, [loadInstalledPlugins, t]);

	// 卸载插件
	const handleUninstallPlugin = useCallback(
		async (pluginId: string) => {
			try {
				await pluginService.uninstallPlugin(pluginId);
				message.success(
					t("plugins.pluginUninstalled", "插件已卸载", { ns: "plugins" }),
				);
				loadInstalledPlugins();
			} catch (error) {
				message.error(String(error));
			}
		},
		[loadInstalledPlugins, t],
	);

	// 启用/禁用插件
	const handleTogglePlugin = useCallback(
		async (plugin: PluginInfo) => {
			try {
				if (plugin.enabled) {
					await pluginService.disablePlugin(plugin.id);
					message.success(
						t("plugins.pluginDisabled", "插件已禁用", { ns: "plugins" }),
					);
				} else {
					await pluginService.enablePlugin(plugin.id);
					message.success(
						t("plugins.pluginEnabled", "插件已启用", { ns: "plugins" }),
					);
				}
				const plugins = await pluginService.getAllPlugins();
				setInstalledPlugins(plugins);
				await loadPluginCommands(plugins);
			} catch (error) {
				message.error(String(error));
			}
		},
		[loadPluginCommands, t],
	);

	// 从市场安装
	const handleInstallFromMarket = useCallback(
		async (pluginId: string) => {
			try {
				setLoading(true);
				await pluginService.downloadPlugin(pluginId);
				message.success(
					t("plugins.downloadSuccess", "插件下载并安装成功", { ns: "plugins" }),
				);
				loadMarketPlugins();
				loadInstalledPlugins();
			} catch (error) {
				message.error(String(error));
			} finally {
				setLoading(false);
			}
		},
		[loadMarketPlugins, loadInstalledPlugins, t],
	);

	// 执行命令
	const handleExecuteCommand = useCallback(async (command: string) => {
		try {
			setExecutingCommand(command);
			const result =
				await pluginService.executeCommand<TemplateResult>(command);
			setCommandResult(result);
			setCommandModalOpen(true);
		} catch (error) {
			message.error(String(error));
		} finally {
			setExecutingCommand(null);
		}
	}, []);

	// 激活主题
	const handleActivateTheme = useCallback(
		async (pluginId: string, themeId: string) => {
			try {
				setLoading(true);
				await window.electron.skin.setActiveSkin(pluginId, themeId);
				setActiveSkin(pluginId, themeId);
				message.success(t("plugins.skinActivated", "皮肤已启用", { ns: "plugins" }));
				loadInstalledPlugins();
			} catch (error) {
				message.error(String(error));
			} finally {
				setLoading(false);
			}
		},
		[setActiveSkin, loadInstalledPlugins, t],
	);

	// 恢复默认皮肤
	const handleRestoreDefaultSkin = useCallback(async () => {
		try {
			setLoading(true);
			await window.electron.skin.setActiveSkin(null);
			setActiveSkin(null, null);
			message.success(t("plugins.skinRestored", "已恢复默认主题", { ns: "plugins" }));
			loadInstalledPlugins();
		} catch (error) {
			message.error(String(error));
		} finally {
			setLoading(false);
		}
	}, [setActiveSkin, loadInstalledPlugins, t]);

	// 激活 Markdown 主题
	const handleActivateMarkdownTheme = useCallback(
		async (pluginId: string, themeId: string) => {
			try {
				setLoading(true);
				await window.electron.markdownTheme.setActive(pluginId, themeId);
				setActiveMarkdownTheme(pluginId, themeId);
				message.success(t("plugins.markdownThemeActivated", "Markdown 主题已启用", { ns: "plugins" }));
				loadInstalledPlugins();
			} catch (error) {
				message.error(String(error));
			} finally {
				setLoading(false);
			}
		},
		[setActiveMarkdownTheme, loadInstalledPlugins, t],
	);

	// 恢复默认 Markdown 主题
	const handleRestoreDefaultMarkdown = useCallback(async () => {
		try {
			setLoading(true);
			await window.electron.markdownTheme.setActive(null);
			setActiveMarkdownTheme(null, null);
			message.success(t("plugins.markdownThemeRestored", "已恢复默认 Markdown 样式", { ns: "plugins" }));
			loadInstalledPlugins();
		} catch (error) {
			message.error(String(error));
		} finally {
			setLoading(false);
		}
	}, [setActiveMarkdownTheme, loadInstalledPlugins, t]);

	// 复制模板
	const handleCopyTemplate = useCallback(() => {
		if (commandResult?.template) {
			navigator.clipboard.writeText(commandResult.template);
			message.success(
				t("plugins.copied", "已复制到剪贴板", { ns: "plugins" }),
			);
		}
	}, [commandResult, t]);

	// 在聊天中使用
	const handleUseInChat = useCallback(() => {
		if (commandResult?.template) {
			setPendingInput(commandResult.template);
			setCommandModalOpen(false);
			navigate("/chat");
		}
	}, [commandResult, setPendingInput, navigate]);

	// Load commands when installed plugins change
	useEffect(() => {
		if (installedPlugins.length > 0) {
			loadPluginCommands(installedPlugins);
		}
	}, [installedPlugins, loadPluginCommands]);

	// 已安装插件卡片
	const renderInstalledPlugin = useCallback(
		(plugin: PluginInfo) => {
			const commands = pluginCommands[plugin.id] || [];
			const visibleCommands = commands.filter(
				(c) => !c.command.endsWith(".list"),
			);
			const isActive = plugin.state === "active";
			const isSkin = plugin.manifest.categories?.includes("theme") && (plugin.manifest.contributes?.themes?.length ?? 0) > 0;
			const isMarkdownTheme = plugin.manifest.categories?.includes("markdown") && (plugin.manifest.contributes?.themes?.length ?? 0) > 0;
			const themes = plugin.manifest.contributes?.themes || [];
			const hasSkinActive = isSkin && activeSkinPluginId === plugin.id;
			const hasMarkdownActive = isMarkdownTheme && activeMarkdownPluginId === plugin.id;

			const stateConfig: Record<
				string,
				{ color: string; text: string }
			> = {
				installing: { color: "processing", text: "安装中" },
				installed: { color: "default", text: "已安装" },
				activating: { color: "processing", text: "激活中" },
				active: { color: "green", text: "运行中" },
				deactivating: { color: "orange", text: "停用中" },
				inactive: { color: "default", text: "已停用" },
				error: { color: "red", text: "错误" },
				uninstalling: { color: "orange", text: "卸载中" },
			};
			const stateInfo = stateConfig[plugin.state] || stateConfig.inactive;

			return (
				<div
					key={plugin.id}
					className="rounded-xl border overflow-hidden transition-all"
					style={{
						backgroundColor: token.colorBgContainer,
						borderColor: isActive
							? token.colorPrimary
							: token.colorBorderSecondary,
						borderWidth: isActive ? 1.5 : 1,
					}}
				>
					{/* Header */}
					<div className="px-5 pt-5 pb-3">
						<div className="flex items-start justify-between gap-3">
							<div className="flex items-center gap-3 min-w-0">
								<div
									className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
									style={{
										background: isActive
											? `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`
											: token.colorFillSecondary,
										color: isActive
											? "#fff"
											: token.colorTextSecondary,
									}}
								>
									{plugin.manifest.icon || "🔌"}
								</div>
								<div className="min-w-0">
									<div className="font-semibold text-sm truncate" style={{ color: token.colorText }}>
										{plugin.manifest.displayName}
									</div>
									<div className="flex items-center gap-2 mt-0.5">
										<Tag
											color={stateInfo.color}
											bordered={false}
											style={{ margin: 0, fontSize: 11, lineHeight: "18px", padding: "0 6px" }}
										>
											{stateInfo.text}
										</Tag>
										<span
											className="text-xs"
											style={{ color: token.colorTextQuaternary }}
										>
											v{plugin.manifest.version}
										</span>
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<Tooltip title={plugin.enabled ? "禁用" : "启用"}>
									<Switch
										size="small"
										checked={plugin.enabled}
										onChange={() => handleTogglePlugin(plugin)}
									/>
								</Tooltip>
								<Popconfirm
									title={t(
										"plugins.confirmUninstall",
										"确定要卸载此插件吗？",
									)}
									onConfirm={() => handleUninstallPlugin(plugin.id)}
									okText={t("common.yes", "是")}
									cancelText={t("no", "否", { ns: "common" })}
								>
									<Tooltip title="卸载">
										<Button
											type="text"
											size="small"
											danger
											icon={<DeleteOutlined />}
										/>
									</Tooltip>
								</Popconfirm>
							</div>
						</div>

						{/* Description */}
						<p
							className="text-xs mt-2.5 line-clamp-2 leading-relaxed"
							style={{ color: token.colorTextSecondary }}
						>
							{plugin.manifest.description}
						</p>

						{/* Tags */}
						<div className="flex items-center gap-1.5 mt-2">
							{plugin.isBuiltin && (
								<Tag
									bordered={false}
									style={{
										margin: 0,
										fontSize: 11,
										lineHeight: "18px",
										padding: "0 6px",
										backgroundColor: token.colorPrimaryBg,
										color: token.colorPrimary,
									}}
								>
									内置
								</Tag>
							)}
							{plugin.isDev && (
								<Tag
									bordered={false}
									color="orange"
									style={{
										margin: 0,
										fontSize: 11,
										lineHeight: "18px",
										padding: "0 6px",
									}}
								>
									开发
								</Tag>
							)}
						</div>

						{/* Skin theme selection */}
						{isSkin && isActive && themes.length > 0 && (
							<div className="mt-3">
								<div className="flex flex-wrap gap-2">
									{themes.map((themeItem: { id: string; label: string; icon?: string }) => {
										const isThemeActive = hasSkinActive && activeSkinThemeId === themeItem.id;
										return (
											<Button
												key={themeItem.id}
												size="small"
												type={isThemeActive ? "primary" : "default"}
												onClick={() => {
													if (isThemeActive) {
														handleRestoreDefaultSkin();
													} else {
														handleActivateTheme(plugin.id, themeItem.id);
													}
												}}
												loading={loading}
												style={{
													borderRadius: 6,
													fontSize: 12,
												}}
											>
												{themeItem.icon ? `${themeItem.icon} ` : ""}{themeItem.label}
											</Button>
										);
									})}
								</div>
								{hasSkinActive && (
									<Button
										type="link"
										size="small"
										onClick={handleRestoreDefaultSkin}
										loading={loading}
										style={{ padding: "4px 0", fontSize: 12, height: "auto" }}
									>
										{t("plugins.restoreDefault", "恢复默认", { ns: "plugins" })}
									</Button>
								)}
							</div>
						)}

						{/* Markdown theme selection */}
						{isMarkdownTheme && isActive && themes.length > 0 && (
							<div className="mt-3">
								<div className="flex flex-wrap gap-2">
									{themes.map((themeItem: { id: string; label: string; icon?: string }) => {
										const isMdThemeActive = hasMarkdownActive && activeMarkdownThemeId === themeItem.id;
										return (
											<Button
												key={themeItem.id}
												size="small"
												type={isMdThemeActive ? "primary" : "default"}
												onClick={() => {
													if (isMdThemeActive) {
														handleRestoreDefaultMarkdown();
													} else {
														handleActivateMarkdownTheme(plugin.id, themeItem.id);
													}
												}}
												loading={loading}
												style={{
													borderRadius: 6,
													fontSize: 12,
												}}
											>
												{themeItem.icon ? `${themeItem.icon} ` : ""}{themeItem.label}
											</Button>
										);
									})}
								</div>
								{hasMarkdownActive && (
									<Button
										type="link"
										size="small"
										onClick={handleRestoreDefaultMarkdown}
										loading={loading}
										style={{ padding: "4px 0", fontSize: 12, height: "auto" }}
									>
										{t("plugins.restoreDefault", "恢复默认", { ns: "plugins" })}
									</Button>
								)}
							</div>
						)}

						{/* Error */}
						{plugin.error && (
							<div
								className="text-xs flex items-center gap-1 mt-2 px-2 py-1 rounded"
								style={{
									color: token.colorError,
									backgroundColor: token.colorErrorBg,
								}}
							>
								<ExclamationCircleOutlined />
								{plugin.error}
							</div>
						)}
					</div>

					{/* Commands section */}
					{visibleCommands.length > 0 && (
						<div
							className="px-5 py-3 border-t"
							style={{
								borderColor: token.colorBorderSecondary,
								backgroundColor: token.colorFillQuaternary,
							}}
						>
							<div
								className="flex items-center gap-1.5 mb-2"
								style={{ color: token.colorTextTertiary }}
							>
								<ThunderboltOutlined style={{ fontSize: 11 }} />
								<span className="text-xs font-medium">
									{t("plugins.commands", "命令", { ns: "plugins" })}
								</span>
								<span
									className="text-xs"
									style={{ color: token.colorTextQuaternary }}
								>
									({visibleCommands.length})
								</span>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{visibleCommands.map((cmd) => (
									<Button
										key={cmd.command}
										size="small"
										type="text"
										icon={<PlayCircleOutlined />}
										loading={executingCommand === cmd.command}
										onClick={() => handleExecuteCommand(cmd.command)}
										style={{
											fontSize: 12,
											height: 26,
											padding: "0 8px",
											borderRadius: 6,
											backgroundColor: token.colorBgContainer,
											border: `1px solid ${token.colorBorderSecondary}`,
										}}
									>
										{cmd.title || cmd.command.split(".").pop()}
									</Button>
								))}
							</div>
						</div>
					)}
				</div>
			);
		},
		[
			pluginCommands,
			executingCommand,
			token,
			t,
			loading,
			activeSkinPluginId,
			activeSkinThemeId,
			activeMarkdownPluginId,
			activeMarkdownThemeId,
			handleTogglePlugin,
			handleUninstallPlugin,
			handleExecuteCommand,
			handleActivateTheme,
			handleRestoreDefaultSkin,
			handleActivateMarkdownTheme,
			handleRestoreDefaultMarkdown,
		],
	);

	const tabContent = [
		{
			key: "market",
			label: t("plugins.market", "插件市场", { ns: "plugins" }),
			children: (
				<>
					<div className="mb-4">
						<Search
							placeholder={t("plugins.searchPlaceholder", "搜索插件...", {
								ns: "plugins",
							})}
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
							description={t(
								"plugins.noMarketPlugins",
								"暂无可用插件",
								{ ns: "plugins" },
							)}
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{marketPlugins.map((plugin) => (
								<Card
									key={plugin.id}
									hoverable
									style={{
										backgroundColor: token.colorBgContainer,
										borderColor: token.colorBorderSecondary,
										borderRadius: 12,
									}}
									styles={{ body: { padding: "20px" } }}
								>
									<div className="flex items-center gap-3 mb-3">
										<div
											className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
											style={{
												background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
												color: "#fff",
											}}
										>
											{plugin.icon || "🔌"}
										</div>
										<div className="min-w-0">
											<div className="font-semibold text-sm truncate" style={{ color: token.colorText }}>
												{plugin.displayName}
											</div>
											<div
												className="flex items-center gap-2 text-xs mt-0.5"
												style={{ color: token.colorTextQuaternary }}
											>
												<span>v{plugin.version}</span>
												<span>·</span>
												<span>{plugin.author}</span>
											</div>
										</div>
									</div>

									<p
										className="text-xs line-clamp-2 leading-relaxed mb-3"
										style={{ color: token.colorTextSecondary }}
									>
										{plugin.description}
									</p>

									<div className="flex items-center gap-1 mb-3">
										{plugin.categories.map((cat: string) => (
											<Tag
												key={cat}
												bordered={false}
												style={{
													margin: 0,
													fontSize: 11,
													lineHeight: "18px",
													padding: "0 6px",
												}}
											>
												{cat}
											</Tag>
										))}
									</div>

									<div className="flex items-center justify-between">
										<div
											className="flex items-center gap-3 text-xs"
											style={{ color: token.colorTextQuaternary }}
										>
											<span>{plugin.downloads} 下载</span>
											<span>{plugin.rating} 评分</span>
										</div>
										{plugin.installed ? (
											<Tag
												icon={<CheckCircleOutlined />}
												color="success"
												bordered={false}
												style={{ margin: 0 }}
											>
												{t("plugins.installed", "已安装", {
													ns: "plugins",
												})}
											</Tag>
										) : (
											<Button
												type="primary"
												size="small"
												icon={<DownloadOutlined />}
												onClick={() =>
													handleInstallFromMarket(plugin.id)
												}
												loading={loading}
											>
												{t("plugins.install", "安装", {
													ns: "plugins",
												})}
											</Button>
										)}
									</div>
								</Card>
							))}
						</div>
					)}
				</>
			),
		},
		{
			key: "installed",
			label: (
				<Space size={4}>
					{t("plugins.installed", "已安装", { ns: "plugins" })}
					{installedPlugins.length > 0 && (
						<Tag
							bordered={false}
							style={{
								margin: 0,
								fontSize: 11,
								lineHeight: "18px",
								padding: "0 6px",
								minWidth: 18,
								textAlign: "center",
								borderRadius: 10,
							}}
						>
							{installedPlugins.length}
						</Tag>
					)}
				</Space>
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
							<Button
								type="primary"
								onClick={() => setActiveTab("market")}
							>
								{t("plugins.browseMarket", "浏览插件市场", {
									ns: "plugins",
								})}
							</Button>
						</Empty>
					) : (
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
							{installedPlugins.map(renderInstalledPlugin)}
						</div>
					)}
				</>
			),
		},
	];

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
						borderColor: token.colorBorderSecondary,
						backgroundColor: token.colorBgContainer,
					}}
				>
					<div className="flex items-center justify-between">
						<div>
							<h1
								className="text-xl font-semibold"
								style={{ color: token.colorText }}
							>
								{t("plugins.title", "插件中心", { ns: "plugins" })}
							</h1>
							<p
								className="text-xs mt-1"
								style={{ color: token.colorTextTertiary }}
							>
								{t(
									"plugins.subtitle",
									"管理和安装插件以扩展应用功能",
									{ ns: "plugins" },
								)}
							</p>
						</div>
						<Space>
							<Button
								size="small"
								icon={<ReloadOutlined />}
								onClick={() => {
									loadInstalledPlugins();
									loadMarketPlugins();
								}}
							>
								{t("refresh", "刷新", { ns: "common" })}
							</Button>
							<Button
								size="small"
								type="primary"
								icon={<PlusOutlined />}
								onClick={handleInstallPlugin}
							>
								{t("plugins.installLocal", "安装本地插件", {
									ns: "plugins",
								})}
							</Button>
						</Space>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-6">
					<Tabs
						items={tabContent}
						activeKey={activeTab}
						onChange={setActiveTab}
					/>
				</div>
			</div>

			{/* Command Result Modal */}
			<Modal
				title={
					<div className="flex items-center gap-2">
						<ThunderboltOutlined style={{ color: token.colorPrimary }} />
						{commandResult?.name ||
							t("plugins.commandResult", "命令结果", { ns: "plugins" })}
					</div>
				}
				open={commandModalOpen}
				onCancel={() => setCommandModalOpen(false)}
				footer={[
					<Button
						key="copy"
						icon={<CopyOutlined />}
						onClick={handleCopyTemplate}
					>
						{t("plugins.copy", "复制", { ns: "plugins" })}
					</Button>,
					<Button
						key="useInChat"
						type="primary"
						icon={<MessageOutlined />}
						onClick={handleUseInChat}
					>
						{t("plugins.useInChat", "在聊天中使用", { ns: "plugins" })}
					</Button>,
				]}
				width={600}
			>
				{commandResult && (
					<div className="space-y-4">
						<div>
							<Text type="secondary" className="text-xs block mb-1">
								{t("plugins.description", "描述", { ns: "plugins" })}
							</Text>
							<Text>{commandResult.description}</Text>
						</div>
						<div>
							<Text type="secondary" className="text-xs block mb-1">
								{t("plugins.template", "模板", { ns: "plugins" })}
							</Text>
							<div
								className="p-3 rounded-lg text-sm font-mono whitespace-pre-wrap"
								style={{
									backgroundColor: token.colorFillTertiary,
									border: `1px solid ${token.colorBorderSecondary}`,
								}}
							>
								{commandResult.template}
							</div>
						</div>
					</div>
				)}
			</Modal>
		</MainLayout>
	);
}
