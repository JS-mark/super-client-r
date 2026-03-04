import {
	BellOutlined,
	DeleteOutlined,
	EditOutlined,
	PlusOutlined,
	SendOutlined,
} from "@ant-design/icons";
import {
	App,
	Button,
	Card,
	Empty,
	Form,
	Input,
	Modal,
	Popconfirm,
	Select,
	Switch,
	Tag,
	theme,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { webhookService } from "../../services/webhookService";

const { useToken } = theme;

interface WebhookConfig {
	id: string;
	name: string;
	type: string;
	url: string;
	secret?: string;
	headers?: Record<string, string>;
	method?: string;
	enabled: boolean;
	createdAt: number;
	// Telegram
	telegramBotToken?: string;
	telegramChatId?: string;
	telegramParseMode?: string;
	// Twitter
	twitterApiKey?: string;
	"twitterApi*"?: string;
	twitterAccessToken?: string;
	"twitterAccess*"?: string;
	twitterUserId?: string;
	// Facebook
	facebookPageToken?: string;
	facebookPageId?: string;
	"facebookApp*"?: string;
}

export function WebhookSettings() {
	const { t } = useTranslation("settings");
	const { token } = useToken();
	const { message: messageApi } = App.useApp();
	const [configs, setConfigs] = useState<WebhookConfig[]>([]);
	const [showModal, setShowModal] = useState(false);
	const [editing, setEditing] = useState<WebhookConfig | null>(null);
	const [testing, setTesting] = useState<string | null>(null);
	const [form] = Form.useForm();

	const loadConfigs = useCallback(async () => {
		const resp = await webhookService.getConfigs();
		if (resp.success && resp.data) {
			setConfigs(resp.data as WebhookConfig[]);
		}
	}, []);

	useEffect(() => {
		loadConfigs();
	}, [loadConfigs]);

	const handleSave = useCallback(async () => {
		try {
			const values = await form.validateFields();
			const config: WebhookConfig = {
				id: editing?.id || `webhook_${Date.now()}`,
				name: values.name,
				type: values.type,
				url: values.url,
				secret: values.secret || undefined,
				method: values.method || "POST",
				enabled: values.enabled ?? true,
				createdAt: editing?.createdAt || Date.now(),
				// Telegram 字段
				telegramBotToken: values.telegramBotToken,
				telegramChatId: values.telegramChatId,
				telegramParseMode: values.telegramParseMode,
				// Twitter 字段
				twitterApiKey: values.twitterApiKey,
				["twitterApi*"]: values["twitterApi*"],
				twitterAccessToken: values.twitterAccessToken,
				["twitterAccess*"]: values["twitterAccess*"],
				twitterUserId: values.twitterUserId,
				// Facebook 字段
				facebookPageToken: values.facebookPageToken,
				facebookPageId: values.facebookPageId,
				["facebookApp*"]: values["facebookApp*"],
			};
			const resp = await webhookService.saveConfig(config as never);
			if (resp.success) {
				setShowModal(false);
				setEditing(null);
				form.resetFields();
				loadConfigs();
			}
		} catch {
			// validation error
		}
	}, [form, editing, loadConfigs]);

	const handleDelete = useCallback(
		async (id: string) => {
			await webhookService.deleteConfig(id);
			loadConfigs();
		},
		[loadConfigs],
	);

	const handleTest = useCallback(
		async (id: string) => {
			setTesting(id);
			try {
				const resp = await webhookService.test(id);
				if (resp.success && (resp.data as { success: boolean })?.success) {
					messageApi.success(t("webhook.testSuccess"));
				} else {
					messageApi.error(t("webhook.testFailed"));
				}
			} catch {
				messageApi.error(t("webhook.testFailed"));
			} finally {
				setTesting(null);
			}
		},
		[messageApi, t],
	);

	const handleEdit = useCallback(
		(config: WebhookConfig) => {
			setEditing(config);
			form.setFieldsValue(config);
			setShowModal(true);
		},
		[form],
	);

	const handleAdd = useCallback(() => {
		setEditing(null);
		form.resetFields();
		setShowModal(true);
	}, [form]);

	const handleToggle = useCallback(
		async (config: WebhookConfig, enabled: boolean) => {
			const updated = { ...config, enabled };
			await webhookService.saveConfig(updated as never);
			loadConfigs();
		},
		[loadConfigs],
	);

	const typeColors: Record<string, string> = {
		dingtalk: "blue",
		feishu: "green",
		telegram: "cyan",
		twitter: "geekblue",
		facebook: "purple",
		custom: "default",
	};

	return (
		<div className="space-y-6">
			{/* Webhook list */}
			<div>
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-base font-semibold flex items-center gap-2">
						<BellOutlined />
						{t("webhook.list")}
					</h3>
					<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
						{t("webhook.add")}
					</Button>
				</div>

				{configs.length === 0 ? (
					<Empty
						description={t("webhook.empty")}
						image={Empty.PRESENTED_IMAGE_SIMPLE}
					/>
				) : (
					<div className="space-y-2">
						{configs.map((config) => (
							<Card
								key={config.id}
								size="small"
								className="shadow-none!"
								styles={{
									body: {
										padding: "12px 16px",
									},
								}}
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 flex-1 min-w-0">
										<Switch
											size="small"
											checked={config.enabled}
											onChange={(v) => handleToggle(config, v)}
										/>
										<span className="font-medium text-sm truncate">
											{config.name}
										</span>
										<Tag color={typeColors[config.type]}>
											{t(`webhook.types.${config.type}`)}
										</Tag>
									</div>
									<div className="flex items-center gap-1">
										<Button
											type="text"
											size="small"
											icon={<SendOutlined />}
											loading={testing === config.id}
											onClick={() => handleTest(config.id)}
										>
											{t("webhook.test")}
										</Button>
										<Button
											type="text"
											size="small"
											icon={<EditOutlined />}
											onClick={() => handleEdit(config)}
										/>
										<Popconfirm
											title={t("webhook.confirmDelete")}
											onConfirm={() => handleDelete(config.id)}
										>
											<Button
												type="text"
												size="small"
												danger
												icon={<DeleteOutlined />}
											/>
										</Popconfirm>
									</div>
								</div>
								<div
									className="text-xs mt-1 truncate"
									style={{
										color: token.colorTextSecondary,
									}}
								>
									{config.url}
								</div>
							</Card>
						))}
					</div>
				)}
			</div>

			{/* Add/Edit Modal */}
			<Modal
				title={editing ? t("webhook.edit") : t("webhook.add")}
				open={showModal}
				onOk={handleSave}
				onCancel={() => {
					setShowModal(false);
					setEditing(null);
				}}
				destroyOnHidden
			>
				<Form
					form={form}
					layout="vertical"
					initialValues={{ type: "dingtalk", method: "POST", enabled: true }}
				>
					<Form.Item
						name="name"
						label={t("webhook.name")}
						rules={[{ required: true }]}
					>
						<Input placeholder={t("webhook.name")} />
					</Form.Item>
					<Form.Item
						name="type"
						label={t("webhook.type")}
						rules={[{ required: true }]}
					>
						<Select
							options={[
								{
									label: t("webhook.types.dingtalk"),
									value: "dingtalk",
								},
								{
									label: t("webhook.types.feishu"),
									value: "feishu",
								},
								{
									label: t("webhook.types.telegram"),
									value: "telegram",
								},
								{
									label: t("webhook.types.twitter"),
									value: "twitter",
								},
								{
									label: t("webhook.types.facebook"),
									value: "facebook",
								},
								{
									label: t("webhook.types.custom"),
									value: "custom",
								},
							]}
						/>
					</Form.Item>
					<Form.Item
						name="url"
						label={t("webhook.url")}
						rules={[{ required: true, type: "url" }]}
					>
						<Input placeholder="https://" />
					</Form.Item>
					<Form.Item
						name="secret"
						label={t("webhook.signKey")}
						extra={t("webhook.signKeyHint")}
					>
						<Input.Password placeholder={t("webhook.signKeyHint")} />
					</Form.Item>

					{/* Telegram 配置 */}
					{Form.useWatch("type", form) === "telegram" && (
						<>
							<Form.Item
								name="telegramBotToken"
								label={t("webhook.telegram.botToken")}
								rules={[{ required: true }]}
							>
								<Input.Password
									placeholder={t("webhook.telegram.botTokenHint")}
								/>
							</Form.Item>
							<Form.Item
								name="telegramChatId"
								label={t("webhook.telegram.chatId")}
								rules={[{ required: true }]}
							>
								<Input placeholder={t("webhook.telegram.chatIdHint")} />
							</Form.Item>
							<Form.Item
								name="telegramParseMode"
								label={t("webhook.telegram.parseMode")}
							>
								<Select defaultValue="Markdown">
									<Select.Option value="Markdown">Markdown</Select.Option>
									<Select.Option value="HTML">HTML</Select.Option>
									<Select.Option value="MarkdownV2">MarkdownV2</Select.Option>
								</Select>
							</Form.Item>
						</>
					)}

					{/* Twitter 配置 */}
					{Form.useWatch("type", form) === "twitter" && (
						<>
							<Form.Item
								name="twitterApiKey"
								label={t("webhook.twitter.apiKey")}
								rules={[{ required: true }]}
							>
								<Input.Password placeholder={t("webhook.twitter.apiKeyHint")} />
							</Form.Item>
							<Form.Item
								name="twitterApi*"
								label={t("webhook.twitter.api*")}
								rules={[{ required: true }]}
							>
								<Input.Password placeholder={t("webhook.twitter.api*Hint")} />
							</Form.Item>
							<Form.Item
								name="twitterAccessToken"
								label={t("webhook.twitter.accessToken")}
								rules={[{ required: true }]}
							>
								<Input.Password
									placeholder={t("webhook.twitter.accessTokenHint")}
								/>
							</Form.Item>
							<Form.Item
								name="twitterAccess*"
								label={t("webhook.twitter.access*")}
								rules={[{ required: true }]}
							>
								<Input.Password
									placeholder={t("webhook.twitter.access*Hint")}
								/>
							</Form.Item>
							<Form.Item
								name="twitterUserId"
								label={t("webhook.twitter.userId")}
							>
								<Input placeholder={t("webhook.twitter.userIdHint")} />
							</Form.Item>
						</>
					)}

					{/* Facebook 配置 */}
					{Form.useWatch("type", form) === "facebook" && (
						<>
							<Form.Item
								name="facebookPageToken"
								label={t("webhook.facebook.pageToken")}
								rules={[{ required: true }]}
							>
								<Input.Password
									placeholder={t("webhook.facebook.pageTokenHint")}
								/>
							</Form.Item>
							<Form.Item
								name="facebookPageId"
								label={t("webhook.facebook.pageId")}
								rules={[{ required: true }]}
							>
								<Input placeholder={t("webhook.facebook.pageIdHint")} />
							</Form.Item>
							<Form.Item name="facebookApp*" label={t("webhook.facebook.app*")}>
								<Input.Password placeholder={t("webhook.facebook.app*Hint")} />
							</Form.Item>
						</>
					)}
					<Form.Item
						name="enabled"
						label={t("webhook.enabled")}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
