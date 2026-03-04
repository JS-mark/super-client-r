import { useEffect, useCallback, useState } from "react";
import {
	Button,
	Typography,
	Segmented,
	message,
	Collapse,
	theme,
	Input,
	Tag,
} from "antd";
import {
	CopyOutlined,
	CheckOutlined,
	AppleOutlined,
	WindowsOutlined,
	CloudOutlined,
	DownloadOutlined,
	CodeOutlined,
	GlobalOutlined,
	PlayCircleOutlined,
	SwapOutlined,
	LinkOutlined,
	WifiOutlined,
	SaveOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useRemoteControlEventStore } from "@/stores/remoteControlEventStore";
import type { RelayConfig } from "@/types/electron";

const { Text } = Typography;

type Platform = "linux" | "macos" | "windows";

const platformLabels: Record<
	Platform,
	{ label: string; icon: React.ReactNode }
> = {
	linux: { label: "Linux", icon: <CloudOutlined /> },
	macos: { label: "macOS", icon: <AppleOutlined /> },
	windows: { label: "Windows", icon: <WindowsOutlined /> },
};

const binaryNames: Record<Platform, string> = {
	linux: "device-agent-linux-x64",
	macos: "device-agent-macos-arm64",
	windows: "device-agent-windows-x64.exe",
};

interface DeviceConnectionInfoProps {
	deviceId: string;
	deviceToken: string;
}

function StepBadge({
	step,
	active,
}: {
	step: number;
	active: boolean;
}) {
	const { token } = theme.useToken();
	return (
		<div
			className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
			style={{
				backgroundColor: active
					? token.colorPrimary
					: token.colorFillSecondary,
				color: active
					? token.colorWhite
					: token.colorTextSecondary,
			}}
		>
			{step}
		</div>
	);
}

function CodeBlock({
	children,
	copyKey,
	copyText,
	copiedKey,
	onCopy,
}: {
	children: React.ReactNode;
	copyKey: string;
	copyText: string;
	copiedKey: string;
	onCopy: (text: string, key: string) => void;
}) {
	const { token } = theme.useToken();
	return (
		<div
			className="flex items-start justify-between gap-2 rounded-md px-3 py-2"
			style={{ backgroundColor: token.colorFillQuaternary }}
		>
			<code className="text-xs leading-relaxed break-all flex-1 select-all">
				{children}
			</code>
			<Button
				type="text"
				size="small"
				className="flex-shrink-0 mt-px"
				icon={
					copiedKey === copyKey ? (
						<CheckOutlined style={{ color: token.colorSuccess }} />
					) : (
						<CopyOutlined />
					)
				}
				onClick={() => onCopy(copyText, copyKey)}
			/>
		</div>
	);
}

