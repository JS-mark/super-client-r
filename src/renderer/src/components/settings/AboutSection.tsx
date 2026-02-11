import {
	BugOutlined,
	CodeOutlined,
	FileTextOutlined,
	GithubOutlined,
	HeartOutlined,
	InfoCircleOutlined,
	ReloadOutlined,
	RocketOutlined,
	StarOutlined,
	TeamOutlined,
	TrophyOutlined,
} from "@ant-design/icons";
import { Button, Card, Tabs, Tag, Timeline, Typography } from "antd";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppInfo } from "../../services/appService";

const { Title, Text, Paragraph } = Typography;

interface AboutSectionProps {
	appInfo: AppInfo | null;
	onCheckUpdate: () => void;
	onOpenGitHub: () => void;
	onReportBug: () => void;
	onOpenLicense: () => void;
	onOpenModal?: () => void;
}

// 概览 Tab
const OverviewTab: React.FC<{ appInfo: AppInfo | null }> = ({ appInfo }) => {
	const { t } = useTranslation();

	const features = [
		{
			icon: <RocketOutlined />,
			titleKey: "settings.about.features.aiChat.title",
			descKey: "settings.about.features.aiChat.desc",
			color: "from-blue-500 to-cyan-500",
		},
		{
			icon: <CodeOutlined />,
			titleKey: "settings.about.features.mcp.title",
			descKey: "settings.about.features.mcp.desc",
			color: "from-purple-500 to-pink-500",
		},
		{
			icon: <StarOutlined />,
			titleKey: "settings.about.features.skills.title",
			descKey: "settings.about.features.skills.desc",
			color: "from-orange-500 to-red-500",
		},
		{
			icon: <InfoCircleOutlined />,
			titleKey: "settings.about.features.localApi.title",
			descKey: "settings.about.features.localApi.desc",
			color: "from-green-500 to-emerald-500",
		},
	];

	return (
		<div className="space-y-6">
			{/* Hero Section */}
			<div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-3">
				<div className="absolute inset-0 opacity-20">
					<div className="absolute top-0 left-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl" />
					<div className="absolute top-0 right-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl" />
				</div>

				<div className="relative z-10 text-center">
					<div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 shadow-2xl mb-4">
						<RocketOutlined className="text-2xl text-white" />
					</div>

					<Title level={3} className="!text-white !mb-2">
						{appInfo?.name || "Super Client"}
					</Title>

					<div className="flex items-center justify-center gap-2 mb-3">
						<Tag className="!bg-white/20 !text-white !border-0 !rounded-full !px-3 !py-0.5">
							v{appInfo?.version || "0.0.1"}
						</Tag>
						<Tag className="!bg-green-500/20 !text-green-400 !border-green-500/30 !rounded-full !px-3 !py-0.5">
							MIT License
						</Tag>
					</div>

					<Paragraph className="!text-slate-300 text-sm">
						{t("aboutDescription", "A powerful AI desktop client for seamless interaction with multiple AI services.", { ns: "settings" })}
					</Paragraph>
				</div>
			</div>

			{/* Features Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{features.map((feature) => (
					<div
						key={feature.titleKey}
						className="group relative overflow-hidden rounded-xl p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-all duration-300"
					>
						<div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${feature.color} opacity-10 rounded-full -mr-4 -mt-4 transition-transform group-hover:scale-150`} />
						<div className="relative z-10">
							<div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 shadow-lg`}>
								<span className="text-white text-lg">{feature.icon}</span>
							</div>
							<h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
								{t(feature.titleKey)}
							</h3>
							<p className="text-xs text-slate-500 dark:text-slate-400">
								{t(feature.descKey)}
							</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

// 系统信息 Tab
const SystemInfoTab: React.FC<{ appInfo: AppInfo | null }> = ({ appInfo }) => {
	const { t } = useTranslation();

	const systemItems = [
		{ label: t("platform", "Platform", { ns: "settings" }), value: appInfo?.platform === "darwin" ? "macOS" : appInfo?.platform || "N/A", icon: <InfoCircleOutlined /> },
		{ label: t("architecture", "Arch", { ns: "settings" }), value: appInfo?.arch || "N/A", icon: <CodeOutlined /> },
		{ label: "Node.js", value: appInfo?.node || "N/A", icon: <CodeOutlined /> },
		{ label: "Electron", value: appInfo?.electron || "N/A", icon: <CodeOutlined /> },
	];

	return (
		<div className="space-y-4">
			<Card
				title={
					<span className="flex items-center gap-2">
						<CodeOutlined className="text-blue-500" />
						<span>{t("about.systemInfo", { ns: "settings" })}</span>
					</span>
				}
				className="!rounded-xl !border-slate-200 dark:!border-slate-700"
			>
				<div className="grid grid-cols-2 gap-4">
					{systemItems.map((item) => (
						<div
							key={item.value}
							className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50"
						>
							<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm">
								{item.icon}
							</div>
							<div>
								<div className="text-xs font-medium text-slate-900 dark:text-slate-100">{item.value}</div>
								<div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
							</div>
						</div>
					))}
				</div>
			</Card>

			<Card
				title={
					<span className="flex items-center gap-2">
						<TrophyOutlined className="text-yellow-500" />
						<span>{t("about.achievements", { ns: "settings" })}</span>
					</span>
				}
				className="!rounded-xl !border-slate-200 dark:!border-slate-700"
			>
				<div className="flex flex-wrap gap-2">
					<Tag color="blue">AI Chat</Tag>
					<Tag color="purple">MCP Support</Tag>
					<Tag color="orange">Skill System</Tag>
					<Tag color="green">Local API</Tag>
					<Tag color="cyan">i18n</Tag>
					<Tag color="magenta">Dark Mode</Tag>
				</div>
			</Card>
		</div>
	);
};

// 更新日志 Tab
const ChangelogTab: React.FC = () => {
	const { t } = useTranslation();

	return (
		<Card
			title={
				<span className="flex items-center gap-2">
					<InfoCircleOutlined className="text-purple-500" />
					<span>{t("about.recentUpdates", { ns: "settings" })}</span>
				</span>
			}
			className="!rounded-xl !border-slate-200 dark:!border-slate-700"
		>
			<Timeline
				items={[
					{
						color: "green",
						children: (
							<div>
								<Text strong>v0.0.1</Text>
								<div className="text-slate-500 text-sm">Initial release with core chat functionality</div>
							</div>
						),
					},
					{
						color: "blue",
						children: (
							<div>
								<Text strong>MCP Support</Text>
								<div className="text-slate-500 text-sm">Added MCP server integration and marketplace</div>
							</div>
						),
					},
					{
						color: "purple",
						children: (
							<div>
								<Text strong>Skill System</Text>
								<div className="text-slate-500 text-sm">New skill marketplace and management</div>
							</div>
						),
					},
					{
						color: "orange",
						children: (
							<div>
								<Text strong>API Server</Text>
								<div className="text-slate-500 text-sm">Added JWT authentication and API key management</div>
							</div>
						),
					},
				]}
			/>
		</Card>
	);
};

// 团队 Tab
const TeamTab: React.FC<Omit<AboutSectionProps, "appInfo" | 'onOpenModal'>> = ({
	onCheckUpdate,
	onOpenGitHub,
	onReportBug,
	onOpenLicense,
}) => {
	const { t } = useTranslation();

	return (
		<div className="space-y-4">
			<Card
				title={
					<span className="flex items-center gap-2">
						<TeamOutlined className="text-blue-500" />
						<span>{t("about.team", { ns: "settings" })}</span>
					</span>
				}
				className="!rounded-xl !border-slate-200 dark:!border-slate-700"
			>
				<div className="text-center py-6">
					<div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 mb-4">
						<HeartOutlined className="text-2xl text-white" />
					</div>
					<div className="text-slate-800 dark:text-slate-200 font-medium">
						{t("madeWith", "Made with", { ns: "settings" })} <HeartOutlined className="text-red-400 mx-1" /> {t("byTeam", "by Super Client Team", { ns: "settings" })}
					</div>
					<div className="text-sm text-slate-500 dark:text-slate-400 mt-2">
						{t("about.thanks", "感谢所有贡献者和用户的支持", { ns: "settings" })}
					</div>
				</div>
			</Card>

			<Card
				title={
					<span className="flex items-center gap-2">
						<FileTextOutlined className="text-green-500" />
						<span>{t("license", "License", { ns: "settings" })}</span>
					</span>
				}
				className="!rounded-xl !border-slate-200 dark:!border-slate-700"
			>
				<div className="text-sm text-slate-600 dark:text-slate-400">
					<p>{t("about.licenseText", "This project is licensed under the MIT License.", { ns: "settings" })}</p>
					<p className="mt-2">{t("about.licenseDesc", "You are free to use, modify, and distribute this software.", { ns: "settings" })}</p>
				</div>
			</Card>



			{/* 底部操作按钮 */}
			<div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
				<Button
					type="primary"
					icon={<ReloadOutlined />}
					onClick={onCheckUpdate}
					className="!rounded-lg"
				>
					{t("checkUpdate", "Check Update", { ns: "settings" })}
				</Button>
				<Button
					icon={<GithubOutlined />}
					onClick={onOpenGitHub}
					className="!rounded-lg"
				>
					GitHub
				</Button>
				<Button
					icon={<BugOutlined />}
					onClick={onReportBug}
					className="!rounded-lg"
				>
					{t("reportBug", "Report Bug", { ns: "settings" })}
				</Button>
				<Button
					icon={<FileTextOutlined />}
					onClick={onOpenLicense}
					className="!rounded-lg"
				>
					{t("license", "License", { ns: "settings" })}
				</Button>
			</div>
		</div>
	);
};

