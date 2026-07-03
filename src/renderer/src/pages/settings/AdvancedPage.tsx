import { Card, Tabs } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";
import {
	PerformanceMonitorTab,
	QuickActionsTab,
	SystemInfoTab,
} from "../../components/settings/DebugTools";
import { FeatureFlagsSettings } from "../../components/settings/FeatureFlagsSettings";

const AdvancedPage: React.FC = () => {
	const { t } = useTranslation();
	return (
		<Card className="border-0! shadow-none! bg-transparent!">
			<Tabs
				defaultActiveKey="experimental"
				items={[
					{
						key: "experimental",
						label: t("advancedTabs.experimental", "实验性功能", {
							ns: "settings",
						}),
						children: <FeatureFlagsSettings />,
					},
					{
						key: "quickActions",
						label: t("advancedTabs.quickActions", "快速操作", {
							ns: "settings",
						}),
						children: <QuickActionsTab />,
					},
					{
						key: "systemInfo",
						label: t("advancedTabs.systemInfo", "系统信息", {
							ns: "settings",
						}),
						children: <SystemInfoTab />,
					},
					{
						key: "performance",
						label: t("advancedTabs.performance", "性能监控", {
							ns: "settings",
						}),
						children: <PerformanceMonitorTab />,
					},
				]}
			/>
		</Card>
	);
};

export default AdvancedPage;