function CommandBlock({
	command,
	copyKey,
	copiedKey,
	onCopy,
}: {
	command: string;
	copyKey: string;
	copiedKey: string;
	onCopy: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const { token } = theme.useToken();
	return (
		<div
			style={{
				position: "relative",
				backgroundColor: token.colorFillQuaternary,
				borderRadius: 6,
				padding: "10px 12px",
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<pre
				className="text-xs break-all leading-relaxed m-0 whitespace-pre-wrap font-mono select-all"
				style={{ paddingRight: 28 }}
			>
				{command}
			</pre>
			<Button
				type="text"
				size="small"
				style={{
					position: "absolute",
					top: 4,
					right: 4,
					opacity: hovered || copiedKey === copyKey ? 1 : 0,
					transition: "opacity 0.2s",
				}}
				icon={
					copiedKey === copyKey ? (
						<CheckOutlined
							style={{ color: token.colorSuccess }}
						/>
					) : (
						<CopyOutlined />
					)
				}
				onClick={onCopy}
			/>
		</div>
	);
}

export function DeviceConnectionInfo({
	deviceId,
	deviceToken,
}: DeviceConnectionInfoProps) {
	const { t } = useTranslation("settings");
	const { connectionInfo, fetchConnectionInfo } =
		useRemoteControlEventStore();
	const [selectedIP, setSelectedIP] = useState<string>("");
	const [platform, setPlatform] = useState<Platform>("linux");
	const [copiedKey, setCopiedKey] = useState<string>("");
	const { token } = theme.useToken();

	// Relay 配置状态
	const [mode, setMode] = useState<"local" | "relay">("local");
	const [relayUrl, setRelayUrl] = useState("");
	const [relayKey, setRelayKey] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		fetchConnectionInfo();
		// 加载 relay 配置
		window.electron.remoteDevice.getRelayConfig().then((resp) => {
			if (resp.success && resp.data) {
				setMode(resp.data.mode || "local");
				setRelayUrl(resp.data.relayUrl || "");
				setRelayKey(resp.data.relayKey || "");
			}
		});
	}, [fetchConnectionInfo]);

	useEffect(() => {
		if (connectionInfo?.localIPs?.length && !selectedIP) {
			setSelectedIP(connectionInfo.localIPs[0]);
		}
	}, [connectionInfo, selectedIP]);

	const handleCopy = useCallback((text: string, key: string) => {
		navigator.clipboard.writeText(text);
		setCopiedKey(key);
		message.success(t("relay.copied", "已复制到剪贴板"));
		setTimeout(() => setCopiedKey(""), 2000);
	}, [t]);

	const handleSaveRelay = useCallback(async () => {
		setSaving(true);
		try {
			const config: RelayConfig = {
				mode,
				relayUrl: mode === "relay" ? relayUrl : undefined,
				relayKey: mode === "relay" ? relayKey : undefined,
			};
			const resp = await window.electron.remoteDevice.setRelayConfig(config);
			if (resp.success) {
				message.success(t("relay.saveSuccess", "配置已保存并生效"));
				// 刷新连接信息
				fetchConnectionInfo();
			} else {
				message.error(resp.error || t("relay.saveFailed", "保存失败"));
			}
		} finally {
			setSaving(false);
		}
	}, [mode, relayUrl, relayKey, t, fetchConnectionInfo]);

	if (!connectionInfo && mode === "local") {
		return (
			<div className="py-8 text-center">
				<Text type="secondary">
					{t("relay.loading", "加载连接信息中...")}
				</Text>
			</div>
		);
	}

	const wsPort = connectionInfo?.wsPort ?? 8088;
	const localIPs = connectionInfo?.localIPs ?? [];
	const binary = binaryNames[platform];

	// 根据模式构建 serverUrl 和启动命令
	const isRelay = mode === "relay" && relayUrl;
	const serverUrl = isRelay
		? relayUrl
		: selectedIP
			? `ws://${selectedIP}:${wsPort}`
			: "";

	const buildStartCommand = (p: Platform): string => {
		if (!serverUrl) return "";
		const envLines =
			p === "windows"
				? [
						`$env:DEVICE_ID="${deviceId}"`,
						`$env:DEVICE_TOKEN="${deviceToken}"`,
						`$env:SERVER_URL="${serverUrl}"`,
						...(isRelay ? [`$env:RELAY_KEY="${relayKey}"`] : []),
						`.\\${binaryNames[p]}`,
					]
				: [
						`DEVICE_ID=${deviceId} \\`,
						`DEVICE_TOKEN=${deviceToken} \\`,
						`SERVER_URL=${serverUrl} \\`,
						...(isRelay ? [`RELAY_KEY=${relayKey} \\`] : []),
						`./${binaryNames[p]}`,
					];
		return envLines.join("\n");
	};

	const startCommand = buildStartCommand(platform);

	const buildCommand =
		platform === "windows"
			? `bun device-agent\\build.ts current`
			: `bun device-agent/build.ts current`;

	return (
		<div className="flex flex-col gap-4 py-1">
			{/* 模式切换 */}
			<section>
				<div className="flex items-center gap-2 mb-3">
					<SwapOutlined style={{ color: token.colorPrimary }} />
					<span className="font-medium text-sm">
						{t("relay.connectionMode", "连接模式")}
					</span>
					<Tag
						color={mode === "relay" ? "blue" : "green"}
						className="ml-auto"
					>
						{mode === "relay"
							? t("relay.modeRelay", "中继")
							: t("relay.modeLocal", "局域网")}
					</Tag>
				</div>

				<div className="pl-7">
					<Segmented
						size="small"
						value={mode}
						onChange={(val) => setMode(val as "local" | "relay")}
						options={[
							{
								label: (
									<span className="flex items-center gap-1">
										<WifiOutlined />{" "}
										{t("relay.local", "局域网")}
									</span>
								),
								value: "local",
							},
							{
								label: (
									<span className="flex items-center gap-1">
										<LinkOutlined />{" "}
										{t("relay.relay", "中继")}
									</span>
								),
								value: "relay",
							},
						]}
					/>

					{mode === "relay" && (
						<div className="flex flex-col gap-2 mt-3">
							<div>
								<Text type="secondary" className="text-xs">
									{t(
										"relay.urlLabel",
										"Relay 服务器地址",
									)}
								</Text>
								<Input
									size="small"
									placeholder="wss://relay.example.com:9099"
									value={relayUrl}
									onChange={(e) =>
										setRelayUrl(e.target.value)
									}
								/>
							</div>
							<div>
								<Text type="secondary" className="text-xs">
									{t("relay.keyLabel", "Relay Key")}
								</Text>
								<Input
									size="small"
									placeholder={t(
										"relay.keyPlaceholder",
										"共享密钥",
									)}
									value={relayKey}
									onChange={(e) =>
										setRelayKey(e.target.value)
									}
								/>
							</div>
							<Button
								size="small"
								type="primary"
								icon={<SaveOutlined />}
								loading={saving}
								disabled={!relayUrl || !relayKey}
								onClick={handleSaveRelay}
							>
								{t("relay.saveApply", "保存并应用")}
							</Button>
						</div>
					)}

					{mode === "local" && (
						<Button
							size="small"
							className="mt-2"
							icon={<SaveOutlined />}
							loading={saving}
							onClick={handleSaveRelay}
						>
							{t("relay.switchToLocal", "切换到局域网模式")}
						</Button>
					)}
				</div>
			</section>

			{/* Divider */}
			<div
				className="h-px mx-1"
				style={{ backgroundColor: token.colorBorderSecondary }}
			/>

			{/* Step 1: 获取 Device Agent */}
			<section>
				<div className="flex items-center gap-2 mb-3">
					<StepBadge step={1} active />
					<span className="font-medium text-sm">
						{t("relay.getAgent", "获取 Device Agent")}
					</span>
				</div>

				<div className="pl-8">
					<Segmented
						size="small"
						value={platform}
						onChange={(val) => setPlatform(val as Platform)}
						options={Object.entries(platformLabels).map(
							([key, { label, icon }]) => ({
								label: (
									<span className="flex items-center gap-1">
										{icon} {label}
									</span>
								),
								value: key,
							}),
						)}
					/>

					<Collapse
						ghost
						size="small"
						className="mt-3 -ml-3"
						defaultActiveKey={["download"]}
						items={[
							{
								key: "download",
								label: (
									<span className="flex items-center gap-1.5 text-xs font-medium">
										<DownloadOutlined />{" "}
										{t(
											"relay.downloadBinary",
											"下载预编译文件",
										)}
									</span>
								),
								children: (
									<div className="flex flex-col gap-1.5">
										<Text
											type="secondary"
											className="text-xs"
										>
											前往{" "}
											<a
												className="text-xs"
												onClick={() =>
													handleCopy(
														"https://github.com/JS-mark/super-client-r/releases",
														"github",
													)
												}
											>
												GitHub Releases
											</a>{" "}
											下载{" "}
											<Text code className="text-xs">
												{binary}
											</Text>
										</Text>
										{platform !== "windows" && (
											<CodeBlock
												copyKey="chmod"
												copyText={`chmod +x ./${binary}`}
												copiedKey={copiedKey}
												onCopy={handleCopy}
											>
												chmod +x ./{binary}
											</CodeBlock>
										)}
										{platform === "macos" && (
											<Text
												type="secondary"
												className="text-xs"
											>
												若提示无法打开，运行：
												<Text
													code
													className="text-xs"
												>
													xattr -d
													com.apple.quarantine ./{binary}
												</Text>
											</Text>
										)}
									</div>
								),
							},
							{
								key: "build",
								label: (
									<span className="flex items-center gap-1.5 text-xs font-medium">
										<CodeOutlined />{" "}
										{t(
											"relay.buildFromSource",
											"从源码构建",
										)}
									</span>
								),
								children: (
									<div className="flex flex-col gap-1.5">
										<Text
											type="secondary"
											className="text-xs"
										>
											需要安装{" "}
											<a
												className="text-xs"
												onClick={() =>
													handleCopy(
														"https://bun.sh",
														"bun",
													)
												}
											>
												Bun
											</a>{" "}
											运行时
										</Text>
										<CodeBlock
											copyKey="build"
											copyText={buildCommand}
											copiedKey={copiedKey}
											onCopy={handleCopy}
										>
											{buildCommand}
										</CodeBlock>
										<Text
											type="secondary"
											className="text-xs"
										>
											产物在{" "}
											<Text code className="text-xs">
												device-agent/dist/
											</Text>{" "}
											目录
										</Text>
									</div>
								),
							},
						]}
					/>
				</div>
			</section>

			{/* Divider */}
			<div
				className="h-px mx-1"
				style={{ backgroundColor: token.colorBorderSecondary }}
			/>

			{/* Step 2: 选择连接地址 (仅 local 模式) */}
			{mode === "local" && (
				<>
					<section>
						<div className="flex items-center gap-2 mb-3">
							<StepBadge step={2} active={localIPs.length > 0} />
							<span className="font-medium text-sm">
								{t(
									"relay.selectAddress",
									"选择连接地址",
								)}
							</span>
							<Text type="secondary" className="text-xs">
								端口 {wsPort}
							</Text>
						</div>

						<div className="pl-8">
							{localIPs.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{localIPs.map((ip) => (
										<button
											key={ip}
											type="button"
											className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer border"
											style={{
												backgroundColor:
													selectedIP === ip
														? token.colorPrimaryBg
														: token.colorFillQuaternary,
												borderColor:
													selectedIP === ip
														? token.colorPrimary
														: "transparent",
												color:
													selectedIP === ip
														? token.colorPrimary
														: token.colorText,
											}}
											onClick={() => setSelectedIP(ip)}
										>
											<GlobalOutlined className="text-[10px]" />
											{ip}
										</button>
									))}
								</div>
							) : (
								<Text type="secondary" className="text-xs">
									{t(
										"relay.noLocalIP",
										"未检测到局域网 IP 地址",
									)}
								</Text>
							)}
						</div>
					</section>

					{/* Divider */}
					<div
						className="h-px mx-1"
						style={{
							backgroundColor: token.colorBorderSecondary,
						}}
					/>
				</>
			)}

			{/* Step 2/3: 启动 Agent */}
			<section>
				<div className="flex items-center gap-2 mb-3">
					<StepBadge
						step={mode === "local" ? 3 : 2}
						active={!!serverUrl}
					/>
					<span className="font-medium text-sm">
						{t("relay.startAgent", "启动 Agent")}
					</span>
					{platform === "windows" && (
						<Text type="secondary" className="text-xs">
							PowerShell
						</Text>
					)}
				</div>

				<div className="pl-8">
					{serverUrl ? (
						<CommandBlock
							command={startCommand}
							copyKey="start"
							copiedKey={copiedKey}
							onCopy={() =>
								handleCopy(
									startCommand.replace(/\\\n/g, " "),
									"start",
								)
							}
						/>
					) : (
						<div
							className="flex items-center gap-2 px-3 py-2.5 rounded-md"
							style={{
								backgroundColor: token.colorFillQuaternary,
							}}
						>
							<PlayCircleOutlined
								style={{
									color: token.colorTextQuaternary,
								}}
							/>
							<Text type="secondary" className="text-xs">
								{mode === "relay"
									? t(
											"relay.configRelayFirst",
											"请先配置并保存 Relay 设置",
										)
									: t(
											"relay.selectAddressFirst",
											"请先在上方选择连接地址",
										)}
							</Text>
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
