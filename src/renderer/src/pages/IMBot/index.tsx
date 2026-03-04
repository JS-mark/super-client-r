import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
	Button,
	Space,
	Table,
	Tag,
	Modal,
	Form,
	Input,
	Select,
	message,
	Alert,
	Tabs,
	theme,
} from "antd";
import {
	PlusOutlined,
	PlayCircleOutlined,
	StopOutlined,
	DeleteOutlined,
	ReloadOutlined,
	InfoCircleOutlined,
	CodeOutlined,
	CopyOutlined,
	ApiOutlined,
	DesktopOutlined,
	ClockCircleOutlined,
	LockOutlined,
	MessageOutlined,
} from "@ant-design/icons";
import { MainLayout } from "@/components/layout/MainLayout";
import { useTitle } from "@/hooks/useTitle";
import { useIMBotStore } from "@/stores/imbotStore";
import { useRemoteDeviceStore } from "@/stores/remoteDeviceStore";
import { EventTimeline } from "@/components/remote/EventTimeline";
import { DeviceConnectionInfo } from "@/components/remote/DeviceConnectionInfo";
import {
	DeviceTerminal,
	type DeviceTerminalRef,
} from "@/components/remote/DeviceTerminal";
import type { IMBotConfig, BotStatus, RemoteDevice } from "@/types/electron";
import { nanoid } from "nanoid";

const { useToken } = theme;

