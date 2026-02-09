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
} from "@ant-design/icons";
import { Button, Card, Tag, Timeline, Typography } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";
import type { AppInfo } from "../../services/appService";

const { Title, Text, Paragraph } = Typography;

interface AboutSectionProps {
	appInfo: AppInfo | null;
	onCheckUpdate: () => void;
	onOpenGitHub: () => void;
	onReportBug: () => void;
	onOpenLicense: () => void;
}

const FeatureCard: React.FC<{
	icon: React.ReactNode;
	title: string;
	description: string;
	color: string;
}> = ({ icon, title, description, color }) => (
	<div className="group relative overflow-hidden rounded-2xl p-5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 hover:shadow-lg transition-all duration-300">
		<div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${color} opacity-10 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150`} />
		<div className="relative z-10">
			<div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg`}>
				<span className="text-white text-xl">{icon}</span>
			</div>
			<h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">{title}</h3>
			<p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
		</div>
	</div>
);

const StatItem: React.FC<{
	label: string;
	value: string;
	icon: React.ReactNode;
}> = ({ label, value, icon }) => (
	<div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
		<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white">
			{icon}
		</div>
		<div>
			<div className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
			<div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</div>
		</div>
	</div>
);

export const AboutSection: React.FC<AboutSectionProps> = ({
	appInfo,
	onCheckUpdate,
	onOpenGitHub,
	onReportBug,
	onOpenLicense,
}) => {
	const { t } = useTranslation();

	const features = [
		{
			icon: <RocketOutlined />,
			title: "Multi-Modal AI",
			description: "Support for multiple AI models including Claude, GPT, and local models",
			color: "from-blue-500 to-cyan-500",
		},
		{
			icon: <CodeOutlined />,
			title: "MCP Integration",
			description: "Connect to external tool servers for enhanced capabilities",
			color: "from-purple-500 to-pink-500",
		},
		{
			icon: <StarOutlined />,
			title: "Skill System",
			description: "Extensible skill marketplace for custom functionality",
			color: "from-orange-500 to-red-500",
		},
		{
			icon: <InfoCircleOutlined />,
			title: "Open Source",
			description: "Fully open source with MIT license. Contributions welcome!",
			color: "from-green-500 to-emerald-500",
		},
	];

	return (
		<div className="space-y-8">
			{/* Hero Section */}
			<div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 md:p-12">
				<div className="absolute inset-0 opacity-20">
					<div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
					<div className="absolute top-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
					<div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
				</div>

				<div className="relative z-10 text-center">
					<div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 shadow-2xl mb-6">
						<RocketOutlined className="text-3xl text-white" />
					</div>

					<Title level={2} className="!text-white !mb-2">
						{appInfo?.name || "Super Client"}
					</Title>

					<div className="flex items-center justify-center gap-3 mb-4">
						<Tag className="!bg-white/20 !text-white !border-0 !rounded-full !px-4 !py-1">
							v{appInfo?.version || "0.0.1"}
						</Tag>
						<Tag className="!bg-green-500/20 !text-green-400 !border-green-500/30 !rounded-full !px-3 !py-0.5">
							MIT License
						</Tag>
					</div>

					<Paragraph className="!text-slate-300 max-w-lg mx-auto">
						{t("settings.aboutDescription", "A powerful AI desktop client for seamless interaction with multiple AI services.")}
					</Paragraph>

					<div className="flex flex-wrap items-center justify-center gap-3 mt-6">
						<Button
							type="primary"
							size="large"
							icon={<ReloadOutlined />}
							onClick={onCheckUpdate}
							className="!bg-white !text-slate-900 hover:!bg-slate-100 !border-0 !rounded-xl !h-11 !px-6"
						>
							{t("settings.checkUpdate", "Check Update")}
						</Button>
						<Button
							size="large"
							icon={<GithubOutlined />}
							onClick={onOpenGitHub}
							className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 !rounded-xl !h-11 !px-6"
						>
							GitHub
						</Button>
					</div>
				</div>
			</div>

			{/* System Info Cards */}
			<Card
				title={
					<div className="flex items-center gap-2">
						<CodeOutlined className="text-blue-500" />
						<span>System Information</span>
					</div>
				}
				className="!rounded-2xl !border-slate-200 dark:!border-slate-700"
			>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<StatItem
						label={t("settings.platform", "Platform")}
						value={appInfo?.platform === "darwin" ? "macOS" : appInfo?.platform || "N/A"}
						icon={<CodeOutlined />}
					/>
					<StatItem
						label={t("settings.architecture", "Arch")}
						value={appInfo?.arch || "N/A"}
						icon={<CodeOutlined />}
					/>
					<StatItem
						label="Node.js"
						value={appInfo?.node || "N/A"}
						icon={<CodeOutlined />}
					/>
					<StatItem
						label="Electron"
						value={appInfo?.electron || "N/A"}
						icon={<CodeOutlined />}
					/>
				</div>
			</Card>

			{/* Features Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{features.map((feature, index) => (
					<FeatureCard key={index} {...feature} />
				))}
			</div>

			{/* Timeline */}
			<Card
				title={
					<div className="flex items-center gap-2">
						<InfoCircleOutlined className="text-purple-500" />
						<span>Recent Updates</span>
					</div>
				}
				className="!rounded-2xl !border-slate-200 dark:!border-slate-700"
			>
				<Timeline
					items={[
						{
							color: "green",
							children: (
								<div>
									<Text strong>v0.0.1</Text>
									<div className="text-slate-500">Initial release with core chat functionality</div>
								</div>
							),
						},
						{
							color: "blue",
							children: (
								<div>
									<Text strong>MCP Support</Text>
									<div className="text-slate-500">Added MCP server integration and marketplace</div>
								</div>
							),
						},
						{
							color: "purple",
							children: (
								<div>
									<Text strong>Skill System</Text>
									<div className="text-slate-500">New skill marketplace and management</div>
								</div>
							),
						},
						{
							color: "orange",
							children: (
								<div>
									<Text strong>API Server</Text>
									<div className="text-slate-500">Added JWT authentication and API key management</div>
								</div>
							),
						},
					]}
				/>
			</Card>

			{/* Footer Links */}
			<div className="flex flex-wrap items-center justify-center gap-4 pt-4">
				<Button
					type="link"
					icon={<BugOutlined />}
					onClick={onReportBug}
					className="text-slate-500 hover:text-blue-500"
				>
					{t("settings.reportBug", "Report Bug")}
				</Button>
				<Button
					type="link"
					icon={<FileTextOutlined />}
					onClick={onOpenLicense}
					className="text-slate-500 hover:text-blue-500"
				>
					{t("settings.license", "License")}
				</Button>
			</div>

			{/* Footer */}
			<div className="text-center text-sm text-slate-400 dark:text-slate-500 pt-4 border-t border-slate-100 dark:border-slate-700/50">
				{t("settings.madeWith", "Made with")} <HeartOutlined className="text-red-400 mx-1" /> {t("settings.byTeam", "by Super Client Team")}
			</div>
		</div>
	);
};
