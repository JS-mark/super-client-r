import {
	CodeOutlined,
	CopyOutlined,
	DeleteOutlined,
	DesktopOutlined,
	GlobalOutlined,
	InfoCircleOutlined,
	MonitorOutlined,
	ReloadOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import {
	Button,
	Card,
	Col,
	message,
	Popconfirm,
	Progress,
	Row,
	Skeleton,
	Statistic,
	Tabs,
	theme,
} from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ApiStatus, apiService } from "../../services/apiService";
import { type AppInfo, appService } from "../../services/appService";

const { useToken } = theme;

// 快速操作 Tab
const QuickActionsTab: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();

	const handleOpenDevTools = async () => {
		try {
			await appService.openDevTools();
			message.success(
				t("devToolsOpened", "Developer tools opened", { ns: "settings" }),
			);
		} catch {
			message.error(
				t("devToolsError", "Failed to open developer tools", {
					ns: "settings",
				}),
			);
		}
	};

	const handleRelaunch = async () => {
		try {
			await appService.relaunch();
		} catch {
			message.error(
				t("relaunchError", "Failed to relaunch", { ns: "settings" }),
			);
		}
	};

	const handleClearStorage = () => {
		localStorage.clear();
		sessionStorage.clear();
		message.success(
			t("storageClearedSuccess", "Storage cleared", { ns: "settings" }),
		);
	};

	const actions = [
		{
			key: "devTools",
			icon: <CodeOutlined />,
			label: t("openDevTools", "打开开发者工具", { ns: "settings" }),
			description: t("openDevToolsDesc", "打开 Chromium DevTools 进行调试", {
				ns: "settings",
			}),
			onClick: handleOpenDevTools,
			type: "primary" as const,
		},
		{
			key: "relaunch",
			icon: <ReloadOutlined />,
			label: t("relaunch", "重启应用", { ns: "settings" }),
			description: t("relaunchDesc", "完全重启应用程序", { ns: "settings" }),
			onClick: handleRelaunch,
			confirm: true,
			confirmTitle: t("confirmRelaunch", "确定要重启应用吗？", {
				ns: "settings",
			}),
		},
		{
			key: "clearStorage",
			icon: <DeleteOutlined />,
			label: t("clearStorage", "清除存储", { ns: "settings" }),
			description: t(
				"clearStorageDesc",
				"清除 localStorage 和 sessionStorage",
				{ ns: "settings" },
			),
			onClick: handleClearStorage,
			danger: true,
		},
	];

	return (
		<div className="space-y-4">
			{actions.map((action) => (
				<div
					key={action.key}
					className="flex items-center justify-between p-4 rounded-xl border hover:shadow-md transition-shadow"
					style={{
						backgroundColor: token.colorBgContainer,
						borderColor: token.colorBorder,
					}}
				>
					<div className="flex items-center gap-4">
						<div
							className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.type === "primary"
									? "bg-blue-500 text-white"
									: action.danger
										? "text-red-500"
										: ""
								}`}
							style={
								action.danger
									? { backgroundColor: token.colorErrorBg }
									: action.type !== "primary"
										? {
											backgroundColor: token.colorBgContainer,
											color: token.colorText,
										}
										: undefined
							}
						>
							{action.icon}
						</div>
						<div>
							<div className="font-medium" style={{ color: token.colorText }}>
								{action.label}
							</div>
							<div
								className="text-sm"
								style={{ color: token.colorTextSecondary }}
							>
								{action.description}
							</div>
						</div>
					</div>
					{action.confirm ? (
						<Popconfirm
							title={action.confirmTitle}
							onConfirm={action.onClick}
							okText={t("confirm", "确定", { ns: "common" })}
							cancelText={t("cancel", "取消", { ns: "common" })}
						>
							<Button
								type={action.type}
								danger={action.danger}
								className="!rounded-lg"
							>
								{action.label}
							</Button>
						</Popconfirm>
					) : (
						<Button
							type={action.type}
							danger={action.danger}
							onClick={action.onClick}
							className="!rounded-lg"
						>
							{action.label}
						</Button>
					)}
				</div>
			))}
		</div>
	);
};

// 系统信息 Tab
const SystemInfoTab: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(
		null,
	);
	const [loading, setLoading] = useState(false);

	const collectDebugInfo = useCallback(async () => {
		setLoading(true);
		try {
			const [appInfo, userDataPath, apiStatusResult] = await Promise.all([
				appService.getInfo(),
				appService.getUserDataPath(),
				apiService.getStatus(),
			]);

			setDebugInfo({
				app: appInfo,
				userDataPath,
				apiStatus: apiStatusResult,
				renderer: {
					userAgent: navigator.userAgent,
					language: navigator.language,
					cookieEnabled: navigator.cookieEnabled,
					onLine: navigator.onLine,
					memory:
						"memory" in performance
							? (performance as unknown as { memory: unknown }).memory
							: null,
				},
				timestamp: new Date().toISOString(),
			});
		} catch {
			message.error(
				t("collectDebugInfoError", "Failed to collect debug info", {
					ns: "settings",
				}),
			);
		} finally {
			setLoading(false);
		}
	}, [t]);

	useEffect(() => {
		collectDebugInfo();
	}, [collectDebugInfo]);

	const handleCopyDebugInfo = () => {
		if (debugInfo) {
			navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
			message.success(t("copied", "Copied to clipboard", { ns: "settings" }));
		}
	};

	const infoItems = debugInfo
		? [
			{
				label: t("appName", "应用名称", { ns: "settings" }),
				value: (debugInfo.app as AppInfo)?.name || "N/A",
			},
			{
				label: t("version", "版本", { ns: "settings" }),
				value: (debugInfo.app as AppInfo)?.version || "N/A",
			},
			{
				label: "Electron",
				value: (debugInfo.app as AppInfo)?.electron || "N/A",
			},
			{ label: "Node.js", value: (debugInfo.app as AppInfo)?.node || "N/A" },
			{
				label: t("platform", "平台", { ns: "settings" }),
				value: (debugInfo.app as AppInfo)?.platform || "N/A",
			},
			{
				label: t("architecture", "架构", { ns: "settings" }),
				value: (debugInfo.app as AppInfo)?.arch || "N/A",
			},
			{
				label: t("userDataPath", "用户数据路径", { ns: "settings" }),
				value: (debugInfo.userDataPath as string) || "N/A",
				fullWidth: true,
			},
			{
				label: t("apiStatus", "API 状态", { ns: "settings" }),
				value:
					(debugInfo.apiStatus as ApiStatus)?.status === "running"
						? t("running", "运行中", { ns: "settings" })
						: t("stopped", "已停止", { ns: "settings" }),
			},
			{
				label: t("apiPort", "API 端口", { ns: "settings" }),
				value: (debugInfo.apiStatus as ApiStatus)?.port || "N/A",
			},
		]
		: [];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end gap-2">
				<Button
					icon={<ReloadOutlined />}
					onClick={collectDebugInfo}
					loading={loading}
					size="small"
				>
					{t("refresh", "刷新", { ns: "settings" })}
				</Button>
				<Button
					icon={<CopyOutlined />}
					onClick={handleCopyDebugInfo}
					size="small"
					disabled={!debugInfo}
				>
					{t("copyJson", "复制 JSON", { ns: "settings" })}
				</Button>
			</div>

			{loading && !debugInfo ? (
				<Skeleton active />
			) : (
				<div className="grid grid-cols-2 gap-4">
					{infoItems.map((item) => (
						<div
							key={item.value}
							className={`p-4 rounded-xl border ${item.fullWidth ? "col-span-2" : ""
								}`}
							style={{
								backgroundColor: token.colorBgContainer,
								borderColor: token.colorBorder,
							}}
						>
							<div
								className="text-xs uppercase tracking-wider mb-1"
								style={{ color: token.colorTextSecondary }}
							>
								{item.label}
							</div>
							<div
								className="text-sm font-medium font-mono break-all"
								style={{ color: token.colorText }}
							>
								{item.value}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

// 性能监控 Tab
const PerformanceMonitorTab: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const [metrics, setMetrics] = useState({
		pageLoadTime: 0,
		memoryUsed: 0,
		memoryTotal: 0,
		cpuCores: navigator.hardwareConcurrency || 0,
		networkStatus: navigator.onLine,
		language: navigator.language,
	});

	useEffect(() => {
		const navigation = performance.getEntriesByType(
			"navigation",
		)[0] as PerformanceNavigationTiming;
		const loadTime = navigation
			? navigation.loadEventEnd - navigation.startTime || 0
			: performance.now();
		const memory = (
			performance as unknown as {
				memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
			}
		).memory;

		setMetrics({
			pageLoadTime: Math.round(loadTime),
			memoryUsed: memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 0,
			memoryTotal: memory
				? Math.round(memory.totalJSHeapSize / 1024 / 1024)
				: 0,
			cpuCores: navigator.hardwareConcurrency || 0,
			networkStatus: navigator.onLine,
			language: navigator.language,
		});
	}, []);

	const statCards = [
		{
			title: t("pageLoadTime", "页面加载时间", { ns: "settings" }),
			value: `${metrics.pageLoadTime} ms`,
			icon: <ThunderboltOutlined />,
			color: "#3b82f6",
		},
		{
			title: t("networkStatus", "网络状态", { ns: "settings" }),
			value: metrics.networkStatus
				? t("online", "在线", { ns: "settings" })
				: t("offline", "离线", { ns: "settings" }),
			icon: <GlobalOutlined />,
			color: metrics.networkStatus ? "#22c55e" : "#ef4444",
		},
		{
			title: t("cpuCores", "CPU 核心数", { ns: "settings" }),
			value: metrics.cpuCores || "N/A",
			icon: <DesktopOutlined />,
			color: "#a855f7",
		},
		{
			title: t("language", "语言", { ns: "settings" }),
			value: metrics.language.toUpperCase(),
			icon: <InfoCircleOutlined />,
			color: "#f97316",
		},
	];

	const memoryUsagePercent = metrics.memoryTotal
		? Math.round((metrics.memoryUsed / metrics.memoryTotal) * 100)
		: 0;

	return (
		<div className="space-y-6">
			<Row gutter={[16, 16]}>
				{statCards.map((card) => (
					<Col span={12} key={card.value}>
						<Card
							className="!rounded-xl"
							style={{ borderColor: token.colorBorder }}
						>
							<Statistic
								title={card.title}
								value={card.value}
								prefix={
									<span style={{ color: card.color, marginRight: 8 }}>
										{card.icon}
									</span>
								}
								styles={{ content: { color: card.color, fontSize: "24px" } }}
							/>
						</Card>
					</Col>
				))}
			</Row>

			{metrics.memoryTotal > 0 && (
				<Card
					title={
						<span className="flex items-center gap-2">
							<MonitorOutlined />
							{t("memoryUsage", "内存使用", { ns: "settings" })}
						</span>
					}
					className="rounded-xl!"
					style={{ borderColor: token.colorBorder }}
				>
					<div className="space-y-4">
						<Progress
							percent={memoryUsagePercent}
							status={memoryUsagePercent > 80 ? "exception" : "active"}
							strokeColor={
								memoryUsagePercent > 80
									? "#ef4444"
									: memoryUsagePercent > 60
										? "#f97316"
										: "#22c55e"
							}
						/>
						<div
							className="flex justify-between text-sm"
							style={{ color: token.colorTextSecondary }}
						>
							<span>
								{t("used", "已使用", { ns: "settings" })}: {metrics.memoryUsed}{" "}
								MB
							</span>
							<span>
								{t("total", "总计", { ns: "settings" })}: {metrics.memoryTotal}{" "}
								MB
							</span>
						</div>
					</div>
				</Card>
			)}

			<Card
				className="!rounded-xl"
				style={{
					borderColor: token.colorBorder,
					backgroundColor: token.colorInfoBg,
				}}
			>
				<div className="flex items-start gap-3">
					<InfoCircleOutlined className="text-blue-500 mt-1" />
					<div>
						<div className="font-medium" style={{ color: token.colorText }}>
							{t("performanceTips", "性能提示", { ns: "settings" })}
						</div>
						<ul
							className="text-sm mt-2 space-y-1 list-disc list-inside"
							style={{ color: token.colorTextSecondary }}
						>
							<li>
								{t("performanceTip1", "定期清理日志文件可以释放磁盘空间", {
									ns: "settings",
								})}
							</li>
							<li>
								{t("performanceTip2", "关闭不用的功能可以减少内存占用", {
									ns: "settings",
								})}
							</li>
							<li>
								{t("performanceTip3", "使用开发者工具可以分析性能瓶颈", {
									ns: "settings",
								})}
							</li>
						</ul>
					</div>
				</div>
			</Card>
		</div>
	);
};

// 调试工具主组件
export const DebugTools: React.FC = () => {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState("quickActions");

	const tabItems = [
		{
			key: "quickActions",
			label: (
				<span className="flex items-center gap-2">
					<ThunderboltOutlined />
					{t("quickActions", "快速操作", { ns: "settings" })}
				</span>
			),
			children: <QuickActionsTab />,
		},
		{
			key: "systemInfo",
			label: (
				<span className="flex items-center gap-2">
					<InfoCircleOutlined />
					{t("systemInfo", "系统信息", { ns: "settings" })}
				</span>
			),
			children: <SystemInfoTab />,
		},
		{
			key: "performance",
			label: (
				<span className="flex items-center gap-2">
					<MonitorOutlined />
					{t("performanceMonitor", "性能监控", { ns: "settings" })}
				</span>
			),
			children: <PerformanceMonitorTab />,
		},
	];

	return (
		<Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
	);
};
