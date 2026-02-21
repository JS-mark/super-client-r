import {
	ApiOutlined,
	AppstoreOutlined,
	BugOutlined,
	CloudOutlined,
	GlobalOutlined,
	InfoCircleOutlined,
	KeyOutlined,
	MenuOutlined,
	SearchOutlined,
	SettingOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import { Card, theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const { useToken } = theme;
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { AboutModal } from "../components/AboutModal";
import { MainLayout } from "../components/layout/MainLayout";
import { McpConfig } from "../components/models/McpConfig";
import { ModelList } from "../components/models/ModelList";
import { AboutSection } from "../components/settings/AboutSection";
import { ApiKeysConfig } from "../components/settings/ApiKeysConfig";
import { ApiServiceSettings } from "../components/settings/ApiServiceSettings";
import { DebugTools } from "../components/settings/DebugTools";
import { DefaultModelSettings } from "../components/settings/DefaultModelSettings";
import { GeneralSettings } from "../components/settings/GeneralSettings";
import { MenuSettingsWithModal } from "../components/settings/MenuSettings";
import { PluginConfigPanel } from "../components/settings/PluginConfigPanel";
import { SearchSettings } from "../components/settings/SearchSettings";
import { ShortcutSettings } from "../components/settings/ShortcutSettings";
import { useTitle } from "../hooks/useTitle";
import { type AppInfo, appService } from "../services/appService";
import { pluginService } from "../services/pluginService";

interface SettingsTab {
	key: string;
	icon: React.ReactNode;
	label: string;
	content: React.ReactNode;
}

const Settings: React.FC = () => {
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const [activeTab, setActiveTab] = useState("general");
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [aboutModalOpen, setAboutModalOpen] = useState(false);
	const [pluginSettingsPanels, setPluginSettingsPanels] = useState<
		Array<{
			pluginId: string;
			id: string;
			title: string;
			icon: string;
			properties: Record<
				string,
				{
					type: string;
					default?: unknown;
					description: string;
					enum?: string[];
					enumDescriptions?: string[];
				}
			>;
		}>
	>([]);
	const { token } = useToken();

	const pageTitle = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
					<SettingOutlined className="text-white text-xs" />
				</div>
				<span
					className="text-sm font-medium"
					style={{ color: token.colorText }}
				>
					{t("title", "设置", { ns: "settings" })}
				</span>
			</div>
		),
		[t, token.colorText],
	);

	useTitle(pageTitle);

	useEffect(() => {
		const tab = searchParams.get("tab");
		if (tab) setActiveTab(tab);
	}, [searchParams]);

	useEffect(() => {
		appService.getInfo().then(setAppInfo).catch(console.error);

		const handleNavigate = (_event: unknown, ...args: unknown[]) => {
			const path = args[0] as string;
			if (path.includes("tab=about")) setActiveTab("about");
			else if (path.includes("tab=debug")) setActiveTab("debug");
		};

		const handleAboutModal = () => setAboutModalOpen(true);

		window.electron.ipc.on("navigate-to", handleNavigate);
		window.electron.ipc.on("show-about-modal", handleAboutModal);
		return () => {
			window.electron.ipc.off("navigate-to", handleNavigate);
			window.electron.ipc.off("show-about-modal", handleAboutModal);
		};
	}, []);

	// Load plugin settings panels
	useEffect(() => {
		const loadPanels = (contributions: unknown) => {
			const data = contributions as {
				settingsPanels?: typeof pluginSettingsPanels;
			};
			if (data?.settingsPanels) {
				setPluginSettingsPanels(data.settingsPanels);
			}
		};

		pluginService
			.getUIContributions()
			.then((data) => loadPanels(data))
			.catch(() => {});

		const unsubscribe =
			window.electron.plugin.onUIContributionsChanged(loadPanels);
		return unsubscribe;
	}, []);

	const handleTabClick = useCallback((key: string) => {
		setActiveTab(key);
	}, []);

	const tabs: SettingsTab[] = useMemo(
		() => [
			{
				key: "general",
				icon: <SettingOutlined />,
				label: t("general", "General", { ns: "settings" }),
				content: <GeneralSettings />,
			},
			{
				key: "menu",
				icon: <MenuOutlined />,
				label: t("menuConfig", "Menu", { ns: "settings" }),
				content: (
					<Card className="!border-0 !shadow-none !bg-transparent">
						<MenuSettingsWithModal />
					</Card>
				),
			},
			{
				key: "providers",
				icon: <CloudOutlined />,
				label: t("providers", "Providers", { ns: "settings" }),
				content: <ModelList />,
			},
			{
				key: "defaultModel",
				icon: <ThunderboltOutlined />,
				label: t("defaultModel", "Default Model", { ns: "settings" }),
				content: <DefaultModelSettings />,
			},
			{
				key: "mcp",
				icon: <ApiOutlined />,
				label: t("mcpServices", "MCP Services", { ns: "settings" }),
				content: <McpConfig />,
			},
			{
				key: "api",
				icon: <GlobalOutlined />,
				label: t("apiService", "API Service", { ns: "settings" }),
				content: <ApiServiceSettings />,
			},
			{
				key: "search",
				icon: <SearchOutlined />,
				label: t("search.title", "Search", { ns: "settings" }),
				content: <SearchSettings />,
			},
			{
				key: "apikeys",
				icon: <KeyOutlined />,
				label: t("apiKeys", "API Keys", { ns: "settings" }),
				content: (
					<Card className="!border-0 !shadow-none !bg-transparent">
						<ApiKeysConfig />
					</Card>
				),
			},
			{
				key: "shortcuts",
				icon: <KeyOutlined />,
				label: t("shortcuts", "Shortcuts", { ns: "settings" }),
				content: (
					<Card className="!border-0 !shadow-none !bg-transparent">
						<ShortcutSettings />
					</Card>
				),
			},
			{
				key: "debug",
				icon: <BugOutlined />,
				label: t("debug", "Debug", { ns: "settings" }),
				content: (
					<Card className="!border-0 !shadow-none !bg-transparent">
						<DebugTools />
					</Card>
				),
			},
			{
				key: "about",
				icon: <InfoCircleOutlined />,
				label: t("aboutTitle", "About", { ns: "settings" }),
				content: (
					<AboutSection
						appInfo={appInfo}
						onCheckUpdate={async () => {
							const result = await appService.checkUpdate();
							return result;
						}}
						onOpenGitHub={() =>
							window.open("https://github.com/example/super-client", "_blank")
						}
						onReportBug={() =>
							window.open(
								"https://github.com/example/super-client/issues",
								"_blank",
							)
						}
						onOpenLicense={() =>
							window.open(
								"https://github.com/example/super-client/blob/main/LICENSE",
								"_blank",
							)
						}
						onOpenModal={() => setAboutModalOpen(true)}
					/>
				),
			},
		],
		[t, appInfo],
	);

	// Append plugin-contributed settings tabs
	const allTabs = useMemo(() => {
		if (pluginSettingsPanels.length === 0) return tabs;

		const pluginTabs: SettingsTab[] = pluginSettingsPanels.map((panel) => ({
			key: `plugin:${panel.pluginId}/${panel.id}`,
			icon: <AppstoreOutlined />,
			label: panel.title,
			content: (
				<PluginConfigPanel
					pluginId={panel.pluginId}
					title={panel.title}
					properties={panel.properties}
				/>
			),
		}));

		// Insert plugin tabs before the "about" tab
		const aboutIndex = tabs.findIndex((tab) => tab.key === "about");
		if (aboutIndex >= 0) {
			const result = [...tabs];
			result.splice(aboutIndex, 0, ...pluginTabs);
			return result;
		}
		return [...tabs, ...pluginTabs];
	}, [tabs, pluginSettingsPanels]);

	const activeContent = allTabs.find((tab) => tab.key === activeTab)?.content;

	return (
		<MainLayout>
			<div className="h-full flex overflow-hidden">
				{/* 左侧标签栏 - 固定不滚动 */}
				<nav
					className="w-[200px] flex-none border-r p-4 overflow-y-auto"
					style={{ borderColor: token.colorBorderSecondary }}
				>
					<div className="flex flex-col gap-1">
						{allTabs.map((tab) => (
							<button
								key={tab.key}
								type="button"
								onClick={() => handleTabClick(tab.key)}
								className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 text-left w-full"
								style={
									activeTab === tab.key
										? {
												backgroundColor: token.colorPrimaryBg,
												color: token.colorPrimary,
											}
										: {
												color: token.colorTextSecondary,
											}
								}
								onMouseEnter={(e) => {
									if (activeTab !== tab.key) {
										e.currentTarget.style.background = token.colorFillTertiary;
										e.currentTarget.style.color = token.colorText;
									}
								}}
								onMouseLeave={(e) => {
									if (activeTab !== tab.key) {
										e.currentTarget.style.background = "";
										e.currentTarget.style.color = token.colorTextSecondary;
									}
								}}
							>
								<span className="text-base">{tab.icon}</span>
								{tab.label}
							</button>
						))}
					</div>
				</nav>

				{/* 右侧内容区 - 独立滚动 */}
				<div className="flex-1 overflow-y-auto p-6">{activeContent}</div>
			</div>

			<AboutModal
				open={aboutModalOpen}
				onClose={() => setAboutModalOpen(false)}
				appInfo={appInfo}
			/>
		</MainLayout>
	);
};

export default Settings;
