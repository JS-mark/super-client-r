import { PlusOutlined, SettingOutlined, ShopOutlined } from "@ant-design/icons";
import { Button, Tabs, theme } from "antd";
import type * as React from "react";
import { useMemo, useState } from "react";

const { useToken } = theme;

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../components/layout/MainLayout";
import { McpConfig } from "../components/models/McpConfig";
import { ModelList } from "../components/models/ModelList";
import { useTitle } from "../hooks/useTitle";

const Models: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const navigate = useNavigate();
	const [activeKey, setActiveKey] = useState("1");
	const [modelListAddTrigger, setModelListAddTrigger] = useState(0);

	// 页面标题组件 - 同时用于 TitleBar 和页面头部
	const pageTitle = useMemo(() => {
		return (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-gray-500 to-slate-600 flex items-center justify-center">
					<SettingOutlined className="text-white text-xs" />
				</div>
				<span
					className="text-sm font-medium"
					style={{ color: token.colorText }}
				>
					{t("title", { ns: "models" })}
				</span>
			</div>
		);
	}, [t, token.colorText]);

	// 设置标题栏
	useTitle(pageTitle);

	const handleAdd = () => {
		if (activeKey === "1") {
			setModelListAddTrigger((prev) => prev + 1);
		} else {
			navigate("/mcp");
		}
	};

	const items = [
		{
			key: "1",
			label: (
				<span className="flex items-center gap-2 font-medium">
					{t("tabModels", { ns: "models" })}
				</span>
			),
			children: <ModelList addTrigger={modelListAddTrigger} />,
		},
		{
			key: "2",
			label: (
				<span className="flex items-center gap-2 font-medium">
					{t("tabMcp", { ns: "models" })}
				</span>
			),
			children: <McpConfig />,
		},
	];

	return (
		<MainLayout>
			{/* Tabs */}
			<Tabs
				activeKey={activeKey}
				onChange={setActiveKey}
				items={items}
				tabBarExtraContent={
					<Button
						type="primary"
						size="medium"
						icon={activeKey === "1" ? <PlusOutlined /> : <ShopOutlined />}
						onClick={handleAdd}
					>
						{activeKey === "1"
							? t("addProvider", { ns: "models" })
							: t("goToMcpMarket", {
									ns: "settings",
									defaultValue: "MCP Market",
								})}
					</Button>
				}
				className="p-6!"
			/>
		</MainLayout>
	);
};

export default Models;
