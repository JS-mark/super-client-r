import {
	ApiOutlined,
	BugOutlined,
	GlobalOutlined,
	InfoCircleOutlined,
	KeyOutlined,
	MenuOutlined,
	SearchOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import { Card, Tabs, theme } from "antd";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

const { useToken } = theme;
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { AboutModal } from "../components/AboutModal";
import { MainLayout } from "../components/layout/MainLayout";
import { McpConfig } from "../components/models/McpConfig";
import { AboutSection } from "../components/settings/AboutSection";
import { ApiKeysConfig } from "../components/settings/ApiKeysConfig";
import { ApiServiceSettings } from "../components/settings/ApiServiceSettings";
import { DebugTools } from "../components/settings/DebugTools";
import { GeneralSettings } from "../components/settings/GeneralSettings";
import { MenuSettingsWithModal } from "../components/settings/MenuSettings";
import { SearchSettings } from "../components/settings/SearchSettings";
import { ShortcutSettings } from "../components/settings/ShortcutSettings";
import { useTitle } from "../hooks/useTitle";
import { type AppInfo, appService } from "../services/appService";

const Settings: React.FC = () => {
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const [activeTab, setActiveTab] = useState("general");
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [aboutModalOpen, setAboutModalOpen] = useState(false);
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

	const items = [
		{
			key: "general",
			label: <TabLabel icon={<SettingOutlined />} text={t("general", "General", { ns: "settings" })} />,
			children: <GeneralSettings />,
		},
		{
			key: "menu",
			label: <TabLabel icon={<MenuOutlined />} text={t("menuConfig", "Menu", { ns: "settings" })} />,
			children: <Card className="!border-0 !shadow-none !bg-transparent"><MenuSettingsWithModal /></Card>,
		},
		{
			key: "mcp",
			label: <TabLabel icon={<ApiOutlined />} text="MCP Services" />,
			children: <McpConfig />,
		},
		{
			key: "api",
			label: <TabLabel icon={<GlobalOutlined />} text={t("apiService", "API Service", { ns: "settings" })} />,
			children: <ApiServiceSettings />,
		},
		{
			key: "search",
			label: <TabLabel icon={<SearchOutlined />} text={t("search.title", "Search", { ns: "settings" })} />,
			children: <Card className="!border-0 !shadow-none !bg-transparent"><SearchSettings /></Card>,
		},
		{
			key: "apikeys",
			label: <TabLabel icon={<KeyOutlined />} text={t("apiKeys", "API Keys", { ns: "settings" })} />,
			children: <Card className="!border-0 !shadow-none !bg-transparent"><ApiKeysConfig /></Card>,
		},
		{
			key: "shortcuts",
			label: <TabLabel icon={<KeyOutlined />} text={t("shortcuts", "Shortcuts", { ns: "settings" })} />,
			children: <Card className="!border-0 !shadow-none !bg-transparent"><ShortcutSettings /></Card>,
		},
		{
			key: "debug",
			label: <TabLabel icon={<BugOutlined />} text={t("debug", "Debug", { ns: "settings" })} />,
			children: <Card className="!border-0 !shadow-none !bg-transparent"><DebugTools /></Card>,
		},
		{
			key: "about",
			label: <TabLabel icon={<InfoCircleOutlined />} text={t("aboutTitle", "About", { ns: "settings" })} />,
			children: (
				<AboutSection
					appInfo={appInfo}
					onCheckUpdate={async () => {
						const result = await appService.checkUpdate();
						return result;
					}}
					onOpenGitHub={() => window.open("https://github.com/example/super-client", "_blank")}
					onReportBug={() => window.open("https://github.com/example/super-client/issues", "_blank")}
					onOpenLicense={() => window.open("https://github.com/example/super-client/blob/main/LICENSE", "_blank")}
					onOpenModal={() => setAboutModalOpen(true)}
				/>
			),
		},
	];

	return (
		<MainLayout>
			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={items}
				tabPlacement="start"
				className="h-full !p-6 settings-tabs"
			/>
			<AboutModal
				open={aboutModalOpen}
				onClose={() => setAboutModalOpen(false)}
				appInfo={appInfo}
			/>
		</MainLayout>
	);
};

function TabLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
	return (
		<span className="flex items-center gap-2 font-medium">
			{icon}
			{text}
		</span>
	);
}

export default Settings;
