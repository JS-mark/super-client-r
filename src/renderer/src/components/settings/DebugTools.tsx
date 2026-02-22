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
			iconBg: token.colorPrimaryBg,
			iconColor: token.colorPrimary,
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
			iconBg: token.colorWarningBg,
			iconColor: token.colorWarning,
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
			iconBg: token.colorErrorBg,
			iconColor: token.colorError,
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
							className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
							style={{
								backgroundColor: action.iconBg,
								color: action.iconColor,
							}}
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
								danger={action.danger}
								className="!rounded-lg"
							>
								{action.label}
							</Button>
						</Popconfirm>
					) : (
						<Button
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
							className={`p-4 rounded-xl border ${
								item.fullWidth ? "col-span-2" : ""
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

// 格式化内存大小（MB 输入，超过 1000 自动转换单位）
function formatMemory(mb: number): string {
	if (mb >= 1000000) return `${(mb / 1000000).toFixed(1)} PB`;
	if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
	return `${mb} MB`;
}

// 格式化运行时间
function formatUptime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}h ${m}m ${s}s`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

interface ProcessMetrics {
	heapUsed: number;
	heapTotal: number;
	rss: number;
	systemTotal: number;
	systemFree: number;
	cpuCores: number;
	cpuModel: string;
	cpuUser: number;
	cpuSystem: number;
	uptime: number;
	pid: number;
}

// 性能监控 Tab
const PerformanceMonitorTab: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const [metrics, setMetrics] = useState<ProcessMetrics | null>(null);
	const [online, setOnline] = useState(navigator.onLine);
	const [lastRefresh, setLastRefresh] = useState<string>("");

	const fetchMetrics = useCallback(async () => {
		try {
			const res = await window.electron.system.getProcessMetrics();
			if (res.success && res.data) {
				setMetrics(res.data);
			}
		} catch {
			// ignore fetch errors
		}
		setLastRefresh(new Date().toLocaleTimeString());
	}, []);

	useEffect(() => {
		fetchMetrics();
		const interval = setInterval(fetchMetrics, 3000);
		return () => clearInterval(interval);
	}, [fetchMetrics]);

	useEffect(() => {
		const goOnline = () => setOnline(true);
		const goOffline = () => setOnline(false);
		window.addEventListener("online", goOnline);
		window.addEventListener("offline", goOffline);
		return () => {
			window.removeEventListener("online", goOnline);
			window.removeEventListener("offline", goOffline);
		};
	}, []);

	const statCards = metrics
		? [
				{
					title: t("appUptime", "App 运行时间", { ns: "settings" }),
					value: formatUptime(metrics.uptime),
					icon: <ThunderboltOutlined />,
					iconBg: token.colorPrimaryBg,
					iconColor: token.colorPrimary,
				},
				{
					title: t("cpuCores", "CPU 核心", { ns: "settings" }),
					value: `${metrics.cpuCores} ${t("cores", "核", { ns: "settings" })}`,
					description: metrics.cpuModel,
					icon: <DesktopOutlined />,
					iconBg: token.colorWarningBg,
					iconColor: token.colorWarning,
				},
				{
					title: t("processMemory", "进程内存 (RSS)", { ns: "settings" }),
					value: formatMemory(metrics.rss),
					icon: <MonitorOutlined />,
					iconBg: token.colorInfoBg,
					iconColor: token.colorInfo,
				},
				{
					title: t("networkStatus", "网络状态", { ns: "settings" }),
					value: online
						? t("online", "在线", { ns: "settings" })
						: t("offline", "离线", { ns: "settings" }),
					icon: <GlobalOutlined />,
					iconBg: online ? token.colorSuccessBg : token.colorErrorBg,
					iconColor: online ? token.colorSuccess : token.colorError,
				},
			]
		: [];

	const systemMemPercent =
		metrics && metrics.systemTotal > 0
			? Math.round(
					((metrics.systemTotal - metrics.systemFree) / metrics.systemTotal) *
						100,
				)
			: 0;

	const heapPercent =
		metrics && metrics.heapTotal > 0
			? Math.round((metrics.heapUsed / metrics.heapTotal) * 100)
			: 0;

	const progressColor = (pct: number) =>
		pct > 80 ? token.colorError : pct > 60 ? token.colorWarning : token.colorSuccess;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-end gap-3">
				{lastRefresh && (
					<span className="text-xs" style={{ color: token.colorTextTertiary }}>
						{t("lastRefresh", "上次刷新", { ns: "settings" })}: {lastRefresh}
					</span>
				)}
				<Button
					icon={<ReloadOutlined />}
					onClick={fetchMetrics}
					size="small"
				>
					{t("refresh", "刷新", { ns: "settings" })}
				</Button>
			</div>

			{!metrics ? (
				<Skeleton active />
			) : (
				<>
					<Row gutter={[16, 16]}>
						{statCards.map((card) => (
							<Col span={12} key={card.title}>
								<div
									className="p-4 rounded-xl border"
									style={{
										backgroundColor: token.colorBgContainer,
										borderColor: token.colorBorder,
									}}
								>
									<div className="flex items-center gap-3">
										<div
											className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
											style={{
												backgroundColor: card.iconBg,
												color: card.iconColor,
											}}
										>
											{card.icon}
										</div>
										<div className="min-w-0">
											<div
												className="text-xs"
												style={{ color: token.colorTextSecondary }}
											>
												{card.title}
											</div>
											<div
												className="text-lg font-semibold"
												style={{ color: token.colorText }}
											>
												{card.value}
											</div>
											{"description" in card && card.description && (
												<div
													className="text-xs truncate"
													style={{ color: token.colorTextTertiary }}
													title={card.description}
												>
													{card.description}
												</div>
											)}
										</div>
									</div>
								</div>
							</Col>
						))}
					</Row>

					<Card
						title={
							<span className="flex items-center gap-2">
								<MonitorOutlined />
								{t("memoryUsage", "内存使用", { ns: "settings" })}
							</span>
						}
						className="!rounded-xl"
						style={{ borderColor: token.colorBorder }}
					>
						<div className="space-y-5">
							<div>
								<div
									className="flex justify-between text-sm mb-1"
									style={{ color: token.colorTextSecondary }}
								>
									<span>
										{t("systemMemory", "系统内存", { ns: "settings" })}
									</span>
									<span>
										{formatMemory(metrics.systemTotal - metrics.systemFree)} /{" "}
										{formatMemory(metrics.systemTotal)}
									</span>
								</div>
								<Progress
									percent={systemMemPercent}
									status={systemMemPercent > 80 ? "exception" : "active"}
									strokeColor={progressColor(systemMemPercent)}
								/>
							</div>
							<div>
								<div
									className="flex justify-between text-sm mb-1"
									style={{ color: token.colorTextSecondary }}
								>
									<span>
										{t("processHeapMemory", "主进程堆内存", { ns: "settings" })}
									</span>
									<span>
										{formatMemory(metrics.heapUsed)} /{" "}
										{formatMemory(metrics.heapTotal)}
									</span>
								</div>
								<Progress
									percent={heapPercent}
									status={heapPercent > 80 ? "exception" : "active"}
									strokeColor={progressColor(heapPercent)}
								/>
							</div>
						</div>
					</Card>
				</>
			)}
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