export const AboutSection: React.FC<AboutSectionProps> = ({
	appInfo,
	onCheckUpdate,
	onOpenGitHub,
	onReportBug,
	onOpenLicense,
}) => {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState("overview");

	const tabItems = [
		{
			key: "overview",
			label: (
				<span className="flex items-center gap-1">
					<InfoCircleOutlined />
					{t("about.overview", { ns: "settings" })}
				</span>
			),
			children: <OverviewTab appInfo={appInfo} />,
		},
		{
			key: "system",
			label: (
				<span className="flex items-center gap-1">
					<CodeOutlined />
					{t("about.system", { ns: "settings" })}
				</span>
			),
			children: <SystemInfoTab appInfo={appInfo} />,
		},
		{
			key: "changelog",
			label: (
				<span className="flex items-center gap-1">
					<RocketOutlined />
					{t("about.changelog", { ns: "settings" })}
				</span>
			),
			children: <ChangelogTab />,
		},
		{
			key: "team",
			label: (
				<span className="flex items-center gap-1">
					<TeamOutlined />
					{t("about.team", { ns: "settings" })}
				</span>
			),
			children: (
				<TeamTab
					onCheckUpdate={onCheckUpdate}
					onOpenGitHub={onOpenGitHub}
					onReportBug={onReportBug}
					onOpenLicense={onOpenLicense}
				/>
			),
		},
	];

	return (
		<div className="space-y-4">
			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={tabItems}
				className="about-tabs"
			/>
		</div>
	);
};
