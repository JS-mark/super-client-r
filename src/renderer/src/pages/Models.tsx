import { Tabs } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { MainLayout } from "../components/layout/MainLayout";
import { McpConfig } from "../components/models/McpConfig";
import { ModelList } from "../components/models/ModelList";

const Models: React.FC = () => {
	const { t } = useTranslation();

	const items = [
		{
			key: "1",
			label: (
				<span className="flex items-center gap-2 font-medium">
					{t("models.tabModels")}
				</span>
			),
			children: <ModelList />,
		},
		{
			key: "2",
			label: (
				<span className="flex items-center gap-2 font-medium">
					{t("models.tabMcp")}
				</span>
			),
			children: <McpConfig />,
		},
	];

	return (
		<MainLayout>
			<div className="animate-fade-in">
				{/* Page Header */}
				<div className="mb-8">
					<div className="flex items-center gap-3 mb-2">
						<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
							<span className="text-2xl">⚙️</span>
						</div>
						<div>
							<h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
								{t("models.title")}
							</h1>
						</div>
					</div>
					<p className="text-slate-500 dark:text-slate-400 ml-15">
						{t("models.description", "Configure AI models and MCP servers")}
					</p>
				</div>

				{/* Tabs */}
				<Tabs
					defaultActiveKey="1"
					items={items}
					className="!bg-white/80 dark:!bg-slate-800/80 !rounded-2xl !p-6 !shadow-xl !backdrop-blur-sm"
				/>
			</div>
		</MainLayout>
	);
};

export default Models;