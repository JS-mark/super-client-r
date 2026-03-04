import {
	AppstoreOutlined,
	BugOutlined,
	CodeOutlined,
	FileTextOutlined,
	FormatPainterOutlined,
	GithubOutlined,
	HeartOutlined,
	InfoCircleOutlined,
	LayoutOutlined,
	RocketOutlined,
	SearchOutlined,
	StarOutlined,
	TeamOutlined,
} from "@ant-design/icons";
import { Button, Card, Tabs, Tag, Typography, theme } from "antd";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppInfo } from "../../services/appService";

const { useToken } = theme;

const { Title, Paragraph } = Typography;

interface AboutSectionProps {
	appInfo: AppInfo | null;
	onOpenGitHub: () => void;
	onReportBug: () => void;
	onOpenLicense: () => void;
	onOpenModal?: () => void;
}

// 概览 Tab - 更紧凑小巧
const OverviewTab: React.FC<{ appInfo: AppInfo | null }> = ({ appInfo }) => {
	const { t } = useTranslation();
	const { token } = useToken();

	const features = [
		{
			icon: <RocketOutlined />,
			titleKey: "about.features.aiChat.title",
			descKey: "about.features.aiChat.desc",
			color: "from-blue-500 to-cyan-500",
		},
		{
			icon: <CodeOutlined />,
			titleKey: "about.features.mcp.title",
			descKey: "about.features.mcp.desc",
			color: "from-purple-500 to-pink-500",
		},
		{
			icon: <StarOutlined />,
			titleKey: "about.features.skills.title",
			descKey: "about.features.skills.desc",
			color: "from-orange-500 to-red-500",
		},
		{
			icon: <AppstoreOutlined />,
			titleKey: "about.features.plugin.title",
			descKey: "about.features.plugin.desc",
			color: "from-indigo-500 to-violet-500",
		},
		{
			icon: <SearchOutlined />,
			titleKey: "about.features.webSearch.title",
			descKey: "about.features.webSearch.desc",
			color: "from-teal-500 to-cyan-500",
		},
		{
			icon: <FormatPainterOutlined />,
			titleKey: "about.features.themes.title",
			descKey: "about.features.themes.desc",
			color: "from-pink-500 to-rose-500",
		},
		{
			icon: <LayoutOutlined />,
			titleKey: "about.features.floatWidget.title",
			descKey: "about.features.floatWidget.desc",
			color: "from-amber-500 to-orange-500",
		},
		{
			icon: <InfoCircleOutlined />,
			titleKey: "about.features.localApi.title",
			descKey: "about.features.localApi.desc",
			color: "from-green-500 to-emerald-500",
		},
	];

	return (
		<div className="space-y-3">
			{/* Hero Section - 更紧凑 */}
			<div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-3">
				<div className="relative z-10 text-center">
					<div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 shadow-md mb-2">
						<RocketOutlined className="text-lg text-white" />
					</div>
					<Title level={5} className="!text-white !mb-1 !text-base">
						{appInfo?.name || "Super Client"}
					</Title>
					<div className="flex items-center justify-center gap-2 mb-1">
						<Tag className="!bg-white/20 !text-white !border-0 !rounded-full !px-2 !py-0 !text-xs">
							v{appInfo?.version || "0.0.1"}
						</Tag>
						<Tag className="!bg-green-500/20 !text-green-400 !border-green-500/30 !rounded-full !px-2 !py-0 !text-xs">
							GPL-2.0
						</Tag>
					</div>
					<Paragraph className="!text-slate-400 !text-xs !mb-0">
						{t(
							"aboutDescription",
							"A powerful AI desktop client for seamless interaction with multiple AI services.",
							{ ns: "settings" },
						)}
					</Paragraph>
				</div>
			</div>

			{/* Features Grid - 更紧凑 2x2 */}
			<div className="grid grid-cols-2 gap-2">
				{features.map((feature) => (
					<div
						key={feature.titleKey}
						className="relative overflow-hidden rounded-lg p-2.5 border hover:shadow-sm transition-all"
						style={{
							backgroundColor: token.colorBgContainer,
							borderColor: token.colorBorder,
						}}
					>
						<div
							className={`w-7 h-7 rounded-md bg-gradient-to-br ${feature.color} flex items-center justify-center mb-1.5 shadow-sm`}
						>
							<span className="text-white text-xs">{feature.icon}</span>
						</div>
						<h3
							className="text-xs font-semibold mb-0.5 leading-tight"
							style={{ color: token.colorText }}
						>
							{t(feature.titleKey, { ns: "settings" })}
						</h3>
						<p
							className="text-[10px] leading-tight"
							style={{ color: token.colorTextSecondary }}
						>
							{t(feature.descKey, { ns: "settings" })}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};

// 团队 Tab
const TeamTab: React.FC<Omit<AboutSectionProps, "appInfo" | "onOpenModal">> = ({
	onOpenGitHub,
	onReportBug,
	onOpenLicense,
}) => {
	const { t } = useTranslation();
	const { token } = useToken();

	return (
		<div className="space-y-3">
			<Card
				size="small"
				title={
					<span className="flex items-center gap-1.5 text-sm">
						<TeamOutlined className="text-blue-500" />
						<span>{t("about.team", { ns: "settings" })}</span>
					</span>
				}
				className="rounded-lg!"
				style={{ borderColor: token.colorBorder }}
			>
				<div className="text-center py-3">
					<div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 mb-2">
						<HeartOutlined className="text-lg text-white" />
					</div>
					<div
						className="font-medium text-sm"
						style={{ color: token.colorText }}
					>
						{t("madeWith", "Made with", { ns: "settings" })}{" "}
						<HeartOutlined className="text-red-400 mx-1" />{" "}
						{t("byTeam", "by Super Client Team", { ns: "settings" })}
					</div>
					<div
						className="text-xs mt-1"
						style={{ color: token.colorTextSecondary }}
					>
						{t(
							"about.thanks",
							"Thanks to all contributors and users for their support",
							{
								ns: "settings",
							},
						)}
					</div>
				</div>
			</Card>

			<Card
				size="small"
				title={
					<span className="flex items-center gap-1.5 text-sm">
						<FileTextOutlined className="text-green-500" />
						<span>{t("license", "License", { ns: "settings" })}</span>
					</span>
				}
				className="!rounded-lg !mt-[10px]"
				style={{ borderColor: token.colorBorder }}
			>
				<div className="text-xs" style={{ color: token.colorTextSecondary }}>
					<p className="mb-1">
						{t(
							"about.licenseText",
							"This project is licensed under the GNU General Public License v2.0.",
							{ ns: "settings" },
						)}
					</p>
					<p>
						{t(
							"about.licenseDesc",
							"You are free to use, modify, and distribute this software under the terms of the GPL-2.0 license.",
							{ ns: "settings" },
						)}
					</p>
				</div>
			</Card>

			<div className="flex flex-wrap items-center justify-center gap-2 pt-2">
				<Button
					icon={<GithubOutlined />}
					onClick={onOpenGitHub}
					className="!rounded-md"
				>
					GitHub
				</Button>
				<Button
					icon={<BugOutlined />}
					onClick={onReportBug}
					className="!rounded-md"
				>
					{t("reportBug", "Report", { ns: "settings" })}
				</Button>
				<Button
					icon={<FileTextOutlined />}
					onClick={onOpenLicense}
					className="!rounded-md"
				>
					{t("license", "License", { ns: "settings" })}
				</Button>
			</div>
		</div>
	);
};

export const AboutSection: React.FC<AboutSectionProps> = ({
	appInfo,
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
				<span className="flex items-center gap-1 text-xs">
					<InfoCircleOutlined />
					{t("about.overview", { ns: "settings" })}
				</span>
			),
			children: <OverviewTab appInfo={appInfo} />,
		},
		{
			key: "team",
			label: (
				<span className="flex items-center gap-1 text-xs">
					<TeamOutlined />
					{t("about.team", { ns: "settings" })}
				</span>
			),
			children: (
				<TeamTab
					onOpenGitHub={onOpenGitHub}
					onReportBug={onReportBug}
					onOpenLicense={onOpenLicense}
				/>
			),
		},
	];

	return (
		<div className="space-y-2">
			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={tabItems}
				size="small"
				className="about-tabs"
			/>
		</div>
	);
};