export default function RemoteControlPage() {
	const { t } = useTranslation("menu");
	const { token } = useToken();
	const navigate = useNavigate();

	// ── 表单字段说明文案 ──
	const fieldTooltips = useMemo(
		() => ({
			botName: "为机器人起一个便于识别的名字，方便在列表中区分",
			platform: "选择机器人所在的 IM 平台，不同平台需要不同的配置参数",
			telegramToken:
				"在 Telegram 中搜索 @BotFather，发送 /newbot 命令创建机器人后获取 Token",
			telegramChatId:
				"在群组中添加 @userinfobot 可获取群组 ID；私聊 @userinfobot 可获取个人 ID",
			dingtalkAppKey:
				"登录钉钉开放平台 → 应用开发 → 企业内部开发 → 创建应用后，在应用凭证中获取",
			dingtalkAppSecret: "与 App Key 在同一位置（应用凭证页面）获取",
			dingtalkWebhook:
				"在钉钉群设置 → 智能群助手 → 添加自定义机器人 → 复制 Webhook 地址",
			larkAppId: "登录飞书开放平台 → 创建企业自建应用 → 在凭证与基础信息中获取",
			larkAppSecret: "与 App ID 在同一页面（凭证与基础信息）获取",
			larkVerificationToken:
				"在飞书开放平台 → 应用功能 → 事件订阅中获取 Verification Token",
			larkEncryptKey: "在飞书开放平台 → 应用功能 → 事件订阅中获取 Encrypt Key",
			larkChatIds: "在飞书群聊的设置中可以找到群组的 Chat ID（以 oc_ 开头）",
			adminUsers: "对应平台的用户 ID，只有管理员才能通过机器人执行远程设备命令",
		}),
		[],
	);

	const pageTitle = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
					<ApiOutlined className="text-white text-xs" />
				</div>
				<span
					className="text-sm font-medium"
					style={{ color: token.colorText }}
				>
					{t("imbot")}
				</span>
			</div>
		),
		[t, token.colorText],
	);
	useTitle(pageTitle);
	// ── IM Bot state ──
	const [isBotModalOpen, setIsBotModalOpen] = useState(false);
	const [botForm] = Form.useForm();
	const [editingBot, setEditingBot] = useState<IMBotConfig | null>(null);

	const {
		bots,
		botStatuses,
		isLoading: botsLoading,
		error: botsError,
		fetchBots,
		addBot,
		removeBot,
		startBot,
		stopBot,
	} = useIMBotStore();

	// ── Remote Device state ──
	const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
	const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
	const [registerForm] = Form.useForm();
	const [selectedDevice, setSelectedDevice] = useState<RemoteDevice | null>(
		null,
	);
	const [activeTab, setActiveTab] = useState("bots");
	const [detailActiveTab, setDetailActiveTab] = useState("info");
	const [terminalAuthorized, setTerminalAuthorized] = useState(false);
	const [authTokenInput, setAuthTokenInput] = useState("");
	const terminalRef = useRef<DeviceTerminalRef>(null);

	const {
		devices,
		isLoading: devicesLoading,
		error: devicesError,
		commandHistory,
		fetchDevices,
		registerDevice,
		removeDevice,
		executeCommand,
	} = useRemoteDeviceStore();

	// ── Shared polling ──
	useEffect(() => {
		fetchBots();
		fetchDevices();
		const interval = setInterval(() => {
			fetchBots();
			fetchDevices();
		}, 5000);
		return () => clearInterval(interval);
	}, [fetchBots, fetchDevices]);

	const handleRefreshAll = useCallback(() => {
		fetchBots();
		fetchDevices();
	}, [fetchBots, fetchDevices]);

	// ── IM Bot handlers ──
	const handleAddBot = useCallback(() => {
		setEditingBot(null);
		botForm.resetFields();
		setIsBotModalOpen(true);
	}, [botForm]);

	const handleBotSubmit = useCallback(async () => {
		try {
			const values = await botForm.validateFields();

			const config: IMBotConfig = {
				id: editingBot?.id || nanoid(),
				name: values.name,
				type: values.type,
				enabled: true,
				telegram:
					values.type === "telegram"
						? {
								botToken: values.botToken,
								chatId: values.chatId,
							}
						: undefined,
				dingtalk:
					values.type === "dingtalk"
						? {
								appKey: values.appKey,
								appSecret: values.appSecret,
								webhookUrl: values.webhookUrl || undefined,
							}
						: undefined,
				lark:
					values.type === "lark"
						? {
								appId: values.larkAppId,
								appSecret: values.larkAppSecret,
								verificationToken: values.verificationToken || undefined,
								encryptKey: values.encryptKey || undefined,
								chatIds:
									values.larkChatIds
										?.split(",")
										.map((s: string) => s.trim())
										.filter(Boolean) || undefined,
							}
						: undefined,
				adminUsers: values.adminUsers
					?.split(",")
					.map((u: string) => u.trim())
					.filter(Boolean),
			};

			await addBot(config);
			message.success(editingBot ? "更新成功" : "添加成功");
			setIsBotModalOpen(false);
			botForm.resetFields();
		} catch (error) {
			message.error(
				"保存失败: " + (error instanceof Error ? error.message : String(error)),
			);
		}
	}, [botForm, editingBot, addBot]);

	const handleDeleteBot = useCallback(
		(botId: string) => {
			Modal.confirm({
				title: "确认删除",
				content: "确定要删除这个机器人吗？",
				onOk: async () => {
					try {
						await removeBot(botId);
						message.success("删除成功");
					} catch (error) {
						message.error(
							"删除失败: " +
								(error instanceof Error ? error.message : String(error)),
						);
					}
				},
			});
		},
		[removeBot],
	);

	const handleStartBot = useCallback(
		async (botId: string) => {
			try {
				await startBot(botId);
				message.success("启动成功");
			} catch (error) {
				message.error(
					"启动失败: " +
						(error instanceof Error ? error.message : String(error)),
				);
			}
		},
		[startBot],
	);

	const handleStopBot = useCallback(
		async (botId: string) => {
			try {
				await stopBot(botId);
				message.success("停止成功");
			} catch (error) {
				message.error(
					"停止失败: " +
						(error instanceof Error ? error.message : String(error)),
				);
			}
		},
		[stopBot],
	);

	// ── Remote Device handlers ──
	const handleRegisterDevice = useCallback(async () => {
		try {
			const values = await registerForm.validateFields();
			const device = await registerDevice(values);

			message.success("设备注册成功！");
			setIsRegisterModalOpen(false);
			registerForm.resetFields();

			setSelectedDevice(device);
			setIsDetailModalOpen(true);
		} catch (error) {
			message.error(
				"注册失败: " + (error instanceof Error ? error.message : String(error)),
			);
		}
	}, [registerForm, registerDevice]);

	const handleDeleteDevice = useCallback(
		(deviceId: string) => {
			Modal.confirm({
				title: "确认删除",
				content: "确定要删除这个设备吗？删除后需要重新注册才能使用。",
				onOk: async () => {
					try {
						await removeDevice(deviceId);
						message.success("删除成功");
					} catch (error) {
						message.error(
							"删除失败: " +
								(error instanceof Error ? error.message : String(error)),
						);
					}
				},
			});
		},
		[removeDevice],
	);

	const handleShowDetail = useCallback((device: RemoteDevice) => {
		setSelectedDevice(device);
		setDetailActiveTab("info");
		setIsDetailModalOpen(true);
	}, []);

	const handleExecuteCommand = useCallback((device: RemoteDevice) => {
		setSelectedDevice(device);
		setDetailActiveTab("terminal");
		setIsDetailModalOpen(true);
	}, []);

	const handleTerminalCommand = useCallback(
		(command: string, timeout?: number) => {
			if (!selectedDevice) {
				return Promise.reject(new Error("No device selected"));
			}
			return executeCommand(selectedDevice.id, command, timeout);
		},
		[selectedDevice, executeCommand],
	);

	const handleAuthorize = useCallback(() => {
		if (!selectedDevice || !authTokenInput.trim()) return;
		if (authTokenInput.trim() === selectedDevice.authentication.token) {
			setTerminalAuthorized(true);
			setAuthTokenInput("");
		} else {
			message.error("Token 验证失败，请检查后重试");
		}
	}, [selectedDevice, authTokenInput]);

	const copyToken = useCallback((token: string) => {
		navigator.clipboard.writeText(token);
		message.success("Token 已复制到剪贴板");
	}, []);

	// ── Renderers ──
	const getBotStatusTag = (status?: BotStatus) => {
		if (!status) {
			return <Tag color="default">未启动</Tag>;
		}
		switch (status.status) {
			case "running":
				return <Tag color="success">运行中</Tag>;
			case "stopped":
				return <Tag color="default">已停止</Tag>;
			case "error":
				return <Tag color="error">错误</Tag>;
			default:
				return <Tag color="default">未知</Tag>;
		}
	};

	const getDeviceStatusTag = (status: string) => {
		switch (status) {
			case "online":
				return <Tag color="success">在线</Tag>;
			case "offline":
				return <Tag color="default">离线</Tag>;
			case "error":
				return <Tag color="error">错误</Tag>;
			default:
				return <Tag>{status}</Tag>;
		}
	};

	const getPlatformTag = (platform: string) => {
		const platformMap: Record<string, { label: string; color: string }> = {
			linux: { label: "Linux", color: "blue" },
			windows: { label: "Windows", color: "cyan" },
			macos: { label: "macOS", color: "purple" },
		};
		const p = platformMap[platform] || {
			label: platform,
			color: "default",
		};
		return <Tag color={p.color}>{p.label}</Tag>;
	};

	// ── Table columns ──
	const botColumns = [
		{
			title: "名称",
			dataIndex: "name",
			key: "name",
		},
		{
			title: "平台",
			dataIndex: "type",
			key: "type",
			render: (type: string) => {
				const map: Record<string, { label: string; color: string }> = {
					telegram: { label: "Telegram", color: "blue" },
					dingtalk: { label: "钉钉", color: "cyan" },
					lark: { label: "飞书", color: "green" },
				};
				const p = map[type] || { label: type, color: "default" };
				return <Tag color={p.color}>{p.label}</Tag>;
			},
		},
		{
			title: "状态",
			key: "status",
			render: (_: any, record: IMBotConfig) => {
				const status = botStatuses.find((s) => s.id === record.id);
				return getBotStatusTag(status);
			},
		},
		{
			title: "操作",
			key: "actions",
			render: (_: any, record: IMBotConfig) => {
				const status = botStatuses.find((s) => s.id === record.id);
				const isRunning = status?.status === "running";

				return (
					<Space>
						{!isRunning ? (
							<Button
								type="link"
								size="small"
								icon={<PlayCircleOutlined />}
								onClick={() => handleStartBot(record.id)}
							>
								启动
							</Button>
						) : (
							<Button
								type="link"
								size="small"
								danger
								icon={<StopOutlined />}
								onClick={() => handleStopBot(record.id)}
							>
								停止
							</Button>
						)}
						{isRunning && (
							<Button
								type="link"
								size="small"
								icon={<MessageOutlined />}
								onClick={() =>
									navigate("/chat", {
										state: { createRemoteWithBotId: record.id },
									})
								}
							>
								远程会话
							</Button>
						)}
						<Button
							type="link"
							size="small"
							danger
							icon={<DeleteOutlined />}
							onClick={() => handleDeleteBot(record.id)}
						>
							删除
						</Button>
					</Space>
				);
			},
		},
	];

	const deviceColumns = [
		{
			title: "设备名称",
			dataIndex: "name",
			key: "name",
		},
		{
			title: "平台",
			dataIndex: "platform",
			key: "platform",
			render: (platform: string) => getPlatformTag(platform),
		},
		{
			title: "状态",
			dataIndex: "status",
			key: "status",
			render: (status: string) => getDeviceStatusTag(status),
		},
		{
			title: "IP 地址",
			dataIndex: "ipAddress",
			key: "ipAddress",
			render: (ip?: string) => ip || "-",
		},
		{
			title: "最后在线",
			dataIndex: "lastSeen",
			key: "lastSeen",
			render: (lastSeen?: number) =>
				lastSeen ? new Date(lastSeen).toLocaleString("zh-CN") : "从未连接",
		},
		{
			title: "操作",
			key: "actions",
			render: (_: any, record: RemoteDevice) => (
				<Space>
					<Button
						type="link"
						size="small"
						icon={<InfoCircleOutlined />}
						onClick={() => handleShowDetail(record)}
					>
						详情
					</Button>
					<Button
						type="link"
						size="small"
						icon={<CodeOutlined />}
						onClick={() => handleExecuteCommand(record)}
						disabled={record.status !== "online"}
					>
						执行命令
					</Button>
					<Button
						type="link"
						size="small"
						danger
						icon={<DeleteOutlined />}
						onClick={() => handleDeleteDevice(record.id)}
					>
						删除
					</Button>
				</Space>
			),
		},
	];

	const historyColumns = [
		{
			title: "命令",
			dataIndex: "command",
			key: "command",
			ellipsis: true,
		},
		{
			title: "退出码",
			dataIndex: ["result", "exitCode"],
			key: "exitCode",
			width: 80,
			render: (exitCode: number) => (
				<Tag color={exitCode === 0 ? "success" : "error"}>{exitCode}</Tag>
			),
		},
		{
			title: "耗时",
			dataIndex: ["result", "duration"],
			key: "duration",
			width: 80,
			render: (duration: number) =>
				duration >= 1000
					? `${(duration / 1000).toFixed(1)}s`
					: `${duration}ms`,
		},
		{
			title: "时间",
			dataIndex: "timestamp",
			key: "timestamp",
			width: 160,
			render: (timestamp: number) =>
				new Date(timestamp).toLocaleString("zh-CN"),
		},
	];

	const platformFields = [
		"botToken",
		"chatId",
		"appKey",
		"appSecret",
		"webhookUrl",
		"larkAppId",
		"larkAppSecret",
		"verificationToken",
		"encryptKey",
		"larkChatIds",
	];

	return (
		<MainLayout>
			<div className="h-full flex flex-col overflow-hidden">
				<div className="flex items-center justify-between px-6 pt-6 pb-3 flex-none">
					<h2 className="text-lg font-semibold m-0">远程控制</h2>
					<Button icon={<ReloadOutlined />} onClick={handleRefreshAll}>
						刷新
					</Button>
				</div>

				<Tabs
					activeKey={activeTab}
					onChange={setActiveTab}
					className="flex-1 min-h-0 flex flex-col [&_.ant-tabs-nav]:px-6 [&_.ant-tabs-content-holder]:flex-1 [&_.ant-tabs-content-holder]:overflow-y-auto [&_.ant-tabs-content-holder]:min-h-0 [&_.ant-tabs-content]:h-full [&_.ant-tabs-tabpane-active]:h-full"
					tabBarExtraContent={
						activeTab === "bots" ? (
							<Button
								type="primary"
								size="small"
								icon={<PlusOutlined />}
								onClick={handleAddBot}
							>
								添加机器人
							</Button>
						) : activeTab === "devices" ? (
							<Button
								type="primary"
								size="small"
								icon={<PlusOutlined />}
								onClick={() => setIsRegisterModalOpen(true)}
							>
								注册设备
							</Button>
						) : null
					}
					items={[
						{
							key: "bots",
							label: "IM 机器人",
							children: (
								<div className="px-6 py-4">
									{botsError && (
										<Alert
											message={botsError}
											type="error"
											closable
											className="mb-4"
										/>
									)}
									<Table
										columns={botColumns}
										dataSource={bots}
										rowKey="id"
										loading={botsLoading}
										pagination={false}
									/>
								</div>
							),
						},
						{
							key: "devices",
							label: "远程设备",
							children: (
								<div className="px-6 py-4">
									{devicesError && (
										<Alert
											message={devicesError}
											type="error"
											closable
											className="mb-4"
										/>
									)}
									<Table
										columns={deviceColumns}
										dataSource={devices}
										rowKey="id"
										loading={devicesLoading}
										pagination={false}
									/>
								</div>
							),
						},
						{
							key: "events",
							label: "消息",
							children: (
								<div className="px-6 py-4">
									<EventTimeline />
								</div>
							),
						},
					]}
				/>

				{/* 添加/编辑机器人 Modal */}
				<Modal
					title={editingBot ? "编辑机器人" : "添加机器人"}
					open={isBotModalOpen}
					onOk={handleBotSubmit}
					onCancel={() => setIsBotModalOpen(false)}
					width={600}
				>
					<Form form={botForm} layout="vertical" className="mt-4">
						<Form.Item
							label="机器人名称"
							name="name"
							tooltip={fieldTooltips.botName}
							rules={[
								{
									required: true,
									message: "请输入机器人名称",
								},
							]}
						>
							<Input placeholder="例如: 生产环境机器人" />
						</Form.Item>

						<Form.Item
							label="平台"
							name="type"
							tooltip={fieldTooltips.platform}
							rules={[{ required: true, message: "请选择平台" }]}
							initialValue="telegram"
						>
							<Select
								onChange={() => {
									botForm.resetFields(platformFields);
								}}
							>
								<Select.Option value="telegram">Telegram</Select.Option>
								<Select.Option value="dingtalk">钉钉</Select.Option>
								<Select.Option value="lark">飞书</Select.Option>
							</Select>
						</Form.Item>

						<Form.Item
							noStyle
							shouldUpdate={(prev, curr) => prev.type !== curr.type}
						>
							{({ getFieldValue }) => {
								const type = getFieldValue("type");

								if (type === "telegram") {
									return (
										<>
											<Form.Item
												label="Bot Token"
												name="botToken"
												tooltip={fieldTooltips.telegramToken}
												rules={[
													{
														required: true,
														message: "请输入 Bot Token",
													},
												]}
											>
												<Input.Password placeholder="从 @BotFather 获取" />
											</Form.Item>

											<Form.Item
												label="默认聊天 ID (可选)"
												name="chatId"
												tooltip={fieldTooltips.telegramChatId}
												extra="用于广播消息，可以是群组 ID 或用户 ID"
											>
												<Input placeholder="例如: -1001234567890" />
											</Form.Item>
										</>
									);
								}

								if (type === "dingtalk") {
									return (
										<>
											<Form.Item
												label="App Key"
												name="appKey"
												tooltip={fieldTooltips.dingtalkAppKey}
												rules={[
													{
														required: true,
														message: "请输入 App Key",
													},
												]}
											>
												<Input placeholder="钉钉开放平台应用的 App Key" />
											</Form.Item>

											<Form.Item
												label="App Secret"
												name="appSecret"
												tooltip={fieldTooltips.dingtalkAppSecret}
												rules={[
													{
														required: true,
														message: "请输入 App Secret",
													},
												]}
											>
												<Input.Password placeholder="钉钉开放平台应用的 App Secret" />
											</Form.Item>

											<Form.Item
												label="Webhook URL (可选)"
												name="webhookUrl"
												tooltip={fieldTooltips.dingtalkWebhook}
												extra="用于广播消息，从钉钉群自定义机器人获取"
											>
												<Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
											</Form.Item>
										</>
									);
								}

								if (type === "lark") {
									return (
										<>
											<Form.Item
												label="App ID"
												name="larkAppId"
												tooltip={fieldTooltips.larkAppId}
												rules={[
													{
														required: true,
														message: "请输入 App ID",
													},
												]}
											>
												<Input placeholder="飞书开放平台应用的 App ID" />
											</Form.Item>

											<Form.Item
												label="App Secret"
												name="larkAppSecret"
												tooltip={fieldTooltips.larkAppSecret}
												rules={[
													{
														required: true,
														message: "请输入 App Secret",
													},
												]}
											>
												<Input.Password placeholder="飞书开放平台应用的 App Secret" />
											</Form.Item>

											<Form.Item
												label="Verification Token (可选)"
												name="verificationToken"
												tooltip={fieldTooltips.larkVerificationToken}
												extra="事件订阅的验证 Token"
											>
												<Input placeholder="飞书事件订阅验证 Token" />
											</Form.Item>

											<Form.Item
												label="Encrypt Key (可选)"
												name="encryptKey"
												tooltip={fieldTooltips.larkEncryptKey}
												extra="事件订阅的加密密钥"
											>
												<Input.Password placeholder="飞书事件订阅加密密钥" />
											</Form.Item>

											<Form.Item
												label="广播群组 ID (可选)"
												name="larkChatIds"
												tooltip={fieldTooltips.larkChatIds}
												extra="多个群组 ID 用逗号分隔，用于广播消息"
											>
												<Input placeholder="例如: oc_xxx,oc_yyy" />
											</Form.Item>
										</>
									);
								}

								return null;
							}}
						</Form.Item>

						<Form.Item
							label="管理员用户 ID"
							name="adminUsers"
							tooltip={fieldTooltips.adminUsers}
							extra="多个 ID 用逗号分隔，只有管理员可以执行设备命令"
						>
							<Input placeholder="例如: 123456789,987654321" />
						</Form.Item>
					</Form>
				</Modal>

				{/* 注册设备 Modal */}
				<Modal
					title="注册新设备"
					open={isRegisterModalOpen}
					onOk={handleRegisterDevice}
					onCancel={() => setIsRegisterModalOpen(false)}
					width={600}
				>
					<Form form={registerForm} layout="vertical" className="mt-4">
						<Form.Item
							label="设备名称"
							name="name"
							rules={[{ required: true, message: "请输入设备名称" }]}
						>
							<Input placeholder="例如: 生产服务器-1" />
						</Form.Item>

						<Form.Item
							label="平台"
							name="platform"
							rules={[{ required: true, message: "请选择平台" }]}
							initialValue="linux"
						>
							<Select>
								<Select.Option value="linux">Linux</Select.Option>
								<Select.Option value="windows">Windows</Select.Option>
								<Select.Option value="macos">macOS</Select.Option>
							</Select>
						</Form.Item>

						<Form.Item label="标签 (可选)" name="tags">
							<Select
								mode="tags"
								placeholder="例如: production, api, database"
							/>
						</Form.Item>

						<Form.Item label="描述 (可选)" name="description">
							<Input.TextArea rows={3} placeholder="设备用途或备注信息" />
						</Form.Item>
					</Form>
				</Modal>

				{/* 设备详情 Modal */}
				<Modal
					title={
						selectedDevice ? (
							<div className="flex items-center gap-2">
								<DesktopOutlined />
								<span>{selectedDevice.name}</span>
								{getDeviceStatusTag(selectedDevice.status)}
								{getPlatformTag(selectedDevice.platform)}
							</div>
						) : (
							"设备详情"
						)
					}
					open={isDetailModalOpen}
					onCancel={() => {
						setIsDetailModalOpen(false);
						setTerminalAuthorized(false);
						setAuthTokenInput("");
					}}
					footer={null}
					width={720}
					destroyOnClose
				>
					{selectedDevice && (
						<Tabs
							activeKey={detailActiveTab}
							onChange={setDetailActiveTab}
							items={[
								{
									key: "info",
									label: "设备信息",
									children: (
										<div className="space-y-5">
											{/* 2 列 grid 元数据 */}
											<div className="grid grid-cols-2 gap-x-6 gap-y-3">
												<div>
													<div className="text-xs text-gray-400 mb-1">
														设备 ID
													</div>
													<div className="text-sm font-mono">
														{selectedDevice.id}
													</div>
												</div>
												<div>
													<div className="text-xs text-gray-400 mb-1">平台</div>
													<div className="text-sm">
														{getPlatformTag(selectedDevice.platform)}
													</div>
												</div>
												<div>
													<div className="text-xs text-gray-400 mb-1">
														IP 地址
													</div>
													<div className="text-sm">
														{selectedDevice.ipAddress || "-"}
													</div>
												</div>
												<div>
													<div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
														<ClockCircleOutlined className="text-[10px]" />
														最后在线
													</div>
													<div className="text-sm">
														{selectedDevice.lastSeen
															? new Date(
																	selectedDevice.lastSeen,
																).toLocaleString("zh-CN")
															: "从未连接"}
													</div>
												</div>
												<div>
													<div className="text-xs text-gray-400 mb-1">标签</div>
													<div className="text-sm">
														{selectedDevice.tags?.length
															? selectedDevice.tags.map((tag: string) => (
																	<Tag key={tag}>{tag}</Tag>
																))
															: "-"}
													</div>
												</div>
												<div>
													<div className="text-xs text-gray-400 mb-1">描述</div>
													<div className="text-sm">
														{selectedDevice.description || "-"}
													</div>
												</div>
											</div>

											{/* Token 行 */}
											<div>
												<div className="text-xs text-gray-400 mb-1">
													认证 Token
													<span className="text-orange-400 ml-1">
														(请妥善保管)
													</span>
												</div>
												<Input.Password
													value={selectedDevice.authentication.token}
													readOnly
													addonAfter={
														<CopyOutlined
															className="cursor-pointer"
															onClick={() =>
																copyToken(selectedDevice.authentication.token)
															}
														/>
													}
												/>
											</div>

											{/* 危险操作 */}
											<div className="flex justify-end pt-2 border-t border-gray-100 dark:border-white/5">
												<Button
													danger
													size="small"
													icon={<DeleteOutlined />}
													onClick={() => {
														setIsDetailModalOpen(false);
														handleDeleteDevice(selectedDevice.id);
													}}
												>
													删除设备
												</Button>
											</div>
										</div>
									),
								},
								{
									key: "connect",
									label: "连接指南",
									children: (
										<DeviceConnectionInfo
											deviceId={selectedDevice.id}
											deviceToken={selectedDevice.authentication.token}
										/>
									),
								},
								{
									key: "terminal",
									label: (
										<span className="flex items-center gap-1">
											<CodeOutlined />
											终端
										</span>
									),
									disabled: selectedDevice.status !== "online",
									children: (
										<div style={{ height: 420 }}>
											{!terminalAuthorized ? (
												<div className="flex flex-col items-center justify-center h-full">
													<LockOutlined
														className="text-4xl mb-4"
														style={{
															color: token.colorTextQuaternary,
														}}
													/>
													<div
														className="text-sm mb-1 font-medium"
														style={{
															color: token.colorText,
														}}
													>
														远程命令执行需要授权
													</div>
													<div
														className="text-xs mb-4"
														style={{
															color: token.colorTextDescription,
														}}
													>
														请输入设备认证 Token
														以验证操作权限
													</div>
													<div className="flex items-center gap-2 w-72">
														<Input.Password
															value={
																authTokenInput
															}
															onChange={(e) =>
																setAuthTokenInput(
																	e.target
																		.value,
																)
															}
															onPressEnter={
																handleAuthorize
															}
															placeholder="输入设备 Token"
														/>
														<Button
															type="primary"
															onClick={
																handleAuthorize
															}
															disabled={
																!authTokenInput.trim()
															}
														>
															验证
														</Button>
													</div>
												</div>
											) : (
												<DeviceTerminal
													ref={terminalRef}
													deviceId={
														selectedDevice.id
													}
													disabled={
														selectedDevice.status !==
														"online"
													}
													onCommand={
														handleTerminalCommand
													}
												/>
											)}
										</div>
									),
								},
								{
									key: "history",
									label: (
										<span className="flex items-center gap-1">
											<ClockCircleOutlined />
											命令历史
										</span>
									),
									children: (() => {
										const deviceHistory =
											commandHistory.filter(
												(h) =>
													h.deviceId ===
													selectedDevice.id,
											);
										return deviceHistory.length > 0 ? (
											<Table
												columns={historyColumns}
												dataSource={deviceHistory}
												rowKey={(record) =>
													`${record.timestamp}-${record.command}`
												}
												pagination={
													deviceHistory.length > 10
														? { pageSize: 10 }
														: false
												}
												size="small"
											/>
										) : (
											<div
												className="flex flex-col items-center justify-center py-12"
												style={{
													color: token.colorTextQuaternary,
												}}
											>
												<ClockCircleOutlined className="text-3xl mb-3" />
												<div className="text-sm">
													暂无命令执行记录
												</div>
											</div>
										);
									})(),
								},
							]}
						/>
					)}
				</Modal>
			</div>
		</MainLayout>
	);
}
